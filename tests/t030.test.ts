// T-030 : cas officiels que le moteur A ne retrouvait pas (rapport projet/moteur/T-030-cas-officiels.md).
// Chaque attendu vient d'un cas officiel (projet/tests/cas-officiels-v0.md) ou d'un texte lu à la source, cité dans le test.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Contract, DayRec, Planning } from '../src/engine/model';
import { makeCtx, monthBase } from '../src/engine/payroll';
import { ratesAt } from '../src/engine/rates';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}
function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2026-09-01', yearType: 'complete', weeks: 52, weeksOff: [],
    planning: week('08:00', '16:00'), rateNet: 500, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2026-09-01',
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, ...over,
  };
}
const rec = (date: string, a: string, d: string): DayRec => ({ key: `c1|${date}`, cid: 'c1', date, pres: [{ a, d }] });
export { rec };
export type { AmLeave };

describe('T-030 NET-02 : minimum conventionnel net de 2025-2026', () => {
  // Urssaf, « Rémunérer un salarié à domicile ou un assistant maternel », tableau AM : « Du 1er janvier 2026 au
  // 31 mai 2026 … Salaire horaire brut 3,64 € … Salaire horaire net 2,86 € » ; historique « Du 1er avril 2025 au
  // 31 décembre 2025 » : 3,64 € brut, 2,86 € net (lu le 18/11/2026).
  it('C-NET-02 : 3,64 € brut, 2,86 € net du 1er janvier au 31 mai 2026', () => {
    expect(ratesAt('2026-01-01')!.minConvBrut).toBe(364);
    expect(ratesAt('2026-01-01')!.minConvNet).toBe(286);
  });
  it('Urssaf, historique : 2,86 € net du 1er avril au 31 décembre 2025', () => {
    expect(ratesAt('2025-04-01')!.minConvNet).toBe(286);
  });
});
