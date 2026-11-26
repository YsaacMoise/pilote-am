// T-113 : jours de congés acquis sur 3, 4 et 5 jours par semaine avec une absence non assimilée (calculateur-arvela,
// regles/t113-quatre-jours.md). Méthode en jours : 4 × jours de travail par semaine (16 sur 4 jours, 12 sur 3 : DDETS 31,
// fiche 2/5 du 05/11/2024 ; 20 sur 5 : F18260). Méthode en semaines : semaines civiles entières (DDETS 31 ; F18260).
// Le plus favorable des trois (mensuel, semaines, jours) est retenu (F18260). Attendus calculés à la main.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Contract, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { acquisition } from '../src/engine/conges';

function week(days: number[]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start: '08:00', end: '16:00' }];
  return p;
}
const ct = (days: number[], start = '2025-06-02'): Contract => ({
  id: 'c1', child: 'L', family: 'M', color: 0, start, yearType: 'complete', weeks: 52, weeksOff: [],
  planning: week(days), rateNet: 420, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0, kmTaux: 0,
  cpMode: 'juin', majoreFiscal: false, trackedFrom: start, balances: { cpRestants: 30, cpEnCours: 0, maladieDeduits: 0 },
  history: [], createdAt: 0, alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
} as Contract);
const abs = (type: AmLeave['type'], from: string, to: string, over: Partial<AmLeave> = {}): AmLeave => ({ id: `${type}${from}`, type, from, to, ...over });
const jours = (c: Contract, leaves: AmLeave[]) => acquisition(makeCtx(c, [], leaves, '2026-12-31'), 2025).jours;
const J4 = [1, 2, 4, 5], J3 = [1, 2, 4], J5 = [1, 2, 3, 4, 5];

describe('T-113 : absence du 01/10 au 15/12/2025, contrat du 02/06/2025', () => {
  it('4 jours : 208 jours prévus − 43 = 165 ÷ 16 × 2,5 = 25,78 → 26 (semaines entières : 40 ÷ 4 × 2,5 = 25)', () => {
    expect(jours(ct(J4), [abs('sans_solde', '2025-10-01', '2025-12-15')])).toBe(26);
    expect(jours(ct(J4), [abs('remuneree', '2025-10-01', '2025-12-15', { comptePourConges: false })])).toBe(26);
    expect(jours(ct(J4), [abs('remuneree', '2025-10-01', '2025-12-15', { comptePourConges: true })])).toBe(30);
  });
  it('3 jours : 156 − 32 = 124 ÷ 12 × 2,5 = 25,83 → 26', () => {
    expect(jours(ct(J3), [abs('sans_solde', '2025-10-01', '2025-12-15')])).toBe(26);
  });
  it('5 jours : 260 − 54 = 206 ÷ 20 × 2,5 = 25,75 → 26 (T-109)', () => {
    expect(jours(ct(J5), [abs('sans_solde', '2025-10-01', '2025-12-15')])).toBe(26);
  });
});

describe('T-113 : une semaine sans aucun jour de travail ne compte pas (méthode en semaines)', () => {
  // Congé sans solde du lundi au vendredi, 8 semaines (05/01 au 27/02/2026), saisi semaine par semaine : les week-ends
  // restent hors absence. Semaines entières : 52 − 8 = 44 ÷ 4 × 2,5 = 27,5 → 28. Jours, 4 jours : 208 − 32 = 176 ÷ 16 ×
  // 2,5 = 27,5 → 28. Avant la T-113 : jours calendaires (364 − 40) ÷ 28 × 2,5 = 28,93 → 29, les samedis et dimanches de
  // ces semaines comptés comme du travail.
  const lundis = ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26', '2026-02-02', '2026-02-09', '2026-02-16', '2026-02-23'];
  const ss = lundis.map((l) => abs('sans_solde', l, `${l.slice(0, 8)}${String(Number(l.slice(8)) + 4).padStart(2, '0')}`));
  it('4, 3 et 5 jours : 28', () => {
    expect(jours(ct(J4), ss)).toBe(28);
    expect(jours(ct(J3), ss)).toBe(28);
    expect(jours(ct(J5), ss)).toBe(28);
  });
  it('contrat commencé un mercredi (03/09/2025), deux semaines sans solde : 4 jours, 146 ÷ 16 × 2,5 = 22,81 → 23', () => {
    // Avant la T-113 : (271 − 12) ÷ 28 × 2,5 = 23,13 → 24.
    expect(jours(ct(J4, '2025-09-03'), [abs('sans_solde', '2026-02-02', '2026-02-13')])).toBe(23);
  });
});
