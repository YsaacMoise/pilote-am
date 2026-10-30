// Compte en ligne et copie des données (chargé à la demande).
//
// Le téléphone reste la référence : l'app lit et écrit toujours dans sa base locale, avec ou sans réseau.
// Chaque changement local est recopié dans le compte ; les changements faits sur un autre appareil
// arrivent en direct et sont rangés dans la base locale.
import * as db from './db';
import { autoCopy, load, logUsage, state, toast } from './store';
import { cloudInfo, LS, lsGet, lsSet, setCloud } from './cloud-state';
import { errCode, type Backend, type CloudUser } from './sync/backend';
import { applyRemote, forRemote, nextSince, planMerge, RESUME_MARGIN_MS, stable, type LocalRecord, type RemoteDoc } from './sync/plan';

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
  if (db.isDemo()) return Promise.reject(new Error('Pas de compte avec les enfants d’exemple'));
  if (!starting) {
    starting = (async () => {
      if (cloudInfo().status === 'off') setCloud({ status: 'starting' });
      const b = await loadBackend();
      be = b;
      b.onPending((p) => { pending = p; refreshStatus(); });
      b.onUser((u) => { void onUser(u); });
      window.addEventListener('online', () => {
        if (user && lsGet(LS.linked) !== user.uid) void link(user).catch(() => {});
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
    detach();
    user = null;
    setCloud({ status: 'off', email: undefined, lastSync: undefined });
    return;
  }
  user = u;
  setCloud({ email: u.email ?? undefined });
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
function link(u: CloudUser): Promise<void> {
  if (!linking) {
    linking = doLink(u)
      .catch((e) => { if (!attached) db.setMirror(null); throw e; })
      .finally(() => { linking = null; });
  }
  return linking;
}

async function doLink(u: CloudUser) {
  const b = be!;
  const last = lsGet(LS.last);
  if (last && last !== u.uid && localHasData()) {
    await b.signOut();
    throw new Error('Ce téléphone contient les données d’un autre compte. Connecte-toi avec celui-là, ou demande de l’aide avant de changer de compte.');
  }
  setCloud({ status: 'merging' });
  // Pendant la réunion, les changements faits sur le téléphone sont notés pour être envoyés juste après.
  const touched = new Map<string, { s: db.SyncedStore; k: string }>();
  const note = (s: db.SyncedStore, k: string) => touched.set(`${s}|${k}`, { s, k });
  db.setMirror({
    put: (s, k) => note(s, k),
    del: (s, k) => note(s, k),
    replaced: (old, d) => {
      for (const s of db.SYNCED) {
        for (const k of old.get(s) ?? []) note(s, k);
        for (const v of (d[s] ?? []) as unknown[]) note(s, db.keyOf(s, v));
      }
    },
  });
  let remote: RemoteDoc[];
  try {
    remote = await b.fetchAll(u.uid);
  } catch (e) {
    db.setMirror(null);
    setCloud({ status: 'error', error: 'Il faut du réseau pour la première copie. Elle reprendra toute seule au retour du réseau.' });
    throw friendly(e);
  }
  const preferLocal = last === u.uid;
  const local = await localRecords();
  const plan = planMerge(local, remote, preferLocal);
  if (plan.toLocal.length + plan.deleteLocal.length > 0 && localHasData()) await autoCopy(true);
  for (const r of plan.toLocal) await db.putRaw(r.s, r.value);
  for (const r of plan.deleteLocal) await db.delRaw(r.s, r.k);
  await b.write(u.uid, plan.toRemote.map((r) => ({ s: r.s, k: r.k, v: JSON.stringify(forRemote(r.s, r.k, r.value)) })));
  lsSet(LS.linked, u.uid);
  lsSet(LS.last, u.uid);
  lsSet(LS.since, String(nextSince(0, remote)));
  const hadLocal = localHasData();
  await load();
  logUsage('compte_branche', remote.length ? (hadLocal ? 'fusion' : 'recuperation') : 'premier_envoi');
  if (remote.length && hadLocal && (plan.toLocal.length || plan.deleteLocal.length)) {
    toast('Les données de ton compte et celles du téléphone sont réunies.', undefined, 'ok');
  }
  attach(u);
  for (const { s, k } of touched.values()) {
    const v = await db.get(s, k);
    if (v === undefined) enqueue(s, k, null);
    else enqueueValue(s, k, v);
  }
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

function attach(u: CloudUser) {
  detach();
  const set = state.settings;
  sharedSettings = stable(forRemote('kv', 'settings', { k: 'settings', v: set }));
  db.setMirror(mirror);
  attached = true;
  const since = Math.max(0, Number(lsGet(LS.since) ?? 0) - RESUME_MARGIN_MS);
  let chain = Promise.resolve();
  unlisten = be!.listen(u.uid, since, (docs, meta) => {
    fromCache = meta.fromCache;
    chain = chain.then(() => receive(docs)).catch((e) => console.warn(e));
    refreshStatus();
  }, (e) => {
    setCloud({ status: 'error', error: messageFor(errCode(e)) });
  });
  refreshStatus();
}

function detach() {
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

// ---------- Actions de l'écran Compte ----------

/** Messages en français pour les erreurs du service en ligne */
export function messageFor(code: string): string {
  if (code.includes('email-already-in-use')) return 'Un compte existe déjà avec cette adresse. Connecte-toi plutôt.';
  if (code.includes('invalid-email')) return 'Cette adresse e-mail n’est pas valable.';
  if (code.includes('weak-password')) return 'Le mot de passe doit faire au moins 8 caractères.';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found') || code.includes('invalid-login')) {
    return 'Adresse ou mot de passe incorrect.';
  }
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

export const MIN_PASSWORD = 8;

export async function createAccount(email: string, password: string) {
  if (password.length < MIN_PASSWORD) throw new Error(messageFor('weak-password'));
  const b = await startCloud();
  const done = nextLink();
  try { await b.createAccount(email.trim(), password); } catch (e) { settle(); throw friendly(e); }
  await done.catch((e) => { throw friendly(e); });
  logUsage('compte_cree');
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

/**
 * Déconnexion. Les données restent sur le téléphone.
 * Renvoie false sans rien faire si des changements n'ont pas pu partir et que `force` n'est pas demandé.
 */
export async function signOut(force = false): Promise<boolean> {
  const b = await startCloud();
  if (!force && !(await b.waitPending(4000))) return false;
  detach();
  lsSet(LS.linked, null);
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
    if (user) attach(user);
    throw friendly(e);
  }
  lsSet(LS.linked, null);
  lsSet(LS.last, null);
  lsSet(LS.since, null);
  logUsage('compte_supprime');
}
