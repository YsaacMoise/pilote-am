/**
 * Stockage local sur le téléphone (IndexedDB).
 *
 * Tout l'état de l'application tient dans un seul document JSON, écrit d'un bloc :
 * une écriture réussit entièrement ou pas du tout. Une copie de sécurité est gardée
 * chaque jour (les 14 derniers jours), pour pouvoir revenir en arrière après une erreur.
 */

const DB_NAME = 'pilote-am';
const DB_VERSION = 1;
const STATE_STORE = 'state';
const SNAPSHOT_STORE = 'snapshots';
const MAIN_KEY = 'main';
const KEEP_SNAPSHOTS = 14;

export interface Snapshot {
  day: string;
  savedAt: string;
  json: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE);
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'day' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Ouverture du stockage impossible'));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Écriture impossible'));
    tx.onabort = () => reject(tx.error ?? new Error('Écriture annulée'));
  });
}

export async function loadStateJson(): Promise<string | null> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STATE_STORE, 'readonly');
    const req = tx.objectStore(STATE_STORE).get(MAIN_KEY);
    req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
    req.onerror = () => reject(req.error ?? new Error('Lecture impossible'));
  });
}

export async function saveStateJson(json: string, today: string): Promise<void> {
  const database = await db();
  const tx = database.transaction([STATE_STORE, SNAPSHOT_STORE], 'readwrite');
  tx.objectStore(STATE_STORE).put(json, MAIN_KEY);
  const snapshot: Snapshot = { day: today, savedAt: new Date().toISOString(), json };
  tx.objectStore(SNAPSHOT_STORE).put(snapshot);
  await done(tx);
  await pruneSnapshots();
}

async function pruneSnapshots(): Promise<void> {
  const database = await db();
  const tx = database.transaction(SNAPSHOT_STORE, 'readwrite');
  const store = tx.objectStore(SNAPSHOT_STORE);
  const keysReq = store.getAllKeys();
  keysReq.onsuccess = () => {
    const keys = (keysReq.result as IDBValidKey[]).map(String).sort();
    const excess = keys.length - KEEP_SNAPSHOTS;
    for (let i = 0; i < excess; i++) {
      const key = keys[i];
      if (key !== undefined) store.delete(key);
    }
  };
  await done(tx);
}

export async function listSnapshots(): Promise<Snapshot[]> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(SNAPSHOT_STORE, 'readonly');
    const req = tx.objectStore(SNAPSHOT_STORE).getAll();
    req.onsuccess = () => resolve((req.result as Snapshot[]).sort((a, b) => (a.day < b.day ? 1 : -1)));
    req.onerror = () => reject(req.error ?? new Error('Lecture impossible'));
  });
}

/** Demande au navigateur de ne pas effacer les données. Retourne l'état obtenu. */
export async function requestPersistence(): Promise<'persistent' | 'best-effort' | 'unsupported'> {
  if (!('storage' in navigator) || typeof navigator.storage.persist !== 'function') return 'unsupported';
  try {
    if (await navigator.storage.persisted()) return 'persistent';
    return (await navigator.storage.persist()) ? 'persistent' : 'best-effort';
  } catch {
    return 'best-effort';
  }
}

/** Vrai quand le site tourne depuis l'icône de l'écran d'accueil. */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
}
