// T-041 : constats M-6 et R-2 de la relecture V4 (regles/t036-relecture.md).
// M-6 : CCN IDCC 3239, socle AM, art. 105, lu en entier sur Légifrance le 18/11/2026 (KALISCTA000043941866) :
// « en cas d'absence durant 14 jours calendaires consécutifs ». Le texte ne dit pas si les jours sans accueil prévu
// couverts par le certificat après le dernier jour d'absence comptent : les jours restent « à confirmer », le message le dit.
import { describe, expect, it } from 'vitest';
import type { Contract, DayRec, Planning } from '../src/engine/model';
import { makeCtx, sickDeductible, sickLectures } from '../src/engine/payroll';

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
