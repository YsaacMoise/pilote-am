// Audit C-023 : une écriture refusée par le serveur ne doit plus être perdue en silence.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { messageRefus, statusLine, type CloudInfo } from '../src/cloud-state';

function memoire() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

// Faux service en ligne : on déclenche nous-mêmes le refus du serveur.
const fake = vi.hoisted(() => {
  const s = {
    rejected: null as null | ((code: string, docs: Array<{ s: string; k: string }>) => void),
    userCb: null as null | ((u: unknown) => void),
    writes: [] as Array<Array<{ s: string; k: string; v: string | null }>>,
  };
  return s;
});

vi.mock('../src/sync/backend-firebase', () => ({
  backend: {
    durableQueue: true,
    onUser(cb: (u: unknown) => void) { fake.userCb = cb; return () => {}; },
    onPending(cb: (p: boolean) => void) { cb(false); return () => {}; },
    onRejected(cb: (code: string, docs: Array<{ s: string; k: string }>) => void) { fake.rejected = cb; return () => {}; },
    async write(_uid: string, docs: Array<{ s: string; k: string; v: string | null }>) { fake.writes.push(docs); },
    listen() { return () => {}; },
    async listShares() { return []; },
    async deleteShare() {},
    async putShare() {},
    async waitPending() { return true; },
    async signOut() {},
  },
}));

vi.mock('../src/db', async (orig) => {
  const real = await orig<typeof import('../src/db')>();
  return { ...real, get: vi.fn(async () => ({ id: 'c1', child: 'Léa' })), getAll: vi.fn(async () => []), put: vi.fn(async () => {}), putRaw: vi.fn(async () => {}) };
});

beforeEach(() => {
  vi.stubGlobal('localStorage', memoire());
  vi.stubGlobal('sessionStorage', memoire());
  vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
});

describe('audit C-023 : envoi refusé par le serveur', () => {
  it('message du bandeau : dit que les changements restent sur le téléphone, et quoi faire', () => {
    expect(messageRefus('permission-denied')).toMatch(/restent sur ce téléphone.*déconnecte-toi puis reconnecte-toi/);
    expect(messageRefus('resource-exhausted')).toMatch(/saturé/);
    expect(messageRefus('invalid-argument')).toMatch(/Ça coince/);
  });

  it('un refus passe avant « À jour » dans l’état du compte', () => {
    const c: CloudInfo = { status: 'synced', email: 'a@example.com', refus: messageRefus('permission-denied') };
    expect(statusLine(c)).toMatch(/refusé/);
    expect(statusLine({ ...c, refus: undefined })).toMatch(/À jour/);
  });

  it('le refus est remonté dans l’état du compte, les clés sont gardées et renvoyées au nouvel essai', async () => {
    localStorage.setItem('pam-cloud-linked', 'u1');
    const cloud = await import('../src/cloud');
    const { cloudInfo } = await import('../src/cloud-state');
    const db = await import('../src/db');
    await cloud.startCloud();
    fake.userCb!({ uid: 'u1', email: 'a@example.com', verified: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.rejected).toBeTypeOf('function');

    fake.rejected!('permission-denied', [{ s: 'contracts', k: 'c1' }, { s: 'days', k: 'c1|2026-11-02' }]);
    expect(cloudInfo().refus).toMatch(/pas copiés dans ton compte/);
    // Gardées dans la file d'attente du téléphone : rien n'est perdu.
    expect(db.outboxRead()).toEqual([{ s: 'contracts', k: 'c1' }, { s: 'days', k: 'c1|2026-11-02' }]);

    // « Réessayer » : le bandeau disparaît et les deux documents repartent.
    fake.writes = [];
    cloud.retryRejected();
    await new Promise((r) => setTimeout(r, 10));
    expect(cloudInfo().refus).toBeUndefined();
    expect(db.outboxRead()).toEqual([]);
    expect(fake.writes.flat().map((d) => `${d.s}|${d.k}`).sort()).toEqual(['contracts|c1', 'days|c1|2026-11-02']);
  });
});
