// Compte en ligne et copie des données (chargé à la demande).
//
// Le téléphone reste la référence : l'app lit et écrit toujours dans sa base locale, avec ou sans réseau.
// Chaque changement local est recopié dans le compte ; les changements faits sur un autre appareil
// arrivent en direct et sont rangés dans la base locale.
import * as db from './db';
import { PASSWORD_RULE, passwordChecks } from './password';
import { autoCopy, ctxFor, load, logUsage, putContract, state, subscribe, toast } from './store';
import { buildSnapshot } from './partage/snapshot';
import { newShare, seal } from './partage/crypto';
import { cloudInfo, LS, lsGet, lsSet, setCloud } from './cloud-state';
import { errCode, type Backend, type CloudUser } from './sync/backend';
import { applyRemote, docId, forRemote, needsChoice, nextSince, planMerge, RESUME_MARGIN_MS, stable, type LocalRecord, type MergeMode, type RemoteDoc } from './sync/plan';

let be: Backend | null = null;
let starting: Promise<Backend> | null = null;
let user: CloudUser | null = null;
let unlisten: (() => void) | null = null;
let pending = false;
let fromCache = true;
let attached = false;

async function loadBackend(): Promise<Backend> {
  if (import.meta.env.VITE_FAKE_CLOUD) return (await import('./sync/backend-fake')).backend;
  return (await import('./sync/backend-firebase')).backend;
}

/** Charge le service en ligne et reprend la session enregistrée sur ce téléphone, s'il y en a une. */
export function startCloud(): Promise<Backend> {
  if (db.isDemo()) return Promise.reject(new Error('Pas de compte pendant la démonstration'));
  if (!starting) {
    starting = (async () => {
      if (cloudInfo().status === 'off') setCloud({ status: 'starting' });
      const b = await loadBackend();
      be = b;
      b.onPending((p) => { pending = p; refreshStatus(); });
      b.onUser((u) => { void onUser(u); });
      window.addEventListener('online', () => {
        if (user && lsGet(LS.linked) !== user.uid && cloudInfo().status !== 'choice') void link(user).catch(() => {});
        refreshStatus();
      });
      window.addEventListener('offline', refreshStatus);
      return b;
    })();
    starting.catch(() => { starting = null; setCloud({ status: 'error', error: 'Le service en ligne ne répond pas. Réessaie avec du réseau.' }); });
  }
  return starting;
}

// ---------- Connexion ----------

type Waiter = { res: () => void; rej: (e: Error) => void };
let waiters: Waiter[] = [];
function settle(err?: Error) {
  const w = waiters;
  waiters = [];
  w.forEach((x) => (err ? x.rej(err) : x.res()));
}
/** Attend que le compte qui vient de se connecter soit branché sur ce téléphone (données réunies). */
function nextLink(): Promise<void> {
  return new Promise((res, rej) => waiters.push({ res, rej }));
}

async function onUser(u: CloudUser | null) {
  if (!u) {
    // Déconnexion (voulue ou non) : la copie s'arrête, les changements suivants sont notés dans la file d'attente.
    detach();
    user = null;
    setCloud({ status: 'off', email: undefined, verified: undefined, lastSync: undefined });
    return;
  }
  user = u;
  setCloud({ email: u.email ?? undefined, verified: u.verified });
  try {
    if (lsGet(LS.linked) === u.uid) attach(u);
    else await link(u);
    settle();
  } catch (e) {
    settle(e as Error);
  }
}

function localHasData(): boolean {
  return state.contracts.length > 0 || state.days.size > 0 || state.journal.length > 0;
}

async function localRecords(): Promise<LocalRecord[]> {
  const out: LocalRecord[] = [];
  for (const s of db.SYNCED) {
    for (const value of await db.getAll(s)) out.push({ s, k: db.keyOf(s, value), value });
  }
  return out;
}

let linking: Promise<void> | null = null;

/** Branche un compte sur ce téléphone : réunit les données des deux côtés, puis écoute les changements. */
function link(u: CloudUser, mode?: MergeMode): Promise<void> {
  if (!linking) {
    linking = doLink(u, mode)
      .catch((e) => { if (!attached) db.setMirror(null); throw e; })
      .finally(() => { linking = null; });
  }
  return linking;
}

/** Réponse au choix « garder le compte / garder ce téléphone / tout réunir ». */
export async function chooseLink(mode: MergeMode) {
  if (!user) throw new Error('Reconnecte-toi d’abord.');
  try { await link(user, mode); } catch (e) { throw friendly(e); }
}

async function doLink(u: CloudUser, mode?: MergeMode) {
  const b = be!;
  const last = lsGet(LS.last);
  if (last && last !== u.uid && localHasData()) {
    await b.signOut();
    throw new Error('Ce téléphone contient les données d’un autre compte. Connecte-toi avec celui-là, ou demande de l’aide avant de changer de compte.');
  }
  // Si l'app est fermée avant la fin, la réunion reprendra au prochain démarrage.
  lsSet(LS.pending, u.uid);
  setCloud({ status: 'merging' });
  // Pendant la réunion, les changements faits sur le téléphone vont dans la file d'attente (db.ts), envoyée juste après.
  db.setMirror(null);
  let remote: RemoteDoc[];
  try {
    remote = await b.fetchAll(u.uid);
  } catch (e) {
    setCloud({ status: 'error', error: 'Il faut du réseau pour la première copie. Elle reprendra au retour du réseau.' });
    throw friendly(e);
  }
  const local = await localRecords();
  const sameAccount = last === u.uid;
  if (!mode && !sameAccount && needsChoice(local, remote)) {
    // Des enfants des deux côtés : réunir sans demander pourrait créer des doublons.
    setCloud({ status: 'choice' });
    logUsage('compte_choix_demande');
    return;
  }
  // Ce téléphone était déjà relié à ce compte : ce qu'il a changé depuis est plus récent que la version en ligne.
  const localWins = new Set(sameAccount ? db.outboxRead().map((x) => docId(x.s, x.k)) : []);
  const plan = planMerge(local, remote, { mode: mode ?? 'merge', localWins });
  if (plan.toLocal.length + plan.deleteLocal.length > 0 && localHasData()) await autoCopy(true);
  for (const r of plan.toLocal) await db.putRaw(r.s, r.value);
  for (const r of plan.deleteLocal) await db.delRaw(r.s, r.k);
  await b.write(u.uid, [
    ...plan.toRemote.map((r) => ({ s: r.s, k: r.k, v: stable(forRemote(r.s, r.k, r.value)) })),
    ...plan.deleteRemote.map((r) => ({ s: r.s, k: r.k, v: null })),
  ]);
  lsSet(LS.linked, u.uid);
  lsSet(LS.last, u.uid);
  lsSet(LS.pending, null);
  lsSet(LS.since, String(nextSince(0, remote)));
  const hadLocal = localHasData();
  await load();
  logUsage('compte_branche', mode ?? (remote.length ? (hadLocal ? 'fusion' : 'recuperation') : 'premier_envoi'));
  if (remote.length && hadLocal && (plan.toLocal.length || plan.deleteLocal.length)) {
    toast('Les données de ton compte et celles du téléphone sont réunies.', undefined, 'ok');
  }
  // La file d'attente (changements d'avant et de pendant la réunion) est renvoyée par attach : sans risque, c'est la valeur actuelle du téléphone.
  attach(u);
}

// ---------- Copie en direct ----------

let queue = new Map<string, { s: db.SyncedStore; k: string; v: string | null }>();
let flushScheduled = false;
/** Dernière version partagée connue des réglages : un changement des seuls repères de l'appareil n'est pas envoyé. */
let sharedSettings: string | null = null;
function enqueueValue(s: db.SyncedStore, k: string, value: unknown) {
  const v = stable(forRemote(s, k, value));
  if (s === 'kv' && k === 'settings') {
    if (v === sharedSettings) return;
    sharedSettings = v;
  }
  enqueue(s, k, v);
}
function enqueue(s: db.SyncedStore, k: string, v: string | null) {
  queue.set(`${s}|${k}`, { s, k, v });
  if (!flushScheduled) {
    flushScheduled = true;
    queueMicrotask(() => {
      flushScheduled = false;
      const docs = [...queue.values()];
      queue = new Map();
      if (user && be && docs.length) void be.write(user.uid, docs).catch((e) => console.warn(e));
    });
  }
}

const mirror: db.Mirror = {
  put(s, k, value) { enqueueValue(s, k, value); },
  del(s, k) { enqueue(s, k, null); },
  replaced(oldKeys, d) {
    for (const s of db.SYNCED) {
      const now = new Set<string>();
      for (const value of (d[s] ?? []) as unknown[]) {
        const k = db.keyOf(s, value);
        now.add(k);
        enqueueValue(s, k, value);
      }
      for (const k of oldKeys.get(s) ?? []) if (!now.has(k)) enqueue(s, k, null);
    }
  },
};

/** Lance la copie en direct, après avoir envoyé ce qui a changé pendant qu'elle ne tournait pas. */
function attach(u: CloudUser) {
  detach();
  const set = state.settings;
  sharedSettings = stable(forRemote('kv', 'settings', { k: 'settings', v: set }));
  const waiting = db.outboxRead();
  db.outboxClear();
  db.setMirror(mirror);
  attached = true;
  void (async () => {
    for (const { s, k } of waiting) {
      const v = await db.get(s, k);
      if (v === undefined) enqueue(s, k, null);
      else enqueue(s, k, stable(forRemote(s, k, v)));
    }
  })();
  const since = Math.max(0, Number(lsGet(LS.since) ?? 0) - RESUME_MARGIN_MS);
  let chain = Promise.resolve();
  unlisten = be!.listen(u.uid, since, (docs, meta) => {
    fromCache = meta.fromCache;
    if (meta.maxT > Number(lsGet(LS.since) ?? 0)) lsSet(LS.since, String(meta.maxT));
    chain = chain.then(() => receive(docs)).catch((e) => console.warn(e));
    refreshStatus();
  }, (e) => {
    setCloud({ status: 'error', error: messageFor(errCode(e)) });
  });
  refreshStatus();
  unsubShares = subscribe(() => scheduleShares());
  scheduleShares(500);
}

function detach() {
  unsubShares?.();
  unsubShares = null;
  clearTimeout(shareTimer);
  unlisten?.();
  unlisten = null;
  db.setMirror(null);
  attached = false;
}

let reloadTimer: ReturnType<typeof setTimeout> | undefined;
async function receive(docs: RemoteDoc[]) {
  if (!docs.length) return;
  let changed = false;
  for (const d of docs) {
    const cur = await db.get(d.s, d.k);
    const act = applyRemote(cur, d);
    if (d.s === 'kv' && d.k === 'settings' && d.v !== null) sharedSettings = stable(forRemote('kv', 'settings', JSON.parse(d.v)));
    if (act.op === 'put') {
      await db.putRaw(d.s, act.value);
      // Les réglages sont relus tout de suite : une écriture locale ne doit pas repartir avec l'ancienne version.
      if (d.s === 'kv' && d.k === 'settings') state.settings = { ...state.settings, ...(act.value as { v: typeof state.settings }).v };
      changed = true;
    }
    else if (act.op === 'del') { await db.delRaw(d.s, d.k); changed = true; }
  }
  lsSet(LS.since, String(nextSince(Number(lsGet(LS.since) ?? 0), docs)));
  if (changed) {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => { void load(); }, 300);
  }
}

function refreshStatus() {
  if (!user || !attached) return;
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  if (pending) setCloud({ status: 'pending' });
  else if (!online || fromCache) setCloud({ status: 'offline' });
  else setCloud({ status: 'synced', lastSync: Date.now() });
}

// ---------- Lien parent ----------
// Tant que le compte est branché, chaque changement met à jour la page des parents (texte chiffré, voir partage/).

let unsubShares: (() => void) | null = null;
let shareTimer: ReturnType<typeof setTimeout> | undefined;
/** Dernier contenu envoyé par lien (sans l'heure), pour ne rien renvoyer d'identique */
const sentShares = new Map<string, string>();
let sharing: Promise<void> = Promise.resolve();

function scheduleShares(delay = 1500) {
  clearTimeout(shareTimer);
  shareTimer = setTimeout(() => { sharing = sharing.then(pushShares).catch((e) => console.warn('lien parent', e)); }, delay);
}

async function pushShares() {
  if (!attached || !be) return;
  const live = new Set<string>();
  for (const c of state.contracts) {
    const k = c.partage;
    if (!k) continue;
    live.add(k.id);
    const snap = buildSnapshot({ ctx: ctxFor(c), journal: state.journal, amName: state.settings.amName, enfants: state.settings.enfantsACharge ?? 0, now: 0 });
    const same = JSON.stringify(snap);
    if (sentShares.get(k.id) === same) continue;
    snap.maj = Date.now();
    await be.putShare(k.id, await seal(k, snap));
    sentShares.set(k.id, same);
  }
  // Contrat supprimé, ou lien coupé sur un autre appareil : le lien est effacé en ligne aussi.
  for (const id of [...sentShares.keys()]) {
    if (live.has(id)) continue;
    sentShares.delete(id);
    await be.deleteShare(id).catch(() => {});
  }
}

/** Crée le lien parent d'un contrat ; il est envoyé tout de suite (ou au retour du réseau). */
export async function createShare(cid: string) {
  const c = state.contracts.find((x) => x.id === cid);
  if (!c) throw new Error('Contrat introuvable.');
  if (!attached || !be) throw new Error('Branche d’abord ton compte : le lien passe par lui.');
  if (c.partage) return;
  await putContract({ ...c, partage: newShare() });
  logUsage('lien_parent_cree', 'contrat');
  scheduleShares(0);
  await new Promise((r) => setTimeout(r, 20));
  await sharing;
}

/** Coupe le lien : la page des parents devient vide tout de suite. Il faut du réseau. */
export async function cutShare(cid: string) {
  const c = state.contracts.find((x) => x.id === cid);
  if (!c?.partage) return;
  if (!be) throw new Error('Branche d’abord ton compte.');
  try { await be.deleteShare(c.partage.id); } catch (e) { throw friendly(e); }
  sentShares.delete(c.partage.id);
  const { partage: _, ...rest } = c;
  await putContract(rest);
  logUsage('lien_parent_coupe', 'contrat');
}

// ---------- Actions de l'écran Compte ----------

/** Messages en français pour les erreurs du service en ligne */
export function messageFor(code: string): string {
  if (code.includes('email-already-in-use')) return 'Un compte existe déjà avec cette adresse. Connecte-toi plutôt.';
  if (code.includes('invalid-email')) return 'Cette adresse e-mail n’est pas valable.';
  if (code.includes('weak-password') || code.includes('password-does-not-meet-requirements')) return PASSWORD_RULE;
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found') || code.includes('invalid-login')) {
    return 'Adresse ou mot de passe incorrect.';
  }
  if (code.includes('expired-action-code') || code.includes('invalid-action-code')) return 'Ce lien a expiré ou a déjà servi. Demande un nouveau lien depuis l’écran de connexion.';
  if (code.includes('user-disabled')) return 'Ce compte n’existe plus.';
  if (code.includes('too-many-requests')) return 'Trop d’essais. Attends quelques minutes avant de réessayer.';
  if (code.includes('network-request-failed') || code.includes('unavailable') || code.includes('offline')) return 'Pas de réseau. Réessaie avec une connexion.';
  if (code.includes('requires-recent-login')) return 'Par sécurité, reconnecte-toi puis recommence.';
  if (code.includes('permission-denied')) return 'Le compte refuse l’accès. Déconnecte-toi puis reconnecte-toi.';
  return 'Ça n’a pas marché. Réessaie dans un instant.';
}

function friendly(e: unknown): Error {
  if (e instanceof Error && !(e as { code?: string }).code && e.message.includes(' ')) return e;
  return new Error(messageFor(errCode(e)));
}

export { MIN_PASSWORD } from './password';

export async function createAccount(email: string, password: string) {
  if (!passwordChecks(password).ok) throw new Error(PASSWORD_RULE);
  const b = await startCloud();
  const done = nextLink();
  try { await b.createAccount(email.trim(), password); } catch (e) { settle(); throw friendly(e); }
  await done.catch((e) => { throw friendly(e); });
  logUsage('compte_cree');
  // E-mail de confirmation d'adresse : sans lui, une faute de frappe rendrait le mot de passe oublié impossible à récupérer.
  b.sendVerification().then(() => logUsage('confirmation_envoyee')).catch(() => {});
}

export async function signIn(email: string, password: string) {
  const b = await startCloud();
  const done = nextLink();
  try { await b.signIn(email.trim(), password); } catch (e) { settle(); throw friendly(e); }
  await done.catch((e) => { throw friendly(e); });
  logUsage('connexion');
}

export async function resetPassword(email: string) {
  const b = await startCloud();
  try { await b.resetPassword(email.trim()); } catch (e) { throw friendly(e); }
}

/** Renvoie l'e-mail de confirmation d'adresse. */
export async function resendVerification() {
  const b = await startCloud();
  try { await b.sendVerification(); } catch (e) { throw friendly(e); }
  logUsage('confirmation_renvoyee');
}

/** Relit sur le serveur si l'adresse est confirmée. */
export async function checkVerified(): Promise<boolean> {
  const b = await startCloud();
  try {
    const u = await b.refreshUser();
    setCloud({ verified: !!u?.verified });
    return !!u?.verified;
  } catch (e) { throw friendly(e); }
}

/** Lien « confirmer mon adresse » ouvert depuis l'e-mail. */
export async function applyEmailCode(code: string) {
  try { await (await loadBackend()).applyEmailCode(code); } catch (e) { throw friendly(e); }
}

// Lien « nouveau mot de passe » ouvert depuis l'e-mail : pas besoin de session ni de données locales.
export async function verifyResetCode(code: string): Promise<string> {
  try { return await (await loadBackend()).verifyResetCode(code); } catch (e) { throw friendly(e); }
}

export async function confirmReset(code: string, password: string) {
  if (!passwordChecks(password).ok) throw new Error(PASSWORD_RULE);
  try { await (await loadBackend()).confirmReset(code, password); } catch (e) { throw friendly(e); }
}

/**
 * Déconnexion. Les données restent sur le téléphone.
 * Renvoie false sans rien faire si des changements n'ont pas pu partir et que `force` n'est pas demandé.
 */
export async function signOut(force = false): Promise<boolean> {
  const b = await startCloud();
  if (!force && !(await b.waitPending(4000))) return false;
  detach();
  lsSet(LS.linked, null);
  lsSet(LS.pending, null);
  await b.signOut();
  logUsage('deconnexion');
  return true;
}

/** Supprime le compte et tout ce qu'il contient en ligne. Les données restent sur le téléphone. */
export async function deleteAccount(password: string) {
  const b = await startCloud();
  detach();
  try {
    await b.deleteAccount(password);
  } catch (e) {
    // Une partie des données en ligne a pu être effacée : on refait une réunion complète, qui renvoie le téléphone.
    if (user) {
      lsSet(LS.linked, null);
      lsSet(LS.last, null);
      void link(user).catch(() => {});
    }
    throw friendly(e);
  }
  for (const k of [LS.linked, LS.last, LS.since, LS.pending]) lsSet(k, null);
  db.outboxClear();
  logUsage('compte_supprime');
}
