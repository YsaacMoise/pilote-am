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

describe('T-030 HC-03 à HC-06 : heures complémentaires au taux du contrat', () => {
  // Le moteur paie les heures complémentaires au taux de base, majoré seulement si le contrat le prévoit
  // (`majorationCompl`). Les quatre exemples officiels fixent ce taux au contrat ; le comparateur ne le transmettait pas.
  it('C-HC-03 (S-BERTRAND p. 4) : 600 € + (2 heures x 5,50 €) = 611 € brut, majoration de 10 % au contrat', () => {
    const c = contract({ yearType: 'incomplete', weeks: 36, majoration: 15, majorationCompl: 10 });
    const b = monthBase(makeCtx(c, [rec('2026-10-05', '08:00', '18:00')], [], '2026-12-31'), '2026-10');
    expect(b.complAmount).toBe(1100);
    expect(b.net).toBe(61100);
  });
  it('C-HC-04 (S-BERTRAND p. 4) : 600 € + (5 heures x 5,50 €) + (2 heures x 5,75 €) = 639 € brut', () => {
    const c = contract({ yearType: 'incomplete', weeks: 36, majoration: 15, majorationCompl: 10 });
    const jours = ['2026-10-05', '2026-10-06', '2026-10-07'].map((d) => rec(d, '08:00', '18:20'));
    const b = monthBase(makeCtx(c, [...jours, rec('2026-10-08', '08:00', '16:00')], [], '2026-12-31'), '2026-10');
    expect(b.complAmount).toBe(2750);
    expect(b.majAmount).toBe(1150);
  });
  it('C-HC-05 (Urssaf, 52 s) : 416 + (13 heures × 3,20 €) + (5 heures × 3,50 €) = 475,10 €', () => {
    // « le salaire horaire net est de 3 €, 3,20€ pour les heures complémentaires et 3,50 € pour les heures majorées »
    const c = contract({ planning: week('09:00', '17:00', [2, 3, 4, 5]), rateNet: 300, majoration: 50 / 3, majorationCompl: 20 / 3 });
    const jours = ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'].map((d) => rec(d, '09:00', '21:30'));
    expect(monthBase(makeCtx(c, jours, [], '2026-12-31'), '2026-10').net).toBe(47510);
  });
  it('C-HC-06 (Urssaf, 46 s) : 370 + (5 heures × 3,20 €) + (5 heures × 3,50 €) = 403,50 €', () => {
    const c = contract({ yearType: 'incomplete', weeks: 37, planning: week('08:30', '18:30', [1, 2, 4, 5]), rateNet: 300,
      majoration: 50 / 3, majorationCompl: 20 / 3 });
    const jours = ['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09'].map((d) => rec(d, '08:30', '21:00'));
    expect(monthBase(makeCtx(c, jours, [], '2026-12-31'), '2026-10').net).toBe(40350);
  });
});
