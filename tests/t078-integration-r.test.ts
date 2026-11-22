// T-078 (intégration), corrections R1 et R2 de la relecture du 22/11/2026 à 18 h 46 (rapports/integration-2026-11-22-18h46-
// relecture.md du dépôt calculateur-arvela). Attendus tirés des textes et des règles du projet, jamais du code :
// - Règle T-038 : un montant qui change d'une variante à l'autre (date de fin possible, lecture d'un texte) n'est ni donné ni
//   compté comme sûr ; il est « à confirmer » avec ses valeurs.
// - R1 : C. trav. L1242-16, plancher de l'indemnité de congés non pris d'un CDD (dixième des salaires bruts du contrat). Avec
//   des congés pris, aucun texte ne dit s'ils comptent (R-CDD-10) : écart à confirmer. Un CDD suivi par l'app après son début
//   ne dit pas si des congés ont été pris avant : l'écart est aussi à confirmer.
// - R2 : CCN art. 121.1 (9 mois) et 64.2 ; question D-1 (9 mois à la lettre ou à la fin du contrat, préavis dispensé compris) ;
//   T-077, lecture B : préavis local de six semaines en Alsace-Moselle (C. trav. L1234-16). La fin de ce préavis est une date
//   de fin possible de plus.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Contract, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { finDeCdd, finDeContrat } from '../src/engine/fin';
import { monthsBetween } from '../src/engine/dates';
import { euros } from '../src/engine/money';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning { const p: Planning = {}; for (const d of days) p[d] = [{ start, end }]; return p; }

describe('T-078 R1 : CDD suivi après son début, plancher L1242-16 à confirmer', () => {
  // CDD du 01/09/2025 au 31/08/2026, 45 h du lundi au vendredi, 5,00 € net, 52 semaines : 975,00 € net par mois.
  const cdd = (over: Partial<Contract> = {}): Contract => ({
    id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2025-09-01', yearType: 'complete', weeks: 52, weeksOff: [],
    planning: week('08:00', '17:00'), rateNet: 500, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0, kmTaux: 0,
    cpMode: 'juin', majoreFiscal: false, trackedFrom: '2025-09-01', balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 },
    history: [], createdAt: 0, alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false,
    cdd: true, cddTerme: '2026-08-31', cddMotif: 'autre', ...over,
  } as Contract);
  const fin = (c: Contract, leaves: AmLeave[] = []) => finDeCdd(makeCtx(c, [], leaves, '2026-12-31'), '2026-08-31', 'terme');
  // Mois de septembre 2025 à juin 2026 en historique (975,00 € net chacun), suivi par l'app à partir du 01/07/2026.
  const historique = monthsBetween('2025-09', '2026-06').map((m) => ({ month: m, net: 97500, source: 'manuel' as const }));

  it('suivi dès le début, congés pris en juin 2026 : part sûre et écart au plancher à confirmer (témoin)', () => {
    const f = fin(cdd(), [{ id: 'cp', type: 'cp', from: '2026-06-01', to: '2026-06-27' }]);
    expect(f.cpIndemnite).toBe(40950);
    expect(f.cpPartAConfirmer?.lectures).toEqual([128700, 40950]);
  });
  it('suivi à partir du 01/07/2026, historique, 0 jour restant : 1 287,00 € n’est plus donné sûr', () => {
    const f = fin(cdd({ trackedFrom: '2026-07-01', history: historique }));
    expect(f.nonGere).toBeUndefined();
    expect(f.cpIndemnite).toBeLessThan(128700);
    expect(f.cpPartAConfirmer).toBeDefined();
    expect(Math.max(...f.cpPartAConfirmer!.lectures)).toBe(128700);
    expect(f.cpPartAConfirmer!.message).toContain('L1242-16');
    expect(f.cpPartAConfirmer!.message).toContain('pas depuis son début');
  });
  it('suivi dès le début, aucun congé pris : plancher L1242-16 donné sûr (témoin)', () => {
    const f = fin(cdd());
    expect(f.cpPartAConfirmer?.message ?? '').not.toContain('pas depuis son début');
    expect(f.cpIndemnite).toBeGreaterThanOrEqual(128700);
  });
});

describe('T-078 R2 : Alsace-Moselle, préavis dispensé, 9 mois atteints à la fin du préavis local', () => {
  // 52 semaines, 45 h du lundi au vendredi, 7,45 € net, début lundi 05/01/2026. Retrait, lettre le 01/09/2026 (7 mois),
  // dispense dès le 01/09 (dernier jour travaillé 31/08). Convention : 15 jours, fin le 15/09/2026 (8 mois à la fin).
  // Lecture B (L1234-16) : six semaines, fin le 12/10/2026 (9 mois à la fin).
  const contrat = (over: Partial<Contract> = {}): Contract => ({
    id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2026-01-05', yearType: 'complete', weeks: 52, weeksOff: [],
    planning: week('08:00', '17:00'), rateNet: 745, majoration: 10, entretienJour: 422, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2026-01-05',
    alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, ...over,
  } as Contract);
  const dispense = { demandeur: 'employeur' as const, dernierJourTravaille: '2026-08-31' };
  const fin = (c: Contract) => finDeContrat(makeCtx(c, [], [], '2026-12-31'), '2026-09-01', 'retrait', 0, undefined, dispense);

  it('Bas-Rhin : « pas d’indemnité » n’est plus donné sûr ; valeur à la fin du préavis local (12/10/2026)', () => {
    const f = fin(contrat({ alsaceMoselle: true, departement: '67' }));
    expect(f.nonGere).toBeUndefined();
    expect(f.dernierJour).toBe('2026-09-15');
    expect(f.indemniteRupture).toBe(0);
    expect(f.ruptureAConfirmer).toBe(true);
    expect(f.ruptureExplication).toMatch(/^À confirmer/);
    expect(f.ruptureVariantes).toContain('fin le 15/09/2026 : pas d’indemnité (8 mois)');
    expect(f.ruptureVariantes).toContain('préavis local de six semaines (Alsace-Moselle, à confirmer), fin le 12/10/2026 : ');
    expect(f.ruptureVariantes).toContain(euros(21818));
    expect(f.ruptureVariantes).toContain(euros(18594));
  });
  it('même cas en métropole : 9 mois à aucune date, pas d’indemnité, sûr (témoin)', () => {
    const f = fin(contrat());
    expect(f.indemniteRupture).toBe(0);
    expect(f.ruptureAConfirmer).toBeFalsy();
  });
});
