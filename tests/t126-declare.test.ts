import { describe, expect, it } from 'vitest';
import { annulerDeclare, declareLe, marquerDeclare, texteDeclare } from '../src/declares';
import { planMerge, stable } from '../src/sync/plan';
import { joursLunette, valeurACopier } from '../src/screens/Mois';
import { computeMonth, totalAVerser } from '../src/engine/month';
import { makeCtx } from '../src/engine/payroll';
import type { Contract, Planning } from '../src/engine/model';

// T-126 (décision du DG du 26/11/2026) : « C'est déclaré », un état par enfant et par mois, annulable, synchronisé, sans effet
// sur la paie.
function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}
// Même contrat de base que tests/payroll.test.ts.
const base = (): Contract => ({
  id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2026-01-05', yearType: 'complete', weeks: 52, weeksOff: [],
  planning: week('08:00', '17:00'), rateNet: 350, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
  kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2026-01-05',
  balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0,
  alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
});

describe('« C’est déclaré » : marquer et annuler', () => {
  it('marquer garde la date du geste', () => {
    const c = marquerDeclare(base(), '2026-11', '2026-11-28');
    expect(declareLe(c, '2026-11')).toBe('2026-11-28');
    expect(texteDeclare('2026-11-28')).toBe('Déclaré le 28/11');
  });
  it('annuler retire la note ; plus aucun mois : le champ disparaît', () => {
    const c = annulerDeclare(marquerDeclare(base(), '2026-11', '2026-11-28'), '2026-11');
    expect(declareLe(c, '2026-11')).toBeUndefined();
    expect('declares' in c).toBe(false);
  });
});

describe('« C’est déclaré » : changement de mois', () => {
  it('chaque mois a son état ; annuler un mois ne touche pas l’autre', () => {
    let c = marquerDeclare(base(), '2026-10', '2026-11-02');
    c = marquerDeclare(c, '2026-11', '2026-11-28');
    expect(declareLe(c, '2026-10')).toBe('2026-11-02');
    expect(declareLe(c, '2026-12')).toBeUndefined();
    c = annulerDeclare(c, '2026-11');
    expect(declareLe(c, '2026-10')).toBe('2026-11-02');
    expect(declareLe(c, '2026-11')).toBeUndefined();
  });
});

describe('« C’est déclaré » : deux appareils', () => {
  it('noté sur un téléphone, il arrive sur l’autre par la synchronisation du contrat', () => {
    const avant = base();
    const apres = marquerDeclare(avant, '2026-11', '2026-11-28');
    // Téléphone B (pas encore à jour) face au compte écrit par le téléphone A.
    const plan = planMerge([{ s: 'contracts', k: 'c1', value: avant }], [{ s: 'contracts', k: 'c1', v: JSON.stringify(apres), t: 2 }]);
    const recu = plan.toLocal.find((r) => r.s === 'contracts' && r.k === 'c1')?.value as Contract | undefined;
    expect(recu && declareLe(recu, '2026-11')).toBe('2026-11-28');
  });
  it('annulé sur un téléphone, l’annulation arrive aussi', () => {
    const marque = marquerDeclare(base(), '2026-11', '2026-11-28');
    const annule = annulerDeclare(marque, '2026-11');
    const plan = planMerge([{ s: 'contracts', k: 'c1', value: marque }], [{ s: 'contracts', k: 'c1', v: JSON.stringify(annule), t: 3 }]);
    const recu = plan.toLocal.find((r) => r.k === 'c1')?.value as Contract | undefined;
    expect(recu && declareLe(recu, '2026-11')).toBeUndefined();
  });
  it('un téléphone qui a noté hors ligne envoie sa version au compte', () => {
    const marque = marquerDeclare(base(), '2026-11', '2026-11-28');
    const plan = planMerge([{ s: 'contracts', k: 'c1', value: marque }], [], {});
    expect(plan.toRemote.some((r) => r.k === 'c1' && stable(r.value) === stable(marque))).toBe(true);
  });
});

describe('« C’est déclaré » : aucun effet sur la paie', () => {
  it('le mois calculé est le même, noté déclaré ou non', () => {
    const c = base();
    const a = computeMonth(makeCtx(c, [], [], '2026-11-30'), '2026-11', 0);
    const b = computeMonth(makeCtx(marquerDeclare(c, '2026-11', '2026-11-28'), [], [], '2026-11-30'), '2026-11', 0);
    expect(a.nonGere).toEqual([]);
    expect(totalAVerser(b)).toBe(totalAVerser(a));
    expect(stable({ ...b })).toBe(stable({ ...a }));
  });
});

describe('Mois : copie des cases Pajemploi et lunette', () => {
  it('« Copier » colle la valeur sans « € » ni « h »', () => {
    expect(valeurACopier('161 h')).toBe('161');
    expect(valeurACopier('1 234,56 €')).toBe('1 234,56');
    expect(valeurACopier('20')).toBe('20');
  });
  it('lunette : aucun jour sans contrat', () => {
    expect(joursLunette([], '2026-11', [])).toEqual([]);
  });
});
