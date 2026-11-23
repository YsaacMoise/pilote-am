// T-082 (relecture T-072, R-1 ; décision du DG du 22/11/2026). Droits de la période précédente « à confirmer » sans
// lecture chiffrée (ici une absence pour maladie en année incomplète). Les jours de congés pris sous la borne interne
// restent payés, dans le total (exception écrite à la règle T-019 et T-030, pour ces seuls jours). L'app le dit : chaque
// jour concerné porte la mention « droit à confirmer », avec la raison. Aucun montant ne change. Les retenues restent
// interdites (T-052). Même contrat que tests/t072-t052-retenue.test.ts.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dayInfo, makeCtx } from '../src/engine/payroll';
import { cpDroitAConfirmer, cpExces } from '../src/engine/conges';
import { computeMonth, declarationLines, declarationText, mentionDroitAConfirmer } from '../src/engine/month';
import { releveDonnees } from '../src/releve/donnees';
import { euros } from '../src/engine/money';
const week = (s: string, e: string, d = [1, 2, 3, 4, 5]) => { const p: any = {}; for (const x of d) p[x] = [{ start: s, end: e }]; return p; };
const an1 = ['2021-10-25', '2021-11-01', '2021-12-20', '2021-12-27', '2022-02-21', '2022-02-28', '2022-04-25', '2022-05-02', '2022-07-04', '2022-07-11', '2022-07-18', '2022-07-25', '2022-08-01', '2022-08-08', '2022-08-15', '2022-08-22'];
const an2 = ['2022-10-24', '2022-10-31', '2022-12-19', '2022-12-26', '2023-02-13', '2023-02-20', '2023-04-17', '2023-04-24', '2023-07-10', '2023-07-17', '2023-07-24', '2023-07-31', '2023-08-07', '2023-08-14', '2023-08-21', '2023-08-28'];
const contrat = (): any => ({ id: 'c1', child: 'P', family: 'E', color: 0, start: '2021-09-01', trackedFrom: '2021-09-01', yearType: 'incomplete', weeks: 36, weeksOff: [...an1, ...an2], majoration: 15, planning: week('08:00', '16:00'), rateNet: 500, entretienJour: 0, repasPrix: 0, repasParJour: 0, kmTaux: 0, cpMode: 'fur', majoreFiscal: false, alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false, balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, avenants: [{ id: 'av', from: '2022-06-01', changes: { yearType: 'complete', weeks: 52, weeksOff: [] } }] });
const cp = { id: 'b', type: 'cp', from: '2022-06-01', to: '2022-06-30' };
const maladie = { id: 'a', type: 'am_malade', from: '2021-10-13', to: '2021-10-15' };

describe('T-082 : jours de congés payés dont le droit est à confirmer', () => {
  const ctx = makeCtx(contrat(), [], [maladie, cp] as any, '2022-07-15', 2);

  it('moteur : les jours pris sous la borne interne portent la mention et la raison, le dernier reste à confirmer', () => {
    const marques = cpDroitAConfirmer(ctx);
    expect(marques.size).toBeGreaterThan(0);
    expect(marques.has('2022-06-01')).toBe(true);
    expect(marques.has('2022-06-30')).toBe(false); // au-delà de la borne : à confirmer, hors du total (T-052)
    expect([...cpExces(ctx)]).toEqual([]);
    const di: any = dayInfo(ctx, '2022-06-01');
    expect(di.deducted).toBe(false);
    expect(di.aConfirmer).toBeUndefined(); // payé, dans le total
    expect(di.cpDroitAConfirmer).toMatch(/absence/);
  });

  it('mois : aucun montant ne change, le nombre de jours et la raison sont donnés', () => {
    const m: any = computeMonth(ctx, '2022-06', 2);
    expect(m.net).toBe(159299);
    expect(m.evenementAConfirmer).toBe(3939);
    expect(m.retenue).toBe(0);
    // Jours prévus du 01/06 au 29/06, sans le lundi de Pentecôte (6/06, férié) ; le 30/06 reste à confirmer, hors du total.
    expect(m.joursCpDroitAConfirmer).toBe(20);
    const a = m.alerts.find((x: string) => x.includes('droit à confirmer'));
    expect(a).toBeTruthy();
    expect(a).toMatch(/20 jours/);
    expect(a).toMatch(/payés/);
    expect(a).toMatch(/une absence \(maladie, congé sans solde…\) change le calcul/);
  });

  it('cases Pajemploi : la ligne du salaire net porte la mention ; pour les parents, sans motif d’absence', () => {
    const m = computeMonth(ctx, '2022-06', 2);
    const am = declarationLines(ctx, m).find((l) => l.label === 'Salaire net')!;
    expect(am.hint).toMatch(/20 jours de congés payés : droit à confirmer/);
    expect(am.hint).toMatch(/maladie/);
    const parents = declarationLines(ctx, m, true).find((l) => l.label === 'Salaire net')!;
    expect(parents.hint).toMatch(/droit à confirmer/);
    expect(parents.hint).not.toMatch(/maladie/);
    const texte = declarationText(ctx, m, 'Lou');
    expect(texte).toMatch(/droit à confirmer/);
    expect(texte).not.toMatch(/maladie/);
  });

  it('relevé PDF : chaque jour concerné porte « droit à confirmer », sans motif d’absence', () => {
    const r = releveDonnees(ctx, '2022-06', { amName: 'Lou', enfants: 2, now: new Date('2022-07-15T10:00:00'), version: 't' });
    const l1 = r.lignes.find((l) => l.date === '2022-06-01')!;
    expect(l1.absence).toMatch(/droit à confirmer/);
    expect(r.lignes.filter((l) => /droit à confirmer/.test(l.absence)).length).toBe(20);
    const l30 = r.lignes.find((l) => l.date === '2022-06-30')!;
    expect(l30.absence).not.toMatch(/droit à confirmer/);
    expect(JSON.stringify(r)).not.toMatch(/maladie/);
    expect(r.montants.find((x) => x.label === 'Salaire net')!.value).toBe(euros(159299));
  });

  it('écran du mois : la liste des jours utilise la mention', () => {
    expect(mentionDroitAConfirmer({ cpDroitAConfirmer: 'une absence change le calcul' } as any)).toBe(', droit à confirmer : une absence change le calcul');
    expect(mentionDroitAConfirmer({ cpDroitAConfirmer: 'x' } as any, true)).toBe(', droit à confirmer');
    expect(mentionDroitAConfirmer({} as any)).toBe('');
    expect(readFileSync('src/screens/Mois.tsx', 'utf8')).toMatch(/mentionDroitAConfirmer\(di\)/);
  });

  it('témoin : droits sûrs ou deux lectures chiffrées, aucune mention', () => {
    const ctx2 = makeCtx(contrat(), [], [cp] as any, '2022-07-15', 2);
    expect(cpDroitAConfirmer(ctx2).size).toBe(0);
    const m: any = computeMonth(ctx2, '2022-06', 2);
    expect(m.joursCpDroitAConfirmer ?? 0).toBe(0);
    expect(m.alerts.some((x: string) => x.includes('droit à confirmer'))).toBe(false);
    expect(declarationLines(ctx2, m).find((l) => l.label === 'Salaire net')!.hint).toBeUndefined();
  });
});
