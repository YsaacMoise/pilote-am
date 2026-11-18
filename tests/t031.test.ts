// T-031 et T-028 : refus clair des cas non gérés, congés à confirmer signalés dans le compteur fiscal.
// Les attendus viennent de la charte (« tout cas non validé est refusé clairement ») et du brief de la vague 7 :
// ce sont des choix de l'app (refus, signal), pas des montants tirés d'un texte. Aucun montant attendu n'est calculé ici.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Contract, Planning } from '../src/engine/model';
import { makeCtx, monthBase } from '../src/engine/payroll';
import { fiscalYear } from '../src/engine/fiscal';
import { computeMonth, declarationLines, declarationText } from '../src/engine/month';
import { acquisition, cpForMonth, indemnite, soldesDeDepart } from '../src/engine/conges';
import { finDeContrat } from '../src/engine/fin';
import { buildSnapshot } from '../src/partage/snapshot';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}

function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2025-09-01', yearType: 'complete', weeks: 52, weeksOff: [],
    planning: week('08:00', '16:00'), rateNet: 500, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2025-09-01',
    balances: { cpRestants: 30, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, ...over,
  };
}

// Contrat de Mme Bertrand (année incomplète, 36 semaines) : ses congés de juin 2022 sont à confirmer (SUS-11, T-019).
const BERTRAND_OFF = ['2021-10-25', '2021-11-01', '2021-12-20', '2021-12-27', '2022-02-21', '2022-02-28', '2022-04-25', '2022-05-02',
  '2022-07-04', '2022-07-11', '2022-07-18', '2022-07-25', '2022-08-01', '2022-08-08', '2022-08-15', '2022-08-22'];
const bertrand = (over: Partial<Contract> = {}) => contract({ start: '2021-09-01', trackedFrom: '2021-09-01', yearType: 'incomplete', weeks: 36,
  weeksOff: BERTRAND_OFF, majoration: 15, ...over });

describe('T-028 : congés payés à confirmer dans le compteur fiscal', () => {
  it('le mois où des congés sont à confirmer est signalé, comme l’événement familial', () => {
    const f = fiscalYear(makeCtx(bertrand(), [], [], '2022-12-31'), 2022);
    expect(f.nonGere).toMatch(/Congés payés à confirmer en juin 2022 : ils ne sont pas comptés/);
  });
  it('sans congés à confirmer, rien n’est signalé', () => {
    const f = fiscalYear(makeCtx(contract(), [], [], '2026-10-31'), 2026);
    expect(f.nonGere ?? '').not.toMatch(/Congés payés à confirmer/);
  });
});

// Contrat qui a répondu aux questions T-031 : aucun cas non géré
const ok = (over: Partial<Contract> = {}) => contract({ alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, ...over });
const leave = (type: AmLeave['type'], from: string, to: string): AmLeave => ({ id: type, type, from, to });

describe('T-031 : cas du contrat refusés (charte, verrou 6)', () => {
  for (const [nom, over, motif] of [
    ['Alsace-Moselle', { alsaceMoselle: true }, /Alsace-Moselle .* non géré/],
    ['horaires qui changent (semaines A et B)', { planningVariable: true }, /semaines A et B.*non géré/],
    ['accueil occasionnel (CCN art. 97.2)', { accueilOccasionnel: true }, /Accueil occasionnel : non géré/],
  ] as [string, Partial<Contract>, RegExp][]) {
    it(`${nom} : mois refusé, aucune case, aucun montant envoyé`, () => {
      const ctx = makeCtx(ok(over), [], [], '2026-10-31');
      const r = computeMonth(ctx, '2026-03');
      expect(r.nonGere.join(' ')).toMatch(motif);
      expect(declarationLines(ctx, r)).toEqual([]);
      expect(declarationText(ctx, r, 'Nadia')).not.toMatch(/€/);
    });
  }
  it('contrat sans cas non géré : aucun refus, aucune alerte « à compléter »', () => {
    const r = computeMonth(makeCtx(ok(), [], [], '2026-10-31'), '2026-03');
    expect(r.nonGere).toEqual([]);
    expect(r.alerts.join(' ')).not.toMatch(/Contrat à compléter/);
  });
  it('contrat d’avant T-031 (questions sans réponse) : signalé dans chaque mois calculé', () => {
    const r = computeMonth(makeCtx(contract(), [], [], '2026-10-31'), '2026-03');
    expect(r.alerts.join(' ')).toMatch(/Contrat à compléter/);
  });
  it('mois repris d’un bulletin réel : pas refusé (le bulletin fait foi)', () => {
    const c = ok({ alsaceMoselle: true, trackedFrom: '2026-01-01', history: [{ month: '2025-12', net: 50000, source: 'manuel' }] });
    const b = monthBase(makeCtx(c, [], [], '2026-10-31'), '2025-12');
    expect(b.fromHistory).toBe(true);
    expect(b.nonGere).toEqual([]);
  });
  it('congés : jours acquis et indemnité à confirmer, juin sans complément versé', () => {
    const ctx = makeCtx(ok({ alsaceMoselle: true }), [], [], '2026-10-31');
    expect(acquisition(ctx, 2025).aConfirmer?.message).toMatch(/Alsace-Moselle/);
    expect(indemnite(ctx, 2025).aConfirmer).toBeDefined();
    const juin = cpForMonth(ctx, '2026-06');
    expect(juin.complement).toBe(0);
    expect(juin.aConfirmer).toBeDefined();
  });
  it('soldes de départ (reprise) : pas proposés', () => {
    const s = soldesDeDepart(ok({ alsaceMoselle: true, start: '2024-09-01' }), '2026-10-01', 0);
    expect(s.aConfirmer).toMatch(/Alsace-Moselle/);
  });
  it('fin de contrat : aucun montant', () => {
    const f = finDeContrat(makeCtx(ok({ planningVariable: true }), [], [], '2026-10-31'), '2026-10-15', 'retrait');
    expect(f.nonGere?.join(' ')).toMatch(/non géré/);
    expect(f.indemniteRupture + f.cpIndemnite + f.regularisation + f.indemnitePreavis).toBe(0);
  });
  it('compteur fiscal : mois refusés non comptés et signalés', () => {
    const f = fiscalYear(makeCtx(ok({ accueilOccasionnel: true }), [], [], '2026-10-31'), 2026);
    expect(f.recu).toBe(0);
    expect(f.jours).toBe(0);
    expect(f.nonGere).toMatch(/Mars 2026 n’est pas calculé \(cas non géré\)/);
  });
  it('page des parents : mois marqué non calculé, sans montant ni case', () => {
    const snap = buildSnapshot({ ctx: makeCtx(ok({ alsaceMoselle: true }), [], [], '2026-10-20'), journal: [], amName: 'Nadia', enfants: 0, now: 0 });
    expect(snap.mois.length).toBeGreaterThan(0);
    for (const m of snap.mois) { expect(m.nonGere).toBe(true); expect(m.total).toBe(0); expect(m.lignes).toEqual([]); }
  });
});

describe('T-031 : absences non gérées (congé maternité, paternité, de naissance, accident du travail)', () => {
  for (const type of ['maternite', 'paternite', 'naissance_supp', 'accident_travail'] as AmLeave['type'][]) {
    it(`${type} : seuls les mois touchés sont refusés`, () => {
      const ctx = makeCtx(ok(), [], [leave(type, '2026-03-02', '2026-04-10')], '2026-10-31');
      expect(computeMonth(ctx, '2026-03').nonGere.join(' ')).toMatch(/du 02\/03.* au 10\/04.*: non géré/);
      expect(computeMonth(ctx, '2026-04').nonGere.length).toBe(1);
      expect(computeMonth(ctx, '2026-05').nonGere).toEqual([]);
      expect(computeMonth(ctx, '2026-02').nonGere).toEqual([]);
    });
  }
  it('la période de congés qui contient l’absence passe à confirmer, la suivante non', () => {
    const ctx = makeCtx(ok(), [], [leave('maternite', '2026-03-02', '2026-04-10')], '2027-10-31');
    expect(acquisition(ctx, 2025).aConfirmer?.message).toMatch(/Congé maternité/);
    expect(acquisition(ctx, 2026).aConfirmer).toBeUndefined();
  });
  it('fin de contrat après une absence non gérée : aucun montant', () => {
    const f = finDeContrat(makeCtx(ok(), [], [leave('accident_travail', '2026-03-02', '2026-03-20')], '2026-10-31'), '2026-10-15', 'retrait');
    expect(f.nonGere?.join(' ')).toMatch(/Accident du travail/);
    expect(f.cpIndemnite).toBe(0);
  });
});

describe('A-01 : accueil de 47 à 51 semaines (CCN art. 97.1, question 2 posée à la DDETS le 18/11/2026)', () => {
  it('48 semaines en année incomplète : mois refusé', () => {
    const r = computeMonth(makeCtx(ok({ yearType: 'incomplete', weeks: 48 }), [], [], '2026-10-31'), '2026-03');
    expect(r.nonGere.join(' ')).toMatch(/47 à 51 semaines par an : non géré/);
  });
  it('46 semaines : pas refusé à ce titre', () => {
    const r = computeMonth(makeCtx(ok({ yearType: 'incomplete', weeks: 46 }), [], [], '2026-10-31'), '2026-03');
    expect(r.nonGere.join(' ')).not.toMatch(/47 à 51/);
  });
  it('avenant à 50 semaines : refusé', () => {
    const c = ok({ avenants: [{ id: 'a', from: '2026-06-01', changes: { yearType: 'incomplete', weeks: 50 } }] });
    expect(computeMonth(makeCtx(c, [], [], '2026-10-31'), '2026-07').nonGere.join(' ')).toMatch(/47 à 51/);
  });
});
