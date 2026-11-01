// Service en ligne de production : Firebase (projet arvela-app, base Firestore à Paris).
// Chargé à la demande : l'app démarre et marche sans ce module.
import { initializeApp } from 'firebase/app';
import {
  applyActionCode, browserLocalPersistence, confirmPasswordReset, createUserWithEmailAndPassword, deleteUser, EmailAuthProvider, indexedDBLocalPersistence,
  initializeAuth, onAuthStateChanged, reauthenticateWithCredential, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword,
  signOut, verifyPasswordResetCode,
} from 'firebase/auth';
import {
  collection, deleteDoc, doc, getDocsFromServer, setDoc, initializeFirestore, onSnapshot, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager,
  query, serverTimestamp, Timestamp, waitForPendingWrites, where, writeBatch, type DocumentData,
} from 'firebase/firestore';
import { firebaseConfig } from '../firebase-config';
import type { Backend, CloudUser, SharedDoc } from './backend';
import { docId, isSyncedStore, type RemoteDoc } from './plan';
import { deviceId } from '../cloud-state';

const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
auth.languageCode = 'fr';
// Cache persistant : les changements faits hors ligne sont gardés et envoyés au retour du réseau, même après fermeture.
// Page des parents : rien n'est gardé sur leur appareil (cache en mémoire seulement).
const pageParents = typeof location !== 'undefined' && location.hash.startsWith('#/p/');
const fs = initializeFirestore(app, { localCache: pageParents ? memoryLocalCache() : persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

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
    return onAuthStateChanged(auth, (u) => cb(u ? ({ uid: u.uid, email: u.email, verified: u.emailVerified } satisfies CloudUser) : null));
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
  async verifyResetCode(code) {
    return verifyPasswordResetCode(auth, code);
  },
  async confirmReset(code, password) {
    await confirmPasswordReset(auth, code, password);
  },
  async sendVerification() {
    if (auth.currentUser) await sendEmailVerification(auth.currentUser);
  },
  async refreshUser() {
    const u = auth.currentUser;
    if (!u) return null;
    await u.reload();
    return { uid: u.uid, email: u.email, verified: u.emailVerified };
  },
  async applyEmailCode(code) {
    await applyActionCode(auth, code);
  },
  async signOut() {
    await signOut(auth);
  },
  async deleteAccount(password) {
    const u = auth.currentUser;
    if (!u?.email) throw Object.assign(new Error('Pas de compte connecté'), { code: 'auth/no-current-user' });
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
    // Liens parents d'abord : ils deviennent inutilisables tout de suite.
    const liens = await getDocsFromServer(query(collection(fs, 'partages'), where('owner', '==', u.uid)));
    for (const d of liens.docs) await deleteDoc(d.ref);
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
      let maxT = 0;
      for (const ch of snap.docChanges()) {
        if (ch.type === 'removed') continue; // sorti de la requête, pas supprimé : les suppressions sont des pierres tombales
        if (ch.doc.metadata.hasPendingWrites) continue;
        const data = ch.doc.data();
        const r = toRemote(data);
        if (!r) continue;
        if (r.t > maxT) maxT = r.t;
        if (data.d === me) continue; // écho de ce téléphone
        docs.push(r);
      }
      cb(docs, { fromCache: snap.metadata.fromCache, maxT });
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

  async putShare(id, d) {
    const u = auth.currentUser;
    if (!u) throw Object.assign(new Error('Pas de compte connecté'), { code: 'auth/no-current-user' });
    // Comme les autres envois : gardé dans la file hors ligne, envoyé au retour du réseau.
    const p = setDoc(doc(fs, 'partages', id), { owner: u.uid, v: d.v, iv: d.iv, salt: d.salt, t: serverTimestamp() });
    p.catch((e) => console.warn('lien parent refusé', e));
    track(p);
  },
  async listShares() {
    const u = auth.currentUser;
    if (!u) return [];
    const snap = await getDocsFromServer(query(collection(fs, 'partages'), where('owner', '==', u.uid)));
    return snap.docs.map((d) => d.id);
  },
  async deleteShare(id) {
    await deleteDoc(doc(fs, 'partages', id));
  },
  watchShare(id, cb, onError) {
    return onSnapshot(doc(fs, 'partages', id), (snap) => {
      const data = snap.data();
      if (!data || typeof data.v !== 'string') { if (!snap.metadata.fromCache) cb(null); return; }
      const t = data.t instanceof Timestamp ? data.t.toMillis() : Date.now();
      cb({ v: data.v, iv: String(data.iv), salt: String(data.salt), t } satisfies SharedDoc);
    }, onError);
  },
};
