// T-050 (relecture C-1, 21/11/2026) : avenant d'année incomplète vers année complète.
// Les droits de l'année complète reprennent la borne du lot 3 (main, weeksIn), qui est la valeur de la
// fiche DDETS 31 « 46 semaines » (24 jours).
// T-103 (C11, C14) : les droits sont sûrs (méthode de l'arrêt du 10/01/1980 ; maladie de 2021 comptée, art. 48.1.1.2) : le jour
// pris au-delà est un congé sans solde, retenu (1 jour, 39,39 €).
import { describe, expect, it } from 'vitest';
import { makeCtx } from '../src/engine/payroll';
import { cpDroitsInconnus, cpExces, droitsAPrendre } from '../src/engine/conges';
import { computeMonth } from '../src/engine/month';
const week = (s: string, e: string, d = [1, 2, 3, 4, 5]) => { const p: any = {}; for (const x of d) p[x] = [{ start: s, end: e }]; return p; };
const an1 = ['2021-10-25', '2021-11-01', '2021-12-20', '2021-12-27', '2022-02-21', '2022-02-28', '2022-04-25', '2022-05-02', '2022-07-04', '2022-07-11', '2022-07-18', '2022-07-25', '2022-08-01', '2022-08-08', '2022-08-15', '2022-08-22'];
const an2 = ['2022-10-24', '2022-10-31', '2022-12-19', '2022-12-26', '2023-02-13', '2023-02-20', '2023-04-17', '2023-04-24', '2023-07-10', '2023-07-17', '2023-07-24', '2023-07-31', '2023-08-07', '2023-08-14', '2023-08-21', '2023-08-28'];
const c4: any = { id: 'c1', child: 'P', family: 'E', color: 0, start: '2021-09-01', trackedFrom: '2021-09-01', yearType: 'incomplete', weeks: 36, weeksOff: [...an1, ...an2], majoration: 15, planning: week('08:00', '16:00'), rateNet: 500, entretienJour: 0, repasPrix: 0, repasParJour: 0, kmTaux: 0, cpMode: 'fur', majoreFiscal: false, alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false, balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0 };
const leaves: any = [{ id: 'a', type: 'am_malade', from: '2021-10-13', to: '2021-10-15' }, { id: 'b', type: 'cp', from: '2022-06-01', to: '2022-06-30' }];
c4.avenants = [{ id: 'av', from: '2022-06-01', changes: { yearType: 'complete', weeks: 52, weeksOff: [] } }];
const ctx = makeCtx(c4, [], leaves, '2022-07-15', 2);
const m: any = computeMonth(ctx, '2022-06', 2);

describe('T-050 C-1 : avenant incomplète vers complète, congés au-delà des droits', () => {
  it('T-103 (C11, C14) : droits sûrs (méthode de l’arrêt du 10/01/1980), le jour au-delà est pris sans solde, retenu', () => {
    expect(droitsAPrendre(ctx, 2022, 2)).toBe(24);
    expect([...cpExces(ctx)]).toEqual(['2022-06-30']);
    expect([...cpDroitsInconnus(ctx)]).toEqual([]);
    expect(m.deductedDays).toBe(1);
    expect(m.retenue).toBe(3939); // 1 jour sans solde, comme avant la T-072
    expect(m.net).toBe(159299);
    expect(m.nonGere).toEqual([]);
  });
});
