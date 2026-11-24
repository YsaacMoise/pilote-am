// T-031 et T-028 : refus clair des cas non gérés, congés à confirmer signalés dans le compteur fiscal.
// Les attendus viennent de la charte (« tout cas non validé est refusé clairement ») et du brief de la vague 7 :
// ce sont des choix de l'app (refus, signal), pas des montants tirés d'un texte. Aucun montant attendu n'est calculé ici.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Contract, Planning } from '../src/engine/model';
import { normaliserAbsence, type AbsenceLue } from '../src/engine/absences';
import { makeCtx, monthBase } from '../src/engine/payroll';
import { fiscalYear } from '../src/engine/fiscal';
import { computeMonth, declarationLines, declarationText } from '../src/engine/month';
import { acquisition, cpForMonth, indemnite, soldesDeDepart } from '../src/engine/conges';
import { finDeContrat } from '../src/engine/fin';
import { CDD_A_COMPLETER } from '../src/engine/cdd';
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
const bertrand = (over: Partial<Contract> = {}) => contract({ alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false, start: '2021-09-01', trackedFrom: '2021-09-01', yearType: 'incomplete', weeks: 36,
  weeksOff: BERTRAND_OFF, majoration: 15, ...over });

describe('T-028, revu par la T-103 : compteur fiscal sans « congés à confirmer »', () => {
  it('Mme Bertrand (semaines sans accueil saisies) : juin 2022 est compté, rien n’est signalé à confirmer', () => {
    const f = fiscalYear(makeCtx(bertrand(), [], [], '2022-12-31'), 2022);
    expect(f.nonGere ?? '').not.toMatch(/à confirmer/);
  });
  it('sans congés à confirmer, rien n’est signalé', () => {
    const f = fiscalYear(makeCtx(contract({ start: '2025-06-01', trackedFrom: '2025-06-01', alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false }), [], [], '2026-10-31'), 2026);
    expect(f.nonGere ?? '').not.toMatch(/à confirmer/);
  });
});

// Contrat qui a répondu aux questions T-031 : aucun cas non géré
const ok = (over: Partial<Contract> = {}) => contract({ alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false, ...over });
const leave = (type: AbsenceLue['type'], from: string, to: string): AmLeave => normaliserAbsence({ id: type, type, from, to });

describe('T-031 : cas du contrat refusés (charte, verrou 6)', () => {
  for (const [nom, over, motif] of [
    // T-077 : l'Alsace-Moselle est calculée ; l'accueil de 47 à 51 semaines reste refusé (A-01).
    ['47 à 51 semaines (A-01)', { yearType: 'incomplete', weeks: 48 }, /47 à 51 semaines par an : non géré/],
    // T-076 : planning variable sans ses données (cycle ou plannings, heures payées chaque mois) : contrat à compléter.
    ['horaires qui changent (semaines A et B), données absentes', { planningVariable: true }, /semaines A et B.*contrat à compléter/],
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
    expect(r.nonGere.join(' ')).not.toMatch(/Contrat à compléter/);
  });
  it('contrat d’avant T-031 (questions sans réponse) : mois non calculé, fin de contrat non plus (décision du DG du 18/11/2026)', () => {
    const ctx = makeCtx(contract(), [], [], '2026-10-31');
    const r = computeMonth(ctx, '2026-03');
    expect(r.nonGere[0]).toMatch(/Contrat à compléter : ouvre le contrat et réponds aux 4 questions/);
    expect(declarationLines(ctx, r)).toEqual([]);
    expect(finDeContrat(ctx, '2026-10-15', 'retrait').nonGere?.[0]).toMatch(/Contrat à compléter/);
  });
  it('une seule question sans réponse suffit à bloquer', () => {
    const r = computeMonth(makeCtx(ok({ accueilOccasionnel: undefined }), [], [], '2026-10-31'), '2026-03');
    expect(r.nonGere.join(' ')).toMatch(/Contrat à compléter/);
  });
  it('mois repris d’un bulletin réel : pas refusé (le bulletin fait foi)', () => {
    const c = ok({ yearType: 'incomplete', weeks: 48, trackedFrom: '2026-01-01', history: [{ month: '2025-12', net: 50000, source: 'manuel' }] });
    const b = monthBase(makeCtx(c, [], [], '2026-10-31'), '2025-12');
    expect(b.fromHistory).toBe(true);
    expect(b.nonGere).toEqual([]);
  });
  it('congés : jours acquis et indemnité à confirmer, juin sans complément versé', () => {
    const ctx = makeCtx(ok({ yearType: 'incomplete', weeks: 48 }), [], [], '2026-10-31');
    expect(acquisition(ctx, 2025).aConfirmer?.message).toMatch(/47 à 51 semaines/);
    expect(indemnite(ctx, 2025).aConfirmer).toBeDefined();
    const juin = cpForMonth(ctx, '2026-06');
    expect(juin.complement).toBe(0);
    expect(juin.aConfirmer).toBeDefined();
  });
  it('soldes de départ (reprise) : pas proposés', () => {
    const s = soldesDeDepart(ok({ yearType: 'incomplete', weeks: 48, start: '2024-09-01' }), '2026-10-01', 0);
    expect(s.aConfirmer).toMatch(/47 à 51 semaines/);
  });
  it('fin de contrat : aucun montant', () => {
    const f = finDeContrat(makeCtx(ok({ planningVariable: true }), [], [], '2026-10-31'), '2026-10-15', 'retrait');
    // T-076 : planning variable sans ses données : « à compléter », aucun montant.
    expect(f.nonGere?.join(' ')).toMatch(/à compléter/);
    expect(f.indemniteRupture + f.cpIndemnite + f.regularisation + f.indemnitePreavis).toBe(0);
  });
  it('compteur fiscal : mois refusés non comptés et signalés', () => {
    const f = fiscalYear(makeCtx(ok({ accueilOccasionnel: true }), [], [], '2026-10-31'), 2026);
    expect(f.recu).toBe(0);
    expect(f.jours).toBe(0);
    expect(f.nonGere).toMatch(/Mars 2026 n’est pas calculé \(cas non géré\)/);
  });
  it('page des parents : mois marqué non calculé, sans montant ni case', () => {
    const snap = buildSnapshot({ ctx: makeCtx(ok({ yearType: 'incomplete', weeks: 48 }), [], [], '2026-10-20'), journal: [], amName: 'Nadia', enfants: 0, now: 0 });
    expect(snap.mois.length).toBeGreaterThan(0);
    for (const m of snap.mois) { expect(m.nonGere).toBe(true); expect(m.total).toBe(0); expect(m.lignes).toEqual([]); }
  });
});

describe('T-031 : absences non gérées (congé maternité, paternité, de naissance, accident du travail)', () => {
  for (const type of ['maternite', 'paternite', 'naissance_supp', 'accident_travail'] as AbsenceLue['type'][]) {
    it(`${type} : seuls les mois touchés sont refusés`, () => {
      const ctx = makeCtx(ok(), [], [leave(type, '2026-03-02', '2026-04-10')], '2026-10-31');
      expect(computeMonth(ctx, '2026-03').nonGere.join(' ')).toMatch(/Absence non gérée par l’app du 02\/03.* au 10\/04.*: le salaire de ces jours/);
      expect(computeMonth(ctx, '2026-04').nonGere.length).toBe(1);
      expect(computeMonth(ctx, '2026-05').nonGere).toEqual([]);
      expect(computeMonth(ctx, '2026-02').nonGere).toEqual([]);
    });
  }
  it('la période de congés qui contient l’absence passe à confirmer, la suivante non', () => {
    const ctx = makeCtx(ok(), [], [leave('maternite', '2026-03-02', '2026-04-10')], '2027-10-31');
    expect(acquisition(ctx, 2025).aConfirmer?.message).toMatch(/Absence non gérée par l’app/);
    expect(acquisition(ctx, 2026).aConfirmer).toBeUndefined();
  });
  it('fin de contrat après une absence non gérée : aucun montant', () => {
    const f = finDeContrat(makeCtx(ok(), [], [leave('accident_travail', '2026-03-02', '2026-03-20')], '2026-10-31'), '2026-10-15', 'retrait');
    expect(f.nonGere?.join(' ')).toMatch(/Absence non gérée par l’app du 02\/03/);
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

describe('PREAVIS-DATE-FIN, revu par la T-103 (F1) : une seule date de fin, sans réserve', () => {
  // CCN 64.1 et 120 ; CASF L423-24 ; fiche officielle F2883 : le jour de la première présentation est le premier jour du
  // préavis ; un mois finit la veille du même quantième.
  const ctx = () => makeCtx(ok({ start: '2024-09-01', trackedFrom: '2024-09-01' }), [], [], '2026-10-31');
  it('retrait et démission (plus d’un an) : un mois, du 15/10 au 14/11/2026', () => {
    for (const motif of ['retrait', 'demission'] as const) {
      const f = finDeContrat(ctx(), '2026-10-15', motif);
      expect(f.preavisFin).toBe('2026-11-14');
      expect(f.alertes.join(' ')).not.toMatch(/à confirmer/);
    }
  });
});

describe('T-033 : CDD (cas officiel C-FIN-11, décision du DG du 18/11/2026 : question au contrat)', () => {
  it('CDI : fin de contrat calculée, aucune alerte CDD', () => {
    const f = finDeContrat(makeCtx(ok({ start: '2026-01-05', trackedFrom: '2026-01-05' }), [], [], '2026-12-31'), '2026-10-14', 'retrait');
    expect(f.nonGere).toBeUndefined();
  });
  // T-076 (22/11/2026) : le CDD est calculé (regles/t076-cdd.md). Seul le CDD sans date de fin prévue reste refusé.
  it('CDD sans date de fin prévue : mois et fin de contrat refusés, sans montant', () => {
    const c = ok({ start: '2026-01-05', trackedFrom: '2026-01-05', cdd: true });
    const f = finDeContrat(makeCtx(c, [], [], '2026-12-31'), '2026-10-14', 'fin_cdd');
    expect(f.nonGere?.length).toBeGreaterThan(0);
    expect(f.indemniteRupture + f.regularisation + f.cpIndemnite + (f.ifc ?? 0)).toBe(0);
    const r = monthBase(makeCtx(c, [], [], '2026-12-31'), '2026-03');
    expect(r.nonGere).toContain(CDD_A_COMPLETER);
  });
  it('CDD avec sa date de fin prévue : les mois sont calculés', () => {
    const c = ok({ start: '2026-01-05', trackedFrom: '2026-01-05', cdd: true, cddTerme: '2026-10-30' });
    expect(monthBase(makeCtx(c, [], [], '2026-12-31'), '2026-03').nonGere).toEqual([]);
  });
  it('sans réponse à la question CDI ou CDD : contrat à compléter, rien calculé', () => {
    const c = ok({ start: '2026-01-05', trackedFrom: '2026-01-05', cdd: undefined });
    expect(monthBase(makeCtx(c, [], [], '2026-12-31'), '2026-03').nonGere[0]).toMatch(/réponds aux 4 questions/);
  });
});
