// T-103 (N1) : part de chaque parent dans les indemnités journalières (CSS R323-4 : salaires des 3 mois civils avant
// l'absence, tous employeurs). Calcul à la main : deux contrats identiques → moitié chacun ; plus des salaires hors de l'app
// égaux à ceux d'un contrat → un tiers chacun.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Contract, Planning } from '../src/engine/model';
import { ctxFor, partIJContrat, state } from '../src/store';
import { computeMonth } from '../src/engine/month';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}
const ct = (id: string): Contract => ({
  id, child: id, family: 'F', color: 0, start: '2026-01-05', yearType: 'complete', weeks: 52, weeksOff: [], planning: week('08:00', '16:00'),
  rateNet: 500, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0, kmTaux: 0, cpMode: 'juin', majoreFiscal: false,
  trackedFrom: '2026-01-05', balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0,
  alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
} as Contract);

describe('T-103 (N1) : part des indemnités journalières par contrat', () => {
  it('deux contrats identiques : 50 % chacun ; salaires hors de l’app non saisis : part inconnue', () => {
    state.contracts = [ct('a'), ct('b')];
    state.days = new Map();
    const l: AmLeave = { id: 'd', type: 'evenement', from: '2026-10-05', to: '2026-10-14', joursEvenement: 8, ijSecu: 10000, ijSalairesAutres: 0 };
    state.leaves = [l];
    expect(partIJContrat(state.contracts[0], l)).toBeCloseTo(0.5, 10);
    expect(partIJContrat(state.contracts[0], { ...l, ijSalairesAutres: undefined })).toBeUndefined();
  });
  it('salaires hors de l’app égaux à ceux d’un contrat sur juillet à septembre : un tiers chacun', () => {
    // Autres identifiants : le magasin garde les calculs par contrat (ctxFor) tant que rien n'est enregistré.
    state.contracts = [ct('c'), ct('d')];
    state.leaves = [];
    const brut3 = ['2026-07', '2026-08', '2026-09'].reduce((t, m) => t + computeMonth(ctxFor(ct('x')), m).brutEstime, 0);
    const l: AmLeave = { id: 'd', type: 'evenement', from: '2026-10-05', to: '2026-10-14', joursEvenement: 8, ijSecu: 9000, ijSalairesAutres: brut3 };
    state.leaves = [l];
    expect(partIJContrat(state.contracts[0], l)).toBeCloseTo(1 / 3, 10);
    // Déduction du mois : 90,00 € × 1/3 = 30,00 € pour ce parent.
    expect(computeMonth(ctxFor(state.contracts[0]), '2026-10').ijDeduites).toBe(3000);
  });
});
