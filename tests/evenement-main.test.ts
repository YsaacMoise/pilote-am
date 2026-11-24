// Décision du DG du 21/11/2026 (« Payer comme avant », contrôle qualité n° 52, ORANGE) : une absence « événement familial »
// saisie avec l'app en ligne (main, 87c37f3), sans nature ni durée, est payée exactement comme main la paie.
// Valeurs attendues : calculées par le moteur de 87c37f3 sur les mêmes absences (fixtures/paie-evenement-main-87c37f3.json).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AmLeave, Contract } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { computeMonth } from '../src/engine/month';
import { normaliserAbsences, questionsSuite } from '../src/engine/absences';

const main = JSON.parse(readFileSync(new URL('./fixtures/paie-evenement-main-87c37f3.json', import.meta.url), 'utf8'));
const plage = [{ start: '08:00', end: '16:00' }];
const contrat = (yearType: 'complete' | 'incomplete', weeks: number): Contract => ({ id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2024-01-01', yearType, weeks, weeksOff: [],
  planning: { 1: plage, 2: plage, 3: plage, 4: plage, 5: plage }, rateNet: 500, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
  kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2024-01-01', balances: { cpRestants: 30, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0,
  alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false }) as Contract;
// 1 jour, 3 jours, à cheval sur septembre et octobre 2026, et une absence de mars 2025 (mois passé, autre année).
const CAS: Record<string, [string, string]> = { un: ['2026-10-05', '2026-10-05'], trois: ['2026-10-05', '2026-10-07'], cheval: ['2026-09-29', '2026-10-02'], ancien: ['2025-03-03', '2025-03-04'] };
const MOIS = ['2025-03', '2026-09', '2026-10'];

describe('absence « événement familial » de main : même paie que 87c37f3', () => {
  for (const [ct, c] of Object.entries({ complete: contrat('complete', 52), incomplete: contrat('incomplete', 46) })) {
    for (const [k, [from, to]] of Object.entries(CAS)) {
      it(`${ct}, ${k} (${from} au ${to})`, () => {
        // Telle que lue au chargement : la forme de main n'est pas modifiée.
        const leaves = normaliserAbsences([{ id: 'e', type: 'evenement', from, to }]);
        expect(leaves).toEqual([{ id: 'e', type: 'evenement', from, to }]);
        for (const m of MOIS) {
          const r = computeMonth(makeCtx(c, [], leaves, '2026-12-31'), m);
          expect({ netTotal: r.netTotal, retenue: r.retenue, joursActivite: r.joursActivite, deductedDays: r.deductedDays, entretien: r.entretien, heuresNormales: r.heuresNormales }).toEqual(main[`${ct}|${k}|${m}`]);
          expect(r.alerts.join(' ')).not.toMatch(/Événement familial du/);
        }
      });
    }
  }
  it('elle n’entre dans aucun groupe « suite de » : pas de question pour une saisie voisine', () => {
    const l: AmLeave = { id: 'e', type: 'evenement', from: '2026-10-05', to: '2026-10-05' };
    expect(questionsSuite('2026-10-07', '2026-10-07', [l])).toEqual([]);
  });
});
