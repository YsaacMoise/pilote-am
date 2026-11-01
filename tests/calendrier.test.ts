import { describe, expect, it } from 'vitest';
import { calendrier, levierTarif, selonRevenus, tarifMaxSansDepassement, MOIS_CALENDRIER } from '../src/engine/calendrier';
import { planningRegulier, simuler, simulationParDefaut } from '../src/engine/simulation';

const D = '2026-11-01';
const base = { ...simulationParDefaut(D), planning: planningRegulier(5, 40), tauxBrut: 510, entretien: 380, revenusAn: 42000, enfants: ['2025-05'], debut: '2026-12' };

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

  it('adaptation : premier mois payé aux heures réelles', () => {
    const c = calendrier({ ...base, adaptationHeures: 40, adaptationJours: 8 }, D);
    expect(c.mois[0].evenements).toContain('adaptation');
    expect(c.mois[0].verse).toBeLessThan(c.mois[1].verse);
    expect(c.mois[0].verse).toBeGreaterThanOrEqual(40 * 398);
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
