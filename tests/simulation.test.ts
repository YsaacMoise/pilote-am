import { describe, expect, it } from 'vitest';
import { activiteOk, ageMois, bornesKm, dernierMoisCmg, derniereAnneeCredit, naissanceIlYA, ressourcesRetenues, calculCmg, cotisationsDuMois, creditImpot, feriesParJour, heuresMaxSemaine, planningDepuisTexte, planningRegulier, planningVersTexte, repasDuJour, simuler, simulationParDefaut, tauxEffort } from '../src/engine/simulation';

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
  const D = '2026-11-01';
  const base = { ...simulationParDefaut(D), planning: planningRegulier(5, 40), tauxBrut: 510, entretien: 380, revenusAn: 42000 };
  // Fériés du 1er novembre 2026 au 31 octobre 2027 tombant du lundi au vendredi : 11 nov., 25 déc., 1er janv.,
  // lundi de Pâques, Ascension, lundi de Pentecôte, 14 juillet = 7, pondérés par 47 semaines travaillées sur 52.
  const FERIES = (7 * 47) / 52;

  it('cas type : 40 h sur 5 jours, 52 semaines, 5,10 € brut, 1 enfant, 3 500 € de ressources', () => {
    const r = simuler(base, D);
    expect(r.semaines).toBe(52);
    expect(r.joursSemaine).toBe(5);
    expect(r.heuresMoisMin).toBe(10400); // 173 h 20 payées
    expect(r.tauxNet).toBe(398); // 5,10 € brut × (1 − 21,88 %)
    expect(r.salaire).toBe(68987); // 40 × 52 ÷ 12 × 3,98
    // Entretien seulement les jours d'accueil : 5 × 47 semaines, moins les fériés
    expect(r.feriesAn).toBeCloseTo(FERIES, 6);
    expect(r.joursAn).toBe(229);
    expect(r.entretien).toBe(Math.round((380 * (235 - FERIES)) / 12));
    expect(r.verse).toBe(r.salaire + r.entretien);
    expect(r.cmg.montant).toBe(Math.round(r.verse * (1 - (3500 * 100 * 0.000619) / 491)));
    expect(r.cotisationsReste).toBe(0);
    expect(r.reste).toBe(r.verse - r.cmg.montant);
    expect(r.creditAnnuel).toBe(Math.min(175000, Math.round((68987 * 12 + 265 * (235 - FERIES) - r.cmg.montant * 12) / 2)));
  });

  it('paramètres du CMG : 8,00 € et 4,85 € jusqu’au 31 mars 2026, 8,09 € et 4,91 € dès le 1er avril', () => {
    expect(calculCmg(50000, 100, 2000, 1, 0, '2026-03-31').params.coutReference).toBe(485);
    expect(calculCmg(50000, 100, 2000, 1, 0, '2026-04-01').params.plafondHoraire).toBe(809);
  });

  it('ressources sous le plancher : ramenées au plancher', () => {
    expect(calculCmg(50000, 100, 300, 1, 0, D).ressources).toBe(821);
  });

  it('6 à 12 ans en couple : ni aide de la CAF, ni crédit d’impôt ; parent seul : CMG sans crédit', () => {
    const r = simuler({ ...base, enfants: [naissanceIlYA('2026-11-01', 96)] }, D);
    expect(r.cmgEligible).toBe(false);
    expect([r.cmg.montant, r.creditAnnuel]).toEqual([0, 0]);
    const seul = simuler({ ...base, enfants: [naissanceIlYA('2026-11-01', 96)], foyer: 'seul' }, D);
    expect(seul.cmg.montant).toBeGreaterThan(0);
    expect(seul.creditAnnuel).toBe(0);
  });

  it('année incomplète : 52 − 5 − absences, 46 au plus ; congés payés répartis dans le coût, l’aide et le crédit', () => {
    expect(simuler({ ...base, yearType: 'incomplete', semainesAbsence: 0 }, D).semaines).toBe(46);
    const r = simuler({ ...base, yearType: 'incomplete', semainesAbsence: 4, revenusAn: 18000 }, D);
    expect(r.semaines).toBe(43);
    expect(r.joursAn).toBe(Math.round(5 * 43 - (7 * 43) / 52));
    expect(r.congesMois).toBe(Math.round(r.congesAnnuels / 12));
    expect(r.verse).toBe(r.salaire + r.congesMois + r.entretien + r.repas);
  });

  it('planning vide : rien à payer, pas de crédit négatif', () => {
    const vide = simuler({ ...base, planning: {} }, D);
    expect([vide.total, vide.cotisations, vide.creditAnnuel, vide.reel]).toEqual([0, 0, 0, 0]);
  });

  it('heures au-delà de 45 h majorées, réduction de 11,31 % versée en plus ; entretien au minimum de la journée', () => {
    const r = simuler({ ...base, planning: planningRegulier(5, 47), entretien: 0 }, D);
    expect(r.parJour[0].entretien).toBe(409); // 9 h 24 × 0,435 €
    expect(r.heuresMajMoisMin).toBe(520); // 2 h × 52 ÷ 12
    expect(r.salaire).toBe(Math.round(((45 * 60 * 398 + 2 * 60 * 398 * 1.1) * 52) / 12 / 60));
    expect(r.reductionHeuresMaj).toBe(Math.round(((520 / 60) * 398 * 1.1) / (1 - 0.2188025) * 0.1131));
    expect(r.verse).toBe(r.salaire + r.reductionHeuresMaj + r.entretien);
  });

  it('signale un salaire horaire sous le minimum conventionnel (4,20 € brut depuis juin 2026)', () => {
    expect(simuler({ ...base, tauxBrut: 419 }, D).sousMinimum).toBe(true);
    expect(simuler(base, D).sousMinimum).toBe(false);
  });
});

describe('accueil jour par jour (étape 2)', () => {
  const D = '2026-11-01';
  const base = { ...simulationParDefaut(D), tauxBrut: 510, entretien: 0, revenusAn: 42000 };
  const pl = (o: Record<number, [string, string][]>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.map(([start, end]) => ({ start, end }))]));

  it('entretien calculé chaque jour : 2 jours de 11 h et 2 jours de 4 h → 4,79 € et 2,65 €', () => {
    const r = simuler({ ...base, planning: pl({ 1: [['07:30', '18:30']], 2: [['07:30', '18:30']], 4: [['08:00', '12:00']], 5: [['08:00', '12:00']] }) }, D);
    expect(r.parJour.map((j) => j.entretien)).toEqual([479, 479, 265, 265]);
    expect(r.minutesSemaine).toBe(30 * 60);
  });

  it('entretien prévu au contrat : par jour (minimum légal si supérieur) ou par heure', () => {
    const planning = pl({ 1: [['08:00', '18:00']], 3: [['08:00', '12:00']] });
    expect(simuler({ ...base, planning, entretien: 380 }, D).parJour.map((j) => j.entretien)).toEqual([435, 380]);
    expect(simuler({ ...base, planning, entretien: 50, entretienMode: 'heure' }, D).parJour.map((j) => j.entretien)).toEqual([500, 265]);
  });

  it('jours fériés : 1er nov. 2026 → 31 oct. 2027 ; Alsace-Moselle ajoute le Vendredi saint', () => {
    const f = feriesParJour(D, false);
    expect(f.slice(1, 6)).toEqual([2, 0, 2, 1, 2]); // lun : Pâques, Pentecôte ; mer : 11 nov., 14 juil. ; jeu : Ascension ; ven : 25 déc., 1er janv.
    expect(feriesParJour(D, true)[5]).toBe(3); // + Vendredi saint (26 mars 2027)
  });

  it('repas comptés selon les horaires du jour', () => {
    const matin = [{ start: '07:30', end: '12:00' }];
    const journee = [{ start: '08:30', end: '19:00' }];
    expect(['petitDej', 'dejeuner', 'gouter', 'diner'].map((t) => repasDuJour(matin, t as any))).toEqual([true, false, false, false]);
    expect(['petitDej', 'dejeuner', 'gouter', 'diner'].map((t) => repasDuJour(journee, t as any))).toEqual([false, true, true, true]);
    // Sortie d'école à 16 h 30 : goûter chez l'assistante maternelle
    expect(repasDuJour([{ start: '16:30', end: '18:30' }], 'gouter')).toBe(true);
    const r = simuler({ ...base, planning: { 1: matin, 2: journee }, repas: { petitDej: 150, dejeuner: 400, gouter: 120, diner: 0 } }, D);
    expect(r.parJour.map((j) => j.repas)).toEqual([['petitDej'], ['dejeuner', 'gouter']]);
    const n1 = 47 - (2 * 47) / 52, n2 = 47; // lundis fériés : 2 ; mardi : aucun
    expect(r.repas).toBe(Math.round((n1 * 150 + n2 * 520) / 12));
  });

  it('indemnités kilométriques : à la charge de la famille, hors CMG et hors crédit d’impôt', () => {
    const planning = planningRegulier(5, 40);
    const sans = simuler({ ...base, planning }, D);
    const avec = simuler({ ...base, planning, kmMois: 100, kmTaux: 40, cv: 5 }, D);
    expect(avec.km).toBe(4000);
    expect(avec.verse - sans.verse).toBe(4000);
    expect(avec.cmg.montant).toBe(sans.cmg.montant);
    expect(avec.creditAnnuel).toBe(sans.creditAnnuel);
    expect(avec.reste - sans.reste).toBe(4000);
  });

  it('barème kilométrique : administratif au minimum, fiscal au maximum', () => {
    expect(bornesKm(5, 1200)).toEqual({ min: 320, max: 636 });
    expect(bornesKm(6, 3000)).toEqual({ min: 510, max: 665 });
    expect(bornesKm(9, 12000)).toEqual({ min: 320, max: 697 });
    expect(bornesKm(3, 1000)).toEqual({ min: 320, max: 529 });
  });

  it('lien partagé : le planning s’écrit et se relit', () => {
    const p = pl({ 1: [['08:00', '17:00']], 3: [['07:30', '08:30'], ['16:30', '18:30']] });
    expect(planningVersTexte(p)).toBe('1:0800-1700,3:0730-0830+1630-1830');
    expect(planningDepuisTexte('1:0800-1700,3:0730-0830+1630-1830')).toEqual(p);
    expect(planningDepuisTexte('1:0800-1700,3:0730-0830 1630-1830')).toEqual(p); // « + » non encodé
    expect(planningDepuisTexte('9:0800-1700')).toBeNull();
    expect(planningDepuisTexte('1:2500-1700')).toBeNull();
  });
});

// Références : simulateur officiel Urssaf/Pajemploi (calculerResteACharge), interrogé le 1er novembre 2026
// avec les montants mensuels produits par notre moteur. CMG et reste à charge au centime ; cotisations à 5 centimes près
// (l'Urssaf arrondit composante par composante).
describe('comparaison avec le simulateur officiel Urssaf (1er novembre 2026)', () => {
  const d = '2026-11-01';
  const base = { ...simulationParDefaut(d), planning: planningRegulier(5, 40), tauxBrut: 510, entretien: 380, revenusAn: 42000 };
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

  it('A : couple, 1 enfant, 40 h, 5,10 € brut → CMG 425,93 €, reste 336,35 €', () => {
    const r = simuler(base, d);
    expect(r.entretien).toBe(7241);
    expect(r.cmg.montant).toBe(42593);
    expect(r.reste).toBe(33635);
    proche(r.cotisations, 58275);
  });

  it('B : couple, enfant de 6 à 12 ans → aucune aide, 582,75 € de cotisations, reste 1 345,03 €', () => {
    const r = simuler({ ...base, enfants: [naissanceIlYA('2026-11-01', 96)] }, d);
    expect(r.cmg.montant).toBe(0);
    proche(r.cotisationsReste, 58275);
    proche(r.reste, 134503);
  });

  it('C : 45 h à 10,90 € brut (8,52 € net) → CMG 881,47 €, cotisations restantes 125,68 €, reste 980,31 €', () => {
    const r = simuler({ ...base, planning: planningRegulier(5, 45), tauxBrut: 1090, entretien: 392 }, d);
    expect(r.cmg.montant).toBe(88147);
    expect(r.cmg.partCotisations).toBe(0.91);
    proche(r.cotisationsReste, 12568);
    proche(r.reste, 98031);
  });

  it('D : Alsace-Moselle → net 679,47 €, CMG 419,96 €, cotisations 595,20 €', () => {
    const r = simuler({ ...base, alsaceMoselle: true }, d);
    expect(r.salaire).toBe(67947);
    expect(r.cmg.montant).toBe(41996);
    proche(r.cotisations, 59520);
    expect(r.reste).toBe(33164);
  });

  it('E : parent seul, 2 enfants à charge, enfant de 6 à 12 ans, déjeuner à 4 € → CMG 706,32 €, reste 132,18 €', () => {
    const r = simuler({ ...base, repas: { petitDej: 0, dejeuner: 400, gouter: 0, diner: 0 }, revenusAn: 18000, enfantsACharge: 2, foyer: 'seul', enfants: [naissanceIlYA('2026-11-01', 96)] }, d);
    expect(r.repas).toBe(7622);
    expect(r.cmg.montant).toBe(70632);
    expect(r.reste).toBe(13218);
    expect(r.creditAnnuel).toBe(0);
  });
});

describe('durée du travail (CASF L423-21 et L423-22)', () => {
  const b = { ...simulationParDefaut('2026-11-01'), tauxBrut: 510 };
  it('au plus 13 h par jour et 2 250 h par an, arrondi au quart d’heure', () => {
    expect(heuresMaxSemaine(5, 47)).toBe(47.75);
    expect(heuresMaxSemaine(3, 47)).toBe(39);
    expect(heuresMaxSemaine(5, 40)).toBe(56.25);
  });
  it('journée de plus de 13 h signalée ; plus de 2 250 h par an signalé ; accord écrit au-delà de 48 h', () => {
    const long = simuler({ ...b, planning: { 1: [{ start: '06:00', end: '19:30' }], 2: [{ start: '08:00', end: '17:00' }] } }, '2026-11-01');
    expect(long.joursTropLongs).toEqual([1]);
    expect(simuler({ ...b, planning: planningRegulier(5, 50) }, '2026-11-01').depasseAnnuel).toBe(true);
    const inc = simuler({ ...b, planning: planningRegulier(5, 52), yearType: 'incomplete', semainesAbsence: 6 }, '2026-11-01');
    expect(inc.depasseAnnuel).toBe(false);
    expect(inc.accordNecessaire).toBe(true);
  });
});

describe('la famille réelle (étape 3)', () => {
  const D = '2026-11-01';
  const base = { ...simulationParDefaut(D), planning: planningRegulier(5, 40), tauxBrut: 510, entretien: 380, revenusAn: 42000 };
  const proche = (a: number, b: number, tol = 5) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

  it('deux enfants gardés (18 mois et 4 ans) : un CMG par enfant au taux de 2 enfants (Urssaf : 2 × 481,90 €, reste 560,76 €)', () => {
    const r = simuler({ ...base, enfants: [naissanceIlYA(D, 18), naissanceIlYA(D, 48)], enfantsACharge: 2 }, D);
    expect(r.nbEnfants).toBe(2);
    expect(r.enfants.map((e) => e.cmg)).toEqual([48190, 48190]);
    expect(r.cmgTotal).toBe(96380);
    proche(r.cotisations, 2 * 58275, 10);
    expect(r.reste).toBe(56076);
  });

  it('couple : enfant de 18 mois aidé, enfant de 8 ans sans aide et avec ses cotisations', () => {
    const r = simuler({ ...base, enfants: [naissanceIlYA(D, 18), naissanceIlYA(D, 96)], enfantsACharge: 2 }, D);
    expect(r.enfants.map((e) => e.cmgEligible)).toEqual([true, false]);
    expect(r.enfants[1].cmg).toBe(0);
    proche(r.enfants[1].cotisationsReste, 58275);
    expect(r.enfants[1].credit).toBe(0);
  });

  it('enfants à charge jamais moins nombreux que les enfants gardés', () => {
    const r = simuler({ ...base, enfants: [naissanceIlYA(D, 18), naissanceIlYA(D, 30)], enfantsACharge: 1 }, D);
    expect(r.cmg.taux).toBe(0.000516);
  });

  it('condition d’activité : chacun des deux parents, sauf AAH, ASS ou RSA', () => {
    expect(activiteOk('couple', 'travail', 'travail')).toBe(true);
    expect(activiteOk('couple', 'travail', 'assimile')).toBe(true);
    expect(activiteOk('couple', 'travail', 'etudes')).toBe(true);
    expect(activiteOk('couple', 'travail', 'sans')).toBe(false);
    expect(activiteOk('couple', 'sans', 'aidee')).toBe(true);
    expect(activiteOk('seul', 'sans', 'travail')).toBe(false);
    expect(activiteOk('seul', 'etudes', 'sans')).toBe(true);
    const r = simuler({ ...base, statutConjoint: 'sans' }, D);
    expect([r.activiteOk, r.cmgTotal, r.cotisationsPrisesEnCharge]).toEqual([false, 0, 0]);
    proche(r.cotisationsReste, 58275);
  });

  it('résidence alternée : crédit d’impôt plafonné à 875 € par parent', () => {
    expect(simuler(base, D).creditAnnuel).toBe(175000);
    expect(simuler({ ...base, residenceAlternee: true }, D).creditAnnuel).toBe(87500);
  });

  it('revenus : revenu fiscal de référence ÷ 12 ; chômage indemnisé −30 % ; chômage non indemnisé ou RSA : revenus d’activité retirés', () => {
    expect(ressourcesRetenues(42000, 'aucune', 0)).toBe(3500);
    expect(ressourcesRetenues(42000, 'chomage', 20000)).toBe(3000);
    expect(ressourcesRetenues(42000, 'sansRevenus', 20000)).toBe(1833);
    expect(ressourcesRetenues(42000, 'arret', 50000)).toBe(Math.round((42000 - 12600) / 12));
    expect(simuler({ ...base, situationRevenus: 'chomage', revenusConcernes: 20000 }, D).cmg.ressources).toBe(3000);
  });

  it('âge : aide jusqu’au mois des 6 ans (12 ans pour un parent seul) ; crédit jusqu’à l’année des 6 ans', () => {
    expect(dernierMoisCmg('2021-03', false)).toBe('2027-03');
    expect(dernierMoisCmg('2021-03', true)).toBe('2033-03');
    expect(ageMois('2020-11', D)).toBe(72);
    expect(simuler({ ...base, enfants: ['2020-11'] }, D).enfants[0].cmgEligible).toBe(true);
    expect(simuler({ ...base, enfants: ['2020-10'] }, D).enfants[0].cmgEligible).toBe(false);
    expect(derniereAnneeCredit('2020-03')).toBe(2026);
    const r = simuler({ ...base, enfants: ['2020-03'] }, D);
    expect([r.enfants[0].cmgEligible, r.enfants[0].creditEligible]).toEqual([false, true]);
  });

  it('autres aides (employeur, commune, CESU préfinancé) : déduites du reste à payer et des dépenses du crédit d’impôt', () => {
    const petit = { ...base, planning: planningRegulier(3, 20) };
    const sans = simuler(petit, D);
    const avec = simuler({ ...petit, autresAides: 5000 }, D);
    expect(sans.reste - avec.reste).toBe(5000);
    expect(sans.depensesAnnuelles - avec.depensesAnnuelles).toBe(60000);
    expect(sans.creditAnnuel - avec.creditAnnuel).toBe(30000);
  });
});

