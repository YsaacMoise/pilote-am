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
    waitOk: true,
    listenCb: null as null | ((docs: unknown[], meta: unknown) => void),
    refuseNext: false,
  };
  return s;
});

vi.mock('../src/sync/backend-firebase', () => ({
  backend: {
    durableQueue: true,
    onUser(cb: (u: unknown) => void) { fake.userCb = cb; return () => {}; },
    onPending(cb: (p: boolean) => void) { cb(false); return () => {}; },
    onRejected(cb: (code: string, docs: Array<{ s: string; k: string }>) => void) { fake.rejected = cb; return () => {}; },
    async write(_uid: string, docs: Array<{ s: string; k: string; v: string | null }>) {
      fake.writes.push(docs);
      if (fake.refuseNext) { fake.refuseNext = false; fake.rejected?.('permission-denied', docs.map((d) => ({ s: d.s, k: d.k }))); }
    },
    listen(_uid: string, _since: number, cb: (docs: unknown[], meta: unknown) => void) { fake.listenCb = cb; return () => {}; },
    async listShares() { return []; },
    async deleteShare() {},
    async putShare() {},
    async waitPending() { return fake.waitOk; },
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
    // C-101 : un seul événement par bandeau, sans le code d'erreur.
    const { state } = await import('../src/store');
    fake.rejected!('permission-denied', [{ s: 'contracts', k: 'c1' }]);
    expect(state.usage.filter((u) => u.ev === 'erreur_envoi_refuse')).toHaveLength(1);
    expect(state.usage.some((u) => /permission/.test(JSON.stringify(u)))).toBe(false);
    // Gardées dans la file d'attente du téléphone : rien n'est perdu.
    expect(db.outboxRead()).toEqual([{ s: 'contracts', k: 'c1' }, { s: 'days', k: 'c1|2026-11-02' }]);

    // « Réessayer » : le bandeau disparaît et les deux documents repartent.
    fake.writes = [];
    expect(await cloud.retryRejected()).toBe(true);
    expect(cloudInfo().refus).toBeUndefined();
    expect(db.outboxRead()).toEqual([]);
    expect(fake.writes.flat().map((d) => `${d.s}|${d.k}`).sort()).toEqual(['contracts|c1', 'days|c1|2026-11-02']);
  });

  it('relecture contradictoire : le bandeau reste si l’envoi repart sans réponse (hors ligne) ou est refusé à nouveau', async () => {
    const cloud = await import('../src/cloud');
    const { cloudInfo } = await import('../src/cloud-state');
    fake.rejected!('permission-denied', [{ s: 'contracts', k: 'c1' }]);
    fake.waitOk = false;
    expect(await cloud.retryRejected()).toBe(false);
    expect(cloudInfo().refus).toBeTruthy();
    fake.waitOk = true;
    // Hors ligne, les changements renvoyés attendent dans la file de Firestore ; ici on remet la clé pour le test.
    (await import('../src/db')).outboxKeep([{ s: 'contracts', k: 'c1' }]);
    fake.refuseNext = true;
    expect(await cloud.retryRejected()).toBe(false);
    expect(cloudInfo().refus).toBeTruthy();
    expect(await cloud.retryRejected()).toBe(true);
    expect(cloudInfo().refus).toBeUndefined();
  });

  it('relecture contradictoire : une version du serveur reçue après un refus n’écrase pas le changement du téléphone', async () => {
    const cloud = await import('../src/cloud');
    const db = await import('../src/db');
    const putRaw = db.putRaw as unknown as ReturnType<typeof vi.fn>;
    fake.rejected!('permission-denied', [{ s: 'contracts', k: 'c2' }]);
    putRaw.mockClear();
    // Firestore remet la version du serveur, vue par l'écoute.
    fake.listenCb!([{ s: 'contracts', k: 'c2', v: JSON.stringify({ id: 'c2', child: 'Ancienne' }), t: Date.now() }], { fromCache: false, maxT: Date.now() });
    await new Promise((r) => setTimeout(r, 20));
    expect(putRaw).not.toHaveBeenCalled();
    // Une fois le renvoi confirmé, les versions du serveur sont de nouveau rangées.
    fake.waitOk = true;
    expect(await cloud.retryRejected()).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    fake.listenCb!([{ s: 'contracts', k: 'c2', v: JSON.stringify({ id: 'c2', child: 'Nouvelle' }), t: Date.now() + 1 }], { fromCache: false, maxT: Date.now() + 1 });
    await new Promise((r) => setTimeout(r, 20));
    expect(putRaw).toHaveBeenCalled();
  });
});
