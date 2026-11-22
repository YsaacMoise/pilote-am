// T-072 / T-052 (relecture T-050, point C-2) : droits de la période précédente « à confirmer » sans lecture
// (ici une absence pour maladie en année incomplète). Règle T-019 et T-030 : un montant à confirmer n'est ni payé
// ni retenu. Les jours pris au-delà de la borne interne ne sont donc pas retenus : ils sont à confirmer.
// Même contrat que tests/t050-avenant-conges.test.ts (fiche DDETS 31 « 46 semaines », avenant 52 semaines au 01/06/2022).
import { describe, expect, it } from 'vitest';
import { makeCtx } from '../src/engine/payroll';
import { acquisition, cpExces, cpExcesAConfirmer, droitsAPrendre } from '../src/engine/conges';
import { computeMonth } from '../src/engine/month';
const week = (s: string, e: string, d = [1, 2, 3, 4, 5]) => { const p: any = {}; for (const x of d) p[x] = [{ start: s, end: e }]; return p; };
const an1 = ['2021-10-25', '2021-11-01', '2021-12-20', '2021-12-27', '2022-02-21', '2022-02-28', '2022-04-25', '2022-05-02', '2022-07-04', '2022-07-11', '2022-07-18', '2022-07-25', '2022-08-01', '2022-08-08', '2022-08-15', '2022-08-22'];
const an2 = ['2022-10-24', '2022-10-31', '2022-12-19', '2022-12-26', '2023-02-13', '2023-02-20', '2023-04-17', '2023-04-24', '2023-07-10', '2023-07-17', '2023-07-24', '2023-07-31', '2023-08-07', '2023-08-14', '2023-08-21', '2023-08-28'];
const contrat = (): any => ({ id: 'c1', child: 'P', family: 'E', color: 0, start: '2021-09-01', trackedFrom: '2021-09-01', yearType: 'incomplete', weeks: 36, weeksOff: [...an1, ...an2], majoration: 15, planning: week('08:00', '16:00'), rateNet: 500, entretienJour: 0, repasPrix: 0, repasParJour: 0, kmTaux: 0, cpMode: 'fur', majoreFiscal: false, alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false, balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, avenants: [{ id: 'av', from: '2022-06-01', changes: { yearType: 'complete', weeks: 52, weeksOff: [] } }] });
const cp = { id: 'b', type: 'cp', from: '2022-06-01', to: '2022-06-30' };

describe('T-052 : pas de retenue de congés quand les droits sont à confirmer', () => {
  it('maladie en année incomplète : droits 2021 à confirmer sans lecture, aucun jour retenu en juin 2022', () => {
    const ctx = makeCtx(contrat(), [], [{ id: 'a', type: 'am_malade', from: '2021-10-13', to: '2021-10-15' }, cp] as any, '2022-07-15', 2);
    const prec = acquisition(ctx, 2021, 2);
    expect(prec.aConfirmer).toBeTruthy();
    expect(prec.aConfirmer!.lectures).toEqual([]);
    expect(droitsAPrendre(ctx, 2022, 2)).toBe(24);
    expect([...cpExces(ctx)]).toEqual([]);
    expect([...cpExcesAConfirmer(ctx)]).toEqual(['2022-06-30']);
    const m: any = computeMonth(ctx, '2022-06', 2);
    expect(m.deductedDays).toBe(0);
    expect(m.retenue).toBe(0);
    // Le jour au-delà de la borne n'est pas payé non plus : 39,39 € à confirmer, hors du total (net inchangé).
    expect(m.net).toBe(159299);
    expect(m.joursCpAConfirmer).toBe(1);
    expect(m.evenementAConfirmer).toBe(3939);
  });

  it('témoin, inchangé : sans la maladie, deux lectures (23 et 27 jours), deux jours à confirmer, aucun retenu', () => {
    const ctx = makeCtx(contrat(), [], [cp] as any, '2022-07-15', 2);
    expect(acquisition(ctx, 2021, 2).aConfirmer!.lectures.length).toBeGreaterThan(0);
    expect(droitsAPrendre(ctx, 2022, 2)).toBe(27);
    expect([...cpExces(ctx)]).toEqual([]);
    expect([...cpExcesAConfirmer(ctx)]).toEqual(['2022-06-29', '2022-06-30']);
    const m: any = computeMonth(ctx, '2022-06', 2);
    expect(m.deductedDays).toBe(0);
    expect(m.net).toBe(158788);
    expect(m.evenementAConfirmer).toBe(7879);
  });
});
