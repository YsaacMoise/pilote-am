// T-104, cas 3 et 4 : avenant d'un contrat à horaires variables, CDD à horaires variables
// (regles/t104-horaires-variables.md dans calculateur-arvela). Attendus calculés à la main, en commentaire.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Contract, Planning } from '../src/engine/model';
import { makeCtx, monthBase } from '../src/engine/payroll';
import { computeMonth } from '../src/engine/month';
import { finDeCdd } from '../src/engine/fin';
import { cpForMonth, indemnite } from '../src/engine/conges';
import { nonGeresContrat } from '../src/engine/nonGeres';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}
const A45 = week('08:00', '17:00'); // 45 h
const B20 = week('08:00', '13:00', [1, 2, 3, 4]); // 20 h
const B25 = week('08:00', '13:00'); // 25 h
const base = (over: Partial<Contract> = {}): Contract => ({
  id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2026-01-05', yearType: 'complete', weeks: 52, weeksOff: [],
  planning: A45, rateNet: 400, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0, kmTaux: 0, cpMode: 'juin',
  majoreFiscal: false, trackedFrom: '2026-01-05', balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [],
  createdAt: 0, alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false, departement: '31', ...over,
} as Contract);
// Cycle A 45 h / B 20 h ancré au lundi 05/01/2026, 140,83 h payées par mois, 4,00 € net de l'heure : 563,32 €.
const pv = (over: Partial<Contract> = {}) => base({ planningVariable: true, pvForme: 'cycle', cycle: [A45, B20], cycleAncre: '2026-01-05', heuresMensualisees: 140.83, ...over });
const T = '2026-12-31';

describe('Cas 3 : avenant d’un contrat à horaires variables', () => {
  it('avenant au 01/04/2026 : cycle 25 h / 25 h et 108,33 h par mois ; mars 563,32 €, avril 433,32 €', () => {
    const c = pv({ avenants: [{ id: 'a', from: '2026-04-01', changes: { cycle: [B25, B25], heuresMensualisees: 108.33 } }] });
    expect(nonGeresContrat(c)).toEqual([]);
    const ctx = makeCtx(c, [], [], T);
    expect(computeMonth(ctx, '2026-03').net).toBe(56332);
    // 108,33 h × 4,00 € = 433,32 € ; 25 h par semaine × 52 ÷ 12 = 108,33 h : lecture L1, aucune heure complémentaire.
    const avril = computeMonth(ctx, '2026-04');
    expect(avril.nonGere).toEqual([]);
    expect(avril.net).toBe(43332);
    expect(avril.complMin).toBe(0);
  });
  it('avenant qui revient à un planning fixe de 25 h au 01/05/2026 : 25 h × 4 € × 52 ÷ 12 = 433,33 €', () => {
    const c = pv({ avenants: [{ id: 'a', from: '2026-05-01', changes: { planningVariable: false, planning: B25 } }] });
    expect(nonGeresContrat(c)).toEqual([]);
    expect(computeMonth(makeCtx(c, [], [], T), '2026-05').net).toBe(43333);
    expect(computeMonth(makeCtx(c, [], [], T), '2026-04').net).toBe(56332);
  });
  it('avenant qui passe d’un planning fixe de 25 h aux horaires variables au 01/04/2026 : avril 563,32 €', () => {
    const c = base({ planning: B25, avenants: [{ id: 'a', from: '2026-04-01', changes: { planningVariable: true, pvForme: 'cycle', cycle: [A45, B20], cycleAncre: '2026-04-06', heuresMensualisees: 140.83 } }] });
    expect(nonGeresContrat(c)).toEqual([]);
    expect(computeMonth(makeCtx(c, [], [], T), '2026-03').net).toBe(43333);
    expect(computeMonth(makeCtx(c, [], [], T), '2026-04').net).toBe(56332);
  });
  it('données qui manquent à l’avenant : demandées une fois (planning fixe sans planning ; cycle sans semaine de départ)', () => {
    expect(nonGeresContrat(pv({ avenants: [{ id: 'a', from: '2026-05-01', changes: { planningVariable: false } }] })).join(' ')).toMatch(/Avenant du 01\/05\/2026 : le planning redevient le même chaque semaine/);
    const sansAncre = base({ planning: B25, avenants: [{ id: 'a', from: '2026-04-01', changes: { planningVariable: true, pvForme: 'cycle', cycle: [A45, B20], heuresMensualisees: 140.83 } }] });
    expect(nonGeresContrat(sansAncre).join(' ')).toMatch(/Avenant du 01\/04\/2026, horaires qui changent : il manque la date d’une semaine/);
  });
  it('planning remis : avenant au 01/04/2026 qui passe de 130 h à 117 h par mois ; semaine sans planning demandée', () => {
    const plans: Record<string, Planning> = {};
    for (const l of ['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23', '2026-03-30', '2026-04-06', '2026-04-13', '2026-04-20', '2026-04-27']) plans[l] = B25;
    const c = base({ start: '2026-03-02', trackedFrom: '2026-03-02', planning: B25, planningVariable: true, pvForme: 'remis', planningsSemaines: plans, heuresMensualisees: 130,
      avenants: [{ id: 'a', from: '2026-04-01', changes: { heuresMensualisees: 117 } }] });
    const ctx = makeCtx(c, [], [], T);
    // 130 h × 4 € = 520 € ; puis 117 h × 4 € = 468 €. Plannings remis de 25 h, sous la durée du contrat (117 × 12 ÷ 52 = 27 h) :
    // aucune heure complémentaire (CCN 96.4).
    expect(computeMonth(ctx, '2026-03').net).toBe(52000);
    expect(computeMonth(ctx, '2026-04').net).toBe(46800);
    // Mai : aucun planning remis saisi : le mois attend les plannings.
    expect(computeMonth(ctx, '2026-05').nonGere.join(' ')).toMatch(/Planning des semaines du .* non saisi/);
  });
});

describe('Cas 4 : CDD à horaires variables', () => {
  // Scénario R1 de la relecture T-076 : CDD du 02/03 au 20/03/2026, cycle A 45 h / B 15 h ancré au 02/03, 65 h payées par mois,
  // 5,00 € de l'heure. Lecture L2 (65 h < 130 h prévues en moyenne), base B = 65 × 12 ÷ 52 = 15 h par semaine.
  const r1 = (): Contract => base({
    start: '2026-03-02', trackedFrom: '2026-03-02', rateNet: 500, cdd: true, cddTerme: '2026-03-20', cddMotif: 'remplacement', end: '2026-03-20',
    rupture: { motif: 'fin_cdd', notif: '2026-03-20', preavis: 'execute', finCdd: 'terme' }, planningVariable: true, pvForme: 'cycle',
    cycle: [week('07:00', '16:00'), week('08:00', '11:00')], cycleAncre: '2026-03-02', heuresMensualisees: 65,
  });
  it('mars : salaire au prorata de l’art. 111 et heures complémentaires au-delà de 15 h par semaine', () => {
    const r = computeMonth(makeCtx(r1(), [], [], T), '2026-03');
    expect(r.nonGere).toEqual([]);
    // Prévu dans le mois : 45 + 15 + 45 + 15 + 18 (30 et 31) = 138 h ; dans le CDD : 105 h. 325 € × 105 ÷ 138 = 247,28 €.
    expect(r.base).toBe(24728);
    // Semaines A : 45 − 15 = 30 h chacune, 60 h × 5 € = 300 €. Total 547,28 €.
    expect(r.complMin).toBe(60 * 60);
    expect(r.net).toBe(54728);
  });
  it('fin au terme : indemnité de fin de contrat 54,73 € ; congés non pris 64,47 € (maintien, plus favorable que le dixième)', () => {
    const f = finDeCdd(makeCtx(r1(), [], [], T), '2026-03-20', 'terme');
    expect(f.nonGere ?? []).toEqual([]);
    // 10 % × 547,28 € = 54,728 €, arrondi 54,73 €.
    expect(f.ifcNet).toBe(5473);
    // 2 jours acquis. Dixième : (547,28 + 54,73) ÷ 10 = 60,20 €. Maintien C1 : 105 h ÷ (19 jours ÷ 7) = 38,68 h par semaine,
    // × 2 ÷ 6 × 5 € = 64,47 €. Le plus favorable : 64,47 € (CCN 48.1.1.5) ; au-dessus du minimum L1242-16 (60,20 €).
    expect(f.cpJoursRestants).toBe(2);
    expect(f.cpIndemnite).toBe(6447);
  });
  it('scénario R3 de la relecture T-076 : CDD du 02/06/2025 au 30/09/2026, congés pris payés par le salaire de la base B', () => {
    const c = base({
      start: '2025-06-02', trackedFrom: '2025-06-02', rateNet: 500, cdd: true, cddTerme: '2026-09-30', cddMotif: 'remplacement', end: '2026-09-30',
      rupture: { motif: 'fin_cdd', notif: '2026-09-30', preavis: 'execute', finCdd: 'terme' }, planningVariable: true, pvForme: 'cycle',
      cycle: [week('07:00', '16:00'), week('08:00', '11:00')], cycleAncre: '2025-06-02', heuresMensualisees: 65,
    });
    const conges: AmLeave[] = [{ id: 'cp', type: 'cp', from: '2026-07-06', to: '2026-08-01' }];
    const ctx = makeCtx(c, [], conges, T);
    // Période 2025-2026 : 30 jours, indemnité 780,00 € (le dixième, plus favorable que le maintien C1 750 €) ; complément de juin
    // 780 − 375 = 405,00 € ; 23 jours pris, payés par le salaire de la base B : 23 ÷ 6 × 15 h × 5 € = 287,50 € ;
    // reste dû à la fin : 780 − 405 − 287,50 = 87,50 €.
    expect(indemnite(ctx, 2025).montant).toBe(78000);
    expect(cpForMonth(ctx, '2026-06').complement).toBe(40500);
    const f = finDeCdd(ctx, '2026-09-30', 'terme');
    expect(f.nonGere ?? []).toEqual([]);
    // Période en cours : dixième 414,05 € (plus favorable que le maintien) + 87,50 € = 501,55 €.
    expect(f.cpDixiemeEnCours).toBe(41405);
    expect(f.cpIndemnite).toBe(50155);
  });
  it('CDD à horaires variables avec semaines sans accueil (46 semaines) : calculé', () => {
    const c = base({ start: '2026-03-02', trackedFrom: '2026-03-02', cdd: true, cddTerme: '2026-09-30', cddMotif: 'remplacement', yearType: 'incomplete', weeks: 46,
      weeksOff: ['2026-04-13', '2026-04-20', '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24'], planningVariable: true, pvForme: 'cycle', cycle: [A45, B20], cycleAncre: '2026-03-02', heuresMensualisees: 115 });
    expect(nonGeresContrat(c)).toEqual([]);
    expect(monthBase(makeCtx(c, [], [], T), '2026-04').nonGere).toEqual([]);
    // 115 h × 4 € = 460,00 € par mois (heures mensualisées du contrat).
    expect(monthBase(makeCtx(c, [], [], T), '2026-05').salaireMens).toBe(46000);
  });
});
