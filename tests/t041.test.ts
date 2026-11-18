// T-041 : constats M-6 et R-2 de la relecture V4 (regles/t036-relecture.md).
// M-6 : CCN IDCC 3239, socle AM, art. 105, lu en entier sur Légifrance le 18/11/2026 (KALISCTA000043941866) :
// « en cas d'absence durant 14 jours calendaires consécutifs ». Le texte ne dit pas si les jours sans accueil prévu
// couverts par le certificat après le dernier jour d'absence comptent : les jours restent « à confirmer », le message le dit.
import { describe, expect, it } from 'vitest';
import type { Contract, DayRec, Planning } from '../src/engine/model';
import { makeCtx, sickDeductible, sickLectures } from '../src/engine/payroll';
import { RATES, dateLongue, entretienHoraireMin, minConvDepuis, minimumTitreAmAp, ratesConnus, repasAvantageAu, repasAvantageParAnnee, valeurDepuis, type Rates } from '../src/engine/rates';
import { eurosTexte } from '../src/engine/money';
import { controle } from '../src/engine/controle';
import { computeMonth } from '../src/engine/month';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}
function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2026-01-05', yearType: 'complete', weeks: 52, weeksOff: [],
    planning: week('08:00', '17:00'), rateNet: 350, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2026-01-05',
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0,
    alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false, ...over,
  };
}
const rec = (date: string, r: Partial<DayRec>): DayRec => ({ key: `c1|${date}`, cid: 'c1', date, ...r });
const malade = (jours: string[]) => jours.map((d) => rec(`2026-03-${d}`, { abs: 'malade_certif' }));

describe('T-041 M-6 : art. 105, certificat qui couvre le week-end après le dernier jour d’absence', () => {
  it('lundi 9 au vendredi 20 mars : 12 jours calendaires, 14 avec le week-end ; jours à confirmer, message précis', () => {
    const ctx = makeCtx(contract(), malade(['09', '10', '11', '12', '13', '16', '17', '18', '19', '20']), [], '2026-04-01');
    const { retenus, aConfirmer } = sickLectures(ctx);
    // Retenus dans les deux lectures : les 5 premiers jours seulement. Rien n'est retenu en silence au-delà.
    expect([...retenus].sort()).toEqual(['2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13']);
    expect([...aConfirmer.keys()].sort()).toEqual(['2026-03-16', '2026-03-17', '2026-03-18', '2026-03-19', '2026-03-20']);
    const raison = aConfirmer.get('2026-03-16')!;
    expect(raison).toMatch(/jusqu’au 22\/03, l’absence dure 14 jours calendaires/);
    expect(raison).toMatch(/l’app ne les compte pas et ne tranche pas/);
  });
  it('lundi 9 au mercredi 18 mars : l’enfant revient le jeudi, pas de jours sans accueil à ajouter, pas de phrase en plus', () => {
    const ctx = makeCtx(contract(), malade(['09', '10', '11', '12', '13', '16', '17', '18']), [], '2026-04-01');
    const { aConfirmer } = sickLectures(ctx);
    expect(aConfirmer.size).toBe(3);
    expect(aConfirmer.get('2026-03-16')!).not.toMatch(/sans accueil jusqu’au/);
  });
  it('absence de 14 jours calendaires mesurée sur les jours prévus : inchangée (longue, retenue dans les deux lectures)', () => {
    const ctx = makeCtx(contract(), malade(['09', '10', '11', '12', '13', '16', '17', '18', '19', '20', '23']), [], '2026-04-01');
    expect(sickDeductible(ctx).size).toBe(10);
    expect(sickLectures(ctx).aConfirmer.size).toBe(0);
  });
});


// R-2 : les textes qui citent un barème le lisent dans rates.ts à la date du calcul (valeurs du tableau RATES,
// sources dans ses lignes : arrêté du 22 mai 2026, Urssaf mise à jour du 01/06/2026).
describe('T-041 R-2 : montants et dates de barème lus dans rates.ts', () => {
  it('au 18/11/2026 : minimum depuis le 1er juin 2026, entretien 0,435 € de l’heure et 2,65 € par jour', () => {
    expect(minConvDepuis('2026-11-18')).toBe('2026-06-01');
    expect(dateLongue(minConvDepuis('2026-11-18')!)).toBe('1er juin 2026');
    expect(eurosTexte(entretienHoraireMin('2026-11-18')!)).toBe('0,435 €');
    expect(eurosTexte(ratesConnus('2026-11-18').entretienPlancherJour)).toBe('2,65 €');
    expect(minimumTitreAmAp('2026-11-18')).toBe(437);
    expect(repasAvantageAu('2026-11-18')).toBe(550);
    expect(repasAvantageParAnnee()).toEqual([{ annee: '2026', montant: 550 }]);
  });
  it('format des montants cités : 875 €, 1 750 €, 5 €, 2,60 €', () => {
    expect(eurosTexte(87500)).toBe('875 €');
    expect(eurosTexte(175000)).toBe('1 750 €');
    expect(eurosTexte(500)).toBe('5 €');
    expect(eurosTexte(260)).toBe('2,60 €');
  });
  it('une revalorisation ajoutée dans RATES change les textes (SMIC et MG au 1er décembre, grille au 1er janvier)', () => {
    const base = RATES.at(-1)!;
    const dec: Rates = { ...base, from: '2026-12-01', smic: base.smic + 20, mg: base.mg + 7, source: 'test' };
    const jan: Rates = { ...dec, from: '2027-01-01', minConvBrut: base.minConvBrut + 10, minConvNet: (base.minConvNet ?? 0) + 8, repasAvantage: undefined, source: 'test' };
    RATES.push(dec, jan);
    try {
      // SMIC et MG changent, la grille non : le minimum date toujours du 1er juin 2026, l'entretien suit le MG.
      expect(minConvDepuis('2026-12-15')).toBe('2026-06-01');
      expect(entretienHoraireMin('2026-12-15')).toBe((base.mg + 7) / 10);
      expect(minimumTitreAmAp('2026-12-15')).toBe(437);
      // La grille change : nouvelle date, et le minimum avec le titre AM-AP n'est plus cité (valeur non connue).
      expect(minConvDepuis('2027-01-15')).toBe('2027-01-01');
      expect(minimumTitreAmAp('2027-01-15')).toBeUndefined();
      expect(repasAvantageAu('2027-01-15')).toBeUndefined();
      // Contrôle du bulletin : la date du minimum net vient de la grille, pas de la dernière ligne de barèmes.
      expect(valeurDepuis('2026-12-31', 'minConvNet')).toBe('2026-06-01');
    } finally {
      RATES.splice(RATES.indexOf(dec), 2);
    }
  });
  it('minimum net : date de la première ligne qui porte la valeur (1er janvier 2025, pas avant)', () => {
    expect(valeurDepuis('2025-02-15', 'minConvNet')).toBe('2025-01-01');
    expect(valeurDepuis('2024-06-15', 'minConvNet')).toBeUndefined();
  });
});

describe('T-041 R-2 : contrôle du bulletin, date du minimum net', () => {
  it('avec une ligne SMIC au 1er décembre 2026, le minimum net de décembre date toujours du 01/06/2026', () => {
    const base = RATES.at(-1)!;
    const dec: Rates = { ...base, from: '2026-12-01', smic: base.smic + 20, mg: base.mg + 7, source: 'test' };
    RATES.push(dec);
    try {
      const ctx = makeCtx(contract({ rateNet: 300 }), [], [], '2027-01-05');
      const r = computeMonth(ctx, '2026-12');
      const w = controle({ id: 'b', cid: 'c1', month: '2026-12', source: 'manuel' }, r, 300).find((x) => x.title === 'Taux du contrat sous le minimum')!;
      expect(w.detail).toMatch(/\(3,28\s€\) depuis le 01\/06\/2026/);
    } finally {
      RATES.splice(RATES.indexOf(dec), 1);
    }
  });
});
