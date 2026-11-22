// T-076 : contrat aux horaires qui changent d'une semaine à l'autre (planning variable).
// Spécification : regles/t076-decisions-direction.md, section 1. Règles : regles/t076-planning-variable.md (R-PV, P-PV).
// Chaque attendu est calculé à la main, en commentaire, à partir des formules du rapport.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Contract, DayRec, Planning } from '../src/engine/model';
import { dayInfo, makeCtx, mensuelMinutes, monthBase, regularisation, salaireMensualise } from '../src/engine/payroll';
import { computeMonth, declarationLines } from '../src/engine/month';
import { cpForMonth, decompteConge, indemnite, maintien } from '../src/engine/conges';
import { finDeContrat } from '../src/engine/fin';
import { nonGeresContrat } from '../src/engine/nonGeres';
import { lecturePV, pvActif } from '../src/engine/planningVariable';

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
  it('R-PV-05 / P-PV-3 : semaine type prévue au-delà de 45 h, contrat refusé avec un message précis', () => {
    const c = s1({ cycle: [week('08:00', '18:00'), B20] }); // A = 5 × 10 h = 50 h
    expect(nonGeresContrat(c).join(' ')).toMatch(/Semaine prévue au-delà de 45 h \(semaine 1 du cycle, 50 h\)/);
    expect(declarationLines(makeCtx(c, [], [], T), computeMonth(makeCtx(c, [], [], T), '2026-03'))).toEqual([]);
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
  it('S2 : semaine prévue au-delà de 45 h, seul le mois qu’elle touche est refusé', () => {
    const ps: Record<string, Planning> = {};
    for (let i = 0; i < 9; i++) ps[new Date(Date.UTC(2026, 0, 5 + 7 * i)).toISOString().slice(0, 10)] = week('08:00', '14:00');
    ps['2026-02-16'] = week('08:00', '18:00'); // 50 h
    const ctx = makeCtx(contract({ planningVariable: true, planningsSemaines: ps, heuresMensualisees: 130 }), [], [], T);
    expect(monthBase(ctx, '2026-01').nonGere).toEqual([]);
    expect(monthBase(ctx, '2026-02').nonGere.join(' ')).toMatch(/Semaine prévue au-delà de 45 h \(semaine du 16\/02\/2026, 50 h\)/);
  });
  it('avenant qui change les horaires d’un planning variable : refusé', () => {
    const c = s1({ avenants: [{ id: 'a', from: '2026-04-01', changes: { planning: B25 } }] });
    expect(nonGeresContrat(c).join(' ')).toMatch(/Avenant qui change les horaires.*non géré/);
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
    expect(monthBase(ctx, '2026-04').complMin).toBeGreaterThanOrEqual(15 * 60);
  });
  it('L2 : semaine de congé payé, part sûre sans les jours de congé, l’écart à confirmer', () => {
    const c = s1({ cycle: [A45, B25], heuresMensualisees: 130, start: '2025-06-02', trackedFrom: '2025-06-02', balances: { cpRestants: 30, cpEnCours: 0, maladieDeduits: 0 } });
    // Semaine A du 02/03/2026 : congés lundi et mardi (2 × 9 h = 18 h), 27 h travaillées.
    const leaves: AmLeave[] = [{ id: 'cp', type: 'cp', from: '2026-03-02', to: '2026-03-03' }];
    const b = monthBase(makeCtx(c, [], leaves, T), '2026-03');
    // Sûr : réel hors congés 27 h, plafond 45 − 18 = 27 h : max(0 ; 27 − 30) = 0. Semaine A du 16/03 : 15 h. Total 15 h.
    // Lecture « congés comptés » : min(45 ; 45) − 30 = 15 h → écart 15 h, soit 60,00 € à confirmer.
    expect(b.complMin).toBe(15 * 60);
    expect(b.complAConfirmerMin).toBe(15 * 60);
    expect(b.complAConfirmerAmount).toBe(6000);
    expect(b.net).toBe(52000 + 6000);
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
    // 5 + 2 = 7 HC ; « Les 5 heures seront payées sur février ».
    expect(b.complMin).toBe(7 * 60);
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
  it('R-PV-10 / P-PV-5 : maintien C1 et C2, part sûre payée, écart à confirmer (52 semaines)', () => {
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
    // Part sûre = max(675,98 ; min(651,67 ; 900)) = 675,98 € ; à confirmer = max(675,98 ; 900) − 675,98 = 224,02 €.
    expect(ind.montant).toBe(67598);
    expect(ind.pv?.aConfirmer).toBe(22402);
    // Juin 2027 : maintien déjà versé par le salaire = 5 semaines × (140,83 × 60 × 12 ÷ 52 = 1 949,9538 min) × 4,00 €
    // = 649,98 € ; complément sûr = 675,98 − 649,98 = 26,00 € ; à confirmer = (900,00 − 649,98) − 26,00 = 224,02 €.
    const juin = cpForMonth(ctx, '2027-06');
    expect(juin.complement).toBe(2600);
    expect(juin.maintienAConfirmer).toBe(22402);
    const r = computeMonth(ctx, '2027-06');
    expect(r.cpMaintienAConfirmer).toBe(22402);
    expect(declarationLines(ctx, r).find((l) => l.label === 'Salaire net')?.value).toMatch(/224,02\s€ de congés à confirmer/);
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
