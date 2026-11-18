import { describe, expect, it } from 'vitest';
import { MESSAGE_ADAPTATION_2_A_CONFIRMER, MESSAGE_ADAPTATION_A_CONFIRMER, calendrier, levierTarif, moisAdaptation, selonRevenus, tarifMaxSansDepassement, MOIS_CALENDRIER } from '../src/engine/calendrier';
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

  it('année incomplète : congés payés = 10 % des salaires nets de décembre à mai, versés en juin, ou au congé principal', () => {
    const inc = { ...base, yearType: 'incomplete' as const, semainesAbsence: 4 };
    const r = simuler(inc, D);
    const c = calendrier(inc, D);
    const juin = c.mois.find((m) => m.mois === '2027-06')!;
    expect(juin.conges).toBe(Math.round(r.salaire * 6 * 0.1));
    expect(juin.evenements).toContain('conges');
    expect(c.mois.find((m) => m.mois === '2027-05')!.conges).toBe(0);
    // L'aide de la CAF suit : plus élevée le mois des congés
    expect(juin.cmg).toBeGreaterThan(c.mois[0].cmg);
    const aout = calendrier({ ...inc, cpMode: 'principale', moisCongePrincipal: 8 }, D).mois.find((m) => m.mois === '2027-08')!;
    expect(aout.conges).toBe(juin.conges);
    // Deuxième période complète : 12 mois de salaire
    expect(c.mois.find((m) => m.mois === '2028-06')!.conges).toBe(Math.round(r.salaire * 12 * 0.1));
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
    // T-038 (G-3) : heures à déclarer, deux règles sur la même page Urssaf (étape 2 : rémunération due ÷ taux horaire net ;
    // étape 3 : heures effectuées, ici 40 h). Elles diffèrent : « à confirmer » avec les deux valeurs, le salaire reste calculé.
    expect(a.heuresFaites).toBe(40);
    const etape2 = (a.salaire / r.tauxNet).toFixed(2).replace('.', ',');
    expect(a.aConfirmer).toContain(MESSAGE_ADAPTATION_A_CONFIRMER);
    expect(a.aConfirmer).toContain(`taux horaire net (${etape2} h) ou les heures effectuées (40 h)`);
    const c = calendrier(i, D);
    expect(c.mois[0].evenements).toContain('adaptation');
    expect(c.mois[0].aConfirmer).toBe(a.aConfirmer);
    expect(c.mois[0].verse).toBeLessThan(c.mois[1].verse);
    expect(c.mois[1].aConfirmer).toBeUndefined();
  });

  it('adaptation : toutes les heures prévues faites → aucune déduction', () => {
    const i = { ...base, debut: '2027-02', adaptationHeures: 160, adaptationJours: 20 };
    const r = simuler(i, D);
    expect(moisAdaptation(i, r, '2027-02', r.parEnfant.salaire).salaire).toBe(r.parEnfant.salaire);
  });

  it('adaptation à confirmer : 46 semaines (A-08), férié sur un jour d’accueil (art. 47), heures au-delà du planning', () => {
    const inc = calendrier({ ...base, debut: '2027-02', yearType: 'incomplete' as const, semainesAbsence: 4, adaptationHeures: 40, adaptationJours: 5 }, D);
    expect(inc.mois[0].aConfirmer).toContain(MESSAGE_ADAPTATION_A_CONFIRMER);
    expect(inc.mois[0].aConfirmer).toContain('46 semaines');
    // Décembre 2026 : Noël tombe un vendredi, jour d'accueil.
    const dec = calendrier({ ...base, debut: '2026-12', adaptationHeures: 40, adaptationJours: 5 }, D);
    expect(dec.mois[0].aConfirmer).toContain('férié');
    const plus = calendrier({ ...base, debut: '2027-02', adaptationHeures: 170, adaptationJours: 20 }, D);
    expect(plus.mois[0].aConfirmer).toContain('160 heures prévues');
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
// vendredi, aucun férié, 8 h par jour = 184 h prévues ; 46 h faites → 138 h d'absence → un quart du salaire mensualisé.
describe('T-038 G-2 : adaptation qui déborde sur le 2e mois', () => {
  it('le 2e mois suit la même déduction (art. 108.1 et 111), avec ses propres heures', () => {
    const i = { ...base, debut: '2027-02', adaptationHeures: 40, adaptationJours: 5, adaptationHeures2: 46, adaptationJours2: 6 };
    const r = simuler(i, D);
    const S = r.parEnfant.salaire;
    const a2 = moisAdaptation({ ...i, adaptationHeures: 46 }, r, '2027-03', S, 2);
    expect(a2.heuresPrevues).toBe(184);
    expect(a2.salaire).toBe(Math.round(S - (S * 138) / 184));
    const c = calendrier(i, D);
    expect(c.mois[1].evenements).toContain('adaptation');
    const sans = calendrier({ ...i, adaptationHeures2: 0, adaptationJours2: 0 }, D);
    expect(c.mois[1].verse).toBeLessThan(sans.mois[1].verse);
    expect(c.mois[2].evenements).not.toContain('adaptation');
  });
  it('2e mois avec un férié sur un jour d’accueil (mai 2027) : « à confirmer », avec le préfixe du 2e mois', () => {
    const c = calendrier({ ...base, debut: '2027-04', adaptationHeures: 40, adaptationJours: 5, adaptationHeures2: 40, adaptationJours2: 5 }, D);
    expect(c.mois[1].aConfirmer).toContain(MESSAGE_ADAPTATION_2_A_CONFIRMER);
    expect(c.mois[1].aConfirmer).toContain('férié');
  });
});

describe('T-038 suite (G-4) : le total « Mois par mois » ne compte pas en silence un mois à confirmer', () => {
  it('46 semaines (A-08) : le 1er mois est à part, total = somme des autres mois', () => {
    const c = calendrier({ ...base, debut: '2027-02', yearType: 'incomplete' as const, semainesAbsence: 4, adaptationHeures: 40, adaptationJours: 5 }, D);
    expect(c.moisAConfirmer).toEqual(['2027-02']);
    expect(c.totalAConfirmer).toBe(c.mois[0].net);
    expect(c.total).toBe(c.mois.slice(1).reduce((t, m) => t + m.net, 0));
  });
  it('sans adaptation : aucun mois à part', () => {
    const c = calendrier({ ...base, debut: '2027-02' }, D);
    expect(c.moisAConfirmer).toEqual([]);
    expect(c.total).toBe(c.mois.reduce((t, m) => t + m.net, 0));
  });
});

// T-038 suite (G-5). La page Urssaf « Préparer le contrat » (12/03/2026, relue) donne les formules sans exemple chiffré :
// les attendus sont ces formules appliquées aux chiffres du contrat, sans passer par le code. Contrat de base : 40 h par
// semaine sur 52 semaines, soit 40 × 52 ÷ 12 = 173,33 h mensualisées (art. 109). Février 2027 : 160 h prévues (20 jours
// de 8 h, aucun férié). 40 h faites : salaire dû = S − S × 120 ÷ 160 = S ÷ 4.
describe('T-038 suite (G-5) : tests de l’adaptation renforcés', () => {
  const i = { ...base, debut: '2027-02', adaptationHeures: 40, adaptationJours: 5 };
  it('étape 2 (rémunération due ÷ taux net) : 173,33 h ÷ 4 = 43,33 h ; étape 3 (heures effectuées) : 40 h ; les deux dans le message', () => {
    const r = simuler(i, D);
    const a = moisAdaptation(i, r, '2027-02', r.parEnfant.salaire);
    expect(a.heures).toBeCloseTo((40 * 52) / 12 / 4, 1);
    expect(a.heuresFaites).toBe(40);
    expect(a.aConfirmer).toContain('(43,33 h) ou les heures effectuées (40 h)');
  });
  it('embauche le lundi 15/02/2027 : les heures avant l’embauche sont des heures non faites, même dénominateur de 160 h ; le 2e mois (mars) a le sien, 184 h', () => {
    // Du 15 au 28/02 l'AM fait 40 h ; l'adaptation (30 jours calendaires, art. 94) court jusqu'au 16/03 : 46 h faites en mars.
    const j = { ...i, adaptationHeures2: 46, adaptationJours2: 6 };
    const r = simuler(j, D);
    const S = r.parEnfant.salaire;
    expect(moisAdaptation(j, r, '2027-02', S).salaire).toBe(Math.round(S / 4));
    expect(moisAdaptation({ ...j, adaptationHeures: 46 }, r, '2027-03', S, 2).salaire).toBe(Math.round(S - (S * 138) / 184));
  });
  it('46 semaines ou moins (A-08) : le montant reste chiffré, à part du total, et marqué à confirmer', () => {
    const inc = { ...i, yearType: 'incomplete' as const, semainesAbsence: 4 };
    const r = simuler(inc, D);
    const a = moisAdaptation(inc, r, '2027-02', r.parEnfant.salaire);
    expect(a.salaire).toBe(Math.round(r.parEnfant.salaire / 4));
    const c = calendrier(inc, D);
    expect(c.mois[0].aConfirmer).toContain('46 semaines');
    expect(c.totalAConfirmer).toBe(c.mois[0].net);
    expect(c.mois[0].net).toBeGreaterThan(0);
  });
});
