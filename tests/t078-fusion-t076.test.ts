// Intégration T-078 (22/11/2026) : fusion de t076-contrats (horaires variables, CDD) dans integration (T-074 préavis dispensé,
// T-077 Alsace-Moselle et Mayotte). T-104 (25/11/2026) : horaires variables et CDD en région calculés ; le préavis dispensé d'un
// contrat à horaires variables reste refusé (hors des quatre cas de la T-104).
import { describe, expect, it } from 'vitest';
import type { Contract, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { computeMonth } from '../src/engine/month';
import { finDeContrat } from '../src/engine/fin';
import { NON_GERE_PV_DISPENSE, NON_GERE_REGION_PV_CDD } from '../src/engine/nonGeres';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning { const p: Planning = {}; for (const d of days) p[d] = [{ start, end }]; return p; }
const A45 = week('08:00', '17:00');
const B20 = week('08:00', '13:00', [1, 2, 3, 4]);
function contrat(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2026-01-05', yearType: 'complete', weeks: 52, weeksOff: [],
    planning: A45, rateNet: 500, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0, kmTaux: 0,
    cpMode: 'juin', majoreFiscal: false, trackedFrom: '2026-01-05', balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 },
    history: [], createdAt: 0, alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false, ...over,
  } as Contract;
}
const pv = (over: Partial<Contract> = {}) => contrat({ planningVariable: true, cycle: [A45, B20], cycleAncre: '2026-01-05', heuresMensualisees: 140.83, ...over });
const cdd = (over: Partial<Contract> = {}) => contrat({ cdd: true, cddTerme: '2026-04-30', cddMotif: 'remplacement', ...over });
const mois = (c: Contract, m: string) => computeMonth(makeCtx(c, [], [], '2026-12-31'), m);

// T-104 : ces combinaisons sont calculées (règles locales lues jour par jour ; C. trav. L1521-1 pour le CDD à Mayotte).
describe('T-104 (remplace l’intégration T-078) : horaires variables ou CDD, en Alsace-Moselle ou à Mayotte, calculés', () => {
  it('horaires variables : calculés partout', () => {
    expect(mois(pv(), '2026-02').nonGere).toEqual([]);
    expect(mois(pv({ alsaceMoselle: true }), '2026-02').nonGere).toEqual([]);
    expect(mois(pv({ mayotte: true }), '2026-02').nonGere).toEqual([]);
    expect(mois(pv({ alsaceMoselle: true }), '2026-02').net).toBe(mois(pv(), '2026-02').net);
  });
  it('CDD : calculé partout, fin comprise', () => {
    expect(mois(cdd(), '2026-02').nonGere).toEqual([]);
    expect(mois(cdd({ alsaceMoselle: true }), '2026-02').nonGere).toEqual([]);
    const f = finDeContrat(makeCtx(cdd({ mayotte: true, end: '2026-04-30', rupture: { motif: 'fin_cdd', notif: '2026-04-30', finCdd: 'terme' } as Contract['rupture'] }), [], [], '2026-12-31'), '2026-04-30', 'fin_cdd');
    expect(f.nonGere ?? []).not.toContain(NON_GERE_REGION_PV_CDD);
    expect(f.ifcNet).toBeGreaterThan(0);
  });
  it('horaires variables en Alsace-Moselle, maladie de l’AM : salaire maintenu moins les indemnités journalières (L1226-23)', () => {
    const c = pv({ alsaceMoselle: true });
    const leaves = [{ id: 'm', type: 'am_malade' as const, from: '2026-02-09', to: '2026-02-10', ijSecu: 2000 }];
    const r = computeMonth(makeCtx(c, [], leaves, '2026-12-31'), '2026-02');
    expect(r.nonGere).toEqual([]);
    expect(r.ijDeduites).toBe(2000);
    expect(r.net).toBe(mois(pv(), '2026-02').net - 2000);
  });
  it('CDI à horaires fixes en Alsace-Moselle : toujours calculé (T-077)', () => {
    expect(mois(contrat({ alsaceMoselle: true }), '2026-02').nonGere).toEqual([]);
  });
});

describe('T-104 (remplace l’intégration T-078) : préavis dispensé par les parents d’un contrat à horaires variables, calculé', () => {
  // Retrait, lettre remise le 01/06/2026, dernier jour travaillé le 29/05, fin du préavis le 15/06 (moins d'un an : 15 jours).
  const rupture = { motif: 'retrait', notif: '2026-06-01', preavis: 'employeur', dernierJourTravaille: '2026-05-29' } as Contract['rupture'];
  it('mois du préavis calculés : juin, 15 jours, salaire au prorata de l’art. 111', () => {
    const c = pv({ end: '2026-06-15', rupture });
    expect(mois(c, '2026-05').nonGere).toEqual([]);
    // Cycle A 45 h / B 20 h ancré au 05/01/2026 : semaine du 01/06 = B (21 semaines après). Juin : B 20 h, A 45 h, B 20 h, A 45 h,
    // B 10 h (29 et 30) = 140 h ; du 01 au 15/06 : 20 + 45 + 5 = 70 h. 140,83 h × 5 € = 704,15 € × 70 ÷ 140 = 352,08 €.
    const juin = mois(c, '2026-06');
    expect(juin.nonGere).toEqual([]);
    expect(juin.net).toBe(35208);
  });
  it('fin de contrat : indemnité de préavis des jours dispensés 352,08 €, comprise dans le salaire de juin', () => {
    const f = finDeContrat(makeCtx(pv({ end: '2026-06-15', rupture }), [], [], '2026-12-31'), '2026-06-01', 'retrait', 0, undefined, { demandeur: 'employeur', dernierJourTravaille: '2026-05-29' });
    expect(f.nonGere ?? []).toEqual([]);
    expect(f.dispense?.net).toBe(35208);
  });
  it('même préavis dispensé, planning fixe : calculé (T-074)', () => {
    const f = finDeContrat(makeCtx(contrat(), [], [], '2026-12-31'), '2026-06-01', 'retrait', 0, undefined, { demandeur: 'employeur', dernierJourTravaille: '2026-05-29' });
    expect(f.nonGere ?? []).not.toContain(NON_GERE_PV_DISPENSE);
  });
});
