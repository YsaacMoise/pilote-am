// T-030 : cas officiels que le moteur A ne retrouvait pas (rapport projet/moteur/T-030-cas-officiels.md).
// Chaque attendu vient d'un cas officiel (projet/tests/cas-officiels-v0.md) ou d'un texte lu à la source, cité dans le test.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Contract, DayRec, Planning } from '../src/engine/model';
import { makeCtx, monthBase } from '../src/engine/payroll';
import { ratesAt } from '../src/engine/rates';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}
function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2026-09-01', yearType: 'complete', weeks: 52, weeksOff: [],
    planning: week('08:00', '16:00'), rateNet: 500, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2026-09-01',
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0,
    alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false, ...over,
  };
}
const rec = (date: string, a: string, d: string): DayRec => ({ key: `c1|${date}`, cid: 'c1', date, pres: [{ a, d }] });
export { rec };
export type { AmLeave };

describe('T-030 NET-02 : minimum conventionnel net de 2025-2026', () => {
  // Urssaf, « Rémunérer un salarié à domicile ou un assistant maternel », tableau AM : « Du 1er janvier 2026 au
  // 31 mai 2026 … Salaire horaire brut 3,64 € … Salaire horaire net 2,86 € » ; historique « Du 1er avril 2025 au
  // 31 décembre 2025 » : 3,64 € brut, 2,86 € net (lu le 18/11/2026).
  it('C-NET-02 : 3,64 € brut, 2,86 € net du 1er janvier au 31 mai 2026', () => {
    expect(ratesAt('2026-01-01')!.minConvBrut).toBe(364);
    expect(ratesAt('2026-01-01')!.minConvNet).toBe(286);
  });
  it('Urssaf, historique : 2,86 € net du 1er avril au 31 décembre 2025', () => {
    expect(ratesAt('2025-04-01')!.minConvNet).toBe(286);
  });
});

describe('T-030 HC-03 à HC-06 : heures complémentaires au taux du contrat', () => {
  // Le moteur paie les heures complémentaires au taux de base, majoré seulement si le contrat le prévoit
  // (`majorationCompl`). Les quatre exemples officiels fixent ce taux au contrat ; le comparateur ne le transmettait pas.
  it('C-HC-03 (S-BERTRAND p. 4) : 600 € + (2 heures x 5,50 €) = 611 € brut, majoration de 10 % au contrat', () => {
    const c = contract({ yearType: 'incomplete', weeks: 36, majoration: 15, majorationCompl: 10 });
    const b = monthBase(makeCtx(c, [rec('2026-10-05', '08:00', '18:00')], [], '2026-12-31'), '2026-10');
    expect(b.complAmount).toBe(1100);
    expect(b.net).toBe(61100);
  });
  it('C-HC-04 (S-BERTRAND p. 4) : 600 € + (5 heures x 5,50 €) + (2 heures x 5,75 €) = 639 € brut', () => {
    const c = contract({ yearType: 'incomplete', weeks: 36, majoration: 15, majorationCompl: 10 });
    const jours = ['2026-10-05', '2026-10-06', '2026-10-07'].map((d) => rec(d, '08:00', '18:20'));
    const b = monthBase(makeCtx(c, [...jours, rec('2026-10-08', '08:00', '16:00')], [], '2026-12-31'), '2026-10');
    expect(b.complAmount).toBe(2750);
    expect(b.majAmount).toBe(1150);
  });
  it('C-HC-05 (Urssaf, 52 s) : 416 + (13 heures × 3,20 €) + (5 heures × 3,50 €) = 475,10 €', () => {
    // « le salaire horaire net est de 3 €, 3,20€ pour les heures complémentaires et 3,50 € pour les heures majorées »
    const c = contract({ planning: week('09:00', '17:00', [2, 3, 4, 5]), rateNet: 300, majoration: 50 / 3, majorationCompl: 20 / 3 });
    const jours = ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'].map((d) => rec(d, '09:00', '21:30'));
    expect(monthBase(makeCtx(c, jours, [], '2026-12-31'), '2026-10').net).toBe(47510);
  });
  it('C-HC-06 (Urssaf, 46 s) : 370 + (5 heures × 3,20 €) + (5 heures × 3,50 €) = 403,50 €', () => {
    const c = contract({ yearType: 'incomplete', weeks: 37, planning: week('08:30', '18:30', [1, 2, 4, 5]), rateNet: 300,
      majoration: 50 / 3, majorationCompl: 20 / 3 });
    const jours = ['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09'].map((d) => rec(d, '08:30', '21:00'));
    expect(monthBase(makeCtx(c, jours, [], '2026-12-31'), '2026-10').net).toBe(40350);
  });
});

import { acquisition } from '../src/engine/conges';
describe('T-030 CPA-03 : jours pour enfant à charge acquis au 31 mai seulement', () => {
  // CCN 48.1.3.3 : « déterminé et acquis à l'issue de la période de référence (…) soit au 31 mai de chaque année ».
  // S-DURAND p. 8 (C-CPA-03) : période du 1er juin au 30 septembre 2022, « Pas de jours enfant à charge ».
  const durand = (over: Partial<Contract> = {}) => contract({ start: '2021-09-01', trackedFrom: '2021-09-01', majoration: 15, ...over });
  it('C-CPA-03 : contrat rompu le 30 septembre 2022, aucun jour pour enfant sur la période en cours', () => {
    const a = acquisition(makeCtx(durand({ end: '2022-09-30' }), [], [], '2022-12-31', 1), 2022, 1);
    expect(a.enfantsBonus).toBe(0);
  });
  it('C-CPA-02 : période complète au 31 mai 2022, 2 jours pour un enfant (25 + 2 = 27 jours, S-DURAND p. 5)', () => {
    const a = acquisition(makeCtx(durand({ end: '2022-09-30' }), [], [], '2022-12-31', 1), 2021, 1);
    expect(a.enfantsBonus).toBe(2);
  });
});

import { finDeContrat } from '../src/engine/fin';
import { cpForMonth } from '../src/engine/conges';
describe('T-030 A-23 : acquisition en année complète, mois ou périodes de 4 semaines', () => {
  // CCN 48.1.1.2 et C. trav. L3141-4 : « mois de travail » ou « période équivalente » (4 semaines), sans dire comment
  // compter une période commencée. DREETS Occitanie compte les fractions de semaines, DREETS Bourgogne-Franche-Comté les
  // mois ou les périodes entières : le nombre est à confirmer quand les deux lectures diffèrent, et rien n'est payé.
  const malade = (from: string, to: string): AmLeave => ({ id: 'm', type: 'am_malade', from, to });
  const c45 = (over: Partial<Contract> = {}) => contract({ start: '2024-06-01', trackedFrom: '2024-06-01', rateNet: 450, ...over });
  it('C-CPA-16 (S-BFC fiche 07) : embauche au 1er janvier, 13 jours (mois) ou 14 (semaines) : à confirmer, 13 parmi les lectures', () => {
    const a = acquisition(makeCtx(c45({ start: '2026-01-01', trackedFrom: '2026-01-01' }), [], [], '2026-12-31'), 2025);
    expect(a.aConfirmer?.lectures.map((l) => l.jours)).toEqual([14, 13]);
  });
  it('C-CPA-16 : 2e période entière, 30 jours sûrs', () => {
    const a = acquisition(makeCtx(c45({ start: '2026-01-01', trackedFrom: '2026-01-01' }), [], [], '2027-12-31'), 2026);
    expect(a.aConfirmer).toBeUndefined();
    expect(a.jours).toBe(30);
  });
  it('C-CPA-15 (S-BFC fiche 04-III) : 9 mois de travail et 3 mois d’arrêt, 29 jours (BFC) ou 30 : à confirmer', () => {
    const a = acquisition(makeCtx(c45(), [], [malade('2025-03-01', '2026-07-31')], '2026-12-31'), 2024);
    expect(a.aConfirmer?.lectures.map((l) => l.jours)).toEqual([30, 29]);
  });
  it('C-CPA-14 (S-BFC) : arrêt de 11 semaines, 29 jours (périodes entières) ou 30 : à confirmer', () => {
    const a = acquisition(makeCtx(c45(), [], [malade('2025-10-06', '2025-12-21')], '2026-12-31'), 2025);
    expect(a.aConfirmer?.lectures.map((l) => l.jours)).toContain(29);
  });
  it('C-CPA-13 (S-BFC) : arrêt de 20 semaines, 30 jours sûrs (toutes les lectures donnent 30)', () => {
    const a = acquisition(makeCtx(c45(), [], [malade('2024-10-07', '2025-02-23')], '2026-12-31'), 2024);
    expect(a.aConfirmer).toBeUndefined();
    expect(a.jours).toBe(30);
  });
  it('C-FIN-09 (S-BFC fiche 11-III) : ICCP à confirmer, aucun montant donné ; complément de juin non versé', () => {
    const c = contract({ start: '2025-09-01', trackedFrom: '2025-09-01', end: '2026-08-31', planning: week('08:00', '17:00'), rateNet: 400 });
    const ctx = makeCtx(c, [], [{ id: 'cp', type: 'cp', from: '2026-06-08', to: '2026-06-27' }], '2026-12-31');
    const f = finDeContrat(ctx, '2026-08-17', 'retrait');
    expect(f.cpIndemnite).toBe(0);
    expect(f.cpAConfirmer).toMatch(/à confirmer/);
    expect(acquisition(ctx, 2025).aConfirmer?.lectures.map((l) => l.jours)).toEqual([25, 23]);
    expect(cpForMonth(ctx, '2026-06').aConfirmer).toBeDefined();
  });
  it('période entière sans absence : 30 jours, rien à confirmer', () => {
    const a = acquisition(makeCtx(c45(), [], [], '2026-12-31'), 2024);
    expect(a.aConfirmer).toBeUndefined();
    expect(a.jours).toBe(30);
  });
});

import { indemnite } from '../src/engine/conges';
describe('T-030 A-26 : formule du maintien en année incomplète', () => {
  // CCN 48.1.1.5 et 102.1.2.2 : pas de formule. Urssaf et DREETS Occitanie : jours ÷ 6 × heures × taux ;
  // DREETS Bourgogne-Franche-Comté (C-CPI-13 : « 13/26 X 540 € =270 € ») : jours ÷ 26 × salaire mensualisé.
  it('C-CPI-13 : 46 s, 40 h, 4,50 €, 36 semaines, 13 jours : 390 € (semaines) ou 270 € (1/26) : indemnité à confirmer', () => {
    // Contrat d'un an commencé le 1er juin 2025, semaines sans accueil saisies : jours acquis sûrs, seul le maintien diffère.
    const off = ['2025-07-07', '2025-07-14', '2025-07-21', '2025-07-28', '2025-08-04', '2025-08-11', '2025-08-18', '2025-08-25',
      '2025-10-27', '2025-12-22', '2025-12-29', '2026-02-16', '2026-02-23', '2026-04-13', '2026-04-20', '2026-05-04'];
    const c = contract({ start: '2025-06-01', trackedFrom: '2025-06-01', yearType: 'incomplete', weeks: 36, weeksOff: off, rateNet: 450 });
    const ind = indemnite(makeCtx(c, [], [], '2026-12-31'), 2025);
    expect(ind.aConfirmer?.message).toMatch(/1\/26/);
  });
});

import { compteur } from '../src/engine/conges';
describe('T-030 CPA-17 : jours de fractionnement non calculés, signalés', () => {
  // CCN 48.1.1.4 : « 2 jours ouvrables (…) si le nombre total de jours ouvrables de congés pris en dehors de la période
  // (…) du 1er mai au 31 octobre est de 6 jours ouvrables et plus ; 1 jour ouvrable, si (…) 3, 4 ou 5 jours ». L'app ne
  // calcule pas ces jours (part du congé principal, renonciation écrite) : elle le dit.
  const c = contract({ start: '2025-06-01', trackedFrom: '2025-06-01', balances: { cpRestants: 30, cpEnCours: 0, maladieDeduits: 0 } });
  it('6 jours pris en février : message « fractionnement » affiché', () => {
    const ctx = makeCtx(c, [], [{ id: 'f', type: 'cp', from: '2026-02-16', to: '2026-02-21' }], '2026-03-31');
    expect(compteur(ctx, '2026-03-01').fractionnementNonGere).toMatch(/fractionnement/);
  });
  it('congés pris en août seulement : pas de message', () => {
    const ctx = makeCtx(c, [], [{ id: 'e', type: 'cp', from: '2025-08-04', to: '2025-08-09' }], '2025-09-30');
    expect(compteur(ctx, '2025-09-01').fractionnementNonGere).toBeUndefined();
  });
});
