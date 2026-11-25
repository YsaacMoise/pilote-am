// T-104 : absences protégées de l'AM calculées (regles/t104-absences-protegees.md dans calculateur-arvela).
// Montants attendus calculés à la main avec la formule de l'art. 111 de la convention (52 semaines, en heures) :
// salaire payé = salaire mensualisé × heures payées du mois ÷ heures qui auraient été travaillées dans le mois.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Contract } from '../src/engine/model';
import { makeCtx, MESSAGE_ARRET_MOIS_ENTIER, salaireMensualise } from '../src/engine/payroll';
import { computeMonth } from '../src/engine/month';
import { acquisition } from '../src/engine/conges';
import { finDeContrat } from '../src/engine/fin';
import { finPreavisProrogee } from '../src/engine/suspensions';

const plage = [{ start: '08:00', end: '16:00' }];
const contrat = (over: Partial<Contract> = {}): Contract => ({
  id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2024-01-01', yearType: 'complete', weeks: 52, weeksOff: [],
  planning: { 1: plage, 2: plage, 3: plage, 4: plage, 5: plage }, rateNet: 500, majoration: 10, entretienJour: 0, repasPrix: 0,
  repasParJour: 0, kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2024-01-01',
  balances: { cpRestants: 30, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0,
  alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false, departement: '31', ...over,
} as Contract);
const abs = (type: AmLeave['type'], from: string, to: string, over: Partial<AmLeave> = {}): AmLeave => ({ id: `${type}${from}`, type, from, to, ...over });

describe('R-ABS-01 : salaire du mois (retenue de l’art. 111)', () => {
  // 40 h par semaine × 5 € × 52 ÷ 12 = 866,67 € (86 667 centimes).
  it('salaire mensualisé de référence', () => expect(salaireMensualise(contrat())).toBe(86667));
  for (const type of ['maternite', 'paternite', 'naissance_supp'] as const) {
    it(`${type}, du 16/03 au 05/07/2026 : mars 393,94 €, avril 0 € sans déclaration, juillet 753,63 €`, () => {
      const ctx = makeCtx(contrat(), [], [abs(type, '2026-03-16', '2026-07-05')], '2026-12-31');
      // Mars 2026 : 22 jours prévus (176 h), absente 12 jours (96 h) : 86 667 × 80 ÷ 176 = 39 394,09.
      const mars = computeMonth(ctx, '2026-03');
      expect(mars.nonGere).toEqual([]);
      expect(mars.net).toBe(39394);
      // Avril : tout le mois absente ; Urssaf : aucune déclaration pour ce mois.
      const avril = computeMonth(ctx, '2026-04');
      expect(avril.net).toBe(0);
      expect(avril.alerts).toContain(MESSAGE_ARRET_MOIS_ENTIER);
      // Juillet : 23 jours prévus avec le 14 juillet chômé (184 h), absente les 1er, 2 et 3 (24 h) : 86 667 × 160 ÷ 184 =
      // 75 362,6. Le 14 juillet est payé : travaillé le 13 et le 15 (CCN 47.2).
      expect(computeMonth(ctx, '2026-07').net).toBe(75363);
    });
  }
  it('accident du travail du lundi 16/03 au 27/03/2026, premier jour = jour de l’accident : ce jour est payé (CSS L433-1)', () => {
    const avec = makeCtx(contrat(), [], [abs('at_mp', '2026-03-16', '2026-03-27', { atmp: 'accident', jourAccident: true })], '2026-12-31');
    // 9 jours retenus (72 h) : 86 667 × 104 ÷ 176 = 51 212,3.
    expect(computeMonth(avec, '2026-03').net).toBe(51212);
    const sans = makeCtx(contrat(), [], [abs('at_mp', '2026-03-16', '2026-03-27', { atmp: 'accident', jourAccident: false })], '2026-12-31');
    // 10 jours retenus (80 h) : 86 667 × 96 ÷ 176 = 47 272,7.
    expect(computeMonth(sans, '2026-03').net).toBe(47273);
    const mp = makeCtx(contrat(), [], [abs('at_mp', '2026-03-16', '2026-03-27', { atmp: 'maladie_pro', jourAccident: true })], '2026-12-31');
    expect(computeMonth(mp, '2026-03').net).toBe(47273);
  });
  it('arrêt sans sa nature : le mois attend la réponse, une fois', () => {
    const ctx = makeCtx(contrat(), [], [abs('at_mp', '2026-03-16', '2026-03-27')], '2026-12-31');
    expect(computeMonth(ctx, '2026-03').nonGere.join(' ')).toMatch(/dis si c’est un accident du travail, un accident de trajet ou une maladie professionnelle/);
    const sansJour = makeCtx(contrat(), [], [abs('at_mp', '2026-03-16', '2026-03-27', { atmp: 'trajet' })], '2026-12-31');
    expect(computeMonth(sansJour, '2026-03').nonGere.join(' ')).toMatch(/premier jour de l’arrêt est le jour de l’accident/);
  });
  it('férié juste après l’absence (CCN 47.2) : non payé après un accident du travail, payé après un congé maternité', () => {
    // Lundi 13/07/2026 absente, 14/07 férié, mercredi 15 travaillé. Juillet : 184 h prévues.
    const at = makeCtx(contrat(), [], [abs('at_mp', '2026-07-06', '2026-07-13', { atmp: 'accident', jourAccident: false })], '2026-12-31');
    // Retenus : 6 au 10 et 13 (6 jours, 48 h) + le 14 non payé (8 h) : 86 667 × 128 ÷ 184 = 60 290,1.
    expect(computeMonth(at, '2026-07').net).toBe(60290);
    const mat = makeCtx(contrat(), [], [abs('maternite', '2026-07-06', '2026-07-13')], '2026-12-31');
    // Retenus : 48 h seulement : 86 667 × 136 ÷ 184 = 64 058,2.
    expect(computeMonth(mat, '2026-07').net).toBe(64058);
  });
  it('Alsace-Moselle : salaire maintenu moins les indemnités journalières (L1226-23 ; Cass. soc. 27/05/2025)', () => {
    const c = contrat({ alsaceMoselle: true, departement: '67' });
    const sans = makeCtx(c, [], [abs('paternite', '2026-03-16', '2026-03-27')], '2026-12-31');
    expect(computeMonth(sans, '2026-03').nonGere.join(' ')).toMatch(/Congé ou arrêt en Alsace-Moselle : indique le montant/);
    const avec = makeCtx(c, [], [abs('paternite', '2026-03-16', '2026-03-27', { ijSecu: 30000 })], '2026-12-31');
    const r = computeMonth(avec, '2026-03');
    expect(r.nonGere).toEqual([]);
    expect(r.ijDeduites).toBe(30000);
    expect(r.net).toBe(salaireMensualise(c) - 30000);
  });
});

describe('R-ABS-03 : jours de congés acquis (période du 01/06/2025 au 31/05/2026)', () => {
  const periode = (l: AmLeave) => acquisition(makeCtx(contrat(), [], [l], '2026-12-31'), 2025).jours;
  it('maternité, paternité, accident du travail, maladie professionnelle : travail effectif, 30 jours (L3141-5, 2° et 5°)', () => {
    expect(periode(abs('maternite', '2025-09-01', '2026-01-15'))).toBe(30);
    expect(periode(abs('paternite', '2025-09-01', '2025-09-25'))).toBe(30);
    expect(periode(abs('at_mp', '2025-06-01', '2026-05-31', { atmp: 'accident', jourAccident: false }))).toBe(30);
    expect(periode(abs('at_mp', '2024-06-01', '2026-05-31', { atmp: 'maladie_pro' }))).toBe(30);
  });
  it('accident de trajet commencé le 01/06/2024 : la 2e année, 2 jours par mois, 24 (CCN 49 ; L3141-5, 7°, L3141-5-1)', () => {
    expect(periode(abs('at_mp', '2024-06-01', '2026-05-31', { atmp: 'trajet', jourAccident: false }))).toBe(24);
  });
  it('accident de trajet de moins d’un an : travail effectif (CCN 49)', () => {
    expect(periode(abs('at_mp', '2025-06-01', '2026-05-31', { atmp: 'trajet', jourAccident: false }))).toBe(30);
  });
  it('congé supplémentaire de naissance de deux mois (juillet et août 2025) : hors travail effectif, 28 jours', () => {
    // Décompte le plus favorable (T-103, C10 bis ; fiche service-public F18260) : 303 jours calendaires de travail ÷ 28 =
    // 10,82 périodes de 4 semaines × 2,5 = 27,05, arrondi à 28 (mensuel : 10 mois × 2,5 = 25).
    expect(periode(abs('naissance_supp', '2025-07-01', '2025-08-31'))).toBe(28);
    expect(periode(abs('naissance_supp', '2025-07-01', '2025-08-31'))).toBeLessThan(30);
  });
});

describe('R-ABS-07 : préavis suspendu (CCN 64.1)', () => {
  // Retrait remis en main propre le 15/10/2026, plus d'un an d'ancienneté : un mois, du 15/10 au 14/11/2026.
  const fin = (leaves: AmLeave[]) => finDeContrat(makeCtx(contrat({ start: '2024-09-01', trackedFrom: '2024-09-01' }), [], leaves, '2027-06-30'), '2026-10-15', 'retrait');
  it('sans absence : fin le 14/11/2026', () => expect(fin([]).preavisFin).toBe('2026-11-14'));
  it('accident du travail survenu pendant le préavis, 10 jours : fin le 24/11/2026', () => {
    expect(fin([abs('at_mp', '2026-10-20', '2026-10-29', { atmp: 'accident', jourAccident: false })]).preavisFin).toBe('2026-11-24');
  });
  it('arrêt commencé avant le préavis (depuis le 01/12/2024, pas de suspension) ; accident de trajet : pas de suspension', () => {
    expect(fin([abs('at_mp', '2026-10-05', '2026-10-20', { atmp: 'accident', jourAccident: false })]).preavisFin).toBe('2026-11-14');
    expect(fin([abs('at_mp', '2026-10-20', '2026-10-29', { atmp: 'trajet', jourAccident: false })]).preavisFin).toBe('2026-11-14');
    expect(fin([abs('paternite', '2026-10-20', '2026-10-29')]).preavisFin).toBe('2026-11-14');
  });
  it('congé maternité du 01/11/2026 au 20/02/2027 : 17 jours faits avant, 14 après, fin le 06/03/2027', () => {
    const f = fin([abs('maternite', '2026-11-01', '2027-02-20')]);
    expect(f.preavisFin).toBe('2027-03-06');
    expect(f.alertes.join(' ')).toMatch(/article 64\.1/);
  });
  it('avant le 01/12/2024 : un arrêt commencé avant le préavis le suspend aussi (version d’origine de l’art. 64.1)', () => {
    const l = [abs('at_mp', '2024-10-01', '2024-10-20', { atmp: 'accident', jourAccident: false })];
    expect(finPreavisProrogee('2024-10-15', '2024-11-14', l)).toBe('2024-11-20');
    expect(finPreavisProrogee('2024-12-15', '2025-01-14', [abs('at_mp', '2024-12-01', '2024-12-20', { atmp: 'accident', jourAccident: false })])).toBe('2025-01-14');
  });
});

describe('R-ABS-06 : protection contre le retrait (C. trav. L1225-4, L1225-4-1, L1225-4-5)', () => {
  const fin = (leaves: AmLeave[], notif: string) => finDeContrat(makeCtx(contrat({ start: '2024-09-01', trackedFrom: '2024-09-01' }), [], leaves, '2027-06-30'), notif, 'retrait');
  it('retrait notifié pendant le congé maternité : la règle est dite, les montants calculés', () => {
    const f = fin([abs('maternite', '2026-09-01', '2026-12-20')], '2026-10-15');
    expect(f.nonGere ?? []).toEqual([]);
    expect(f.alertes.join(' ')).toMatch(/L1225-4\).*nul/);
  });
  it('retrait moins de 10 semaines après le congé maternité ; pendant le congé de naissance', () => {
    expect(fin([abs('maternite', '2026-05-01', '2026-08-20')], '2026-10-15').alertes.join(' ')).toMatch(/moins de 10 semaines après ton congé maternité/);
    expect(fin([abs('naissance_supp', '2026-10-01', '2026-10-31')], '2026-10-15').alertes.join(' ')).toMatch(/L1225-4-5/);
  });
  it('accident du travail : pas de protection pour une AM (CASF L423-2 ne vise pas L1226-9 ; Cass. soc. 14/05/2025)', () => {
    expect(fin([abs('at_mp', '2026-10-01', '2026-10-10', { atmp: 'accident', jourAccident: false })], '2026-10-15').alertes.join(' ')).not.toMatch(/L122/);
  });
});
