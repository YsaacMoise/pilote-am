import { describe, expect, it } from 'vitest';
import { calculCmg, cotisationsDuMois, creditImpot, heuresMaxSemaine, simuler, simulationParDefaut, tauxEffort } from '../src/engine/simulation';

// Exemples officiels : communiqué de presse CAF du 15/09/2025 (coût horaire de référence 4,85 €)
// et webinaire CAF de septembre 2025. Une date de septembre 2025 sélectionne ces paramètres.
const SEPT_2025 = '2025-10-01';

describe('CMG emploi direct d’une assistante maternelle (CSS D531-18, réforme de septembre 2025)', () => {
  it('CAF 1 : couple, 1 enfant, 2 000 € de ressources, 160 h, 776 € → CMG 577,92 €', () => {
    expect(calculCmg(77600, 160, 2000, 1, 0, SEPT_2025).montant).toBe(57792);
  });
  it('CAF 2 : parent seul, 2 enfants, 1 141 €, 110 h, 533,50 € → CMG 468,73 € (à 1 centime)', () => {
    expect(Math.abs(calculCmg(53350, 110, 1141, 2, 0, SEPT_2025).montant - 46873)).toBeLessThanOrEqual(1);
  });
  it('CAF 3 : même famille, un enfant à l’AEEH (taux inférieur) → CMG 481,66 € (à 1 centime)', () => {
    expect(Math.abs(calculCmg(53350, 110, 1141, 2, 1, SEPT_2025).montant - 48166)).toBeLessThanOrEqual(1);
  });
  it('CAF 4 : couple, 2 enfants, 4 000 €, 110 h, 533,50 € → CMG 306,46 €', () => {
    expect(calculCmg(53350, 110, 4000, 2, 0, SEPT_2025).montant).toBe(30646);
  });
  it('Webinaire CAF : ressources de 10 000 € ramenées au plafond de 8 500 € → CMG nul', () => {
    const r = calculCmg(127500, 200, 10000, 1, 0, SEPT_2025);
    expect(r.ressources).toBe(8500);
    expect(r.montant).toBe(0);
  });
  it('le coût est retenu dans la limite du plafond horaire (8,09 € depuis avril 2026)', () => {
    const r = calculCmg(100000, 100, 2000, 1, 0, '2026-11-01');
    expect(r.coutRetenu).toBe(80900);
    expect(r.depassePlafond).toBe(true);
  });
  it('barème du taux d’effort : 1, 2, 3, 4 à 7, 8 et plus ; l’AEEH fait descendre d’un rang', () => {
    expect([1, 2, 3, 4, 7, 8, 10].map((n) => tauxEffort(n))).toEqual([0.000619, 0.000516, 0.000413, 0.00031, 0.00031, 0.000206, 0.000206]);
    expect(tauxEffort(1, 1)).toBe(0.000516);
    expect(tauxEffort(8, 1)).toBe(0.000206);
  });
});

describe('crédit d’impôt garde d’enfant (CGI 200 quater B)', () => {
  it('50 % des dépenses : net + 2,65 € par jour − CMG, plafonné à 1 750 €', () => {
    expect(creditImpot(300000, 200, 200000)).toEqual({ depenses: 153000, credit: 76500 });
    expect(creditImpot(900000, 260, 300000).credit).toBe(175000);
    expect(creditImpot(100000, 0, 200000)).toEqual({ depenses: 0, credit: 0 });
  });
});

describe('simulateur complet', () => {
  const base = { ...simulationParDefaut('2026-11-01'), jours: 5, heures: 40, tauxBrut: 510, entretienJour: 380, ressourcesMois: 3500 };

  it('cas type : 40 h sur 5 jours, 52 semaines, 3,98 € net, 1 enfant, 3 500 € de ressources', () => {
    const r = simuler(base, '2026-11-01');
    expect(r.semaines).toBe(52);
    expect(r.heuresMoisMin).toBe(10400); // 173 h 20 payées
    expect(r.salaire).toBe(68987); // 40 × 52 ÷ 12 × 3,98
    // Entretien seulement les jours d'accueil : 5 jours × 47 semaines (les 5 semaines de congés de l'AM sans accueil)
    expect(r.joursAn).toBe(235);
    expect(r.entretien).toBe(Math.round((380 * 235) / 12));
    expect(r.tauxNet).toBe(398); // 5,10 € brut × (1 − 21,88 %)
    expect(r.verse).toBe(r.salaire + r.entretien);
    // 3 500 × 0,0619 % ÷ 4,91 = 44,12 % restent à la famille
    expect(r.cmg.montant).toBe(Math.round(r.verse * (1 - (3500 * 100 * 0.000619) / 491)));
    // Cotisations entièrement prises en charge sous le plafond horaire
    expect(r.cotisationsReste).toBe(0);
    expect(r.reste).toBe(r.verse - r.cmg.montant);
    expect(r.resteHoraire).toBe(Math.round(r.reste / (10400 / 60)));
    // Crédit : net annuel + 2,65 € × 235 jours − CMG annuel, plafonné à 1 750 €
    expect(r.creditAnnuel).toBe(Math.min(175000, Math.round((68987 * 12 + 265 * 235 - r.cmg.montant * 12) / 2)));
  });

  it('paramètres du CMG : 8,00 € et 4,85 € jusqu’au 31 mars 2026, 8,09 € et 4,91 € dès le 1er avril', () => {
    expect(calculCmg(50000, 100, 2000, 1, 0, '2026-03-31').params.coutReference).toBe(485);
    expect(calculCmg(50000, 100, 2000, 1, 0, '2026-04-01').params.plafondHoraire).toBe(809);
  });

  it('ressources sous le plancher : ramenées au plancher', () => {
    expect(calculCmg(50000, 100, 300, 1, 0, '2026-11-01').ressources).toBe(821);
  });

  it('6 à 12 ans en couple : ni aide de la CAF, ni crédit d’impôt', () => {
    const r = simuler({ ...base, age: '6a12' }, '2026-11-01');
    expect(r.cmgEligible).toBe(false);
    expect(r.cmg.montant).toBe(0);
    expect(r.creditAnnuel).toBe(0);
  });

  it('année incomplète : congés payés répartis dans le coût, l’aide et le crédit', () => {
    const r = simuler({ ...base, yearType: 'incomplete', semainesAbsence: 4, ressourcesMois: 1500 }, '2026-11-01');
    expect(r.semaines).toBe(43);
    expect(r.joursAn).toBe(5 * 43);
    expect(r.congesMois).toBe(Math.round(r.congesAnnuels / 12));
    expect(r.verse).toBe(r.salaire + r.congesMois + r.entretien + r.repas);
    const attendu = Math.round(Math.min(350000, r.salaire * 12 + r.congesAnnuels + 265 * r.joursAn - r.cmg.montant * 12) / 2);
    expect(r.creditAnnuel).toBe(attendu);
  });

  it('heures vides : rien à payer, pas de crédit négatif ; plus de 13 h par jour : ramené au maximum', () => {
    const vide = simuler({ ...base, heures: 0 }, '2026-11-01');
    expect([vide.total, vide.cotisations, vide.creditAnnuel, vide.reel]).toEqual([0, 0, 0, 0]);
    const long = simuler({ ...base, jours: 2, heures: 40 }, '2026-11-01');
    expect(long.heuresPlafonnees).toBe(true);
    expect(long.heuresMoisMin).toBe(Math.round((26 * 60 * 52) / 12));
  });

  it('6 à 12 ans : CMG seulement pour un parent seul, sans crédit d’impôt', () => {
    const seul = simuler({ ...base, age: '6a12', parentSeul: true }, '2026-11-01');
    expect(seul.cmg.montant).toBeGreaterThan(0);
    expect(seul.creditAnnuel).toBe(0);
  });

  it('année incomplète : 52 − 5 − absences, 46 semaines au plus', () => {
    expect(simuler({ ...base, yearType: 'incomplete', semainesAbsence: 0 }, '2026-11-01').semaines).toBe(46);
  });

  it('l’entretien ne descend jamais sous le minimum légal ; heures au-delà de 45 h majorées', () => {
    const r = simuler({ ...base, heures: 47, entretienJour: 0 }, '2026-11-01');
    expect(r.entretienJourRetenu).toBe(409); // 9 h 24 × 0,435 €
    expect(r.heuresMajMoisMin).toBe(520); // 2 h × 52 ÷ 12
    expect(r.salaire).toBe(Math.round(((45 * 60 * 398 + 2 * 60 * 398 * 1.1) * 52) / 12 / 60));
    // Réduction de 11,31 % du brut des heures majorées, versée en plus du net
    expect(r.reductionHeuresMaj).toBe(Math.round(((520 / 60) * 398 * 1.1) / (1 - 0.2188025) * 0.1131));
    expect(r.verse).toBe(r.salaire + r.reductionHeuresMaj + r.entretien);
  });

  it('signale un salaire horaire sous le minimum conventionnel (4,20 € brut depuis juin 2026)', () => {
    expect(simuler({ ...base, tauxBrut: 419 }, '2026-11-01').sousMinimum).toBe(true);
    expect(simuler(base, '2026-11-01').sousMinimum).toBe(false);
  });
});

// Références : simulateur officiel Urssaf/Pajemploi (calculerResteACharge), interrogé le 1er novembre 2026
// avec les montants mensuels produits par notre moteur. CMG et reste à charge au centime ; cotisations à 5 centimes près
// (l'Urssaf arrondit composante par composante).
describe('comparaison avec le simulateur officiel Urssaf (1er novembre 2026)', () => {
  const d = '2026-11-01';
  const base = { ...simulationParDefaut(d), jours: 5, heures: 40, tauxBrut: 510, entretienJour: 380, ressourcesMois: 3500 };
  const proche = (a: number, b: number, tol = 5) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

  it('cotisations : 83,75 % du net + 5 € (Urssaf : 581,73 € pour 688,62 € net ; 2 098,78 € pour 2 500 €)', () => {
    proche(cotisationsDuMois(68862, d, false), 58173);
    proche(cotisationsDuMois(250000, d, false), 209878);
    // Alsace-Moselle (Bas-Rhin) : 603,13 € et 1 307,89 €
    proche(cotisationsDuMois(68862, d, true), 60313);
    proche(cotisationsDuMois(150000, d, true), 130789);
  });

  it('au-delà de 8,09 € de l’heure : prise en charge au prorata, arrondie au centième supérieur', () => {
    // 173 h, 1 400 € net + 83,60 € d'entretien : 95 % pris en charge (Urssaf : 1 118,65 € sur 1 177,53 €)
    expect(calculCmg(148360, 173, 3500, 1, 0, d).partCotisations).toBe(0.95);
    expect(calculCmg(168360, 173, 3500, 1, 0, d).partCotisations).toBe(0.84);
    expect(calculCmg(178360, 173, 3500, 1, 0, d).partCotisations).toBe(0.79);
    expect(calculCmg(208360, 173, 3500, 1, 0, d).partCotisations).toBe(0.68);
    expect(calculCmg(138360, 173, 3500, 1, 0, d).partCotisations).toBe(1);
  });

  it('A : couple, 1 enfant, 40 h, 5,10 € brut → CMG 427,05 €, reste 337,24 €', () => {
    const r = simuler(base, d);
    expect(r.cmg.montant).toBe(42705);
    expect(r.reste).toBe(33724);
    proche(r.cotisations, 58275);
  });

  it('B : couple, enfant de 6 à 12 ans → aucune aide, 582,75 € de cotisations, reste 1 347,04 €', () => {
    const r = simuler({ ...base, age: '6a12' }, d);
    expect(r.cmg.montant).toBe(0);
    proche(r.cotisationsReste, 58275);
    proche(r.reste, 134704);
  });

  it('C : 45 h à 10,90 € brut (8,52 € net) → CMG 881,47 €, cotisations restantes 125,68 €, reste 982,38 €', () => {
    const r = simuler({ ...base, heures: 45, tauxBrut: 1090, entretienJour: 392 }, d);
    expect(r.cmg.montant).toBe(88147);
    expect(r.cmg.partCotisations).toBe(0.91);
    proche(r.cotisationsReste, 12568);
    proche(r.reste, 98238);
  });

  it('D : Alsace-Moselle → net 679,47 €, CMG 421,24 €, cotisations 595,20 €', () => {
    const r = simuler({ ...base, alsaceMoselle: true }, d);
    expect(r.salaire).toBe(67947);
    expect(r.cmg.montant).toBe(42124);
    proche(r.cotisations, 59520);
    expect(r.reste).toBe(33265);
  });

  it('E : parent seul, 2 enfants à charge, enfant de 6 à 12 ans, repas 4 € → CMG 709,79 €, reste 132,83 €', () => {
    const r = simuler({ ...base, repasPrix: 400, ressourcesMois: 1500, enfantsACharge: 2, parentSeul: true, age: '6a12' }, d);
    expect(r.cmg.montant).toBe(70979);
    expect(r.reste).toBe(13283);
    expect(r.creditAnnuel).toBe(0);
  });
});

describe('durée du travail (CASF L423-21 et L423-22)', () => {
  it('au plus 13 h par jour et 2 250 h par an, arrondi au quart d’heure', () => {
    expect(heuresMaxSemaine(5, 47)).toBe(47.75);
    expect(heuresMaxSemaine(3, 47)).toBe(39);
    expect(heuresMaxSemaine(5, 40)).toBe(56.25);
  });
  it('au-delà de 48 h : accord écrit de l’assistante maternelle signalé ; au-delà du maximum : ramené', () => {
    const b = { ...simulationParDefaut('2026-11-01'), jours: 5, tauxBrut: 510 };
    const r = simuler({ ...b, heures: 60 }, '2026-11-01');
    expect(r.heuresPlafonnees).toBe(true);
    expect(r.heuresRetenues).toBe(47.75);
    expect(r.accordNecessaire).toBe(false);
    const inc = simuler({ ...b, heures: 52, yearType: 'incomplete', semainesAbsence: 6 }, '2026-11-01');
    expect(inc.heuresPlafonnees).toBe(false);
    expect(inc.accordNecessaire).toBe(true);
  });
});

