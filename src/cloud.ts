// Compte en ligne et copie des données (chargé à la demande).
//
// Le téléphone reste la référence : l'app lit et écrit toujours dans sa base locale, avec ou sans réseau.
// Chaque changement local est recopié dans le compte ; les changements faits sur un autre appareil
// arrivent en direct et sont rangés dans la base locale.
import * as db from './db';
import { PASSWORD_RULE, passwordChecks } from './password';
import { acceptationConditions } from './legal';
import { autoCopy, ctxFor, load, logErreur, logUsage, putContract, saveSettings, state, subscribe, toast } from './store';
import { buildSnapshot } from './partage/snapshot';
import { newShare, open as openShare, seal } from './partage/crypto';
import { clesLocales, cloudInfo, deviceId, garderCleLocale, oublierClesLocales, LS, lsGet, lsSet, messageRefus, setCloud, type EtatChiffrement } from './cloud-state';
import { aChiffrer, chiffrer, CHIFFRES, cleDuBloc, separer, codeDeSecours, COFFRE, dechiffrer, estScelle, lireCode, nouveauSecret, ouvrirCle, type Cle } from './sync/coffre';
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
      b.onRejected(onRejected);
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
    // Les clés d'un envoi refusé restent dans cette file : elles repartent à la reconnexion.
    detach();
    user = null;
    cle = null;
    cles = [];
    setCloud({ cleManquante: undefined, cleOk: undefined });
    protegees.clear();
    setCloud({ status: 'off', email: undefined, verified: undefined, lastSync: undefined, refus: undefined });
    return;
  }
  user = u;
  // T-121 : clé de secours de ce téléphone pour ce compte, avant tout envoi.
  // Seulement la clé qui correspond au coffre déjà connu de ce téléphone ; sinon rien ne part chiffré avant `etablirCoffre`.
  cles = await chargerCles(u.uid).catch(() => []);
  cle = null;
  const idLocal = await idCoffreLocal().catch(() => null);
  if (idLocal) choisirCle(idLocal);
  setCloud({ uid: u.uid });
  // Nouvelle connexion : les clés refusées repartent avec la file d'attente, l'ancien bandeau n'a plus lieu d'être.
  setCloud({ email: u.email ?? undefined, verified: u.verified, refus: undefined });
  protegees.clear();
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
  // T-121 (option b) : coffre du compte. Clé de secours de ce téléphone, ou nouvelle clé si le compte n'en a pas encore.
  await etablirCoffre(u, remote);
  remote = await ouvrirDocs(remote);
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
  await envoyer(b, u.uid, [
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

// ---------- Envois refusés (C-023) ----------
// Un envoi refusé par le serveur n'est plus perdu en silence : les clés sont notées dans la file d'attente du
// téléphone (renvoyées au prochain branchement ou au prochain essai) et un bandeau le dit, sur tous les écrans.

/** Envoi refusé par le serveur : clés gardées, bandeau affiché. Exporté pour les tests. */
let refusN = 0;
/**
 * Clés refusées par le serveur, pas encore renvoyées avec succès, avec l'heure serveur la plus récente déjà vue au
 * moment du refus. Après un refus, Firestore remet la version du serveur : cette version, déjà connue (heure ≤ cette
 * limite), n'écrase pas le changement du téléphone, qui sera renvoyé. Une version plus récente vient d'un autre
 * appareil : elle est rangée et le changement refusé n'est plus renvoyé par-dessus. Les réglages ne sont jamais
 * protégés : ils sont toujours fusionnés. La protection tombe avec le bandeau (C-023).
 */
const protegees = new Map<string, number>();
/** Suppression du compte en cours : un refus tardif ne doit ni remplir la file ni afficher de bandeau */
let suppression = false;
export function onRejected(code: string, docs: Array<{ s: db.SyncedStore; k: string }>) {
  if (suppression) return;
  db.outboxKeep(docs);
  const vu = Number(lsGet(LS.since) ?? 0);
  for (const d of docs) {
    const id = docId(d.s, d.k);
    if (!(d.s === 'kv' && d.k === 'settings') && !protegees.has(id)) protegees.set(id, vu);
  }
  // Personne n'est connecté : les clés attendent la prochaine connexion, sans bandeau ni événement.
  if (!user) return;
  refusN++;
  // Lien parent refusé (aucun document de données) : il sera renvoyé en entier au prochain essai.
  if (!docs.length) sentShares.clear();
  // C-101 : noté une fois par bandeau affiché, pas à chaque lot refusé. Le code d'erreur ne part pas.
  if (!cloudInfo().refus) logErreur('envoi_refuse');
  setCloud({ refus: messageRefus(code) });
}

/**
 * Bouton « Réessayer » du bandeau : relance la copie, qui renvoie d'abord les changements refusés.
 * Le bandeau ne disparaît que si tout est parti sans nouveau refus (relecture contradictoire, point 5).
 */
export async function retryRejected(): Promise<boolean> {
  if (!user || !be) return false;
  const avant = refusN;
  try {
    if (attached) await attach(user);
    else await link(user);
  } catch { return false; }
  await new Promise((r) => setTimeout(r, 0));
  const ok = await be.waitPending(20000);
  // Les renvois document par document d'un lot refusé partent juste après : on attend aussi leur réponse.
  await new Promise((r) => setTimeout(r, 50));
  const ok2 = ok && await be.waitPending(20000);
  if (ok2 && refusN === avant) { setCloud({ refus: undefined }); protegees.clear(); return true; }
  return false;
}

// ---------- Coffre : chiffrement de bout en bout des données de santé (T-121, option b) ----------
// Voir sync/coffre.ts. Les clés restent en mémoire et dans le stockage de ce téléphone (cloud-state.ts, LS.coffre, par compte).
// `cle` : la clé du compte (celle dont l'empreinte est dans kv/coffre). `cles` : elle, plus les anciennes clés gardées, qui
// servent seulement à déchiffrer puis rechiffrer avec la clé du compte (relecture de l'option b, B1).

let cle: Cle | null = null;
let cles: Cle[] = [];

const codes = new Map<string, string>(); // empreinte → clé de secours (pour la remettre en tête quand elle est celle du compte)
async function chargerCles(uid: string): Promise<Cle[]> {
  const out: Cle[] = [];
  for (const code of clesLocales(uid)) {
    const sec = lireCode(code);
    if (!sec) continue;
    const c = await ouvrirCle(sec);
    codes.set(c.id, code);
    out.push(c);
  }
  return out;
}

function idCoffre(docs: RemoteDoc[]): string | null {
  const d = docs.find((x) => x.s === 'kv' && x.k === COFFRE && x.v);
  try { return d ? (JSON.parse(d.v!) as { v: { id: string } }).v.id : null; } catch { return null; }
}

async function idCoffreLocal(): Promise<string | null> {
  return (await db.get<{ k: string; v: { id: string } }>('kv', COFFRE))?.v.id ?? null;
}

/** Choisit, parmi les clés de ce téléphone, celle du compte ; null si ce téléphone ne l'a pas. */
function choisirCle(id: string | null): void {
  cle = id ? cles.find((c) => c.id === id) ?? null : null;
  // La clé du compte passe en tête des clés gardées : c'est elle que l'écran Compte montre (contre-relecture n1).
  const code = cle ? codes.get(cle.id) : undefined;
  if (code && user && clesLocales(user.uid)[0] !== code) garderCleLocale(user.uid, code);
  setCloud({ cleManquante: !!id && !cle, cleOk: !!cle });
}

/**
 * Établit le coffre du compte. S'il existe : la clé de ce téléphone est-elle la sienne ? Sinon, la clé est demandée. S'il
 * n'existe pas : une clé est créée, seulement si aucune donnée n'est déjà chiffrée (sinon une autre clé existe quelque part,
 * on la demande), et le coffre est écrit seulement s'il n'existe toujours pas au moment d'écrire (transaction : deux appareils
 * ne peuvent pas créer deux clés).
 */
async function etablirCoffre(u: CloudUser, remote?: RemoteDoc[]): Promise<void> {
  cles = await chargerCles(u.uid);
  let id = await idCoffreLocal();
  if (!id) {
    remote ??= await be!.fetchAll(u.uid);
    id = idCoffre(remote);
    const d = remote.find((x) => x.s === 'kv' && x.k === COFFRE && x.v);
    if (d) await db.putRaw('kv', JSON.parse(d.v!));
  }
  if (!id) {
    const local = await localRecords();
    const blocs = new Set([...remote!.map((d) => (d.v ? cleDuBloc(JSON.parse(d.v)) : null)), ...local.map((r) => cleDuBloc(r.value))].filter((x): x is string => !!x));
    let candidate = cles.find((c) => blocs.has(c.id)) ?? (blocs.size ? null : cles[0] ?? null);
    if (!candidate && blocs.size) { choisirCle(null); setCloud({ cleManquante: true, cleOk: false }); return; }
    if (!candidate) {
      const sec = nouveauSecret();
      garderCleLocale(u.uid, codeDeSecours(sec));
      candidate = await ouvrirCle(sec);
      cles = [...cles, candidate];
    }
    const doc = { k: COFFRE, v: { version: 1, id: candidate.id, cree: new Date().toISOString().slice(0, 10) } };
    const enLigne = await be!.creerCoffre(u.uid, stable(doc));
    const garde = JSON.parse(enLigne) as typeof doc;
    await db.putRaw('kv', garde);
    id = garde.v.id;
  }
  choisirCle(id);
}

/** Ce qui attendait la clé (file d'attente) repart, chiffré. Mis dans la file d'envoi avant d'être retiré de l'attente. */
function renvoyerAttente() {
  const waiting = db.outboxRead();
  if (!waiting.length || !attached) return;
  void (async () => {
    for (const { s, k } of waiting) {
      const v = await db.get(s, k);
      if (v === undefined) enqueue(s, k, null);
      else enqueue(s, k, stable(forRemote(s, k, v)));
    }
    // Retirées de l'attente juste avant l'envoi : ce qui attend encore la clé y est remis par `envoyer`.
    db.outboxDrop(waiting);
  })();
}

/** Déchiffre les documents reçus quand ce téléphone a la clé ; sinon ils restent scellés (illisibles, gardés tels quels). */
async function ouvrirDocs(docs: RemoteDoc[]): Promise<RemoteDoc[]> {
  if (!cles.length) return docs;
  const out: RemoteDoc[] = [];
  for (const d of docs) {
    if (d.v === null || !(CHIFFRES as readonly string[]).includes(d.s)) { out.push(d); continue; }
    const val: unknown = JSON.parse(d.v);
    if (!estScelle(val)) { out.push(d); continue; }
    const dec = await dechiffrer(d.s, val, cles);
    out.push(dec ? { ...d, v: stable(dec) } : d);
  }
  return out;
}

/** Ouvre les enregistrements scellés de ce téléphone (reçus avant d'avoir la clé). Rend le nombre d'enregistrements ouverts. */
async function ouvrirLocal(): Promise<number> {
  if (!cles.length) return 0;
  let n = 0;
  for (const s of CHIFFRES) {
    for (const value of await db.getAll(s)) {
      if (!estScelle(value)) continue;
      const dec = await dechiffrer(s, value, cles);
      if (dec) { await db.putRaw(s, dec); n++; }
    }
  }
  return n;
}

/** Écran Compte : la clé de secours tapée ou lue dans un fichier. Vérifiée contre l'empreinte du compte. */
export async function entrerCle(texte: string): Promise<void> {
  if (!user || !be) throw new Error('Connecte-toi d’abord à ton compte.');
  const sec = lireCode(texte.trim().split(/\s+/).find((m) => lireCode(m)) ?? texte);
  if (!sec) throw new Error('Cette clé n’a pas la bonne forme : 26 lettres et chiffres, par groupes de 4.');
  const c = await ouvrirCle(sec);
  let id: string | null;
  try { id = idCoffre(await be.fetchAll(user.uid)); } catch { throw new Error('Il faut du réseau pour vérifier la clé.'); }
  if (id && id !== c.id) throw new Error('Ce n’est pas la clé de secours de ce compte. Vérifie chaque caractère.');
  // La clé du compte passe en tête ; une autre clé de ce téléphone est gardée pour rechiffrer ce qu'elle a scellé.
  garderCleLocale(user.uid, codeDeSecours(sec));
  cles = await chargerCles(user.uid);
  if (!id) { await etablirCoffre(user); } else choisirCle(id);
  const n = await ouvrirLocal();
  logUsage('cle_secours_entree');
  await load();
  renvoyerAttente();
  void chiffrerEnLigne(user, true);
  if (n) toast('Clé reconnue : le carnet et ce qui touche à la santé sont ouverts sur ce téléphone.', undefined, 'ok');
}

/**
 * Seul chemin d'envoi vers le compte. T-121 : ce qui touche à la santé part chiffré avec la clé du compte. Sans elle, un
 * enregistrement qui a une donnée de santé en clair ne part pas : il attend dans la file, et partira avec la clé. Le coffre ne
 * part jamais par ce chemin (seulement par `creerCoffre`, qui ne remplace pas un coffre existant).
 */
async function envoyer(b: Backend, uid: string, docs: Array<{ s: db.SyncedStore; k: string; v: string | null }>): Promise<void> {
  const ecrire: typeof docs = [];
  const attente: Array<{ s: db.SyncedStore; k: string }> = [];
  for (const d of docs) {
    if (d.s === 'kv' && d.k === COFFRE) continue;
    if (d.v === null || !(CHIFFRES as readonly string[]).includes(d.s)) { ecrire.push(d); continue; }
    const val: unknown = JSON.parse(d.v);
    const out = await chiffrer(d.s, val, cle);
    if (out === null) {
      attente.push({ s: d.s, k: d.k });
      // Contrat sans la clé (contre-relecture N2) : sa partie lisible part tout de suite (paie, avenants…), avec le bloc déjà
      // chiffré s'il en a un ; seule la partie à chiffrer attend la clé. Une note du carnet attend entière.
      if (d.s === 'contracts') {
        const p = separer(d.s, val);
        const bloc = (val as Record<string, unknown>).sante;
        if (p) ecrire.push({ ...d, v: stable(bloc ? { ...p.lisible, sante: bloc } : p.lisible) });
      }
      continue;
    }
    ecrire.push(out === val ? d : { ...d, v: stable(out) });
  }
  if (attente.length) db.outboxKeep(attente);
  if (ecrire.length) await b.write(uid, ecrire);
}

/** Document en ligne à (re)chiffrer : une donnée de santé en clair, ou un bloc scellé avec une autre clé que celle du compte. */
function aRechiffrer(s: string, val: unknown): boolean {
  if (!(CHIFFRES as readonly string[]).includes(s)) return false;
  if (aChiffrer(s, val)) return true;
  const k = cleDuBloc(val);
  return !!k && !!cle && k !== cle.id;
}

/**
 * T-121, point 3 : données encore en clair dans le compte (versions d'avant, ou appareil resté sur une ancienne version), ou
 * scellées avec une ancienne clé, chiffrées avec la clé du compte par ce téléphone. Chaque document part de sa propre version
 * en ligne, bloc déjà chiffré compris (déchiffré et réuni avec le clair : rien du bloc ne se perd) ; avant d'écrire, l'app
 * déchiffre le résultat et vérifie qu'il redonne exactement cette version ; l'écriture ne se fait que si le document n'a pas
 * changé en ligne entre-temps (transaction) ; après, l'app relit le compte et vérifie. Un bloc qu'aucune clé de ce téléphone
 * n'ouvre est laissé tel quel et compté. Une fois par jour au plus tant que ce n'est pas vérifié, et dès qu'une donnée en
 * clair arrive (`force`).
 */
let chiffrementEnCours: Promise<void> | null = null;
let chiffrementARelancer = false;
function chiffrerEnLigne(u: CloudUser, force = false): Promise<void> {
  if (chiffrementEnCours) { if (force) chiffrementARelancer = true; return chiffrementEnCours; }
  chiffrementEnCours = (async () => {
    const b = be;
    const c = cle;
    if (!b || !c) return;
    const avant = JSON.parse(lsGet(LS.chiffrement) ?? 'null') as EtatChiffrement | null;
    const jour = new Date().toISOString().slice(0, 10);
    if (!force && avant?.uid === u.uid && ((avant.verifie && avant.gardes === 0) || avant.jour === jour)) return;
    await b.waitPending(10000);
    const remote = await b.fetchAll(u.uid);
    if (user?.uid !== u.uid || cle !== c) return;
    noterAppareils(remote);
    const ecrire: Array<{ s: db.SyncedStore; k: string; v: string; t: number }> = [];
    const attendu = new Map<string, string>();
    let gardes = 0;
    for (const d of remote) {
      if (d.v === null) continue;
      const val = JSON.parse(d.v) as Record<string, unknown>;
      if (!aRechiffrer(d.s, val)) continue;
      // Version complète : bloc déchiffré et réuni avec ce qui est en clair (sans bloc : la version en clair).
      const { sante: _s, ...sansBloc } = val;
      const complet = estScelle(val) ? await dechiffrer(d.s, val, cles) : sansBloc;
      if (!complet) { gardes++; continue; }
      const out = await chiffrer(d.s, complet, c);
      const relu = out ? await dechiffrer(d.s, out, c) : null;
      if (!out || !relu || stable(relu) !== stable(complet)) { gardes++; continue; }
      ecrire.push({ s: d.s, k: d.k, v: stable(out), t: d.t });
      attendu.set(docId(d.s, d.k), stable(complet));
    }
    const ecrits = ecrire.length ? await b.remplacerSi(u.uid, ecrire) : 0;
    let verifie = false;
    const apres = await b.fetchAll(u.uid).catch(() => null);
    if (apres) {
      verifie = true;
      for (const d of apres) {
        if (d.v === null) continue;
        const val: unknown = JSON.parse(d.v);
        if (aRechiffrer(d.s, val)) { verifie = false; continue; }
        const att = attendu.get(docId(d.s, d.k));
        if (att !== undefined && cleDuBloc(val) === c.id) {
          const dec = await dechiffrer(d.s, val, c);
          // Changé en ligne entre-temps (non écrit) : ce n'est pas une perte, il sera relu au prochain passage.
          if (!dec) verifie = false;
        }
      }
    }
    lsSet(LS.chiffrement, JSON.stringify({ uid: u.uid, jour, chiffres: ecrits, gardes, verifie } satisfies EtatChiffrement));
  })().catch((e) => console.warn('chiffrement', e)).finally(() => {
    chiffrementEnCours = null;
    if (chiffrementARelancer) { chiffrementARelancer = false; void chiffrerEnLigne(u, true); }
  });
  return chiffrementEnCours;
}

// ---------- Appareils pas à jour (T-121, point de décision du DG) ----------
// Chaque appareil à jour écrit un repère dans le compte (magasin kv, `appareil-<id>`). Un document écrit dans les 60 derniers
// jours par un appareil sans repère vient d'un appareil resté sur une ancienne version : l'écran Compte le dit. Les appareils
// vus sont notés à chaque réception (pas seulement à la migration : relecture de l'option b, M2).

export const FORMAT_DONNEES = 2;
const REPERE = 'appareil-';
const JOURS_VUS = 60;

async function poserRepere() {
  const k = REPERE + deviceId();
  const jour = new Date().toISOString().slice(0, 10);
  const cur = await db.get<{ k: string; v: { format: number; vu: string } }>('kv', k);
  if (cur?.v.format === FORMAT_DONNEES && cur.v.vu === jour) return;
  await db.put('kv', { k, v: { format: FORMAT_DONNEES, vu: jour } });
}

function lireVus(): Record<string, number> {
  try { return JSON.parse(lsGet(LS.vus) ?? '{}') as Record<string, number>; } catch { return {}; }
}

/** Note les appareils qui ont écrit ces documents, puis recompte ceux qui ne sont pas à jour. */
function noterAppareils(docs: RemoteDoc[]) {
  const me = deviceId();
  const vus = lireVus();
  const limite = Date.now() - JOURS_VUS * 86400000;
  for (const d of docs) if (d.d && d.d !== me && !(d.s === 'kv' && d.k.startsWith(REPERE))) vus[d.d] = Math.max(vus[d.d] ?? 0, d.t || Date.now());
  for (const [id, t] of Object.entries(vus)) if (t < limite) delete vus[id];
  lsSet(LS.vus, JSON.stringify(vus));
  void recompterAnciens(vus);
}

async function recompterAnciens(vus = lireVus(), prevenir = false) {
  const aJour = new Set<string>();
  for (const r of await db.getAll<{ k: string; v?: { format?: number } }>('kv')) {
    if (r.k.startsWith(REPERE) && (r.v?.format ?? 0) >= FORMAT_DONNEES) aJour.add(r.k.slice(REPERE.length));
  }
  const n = Object.keys(vus).filter((id) => !aJour.has(id)).length;
  const avant = Number(lsGet(LS.anciens) ?? 0);
  lsSet(LS.anciens, n ? String(n) : null);
  if (prevenir && n && !avant) toast('Un autre appareil utilise une ancienne version d’Arvela : ouvre l’app dessus et touche « Mettre à jour ».', undefined, 'warn');
}

// ---------- Copie en direct ----------

let queue = new Map<string, { s: db.SyncedStore; k: string; v: string | null }>();
let envoiChaine: Promise<void> = Promise.resolve();
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
      // Envois l'un après l'autre : le chiffrement prend un instant, une version plus récente ne doit pas passer devant.
      if (user && be && docs.length) { const b = be, uid = user.uid; envoiChaine = envoiChaine.then(() => envoyer(b, uid, docs)).catch((e) => console.warn(e)); }
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
      // T-121 : une restauration ne retire jamais le coffre ni les repères d'appareils du compte (relecture de l'option b, B1).
      for (const k of oldKeys.get(s) ?? []) if (!now.has(k) && !(s === 'kv' && (k === COFFRE || k.startsWith(REPERE)))) enqueue(s, k, null);
    }
  },
};

/** Lance la copie en direct, après avoir envoyé ce qui a changé pendant qu'elle ne tournait pas. */
function attach(u: CloudUser): Promise<void> {
  detach();
  const set = state.settings;
  sharedSettings = stable(forRemote('kv', 'settings', { k: 'settings', v: set }));
  const waiting = db.outboxRead();
  // Changements pas encore confirmés en ligne (refusés, ou faits avant la connexion) : une version du serveur déjà
  // connue ne les écrase pas ; une plus récente passe, avec copie (voir receive). Seconde relecture, point 2.
  const vuAttach = Number(lsGet(LS.since) ?? 0);
  for (const { s, k } of waiting) {
    const id = docId(s, k);
    if (!(s === 'kv' && k === 'settings') && !protegees.has(id)) protegees.set(id, vuAttach);
  }
  db.outboxClear();
  db.setMirror(mirror);
  attached = true;
  const renvoi = (async () => {
    for (const { s, k } of waiting) {
      const v = await db.get(s, k);
      if (v === undefined) enqueue(s, k, null);
      else enqueue(s, k, stable(forRemote(s, k, v)));
    }
  })().catch((e) => console.warn(e));
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
  reconciled = false;
  scheduleShares(500);
  // T-121 : repère d'appareil à jour, puis chiffrement des données encore en clair dans le compte.
  void renvoi.then(async () => {
    await poserRepere();
    await etablirCoffre(u);
    if (cle) { if (await ouvrirLocal()) await load(); renvoyerAttente(); }
    void recompterAnciens(lireVus(), true);
    await chiffrerEnLigne(u);
  }).catch((e) => console.warn('coffre', e));
  return renvoi;
}

function detach() {
  arreterSuivis();
  unsubShares?.();
  unsubShares = null;
  clearTimeout(shareTimer);
  unlisten?.();
  unlisten = null;
  db.setMirror(null);
  attached = false;
}

let reloadTimer: ReturnType<typeof setTimeout> | undefined;
async function receive(recus: RemoteDoc[]) {
  if (!recus.length) return;
  // T-121 : une donnée de santé reçue en clair (appareil resté sur une ancienne version) est rechiffrée dans le compte ; et le
  // lien des parents est rechiffré, au cas où cet appareil l'aurait abîmé.
  noterAppareils(recus);
  if (cle && user && recus.some((d) => d.v !== null && aRechiffrer(d.s, JSON.parse(d.v)))) {
    const u = user;
    setTimeout(() => { void chiffrerEnLigne(u, true); sentShares.clear(); scheduleShares(0); }, 1000);
  }
  const docs = await ouvrirDocs(recus);
  let changed = false;
  let copieFaite = false, remplace = false;
  for (const d of docs) {
    const id = docId(d.s, d.k);
    const limite = protegees.get(id);
    if (limite !== undefined) {
      // Version déjà connue (remise par Firestore après le refus) : le changement du téléphone sera renvoyé.
      if (d.t <= limite) continue;
      // Version plus récente, d'un autre appareil : elle gagne et le changement refusé ne repart pas par-dessus,
      // mais il n'est jamais perdu en silence : copie automatique du téléphone d'abord, puis message.
      protegees.delete(id);
      if (!copieFaite) { await autoCopy(true).catch(() => {}); copieFaite = true; }
      db.outboxDrop([{ s: d.s, k: d.k }]);
      remplace = true;
    }
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
  if (remplace) {
    toast('Une version plus récente, faite sur un autre appareil, a remplacé un changement qui n’avait pas pu partir. Ta version est gardée dans Sauvegarde, copies automatiques.', undefined, 'warn');
  }
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
  else {
    setCloud({ status: 'synced', lastSync: Date.now() });
  }
}

// ---------- Lien parent ----------
// Tant que le compte est branché, chaque changement met à jour la page des parents (texte chiffré, voir partage/).

let unsubShares: (() => void) | null = null;
let shareTimer: ReturnType<typeof setTimeout> | undefined;
/** Dernier contenu envoyé par lien (sans l'heure), pour ne rien renvoyer d'identique */
const sentShares = new Map<string, string>();
/**
 * T-121 (relecture de l'option b, M3) : dernier texte chiffré envoyé par lien, et suivi en direct de chaque lien. Si le
 * document change sans venir de ce téléphone (appareil resté sur une ancienne version, qui n'a pas le secret), ce téléphone
 * le refait aussitôt.
 */
const dernierScelle = new Map<string, string>();
const suivis = new Map<string, () => void>();
function suivreLien(id: string) {
  if (suivis.has(id) || !be) return;
  suivis.set(id, be.watchShare(id, (d) => {
    const mien = dernierScelle.get(id);
    if (!d || !mien || d.v === mien || !cle) return;
    // Un autre appareil à jour a le secret : son texte s'ouvre, rien à refaire (sinon deux appareils se relanceraient sans
    // fin : contre-relecture N1). Seul un texte qui ne s'ouvre pas (ancien appareil sans le secret) est refait.
    const k = state.contracts.find((c) => c.partage?.id === id)?.partage;
    if (!k?.secret || !k.code) return;
    void openShare(k.secret, k.code, d).then(() => { dernierScelle.set(id, d.v); }, () => { sentShares.delete(id); scheduleShares(1000); });
  }, () => {}));
}
function arreterSuivis() {
  for (const f of suivis.values()) f();
  suivis.clear();
}
let sharing: Promise<void> = Promise.resolve();
/** Liens en ligne comparés aux contrats une fois par branchement du compte */
let reconciled = false;

function deleteLater(id: string) {
  be?.deleteShare(id).catch(() => {});
}

function scheduleShares(delay = 1500) {
  clearTimeout(shareTimer);
  shareTimer = setTimeout(() => { sharing = sharing.then(pushShares).catch((e) => console.warn('lien parent', e)); }, delay);
}

async function pushShares() {
  if (!attached || !be) return;
  const coupes = new Set(state.settings.liensCoupes ?? []);
  const live = new Set<string>();
  for (const c of state.contracts) {
    const k = c.partage;
    if (!k) continue;
    if (coupes.has(k.id)) {
      // Lien coupé ailleurs, revenu avec un contrat envoyé par un autre appareil : on le retire.
      const { partage: _, ...rest } = c;
      await putContract(rest);
      deleteLater(k.id);
      continue;
    }
    live.add(k.id);
    // T-121 : sans la clé de secours, ce téléphone n'a pas le secret du lien : il ne le met pas à jour (un autre appareil le fait).
    if (!k.secret || !k.code) continue;
    const snap = buildSnapshot({ ctx: ctxFor(c), journal: state.journal, amName: state.settings.amName, enfants: state.settings.enfantsACharge ?? 0, now: 0 });
    const same = JSON.stringify(snap);
    if (sentShares.get(k.id) === same) continue;
    snap.maj = Date.now();
    const scelle = await seal(k, snap);
    dernierScelle.set(k.id, scelle.v);
    await be.putShare(k.id, scelle);
    sentShares.set(k.id, same);
    suivreLien(k.id);
  }
  // Contrat supprimé, ou lien coupé sur un autre appareil : le lien est effacé en ligne aussi.
  for (const id of [...sentShares.keys()]) {
    if (live.has(id)) continue;
    sentShares.delete(id);
    deleteLater(id);
  }
  // Une fois par branchement : les liens restés en ligne sans contrat (app fermée trop tôt, autre appareil) sont effacés.
  if (!reconciled) {
    const enLigne = await be.listShares().catch(() => null);
    if (enLigne) {
      reconciled = true;
      for (const id of enLigne) if (!live.has(id)) deleteLater(id);
    }
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

/**
 * Coupe le lien. Renvoie vrai si la page des parents est déjà fermée, faux si l'effacement
 * attend le réseau (il partira tout seul). Il faut du réseau au départ.
 */
export async function cutShare(cid: string): Promise<boolean> {
  const c = state.contracts.find((x) => x.id === cid);
  if (!c?.partage) return true;
  if (!be) throw new Error('Branche d’abord ton compte.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Il faut du réseau pour couper le lien.');
  const id = c.partage.id;
  const fait = await Promise.race([
    be.deleteShare(id).then(() => true),
    new Promise<boolean>((res) => setTimeout(() => res(false), 8000)),
  ]).catch((e) => { throw friendly(e); });
  sentShares.delete(id);
  // Noté dans les réglages (copiés dans le compte) : aucun autre appareil ne pourra le rouvrir.
  await saveSettings({ liensCoupes: [...(state.settings.liensCoupes ?? []).filter((x) => x !== id), id].slice(-50) });
  const { partage: _, ...rest } = state.contracts.find((x) => x.id === cid) ?? c;
  await putContract(rest);
  logUsage('lien_parent_coupe', 'contrat');
  return fait;
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
  // Accord aux conditions d'utilisation donné en créant le compte : version et date gardées dans les réglages, copiés dans le compte.
  await saveSettings({ conditionsAcceptees: acceptationConditions() });
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
  suppression = true;
  try {
    await b.deleteAccount(password);
  } catch (e) {
    suppression = false;
    // Une partie des données en ligne a pu être effacée : on refait une réunion complète, qui renvoie le téléphone.
    if (user) {
      lsSet(LS.linked, null);
      lsSet(LS.last, null);
      void link(user).catch(() => {});
    }
    throw friendly(e);
  }
  const uidSupprime = user?.uid;
  for (const k of [LS.linked, LS.last, LS.since, LS.pending, LS.chiffrement, LS.anciens, LS.vus]) lsSet(k, null);
  if (uidSupprime) oublierClesLocales(uidSupprime);
  cle = null;
  cles = [];
  setCloud({ cleManquante: undefined, cleOk: undefined });
  // Le coffre du compte supprimé n'a plus de sens sur ce téléphone.
  await db.delRaw('kv', COFFRE).catch(() => {});
  db.outboxClear();
  // Les liens parents sont effacés en ligne avec le compte : ils ne doivent pas revenir avec un prochain compte.
  for (const c of state.contracts) if (c.partage) { const { partage: _, ...rest } = c; await putContract(rest); }
  db.outboxClear();
  setCloud({ refus: undefined });
  protegees.clear();
  suppression = false;
  logUsage('compte_supprime');
}
