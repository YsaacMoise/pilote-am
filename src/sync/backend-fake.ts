// Faux service en ligne pour les tests automatisés (scripts/fake-cloud.mjs).
// N'est inclus que si le site est construit avec VITE_FAKE_CLOUD : jamais dans le site publié.
import type { Backend, CloudUser } from './backend';
import type { RemoteDoc } from './plan';
import { deviceId } from '../cloud-state';

const BASE = String(import.meta.env.VITE_FAKE_CLOUD);
const USER_KEY = 'pam-fake-user';

function err(code: string): Error {
  return Object.assign(new Error(code), { code });
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(BASE + path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw err('auth/network-request-failed');
  }
  const j = await r.json();
  if (!r.ok) throw err(j.code ?? 'unknown');
  return j as T;
}

let current: CloudUser | null = (() => {
  try { return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null'); } catch { return null; }
})();
const userSubs = new Set<(u: CloudUser | null) => void>();
function setUser(u: CloudUser | null) {
  current = u;
  localStorage.setItem(USER_KEY, JSON.stringify(u));
  userSubs.forEach((f) => f(u));
}

// File d'envoi gardée dans localStorage : elle survit à la fermeture, comme celle de Firestore.
const Q_KEY = 'pam-fake-queue';
type Item = { uid: string; docs: Array<Omit<RemoteDoc, 't'>> };
function readQ(): Item[] { try { return JSON.parse(localStorage.getItem(Q_KEY) ?? '[]'); } catch { return []; } }
function writeQ(q: Item[]) { localStorage.setItem(Q_KEY, JSON.stringify(q)); pendSubs.forEach((f) => f(q.length > 0)); }
const pendSubs = new Set<(p: boolean) => void>();
let flushing = false;
async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    let q = readQ();
    while (q.length) {
      await call('/write', { ...q[0], d: deviceId() });
      q = readQ().slice(1);
      writeQ(q);
    }
  } catch { /* hors ligne : on réessaiera */ } finally { flushing = false; }
}
setInterval(() => { void flush(); }, 1000);

export const backend: Backend = {
  durableQueue: true,
  onUser(cb) {
    userSubs.add(cb);
    setTimeout(() => cb(current), 0);
    return () => { userSubs.delete(cb); };
  },
  async createAccount(email, password) {
    if (password.length < 8) throw err('auth/weak-password');
    const r = await call<{ uid: string }>('/create', { email, password });
    setUser({ uid: r.uid, email });
  },
  async signIn(email, password) {
    const r = await call<{ uid: string }>('/signin', { email, password });
    setUser({ uid: r.uid, email });
  },
  async resetPassword(email) { await call('/reset', { email }); },
  async verifyResetCode(code) { return (await call<{ email: string }>('/verify-reset', { code })).email; },
  async confirmReset(code, password) {
    if (password.length < 8) throw err('auth/weak-password');
    await call('/confirm-reset', { code, password });
  },
  async signOut() { setUser(null); },
  async deleteAccount(password) {
    if (!current) throw err('auth/no-current-user');
    await call('/delete', { email: current.email, password });
    setUser(null);
  },
  async fetchAll(uid) {
    return (await call<{ docs: RemoteDoc[] }>(`/docs?uid=${uid}&since=-1`)).docs;
  },
  async write(uid, docs) {
    writeQ([...readQ(), { uid, docs }]);
    void flush();
  },
  listen(uid, since, cb, onError) {
    let s = since;
    let stop = false;
    const me = deviceId();
    const tick = async () => {
      if (stop) return;
      try {
        const r = await call<{ docs: Array<RemoteDoc & { d: string }> }>(`/docs?uid=${uid}&since=${s}`);
        for (const d of r.docs) if (d.t > s) s = d.t;
        cb(r.docs.filter((d) => d.d !== me), { fromCache: false, maxT: s });
      } catch (e) {
        if ((e as { code?: string }).code === 'permission-denied') onError(e);
        else cb([], { fromCache: true, maxT: 0 });
      }
      if (!stop) setTimeout(tick, 700);
    };
    void tick();
    return () => { stop = true; };
  },
  onPending(cb) {
    pendSubs.add(cb);
    cb(readQ().length > 0);
    return () => { pendSubs.delete(cb); };
  },
  async waitPending(timeoutMs) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      await flush();
      if (!readQ().length) return true;
      await new Promise((r) => setTimeout(r, 200));
    }
    return !readQ().length;
  },
};
