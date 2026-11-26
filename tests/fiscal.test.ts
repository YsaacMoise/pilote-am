// Lot 2 : régime fiscal spécial des assistants maternels (CGI art. 80 sexies). Montants calculés à la main.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Contract, DayRec, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { fiscalYear, fiscalYears, plafonnerHS, type FiscalChild } from '../src/engine/fiscal';
import { computeMonth } from '../src/engine/month';
import { controle } from '../src/engine/controle';
import { finDeContrat } from '../src/engine/fin';
import { eurosArrondis } from '../src/engine/money';
import { PLAFOND_HS_EXONEREES } from '../src/engine/rates';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}

function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2026-01-05', yearType: 'complete', weeks: 52, weeksOff: [],
    planning: week('08:00', '17:00'), rateNet: 350, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2026-01-05',
    // T-050 : réponses aux questions obligatoires du contrat (T-031, T-033, direction) ; sans elles, chaque mois est « à compléter ».
    alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, ...over,
  };
}

const rec = (date: string, r: Partial<DayRec>): DayRec => ({ key: `c1|${date}`, cid: 'c1', date, ...r });

describe('C-011 : SMIC en vigueur le jour de la garde (BOI-RSA-CHAMP-10-20-10 § 490)', () => {
  it('mois repris de l’historique : SMIC du mois, puis SMIC du jour pour les mois suivis', () => {
    // Avril et mai 2026 sur bulletin (20 et 17 jours, SMIC 12,02 €), juin suivi par l'app (22 jours de 9 h, SMIC 12,31 €).
    // 3 × 37 × 12,02 = 1 334,22 € ; 3 × 22 × 12,31 = 812,46 € ; total 2 146,68 €.
    const c = contract({
      start: '2026-04-01', trackedFrom: '2026-06-01',
      history: [
        { month: '2026-04', net: 68250, jours: 20, source: 'manuel' },
        { month: '2026-05', net: 68250, jours: 17, source: 'manuel' },
      ],
    });
    const f = fiscalYear(makeCtx(c, [], [], '2026-06-30'), 2026, 0, '2026-06');
    expect(f.jours).toBe(59);
    expect(f.abattementBrut).toBe(214668);
    expect(f.smics).toEqual([1202, 1231]);
  });
  it('l’écran « Comment l’app calcule » ne parle plus du SMIC du 1er janvier', () => {
    const regles = readFileSync(new URL('../src/screens/Regles.tsx', import.meta.url), 'utf8');
    expect(regles).not.toMatch(/SMIC du 1er janvier/);
    expect(regles).toMatch(/SMIC retenu est celui en vigueur le jour de la garde/);
  });
});

describe('C-018 : indemnités kilométriques dans les sommes reçues (BOI-RSA-CHAMP-10-20-10 § 440 et 460)', () => {
  // Octobre 2026, 45 h par semaine à 6,00 € net : 1 170,00 € de salaire ; abattement 22 × 3 × 12,31 = 812,46 €.
  const base = contract({ start: '2026-10-01', trackedFrom: '2026-10-01', rateNet: 600, kmTaux: 50 });
  // 12 km le 06/10 et 8 km le 20/10, à 0,50 € : 10,00 €.
  // T-050 : trajet demandé par cette seule famille (kmPartage: false, CCN art. 113, T-025 C-2, direction) ; sans réponse, les km sont « à confirmer ».
  const days = [rec('2026-10-06', { km: 12, kmPartage: false }), rec('2026-10-20', { km: 8, kmPartage: false })];
  it('10,00 € de kilomètres ajoutés aux sommes reçues et au revenu imposable', () => {
    const sans = fiscalYear(makeCtx(base, [], [], '2026-10-31'), 2026);
    const avec = fiscalYear(makeCtx(base, days, [], '2026-10-31'), 2026);
    expect(sans.km).toBe(0);
    expect(avec.km).toBe(1000);
    expect(avec.recu - sans.recu).toBe(1000);
    expect(avec.abattement).toBe(81246);
    expect(avec.imposable - sans.imposable).toBe(1000);
  });
  it('textes : les kilomètres ne sont plus dits « non comptés »', () => {
    for (const f of ['Regles.tsx', 'Fiscal.tsx']) {
      const t = readFileSync(new URL(`../src/screens/${f}`, import.meta.url), 'utf8');
      expect(t).not.toMatch(/kilométriques ne sont pas comptés/);
    }
  });
});

describe('C-019 : heures complémentaires et majorées exonérées (CGI art. 81 quater, CSS art. L241-17)', () => {
  it('50 h par semaine : les 5 h du contrat au-delà de 45 h sortent du net imposable, réduction comprise', () => {
    // Octobre 2026, 50 h à 3,50 € net, majoration 10 % : salaire 765,92 €.
    // Heures majorées du contrat : 5 h × 52 ÷ 12 = 21 h 40 (1 300 min) × 3,85 € = 83,42 € net.
    // Brut de ces heures 83,42 ÷ 0,7811975 = 106,78 € (T-115, R3 : F1 du convertisseur officiel, avant 0,781 → 106,81 €) ;
    // réduction 11,31 % = 12,08 € ; CSG non déductible et CRDS 3,04 € (inchangées).
    // Valeur exonérée : 83,42 + 12,08 + 3,04 = 98,54 €.
    // Net imposable : 765,92 + 27,94 (2,85 % de 980,69 € de brut) − 83,42 − 3,04 = 707,40 €.
    const c = contract({ start: '2026-10-01', trackedFrom: '2026-10-01', planning: week('08:00', '18:00') });
    const ctx = makeCtx(c, [], [], '2026-10-31');
    const r = computeMonth(ctx, '2026-10');
    expect(r.majContratAmount).toBe(8342);
    expect(r.hsNet).toBe(8342);
    expect(r.hsBrut).toBe(10678);
    expect(r.reductionHS).toBe(1208);
    const f = fiscalYear(ctx, 2026, 0, '2026-10');
    expect(f.hsValeur).toBe(9854);
    expect(f.hsExonere).toBe(9854);
    expect(f.netImposable).toBe(70740);
    // Entretien au plancher : MG 4,35 € ÷ 10 × 10 h = 4,35 € par jour, 22 jours = 95,70 €.
    expect(f.recu).toBe(70740 + 9570);
  });
  it('heures complémentaires occasionnelles : 2 h en plus un mardi, sous 45 h', () => {
    // 40 h par semaine, mardi 06/10/2026 de 8 h à 18 h : 2 h complémentaires × 3,50 € = 7,00 €.
    // Brut 7,00 ÷ 0,7811975 = 8,96 € ; réduction 1,01 € ; CSG non déductible et CRDS 0,26 €. Valeur : 8,27 €.
    // Net du mois 613,67 € (606,67 + 7,00), brut 785,55 € (T-115, F1 : 613,67 ÷ 0,7811975 ; avant 785,75 €),
    // CSG non déductible et CRDS 2,849 % de 785,55 = 22,38 € (avant 22,39 €) :
    // net imposable 613,67 + 22,38 − 7,00 − 0,26 = 628,79 €.
    const c = contract({ start: '2026-10-01', trackedFrom: '2026-10-01', planning: week('08:00', '16:00') });
    const ctx = makeCtx(c, [rec('2026-10-06', { pres: [{ a: '08:00', d: '18:00' }] })], [], '2026-10-31');
    const r = computeMonth(ctx, '2026-10');
    expect(r.complAmount).toBe(700);
    expect(r.reductionHS).toBe(101);
    const f = fiscalYear(ctx, 2026, 0, '2026-10');
    expect(f.hsValeur).toBe(827);
    expect(f.netImposable).toBe(62879);
  });
  it('plafond de 7 500 € tous employeurs réunis : l’excédent redevient imposable, au prorata', () => {
    const row = (cid: string, hsValeur: number): FiscalChild => ({
      cid, recu: 1000000, netImposable: 900000, hsValeur, hsExonere: hsValeur, hsImposable: 0, entretienRepas: 100000, km: 0,
      repasParents: 0, jours: 200, joursCourts: 0, abattementBrut: 738600, abattement: 738600, imposable: 261400, brutInconnu: false,
      smic: 1231, smics: [1231], facteur: 3, partiel: false, moisHistorique: 0,
    });
    // 5 000 € + 4 000 € = 9 000 € : 1 500 € au-delà, soit 833,33 € et 666,67 €.
    const [a, b] = plafonnerHS([row('a', 500000), row('b', 400000)], PLAFOND_HS_EXONEREES);
    expect(a.hsImposable).toBe(83333);
    expect(b.hsImposable).toBe(66667);
    expect(a.hsExonere + b.hsExonere).toBe(PLAFOND_HS_EXONEREES);
    expect(a.netImposable).toBe(983333);
    expect(a.recu).toBe(1083333);
    expect(a.imposable).toBe(1083333 - 738600);
    // Sous le plafond : rien ne change.
    const [c] = plafonnerHS([row('c', 700000)], PLAFOND_HS_EXONEREES);
    expect(c.hsImposable).toBe(0);
    expect(c.imposable).toBe(261400);
    // Un enfant sans heure exonérée ne reçoit jamais de part (ni de reste d'arrondi négatif).
    const [d, e, z] = plafonnerHS([row('d', 500001), row('e', 400000), row('z', 0)], PLAFOND_HS_EXONEREES);
    expect(z.hsImposable).toBe(0);
    expect(z.hsExonere).toBe(0);
    expect(d.hsImposable + e.hsImposable).toBe(150001);
  });
  it('abattement plafonné aux sommes de l’ensemble des enfants, pas enfant par enfant (brochure IR 2026, p. 89)', () => {
    // Octobre 2026. A : 50 h à 3,50 € (reçu 803,10 € < abattement 812,46 €). B : 45 h à 6,00 € (reçu 1 298,92 €).
    // Total reçu 2 102,02 € ; abattement total 2 × 812,46 = 1 624,92 € ; imposable 477,10 € (et non 486,46 €).
    // T-115 (R3) : brut de B par F1 (÷ 0,7811975 au lieu de 0,781) : CSG non déductible un centime plus basse, reçu
    // 1 298,91 € (avant 1 298,92 €), total 2 102,01 €, imposable 477,09 €.
    const a = contract({ id: 'a', start: '2026-10-01', trackedFrom: '2026-10-01', planning: week('08:00', '18:00') });
    const b = contract({ id: 'b', start: '2026-10-01', trackedFrom: '2026-10-01', rateNet: 600 });
    const [fa, fb] = fiscalYears([makeCtx(a, [], [], '2026-10-31'), makeCtx(b, [], [], '2026-10-31')], 2026, 0, '2026-10');
    expect(fa.recu).toBe(80310);
    expect(fb.recu).toBe(129891);
    expect(fa.abattement + fb.abattement).toBe(162492);
    expect(fa.imposable + fb.imposable).toBe(47709);
  });
  it('contrôle du bulletin : net versé réduction comprise accepté, limite haute du rapport net/brut relevée', () => {
    const c = contract({ start: '2026-10-01', trackedFrom: '2026-10-01', planning: week('08:00', '18:00') });
    const r = computeMonth(makeCtx(c, [], [], '2026-10-31'), '2026-10');
    // Net du bulletin = 765,92 + 12,08 de réduction = 778,00 € : conforme.
    const ok = controle({ id: 'b', cid: 'c1', month: '2026-10', net: r.netTotal + 1208, source: 'manuel' }, r, 350);
    expect(ok[0].level).toBe('ok');
    expect(ok[0].detail).toMatch(/12,08\s€ de réduction/);
    // T-103 (D1, D6) : brut inconnu (Mayotte, avant 2024), le brut n'est pas contrôlé, l'app demande le taux.
    const sans = controle({ id: 'b', cid: 'c1', month: '2026-10', net: 90000, brut: 100000, source: 'manuel' }, { ...r, reductionHS: 0, brutConnu: false }, 350);
    expect(sans.some((x) => x.title === 'Brut non contrôlé')).toBe(true);
    // T-115 (R3) : sans taux brut au contrat, le brut du mois est calculé depuis le net (F1) et contrôlé.
    const calc = controle({ id: 'b', cid: 'c1', month: '2026-10', net: 90000, brut: 100000, source: 'manuel' }, { ...r, reductionHS: 0 }, 350);
    expect(r.brutConnu).toBe(true);
    expect(calc.some((x) => x.title === 'Salaire brut différent')).toBe(true);
  });
});

describe('C-008 : brut estimé affiché comme une estimation, brut réel demandé avant la fin de contrat', () => {
  // Contrat du 05/01/2026, lettre envoyée le 02/11/2026 : 9 mois d'ancienneté, indemnité de 1/80e des bruts.
  const c = contract({ start: '2026-01-05', trackedFrom: '2026-01-05' });
  const ctx = () => makeCtx(c, [], [], '2026-12-31');
  it('sans bulletin : tous les mois sont estimés', () => {
    const f = finDeContrat(ctx(), '2026-11-02', 'retrait');
    expect(f.ancienneteMois).toBe(9);
    // T-115 (R3) : depuis 2024, le brut de chaque mois est calculé depuis le net (F1) : plus aucun mois « estimé »
    // (avant : janvier à novembre, 11 mois). L'estimation reste pour Mayotte et avant 2024.
    expect(f.brutsEstimes).toEqual([]);
    expect(f.dernierJour).toBe('2026-11-16'); // 9 mois : préavis de 15 jours
  });
  it('brut d’un bulletin contrôlé : le mois n’est plus estimé et son brut est pris tel quel', () => {
    const f0 = finDeContrat(ctx(), '2026-11-02', 'retrait');
    const f1 = finDeContrat(ctx(), '2026-11-02', 'retrait', 0, undefined, { parMois: { '2026-03': 90000 } });
    expect(f1.brutsEstimes).not.toContain('2026-03');
    // T-115 (R3) : le brut lu (900,00 €) remplace le brut calculé de mars : 682,50 € net ÷ 0,7811975 = 873,66 € (F1).
    expect(f1.totalBrut).toBe(f0.totalBrut - 87366 + 90000);
  });
  it('total des bruts saisi jusqu’au dernier mois : 12 345,00 € ÷ 80 = 154,31 €, plus aucune estimation', () => {
    const f = finDeContrat(ctx(), '2026-11-02', 'retrait', 0, undefined, { total: 1234500, jusqua: '2026-11' });
    expect(f.totalBrut).toBe(1234500);
    expect(f.indemniteRupture).toBe(15431);
    expect(f.brutsEstimes).toEqual([]);
  });
  it('total saisi jusqu’à octobre : le mois du préavis (novembre) reste compté, estimé', () => {
    const f0 = finDeContrat(ctx(), '2026-11-02', 'retrait');
    const f = finDeContrat(ctx(), '2026-11-02', 'retrait', 0, undefined, { total: 865717, jusqua: '2026-10' });
    // T-115 (R3) : novembre est compté avec son brut calculé (F1), plus « estimé ».
    expect(f.brutsEstimes).toEqual([]);
    // Brut estimé de novembre (1er au 16) : le même que sans saisie.
    const novembre = finDeContrat(ctx(), '2026-11-02', 'retrait', 0, undefined, { total: 1, jusqua: '2026-10' }).totalBrut - 1;
    expect(novembre).toBeGreaterThan(0);
    // T-115 (R3) : 8 657,17 € = bruts calculés (F1) de janvier à octobre (avant, estimation à 0,781 : 8 659,35 €).
    expect(f.totalBrut).toBe(865717 + novembre);
    // 8 659,35 € était l'estimation de janvier à octobre : le total retombe sur l'estimation complète (9 117,10 € de
    // salaires). T-050b (A-45 tranché pour main, regles/t050-trois-regles.md, point 2) : l'indemnité compensatrice de
    // congés payés de la rupture entre dans l'assiette ; le lot 3 donnait 10 125,42 € avec elle. Ici, elle est « à
    // confirmer » (A-23, T-030 : 16 ou 15 jours en cours) : elle n'est pas encore ajoutée, le total reste 9 117,10 € et
    // l'indemnité de rupture est « à confirmer », avec cette raison. Le cas des congés non pris sûrs : tests/t050b.test.ts.
    // T-103 (C10) : les congés non pris ne sont plus « à confirmer » : ils entrent dans l'assiette (A-45).
    expect(f.totalBrut).toBe(f0.totalBrut);
    expect(f.cpAConfirmer).toBeUndefined();
    expect(f.ruptureAConfirmer).toBe(false);
    expect(f.totalBrut).toBeGreaterThan(911710);
  });
  it('arrondi à l’euro : 1 234,50 € → « 1 235 € », 154,31 € → « 154 € »', () => {
    expect(eurosArrondis(123450)).toBe('1\u00a0235\u00a0€');
    expect(eurosArrondis(15431)).toBe('154\u00a0€');
  });
});
