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

export function isDemo(): boolean {
  try { return localStorage.getItem(MODE_KEY) === 'demo'; } catch { return false; }
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
  if (mirror && isSynced(store)) mirror.put(store, keyOf(store, value), value);
}

export async function del(store: StoreName, key: string): Promise<void> {
  await delRaw(store, key);
  if (mirror && isSynced(store)) mirror.del(store, key);
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
  if (mirror) {
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
}

export async function deleteDatabase(name: string): Promise<void> {
  closeDb();
  await new Promise<void>((res) => {
    const r = indexedDB.deleteDatabase(name);
    r.onsuccess = r.onerror = r.onblocked = () => res();
  });
}
