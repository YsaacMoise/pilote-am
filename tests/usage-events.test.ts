// Audit C-101 : événements qui disent où l'utilisatrice se trompe — un nom fixe, jamais de texte saisi.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ecranDe, evAnnulation, evCorrection, evErreur, heureCorrigee } from '../src/usage-events';

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

beforeEach(() => {
  vi.stubGlobal('localStorage', memoire());
  vi.stubGlobal('sessionStorage', memoire());
});

describe('audit C-101 : correction d’heure', () => {
  it('une heure pointée puis changée ou effacée est une correction', () => {
    expect(heureCorrigee([{ a: '08:05' }], [{ a: '07:55' }])).toBe(true);
    expect(heureCorrigee([{ a: '08:05', d: '17:10' }], [{ a: '08:05', d: '16:50' }])).toBe(true);
    expect(heureCorrigee([{ a: '08:05' }], undefined)).toBe(true);
  });
  it('ajouter un départ oublié ou ne rien changer n’est pas une correction', () => {
    expect(heureCorrigee([{ a: '08:05' }], [{ a: '08:05', d: '17:00' }])).toBe(false);
    expect(heureCorrigee(undefined, [{ a: '08:00', d: '17:00' }])).toBe(false);
    expect(heureCorrigee([{ a: '08:05', d: '17:10' }], [{ a: '08:05', d: '17:10' }])).toBe(false);
  });
  it('jour même ou après coup', () => {
    expect(evCorrection('2026-11-02', '2026-11-02')).toBe('heure_corrigee');
    expect(evCorrection('2026-10-30', '2026-11-02')).toBe('heure_corrigee_apres_coup');
  });
  it('annulation après un pointage', () => {
    expect(evAnnulation(true)).toBe('annulation_arrivee');
    expect(evAnnulation(false)).toBe('annulation_depart');
  });
});

describe('audit C-101 : erreur affichée', () => {
  it('nom d’événement fixe et écran sans identifiant de contrat', () => {
    expect(evErreur('saisie')).toBe('erreur_saisie');
    expect(ecranDe('#/contrat/8f3a2c?x=1')).toBe('contrat');
    expect(ecranDe('')).toBe('aujourdhui');
  });
  it('logErreur note le nom et l’écran, jamais le message ni la saisie', async () => {
    vi.stubGlobal('location', { hash: '#/avenant/c-123/a-456' });
    const { logErreur, state } = await import('../src/store');
    const avant = state.usage.length;
    logErreur('avenant_incomplet');
    const u = state.usage.slice(avant);
    expect(u).toHaveLength(1);
    expect(u[0].ev).toBe('erreur_avenant_incomplet');
    expect(u[0].screen).toBe('avenant');
    expect(JSON.stringify(u[0])).not.toMatch(/c-123|a-456/);
  });
  it('après un refus, la mesure ne laisse partir aucun de ces événements', async () => {
    const { posthogOptions } = await import('../src/analytics');
    const before_send = posthogOptions().before_send;
    localStorage.setItem('pam-mesure-refus', '1');
    for (const ev of ['erreur_saisie', 'annulation_arrivee', 'heure_corrigee_apres_coup']) {
      expect(before_send({ event: ev, properties: { ecran: 'aujourdhui' } })).toBeNull();
    }
    localStorage.removeItem('pam-mesure-refus');
    expect(before_send({ event: 'erreur_saisie', properties: { ecran: 'contrat' } })?.event).toBe('erreur_saisie');
  });
});

describe('audit C-101, relecture contradictoire', () => {
  it('heures du formulaire égales au planning, arrivée pointée à l’heure : pas de correction', () => {
    // Arrivée pointée à 08:00, départ pas encore pointé ; le formulaire montre 08:00–17:00 (planning).
    expect(heureCorrigee([{ a: '08:00' }], [{ a: '08:00', d: '17:00' }])).toBe(false);
  });
  it('deux plages, seule celle de l’après-midi pointée, matin vidé : pas de correction', () => {
    expect(heureCorrigee([{}, { a: '13:30' }], [{ a: '', d: '' }, { a: '13:30', d: '17:00' }])).toBe(false);
  });
  it('absence posée sur une journée pointée : correction', () => {
    expect(heureCorrigee([{ a: '08:05' }], [])).toBe(true);
  });
});
