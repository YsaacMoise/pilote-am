import { describe, expect, it } from 'vitest';
import { calendrier, levierTarif, moisAdaptation, selonRevenus, tarifMaxSansDepassement, MOIS_CALENDRIER } from '../src/engine/calendrier';
import { planningRegulier, simuler, simulationParDefaut } from '../src/engine/simulation';

const D = '2026-11-01';
const base = { ...simulationParDefaut(D), planning: planningRegulier(5, 40), tauxBrut: 509, entretien: 380, revenusAn: 42000, enfants: ['2025-05'], debut: '2026-12' };

describe('calendrier mois par mois (étape 4)', () => {
  it('année complète : 24 mois, même montant chaque mois, crédit de 2026 en juillet 2027, avance de 60 % du crédit 2026 en janvier 2028', () => {
    const c = calendrier(base, D);
    expect(c.mois).toHaveLength(MOIS_CALENDRIER);
    expect(c.mois[0].mois).toBe('2026-12');
    const r = simuler(base, D);
    expect(new Set(c.mois.map((m) => m.reste)).size).toBe(1);
    expect(Math.abs(c.mois[0].reste - r.reste)).toBeLessThanOrEqual(2);
    // 2026 : un seul mois de dépenses (décembre) → petit crédit, versé en juillet 2027
    const juillet27 = c.mois.find((m) => m.mois === '2027-07')!;
    expect(juillet27.credit).toBe(c.creditParAnnee[2026]);
    expect(juillet27.evenements).toContain('credit');
    const janvier28 = c.mois.find((m) => m.mois === '2028-01')!;
    expect(janvier28.credit).toBe(Math.round(c.creditParAnnee[2026] * 0.6));
    expect(janvier28.evenements).toContain('avance');
    // Juillet 2028 : crédit 2027 complet moins l'avance de janvier
    const juillet28 = c.mois.find((m) => m.mois === '2028-07')!;
    expect(juillet28.credit).toBe(c.creditParAnnee[2027] - Math.round(c.creditParAnnee[2026] * 0.6));
    expect(c.creditParAnnee[2027]).toBe(175000);
  });

  it('année incomplète (T-103, S7) : congés = le plus haut du dixième et du maintien (CCN 48.1.1.5), versés en juin ou au congé principal', () => {
    const inc = { ...base, yearType: 'incomplete' as const, semainesAbsence: 4 };
    const r = simuler(inc, D);
    const S = r.salaire;
    const c = calendrier(inc, D);
    const juin = c.mois.find((m) => m.mois === '2027-06')!;
    // 43 semaines d'accueil (52 − 5 − 4). Première période, décembre à mai (6 mois), aucun droit acquis : les 5 semaines de
    // congés ne comptent pas. T-109 (C8, L3141-4 : quatre semaines valent un mois) : 6 mois d'accueil = 43 × 6 ÷ 12 = 21,5
    // semaines ; 21,5 ÷ 4 × 2,5 = 13,44 → 14 jours (avant : 2,5 × 6 × 43 ÷ 52 = 12,40 → 13). Maintien : 14 ÷ 6 semaines ×
    // (S × 12 ÷ 43) ; dixième : 6 S ÷ 10. Le maintien est plus haut.
    expect(juin.conges).toBe(Math.max(Math.round(S * 6 * 0.1), Math.round((14 / 6) * ((S * 12) / 43))));
    expect(juin.conges).toBe(Math.round((14 / 6) * ((S * 12) / 43)));
    expect(juin.evenements).toContain('conges');
    expect(c.mois.find((m) => m.mois === '2027-05')!.conges).toBe(0);
    expect(juin.cmg).toBeGreaterThan(c.mois[0].cmg);
    const aout = calendrier({ ...inc, cpMode: 'principale', moisCongePrincipal: 8 }, D).mois.find((m) => m.mois === '2027-08')!;
    expect(aout.conges).toBe(juin.conges);
    // Deuxième période (12 mois) : les congés comptent dans la limite des 14 jours acquis (L3141-5, 1°) : 14 ÷ 6 = 2,33
    // semaines ; (43 + 2,33) ÷ 4 × 2,5 = 28,33 → 29 jours. Mois moyen du simulateur (même accueil chaque année) : 30 jours
    // ((43 + 5) ÷ 4 × 2,5 = 30).
    expect(c.mois.find((m) => m.mois === '2028-06')!.conges).toBe(Math.max(Math.round(S * 12 * 0.1), Math.round((29 / 6) * ((S * 12) / 43))));
    expect(r.congesAnnuels).toBe(Math.round((30 / 6) * ((S * 12) / 43)));
  });

  // T-035b. CCN art. 108.1 al. 3 et 111 ; Urssaf « Préparer le contrat » : salaire mensualisé − (salaire mensualisé × heures
  // d'absence ÷ heures exactes qui auraient dû être faites dans le mois). Février 2027 : 20 jours ouvrés du lundi au vendredi,
  // 8 h par jour = 160 h prévues, aucun férié. 40 h faites → 120 h d'absence → un quart du salaire mensualisé.
  it('adaptation, année complète : salaire mensualisé moins les heures non faites (art. 108.1 et 111)', () => {
    const i = { ...base, debut: '2027-02', adaptationHeures: 40, adaptationJours: 5 };
    const r = simuler(i, D);
    const S = r.parEnfant.salaire;
    const a = moisAdaptation(i, r, '2027-02', S);
    expect(a.heuresPrevues).toBe(160);
    expect(a.salaire).toBe(Math.round(S - (S * 120) / 160));
    // T-103 (S1) : heures déclarées = heures du mois × part payée (comme la paie), soit 173,33 h ÷ 4.
    expect(a.heuresFaites).toBe(40);
    expect(a.heures).toBeCloseTo((40 * 52) / 12 / 4, 2);
    expect(a.note).toMatch(/^Adaptation : 40 h faites sur 160 h prévues/);
    const c = calendrier(i, D);
    expect(c.mois[0].evenements).toContain('adaptation');
    expect(c.mois[0].note).toBe(a.note);
    expect(c.mois[0].verse).toBeLessThan(c.mois[1].verse);
    expect(c.mois[1].note).toBeUndefined();
  });

  it('adaptation : toutes les heures prévues faites → aucune déduction', () => {
    const i = { ...base, debut: '2027-02', adaptationHeures: 160, adaptationJours: 20 };
    const r = simuler(i, D);
    expect(moisAdaptation(i, r, '2027-02', r.parEnfant.salaire).salaire).toBe(r.parEnfant.salaire);
  });

  it('T-103 (S2 à S5) : 46 semaines en heures (art. 108.1), férié payé (art. 47.2), heures en plus payées (art. 96.4)', () => {
    const inc = { ...base, debut: '2027-02', yearType: 'incomplete' as const, semainesAbsence: 4, adaptationHeures: 40, adaptationJours: 5 };
    const ri = simuler(inc, D);
    expect(moisAdaptation(inc, ri, '2027-02', ri.parEnfant.salaire).salaire).toBe(Math.round(ri.parEnfant.salaire - (ri.parEnfant.salaire * 120) / 160));
    // Décembre 2026 : 23 jours du lundi au vendredi × 8 h = 184 h, dont Noël (vendredi 25) payé : 176 h à faire ; 40 h faites.
    const id = { ...base, debut: '2026-12', adaptationHeures: 40, adaptationJours: 5 };
    const rd = simuler(id, D);
    const Sd = rd.parEnfant.salaire;
    const ad = moisAdaptation(id, rd, '2026-12', Sd);
    expect(ad.heuresPrevues).toBe(184);
    expect(ad.salaire).toBe(Math.round(Sd - (Sd * 136) / 184));
    expect(ad.note).toContain('jour férié payé : 8 h');
    // Février 2027, 170 h faites pour 160 h prévues : 10 h complémentaires au taux du contrat, en plus du salaire entier.
    const ip = { ...base, debut: '2027-02', adaptationHeures: 170, adaptationJours: 20 };
    const rp = simuler(ip, D);
    const ap = moisAdaptation(ip, rp, '2027-02', rp.parEnfant.salaire);
    expect(ap.salaire).toBe(rp.parEnfant.salaire + Math.round(10 * rp.tauxNet));
    expect(ap.heuresEnPlus).toBe(10);
    expect(ap.note).toContain('complémentaires (article 96.4)');
    for (const c of [calendrier(inc, D), calendrier(id, D), calendrier(ip, D)]) expect(JSON.stringify(c)).not.toMatch(/confirmer/i);
  });

  it('fin de l’aide de la CAF après le mois des 6 ans ; cotisations à la charge de la famille ensuite', () => {
    const c = calendrier({ ...base, enfants: ['2021-03'] }, D);
    const mars27 = c.mois.find((m) => m.mois === '2027-03')!;
    const avril27 = c.mois.find((m) => m.mois === '2027-04')!;
    expect(mars27.cmg).toBeGreaterThan(0);
    expect(avril27.cmg).toBe(0);
    expect(avril27.evenements).toContain('finCmg');
    expect(avril27.cotisationsReste).toBeGreaterThan(50000);
  });

  it('selon les revenus : le reste à payer monte avec le revenu', () => {
    const t = selonRevenus(base, D);
    for (let k = 1; k < t.length; k++) expect(t[k].reste).toBeGreaterThanOrEqual(t[k - 1].reste);
    expect(t[t.length - 1].cmg).toBe(0);
  });

  it('levier du tarif : sous le plafond, la famille paie moins que ce que gagne l’assistante maternelle', () => {
    for (const l of levierTarif(base, D)) {
      expect(l.gainNet).toBeGreaterThan(0);
      expect(l.coutFamille).toBeLessThan(l.gainNet);
    }
  });

  it('levier du tarif sans aide de la CAF (6 à 12 ans en couple) : la famille paie la hausse et ses cotisations', () => {
    for (const l of levierTarif({ ...base, enfants: ['2020-03'] }, D)) expect(l.coutFamille).toBeGreaterThan(l.gainNet);
  });

  it('tarif maximal avant le plafond horaire de 8,09 €', () => {
    const max = tarifMaxSansDepassement(base, D);
    expect(simuler({ ...base, tauxBrut: max }, D).cmg.partCotisations).toBe(1);
    expect(simuler({ ...base, tauxBrut: max + 1 }, D).cmg.partCotisations).toBeLessThan(1);
    expect(max).toBeGreaterThan(900);
  });
});

// T-038 (G-2) : CCN art. 94, « Elle débute le premier jour de travail effectif, pour une durée maximale de 30 jours
// calendaires » (Urssaf « Préparer le contrat », 12/03/2026, même phrase). Une adaptation commencée en cours de mois peut
// finir le mois suivant : ce mois suit la même déduction (art. 108.1 al. 3 et 111). Mars 2027 : 23 jours du lundi au
// vendredi, 8 h par jour = 184 h prévues, dont le lundi de Pâques (29/03) payé ; 46 h faites → 130 h non faites (T-103, S3).
describe('T-038 G-2 : adaptation qui déborde sur le 2e mois', () => {
  it('le 2e mois suit la même déduction (art. 108.1 et 111), avec ses propres heures', () => {
    const i = { ...base, debut: '2027-02', adaptationHeures: 40, adaptationJours: 5, adaptationHeures2: 46, adaptationJours2: 6 };
    const r = simuler(i, D);
    const S = r.parEnfant.salaire;
    const a2 = moisAdaptation({ ...i, adaptationHeures: 46 }, r, '2027-03', S, 2);
    expect(a2.heuresPrevues).toBe(184);
    // Lundi de Pâques 29/03/2027 sur un jour d'accueil : payé (art. 47.2) ; 184 − 8 − 46 = 130 h non faites.
    expect(a2.salaire).toBe(Math.round(S - (S * 130) / 184));
    const c = calendrier(i, D);
    expect(c.mois[1].evenements).toContain('adaptation');
    const sans = calendrier({ ...i, adaptationHeures2: 0, adaptationJours2: 0 }, D);
    expect(c.mois[1].verse).toBeLessThan(sans.mois[1].verse);
    expect(c.mois[2].evenements).not.toContain('adaptation');
  });
  it('2e mois avec deux fériés sur des jours d’accueil (Ascension jeudi 6 et lundi de Pentecôte 17 mai 2027) : payés', () => {
    const i = { ...base, debut: '2027-04', adaptationHeures: 40, adaptationJours: 5, adaptationHeures2: 40, adaptationJours2: 5 };
    const r = simuler(i, D);
    const S = r.parEnfant.salaire;
    let ouvres = 0;
    for (let k = 1; k <= 31; k++) { const w = new Date(Date.UTC(2027, 4, k)).getUTCDay(); if (w >= 1 && w <= 5) ouvres++; }
    const a2 = moisAdaptation({ ...i, adaptationHeures: 40 }, r, '2027-05', S, 2);
    expect(a2.heuresPrevues).toBe(ouvres * 8);
    expect(a2.salaire).toBe(Math.round(S - (S * (ouvres * 8 - 16 - 40)) / (ouvres * 8)));
  });
});

describe('T-103 (S6) : le total « Mois par mois » compte tous les mois', () => {
  it('avec ou sans adaptation, total = somme des mois', () => {
    for (const i of [{ ...base, debut: '2027-02', yearType: 'incomplete' as const, semainesAbsence: 4, adaptationHeures: 40, adaptationJours: 5 }, { ...base, debut: '2027-02' }]) {
      const c = calendrier(i, D);
      expect(c.total).toBe(c.mois.reduce((t, m) => t + m.net, 0));
    }
  });
});

// T-038 suite (G-5). La page Urssaf « Préparer le contrat » (12/03/2026, relue) donne les formules sans exemple chiffré :
// les attendus sont ces formules appliquées aux chiffres du contrat, sans passer par le code. Contrat de base : 40 h par
// semaine sur 52 semaines, soit 40 × 52 ÷ 12 = 173,33 h mensualisées (art. 109). Février 2027 : 160 h prévues (20 jours
// de 8 h, aucun férié). 40 h faites : salaire dû = S − S × 120 ÷ 160 = S ÷ 4.
describe('T-038 suite (G-5) : tests de l’adaptation renforcés', () => {
  const i = { ...base, debut: '2027-02', adaptationHeures: 40, adaptationJours: 5 };
  it('heures déclarées : 173,33 h ÷ 4 = 43,33 h (rémunération due ÷ taux horaire net, comme la paie)', () => {
    const r = simuler(i, D);
    const a = moisAdaptation(i, r, '2027-02', r.parEnfant.salaire);
    expect(a.heures).toBeCloseTo((40 * 52) / 12 / 4, 1);
    expect(a.heuresFaites).toBe(40);
  });
  it('embauche le lundi 15/02/2027 : les heures avant l’embauche sont des heures non faites, même dénominateur de 160 h ; le 2e mois (mars) a le sien, 184 h', () => {
    // Du 15 au 28/02 l'AM fait 40 h ; l'adaptation (30 jours calendaires, art. 94) court jusqu'au 16/03 : 46 h faites en mars.
    const j = { ...i, adaptationHeures2: 46, adaptationJours2: 6 };
    const r = simuler(j, D);
    const S = r.parEnfant.salaire;
    expect(moisAdaptation(j, r, '2027-02', S).salaire).toBe(Math.round(S / 4));
    expect(moisAdaptation({ ...j, adaptationHeures: 46 }, r, '2027-03', S, 2).salaire).toBe(Math.round(S - (S * 130) / 184));
  });
  it('46 semaines ou moins : même déduction en heures, le mois compte dans le total', () => {
    const inc = { ...i, yearType: 'incomplete' as const, semainesAbsence: 4 };
    const r = simuler(inc, D);
    const a = moisAdaptation(inc, r, '2027-02', r.parEnfant.salaire);
    expect(a.salaire).toBe(Math.round(r.parEnfant.salaire / 4));
    const c = calendrier(inc, D);
    expect(c.mois[0].net).toBeGreaterThan(0);
    expect(c.total).toBe(c.mois.reduce((t, m) => t + m.net, 0));
  });
});

describe('T-103 (S6) : crédit d’impôt versé normalement, même avec un mois d’adaptation', () => {
  const inc = { ...base, debut: '2027-02', yearType: 'incomplete' as const, semainesAbsence: 4, adaptationHeures: 40, adaptationJours: 5 };
  it('le crédit de 2027 arrive en juillet 2028, dans le total', () => {
    const c = calendrier(inc, D);
    const juillet = c.mois.find((m) => m.mois === '2028-07')!;
    expect(juillet.credit).toBe(c.creditParAnnee[2027]);
    expect(juillet.net).toBe(juillet.reste - juillet.credit);
  });
});

describe('T-038 suite 2 : zone couverte par le simulateur (métropole et DOM hors Mayotte)', () => {
  it('la phrase existe et l’écran l’affiche près du résultat', async () => {
    const { MESSAGE_ZONE_SIMULATEUR } = await import('../src/engine/simulation');
    expect(MESSAGE_ZONE_SIMULATEUR).toMatch(/métropole et les départements d’outre-mer, hors Mayotte/);
    expect(MESSAGE_ZONE_SIMULATEUR).toMatch(/À Mayotte, le simulateur ne s’applique pas/);
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('src/screens/Simulateur.tsx', 'utf8')).toContain('<p class="hint">{MESSAGE_ZONE_SIMULATEUR}</p>');
  });
});
