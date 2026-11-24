// T-050b (correcteur M12) : règles de main remises après la contre-vérification juridique (regles/t050-trois-regles.md).
// - Point 2, A-45 : l'assiette de l'indemnité de rupture au 1/80 (CCN IDCC 3239, art. 121.1) n'exclut que les indemnités
//   non soumises à cotisations ; l'ICCP (indemnité compensatrice de congés payés) des deux périodes et la régularisation de
//   fin de contrat (art. 124) y entrent, sauf si le dernier bulletin est déjà couvert par les bruts saisis (C-008).
// - Point 3, A-50 : la régularisation due entre dans la base du dixième des congés non pris (art. 123.2, 48.1.1.5).
// Une part « à confirmer » n'est ni ajoutée ni payée : le résultat qui en dépend est « à confirmer », avec la raison.
// Les montants des fiches DDETS 31 sont dans tests/exemples-officiels.test.ts ([OCC52] p. 10, [OCC46] p. 11).
import { describe, expect, it } from 'vitest';
import type { Contract, Planning } from '../src/engine/model';
import { makeCtx, monthBase, monthBrut, type Ctx } from '../src/engine/payroll';
import { baseDixieme, cpForMonth } from '../src/engine/conges';
import { finDeContrat } from '../src/engine/fin';
import { lastDay, monthOf, monthsBetween, type ISODate, type Month } from '../src/engine/dates';
import { euros } from '../src/engine/money';
import { netToBrut } from '../src/engine/rates';

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
// Année complète depuis le 03/06/2024 (début d'une période de référence) : deux périodes de congés à la fin.
const complete = () => contract({ start: '2024-06-03', trackedFrom: '2024-06-03', yearType: 'complete', weeks: 52, weeksOff: [] });

/** Salaires bruts mois par mois (salaire et congés versés dans le mois), sans les sommes de la fin, de `de` à `a` */
function salairesBruts(ctx: Ctx, fin: ISODate, a: Month = monthOf(fin)): number {
  const endCtx: Ctx = { ...ctx, c: { ...ctx.c, end: fin }, cache: new Map(), finControlee: true };
  let total = 0;
  for (const m of monthsBetween(monthOf(ctx.c.start), a)) {
    const b = monthBase(endCtx, m);
    if (!b.active || b.missing) continue;
    total += monthBrut(endCtx, m);
    const cp = cpForMonth(endCtx, m, 0);
    total += netToBrut(cp.indemnite + cp.complement, lastDay(m));
  }
  return total;
}

describe('T-050b, A-45 : ICCP des deux périodes dans l’assiette du 1/80 (année complète, congés non pris sûrs)', () => {
  // Retrait envoyé le 16/04/2026 : préavis d'un mois, fin le vendredi 15/05/2026 (le samedi 16 n'est pas accueilli).
  const ctx = () => makeCtx(complete(), [], [], '2026-12-31');
  const f = () => finDeContrat(ctx(), '2026-04-16', 'retrait');

  it('les congés non pris couvrent la période close et la période en cours, et sont sûrs', () => {
    expect(f().dernierJour).toBe('2026-05-15');
    expect(f().cpAConfirmer).toBeUndefined();
    expect(f().cpExplication).toMatch(/acquis depuis le 1er juin \(2025\) et \d+ jours? de la période précédente non pris/);
    expect(f().cpIndemnite).toBeGreaterThan(0);
    expect(f().regularisation).toBe(0); // année complète : pas de régularisation
  });
  it('assiette = salaires bruts + ICCP convertie en brut au dernier jour du dernier mois ; indemnité = 1/80, comptée', () => {
    const r = f();
    expect(r.totalBrut).toBe(salairesBruts(ctx(), '2026-05-15') + netToBrut(r.cpIndemnite, '2026-05-31'));
    expect(r.indemniteRupture).toBe(Math.round(r.totalBrut / 80));
    expect(r.ruptureAConfirmer).toBeFalsy();
  });
  it('garde contre le double compte : total des bulletins saisi jusqu’au dernier mois, rien n’est ajouté', () => {
    const r = finDeContrat(ctx(), '2026-04-16', 'retrait', 0, undefined, { total: 1234500, jusqua: '2026-05' });
    expect(r.totalBrut).toBe(1234500);
    expect(r.indemniteRupture).toBe(15431);
  });
  it('garde : brut du dernier bulletin lu (mai), l’ICCP est dans ce brut, rien n’est ajouté', () => {
    const r = finDeContrat(ctx(), '2026-04-16', 'retrait', 0, undefined, { parMois: { '2026-05': 150000 } });
    expect(r.totalBrut).toBe(salairesBruts(ctx(), '2026-05-15', '2026-04') + 150000);
  });
  it('total saisi jusqu’au mois d’avant : le dernier mois et l’ICCP sont ajoutés', () => {
    const r = finDeContrat(ctx(), '2026-04-16', 'retrait', 0, undefined, { total: 1000000, jusqua: '2026-04' });
    const mai = salairesBruts(ctx(), '2026-05-15') - salairesBruts(ctx(), '2026-05-15', '2026-04');
    expect(r.totalBrut).toBe(1000000 + mai + netToBrut(r.cpIndemnite, '2026-05-31'));
  });
  it('décès de l’enfant : même assiette (art. 119.4.2 renvoie au calcul de 121.1)', () => {
    const r = finDeContrat(ctx(), '2026-05-15', 'deces');
    expect(r.cpAConfirmer).toBeUndefined();
    expect(r.totalBrut).toBe(salairesBruts(ctx(), '2026-05-15') + netToBrut(r.cpIndemnite, '2026-05-31'));
  });
});

describe('T-050b, A-45, revu par la T-103 : assiette complète, sans part « à confirmer »', () => {
  it('fin en novembre (jours de la période en cours sûrs, C10) : ICCP ajoutée à l’assiette, indemnité comptée', () => {
    const ctx = () => makeCtx(complete(), [], [], '2026-12-31');
    const r = finDeContrat(ctx(), '2026-10-13', 'retrait');
    expect(r.cpAConfirmer).toBeUndefined();
    expect(r.cpIndemnite).toBeGreaterThan(0);
    expect(r.totalBrut).toBe(salairesBruts(ctx(), r.dernierJour) + netToBrut(r.cpIndemnite, lastDay(monthOf(r.dernierJour))));
    expect(r.ruptureAConfirmer).toBeFalsy();
  });
  it('régularisation sûre (année incomplète) : ajoutée à l’assiette', () => {
    const ctx = () => makeCtx(contract(), [], [], '2026-11-18');
    const r = finDeContrat(ctx(), '2026-10-28', 'retrait');
    expect(r.regularisationAConfirmer).toBeUndefined();
    expect(r.regularisation).toBeGreaterThan(0);
    expect(r.totalBrut).toBe(salairesBruts(ctx(), r.dernierJour) + netToBrut(r.cpIndemnite + r.regularisation, lastDay(monthOf(r.dernierJour))));
  });
});

describe('T-050b, A-50 : régularisation dans la base du dixième des congés non pris', () => {
  it('régularisation sûre : dixième de la période en cours = (base + régularisation) ÷ 10', () => {
    const ctx = makeCtx(contract(), [], [], '2026-11-18');
    const r = finDeContrat(ctx, '2026-10-28', 'retrait');
    const endCtx: Ctx = { ...ctx, c: { ...ctx.c, end: r.dernierJour }, cache: new Map(), finControlee: true };
    const base = baseDixieme(endCtx, 2026).base;
    expect(r.regularisation).toBeGreaterThan(0);
    expect(r.cpDixiemeEnCours).toBe(Math.round((base + r.regularisation) / 10));
    expect(r.cpDixiemeEnCours).toBeGreaterThan(Math.round(base / 10));
  });
  it('sans régularisation (année complète) : dixième = (base + indemnité de la période précédente payée à la fin) ÷ 10 (T-103, F7)', () => {
    // CASF L423-6 et CCN 48.1.1.5 : l'indemnité de congés versée pendant la période entre dans la base du dixième.
    const ctx = makeCtx(complete(), [], [], '2026-12-31');
    const r = finDeContrat(ctx, '2026-04-16', 'retrait');
    const endCtx: Ctx = { ...ctx, c: { ...ctx.c, end: r.dernierJour }, cache: new Map(), finControlee: true };
    expect(r.cpDixiemeEnCours).toBe(110273);
    expect(r.cpDixiemeEnCours).toBeGreaterThan(Math.round(baseDixieme(endCtx, 2025).base / 10));
  });
});
