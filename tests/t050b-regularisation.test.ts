// T-050b (A-50) : la régularisation « à confirmer » rend « à confirmer » l'indemnité de congés non pris quand elle en change
// le montant (base du dixième, CCN art. 48.1.1.5 et 124). En année incomplète, les jours de congés sont presque toujours
// déjà « à confirmer » (T-019), ce qui masque ce mécanisme : ce fichier neutralise les seules raisons « jours à confirmer »
// des congés (acquisition, indemnité annuelle, compteur) pour l'isoler. Les montants viennent du moteur, non simulés.
import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/engine/conges', async (importOriginal) => {
  const m = await importOriginal<typeof import('../src/engine/conges')>();
  return {
    ...m,
    acquisition: (...a: Parameters<typeof m.acquisition>) => ({ ...m.acquisition(...a), aConfirmer: undefined }),
    indemnite: (...a: Parameters<typeof m.indemnite>) => ({ ...m.indemnite(...a), aConfirmer: undefined }),
    compteur: (...a: Parameters<typeof m.compteur>) => ({ ...m.compteur(...a), aPrendreAConfirmer: undefined, decompteAConfirmer: [] }),
  };
});
import type { AmLeave, Contract, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { finDeContrat } from '../src/engine/fin';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}
const lundis = (from: string, n: number) => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7 * i);
  return d.toISOString().slice(0, 10);
});
// Mêmes contrats que tests/t038.test.ts : 36 semaines, 40 h du lundi au vendredi, 5 € net (600 € par mois).
const SEMAINES_OFF = [...lundis('2025-10-20', 2), ...lundis('2025-12-22', 2), ...lundis('2026-02-16', 2), ...lundis('2026-04-13', 2), ...lundis('2026-07-06', 8), '2026-10-19'];
function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2025-09-01', yearType: 'incomplete', weeks: 36, weeksOff: SEMAINES_OFF,
    planning: week('08:00', '16:00'), rateNet: 500, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2025-09-01',
    alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, ...over,
  };
}
const EVENEMENT: AmLeave = { id: 'e', type: 'evenement', from: '2026-03-10', to: '2026-03-11', joursEvenement: 0 }; // durée non gérée : jours « à confirmer »


describe('T-050b, A-50, revu par la T-103 : ancienne saisie sans durée', () => {
  it('fin de contrat : aucune régularisation « à confirmer »', () => {
    const r = finDeContrat(makeCtx(contract(), [], [EVENEMENT], '2026-11-18'), '2026-06-10', 'retrait');
    expect(r.regularisationAConfirmer).toBeUndefined();
  });
});

