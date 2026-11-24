// T-019 : correction des 5 défauts F2 confirmés par la direction (rapport tests/ecarts-v0.md, journal du 18/11/2026).
// Chaque résultat attendu vient d'un cas officiel (tests/cas-officiels-v0.md) ou d'une règle confirmée
// (regles/regles-v0.md corrigé par regles/contre-verification-v0.md). Identifiant cité dans chaque test.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Contract, DayRec, Planning } from '../src/engine/model';
import { makeCtx, monthBase, salaireMensualise } from '../src/engine/payroll';
import { computeMonth, declarationLines } from '../src/engine/month';
import { acquisition, compteur, cpForMonth, decompteConge, indemnite, joursEnfants, moinsDe21Ans } from '../src/engine/conges';
import { finDeContrat } from '../src/engine/fin';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}

function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2025-09-01', yearType: 'complete', weeks: 52, weeksOff: [],
    planning: week('08:00', '16:00'), rateNet: 500, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2025-09-01',
    balances: { cpRestants: 30, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0,
    // Décision du DG du 18/11/2026 : sans réponse aux 3 questions T-031, le mois n'est pas calculé.
    alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false, ...over,
  };
}

const rec = (date: string, r: Partial<DayRec>): DayRec => ({ key: `c1|${date}`, cid: 'c1', date, ...r });
const cp = (id: string, from: string, to: string): AmLeave => ({ id, type: 'cp', from, to });

// Contrat de Mme Bertrand (C-MENS-02 : 40 h sur 5 jours, 36 semaines, 5 € de l'heure ; S-BERTRAND page 2)
const BERTRAND_OFF = ['2021-10-25', '2021-11-01', '2021-12-20', '2021-12-27', '2022-02-21', '2022-02-28', '2022-04-25', '2022-05-02',
  '2022-07-04', '2022-07-11', '2022-07-18', '2022-07-25', '2022-08-01', '2022-08-08', '2022-08-15', '2022-08-22'];
const bertrand = (over: Partial<Contract> = {}) => contract({ start: '2021-09-01', trackedFrom: '2021-09-01', yearType: 'incomplete', weeks: 36,
  weeksOff: BERTRAND_OFF, majoration: 15, ...over });

describe('T-019 (1) décompte des jours de congés pris, R-CP-09', () => {
  // AM du lundi, mardi, jeudi et vendredi (cas C-CPA-18, fiche DREETS Occitanie 1/5)
  const amLMJV = (leaves: AmLeave[], over: Partial<Contract> = {}) =>
    makeCtx(contract({ planning: week('08:00', '16:00', [1, 2, 4, 5]), ...over }), [], leaves, '2026-12-31');

  it('C-CPA-18 : une semaine saisie du lundi au samedi = 6 jours ouvrables', () => {
    const l = cp('a', '2026-03-09', '2026-03-14');
    expect(decompteConge(amLMJV([l]), l).jours).toBe(6);
  });
  it('C-CPA-18 : la même semaine saisie du lundi au vendredi (reprise le lundi) = 6 jours aussi', () => {
    const l = cp('a', '2026-03-09', '2026-03-13');
    expect(decompteConge(amLMJV([l]), l).jours).toBe(6);
  });
  it('C-CPA-18 : une semaine avec un jeudi férié et chômé (Ascension, 14 mai 2026) = 5 jours', () => {
    const l = cp('a', '2026-05-11', '2026-05-15');
    expect(decompteConge(amLMJV([l]), l).jours).toBe(5);
  });
  it('R-CP-09 : deux semaines saisies du lundi 20 au vendredi 31 juillet 2026, reprise le lundi 3 août = 12 jours (6 par semaine sans férié)', () => {
    const l = cp('a', '2026-07-20', '2026-07-31');
    const ctx = makeCtx(contract(), [], [l], '2026-12-31');
    expect(decompteConge(ctx, l).jours).toBe(12);
    expect(compteur(ctx, '2026-09-01').pris).toBe(12);
  });
  it('R-CP-09 : congé saisi à partir du mercredi non travaillé 11 mars 2026 = 3 jours (jeudi, vendredi, samedi)', () => {
    // « Le premier jour décompté est le premier jour ouvrable qui aurait dû être travaillé. »
    const l = cp('a', '2026-03-11', '2026-03-14');
    expect(decompteConge(amLMJV([l]), l).jours).toBe(3);
  });
  it('C-CPI-03 : congés du 1er au 13 août 2022 pendant des semaines sans accueil (Mme Bertrand) = 12 jours ouvrables', () => {
    const l = cp('a', '2022-08-01', '2022-08-13');
    expect(decompteConge(makeCtx(bertrand(), [], [l], '2022-12-31'), l).jours).toBe(12);
  });
  it('R-CP-09 : un arrêt maladie pendant le congé rend le décompte ambigu ; l’app le signale au lieu de choisir', () => {
    // « Les jours de CP qui coïncident avec un arrêt maladie ne sont pas décomptés » : le traitement des jours d'arrêt
    // entre le dernier jour saisi et la reprise n'est pas écrit (contre-vérification, point 2, CCN 48.1.1.3).
    const l = cp('a', '2026-03-09', '2026-03-13');
    const ctx = amLMJV([l, { id: 'm', type: 'am_malade', from: '2026-03-12', to: '2026-03-12' }]);
    const d = decompteConge(ctx, l);
    expect(d.aConfirmer).toMatch(/à confirmer/);
    const k = compteur(ctx, '2026-04-01');
    expect(k.decompteAConfirmer.length).toBe(1);
    expect(k.depassement).toBe(false);
    expect(monthBase(ctx, '2026-03').alerts.join(' ')).toMatch(/nombre de jours décomptés à confirmer/);
  });
  it('R-CP-09 : contrat qui finit avant la reprise : décompte signalé à confirmer', () => {
    const l = cp('a', '2026-07-20', '2026-07-24');
    const ctx = makeCtx(contract({ end: '2026-07-25' }), [], [l], '2026-12-31'); // fin le samedi : ce samedi compte-t-il ?
    expect(decompteConge(ctx, l).aConfirmer).toMatch(/Le contrat finit avant ta reprise/);
  });
});

describe('T-019 (2), revu par la T-103 (C11) : acquisition en année incomplète, une seule méthode (Cass. soc. 10/01/1980)', () => {
  it('C-CPA-04 (Mme Bertrand) : 20 jours, comme la fiche (« 31 semaines ÷ 4 × 2,5 = 19,37 » « arrondis à 20 »)', () => {
    const a = acquisition(makeCtx(bertrand(), [], [], '2022-12-31'), 2021);
    expect(a.aConfirmer).toBeUndefined();
    expect(a.jours).toBe(20);
  });
  it('C-CPA-04 : avec 2 enfants à charge (AM de 39 ans), 24 jours', () => {
    const a = acquisition(makeCtx(bertrand(), [], [], '2022-12-31'), 2021, 2);
    expect(a.jours).toBe(24);
    expect(a.enfantsBonus).toBe(4);
  });
  it('C-CPA-07 (fiche DREETS Occitanie 3/5) : 18 jours, comme la fiche (« 28 semaines ÷ 4 × 2,5 = 17,5 », « arrondi à 18 »)', () => {
    const occ = ['2021-10-25', '2021-11-01', '2021-12-20', '2021-12-27', '2022-02-14', '2022-02-21', '2022-02-28', '2022-04-18',
      '2022-04-25', '2022-05-02', '2022-05-09', '2022-07-25', '2022-08-01', '2022-08-08', '2022-08-15', '2022-08-22'];
    expect(acquisition(makeCtx(bertrand({ weeksOff: occ }), [], [], '2022-12-31'), 2021).jours).toBe(18);
  });
  it('C-CPA-05 (rupture au 30/09/2022, 2 semaines de congés en août) : 7 jours ; la fiche retient 8 (jours d’accueil ÷ 20), 7 en semaines', () => {
    // Divergence documentée : la fiche compte 58 jours d'accueil ÷ 20 (4 semaines de 5 jours) ; l'arrêt de 1980 compte juin,
    // mois complet, pour une période, puis le reste au prorata (CCN 48.1.1.2) : 6,96 → 7, comme la formule en semaines de la fiche.
    const ctx = makeCtx(bertrand({ end: '2022-09-30' }), [], [cp('a', '2022-08-01', '2022-08-13')], '2022-12-31');
    const a = acquisition(ctx, 2022);
    expect(a.aConfirmer).toBeUndefined();
    expect(a.jours).toBe(7);
  });
  it('C-CPI-03 (versement au fur et à mesure) : 12 jours pris en août, sans réserve', () => {
    const ctx = makeCtx(bertrand({ cpMode: 'fur' }), [], [cp('a', '2022-08-01', '2022-08-13')], '2022-12-31');
    expect(cpForMonth(ctx, '2022-08').aConfirmer).toBeUndefined();
  });
  it('juin 2022 : indemnité de congés versée, cases Pajemploi sans « à confirmer »', () => {
    const ctx = makeCtx(bertrand(), [], [], '2022-12-31');
    const juin = cpForMonth(ctx, '2022-06');
    expect(juin.aConfirmer).toBeUndefined();
    expect(juin.jours).toBe(20);
    expect(juin.indemnite).toBe(indemnite(ctx, 2021).montant);
    const lignes = declarationLines(ctx, computeMonth(ctx, '2022-06'));
    expect(lignes.find((l) => l.label === 'Jours de congés payés')?.value).toBe('20');
    expect(lignes.find((l) => l.label === 'Salaire net')?.value).not.toMatch(/à confirmer/);
  });
  it('fin du contrat : congés non pris d’une année incomplète calculés', () => {
    const f = finDeContrat(makeCtx(bertrand(), [], [], '2022-12-31'), '2022-05-02', 'retrait');
    expect(f.cpAConfirmer).toBeUndefined();
    expect(f.cpIndemnite).toBeGreaterThan(0);
  });
  it('sans toutes les semaines sans accueil au contrat : l’app les demande (B)', () => {
    const a = acquisition(makeCtx(bertrand({ weeksOff: [] }), [], [], '2022-12-31'), 2021);
    expect(a.aConfirmer?.message).toMatch(/Indique dans le contrat toutes tes semaines sans accueil/);
  });
  it('R-CP-01 : année complète, rien ne change (C-CPA-09 : 30 jours pour une période complète)', () => {
    const a = acquisition(makeCtx(contract({ start: '2025-06-01', trackedFrom: '2025-06-01' }), [], [], '2026-06-15'), 2025);
    expect(a.aConfirmer).toBeUndefined();
    expect(a.jours).toBe(30);
  });
});

describe('T-019 (3) heures complémentaires majorées au contrat, R-HC-02', () => {
  // Contrat de Mme Bertrand repris en 2026 (comme le comparateur) : heure complémentaire à 5,50 € pour 5 € (+ 10 %),
  // heure majorée à 5,75 € (+ 15 %).
  const c = bertrand({ start: '2026-09-01', trackedFrom: '2026-09-01', weeksOff: [], majorationCompl: 10 });
  it('C-HC-03 : semaine de 42 h : 2 h × 5,50 € = 11,00 € ; 611,00 € pour le mois', () => {
    const b = monthBase(makeCtx(c, [rec('2026-10-05', { pres: [{ a: '08:00', d: '18:00' }] })], [], '2026-11-15'), '2026-10');
    expect(b.complAmount).toBe(1100);
    expect(b.net).toBe(61100);
  });
  it('C-HC-04 : semaine de 47 h : 5 h × 5,50 € + 2 h × 5,75 € ; 639,00 € pour le mois', () => {
    const days = [rec('2026-10-05', { pres: [{ a: '08:00', d: '19:00' }] }), rec('2026-10-06', { pres: [{ a: '08:00', d: '20:00' }] })];
    const b = monthBase(makeCtx(c, days, [], '2026-11-15'), '2026-10');
    expect(b.complAmount).toBe(2750);
    expect(b.majAmount).toBe(1150);
    expect(b.net).toBe(63900);
  });
  it('C-HC-05 (Urssaf, 52 semaines, en net) : 416 + 13 h × 3,20 € + 5 h × 3,50 € = 475,10 €', () => {
    const k = contract({ start: '2026-09-01', trackedFrom: '2026-09-01', planning: week('09:00', '17:00', [2, 3, 4, 5]), rateNet: 300,
      majoration: 100 / 6, majorationCompl: 20 / 3 });
    const days = ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'].map((d) => rec(d, { pres: [{ a: '09:00', d: '21:30' }] }));
    expect(monthBase(makeCtx(k, days, [], '2026-11-15'), '2026-10').net).toBe(47510);
  });
  it('C-HC-06 (Urssaf, 37 semaines, en net) : 370 + 5 h × 3,20 € + 5 h × 3,50 € = 403,50 €', () => {
    const k = contract({ start: '2026-09-01', trackedFrom: '2026-09-01', yearType: 'incomplete', weeks: 37,
      planning: week('08:30', '18:30', [1, 2, 4, 5]), rateNet: 300, majoration: 100 / 6, majorationCompl: 20 / 3 });
    const days = ['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09'].map((d) => rec(d, { pres: [{ a: '08:30', d: '21:00' }] }));
    expect(monthBase(makeCtx(k, days, [], '2026-11-15'), '2026-10').net).toBe(40350);
  });
});

describe('T-019 (4) jours pour enfants à charge, R-CP-03', () => {
  it('R-CP-03 : 21 ans et plus : 2 jours par enfant, 30 jours au plus (C-CPA-02 : 25 + 2 = 27 jours)', () => {
    expect(joursEnfants(25, 1, false)).toBe(2);
    expect(joursEnfants(30, 2, false)).toBe(0);
  });
  it('R-CP-03 : moins de 21 ans : 2 jours par enfant sans limite de 30 jours ; 1 jour si le congé acquis ne dépasse pas 6 jours', () => {
    expect(joursEnfants(30, 2, true)).toBe(4);
    expect(joursEnfants(6, 2, true)).toBe(2);
    expect(joursEnfants(7, 2, true)).toBe(4);
  });
  it('R-CP-03 et C. trav. L3141-8 : âge apprécié au 30 avril de l’année précédente', () => {
    // Période du 1er juin 2025 au 31 mai 2026 : l'âge se lit au 30 avril 2025.
    // L'AM coche « moins de 21 ans le 30 avril 2025 » : vrai pour 2025 et les années d'avant, pas pour 2026.
    expect(moinsDe21Ans(2025, 2025)).toBe(true);
    expect(moinsDe21Ans(2025, 2024)).toBe(true);
    expect(moinsDe21Ans(2025, 2026)).toBe(false);
    expect(moinsDe21Ans(undefined, 2025)).toBe(false);
  });
  it('R-CP-03 (situation X-CP03-MOINS21) : AM de 20 ans, 2 enfants, période complète : 30 + 4 = 34 jours', () => {
    const c = contract({ start: '2025-06-01', trackedFrom: '2025-06-01', rateNet: 420 });
    const ctx = makeCtx(c, [], [], '2026-06-15', 2, 2025);
    const a = acquisition(ctx, 2025, 2);
    expect(a.enfantsBonus).toBe(4);
    expect(a.jours).toBe(34);
    // Sans case cochée : règle des 21 ans et plus (30 jours au plus)
    expect(acquisition(makeCtx(c, [], [], '2026-06-15', 2), 2025, 2).jours).toBe(30);
  });
});

describe('T-019 (5) décès de l’enfant : indemnité égale au préavis, R-FIN-07', () => {
  it('R-FIN-07 et R-FIN-02 (situation X-DECES-6MOIS) : durée du retrait de l’enfant, 15 jours entre 3 mois et un an', () => {
    const c = contract({ start: '2026-03-02', trackedFrom: '2026-03-02', rateNet: 420 });
    const f = finDeContrat(makeCtx(c, [], [], '2026-12-31'), '2026-09-15', 'deces');
    expect(f.preavisLabel).toMatch(/^15 jours calendaires/);
    expect(f.indemnitePreavis).toBeGreaterThan(0);
    // Le contrat s'arrête le jour du décès (R-FIN-07) : pas de préavis à faire.
    expect(f.dernierJour).toBe('2026-09-15');
  });
  it('R-FIN-07 et R-FIN-05 : un mois de préavis sur un mois civil entier = le salaire mensualisé du mois', () => {
    // Ancienneté de plus d'un an ; décès le 31 octobre 2026 : indemnité pour novembre 2026 entier.
    // R-FIN-05 : « indemnité = salaire mensualisé du ou des mois concernés ».
    const c = contract({ start: '2024-09-02', trackedFrom: '2024-09-02', rateNet: 420 });
    const f = finDeContrat(makeCtx(c, [], [], '2026-12-31'), '2026-10-31', 'deces');
    expect(f.preavisLabel).toMatch(/^1 mois/);
    expect(f.indemnitePreavis).toBe(salaireMensualise(c));
  });
  it('R-FIN-07 : l’indemnité égale au préavis est due aussi avant 9 mois, comme le 1/80 depuis T-034 (A-47, F16842)', () => {
    const c = contract({ start: '2026-03-02', trackedFrom: '2026-03-02', rateNet: 420 });
    const f = finDeContrat(makeCtx(c, [], [], '2026-12-31'), '2026-09-15', 'deces');
    expect(f.indemniteRupture).toBe(Math.round(f.totalBrut / 80));
    expect(f.indemnitePreavis).toBeGreaterThan(0);
  });
  it('R-FIN-05 : pas d’indemnité égale au préavis pour un retrait ou une démission', () => {
    const c = contract({ start: '2024-09-02', trackedFrom: '2024-09-02' });
    expect(finDeContrat(makeCtx(c, [], [], '2026-12-31'), '2026-10-01', 'retrait').indemnitePreavis).toBe(0);
  });
});
