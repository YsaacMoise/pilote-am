// Volet A du lot 3 : les exemples chiffrés des fiches officielles deviennent des tests.
//
// Chaque test reprend les données d'un exemple résolu d'une fiche publiée par une administration, et compare le
// résultat de l'app au montant officiel. `ecart` = montant officiel − montant de l'app, en centimes (ou en jours,
// en heures). Un test passe quand l'écart observé est exactement l'écart écrit ici :
//   - ecart 0 : l'app donne le montant officiel ;
//   - écart d'arrondi (1 ou 2 centimes) : la fiche coupe au centime (866,66 pour 866,666…), l'app arrondit au plus
//     proche comme Pajemploi (866,67) ; l'écart se propage quand ce montant est additionné ;
//   - autre écart : divergence de méthode, décrite dans le test et dans AUDIT-SUIVI.md (lot 3). Si l'app change,
//     le test casse : il faut alors relire la fiche et décider.
//
// Les fiches raisonnent en brut, l'app en net : le moteur est linéaire, on lui donne donc le taux brut à la place
// du taux net, et la conversion net → brut (rapport fixe) est neutralisée pour l'indemnité de rupture.
//
// Sources (lues le 07/11/2026) :
//   [OCC52] DDETS 31 / DREETS Occitanie, « FICHE Accueil sur 52 semaines sur une période de 12 mois consécutifs »,
//           version du 30/03/2023. https://occitanie.dreets.gouv.fr/Guides-juridiques-Assistants-maternels
//   [OCC46] DDETS 31 / DREETS Occitanie, « FICHE Accueil sur 46 semaines ou moins sur une période de 12 mois
//           consécutifs », version du 30/03/2023 (même page).
//   [OCCREG] DDETS 31, « FICHE RÉGULARISATION », version du 05/11/2024 (exemples en NET).
//   [OCCCP3], [OCCCP4], [OCCCP5] DDETS 31, fiches congés payés 3/5, 4/5 et 5/5, version du 05/11/2024.
//   [OCCCP1] DDETS 31, « FICHE 1/5 : SYNTHESE CONGES PAYES », version du 05/11/2024.
//   [BFC]   DREETS Bourgogne-Franche-Comté, « GUIDE ASSISTANTS MATERNELS », août 2026 (fichier « Maj 06 2026 »),
//           https://bourgogne-franche-comte.dreets.gouv.fr/sites/dreets-bourg-fc/files/2026-08/Assistante%20maternelles%20Maj%2006%202026.pdf
//           (pages = pages du PDF).
//   [ARA]   DREETS Auvergne-Rhône-Alpes, « ASSISTANTS MATERNELS … REMUNERATION » (18/03/2024) et « … CONGES PAYES »
//           (12/06/2023), https://auvergne-rhone-alpes.dreets.gouv.fr/assistants-maternels
//   [PDL]   DREETS Pays de la Loire, « Rémunération, indemnités et frais », juin 2026,
//           https://pays-de-la-loire.dreets.gouv.fr/sites/pays-de-la-loire.dreets.gouv.fr/IMG/pdf/fiche_remu_indemnites_frais_au_12062026.pdf
//   [CTN]   Code du travail numérique, fiches service-public « Démission d'une assistante maternelle » (21/07/2026),
//           « Congés payés d'une assistante maternelle » (23/05/2025), https://code.travail.gouv.fr
// Pajemploi (pajemploi.urssaf.fr) et les pages congés et absences d'urssaf.fr refusent la lecture par un robot :
// aucun exemple Urssaf ou Pajemploi n'a pu être lu à la source. La DREETS Normandie ne publie pas de fiche AM.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/engine/rates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/engine/rates')>()),
  netToBrut: (n: number) => n,
}));

import type { AmLeave, Contract, DayRec, Planning } from '../src/engine/model';
import { makeCtx, monthBase, salaireMensualise } from '../src/engine/payroll';
import { acquisition, baseDixieme, cpForMonth, indemnite, joursOuvrables, maintien } from '../src/engine/conges';
import { finDeContrat } from '../src/engine/fin';
import { entretienPlancher, ratesAt } from '../src/engine/rates';

function semaine(start: string, end: string, jours = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of jours) p[d] = [{ start, end }];
  return p;
}

function contrat(o: Partial<Contract>): Contract {
  return {
    id: 'c1', child: 'Pierre', family: 'Exemple', color: 0, start: '2021-09-01', yearType: 'complete', weeks: 52, weeksOff: [],
    planning: semaine('08:00', '16:00'), rateNet: 500, majoration: 15, entretienJour: 0, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'fur', majoreFiscal: false, trackedFrom: o.start ?? '2021-09-01',
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, ...o,
  };
}

const pres = (date: string, a: string, d: string): DayRec => ({ key: `c1|${date}`, cid: 'c1', date, pres: [{ a, d }] });
const conge = (type: AmLeave['type'], from: string, to: string): AmLeave => ({ id: `${type}${from}`, type, from, to });

/** Écart officiel − app. */
function ecart(app: number, officiel: number, attendu: number) {
  expect(officiel - app).toBe(attendu);
}

// ---------------------------------------------------------------------------------------------------------------
// [OCC52] Mme Durand : 40 h du lundi au vendredi (8 h par jour), 5 € brut, majoration 15 % au-delà de 45 h,
// heures complémentaires majorées de 10 % par accord (5,50 €), 1 enfant à charge, embauche le 01/09/2021.
// Malade du mercredi au vendredi en octobre 2021 ; congés du 18/07 au 14/08/2022 ; retrait remis en main propre
// le 01/09/2022.
// ---------------------------------------------------------------------------------------------------------------
describe('[OCC52] DDETS 31, accueil sur 52 semaines (version du 30/03/2023)', () => {
  const c = contrat({});
  const leaves = [conge('am_malade', '2021-10-13', '2021-10-15'), conge('cp', '2022-07-18', '2022-08-14')];
  const ctx = () => makeCtx(c, [], leaves, '2022-10-15', 1);

  it('p. 2 : 40 h × 52 ÷ 12 = 173,333 h × 5 € = 866,66 € (fiche coupée au centime, app 866,67)', () => {
    ecart(salaireMensualise(c), 86666, -1);
  });

  it('p. 3 : octobre 2021, 168 h prévues, 24 h d’absence : 866,66 − 123,80 = 742,86 €', () => {
    const b = monthBase(ctx(), '2021-10');
    expect(b.divisorMin).toBe(168 * 60);
    expect(b.deductedMin).toBe(24 * 60);
    ecart(b.base, 74286, 0);
  });

  it('p. 3 : 42 h dans la semaine : 2 heures complémentaires (montant : majoration contractuelle de 10 % non gérée)', () => {
    // La fiche place la semaine en « deuxième semaine de novembre » sans tenir compte du 11 novembre : on prend la
    // semaine du 15 novembre 2021, sans jour férié.
    const recs = [pres('2021-11-15', '08:00', '17:00'), pres('2021-11-16', '08:00', '17:00')];
    const b = monthBase(makeCtx(c, recs, [], '2021-12-15'), '2021-11');
    expect(b.complMin).toBe(120);
    expect(b.majMin).toBe(0);
    // 2 h × 5,50 € = 11 € ; l'app paie les heures complémentaires au taux du contrat (2 h × 5 € = 10 €).
    ecart(b.complAmount, 1100, 100);
  });

  it('p. 4 : 47 h dans la semaine : 5 h complémentaires et 2 h majorées à 5,75 € = 11,50 €', () => {
    const recs = [pres('2021-11-15', '07:00', '16:00'), pres('2021-11-16', '07:00', '17:00'), pres('2021-11-17', '07:00', '17:00'), pres('2021-11-18', '07:00', '17:00')];
    const b = monthBase(makeCtx(c, recs, [], '2021-12-15'), '2021-11');
    expect(b.complMin).toBe(300);
    expect(b.majMin).toBe(120);
    ecart(b.majAmount, 1150, 0);
    // 5 h × 5,50 € = 27,50 € (majoration contractuelle) ; app 5 h × 5 € = 25 €.
    ecart(b.complAmount, 2750, 250);
  });

  it('p. 4-5 : congés du 01/09/2021 au 31/05/2022 : 39 semaines → 24,375 → 25 jours, + 2 pour enfant à charge = 27', () => {
    const a = acquisition(ctx(), 2021, 1);
    ecart(a.jours - a.enfantsBonus, 25, 0);
    ecart(a.jours, 27, 0);
  });

  it('p. 6 : maintien pour 12 jours (2 semaines de 40 h) = 400 € ; dixième 7 676,14 × 10 % = 767,61 €', () => {
    ecart(maintien(ctx(), 12, '2022-07-18'), 40000, 0);
    const { base } = baseDixieme(ctx(), 2021, 1);
    // 8 mois à 866,67 au lieu de 866,66 : 8 centimes sur la base, 1 centime sur le dixième.
    ecart(base, 767614, -8);
    ecart(Math.round(base / 10), 76761, -1);
  });

  it('p. 7 : 27 jours : dixième 767,61 × 27 ÷ 25 = 829,01 € ; maintien (4 semaines + 3 jours de 8 h) = 920 €', () => {
    const ind = indemnite(ctx(), 2021, 1);
    ecart(ind.dixieme, 82901, -2); // arrondi propagé (866,67)
    // Divergence de méthode M-1 : la fiche compte les 3 jours restants comme 3 jours de travail de 8 h ; l'app (comme
    // le guide BFC d'août 2026, 1/26 du salaire mensualisé par jour ouvrable) compte 27 ÷ 6 semaines = 900 €.
    ecart(ind.maintien, 92000, 2000);
  });

  it('p. 7 : retrait remis le 01/09/2022 : préavis d’un mois, fin le 30/09/2022', () => {
    const f = finDeContrat(ctx(), '2022-09-01', 'retrait', 1);
    expect(f.preavisFin).toBe('2022-09-30');
    ecart(monthBase(ctx(), '2022-09').net, 86666, -1);
  });

  it('p. 8 : solde de congés à la rupture : 3 + 11 = 14 jours', () => {
    const f = finDeContrat(ctx(), '2022-09-01', 'retrait', 1);
    ecart(f.cpJoursRestants, 14, 0);
  });

  it('p. 9 : indemnité compensatrice 120 € (3 jours) + 400 € (11 jours) = 520 €', () => {
    const f = finDeContrat(ctx(), '2022-09-01', 'retrait', 1);
    // Divergence M-1 : 3 jours = 3 × 8 h = 120 € et 11 jours = 1 semaine + 5 jours de 8 h = 400 € pour la fiche ;
    // l'app : 3 ÷ 6 × 200 = 100 € et 11 ÷ 6 × 200 = 366,67 € (méthode 1/26 du guide BFC, Cass. soc. 4 sept. 2024).
    ecart(f.cpIndemnite, 52000, 5333);
  });

  it('p. 10 : indemnité de rupture 11 662,78 ÷ 80 = 145,78 € (assiette : salaires et indemnité compensatrice)', () => {
    const f = finDeContrat(ctx(), '2022-09-01', 'retrait', 1);
    // Assiette app : 742,86 + 12 × 866,67 + 466,67 = 11 609,57 €. Écart = 53,33 € d'indemnité compensatrice (M-1)
    // et 12 centimes d'arrondi.
    ecart(f.totalBrut, 1166278, 5321);
    ecart(f.indemniteRupture, 14578, 66);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// [OCC46] Mme Bertrand : 40 h du lundi au vendredi, 5 € brut, 36 semaines programmées à partir du 01/09/2021,
// 2 enfants à charge, congés payés versés au fur et à mesure de la prise. Malade 3 jours en octobre 2021 ;
// congés du 01/08 au 13/08/2022 ; retrait remis en main propre le 01/09/2022.
// ---------------------------------------------------------------------------------------------------------------
describe('[OCC46] DDETS 31, accueil sur 46 semaines ou moins (version du 30/03/2023)', () => {
  // Semaines déduites (p. 1) : 25/10–07/11/2021, 20/12/2021–02/01/2022, 21/02–06/03/2022, 25/04–08/05/2022,
  // 04/07–28/08/2022 = 16 semaines. Seconde année : la fiche ne les donne pas ; le contrat en prévoit 16 aussi, après
  // la fin du contrat (sans effet sur les calculs, mais l'app exige qu'elles soient saisies, C-002).
  const an1 = ['2021-10-25', '2021-11-01', '2021-12-20', '2021-12-27', '2022-02-21', '2022-02-28', '2022-04-25', '2022-05-02',
    '2022-07-04', '2022-07-11', '2022-07-18', '2022-07-25', '2022-08-01', '2022-08-08', '2022-08-15', '2022-08-22'];
  const an2 = ['2022-10-24', '2022-10-31', '2022-12-19', '2022-12-26', '2023-02-13', '2023-02-20', '2023-04-17', '2023-04-24',
    '2023-07-10', '2023-07-17', '2023-07-24', '2023-07-31', '2023-08-07', '2023-08-14', '2023-08-21', '2023-08-28'];
  const c = contrat({ yearType: 'incomplete', weeks: 36, weeksOff: [...an1, ...an2], majoration: 15 });
  const leaves = [conge('am_malade', '2021-10-13', '2021-10-15'), conge('cp', '2022-08-01', '2022-08-13')];
  const ctx = () => makeCtx(c, [], leaves, '2022-10-15', 2);

  it('p. 2 : 40 h × 36 ÷ 12 = 120 h × 5 € = 600 €', () => {
    ecart(salaireMensualise(c), 60000, 0);
  });

  it('p. 3-4 : octobre 2021, 3 jours d’absence sur 21 : 600 − 85,71 = 514,29 €', () => {
    const b = monthBase(ctx(), '2021-10');
    expect(b.divisorDays).toBe(21);
    ecart(b.base, 51429, 0);
  });

  it('p. 4 : 47 h dans la semaine : 5 h complémentaires et 2 h majorées à 5,75 €', () => {
    const recs = [pres('2021-10-04', '07:00', '16:00'), pres('2021-10-05', '07:00', '17:00'), pres('2021-10-06', '07:00', '17:00'), pres('2021-10-07', '07:00', '17:00')];
    const b = monthBase(makeCtx(c, recs, [], '2021-11-15'), '2021-10');
    expect(b.complMin).toBe(300);
    expect(b.majMin).toBe(120);
    ecart(b.majAmount, 1150, 0);
    ecart(b.complAmount, 2750, 250); // majoration contractuelle de 10 % des heures complémentaires non gérée
  });

  it('p. 5-6 : 31 semaines programmées → 19,37 → 20 jours, + 4 pour 2 enfants à charge = 24', () => {
    const a = acquisition(ctx(), 2021, 2);
    ecart(a.jours - a.enfantsBonus, 20, 0);
    ecart(a.jours, 24, 0);
  });

  it('p. 7 : 24 jours : maintien 800 €, dixième 531,42 × 24 ÷ 20 = 637,70 €', () => {
    const ind = indemnite(ctx(), 2021, 2);
    ecart(ind.maintien, 80000, 0);
    ecart(ind.dixieme, 63770, -1); // arrondi (531,429 coupé à 531,42 par la fiche)
    ecart(ind.montant, 80000, 0);
  });

  it('p. 8 : versement au fur et à mesure : 400 € pour les 12 jours pris en août 2022', () => {
    const cp = cpForMonth(ctx(), '2022-08', 2);
    ecart(cp.jours, 12, 0);
    ecart(cp.indemnite, 40000, 0);
  });

  it('p. 9 : retrait au 01/09/2022 : régularisation définitive 5,71 + 280 = 285,71 € (4 fériés chômés payés comptés)', () => {
    const f = finDeContrat(ctx(), '2022-09-01', 'retrait', 2);
    expect(f.preavisFin).toBe('2022-09-30');
    ecart(f.regularisation, 28571, 0);
  });

  it('p. 10 : congés acquis du 01/06 au 30/09/2022 : 11 semaines (dont 2 de congés) et 3 jours → 8 jours', () => {
    const f = finDeContrat(ctx(), '2022-09-01', 'retrait', 2);
    // 12 jours restant de la période précédente + 8 en cours.
    ecart(f.cpJoursRestants, 20, 0);
  });

  it('p. 11 : indemnité compensatrice 400 € (12 jours restants) + 348,57 € (dixième, régularisation comprise)', () => {
    const f = finDeContrat(ctx(), '2022-09-01', 'retrait', 2);
    // Divergence M-5 : la fiche met aussi dans la base du dixième les 400 € d'indemnité compensatrice de la période
    // précédente ; le guide BFC (p. 40-41) ne le fait pas, l'app non plus : (2 400 + 400 + 285,71) × 10 % = 308,57 €.
    ecart(f.cpIndemnite, 74857, 4000);
  });

  it('p. 11 : indemnité de rupture 9 148,57 ÷ 80 = 114,35 € (assiette : salaires, régularisation, congés)', () => {
    const f = finDeContrat(ctx(), '2022-09-01', 'retrait', 2);
    // Assiette : régularisation et indemnité compensatrice comprises, comme la fiche ; écart = les 40 € de M-5.
    ecart(f.totalBrut, 914857, 4000);
    ecart(f.indemniteRupture, 11435, 49);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// [OCCREG] Fiche régularisation (05/11/2024, montants NETS) : 36 semaines, 40 h du lundi au vendredi, 3 € net,
// heures complémentaires au taux du contrat, contrat commencé le 01/01/2024, 4 semaines de 45 h en juin 2024.
// ---------------------------------------------------------------------------------------------------------------
describe('[OCCREG] DDETS 31, régularisation à la rupture (version du 05/11/2024, p. 4)', () => {
  // 22 semaines travaillées du 01/01 au 31/08/2024 (21 jusqu'au 30/06) : semaines sans accueil choisies pour cela,
  // la fiche ne les donne pas (les fériés chômés payés comptent comme dus, ils ne changent donc rien).
  const off = ['2024-02-19', '2024-02-26', '2024-04-15', '2024-04-22', '2024-05-27',
    '2024-07-08', '2024-07-15', '2024-07-22', '2024-07-29', '2024-08-05', '2024-08-12', '2024-08-19', '2024-08-26',
    '2024-10-21', '2024-10-28', '2024-12-23'];
  const juin = ['2024-06-03', '2024-06-10', '2024-06-17', '2024-06-24'].flatMap((lundi) =>
    [0, 1, 2, 3, 4].map((k) => pres(new Date(Date.parse(lundi) + k * 864e5).toISOString().slice(0, 10), '08:00', '17:00')));

  it('exemple 1 : contrat jusqu’au 31/08/2024, payé 2 940 €, dû 2 700 € : rien à régulariser (+240 € acquis)', () => {
    const c = contrat({ start: '2024-01-01', yearType: 'incomplete', weeks: 36, weeksOff: off, rateNet: 300 });
    const ctx = makeCtx(c, juin, [], '2024-09-15');
    expect(monthBase(ctx, '2024-01').base).toBe(36000);
    expect(monthBase(ctx, '2024-06').complAmount).toBe(6000);
    // Salaires versés de janvier à août : 8 × 360 + 60 = 2 940 €.
    let verse = 0;
    for (let m = 1; m <= 8; m++) verse += monthBase(ctx, `2024-0${m}`).net;
    ecart(verse, 294000, 0);
    const f = finDeContrat(ctx, '2024-07-15', 'retrait', 0, '2024-08-17');
    expect(f.dernierJour).toBe('2024-08-31');
    ecart(f.regularisation, 0, 0);
  });

  it('exemple 2 : contrat jusqu’au 30/06/2024, payé 2 220 €, dû 2 580 € : 360 € net dus', () => {
    const c = contrat({ start: '2024-01-01', yearType: 'incomplete', weeks: 36, weeksOff: off, rateNet: 300 });
    const ctx = makeCtx(c, juin, [], '2024-07-15');
    const f = finDeContrat(ctx, '2024-06-15', 'retrait', 0);
    expect(f.dernierJour).toBe('2024-06-29');
    // La fin au 29/06 (15 jours de préavis) laisse le dimanche 30 hors contrat, sans effet : aucun accueil prévu.
    ecart(f.regularisation, 36000, 0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// [OCCCP3-5] Fiches congés payés (05/11/2024) : embauche le 01/09/2021, 40 h, 5 € brut, 12 jours pris en août 2022,
// fin du préavis le 31/08/2022. Pas d'absence.
// ---------------------------------------------------------------------------------------------------------------
describe('[OCCCP] DDETS 31, fiches congés payés 3/5 à 5/5 (version du 05/11/2024)', () => {
  it('4/5 p. 1 : 52 semaines, dixième 866,66 × 9 = 7 799,94 → 779,99 € ; 9 mois → 23 jours (app : 39 semaines → 25)', () => {
    const c = contrat({});
    const ctx = makeCtx(c, [], [conge('cp', '2022-08-01', '2022-08-13')], '2022-09-15');
    ecart(Math.round(baseDixieme(ctx, 2021).base / 10), 77999, -1);
    // Divergence M-2 : la fiche 4/5 (et le guide BFC) comptent en mois (9 × 2,5 = 22,5 → 23) ; la fiche « Accueil sur
    // 52 semaines » de la même DDETS et l'app comptent en semaines (39 ÷ 4 × 2,5 = 24,375 → 25), plus favorable.
    ecart(acquisition(ctx, 2021).jours, 23, -2);
  });

  it('4/5 p. 4 : 52 semaines, août 2022 : dixième 406,95 € pour 12 jours contre 400 € (salaire d’août 873,61 €)', () => {
    const c = contrat({});
    const ctx = makeCtx(c, [], [conge('cp', '2022-08-01', '2022-08-13')], '2022-09-15');
    // Divergence M-2 et M-3 : avec 25 jours, le dixième (780,00 €) reste sous le maintien (833,33 €), l'app ne verse aucun
    // complément ; la fiche, avec 23 jours, verse 6,95 € en août, mois de la prise (l'app verse le complément en juin).
    const aout = monthBase(ctx, '2022-08').net + cpForMonth(ctx, '2022-08').indemnite + cpForMonth(ctx, '2022-06').complement;
    ecart(aout, 87361, 694);
  });

  it('5/5 p. 2-4 : 52 semaines, fin au 31/08/2022 : dixième 671,03 € contre maintien 680 € (20 jours) : 680 €', () => {
    const c = contrat({});
    const ctx = makeCtx(c, [], [conge('cp', '2022-08-01', '2022-08-13')], '2022-09-15');
    const f = finDeContrat(ctx, '2022-07-31', 'retrait', 0, '2022-08-17'); // 15 jours de préavis (moins d'un an)
    expect(f.dernierJour).toBe('2022-08-31');
    // Jours restants : 23 − 12 + 9 = 20 pour la fiche ; 25 − 12 + 9 = 22 pour l'app (M-2). Maintien (fiche) :
    // 3 semaines + 2 jours de 8 h = 680 € ; app : 13 ÷ 6 × 200 = 433,33 € et 9 jours au plus favorable
    // (maintien 300 € contre dixième 3 × 866,67 ÷ 10 = 260 €) = 733,33 €. La fiche compare aussi dixième et maintien
    // sur le total des deux périodes, l'app période par période (M-6).
    ecart(f.cpJoursRestants, 20, -2);
    ecart(f.cpIndemnite, 68000, -5333);
  });

  it('3/5 et 4/5 : 46 semaines (36), maintien de 18 jours = 3 semaines = 600 €, de 12 jours = 400 €', () => {
    // Le maintien de 18 jours : 18 ÷ 6 × 40 h × 5 € (formule Pajemploi citée par la fiche 3/5) = 600 €.
    const c = contrat({ yearType: 'incomplete', weeks: 36 });
    expect(maintien(makeCtx(c, [], [], '2022-06-01'), 18, '2022-06-01')).toBe(60000);
    ecart(maintien(makeCtx(c, [], [], '2022-06-01'), 12, '2022-06-01'), 40000, 0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// [BFC] Guide DREETS Bourgogne-Franche-Comté, août 2026.
// ---------------------------------------------------------------------------------------------------------------
describe('[BFC] guide DREETS Bourgogne-Franche-Comté (août 2026)', () => {
  const c52 = contrat({ start: '2024-01-01', rateNet: 450 });

  it('p. 27 : (4,5 € × 40 h × 52) ÷ 12 = 780 €', () => {
    ecart(salaireMensualise(c52), 78000, 0);
  });

  it('p. 27 : février, 168 h prévues, 40 h d’absence sans droits à congés : 780 − 185,71 = 594,29 €', () => {
    // Février 2024 compte 21 jours ouvrés (168 h). Semaine de congés sans droits acquis : sans solde (C-004).
    const ctx = makeCtx(c52, [], [conge('cp', '2024-02-12', '2024-02-17')], '2024-03-15');
    const b = monthBase(ctx, '2024-02');
    expect(b.divisorMin).toBe(168 * 60);
    ecart(b.base, 59429, 0);
  });

  it('p. 27 : première période, dixième 1/10 × (780 × 4 + 594,29) = 371,43 €', () => {
    const ctx = makeCtx(c52, [], [conge('cp', '2024-02-12', '2024-02-17')], '2024-06-15');
    ecart(Math.round(baseDixieme(ctx, 2023).base / 10), 37143, 0);
  });

  it('p. 28 : maintien 13 jours = 13/26 × 780 = 390 € (52 semaines : 1/26 du salaire = 1/6 de la semaine)', () => {
    ecart(maintien(makeCtx(c52, [], [], '2024-06-01'), 13, '2024-06-01'), 39000, 0);
  });

  it('p. 28 : août, 13 jours de congés + 1 férié + 4 jours sans solde sur 184 h : retenue 32 h, 644,35 €', () => {
    // Août 2023 : 23 jours ouvrés (184 h), 15 août un mardi. Absence du lundi 7 au samedi 26 août ; droits : 13 jours.
    const c = contrat({ start: '2023-01-02', trackedFrom: '2023-06-01', rateNet: 450, balances: { cpRestants: 13, cpEnCours: 0, maladieDeduits: 0 } });
    const b = monthBase(makeCtx(c, [], [conge('cp', '2023-08-07', '2023-08-26')], '2023-09-15'), '2023-08');
    expect(b.divisorMin).toBe(184 * 60);
    // Divergence M-4 : le guide retient 4 jours de 8 h (32 h). L'app consomme les droits dans l'ordre chronologique :
    // les 4 derniers jours ouvrables (mercredi 23 au samedi 26) sont sans solde, dont un samedi non travaillé : 24 h,
    // 780 × 160 ÷ 184 = 678,26 €.
    expect(b.deductedMin).toBe(24 * 60);
    ecart(b.base, 64435, -3391);
  });

  it('p. 28 : décembre, 176 h, 40 h sans solde : 602,73 € ; février N+1, 160 h : 585 €', () => {
    // Décembre 2022 : 22 jours ouvrés ; février 2023 : 20 jours ouvrés.
    const c = contrat({ start: '2022-01-03', rateNet: 450 });
    const ctx = makeCtx(c, [], [conge('sans_solde', '2022-12-12', '2022-12-16'), conge('sans_solde', '2023-02-13', '2023-02-17')], '2023-03-15');
    ecart(monthBase(ctx, '2022-12').base, 60273, 0);
    ecart(monthBase(ctx, '2023-02').base, 58500, 0);
  });

  it('p. 28 : deuxième période, maintien de 30 jours = 30/26 × 780 = 900 €', () => {
    ecart(maintien(makeCtx(c52, [], [], '2025-06-01'), 30, '2025-06-01'), 90000, 0);
  });

  it('p. 30 : 36 semaines, (4,5 € × 40 h × 36) ÷ 12 = 540 €', () => {
    ecart(salaireMensualise(contrat({ start: '2024-01-01', yearType: 'incomplete', weeks: 36, rateNet: 450 })), 54000, 0);
  });

  it('p. 30-31 : 36 semaines, maintien = 1/26 du salaire mensualisé par jour : 13 jours = 270 €, 30 jours = 623,16 €', () => {
    const c = contrat({ start: '2024-01-01', yearType: 'incomplete', weeks: 36, rateNet: 450 });
    const ctx = makeCtx(c, [], [], '2024-06-01');
    // Divergence M-1 (année incomplète) : le guide BFC applique 1/26 du salaire mensualisé par jour ouvrable (par
    // analogie avec Cass. soc. 4 sept. 2024, n° 22-21.233) ; l'app, comme la DDETS 31 (fiches 3/5 et 4/5) et la formule
    // Pajemploi, paie jours ÷ 6 × heures de la semaine × taux : 13 jours = 390 €, 30 jours = 900 €.
    ecart(maintien(ctx, 13, '2024-06-01'), 27000, -12000);
    // Le guide écrit 623,16 € (30/26 × 540 = 623,08 € en réalité) : on garde le chiffre du guide.
    ecart(maintien(ctx, 30, '2024-06-01'), 62316, -27684);
  });

  it('p. 38-39 : rupture en cours de mois, 52 semaines, 45 h à 4 € : 780 × 63/198 = 248,18 €, reste 531,82 €', () => {
    // Août 2024 : 22 jours ouvrés (198 h) ; fin du contrat le mercredi 21 : 7 jours (63 h) après la fin.
    const c = contrat({ start: '2024-01-01', end: '2024-08-21', planning: semaine('08:00', '17:00'), rateNet: 400 });
    ecart(salaireMensualise(c), 78000, 0);
    ecart(monthBase(makeCtx(c, [], [], '2024-09-15'), '2024-08').base, 53182, 0);
  });

  it('p. 39 : rupture en cours de mois, 36 semaines, 32 h sur 4 jours à 4 € : 384 × 6/18 = 128 €, reste 256 €', () => {
    // Mai 2024 : 18 lundis, mardis, jeudis et vendredis ; fin du contrat le mardi 21 : 6 jours après la fin.
    const c = contrat({ start: '2024-01-01', end: '2024-05-21', yearType: 'incomplete', weeks: 36, planning: semaine('08:00', '16:00', [1, 2, 4, 5]), rateNet: 400 });
    ecart(salaireMensualise(c), 38400, 0);
    ecart(monthBase(makeCtx(c, [], [], '2024-06-15'), '2024-05').base, 25600, 0);
  });

  it('p. 40-41 : rupture au 31/08, 52 semaines, 45 h à 4 € : 702 − 540 = 162 € et 240 € (8 jours en cours)', () => {
    // Embauche le 1er septembre N-1, 3 semaines de congés en août N (18 jours) : N = 2027, où le 15 août tombe un
    // dimanche (sinon les 3 semaines ne font que 17 jours ouvrables).
    const c = contrat({ start: '2026-09-01', planning: semaine('08:00', '17:00'), rateNet: 400 });
    const ctx = makeCtx(c, [], [conge('cp', '2027-08-02', '2027-08-21')], '2027-09-15');
    const f = finDeContrat(ctx, '2027-08-16', 'retrait', 0, '2027-08-17'); // 15 jours de préavis (moins d'un an)
    expect(f.dernierJour).toBe('2027-08-31');
    // Divergence M-2 : 9 mois × 2,5 = 23 jours pour le guide ; 39 semaines → 25 jours pour l'app. Avec 25 jours, le
    // dixième (702 €) reste au-dessous du maintien (750 €) : l'app verse 0 € de complément en juin, puis le maintien
    // des 7 jours restants (210 €) ; le guide verse 162 €.
    const prec = cpForMonth(ctx, '2027-06').complement;
    expect(prec).toBe(0);
    // Période en cours, du 01/06 au 31/08 : 3 mois → 8 jours (guide) ; 13,1 semaines → 9 jours (app, M-2) :
    // maintien 9/26 × 780 = 270 €, dixième 3 × 780 ÷ 10 = 234 € (le guide non plus n'ajoute pas l'indemnité
    // compensatrice de la période précédente à la base : M-5).
    ecart(f.cpIndemnite, 16200 + 24000, 40200 - 48000);
  });

  it('p. 51 et [PDL] p. 1 : minimum conventionnel 4,20 € brut (3,28 € net) au 1er juin 2026, SMIC 12,31 €', () => {
    const r = ratesAt('2026-06-01');
    ecart(r.minConvBrut, 420, 0);
    ecart(r.minConvNet, 328, 0);
    ecart(r.smic, 1231, 0);
    // Minimum légal 0,281 × 12,31 = 3,46 € : sous le minimum conventionnel, qui s'applique.
    expect(Math.round(0.281 * r.smic)).toBe(346);
  });

  it('p. 52 et [PDL] p. 1 : entretien 4,35 × 0,9 ÷ 9 = 0,435 €/h : 8 h 3,48 €, 9 h 3,92 €, 10 h 4,35 €, 11 h 4,79 €, minimum 2,65 €', () => {
    const d = '2026-07-01';
    ecart(entretienPlancher(d, 8 * 60), 348, 0);
    ecart(entretienPlancher(d, 9 * 60), 392, 0); // BFC écrit 3,915 (non arrondi), PDL 3,92
    ecart(entretienPlancher(d, 10 * 60), 435, 0);
    ecart(entretienPlancher(d, 11 * 60), 479, 0); // PDL : 3,92 + 2 × 0,435 = 4,79
    ecart(entretienPlancher(d, 7 * 60), 305, 0); // BFC : 3,045
    ecart(entretienPlancher(d, 6 * 60), 265, 0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// [ARA] DREETS Auvergne-Rhône-Alpes.
// ---------------------------------------------------------------------------------------------------------------
describe('[ARA] DREETS Auvergne-Rhône-Alpes', () => {
  // 9 h les lundis, mardis, jeudis et vendredis, 4 h le mercredi (40 h).
  const pl: Planning = { ...semaine('08:00', '17:00', [1, 2, 4, 5]), 3: [{ start: '08:00', end: '12:00' }] };

  it('Rémunération p. 5 : mai 2023, 182 h théoriques (fériés et semaine de congés compris), retenue 13 h ÷ 182', () => {
    const c = contrat({ start: '2022-09-05', trackedFrom: '2023-05-01', planning: pl, balances: { cpRestants: 6, cpEnCours: 0, maladieDeduits: 0 } });
    const ctx = makeCtx(c, [], [conge('cp', '2023-05-22', '2023-05-27'), conge('sans_solde', '2023-05-16', '2023-05-17')], '2023-06-15');
    const b = monthBase(ctx, '2023-05');
    ecart(b.divisorMin / 60, 182, 0);
    ecart(b.deductedMin / 60, 13, 0);
  });

  it('Rémunération p. 5 : même horaire, année incomplète, une semaine sans accueil : 23 jours théoriques, retenue 2 ÷ 23', () => {
    const c = contrat({ start: '2022-09-05', trackedFrom: '2023-05-01', yearType: 'incomplete', weeks: 46, weeksOff: ['2023-05-08'], planning: pl });
    const ctx = makeCtx(c, [], [conge('cp', '2023-05-22', '2023-05-27'), conge('sans_solde', '2023-05-16', '2023-05-17')], '2023-06-15');
    const b = monthBase(ctx, '2023-05');
    ecart(b.divisorDays, 23, 0);
    ecart(b.deductedDays, 2, 0);
  });

  it('Congés payés p. 1-2 : congé du lundi 3 au samedi 22 juillet 2023, 14 juillet férié : 17 jours ouvrables', () => {
    ecart(joursOuvrables('2023-07-03', '2023-07-22').length, 17, 0);
  });

  it('Congés payés p. 3 : 2 enfants → 4 jours de plus ; 40 ans, 4 enfants, 25 jours → 30 (plafond)', () => {
    const c46 = contrat({ yearType: 'incomplete', weeks: 36, weeksOff: [] });
    // 36 semaines au prorata du 01/09/2021 au 31/05/2022 : 26,9 semaines → 16,8 → 17 jours (pas 20) : on vérifie la
    // règle du bonus sur la base que donne l'app.
    const a2 = acquisition(makeCtx(c46, [], [], '2022-06-15'), 2021, 2);
    ecart(a2.enfantsBonus, 4, 0);
    const a4 = acquisition(makeCtx(contrat({}), [], [], '2022-06-15'), 2021, 4);
    ecart(a4.jours - a4.enfantsBonus, 25, 0);
    ecart(a4.jours, 30, 0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// [CTN] Code du travail numérique (fiches service-public).
// ---------------------------------------------------------------------------------------------------------------
describe('[CTN] Code du travail numérique', () => {
  const c = contrat({ start: '2025-01-06', trackedFrom: '2025-01-06' });
  const ctx = () => makeCtx(c, [], [], '2026-07-01');

  it('Démission (21/07/2026) : lettre recommandée présentée le 13/07/2026 : préavis du 13/07 au 12/08/2026', () => {
    ecart(Number(finDeContrat(ctx(), '2026-07-11', 'demission', 0, '2026-07-13').preavisFin.replace(/-/g, '')), 20260812, 0);
  });

  it('Démission (21/07/2026) : remise en main propre le 06/07/2026 : préavis du 06/07 au 05/08/2026', () => {
    ecart(Number(finDeContrat(ctx(), '2026-07-06', 'demission').preavisFin.replace(/-/g, '')), 20260805, 0);
  });

  it('Congés payés (23/05/2025) : 7 mois du 1er novembre au 31 mai → 17,5 → 18 jours (app : 30,3 semaines → 19)', () => {
    const c7 = contrat({ start: '2025-11-01', trackedFrom: '2025-11-01' });
    // Divergence M-2 : en mois 7 × 2,5 = 17,5 → 18 ; en semaines (212 jours ÷ 7 = 30,3 semaines) → 18,9 → 19.
    ecart(acquisition(makeCtx(c7, [], [], '2026-06-15'), 2025).jours, 18, -1);
  });

  it('Congés payés (23/05/2025) : 1 enfant à charge → 2 jours de plus (12 + 2 = 14)', () => {
    // 12 jours : contrat commencé le 01/01/2026 (21,6 semaines → 13,5 → 14 jours en semaines ; en mois 5 × 2,5 → 13).
    // On vérifie la règle du bonus seule : 2 jours par enfant tant que le total reste sous 30.
    const a = acquisition(makeCtx(contrat({ start: '2026-01-01' }), [], [], '2026-06-15'), 2025, 1);
    ecart(a.enfantsBonus, 2, 0);
  });
});
