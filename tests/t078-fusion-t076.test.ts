// Intégration T-078 (22/11/2026) : fusion de t076-contrats (horaires variables, CDD) dans integration (T-074 préavis dispensé,
// T-077 Alsace-Moselle et Mayotte). Chaque tâche a vérifié son cas seule, aucune les deux ensemble (aucune situation du second
// moteur). Ces combinaisons restent refusées, comme avant la fusion (décision du DG du 22/11 : les restes restent refusés).
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

describe('Intégration T-078 : horaires variables ou CDD, en Alsace-Moselle ou à Mayotte', () => {
  it('horaires variables : calculés en métropole, refusés en Alsace-Moselle et à Mayotte', () => {
    expect(mois(pv(), '2026-02').nonGere).toEqual([]);
    expect(mois(pv({ alsaceMoselle: true }), '2026-02').nonGere).toContain(NON_GERE_REGION_PV_CDD);
    expect(mois(pv({ mayotte: true }), '2026-02').nonGere).toContain(NON_GERE_REGION_PV_CDD);
  });
  it('CDD : calculé en métropole, refusé en Alsace-Moselle et à Mayotte', () => {
    expect(mois(cdd(), '2026-02').nonGere).toEqual([]);
    expect(mois(cdd({ alsaceMoselle: true }), '2026-02').nonGere).toContain(NON_GERE_REGION_PV_CDD);
    const f = finDeContrat(makeCtx(cdd({ mayotte: true, end: '2026-04-30', rupture: { motif: 'fin_cdd', notif: '2026-04-30', finCdd: 'terme' } as Contract['rupture'] }), [], [], '2026-12-31'), '2026-04-30', 'fin_cdd');
    expect(f.nonGere).toContain(NON_GERE_REGION_PV_CDD);
  });
  it('CDI à horaires fixes en Alsace-Moselle : toujours calculé (T-077)', () => {
    expect(mois(contrat({ alsaceMoselle: true }), '2026-02').nonGere).toEqual([]);
  });
});

describe('Intégration T-078 : préavis dispensé par les parents d’un contrat à horaires variables', () => {
  // Retrait, lettre remise le 01/06/2026, dernier jour travaillé le 29/05, fin du préavis le 15/06 (moins d'un an : 15 jours).
  const rupture = { motif: 'retrait', notif: '2026-06-01', preavis: 'employeur', dernierJourTravaille: '2026-05-29' } as Contract['rupture'];
  it('mois du préavis refusés, mois d’avant calculés', () => {
    const c = pv({ end: '2026-06-15', rupture });
    expect(mois(c, '2026-06').nonGere).toContain(NON_GERE_PV_DISPENSE);
    expect(mois(c, '2026-05').nonGere).toContain(NON_GERE_PV_DISPENSE);
    expect(mois(c, '2026-04').nonGere).not.toContain(NON_GERE_PV_DISPENSE);
  });
  it('fin de contrat refusée, aucun montant', () => {
    const f = finDeContrat(makeCtx(pv(), [], [], '2026-12-31'), '2026-06-01', 'retrait', 0, undefined, { demandeur: 'employeur', dernierJourTravaille: '2026-05-29' });
    expect(f.nonGere).toContain(NON_GERE_PV_DISPENSE);
    expect(f.indemniteRupture).toBe(0);
  });
  it('même préavis dispensé, planning fixe : calculé (T-074)', () => {
    const f = finDeContrat(makeCtx(contrat(), [], [], '2026-12-31'), '2026-06-01', 'retrait', 0, undefined, { demandeur: 'employeur', dernierJourTravaille: '2026-05-29' });
    expect(f.nonGere ?? []).not.toContain(NON_GERE_PV_DISPENSE);
  });
});
