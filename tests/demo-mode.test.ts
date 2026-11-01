import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLegacyDemo, isDemo, MODE_KEY, setDemo } from '../src/db';

// Stockages et base du navigateur simulés : les tests tournent sans navigateur.
function memoire() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
  };
}

let local: ReturnType<typeof memoire>;
let session: ReturnType<typeof memoire>;
let basesEffacees: string[];

beforeEach(() => {
  local = memoire();
  session = memoire();
  basesEffacees = [];
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', session);
  vi.stubGlobal('indexedDB', {
    deleteDatabase: (name: string) => {
      basesEffacees.push(name);
      const req: { onsuccess?: () => void; onerror?: () => void; onblocked?: () => void } = {};
      setTimeout(() => req.onsuccess?.(), 0);
      return req;
    },
  });
});

describe('démonstration limitée à la visite en cours', () => {
  it('la démo est notée pour l’onglet seulement, jamais de façon durable', () => {
    setDemo(true);
    expect(isDemo()).toBe(true);
    expect(session.getItem(MODE_KEY)).toBe('demo');
    expect(local.getItem(MODE_KEY)).toBeNull();
  });

  it('nouvelle visite (onglet neuf) : on retombe sur l’accueil', () => {
    setDemo(true);
    session.clear(); // fermeture de l'onglet ou de l'app
    expect(isDemo()).toBe(false);
  });

  it('quitter la démonstration la coupe', () => {
    setDemo(true);
    setDemo(false);
    expect(isDemo()).toBe(false);
  });

  it('ancienne version : la marque durable est effacée avec les enfants fictifs', async () => {
    local.setItem(MODE_KEY, 'demo');
    expect(await clearLegacyDemo()).toBe(true);
    expect(local.getItem(MODE_KEY)).toBeNull();
    expect(isDemo()).toBe(false);
    expect(basesEffacees).toEqual(['pam-demo']);
  });

  it('ancienne marque mais démo en cours dans cet onglet : la démo continue', async () => {
    local.setItem(MODE_KEY, 'demo');
    setDemo(true); // efface aussi l'ancienne marque
    expect(await clearLegacyDemo()).toBe(false);
    expect(isDemo()).toBe(true);
    expect(basesEffacees).toEqual([]);
  });

  it('aucune trace : rien n’est touché', async () => {
    expect(await clearLegacyDemo()).toBe(false);
    expect(basesEffacees).toEqual([]);
  });
});
