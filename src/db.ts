// IndexedDB minimaliste. Tous les noms sont préfixés « cc- » (origine partagée avec l'autre version).

export const STORES = ['kv', 'contracts', 'days', 'leaves', 'bulletins', 'journal', 'feedback', 'usage', 'snapshots'] as const;
export type StoreName = (typeof STORES)[number];

const KEYS: Record<StoreName, string> = {
  kv: 'k', contracts: 'id', days: 'key', leaves: 'id', bulletins: 'id', journal: 'id', feedback: 'id', usage: 'id', snapshots: 'id',
};

export const MODE_KEY = 'pam-mode';

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

export async function put(store: StoreName, value: unknown): Promise<void> {
  const db = await openDb();
  await wrap(db.transaction(store, 'readwrite').objectStore(store).put(value));
}

export async function del(store: StoreName, key: string): Promise<void> {
  const db = await openDb();
  await wrap(db.transaction(store, 'readwrite').objectStore(store).delete(key));
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
}

export async function deleteDatabase(name: string): Promise<void> {
  closeDb();
  await new Promise<void>((res) => {
    const r = indexedDB.deleteDatabase(name);
    r.onsuccess = r.onerror = r.onblocked = () => res();
  });
}
