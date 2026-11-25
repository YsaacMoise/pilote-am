// T-076 : contrat aux horaires qui changent d'une semaine à l'autre (planning variable).
// Spécification : regles/t076-decisions-direction.md, section 1. Règles : regles/t076-planning-variable.md (R-PV, P-PV).
// Chaque attendu est calculé à la main, en commentaire, à partir des formules du rapport.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Contract, DayRec, Planning } from '../src/engine/model';
import { dayInfo, makeCtx, mensuelMajoreesMinutes, mensuelMinutes, monthBase, regularisation, salaireMensualise } from '../src/engine/payroll';
import { computeMonth, declarationLines } from '../src/engine/month';
import { acquisition, cpForMonth, decompteConge, indemnite, maintien } from '../src/engine/conges';
import { finDeContrat } from '../src/engine/fin';
import { nonGeresContrat } from '../src/engine/nonGeres';
import { lecturePV, pvActif } from '../src/engine/planningVariable';
import { NON_GERE_CDD_PV_P2 } from '../src/engine/cdd';
import { toutesSemainesSansAccueil } from '../src/engine/payroll';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}
const A45 = week('08:00', '17:00'); // 5 × 9 h = 45 h
const B20 = week('08:00', '13:00', [1, 2, 3, 4]); // 4 × 5 h = 20 h (vendredi non travaillé)
const B25 = week('08:00', '13:00'); // 5 × 5 h = 25 h

function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2026-01-05', yearType: 'complete', weeks: 52, weeksOff: [],
    planning: A45, rateNet: 400, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2026-01-05',
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0,
    alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false, ...over,
  };
}
/** S1 : cycle A (45 h) / B (20 h), semaine A le lundi 5 janvier 2026 */
const s1 = (over: Partial<Contract> = {}) => contract({ planningVariable: true, cycle: [A45, B20], cycleAncre: '2026-01-05', heuresMensualisees: 140.83, ...over });
const rec = (date: string, r: Partial<DayRec>): DayRec => ({ key: `c1|${date}`, cid: 'c1', date, ...r });
const T = '2026-12-31';

describe('T-076 : données et refus (nonGeres)', () => {
  it('planning variable sans données : contrat à compléter, avec ce qui manque', () => {
    const ng = nonGeresContrat(contract({ planningVariable: true }));
    expect(ng.join(' ')).toMatch(/contrat à compléter/);
    expect(ng.join(' ')).toMatch(/la façon dont tes horaires changent/);
    expect(ng.join(' ')).toMatch(/heures payées chaque mois/);
    const sansAncre = nonGeresContrat(contract({ planningVariable: true, cycle: [A45, B20], heuresMensualisees: 140.83 }));
    expect(sansAncre.join(' ')).toMatch(/la date d’une semaine qui suit la première semaine du cycle/);
    expect(sansAncre.join(' ')).not.toMatch(/heures payées/);
    const cycleVide = nonGeresContrat(contract({ planningVariable: true, pvForme: 'cycle', cycle: [], cycleAncre: '2026-01-05', heuresMensualisees: 100 }));
    expect(cycleVide.join(' ')).toMatch(/2 à 4 semaines types/);
  });
  it('données complètes : aucun refus, l’ancien message « non géré » n’apparaît plus', () => {
    const c = s1();
    expect(pvActif(c)).toBe(true);
    expect(nonGeresContrat(c)).toEqual([]);
    expect(computeMonth(makeCtx(c, [], [], T), '2026-03').nonGere).toEqual([]);
  });
  it('T-103 (H5) : semaine type du cycle prévue au-delà de 45 h : calculée, majoration dans le salaire mensualisé (CCN 108.1, 110.1)', () => {
    // Cycle A 50 h (5 × 10 h) / B 20 h, 151,67 h payées par mois (≥ total prévu : 35 h × 52 ÷ 12) : lecture L1.
    // Heures au-delà de 45 h : (5 + 0) ÷ 2 × 52 ÷ 12 = 10,83 h par mois, majorées de 10 % : 10,833 × 4,00 € × 10 % = 4,33 €.
    // Salaire : 151,67 × 4,00 € + 4,33 € = 611,01 €.
    const c = s1({ cycle: [week('08:00', '18:00'), B20], heuresMensualisees: 151.67 });
    expect(nonGeresContrat(c)).toEqual([]);
    expect(salaireMensualise(c)).toBe(61101);
    expect(mensuelMajoreesMinutes(c)).toBeCloseTo(650, 6);
    expect(declarationLines(makeCtx(c, [], [], T), computeMonth(makeCtx(c, [], [], T), '2026-03')).length).toBeGreaterThan(0);
  });
  it('S2 : semaine sans planning, ce mois refusé (planning demandé), le mois d’avant calculé', () => {
    const ps: Record<string, Planning> = {};
    // Semaines du 5 janvier au 2 février 2026 saisies (30 h), rien après.
    for (const l of ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26', '2026-02-02']) ps[l] = week('08:00', '14:00');
    const c = contract({ planningVariable: true, planningsSemaines: ps, heuresMensualisees: 130 });
    const ctx = makeCtx(c, [], [], T);
    expect(monthBase(ctx, '2026-01').nonGere).toEqual([]);
    expect(monthBase(ctx, '2026-02').nonGere.join(' ')).toMatch(/Planning des semaines du 09\/02\/2026, du 16\/02\/2026, du 23\/02\/2026 non saisi/);
  });
  it('T-103 (H5) : planning remis, semaine prévue de 50 h : 15 HC (base 30 h → 45 h) et 5 heures majorées, dans le mois de la semaine', () => {
    const ps: Record<string, Planning> = {};
    for (let i = 0; i < 9; i++) ps[new Date(Date.UTC(2026, 0, 5 + 7 * i)).toISOString().slice(0, 10)] = week('08:00', '14:00');
    ps['2026-02-16'] = week('08:00', '18:00'); // 50 h
    // 130 h par mois sur 52 semaines : base 30 h. Semaine du 16/02 : 30 → 45 h = 15 HC (60,00 €), au-delà de 45 h = 5 h
    // majorées de 10 % (5 × 4,00 × 1,10 = 22,00 €) ; les autres semaines (30 h) : rien.
    const ctx = makeCtx(contract({ planningVariable: true, planningsSemaines: ps, heuresMensualisees: 130 }), [], [], T);
    expect(monthBase(ctx, '2026-01').nonGere).toEqual([]);
    const b = monthBase(ctx, '2026-02');
    expect(b.nonGere).toEqual([]);
    expect(b.complMin).toBe(15 * 60);
    expect(b.majMin).toBe(5 * 60);
    expect(b.majAmount).toBe(2200);
  });
  // T-104 (cas 3) : l'avenant d'un contrat à horaires variables est calculé (tests/t104-horaires-variables.test.ts).
  it('avenant qui change les horaires d’un planning variable : plus de refus', () => {
    const c = s1({ avenants: [{ id: 'a', from: '2026-04-01', changes: { planning: B25 } }] });
    expect(nonGeresContrat(c)).toEqual([]);
    expect(nonGeresContrat(s1({ avenants: [{ id: 'a', from: '2026-04-01', changes: { rateNet: 420 } }] }))).toEqual([]);
  });
});

describe('T-076 : mensualisation et semaines courtes (R-PV-01, R-PV-03, R-PV-06)', () => {
  it('salaire mensualisé = heures mensualisées du contrat × taux, chaque mois, quelles que soient les semaines', () => {
    const c = s1();
    // 140,83 h × 4,00 € = 563,32 € ; minutes payées = 140,83 × 60 = 8 449,8
    expect(salaireMensualise(c)).toBe(56332);
    expect(mensuelMinutes(c)).toBeCloseTo(8449.8, 6);
    const ctx = makeCtx(c, [], [], T);
    // Mars 2026 : 148 h prévues (A, B, A, B et lundi-mardi d'une semaine A) ; février : 4 semaines (A, B, A, B) = 130 h.
    // R-PV-06 : aucune déduction pour un mois plus court, le salaire reste 563,32 €.
    for (const m of ['2026-02', '2026-03'] as const) {
      const b = monthBase(ctx, m);
      expect(b.base).toBe(56332);
      expect(b.retenue).toBe(0);
      expect(b.net).toBe(56332);
    }
  });
  it('lecture L1 : heures mensualisées = total prévu ÷ 12 à 1 minute près', () => {
    // Cycle (45 + 20) ÷ 2 = 32,5 h ; × 52 ÷ 12 = 140,8333 h = 8 450 min ; contrat 8 449,8 min : écart 0,2 min ≤ 1 → L1.
    expect(lecturePV(s1())).toBe('L1');
    // 130 h = 7 800 min < 8 450 − 1 → L2, base B = 130 × 12 ÷ 52 = 30 h.
    expect(lecturePV(s1({ heuresMensualisees: 130 }))).toBe('L2');
  });
});

describe('T-076 : heures complémentaires et majorées (R-PV-04, R-PV-05)', () => {
  it('L1 + H1 : HC au-delà de la semaine prévue, HM au-delà de 45 h réelles', () => {
    // Mardi 10/03 (semaine B, 08:00-13:00 prévu) : présent 08:00-15:00 → +2 h ; semaine B 20 + 2 = 22 h → 2 HC.
    // Mardi 03/03 (semaine A, 45 h prévues) : présent 08:00-18:00 → +1 h au-delà de 45 h → 1 HM.
    const recs = [rec('2026-03-10', { pres: [{ a: '08:00', d: '15:00' }] }), rec('2026-03-03', { pres: [{ a: '08:00', d: '18:00' }] })];
    const b = monthBase(makeCtx(s1(), recs, [], T), '2026-03');
    expect(b.complMin).toBe(120);
    expect(b.majMin).toBe(60);
    expect(b.complAmount).toBe(800); // 2 h × 4,00 €
    expect(b.majAmount).toBe(440); // 1 h × 4,00 € × 1,10
    expect(b.net).toBe(56332 + 800 + 440);
  });
  it('L2 + H2 : base B = 30 h, les heures prévues au-delà de B sont des HC le mois où elles tombent', () => {
    // Cycle A 45 h / B 25 h, heures mensualisées 130 → B = 130 × 12 ÷ 52 = 30 h (total prévu ÷ 12 = 35 × 52 ÷ 12 = 151,67 h > 130 : L2).
    const c = s1({ cycle: [A45, B25], heuresMensualisees: 130 });
    expect(lecturePV(c)).toBe('L2');
    const ctx = makeCtx(c, [], [], T);
    const b = monthBase(ctx, '2026-03');
    // Semaines A du 02/03 et du 16/03 : min(45 ; 45) − 30 = 15 HC chacune ; semaines B (25 h < 30) : 0.
    // Semaine A du 30/03 : heures rangées dans l'ordre des jours, B atteint le jeudi 02/04 → HC en avril (6 h jeudi + 9 h vendredi).
    expect(b.complMin).toBe(30 * 60);
    expect(b.complAmount).toBe(12000); // 30 h × 4,00 €
    expect(b.salaireMens).toBe(52000); // 130 h × 4,00 €
    expect(b.net).toBe(64000);
    expect(b.alerts.join(' ')).toMatch(/base de 30 h par semaine/);
    // Avril : semaine du 30/03 (6 h jeudi 02/04 + 9 h vendredi 03/04) ; semaine B du 06/04 (lundi de Pâques) : 0 ; semaine A
    // du 13/04 : 15 h ; semaine A du 27/04 : lundi-jeudi 36 h, B atteint le jeudi 30/04 → 6 h en avril. Total 36 h.
    expect(monthBase(ctx, '2026-04').complMin).toBe(36 * 60);
  });
  it('L2 : semaine de congé payé, les heures du congé comptent (T-103, H1 : Cass. soc. 10/09/2025)', () => {
    const c = s1({ cycle: [A45, B25], heuresMensualisees: 130, start: '2025-06-02', trackedFrom: '2025-06-02', balances: { cpRestants: 30, cpEnCours: 0, maladieDeduits: 0 } });
    // Semaine A du 02/03/2026 : congés lundi et mardi (2 × 9 h = 18 h), 27 h travaillées.
    const leaves: AmLeave[] = [{ id: 'cp', type: 'cp', from: '2026-03-02', to: '2026-03-03' }];
    const b = monthBase(makeCtx(c, [], leaves, T), '2026-03');
    // Congés comptés : 45 − 30 = 15 h ; semaine A du 16/03 : 15 h. Total 30 h, 120,00 €.
    expect(b.complMin).toBe(30 * 60);
    expect(b.complAmount).toBe(12000);
    expect(b.net).toBe(52000 + 12000);
  });
  it('E-PV-02 (Département du Cher) : base 30 h, semaines 30, 35, 28, 32 → 7 HC en janvier', () => {
    // Planning remis : 30 h chaque semaine (5 × 6 h). Janvier 2024 commence un lundi.
    const ps: Record<string, Planning> = {};
    for (const l of ['2024-01-01', '2024-01-08', '2024-01-15', '2024-01-22', '2024-01-29']) ps[l] = week('08:00', '14:00');
    const c = contract({ start: '2023-09-04', trackedFrom: '2024-01-01', planningVariable: true, planningsSemaines: ps, heuresMensualisees: 130 });
    const recs = [
      rec('2024-01-01', { ferieTravaille: true, pres: [{ a: '08:00', d: '14:00' }] }), // semaine 1 : 30 h (férié travaillé)
      rec('2024-01-08', { pres: [{ a: '08:00', d: '19:00' }] }), // semaine 2 : 35 h → +5
      rec('2024-01-16', { pres: [{ a: '08:00', d: '12:00' }] }), // semaine 3 : 28 h (départ plus tôt, art. 99) → 0
      rec('2024-01-24', { pres: [{ a: '08:00', d: '16:00' }] }), // semaine 4 : 32 h → +2
      rec('2024-02-01', { pres: [{ a: '08:00', d: '19:00' }] }), // semaine 5, à cheval : +5 h le jeudi 1er février
    ];
    const b = monthBase(makeCtx(c, recs, [], '2024-12-31'), '2024-01');
    expect(b.nonGere).toEqual([]);
    // 5 + 2 = 7 HC en janvier, comme la source.
    expect(b.complMin).toBe(7 * 60);
  });
  it('E-PV-02, semaine à cheval : l’app rattache chaque heure au mois du jour où elle est faite (A-11), pas au mois où la semaine finit', () => {
    // Règle de l'app (payroll.ts, computeRange : « Heures en plus, par semaine, rattachées au mois du jour ») : la semaine est
    // la semaine civile du lundi au dimanche pour le seuil (CCN 96.4 « par semaine », semaine non définie : ambiguïté A-11,
    // non tranchée, regles/t021-convention.md) et chaque heure va au mois de son jour. La source (Département du Cher, E-PV-02)
    // rattache toute la semaine à cheval au mois où elle finit (« Les 5 heures seront payées sur février »).
    // Ce test le montre : en lecture 1 (planning remis), les 5 heures faites le lundi 29 janvier vont en janvier (7 + 5 = 12 HC),
    // et non en février. E-PV-02 n'est donc respecté que si les heures de la semaine à cheval tombent en février.
    // T-103 (H8) : planning remis, une seule lecture, CCN 96.4 (au-delà de la durée hebdomadaire du contrat, B = 30 h) : les
    // heures de la semaine sont rangées dans l'ordre des jours, B est atteinte le jeudi 1er février → 7 HC en janvier.
    const ps: Record<string, Planning> = {};
    for (const l of ['2024-01-01', '2024-01-08', '2024-01-15', '2024-01-22', '2024-01-29']) ps[l] = week('08:00', '14:00');
    const c = contract({ start: '2023-09-04', trackedFrom: '2024-01-01', planningVariable: true, planningsSemaines: ps, heuresMensualisees: 130 });
    const recs = [
      rec('2024-01-01', { ferieTravaille: true, pres: [{ a: '08:00', d: '14:00' }] }),
      rec('2024-01-08', { pres: [{ a: '08:00', d: '19:00' }] }),
      rec('2024-01-24', { pres: [{ a: '08:00', d: '16:00' }] }),
      rec('2024-01-29', { pres: [{ a: '08:00', d: '19:00' }] }), // semaine 5, +5 h le lundi 29 janvier
    ];
    const jan = monthBase(makeCtx(c, recs, [], '2024-12-31'), '2024-01');
    expect(jan.complMin).toBe(7 * 60);
  });
});

describe('T-076 : absences, congés, fériés, indemnités (R-PV-08 à R-PV-12)', () => {
  it('R-PV-08 : déduction d’absence (52 semaines, heures) sur le planning des semaines du mois', () => {
    // Congé sans solde mercredi 11/03 (semaine B : 5 h). Diviseur mars = 45 + 20 + 45 + 20 + 18 = 148 h = 8 880 min.
    // Base = 563,32 € × (8 880 − 300) ÷ 8 880 = 544,2889 → 544,29 € ; retenue 19,03 €.
    const leaves: AmLeave[] = [{ id: 's', type: 'sans_solde', from: '2026-03-11', to: '2026-03-11' }];
    const b = monthBase(makeCtx(s1(), [], leaves, T), '2026-03');
    expect(b.divisorMin).toBe(8880);
    expect(b.deductedMin).toBe(300);
    expect(b.base).toBe(54429);
    expect(b.retenue).toBe(1903);
  });
  it('R-PV-09 : décompte des congés sur la semaine du cycle (CCN 48.1.1.3)', () => {
    const ctx = (l: AmLeave) => makeCtx(s1(), [], [l], T);
    // Vendredi 06/03, semaine A (vendredi travaillé) : 1er jour décompté le 06, reprise lundi 09 → vendredi et samedi = 2 jours.
    const a: AmLeave = { id: 'a', type: 'cp', from: '2026-03-06', to: '2026-03-06' };
    expect(decompteConge(ctx(a), a).jours).toBe(2);
    // Vendredi 13/03, semaine B (vendredi non travaillé) : aucun jour qui aurait dû être travaillé → 0 jour.
    const b: AmLeave = { id: 'b', type: 'cp', from: '2026-03-13', to: '2026-03-13' };
    expect(decompteConge(ctx(b), b).jours).toBe(0);
  });
  it('R-PV-12 (lecture F1) : férié habituellement travaillé s’il est prévu cette semaine-là', () => {
    const ctx = makeCtx(s1(), [], [], T);
    // 01/05/2026 (vendredi, semaine du 27/04 = A) : prévu → férié chômé, au diviseur, payé.
    expect(dayInfo(ctx, '2026-05-01').kind).toBe('ferie');
    expect(dayInfo(ctx, '2026-05-01').inDivisor).toBe(true);
    // 08/05/2026 (vendredi, semaine du 04/05 = B) : non prévu → ni férié chômé ni diviseur.
    expect(dayInfo(ctx, '2026-05-08').kind).toBe('hors');
    expect(dayInfo(ctx, '2026-05-08').inDivisor).toBe(false);
  });
  it('R-PV-11 : entretien et repas selon les jours et heures de chaque semaine', () => {
    const c = s1({ entretienMode: 'heure', entretienHeure: 100, repasPrix: 300, repasParJour: 1 });
    const b = monthBase(makeCtx(c, [], [], T), '2026-03');
    // Mars : jours A = 5 + 5 + 2 = 12 (9 h), jours B = 4 + 4 = 8 (5 h) → 20 jours.
    // Entretien : 12 × 9 h × 1,00 € + 8 × 5 h × 1,00 € = 108 + 40 = 148,00 € ; repas 20 × 3,00 € = 60,00 €.
    expect(b.presenceDays).toBe(20);
    expect(b.entretien).toBe(14800);
    expect(b.repas).toBe(6000);
  });
  it('R-PV-10 / P-PV-5, revu par la T-103 (C13) : maintien C1 seul, sans part à confirmer (52 semaines)', () => {
    const c = s1({ start: '2026-06-01', trackedFrom: '2026-06-01', cycleAncre: '2026-06-01' });
    // Congés pris l'été 2027, cinq semaines A du lundi au samedi (6 jours ouvrables chacune, sans férié) = 30 jours.
    const leaves: AmLeave[] = ['2027-06-14', '2027-06-28', '2027-07-26', '2027-08-09', '2027-08-23'].map((l, i) => {
      const d = new Date(`${l}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 5);
      return { id: `cp${i}`, type: 'cp', from: l, to: d.toISOString().slice(0, 10) };
    });
    const ctx = makeCtx(c, [], leaves, '2027-12-31');
    const ind = indemnite(ctx, 2026);
    expect(ind.jours).toBe(30);
    // Dixième : 12 mois × 563,32 € = 6 759,84 € → 675,98 €.
    expect(ind.dixieme).toBe(67598);
    // C1 : période 01/06/2026-31/05/2027 = 365 jours, 26 semaines A + 26 semaines B + lundi 31/05/2027 (A, 9 h)
    // = 1 699 h = 101 940 min ; semaines = 365 ÷ 7. C1 = 30 ÷ 6 × (101 940 × 7 ÷ 365) min × 4,00 € = 651,6712 → 651,67 €.
    expect(maintien(ctx, 30, '2027-06-01', 2026)).toBe(65167);
    // C2 : 5 semaines A × 45 h (samedis non prévus) = 225 h × 4,00 € = 900,00 €.
    expect(ind.pv?.c1).toBe(65167);
    expect(ind.pv?.c2).toBe(90000);
    expect(ind.pv?.c2Complet).toBe(true);
    // T-103 (C13) : une seule méthode, C1 (durée habituelle sur la période, Cass. soc. 09/05/2019) : max(675,98 ; 651,67).
    expect(ind.montant).toBe(67598);
    // Juin 2027 : maintien déjà versé par le salaire = 5 semaines × (140,83 × 60 × 12 ÷ 52 = 1 949,9538 min) × 4,00 €
    // = 649,98 € ; complément = 675,98 − 649,98 = 26,00 €, sans part à confirmer.
    const juin = cpForMonth(ctx, '2027-06');
    expect(juin.complement).toBe(2600);
    const r = computeMonth(ctx, '2027-06');
    expect(declarationLines(ctx, r).find((l) => l.label === 'Salaire net')?.value).not.toMatch(/à confirmer/);
  });
});

describe('T-076 : régularisation et fin (R-PV-07, R-PV-13)', () => {
  it('52 semaines : aucune régularisation à la fin ; maintien des congés non pris sur la lecture C1', () => {
    const ctx = makeCtx(s1(), [], [], T);
    const f = finDeContrat(ctx, '2026-10-15', 'retrait');
    expect(f.nonGere ?? []).toEqual([]);
    expect(f.regularisation).toBe(0);
    // Maintien utilisé par la fin (fin.ts, congesNonPris) pour 6 jours, période en cours (01/06/2026-31/05/2027) :
    // 01/06/2026 = semaine B (21 semaines après le 05/01) ; 26 B + 26 A = 1 690 h, plus lundi 31/05/2027 (B, 5 h) = 1 695 h
    // = 101 700 min ; C1 = 6 ÷ 6 × (101 700 × 7 ÷ 365) min × 4,00 € = 130,0274 → 130,03 €.
    expect(maintien(ctx, 6, '2026-10-15')).toBe(13003);
  });
  it('46 semaines, L2 : formule existante, heures prévues payées en HC comptées comme versées', () => {
    // Cycle A 45 h / B 25 h, 46 semaines, heures mensualisées 115 → B = 115 × 12 ÷ 46 = 30 h ; L2 (35 × 46 ÷ 12 = 134,17 > 115).
    const c = s1({ cycle: [A45, B25], heuresMensualisees: 115, yearType: 'incomplete', weeks: 46 });
    expect(lecturePV(c)).toBe('L2');
    const ctx = makeCtx(c, [], [], T);
    // Dû du 05/01 au 31/03 : 6 semaines A + 6 semaines B + lundi-mardi A = 270 + 150 + 18 = 438 h × 4,00 € = 1 752,00 €.
    // Versé : janvier (entrée le 05/01, jours) = 460 × 20 ÷ 22 = 418,18 € (diviseur : 1er et 2 janvier de la semaine B
    // d'avant compris) ; février et mars 460,00 € ; HC prévues payées : semaines A de janvier, février, mars (2 × 15 h chaque
    // mois ; celle du 30/03 tombe en avril) = 90 h × 4,00 € = 360,00 €. Total 1 698,18 €. Régularisation = 53,82 €.
    expect(monthBase(ctx, '2026-01').base).toBe(41818);
    expect(regularisation(ctx, '2026-01-05', '2026-03-31').montant).toBe(5382);
  });
});

describe('T-076 : corrections après vérification (décisions D1 à D6)', () => {
  // Cycle A 45 h / B 25 h, 130 h mensualisées : lecture L2, B = 30 h.
  const l2 = (over: Partial<Contract> = {}) => s1({ cycle: [A45, B25], heuresMensualisees: 130, ...over });
  it('B1 / D1, revu par la T-103 (H9) : L2, férié chômé payé : ses heures prévues comptent pour la base (rémunération habituelle maintenue)', () => {
    const b = monthBase(makeCtx(l2(), [], [], T), '2026-05');
    // Semaine A du 27/04 : lundi-jeudi 36 h + vendredi 1er mai 9 h (CCN 47.1) = 45 h → 15 HC ; rangées dans l'ordre des jours,
    // 6 h le jeudi 30/04 (avril) et 9 h le 1er mai (mai).
    // Semaines B (25 h, vendredi 08/05 férié compris) : sous 30 h → 0.
    // Semaine A du 11/05 (jeudi 14/05 Ascension) et du 25/05 (lundi 25/05 Pentecôte) : CCN 47.2, le férié chômé « ouvre droit
    // au maintien de la rémunération brute habituelle » : ses 9 h comptent, 45 h → 15 HC chacune (avant : 6 HC, 9 h perdues).
    // Mai : 9 + 15 + 15 = 39 HC = 156,00 €.
    expect(b.nonGere).toEqual([]);
    expect(b.complMin).toBe(39 * 60);
    expect(b.complAmount).toBe(15600);
    expect(b.net).toBe(52000 + 15600);
  });
  it('B1 / D1, revu par la T-103 (H9) : L2, jour d’événement familial payé : ses heures prévues comptent pour la base', () => {
    // Mardi 03/03 (semaine A, 9 h) : événement familial payé (CCN 48.1.3.1.1 : « congés rémunérés »).
    const leaves: AmLeave[] = [{ id: 'e', type: 'evenement', from: '2026-03-03', to: '2026-03-03', joursEvenement: 4 }];
    const b = monthBase(makeCtx(l2(), [], leaves, T), '2026-03');
    // Semaine du 02/03 : 45 h prévues, absence payée comprise → 15 HC. Semaine du 16/03 : 15 HC. Total 30 HC.
    expect(b.complMin).toBe(30 * 60);
  });
  it('B2 / D2, revu par la T-103 (H6) : L2, absence retenue dans une semaine au-delà de la base : deux calculs séparés', () => {
    // Congé sans solde mardi 03/03 (semaine A, 45 h prévues > 30 h). Retenue de l'art. 111 sur le salaire mensualisé ;
    // HC (CCN 96.4) = heures effectuées au-delà de la base : semaine du 02/03, 36 h → 6 HC ; semaine du 16/03 : 15 HC.
    const sansSolde: AmLeave[] = [{ id: 's', type: 'sans_solde', from: '2026-03-03', to: '2026-03-03' }];
    const ctx = makeCtx(l2(), [], sansSolde, T);
    const b = monthBase(ctx, '2026-03');
    expect(b.nonGere).toEqual([]);
    expect(b.deductedDays).toBe(1);
    expect(b.complMin).toBe(21 * 60);
    expect(declarationLines(ctx, computeMonth(ctx, '2026-03')).length).toBeGreaterThan(0);
    expect(finDeContrat(ctx, '2026-10-15', 'retrait').nonGere ?? []).toEqual([]);
    // Même absence une semaine B (25 h prévues ≤ 30 h) : aucune HC prévue touchée, mois calculé.
    const semaineB: AmLeave[] = [{ id: 's', type: 'sans_solde', from: '2026-03-10', to: '2026-03-10' }];
    expect(monthBase(makeCtx(l2(), [], semaineB, T), '2026-03').nonGere).toEqual([]);
    // L1 : la règle existante s'applique (déduction de l'art. 111), mois calculé.
    expect(monthBase(makeCtx(s1(), [], sansSolde, T), '2026-03').nonGere).toEqual([]);
  });
  // T-104 (cas 4) : D3 et D15 levées, le CDD à horaires variables est calculé (tests/t104-horaires-variables.test.ts).
  it('B3 / D3, levée par la T-104 : CDD à horaires variables avec semaines sans accueil : plus de refus', () => {
    const c = l2({ cdd: true, cddTerme: '2026-09-30', yearType: 'incomplete', weeks: 46, heuresMensualisees: 115 });
    expect(nonGeresContrat(c)).not.toContain(NON_GERE_CDD_PV_P2);
    expect(nonGeresContrat(l2({ cdd: true, cddTerme: '2026-09-30' }))).not.toContain(NON_GERE_CDD_PV_P2);
  });
  it('M1 / D4, revu par la T-103 (H4) : L2, première semaine coupée : base réduite aux jours prévus dans le contrat', () => {
    // Entrée le mercredi 04/03/2026, semaine A : mercredi-vendredi 27 h. CCN 96.4, durée prévue au contrat pour cette semaine :
    // B × 3 jours ÷ 5 jours = 18 h → 27 − 18 = 9 HC. Reste de mars : semaine A du 16/03 → 15 HC. Total 24 HC.
    const c = l2({ start: '2026-03-04', trackedFrom: '2026-03-04' });
    const b = monthBase(makeCtx(c, [], [], T), '2026-03');
    expect(b.complMin).toBe(24 * 60);
    // Entrée en cours de mois (52 semaines, heures) : 520,00 € × (158 − 18) ÷ 158 = 460,76 €.
    expect(b.base).toBe(46076);
  });
  it('D5, revu par la T-103 : plus de part de congés à confirmer, donc pas de message « mois déjà déclaré » pour elle', () => {
    const c = s1({ start: '2026-06-01', trackedFrom: '2026-06-01', cycleAncre: '2026-06-01' });
    const ctx = makeCtx(c, [], [], '2027-12-31');
    expect(computeMonth(ctx, '2027-06').alerts.join(' ')).not.toMatch(/à confirmer/);
  });

  it('D6 : planning remis, année incomplète : semaine sans accueil du contrat sans planning à saisir ; « sans accueil » = semaine sans accueil', () => {
    const ps: Record<string, Planning> = {};
    for (const l of ['2026-01-26', '2026-02-02', '2026-02-09', '2026-02-23']) ps[l] = week('08:00', '14:00');
    ps['2026-03-02'] = {};
    const c = contract({ planningVariable: true, planningsSemaines: ps, heuresMensualisees: 100, yearType: 'incomplete', weeks: 40, weeksOff: ['2026-02-16'] });
    expect(monthBase(makeCtx(c, [], [], T), '2026-02').nonGere).toEqual([]);
    expect(toutesSemainesSansAccueil(c).has('2026-02-16')).toBe(true);
    expect(toutesSemainesSansAccueil(c).has('2026-03-02')).toBe(true);
  });
});

describe('T-076 : corrections du comparateur (D13, D6, fin courte)', () => {
  const l2 = (over: Partial<Contract> = {}) => s1({ cycle: [A45, B25], heuresMensualisees: 130, ...over });
  it('D13, revu par la T-103 (H9) : L2, absence de l’enfant payée : ses heures prévues comptent pour la base (CCN 105 : absence « rémunérée »)', () => {
    // Mardi 03/03 (semaine A, 9 h) : enfant absent à la demande des parents, jour payé (CCN 105).
    // Semaine du 02/03 : 45 h → 15 HC ; semaine du 16/03 : 15 HC. Mars : 30 HC = 120,00 € ; net 520,00 + 120,00 = 640,00 €.
    const b = monthBase(makeCtx(l2(), [rec('2026-03-03', { abs: 'parents' })], [], T), '2026-03');
    expect(b.complMin).toBe(30 * 60);
    expect(b.net).toBe(64000);
  });
  it('D6 : planning remis, 36 semaines, semaines sans accueil au diviseur de l’art. 111 avec la semaine type du contrat', () => {
    // Cas PV-I36-S2-S01 : octobre 2026, taux 5,00 €, 90 h → 450,00 €. Semaines du 19/10 et du 26/10 sans accueil.
    // Diviseur (jours) : 1er-2 octobre (2) + semaine du 05/10 (5) + du 12/10 (5) + du 19/10 et du 26/10, semaine type
    // lundi-vendredi (5 + 5) = 22 jours. AM malade 06-07/10 : 2 jours retenus. Base = 450 × 20 ÷ 22 = 409,09 €.
    const sem = (d: string) => week('08:00', d);
    const ps: Record<string, Planning> = { '2026-09-28': sem('16:00'), '2026-10-05': sem('14:00'), '2026-10-12': sem('13:00'), '2026-10-19': {}, '2026-10-26': {} };
    const c = contract({ start: '2026-08-31', trackedFrom: '2026-08-31', yearType: 'incomplete', weeks: 36, weeksOff: ['2026-10-19', '2026-10-26'], rateNet: 500,
      planning: sem('14:00'), planningVariable: true, planningsSemaines: ps, heuresMensualisees: 90 });
    const leaves: AmLeave[] = [{ id: 'm', type: 'am_malade', from: '2026-10-06', to: '2026-10-07' }];
    const b = monthBase(makeCtx(c, [], leaves, T), '2026-10');
    expect(b.nonGere).toEqual([]);
    expect(b.divisorDays).toBe(22);
    expect(b.deductedDays).toBe(2);
    expect(b.base).toBe(40909);
    // Ces semaines ne sont jamais accueillies.
    expect(dayInfo(makeCtx(c, [], leaves, T), '2026-10-20').plannedMin).toBe(0);
  });
  it('R-PV-07 : fin courte en 36 semaines (décès le 29/03/2026), régularisation de fin calculée à la main', () => {
    // Cycle A 45 h / B 15 h ancré le 05/01/2026, taux 5,00 €, semaines sans accueil du 16/02 et du 23/02.
    // Dû (CCN 109.2, 124 ; heures prévues des jours accueillis du 05/01 au 29/03) : 5 semaines A × 45 h + 5 semaines B × 15 h
    // = 300 h × 5,00 € = 1 500,00 €.
    // L1 (90 h, 450,00 € par mois). Versé : janvier, entrée le 05/01 : 450 × 20 ÷ 22 = 409,09 € (diviseur : 1er et 2 janvier
    // de la semaine B d'avant compris) ; février : 450,00 € ; mars, fin le dimanche 29/03 : les lundi 30 et mardi 31 prévus
    // sont hors contrat (déduction de fin en cours de mois, art. 111) : 450 × 20 ÷ 22 = 409,09 €. Total 1 268,18 €.
    // Régularisation = 1 500,00 − 1 268,18 = 231,82 €.
    const off = ['2026-02-16', '2026-02-23'];
    const c = s1({ cycle: [A45, week('08:00', '11:00')], heuresMensualisees: 90, yearType: 'incomplete', weeks: 36, weeksOff: off, rateNet: 500, end: '2026-03-29' });
    const ctx = makeCtx(c, [], [], T);
    expect(monthBase(ctx, '2026-03').base).toBe(40909);
    expect(regularisation(ctx, '2026-01-05', '2026-03-29').montant).toBe(23182);
    // L2 (45 h, B = 45 × 12 ÷ 36 = 15 h) : versé 204,55 + 225,00 + 204,55 = 634,10 € ; HC prévues payées : 5 semaines A
    // × 30 h = 150 h × 5,00 € = 750,00 €. Régularisation = 1 500,00 − 1 384,10 = 115,90 €.
    const c2 = { ...c, heuresMensualisees: 45 };
    expect(regularisation(makeCtx(c2, [], [], T), '2026-01-05', '2026-03-29').montant).toBe(11590);
  });
});

describe('T-076 : revue 2, B4, revu par la T-103 (H6) : plus de refus D2', () => {
  const l2 = (over: Partial<Contract> = {}) => s1({ cycle: [A45, B25], heuresMensualisees: 130, ...over });
  it('B4 a : absence retenue le lundi 30/03, semaine A finie en avril : mars et avril calculés', () => {
    // Semaine A du 30/03 au 03/04 (45 h prévues > B = 30 h) : ses HC tombent en avril (jeudi 02/04 et vendredi 03/04).
    const leaves: AmLeave[] = [{ id: 's', type: 'sans_solde', from: '2026-03-30', to: '2026-03-30' }];
    const ctx = makeCtx(l2(), [], leaves, T);
    expect(monthBase(ctx, '2026-03').nonGere).toEqual([]);
    expect(monthBase(ctx, '2026-04').nonGere).toEqual([]);
    expect(monthBase(ctx, '2026-05').nonGere).toEqual([]);
  });
  it('B4 b : congé sans solde en octobre 2025 : jours acquis et indemnité de congés calculés', () => {
    // Contrat depuis le 02/06/2025 ; congé sans solde le lundi 06/10/2025 (semaine A : 06/10 - 05/06 = 18 semaines, paire).
    const c = l2({ start: '2025-06-02', trackedFrom: '2025-06-02', cycleAncre: '2025-06-02' });
    const leaves: AmLeave[] = [{ id: 's', type: 'sans_solde', from: '2025-10-06', to: '2025-10-06' }];
    const ctx = makeCtx(c, [], leaves, '2026-12-31');
    expect(monthBase(ctx, '2025-10').nonGere).toEqual([]);
    expect(acquisition(ctx, 2025).aConfirmer).toBeUndefined();
    expect(indemnite(ctx, 2025).aConfirmer).toBeUndefined();
    expect(cpForMonth(ctx, '2026-06').aConfirmer).toBeUndefined();
  });
});

describe('T-076 : relecture indépendante (R2, D16)', () => {
  const B15 = week('08:00', '11:00');
  const leaves: AmLeave[] = [{ id: 'cp', type: 'cp', from: '2026-07-06', to: '2026-08-01' }];
  const pv = (hm: number) => s1({ start: '2025-06-02', trackedFrom: '2025-06-02', rateNet: 500, cycle: [A45, B15], cycleAncre: '2025-06-02', heuresMensualisees: hm });
  it('R2 : fin d’un CDI à planning variable, jours non pris de la période précédente sur la base du complément de juin (L2 et L1)', () => {
    // Période 2025-2026 : 30 jours ; congés du 06/07 au 01/08/2026 : 23 jours décomptés, 7 non pris. Lettre le 30/04/2027.
    // L2 (65 h, B = 15 h) : dixième 780,00 € (T-103, H9 : les 5 fériés chômés des semaines A, 14/07, 15/08, 01/01, 06/04 et
    // 08/05, gardent leurs 9 h d'HC prévues, 45 h × 5 € = 225 € de plus dans la base) ; complément de juin 2026 = 780,00 −
    // 30/6 × 15 h × 5 € = 405,00 € ; versé dans le salaire pour les 23 jours pris : 23/6 × 15 h × 5 € = 287,50 €.
    // Reste dû : 780,00 − 405,00 − 287,50 = 87,50 €.
    const f2 = finDeContrat(makeCtx(pv(65), [], leaves, '2027-12-31'), '2027-04-30', 'retrait');
    expect(cpForMonth(makeCtx(pv(65), [], leaves, '2027-12-31'), '2026-06').complement).toBe(40500);
    expect(f2.cpIndemnite - f2.cpDixiemeEnCours!).toBe(8750);
    // L1 (130 h, 30 h par semaine) : 780,00 − 30,00 (complément) − 23/6 × 30 h × 5 € (575,00) = 175,00 € ; même montant
    // qu'un contrat fixe de 30 h (7/6 × 30 h × 5 €).
    const f1 = finDeContrat(makeCtx(pv(130), [], leaves, '2027-12-31'), '2027-04-30', 'retrait');
    expect(f1.cpIndemnite - f1.cpDixiemeEnCours!).toBe(17500);
  });
  it('D16, revu par la T-103 (H8) : planning remis au-dessus de la durée du contrat : HC au-delà de la durée du contrat', () => {
    // 130 h par mois, 52 semaines : B = 30 h. Plannings remis de 40 h (5 × 8 h) du 23/02 au 05/04/2026.
    // CCN 96.4 : HC au-delà de « la durée de travail hebdomadaire prévue au contrat » : 10 HC par semaine, rangées dans l'ordre
    // des jours (jeudi 2 h, vendredi 8 h) : semaines du 02/03, 09/03, 16/03, 23/03 = 40 h en mars, 200,00 €.
    const ps: Record<string, Planning> = {};
    for (const l of ['2026-02-23', '2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23', '2026-03-30']) ps[l] = week('08:00', '16:00');
    const c = contract({ start: '2026-02-23', trackedFrom: '2026-02-23', rateNet: 500, planningVariable: true, planningsSemaines: ps, heuresMensualisees: 130 });
    const b = monthBase(makeCtx(c, [], [], T), '2026-03');
    expect(b.complMin).toBe(40 * 60);
    expect(b.complAmount).toBe(20000);
    expect(b.net).toBe(65000 + 20000);
    expect(b.alerts.join(' ')).not.toMatch(/à confirmer|DDETS/);
  });
  it('D16, revu par la T-103 (H8) : HC au-delà de la durée du contrat, semaine par semaine', () => {
    // B = 30 h. Semaine du 02/03 remise à 40 h : 10 h. Semaine du 09/03 remise à 25 h, mardi 10 et mercredi 11 présente
    // 08:00-18:00 (+5 h chacun) : 35 − 30 = 5 h. Autres semaines à 25 h. Mars : 15 h, 75,00 €.
    const p25 = week('08:00', '13:00');
    const ps: Record<string, Planning> = { '2026-02-23': p25, '2026-03-02': week('08:00', '16:00'), '2026-03-09': p25, '2026-03-16': p25, '2026-03-23': p25, '2026-03-30': p25 };
    const c = contract({ start: '2026-02-23', trackedFrom: '2026-02-23', rateNet: 500, planningVariable: true, planningsSemaines: ps, heuresMensualisees: 130 });
    const recs = [rec('2026-03-10', { pres: [{ a: '08:00', d: '18:00' }] }), rec('2026-03-11', { pres: [{ a: '08:00', d: '18:00' }] })];
    const b = monthBase(makeCtx(c, recs, [], T), '2026-03');
    expect(b.complMin).toBe(15 * 60);
    expect(b.complAmount).toBe(7500);
  });
});

describe('T-076 : revue 4, B5, revu par la T-103 (H6) : planning remis, absence retenue', () => {
  it('planning remis, absence retenue une semaine prévue au-delà de B : mois calculé (retenue et HC séparées)', () => {
    // 130 h par mois : B = 30 h. Semaines remises en alternance 45 h (lundi 05/01/2026, rang pair) et 25 h.
    // Congé sans solde du 02 au 04/03 (semaine du 02/03 : 45 h prévues > 30 h) : mois refusé (D2).
    const ps: Record<string, Planning> = {};
    for (let i = 0; i < 60; i++) ps[new Date(Date.UTC(2026, 0, 5 + 7 * i)).toISOString().slice(0, 10)] = i % 2 ? B25 : A45;
    const c = contract({ planningVariable: true, planningsSemaines: ps, heuresMensualisees: 130 });
    const lv: AmLeave[] = [{ id: 'a', type: 'sans_solde', from: '2026-03-02', to: '2026-03-04' }];
    expect(monthBase(makeCtx(c, [], lv, T), '2026-03').nonGere).toEqual([]);
    // Même absence une semaine remise à 25 h (09/03 : ≤ 30 h) : mois calculé.
    const lvB: AmLeave[] = [{ id: 'b', type: 'sans_solde', from: '2026-03-10', to: '2026-03-10' }];
    expect(monthBase(makeCtx(c, [], lvB, T), '2026-03').nonGere).toEqual([]);
  });
});

describe('T-076 : non-régression du contrat fixe', () => {
  it('un contrat fixe donne les mêmes sorties avec ou sans champs de planning variable (non lus quand planningVariable est faux)', () => {
    const recs = [rec('2026-03-10', { pres: [{ a: '08:00', d: '19:00' }] }), rec('2026-03-12', { abs: 'malade_certif' })];
    const leaves: AmLeave[] = [{ id: 's', type: 'sans_solde', from: '2026-03-18', to: '2026-03-18' }];
    const fixe = contract();
    const avecChamps = contract({ cycle: [B20, B25], cycleAncre: '2026-01-12', heuresMensualisees: 10, planningsSemaines: {} });
    for (const m of ['2026-02', '2026-03', '2026-06'] as const) {
      const a = computeMonth(makeCtx(fixe, recs, leaves, T), m);
      const b = computeMonth(makeCtx(avecChamps, recs, leaves, T), m);
      expect(b).toEqual(a);
    }
    // Valeurs du contrat fixe : 45 h × 52 ÷ 12 = 195 h × 4,00 € = 780,00 €.
    expect(salaireMensualise(fixe)).toBe(78000);
  });
  it('cycle de deux semaines identiques = contrat fixe (mêmes montants)', () => {
    // 45 h × 52 ÷ 12 = 195 h : contrat fixe et cycle [45 h, 45 h] avec 195 heures mensualisées.
    const recs = [rec('2026-03-10', { pres: [{ a: '07:00', d: '17:00' }] })];
    const leaves: AmLeave[] = [{ id: 's', type: 'sans_solde', from: '2026-03-18', to: '2026-03-18' }];
    const a = monthBase(makeCtx(contract(), recs, leaves, T), '2026-03');
    const b = monthBase(makeCtx(contract({ planningVariable: true, cycle: [A45, A45], cycleAncre: '2026-01-05', heuresMensualisees: 195 }), recs, leaves, T), '2026-03');
    for (const k of ['salaireMens', 'base', 'retenue', 'divisorMin', 'complMin', 'majMin', 'complAmount', 'majAmount', 'net', 'entretien', 'repas'] as const) expect(b[k]).toEqual(a[k]);
  });
});
