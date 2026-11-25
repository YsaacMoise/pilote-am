// T-103 (C10) : jours acquis par la méthode de l'arrêt Cass. soc. 10/01/1980 (mois complets, puis semaines par 4, puis
// jours ouvrables par 24), restes au prorata (CCN 48.1.1.2), arrondi supérieur ; absences non assimilées hors travail.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Contract, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { acquisition } from '../src/engine/conges';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}
const contrat = (o: Partial<Contract> = {}): Contract => ({
  id: 'c1', child: 'L', family: 'M', color: 0, start: '2025-06-02', yearType: 'complete', weeks: 52, weeksOff: [],
  planning: week('08:00', '16:00'), rateNet: 420, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0, kmTaux: 0,
  cpMode: 'juin', majoreFiscal: false, trackedFrom: '2025-06-02', balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 },
  history: [], createdAt: 0, alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false, ...o,
} as Contract);

describe('T-103 (C10) : arrêt du 10/01/1980', () => {
  it('début le lundi 2 juin, congé sans solde du 9 au 20 février : 29 jours', () => {
    // Mois complets : juillet à mai sauf février = 10. Semaines entières hors de ces mois : 2-8, 9-15, 16-22, 23-29 juin et
    // 2-8 février = 5. Jours ouvrables restants : 30 juin, 21 février, 23 au 28 février = 8.
    // 2,5 × (10 + 5/4 + 8/24) = 28,96 → 29 (arrondi supérieur).
    const l: AmLeave = { id: 's', type: 'sans_solde', from: '2026-02-09', to: '2026-02-20' };
    expect(acquisition(makeCtx(contrat(), [], [l], '2026-12-31'), 2025).jours).toBe(29);
  });
  it('sans l’absence : 2,5 × (11 + 4/4 + 1/24) = 30,1 → 30 (plafond)', () => {
    expect(acquisition(makeCtx(contrat(), [], [], '2026-12-31'), 2025).jours).toBe(30);
  });
  it('enfant malade de l’AM : absence non assimilée, comme le congé sans solde', () => {
    const l: AmLeave = { id: 'e', type: 'am_enfant_malade', from: '2026-02-09', to: '2026-02-20' };
    expect(acquisition(makeCtx(contrat(), [], [l], '2026-12-31'), 2025).jours).toBe(29);
  });
  it('début le 1er septembre (lundi) : 9 mois complets → 22,5 → 23', () => {
    expect(acquisition(makeCtx(contrat({ start: '2025-09-01', trackedFrom: '2025-09-01' }), [], [], '2026-12-31'), 2025).jours).toBe(23);
  });
  it('début le mercredi 17 septembre : 8 mois + 1 semaine (22-28) + 6 jours ouvrables (17-20, 29-30 sept.) : 2,5 × (8 + 1/4 + 6/24) = 21,25 → 22', () => {
    expect(acquisition(makeCtx(contrat({ start: '2025-09-17', trackedFrom: '2025-09-17' }), [], [], '2026-12-31'), 2025).jours).toBe(22);
  });
});
