// Service en ligne de production : Firebase (projet arvela-app, base Firestore à Paris).
// Chargé à la demande : l'app démarre et marche sans ce module.
import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence, createUserWithEmailAndPassword, deleteUser, EmailAuthProvider, indexedDBLocalPersistence,
  initializeAuth, onAuthStateChanged, reauthenticateWithCredential, sendPasswordResetEmail, signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  collection, doc, getDocsFromServer, initializeFirestore, onSnapshot, persistentLocalCache, persistentMultipleTabManager,
  query, serverTimestamp, Timestamp, waitForPendingWrites, where, writeBatch, type DocumentData,
} from 'firebase/firestore';
import { firebaseConfig } from '../firebase-config';
import type { Backend, CloudUser } from './backend';
import { docId, isSyncedStore, type RemoteDoc } from './plan';
import { deviceId } from '../cloud-state';

const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
auth.languageCode = 'fr';
// Cache persistant : les changements faits hors ligne sont gardés et envoyés au retour du réseau, même après fermeture.
const fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

const BATCH = 400;

// Envois en cours : la requête écoutée ne voit pas les écritures non confirmées, on les compte nous-mêmes.
let inflight = 0;
const pendSubs = new Set<(p: boolean) => void>();
function track(p: Promise<unknown>) {
  inflight++;
  pendSubs.forEach((f) => f(true));
  p.catch(() => {}).finally(() => {
    inflight--;
    if (!inflight) pendSubs.forEach((f) => f(false));
  });
}
// Au démarrage, des changements d'une session précédente peuvent attendre encore le réseau.
track(waitForPendingWrites(fs));

function toRemote(data: DocumentData): RemoteDoc | null {
  if (!isSyncedStore(data.s) || typeof data.k !== 'string') return null;
  const t = data.t instanceof Timestamp ? data.t.toMillis() : 0;
  return { s: data.s, k: data.k, v: typeof data.v === 'string' ? data.v : null, t };
}

function col(uid: string) {
  return collection(fs, 'users', uid, 'data');
}

export const backend: Backend = {
  durableQueue: true,

  onUser(cb) {
    return onAuthStateChanged(auth, (u) => cb(u ? ({ uid: u.uid, email: u.email } satisfies CloudUser) : null));
  },
  async createAccount(email, password) {
    await createUserWithEmailAndPassword(auth, email, password);
  },
  async signIn(email, password) {
    await signInWithEmailAndPassword(auth, email, password);
  },
  async resetPassword(email) {
    await sendPasswordResetEmail(auth, email);
  },
  async signOut() {
    await signOut(auth);
  },
  async deleteAccount(password) {
    const u = auth.currentUser;
    if (!u?.email) throw Object.assign(new Error('Pas de compte connecté'), { code: 'auth/no-current-user' });
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
    const snap = await getDocsFromServer(col(u.uid));
    for (let i = 0; i < snap.docs.length; i += BATCH) {
      const b = writeBatch(fs);
      for (const d of snap.docs.slice(i, i + BATCH)) b.delete(d.ref);
      await b.commit();
    }
    await deleteUser(u);
  },

  async fetchAll(uid) {
    const snap = await getDocsFromServer(col(uid));
    return snap.docs.map((d) => toRemote(d.data())).filter((x): x is RemoteDoc => !!x);
  },
  async write(uid, docs) {
    const me = deviceId();
    for (let i = 0; i < docs.length; i += BATCH) {
      const b = writeBatch(fs);
      for (const d of docs.slice(i, i + BATCH)) {
        b.set(doc(col(uid), docId(d.s, d.k)), { s: d.s, k: d.k, v: d.v, t: serverTimestamp(), d: me });
      }
      // Hors ligne, la promesse n'aboutit qu'au retour du réseau : on ne l'attend pas, la file est gardée par Firestore.
      const p = b.commit();
      p.catch((e) => console.warn('envoi refusé', e));
      track(p);
    }
  },
  listen(uid, since, cb, onError) {
    const me = deviceId();
    const q = query(col(uid), where('t', '>', Timestamp.fromMillis(since)));
    return onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      const docs: RemoteDoc[] = [];
      for (const ch of snap.docChanges()) {
        if (ch.type === 'removed') continue; // sorti de la requête, pas supprimé : les suppressions sont des pierres tombales
        if (ch.doc.metadata.hasPendingWrites) continue;
        const data = ch.doc.data();
        if (data.d === me) continue; // écho de ce téléphone
        const r = toRemote(data);
        if (r) docs.push(r);
      }
      cb(docs, { fromCache: snap.metadata.fromCache });
    }, onError);
  },
  onPending(cb) {
    pendSubs.add(cb);
    cb(inflight > 0);
    return () => { pendSubs.delete(cb); };
  },
  async waitPending(timeoutMs) {
    return Promise.race([
      waitForPendingWrites(fs).then(() => true),
      new Promise<boolean>((res) => setTimeout(() => res(false), timeoutMs)),
    ]);
  },
};
