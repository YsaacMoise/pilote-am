// T-034 : derniers points du triage A2. Attendus tirés des textes, jamais du code :
// - fiches DREETS Occitanie (DDETS 31) du 19/01/2023, « Accueil sur 52 semaines » et « Accueil sur 46 semaines ou moins »,
//   section 3 « Que faire en cas de mois incomplet en raison d'une absence ? » : « Embauche et fin de contrat en cours de
//   mois » et « Absence du salarié pour congés sans solde » sont des absences non rémunérées traitées par la déduction
//   d'absence ; exemples chiffrés 866,66 × 24 ÷ 168 = 123,80 (salaire 742,86) et 600 × 3 ÷ 21 = 85,71 (salaire 514,29) ;
// - Urssaf, « Particulier-employeur : gérer les absences de votre salarié » (mis à jour le 17/09/2026), exemples chiffrés
//   d'absence non rémunérée pour motif familial : 416 − 416 × 64 ÷ 136 = 220,24 ; 370 − 370 × 8 ÷ 16 = 185.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Contract, Planning } from '../src/engine/model';
import { makeCtx, monthBase, salaireMensualise } from '../src/engine/payroll';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}

function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2021-09-01', yearType: 'complete', weeks: 52, weeksOff: [],
    planning: week('08:00', '16:00'), rateNet: 500, majoration: 15, entretienJour: 0, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2021-09-01',
    alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
    balances: { cpRestants: 30, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, ...over,
  };
}
const leave = (type: AmLeave['type'], from: string, to: string): AmLeave => ({ id: type, type, from, to });

// Mme Durand (52 semaines, 40 h du lundi au vendredi, 5 € de l'heure) : 866,66 € dans la fiche (troncature), 866,67 € arrondi.
// Octobre 2021 : 21 jours potentiels de travail, soit 168 heures (fiche).
const durand = (over: Partial<Contract> = {}) => contract(over);
// Mme Bertrand (36 semaines, 40 h du lundi au vendredi, 5 € de l'heure) : 600 €.
const bertrand = (over: Partial<Contract> = {}) => contract({ yearType: 'incomplete', weeks: 36, weeksOff: ['2021-10-25', '2021-11-01'], ...over });

describe('T-034 point 2 : embauche ou fin de contrat en cours de mois, déduction d’absence (fiches DREETS Occitanie)', () => {
  it('année complète, embauche le mercredi 6 octobre 2021 : 24 heures non travaillées sur 168, salaire 742,86 €', () => {
    const c = durand({ start: '2021-10-06', trackedFrom: '2021-10-06' });
    expect(salaireMensualise(c)).toBe(86667);
    const b = monthBase(makeCtx(c, [], [], '2021-12-31'), '2021-10');
    expect(b.base).toBe(74286); // 866,66 − 123,80 (fiche) ; 866,67 × 144 ÷ 168 = 742,86
  });
  it('année complète, fin de contrat le mardi 26 octobre 2021 : 24 heures non travaillées sur 168, salaire 742,86 €', () => {
    const c = durand({ start: '2021-09-01', trackedFrom: '2021-09-01', end: '2021-10-26' });
    const b = monthBase(makeCtx(c, [], [], '2021-12-31'), '2021-10');
    expect(b.base).toBe(74286);
  });
  it('année incomplète, embauche le mercredi 6 octobre 2021 : 3 jours non travaillés sur 21, salaire 514,29 €', () => {
    const c = bertrand({ start: '2021-10-06', trackedFrom: '2021-10-06' });
    expect(salaireMensualise(c)).toBe(60000);
    // La semaine sans accueil du 25 octobre compte dans les jours qui auraient été travaillés (fiche, art. 111) et n'est pas retenue.
    const b = monthBase(makeCtx(c, [], [], '2021-12-31'), '2021-10');
    expect(b.base).toBe(51429); // 600 − 600 × 3 ÷ 21 = 514,29
  });
  it('année incomplète, fin de contrat le mardi 26 octobre 2021 : 3 jours non travaillés sur 21, salaire 514,29 €', () => {
    const c = bertrand({ start: '2021-09-01', trackedFrom: '2021-09-01', end: '2021-10-26' });
    const b = monthBase(makeCtx(c, [], [], '2021-12-31'), '2021-10');
    expect(b.base).toBe(51429);
  });
});

describe('T-034 point 3 : congé sans solde de l’AM, déduction d’absence (fiches DREETS Occitanie, Urssaf)', () => {
  it('année complète, exemple Urssaf : 416 € − 416 × 64 h ÷ 136 h = 220,24 €', () => {
    // Josette : du mardi au vendredi de 9 h à 17 h (32 h), 3 € net, 52 semaines : 416 € pour 139 heures mensualisées.
    // Août 2027 : 17 jours prévus (136 h) ; absente sans solde deux semaines, 8 jours (64 h).
    const c = contract({ start: '2027-01-05', trackedFrom: '2027-01-05', planning: week('09:00', '17:00', [2, 3, 4, 5]), rateNet: 300 });
    expect(salaireMensualise(c)).toBe(41600);
    const b = monthBase(makeCtx(c, [], [leave('sans_solde', '2027-08-02', '2027-08-15')], '2027-12-31'), '2027-08');
    expect(b.deductedDays).toBe(8);
    expect(b.base).toBe(22024);
  });
  it('année incomplète, exemple Urssaf : 370 € − 370 × 8 jours ÷ 16 jours = 185 €', () => {
    // Josette : lundi, mardi, jeudi, vendredi de 8 h 30 à 18 h 30 (40 h), 3 € net, 37 semaines : 370 €.
    // Février 2027 : 16 jours prévus ; absente sans solde deux semaines, 8 jours.
    const c = contract({ start: '2027-01-04', trackedFrom: '2027-01-04', yearType: 'incomplete', weeks: 37,
      planning: week('08:30', '18:30', [1, 2, 4, 5]), rateNet: 300 });
    expect(salaireMensualise(c)).toBe(37000);
    const b = monthBase(makeCtx(c, [], [leave('sans_solde', '2027-02-01', '2027-02-14')], '2027-12-31'), '2027-02');
    expect(b.deductedDays).toBe(8);
    expect(b.base).toBe(18500);
  });
  it('année complète, exemple DREETS (3 jours d’absence en octobre 2021, motif sans solde) : 742,86 €', () => {
    const c = durand();
    const b = monthBase(makeCtx(c, [], [leave('sans_solde', '2021-10-13', '2021-10-15')], '2021-12-31'), '2021-10');
    expect(b.base).toBe(74286);
  });
  it('année incomplète, exemple DREETS (3 jours d’absence en octobre 2021, motif sans solde) : 514,29 €', () => {
    const c = bertrand();
    const b = monthBase(makeCtx(c, [], [leave('sans_solde', '2021-10-13', '2021-10-15')], '2021-12-31'), '2021-10');
    expect(b.base).toBe(51429);
  });
});

describe('T-034 point 4 : indemnité d’entretien du contrat sous le minimum (CCN art. 114.1), alerte sans changer le montant', () => {
  // Art. 114.1 : « le montant journalier de cette indemnité ne peut pas être inférieur à 2,65 € ».
  it('tarif de 1 € par jour : le minimum est versé (montant inchangé) et l’alerte est affichée', () => {
    const c = contract({ start: '2026-01-05', trackedFrom: '2026-01-05', planning: week('08:00', '12:00'), entretienJour: 100 });
    const avec = monthBase(makeCtx(c, [], [], '2026-12-31'), '2026-03');
    expect(avec.presenceDays).toBeGreaterThan(0);
    expect(avec.entretien).toBeGreaterThanOrEqual(265 * avec.presenceDays);
    expect(avec.alerts.join(' ')).toMatch(/Indemnité d’entretien : le montant du contrat \(1,00\s€ par jour\) est sous le minimum de la convention \(article 114\.1\)/);
  });
  it('tarif au-dessus du minimum : aucune alerte', () => {
    const c = contract({ start: '2026-01-05', trackedFrom: '2026-01-05', planning: week('08:00', '12:00'), entretienJour: 500 });
    const b = monthBase(makeCtx(c, [], [], '2026-12-31'), '2026-03');
    expect(b.entretien).toBe(500 * b.presenceDays);
    expect(b.alerts.join(' ')).not.toMatch(/sous le minimum de la convention/);
  });
});
