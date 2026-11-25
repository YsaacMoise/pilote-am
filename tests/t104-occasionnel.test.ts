// T-104, cas 2 : accueil occasionnel (regles/t104-accueil-occasionnel.md dans calculateur-arvela).
// Montants attendus calculés à la main : heures d'accueil × taux (CCN 109.3), heures complémentaires au-delà des heures prévues
// de la semaine jusqu'à 45 h (96.4), heures majorées au-delà de 45 h (96.4, 110.1), congés : 10 % au terme (102.1.2.3).
import { describe, expect, it } from 'vitest';
import type { AccueilOcc, Contract, DayRec } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { computeMonth, declarationLines } from '../src/engine/month';
import { finDeContrat } from '../src/engine/fin';
import { joursCPAccueil } from '../src/engine/occasionnel';

const p8 = [{ start: '08:00', end: '16:00' }];
const semaine8 = { 1: p8, 2: p8, 3: p8, 4: p8, 5: p8 };
const contrat = (accueils: AccueilOcc[], over: Partial<Contract> = {}): Contract => ({
  id: 'o1', child: 'Tom', family: 'Durand', color: 0, start: '2026-03-01', yearType: 'complete', weeks: 52, weeksOff: [],
  planning: {}, rateNet: 500, majoration: 25, majorationCompl: 0, entretienJour: 0, repasPrix: 0, repasParJour: 0, kmTaux: 0,
  cpMode: 'juin', majoreFiscal: false, trackedFrom: '2026-03-01', balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 },
  history: [], createdAt: 0, alsaceMoselle: false, planningVariable: false, accueilOccasionnel: true, cdd: false, departement: '31',
  accueils, ...over,
} as Contract);
const jour = (date: string, a: string, d: string): DayRec => ({ key: `o1|${date}`, cid: 'o1', date, pres: [{ a, d }] });
const A1: AccueilOcc = { id: 'a1', du: '2026-03-09', au: '2026-03-20', planning: semaine8 };

describe('R-OCC-02 à R-OCC-08 : salaire du mois et congés au terme', () => {
  it('accueil du 09 au 20/03/2026, 8 h par jour : 80 h × 5 € = 400 € ; congés 10 % = 40 € versés en mars', () => {
    const r = computeMonth(makeCtx(contrat([A1]), [], [], '2026-04-30'), '2026-03');
    expect(r.nonGere).toEqual([]);
    expect(r.net).toBe(40000);
    expect(r.cpIndemnite).toBe(4000);
    expect(r.netTotal).toBe(44000);
    expect(r.joursActivite).toBe(10);
    expect(r.heuresNormales).toBe(80);
    // Urssaf : semaines × 2,5 ÷ 4 ; 12 jours ÷ 7 × 2,5 ÷ 4 = 1,07, arrondi à 2.
    expect(r.cpJours).toBe(2);
    const cases = declarationLines(makeCtx(contrat([A1]), [], [], '2026-04-30'), r);
    expect(cases.find((l) => l.label === 'Jours de congés payés')?.value).toBe('2');
  });
  it('heures en plus : 2 h complémentaires la 1re semaine ; la 2e, 5 h complémentaires puis 3 h majorées (25 %)', () => {
    const recs = [jour('2026-03-10', '08:00', '18:00'), jour('2026-03-17', '07:00', '18:00'), jour('2026-03-18', '08:00', '18:00'), jour('2026-03-19', '08:00', '19:00')];
    const r = computeMonth(makeCtx(contrat([A1]), recs, [], '2026-04-30'), '2026-03');
    expect(r.complMin).toBe(7 * 60);
    expect(r.majMin).toBe(3 * 60);
    // 80 h × 5 + 7 h × 5 + 3 h × 5 × 1,25 = 400 + 35 + 18,75 = 453,75 € ; congés 45,375 € arrondis à 45,38 €.
    expect(r.net).toBe(45375);
    expect(r.cpIndemnite).toBe(4538);
  });
  it('sans horaires au contrat : les heures notées sont des heures normales, aucune heure complémentaire', () => {
    const libre: AccueilOcc = { id: 'a2', du: '2026-03-09', au: '2026-03-13', planning: {} };
    const r = computeMonth(makeCtx(contrat([libre]), [jour('2026-03-10', '08:00', '18:00'), jour('2026-03-11', '09:00', '12:00')], [], '2026-04-30'), '2026-03');
    expect(r.complMin).toBe(0);
    expect(r.net).toBe(13 * 500);
    expect(r.cpIndemnite).toBe(650);
    expect(r.joursActivite).toBe(2);
  });
  it('absence de l’enfant à la demande des parents : payée (CASF L423-20, CCN 105) ; malade avec certificat : retenue', () => {
    const parents: DayRec = { key: 'o1|2026-03-12', cid: 'o1', date: '2026-03-12', abs: 'parents' };
    expect(computeMonth(makeCtx(contrat([A1]), [parents], [], '2026-04-30'), '2026-03').net).toBe(40000);
    const malade: DayRec = { key: 'o1|2026-03-12', cid: 'o1', date: '2026-03-12', abs: 'malade_certif', certifDu: '2026-03-12', certifAu: '2026-03-12' };
    expect(computeMonth(makeCtx(contrat([A1]), [malade], [], '2026-04-30'), '2026-03').net).toBe(36000);
  });
  it('accueil de plus d’un mois civil (27/04 au 07/05/2026) : payé chaque mois (L423-19), congés en mai', () => {
    const A3: AccueilOcc = { id: 'a3', du: '2026-04-27', au: '2026-05-07', planning: semaine8 };
    const ctx = makeCtx(contrat([A3]), [], [], '2026-05-31');
    const avril = computeMonth(ctx, '2026-04');
    expect(avril.net).toBe(16000);
    expect(avril.cpIndemnite).toBe(0);
    // Mai : 1er mai chômé payé (CCN 47.1), 4 au 7 mai : 5 × 8 h × 5 € = 200 € ; congés : 10 % × 360 € = 36 €.
    const mai = computeMonth(ctx, '2026-05');
    expect(mai.net).toBe(20000);
    expect(mai.cpIndemnite).toBe(3600);
  });
  it('accueil noté hors des périodes du contrat : la période est demandée, une fois', () => {
    const r = computeMonth(makeCtx(contrat([A1]), [jour('2026-03-25', '08:00', '12:00')], [], '2026-04-30'), '2026-03');
    expect(r.nonGere.join(' ')).toMatch(/en dehors des périodes d’accueil du contrat/);
  });
  it('jours de congés déclarés : 4 semaines → 3 jours ; 1 jour → 1', () => {
    expect(joursCPAccueil('2026-03-02', '2026-03-29')).toBe(3);
    expect(joursCPAccueil('2026-03-02', '2026-03-02')).toBe(1);
  });
});

describe('R-OCC-10 : fin du contrat', () => {
  it('CDI : retrait remis le 07/05/2026, 2 mois d’accueil : préavis de 8 jours, ni indemnité de rupture ni congés en plus', () => {
    const A3: AccueilOcc = { id: 'a3', du: '2026-04-27', au: '2026-05-07', planning: semaine8 };
    const c = contrat([A3], { end: '2026-05-14', rupture: { motif: 'retrait', notif: '2026-05-07' } });
    const f = finDeContrat(makeCtx(c, [], [], '2026-05-31'), '2026-05-07', 'retrait');
    expect(f.nonGere ?? []).toEqual([]);
    expect(f.preavisFin).toBe('2026-05-14');
    expect(f.indemniteRupture).toBe(0);
    expect(f.cpIndemnite).toBe(0);
    expect(f.regularisation).toBe(0);
  });
  it('CDD de remplacement du 01 au 20/03/2026 : indemnité de fin de contrat 10 % de 440 € ; minimum L1242-16 : 8,40 €', () => {
    const c = contrat([A1], { cdd: true, cddTerme: '2026-03-20', cddMotif: 'remplacement', end: '2026-03-20', rupture: { motif: 'fin_cdd', notif: '2026-03-20', finCdd: 'terme' } });
    const f = finDeContrat(makeCtx(c, [], [], '2026-04-30'), '2026-03-20', 'fin_cdd');
    expect(f.nonGere ?? []).toEqual([]);
    expect(f.ifcNet).toBe(4400);
    expect(f.cpIndemnite).toBe(840);
  });
});
