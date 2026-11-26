// Décision du DG du 21/11/2026 (« sans la raison ») : l'app n'enregistre pas la nature d'un événement familial. Contrôle
// qualité de la demande n° 52, point 7 (rapports/controle-maj-2026-11-21-PR52.md).
// T-104 : décision du DG du 22/11/2026, la raison des quatre absences protégées (maternité, paternité, congé supplémentaire de
// naissance, accident du travail ou maladie professionnelle) est enregistrée, car le calcul en a besoin ; elle ne part
// jamais vers les parents (lien, texte du mois). Les tests de l'ancienne forme « non_gere » sont remplacés en conséquence.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AmLeave, Contract, NatureEvenement } from '../src/engine/model';
import { absenceSaisie, normaliserAbsence, type AbsenceLue } from '../src/engine/absences';
import { dureeEvenement, NATURE_EVENEMENT_LABEL } from '../src/engine/evenements';
import { makeCtx } from '../src/engine/payroll';
import { computeMonth, declarationText } from '../src/engine/month';
import { buildSnapshot } from '../src/partage/snapshot';
import { forRemote } from '../src/sync/plan';

// Faux IndexedDB pour le chargement (store.load) : deux absences enregistrées avant la décision.
const enregistrees: Record<string, unknown[]> = {
  leaves: [
    { id: 'a1', type: 'evenement', from: '2026-10-05', to: '2026-10-09', nature: 'handicap_enfant' },
    { id: 'a2', type: 'maternite', from: '2026-03-02', to: '2026-06-19' },
    { id: 'a3', type: 'cp', from: '2026-08-03', to: '2026-08-08' },
  ],
};
const ecrites: Array<{ s: string; v: unknown }> = [];
vi.mock('../src/db', async (orig) => ({
  ...(await orig<typeof import('../src/db')>()),
  getAll: async (s: string) => structuredClone(enregistrees[s] ?? []),
  put: async (s: string, v: unknown) => { ecrites.push({ s, v }); },
}));

const NATURES = Object.keys(NATURE_EVENEMENT_LABEL) as NatureEvenement[];
const plage = [{ start: '08:00', end: '16:00' }];
const c: Contract = {
  id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2024-01-01', yearType: 'complete', weeks: 52, weeksOff: [],
  planning: { 1: plage, 2: plage, 3: plage, 4: plage, 5: plage }, rateNet: 500, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
  kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2024-01-01',
  balances: { cpRestants: 30, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0,
  alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
} as Contract;
const motsInterdits = [...NATURES, 'nature'];
const sansRaison = (v: unknown) => { const j = JSON.stringify(v); for (const m of motsInterdits) expect(j).not.toContain(`"${m}"`); };

describe('saisie : la nature d’un événement familial n’est pas enregistrée', () => {
  for (const n of NATURES) {
    it(`${n} : seuls « événement familial » et le nombre de jours sont gardés`, () => {
      const l = absenceSaisie('evenement', n, 'e', '2026-10-05', '2026-10-05')!;
      expect(Object.keys(l).sort()).toEqual(['from', 'id', 'joursEvenement', 'to', 'type']);
      expect(l.type).toBe('evenement');
      expect(l.joursEvenement).toBe(dureeEvenement(n, '2026-10-05') ?? 0);
      sansRaison(l);
    });
  }
  it('sans événement choisi : rien n’est enregistré', () => {
    expect(absenceSaisie('evenement', undefined, 'e', '2026-10-05', '2026-10-05')).toBeUndefined();
  });
});

describe('T-104 : saisie d’une absence protégée, raison gardée et mois calculé', () => {
  for (const t of ['maternite', 'paternite', 'naissance_supp'] as const) {
    it(`${t} : type et dates gardés, mois calculé (retenue de l’article 111)`, () => {
      const l = absenceSaisie(t, undefined, 'x', '2026-03-02', '2026-04-10')!;
      expect(l).toEqual({ id: 'x', type: t, from: '2026-03-02', to: '2026-04-10' });
      sansRaison(l);
      const ctx = makeCtx(c, [], [l], '2026-10-31');
      const mars = computeMonth(ctx, '2026-03');
      expect(mars.nonGere).toEqual([]);
      expect(mars.net).toBe(0);
      expect(computeMonth(ctx, '2026-04').nonGere).toEqual([]);
      expect(computeMonth(ctx, '2026-05').nonGere).toEqual([]);
    });
  }
});

describe('migration douce : saisies d’avant ramenées à la forme sans raison', () => {
  it('événement avec nature : nature retirée, jours et dates gardés (durée à la date de début)', () => {
    for (const n of NATURES) for (const from of ['2026-03-02', '2026-06-15', '2024-03-04', '2023-01-02']) {
      const avant: AbsenceLue = { id: 'e', type: 'evenement', from, to: '2026-12-31', nature: n };
      const apres = normaliserAbsence(avant);
      expect(apres).toEqual({ id: 'e', type: 'evenement', from, to: '2026-12-31', joursEvenement: dureeEvenement(n, from) ?? 0 });
      expect(normaliserAbsence(apres)).toBe(apres); // une seule fois
    }
  });
  it('T-104 : types d’avant gardés (maternité, paternité, naissance) ; « accident_travail » devient at_mp, nature à préciser', () => {
    for (const t of ['maternite', 'paternite', 'naissance_supp'] as const) {
      const l = { id: 'm', type: t, from: '2026-03-02', to: '2026-06-19' };
      expect(normaliserAbsence(l)).toEqual(l);
    }
    expect(normaliserAbsence({ id: 'm', type: 'accident_travail', from: '2026-03-02', to: '2026-06-19' })).toEqual({ id: 'm', type: 'at_mp', from: '2026-03-02', to: '2026-06-19' });
    const nonGere: AmLeave = { id: 'n', type: 'non_gere', from: '2026-03-02', to: '2026-06-19' };
    expect(normaliserAbsence(nonGere)).toBe(nonGere);
  });
  it('événement d’avant T-023 (sans nature) et autres absences : inchangés', () => {
    const sans: AmLeave = { id: 's', type: 'evenement', from: '2026-03-02', to: '2026-03-02' };
    const cp: AmLeave = { id: 'c', type: 'cp', from: '2026-08-03', to: '2026-08-08' };
    expect(normaliserAbsence(sans)).toBe(sans);
    expect(normaliserAbsence(cp)).toBe(cp);
  });
  it('chargement (store.load) : les absences lues sont ramenées et réécrites, rien n’est perdu', async () => {
    const store = await import('../src/store');
    await store.load();
    expect(store.state.leaves).toEqual([
      { id: 'a2', type: 'maternite', from: '2026-03-02', to: '2026-06-19' },
      { id: 'a3', type: 'cp', from: '2026-08-03', to: '2026-08-08' },
      { id: 'a1', type: 'evenement', from: '2026-10-05', to: '2026-10-09', joursEvenement: 10 },
    ]);
    // T-104 : le congé maternité d'avant est déjà à la bonne forme : seul l'événement est réécrit.
    expect(ecrites.map((e) => (e.v as AmLeave).id).sort()).toEqual(['a1']);
    expect(ecrites.every((e) => e.s === 'leaves')).toBe(true);
    sansRaison(store.state.leaves);
    sansRaison(ecrites);
  });
  it('envoi en ligne : une absence pas encore ramenée part sans sa raison', () => {
    sansRaison(forRemote('leaves', 'a1', { id: 'a1', type: 'evenement', from: '2026-10-05', to: '2026-10-05', nature: 'deces_proche' }));
    expect(forRemote('leaves', 'a2', { id: 'a2', type: 'accident_travail', from: '2026-10-05', to: '2026-10-05' })).toEqual({ id: 'a2', type: 'at_mp', from: '2026-10-05', to: '2026-10-05' });
  });
});

describe('paie identique : mêmes jours payés et mêmes montants qu’avant, pour chaque nature', () => {
  // Valeurs calculées par le commit 9a078a7 (absence enregistrée avec sa nature), sur le même contrat. T-103 (24/11/2026) :
  // recapturées (jours au-delà de la durée retenus au lieu de « à confirmer » ; férié non compté ; 2024 géré).
  // une absence de trois semaines, et deux saisies d'un jour à 3 jours d'écart (même événement), à quatre dates.
  const avant = JSON.parse(readFileSync(new URL('./fixtures/paie-evenements-avant-sans-raison.json', import.meta.url), 'utf8'));
  const plus3 = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 3 * 864e5).toISOString().slice(0, 10);
  const cas: [string, string, string][] = [['2026-10', '2026-10-05', '2026-10-23'], ['2026-03', '2026-03-02', '2026-03-20'], ['2024-03', '2024-03-04', '2024-03-22'], ['2026-11', '2026-11-02', '2026-11-20']];
  const saisie = (id: string, n: NatureEvenement, from: string, to: string) => absenceSaisie('evenement', n, id, from, to)!;
  const lire = (r: ReturnType<typeof computeMonth>) => ({ net: r.net, netTotal: r.netTotal, aConfirmer: 0, jours: r.joursActivite, retenue: r.retenue, joursEvt: 0 });
  for (const n of NATURES) {
    it(n, () => {
      for (const [m, from, to] of cas) {
        expect(lire(computeMonth(makeCtx(c, [], [saisie('e1', n, from, to)], '2026-12-31'), m))).toEqual(avant[`${n}|${from}`]);
        // Même événement saisi en deux fois : l'AM répond « oui » à « C'est la suite de l'absence du … ? ».
        const deux = [saisie('e1', n, from, from), { ...saisie('e2', n, plus3(from), plus3(from)), suiteDe: 'e1' }];
        expect(lire(computeMonth(makeCtx(c, [], deux, '2026-12-31'), m))).toEqual(avant[`${n}|${from}|deux`]);
      }
    });
  }
});

describe('lien des parents : aucun motif d’absence de l’AM', () => {
  it('événement familial plus long que sa durée (T-103 : jours en plus retenus) : ni « événement familial » ni nature, rien « à confirmer »', () => {
    const l = absenceSaisie('evenement', 'handicap_enfant', 'e', '2026-10-05', '2026-11-06')!;
    const snap = buildSnapshot({ ctx: makeCtx(c, [], [l], '2026-11-10'), journal: [], amName: 'Ana', enfants: 0, now: 1 });
    const oct = snap.mois.find((x) => x.month === '2026-10')!;
    expect(oct).toBeDefined();
    expect(JSON.stringify(snap)).not.toMatch(/à confirmer/);
    const texte = JSON.stringify(snap);
    expect(texte).not.toMatch(/[ée]v[ée]nement|handicap|mariage|décès|deces/i);
    expect(snap.jours.filter((j) => j.statut === 'am').length).toBeGreaterThan(0);
    expect(snap.jours.filter((j) => j.statut === 'am').every((j) => j.motif === 'Ana absente')).toBe(true);
    sansRaison(snap);
  });
  it('T-104 : congé maternité ou accident du travail : jours « absente », mois calculé, sans la raison', () => {
    for (const l of [absenceSaisie('maternite', undefined, 'm', '2026-10-05', '2026-11-06')!, { ...absenceSaisie('at_mp', undefined, 'm', '2026-10-05', '2026-11-06')!, atmp: 'accident' as const, jourAccident: true }]) {
    const snap = buildSnapshot({ ctx: makeCtx(c, [], [l], '2026-11-10'), journal: [], amName: 'Ana', enfants: 0, now: 1 });
    expect(snap.mois.find((x) => x.month === '2026-10')?.nonGere).toBeFalsy();
    expect(JSON.stringify(snap)).not.toMatch(/maternit|non gérée|accident|maladie|paternit|naissance/i);
    const ctx = makeCtx(c, [], [l], '2026-11-10');
    expect(declarationText(ctx, computeMonth(ctx, '2026-10'), 'Ana')).not.toMatch(/maternit|accident|maladie|paternit|naissance/i);
    expect(snap.jours.filter((j) => j.statut === 'am').length).toBeGreaterThan(0);
    expect(snap.jours.filter((j) => j.statut === 'am').every((j) => j.motif === 'Ana absente')).toBe(true);
    }
  });
  it('texte copié par l’AM pour les parents (écran Mois) : même formulation que le lien, sans « événement familial »', () => {
    const l = absenceSaisie('evenement', 'handicap_enfant', 'e', '2026-10-05', '2026-10-23')!;
    const ctx = makeCtx(c, [], [l], '2026-11-10');
    const r = computeMonth(ctx, '2026-10');
    expect(r.retenue).toBeGreaterThan(0);
    const t = declarationText(ctx, r, 'Ana');
    expect(t).not.toMatch(/à confirmer/);
    expect(t).not.toMatch(/[ée]v[ée]nement|handicap|mariage|décès/i);
  });
});
