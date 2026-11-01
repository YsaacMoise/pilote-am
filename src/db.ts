// IndexedDB minimaliste. Tous les noms sont préfixés « cc- » (origine partagée avec l'autre version).

export const STORES = ['kv', 'contracts', 'days', 'leaves', 'bulletins', 'journal', 'feedback', 'usage', 'snapshots'] as const;
export type StoreName = (typeof STORES)[number];

const KEYS: Record<StoreName, string> = {
  kv: 'k', contracts: 'id', days: 'key', leaves: 'id', bulletins: 'id', journal: 'id', feedback: 'id', usage: 'id', snapshots: 'id',
};

export const MODE_KEY = 'pam-mode';

/** Magasins copiés dans le compte en ligne. « usage » (journal local) et « snapshots » restent sur le téléphone. */
export const SYNCED = ['kv', 'contracts', 'days', 'leaves', 'bulletins', 'journal', 'feedback'] as const;
export type SyncedStore = (typeof SYNCED)[number];

export function isSynced(store: string): store is SyncedStore {
  return (SYNCED as readonly string[]).includes(store);
}

export function keyOf(store: StoreName, value: unknown): string {
  return String((value as Record<string, unknown>)[KEYS[store]]);
}

/** Copie vers le compte en ligne, branchée par cloud.ts une fois la personne connectée. */
export interface Mirror {
  put(store: SyncedStore, key: string, value: unknown): void;
  del(store: SyncedStore, key: string): void;
  /** Contenu remplacé d'un bloc (restauration) : les anciennes clés absentes du nouveau contenu sont supprimées. */
  replaced(oldKeys: Map<SyncedStore, string[]>, d: Dump): void;
}
let mirror: Mirror | null = null;
export function setMirror(m: Mirror | null) { mirror = m; }

// ---------- Changements en attente d'envoi ----------
// Quand un compte est (ou a été) branché sur ce téléphone mais que la copie en direct ne tourne pas
// (démarrage, Firebase pas encore chargé, déconnexion), chaque clé modifiée est notée ici.
// La copie les envoie dès qu'elle reprend : aucun changement ne se perd.
export const OUTBOX_KEY = 'pam-cloud-outbox';
/** Repères localStorage qui disent qu'un compte est concerné par ce téléphone (voir cloud-state.ts) */
const ACCOUNT_KEYS = ['pam-cloud-linked', 'pam-cloud-pending', 'pam-cloud-last'];

function ls(): Storage | null {
  try { return localStorage; } catch { return null; }
}

function tracking(): boolean {
  const l = ls();
  return !!l && !isDemo() && ACCOUNT_KEYS.some((k) => !!l.getItem(k));
}

export function outboxRead(): Array<{ s: SyncedStore; k: string }> {
  try {
    const raw = JSON.parse(ls()?.getItem(OUTBOX_KEY) ?? '[]') as string[];
    return raw.map((x) => { const i = x.indexOf('|'); return { s: x.slice(0, i) as SyncedStore, k: x.slice(i + 1) }; });
  } catch { return []; }
}

function outboxAdd(entries: Array<{ s: SyncedStore; k: string }>) {
  const l = ls();
  if (!l || !entries.length) return;
  try {
    const cur = new Set(JSON.parse(l.getItem(OUTBOX_KEY) ?? '[]') as string[]);
    for (const e of entries) cur.add(`${e.s}|${e.k}`);
    l.setItem(OUTBOX_KEY, JSON.stringify([...cur]));
  } catch { /* stockage plein : la prochaine réunion complète rattrapera */ }
}

export function outboxClear() {
  try { ls()?.removeItem(OUTBOX_KEY); } catch { /* */ }
}

function noteChange(store: SyncedStore, key: string) {
  if (mirror) return;
  if (tracking()) outboxAdd([{ s: store, k: key }]);
}

/**
 * La démonstration ne dure que le temps de l'onglet (sessionStorage) : à la visite suivante,
 * on retombe sur l'accueil du site au lieu de la démo.
 */
export function isDemo(): boolean {
  try { return sessionStorage.getItem(MODE_KEY) === 'demo'; } catch { return false; }
}

export function setDemo(on: boolean) {
  try {
    if (on) sessionStorage.setItem(MODE_KEY, 'demo');
    else sessionStorage.removeItem(MODE_KEY);
  } catch { /* stockage indisponible */ }
  // Ancienne version : la démo était gardée d'une visite à l'autre (localStorage).
  try { localStorage.removeItem(MODE_KEY); } catch { /* */ }
}

/** Ancienne version : la démo restait mémorisée. On efface la marque et les enfants fictifs. Renvoie true si une trace existait. */
export async function clearLegacyDemo(): Promise<boolean> {
  let legacy = false;
  try { legacy = localStorage.getItem(MODE_KEY) === 'demo'; } catch { return false; }
  if (!legacy) return false;
  try { localStorage.removeItem(MODE_KEY); } catch { /* */ }
  if (!isDemo()) await deleteDatabase('pam-demo');
  return true;
}

export function dbName(): string {
  return isDemo() ? 'pam-demo' : 'pam-donnees';
}

let dbp: Promise<IDBDatabase> | null = null;

export function openDb(name = dbName()): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: KEYS[s] });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

export function closeDb() {
  dbp?.then((d) => d.close()).catch(() => {});
  dbp = null;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).getAll()) as Promise<T[]>;
}

export async function get<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>;
}

/** Écriture locale seule, sans copie en ligne (utilisée pour appliquer ce qui vient du compte). */
export async function putRaw(store: StoreName, value: unknown): Promise<void> {
  const db = await openDb();
  await wrap(db.transaction(store, 'readwrite').objectStore(store).put(value));
}

export async function delRaw(store: StoreName, key: string): Promise<void> {
  const db = await openDb();
  await wrap(db.transaction(store, 'readwrite').objectStore(store).delete(key));
}

export async function put(store: StoreName, value: unknown): Promise<void> {
  await putRaw(store, value);
  if (!isSynced(store)) return;
  if (mirror) mirror.put(store, keyOf(store, value), value);
  else noteChange(store, keyOf(store, value));
}

export async function del(store: StoreName, key: string): Promise<void> {
  await delRaw(store, key);
  if (!isSynced(store)) return;
  if (mirror) mirror.del(store, key);
  else noteChange(store, key);
}

export type Dump = Record<Exclude<StoreName, 'snapshots'>, unknown[]>;

export async function dumpAll(): Promise<Dump> {
  const out: Partial<Dump> = {};
  for (const s of STORES) if (s !== 'snapshots') (out as any)[s] = await getAll(s);
  return out as Dump;
}

/** Remplace tout le contenu (sauf les copies automatiques) en une seule transaction */
export async function replaceAll(d: Dump): Promise<void> {
  const db = await openDb();
  const names = STORES.filter((s) => s !== 'snapshots');
  const oldKeys = new Map<SyncedStore, string[]>();
  const track = !mirror && tracking();
  if (mirror || track) {
    for (const s of SYNCED) {
      oldKeys.set(s, (await wrap(db.transaction(s).objectStore(s).getAllKeys())).map(String));
    }
  }
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(names as unknown as string[], 'readwrite');
    for (const s of names) {
      const os = tx.objectStore(s);
      os.clear();
      for (const v of (d as any)[s] ?? []) os.put(v);
    }
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
  if (mirror) mirror.replaced(oldKeys, d);
  else if (track) {
    const all: Array<{ s: SyncedStore; k: string }> = [];
    for (const s of SYNCED) {
      for (const k of oldKeys.get(s) ?? []) all.push({ s, k });
      for (const v of (d[s] ?? []) as unknown[]) all.push({ s, k: keyOf(s, v) });
    }
    outboxAdd(all);
  }
}

export async function deleteDatabase(name: string): Promise<void> {
  closeDb();
  await new Promise<void>((res) => {
    const r = indexedDB.deleteDatabase(name);
    r.onsuccess = r.onerror = r.onblocked = () => res();
  });
}
