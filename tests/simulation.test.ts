import { describe, expect, it } from 'vitest';
import { calculCmg, creditImpot, simuler, simulationParDefaut, tauxEffort } from '../src/engine/simulation';

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
  const base = { ...simulationParDefaut('2026-11-01'), jours: 5, heures: 40, tauxNet: 398, entretienJour: 380, ressourcesMois: 3500 };

  it('cas type : 40 h sur 5 jours, 52 semaines, 3,98 € net, 1 enfant, 3 500 € de ressources', () => {
    const r = simuler(base, '2026-11-01');
    expect(r.semaines).toBe(52);
    expect(r.heuresMoisMin).toBe(10400); // 173 h 20 payées
    expect(r.salaire).toBe(68987); // 40 × 52 ÷ 12 × 3,98
    // Entretien seulement les jours d'accueil : 5 jours × 47 semaines (les 5 semaines de congés de l'AM sans accueil)
    expect(r.joursAn).toBe(235);
    expect(r.entretien).toBe(Math.round((380 * 235) / 12));
    expect(r.total).toBe(r.salaire + r.entretien);
    // 3 500 × 0,0619 % ÷ 4,91 = 44,12 % restent à la famille
    expect(r.cmg.montant).toBe(Math.round(r.total * (1 - (3500 * 100 * 0.000619) / 491)));
    expect(r.reste).toBe(r.total - r.cmg.montant);
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
    expect(r.total).toBe(r.salaire + r.congesMois + r.entretien + r.repas);
    const attendu = Math.round(Math.min(350000, r.salaire * 12 + r.congesAnnuels + 265 * r.joursAn - r.cmg.montant * 12) / 2);
    expect(r.creditAnnuel).toBe(attendu);
  });

  it('heures vides : rien à payer, pas de crédit négatif ; plus de 13 h par jour : ramené au maximum', () => {
    const vide = simuler({ ...base, heures: 0 }, '2026-11-01');
    expect([vide.total, vide.creditAnnuel, vide.reel]).toEqual([0, 0, 0]);
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
    const r = simuler({ ...base, heures: 50, entretienJour: 0 }, '2026-11-01');
    expect(r.entretienJourRetenu).toBe(435); // 10 h × 0,435 €
    expect(r.heuresMajMoisMin).toBe(1300); // 5 h × 52 ÷ 12
    expect(r.salaire).toBe(Math.round(((45 * 60 * 398 + 5 * 60 * 398 * 1.1) * 52) / 12 / 60));
  });

  it('signale un salaire horaire sous le minimum conventionnel (3,28 € net depuis juin 2026)', () => {
    expect(simuler({ ...base, tauxNet: 320 }, '2026-11-01').sousMinimum).toBe(true);
    expect(simuler(base, '2026-11-01').sousMinimum).toBe(false);
  });
});
