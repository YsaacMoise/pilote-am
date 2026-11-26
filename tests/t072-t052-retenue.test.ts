// T-072 / T-052, revu par la T-103 (C11, C14) : les droits de la période précédente sont calculés (une seule méthode) ; les
// jours pris au-delà sont un congé sans solde, retenu.
// Même contrat que tests/t050-avenant-conges.test.ts (fiche DDETS 31 « 46 semaines », avenant 52 semaines au 01/06/2022).
import { describe, expect, it } from 'vitest';
import { makeCtx } from '../src/engine/payroll';
import { acquisition, cpExces, droitsAPrendre } from '../src/engine/conges';
import { computeMonth } from '../src/engine/month';
const week = (s: string, e: string, d = [1, 2, 3, 4, 5]) => { const p: any = {}; for (const x of d) p[x] = [{ start: s, end: e }]; return p; };
const an1 = ['2021-10-25', '2021-11-01', '2021-12-20', '2021-12-27', '2022-02-21', '2022-02-28', '2022-04-25', '2022-05-02', '2022-07-04', '2022-07-11', '2022-07-18', '2022-07-25', '2022-08-01', '2022-08-08', '2022-08-15', '2022-08-22'];
const an2 = ['2022-10-24', '2022-10-31', '2022-12-19', '2022-12-26', '2023-02-13', '2023-02-20', '2023-04-17', '2023-04-24', '2023-07-10', '2023-07-17', '2023-07-24', '2023-07-31', '2023-08-07', '2023-08-14', '2023-08-21', '2023-08-28'];
const contrat = (): any => ({ id: 'c1', child: 'P', family: 'E', color: 0, start: '2021-09-01', trackedFrom: '2021-09-01', yearType: 'incomplete', weeks: 36, weeksOff: [...an1, ...an2], majoration: 15, planning: week('08:00', '16:00'), rateNet: 500, entretienJour: 0, repasPrix: 0, repasParJour: 0, kmTaux: 0, cpMode: 'fur', majoreFiscal: false, alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false, balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, avenants: [{ id: 'av', from: '2022-06-01', changes: { yearType: 'complete', weeks: 52, weeksOff: [] } }] });
const cp = { id: 'b', type: 'cp', from: '2022-06-01', to: '2022-06-30' };

describe('T-052, revu par la T-103 (C11, C14) : droits sûrs, le jour au-delà est retenu (congé sans solde)', () => {
  it('maladie en année incomplète : droits 2021 calculés, le jour au-delà retenu en juin 2022', () => {
    const ctx = makeCtx(contrat(), [], [{ id: 'a', type: 'am_malade', from: '2021-10-13', to: '2021-10-15' }, cp] as any, '2022-07-15', 2);
    const m: any = computeMonth(ctx, '2022-06', 2);
    expect(acquisition(ctx, 2021, 2).aConfirmer).toBeUndefined();
    expect(droitsAPrendre(ctx, 2022, 2)).toBe(24);
    expect([...cpExces(ctx)]).toEqual(['2022-06-30']);
    expect(m.deductedDays).toBe(1);
    expect(m.retenue).toBe(3939);
    expect(m.net).toBe(159299);
    expect(m.nonGere).toEqual([]);
  });
  it('témoin : sans la maladie', () => {
    const ctx = makeCtx(contrat(), [], [cp] as any, '2022-07-15', 2);
    const m: any = computeMonth(ctx, '2022-06', 2);
    // Mêmes droits : 9 mois complets de travail en 2021-2022 (Cass. soc. 10/01/1980), les jours de maladie comptés (CCN 48.1.1.2).
    expect(droitsAPrendre(ctx, 2022, 2)).toBe(24);
    expect([...cpExces(ctx)]).toEqual(['2022-06-30']);
    expect(m.retenue).toBe(3939);
    // Sans les 3 jours de maladie retenus en 2021, la régularisation à l'avenant est plus haute (34,29 €).
    expect(m.net).toBe(162728);
  });
});
