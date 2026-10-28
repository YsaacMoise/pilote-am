import { describe, expect, test } from 'bun:test';
import { dayAbattement, totalAbattement } from '../src/engine/abattement';
import { acquiredDays, contractPeriods } from '../src/engine/conges';
import { computeLedger, type Dossier } from '../src/engine/ledger';
import { resolveDay } from '../src/engine/schedule';
import { computeMonth, entretienForDay, mensualisation, type MonthContext } from '../src/engine/month';
import { endOfContract, notice } from '../src/engine/rupture';
import { classifySickness } from '../src/engine/sickness';
import type { Contract, DayEntry } from '../src/engine/types';

const H = (h: number, m = 0) => h * 60 + m;

function lina(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'c1',
    childId: 'lina',
    familyId: 'moreau',
    startDate: '2025-09-01',
    yearType: 'complete',
    programmedWeeks: 52,
    nonAccueil: [],
    pattern: {
      0: [{ start: H(7, 30), end: H(17, 30) }],
      1: [{ start: H(7, 30), end: H(17, 30) }],
      2: [{ start: H(7, 30), end: H(17, 30) }],
      3: [{ start: H(7, 30), end: H(17, 30) }],
    },
    hourlyNetMilli: 3_800,
    majorationPct: 10,
    complementaryPct: 0,
    entretien: { kind: 'minimum' },
    mealCents: 400,
    kmMilli: 0,
    cpPaymentMode: 'juin',
    childMajoration: false,
    ...overrides,
  };
}

function ctx(entries: DayEntry[] = [], extra: Partial<MonthContext> = {}): MonthContext {
  return {
    today: '2026-12-31',
    entries: new Map(entries.map((e) => [e.date, e])),
    sickDeductible: new Set(),
    cpUnpaid: new Set(),
    ...extra,
  };
}

describe('mensualisation', () => {
  test('52 semaines : 3,80 € × 40 h × 52 ÷ 12', () => {
    const m = mensualisation(lina());
    expect(m.cents).toBe(65_867);
    expect(Math.round(m.minutes)).toBe(10_400);
  });
  test('46 semaines ou moins : 3,80 € × 40 h × 40 ÷ 12', () => {
    const c = lina({ yearType: 'incomplete', programmedWeeks: 40 });
    expect(mensualisation(c).cents).toBe(50_667);
  });
  test('contrat de plus de 45 h : heures au-delà majorées dans la mensualisation', () => {
    const c = lina({
      pattern: { 0: [{ start: H(7), end: H(17) }], 1: [{ start: H(7), end: H(17) }], 2: [{ start: H(7), end: H(17) }], 3: [{ start: H(7), end: H(17) }], 4: [{ start: H(7), end: H(17) }] },
    });
    // 45 h × 3,80 + 5 h × 4,18 = 171 + 20,90 = 191,90 € par semaine × 52 ÷ 12 = 831,57 €
    expect(mensualisation(c).cents).toBe(83_157);
  });
});

describe('mois complet sans incident', () => {
  test('octobre 2026 : 17 jours, entretien et repas', () => {
    const r = computeMonth(lina(), '2026-10', ctx());
    expect(r.recap.activityDays).toBe(17);
    expect(r.netSalaryCents).toBe(65_867);
    expect(r.entretienCents).toBe(17 * 435);
    expect(r.mealsCents).toBe(17 * 400);
    expect(r.totalCents).toBe(80_062);
    expect(r.deductionCents).toBe(0);
    expect(r.recap.normalHours.toFixed(2)).toBe('173.33');
  });
  test('novembre 2026 : le 11 novembre est chômé et payé', () => {
    const r = computeMonth(lina(), '2026-11', ctx());
    expect(r.recap.activityDays).toBe(16);
    expect(r.deductionCents).toBe(0);
    expect(r.netSalaryCents).toBe(65_867);
    expect(r.entretienCents).toBe(16 * 435);
  });
});

describe('indemnité d’entretien', () => {
  test('minimum : 2,65 € ou 0,435 € par heure', () => {
    const c = lina();
    expect(entretienForDay(c, '2026-10-05', H(4))).toBe(265);
    expect(entretienForDay(c, '2026-10-05', H(9))).toBe(392);
    expect(entretienForDay(c, '2026-10-05', H(11))).toBe(479);
    expect(entretienForDay(c, '2026-03-05', H(9))).toBe(383);
  });
  test('montant du contrat s’il est plus élevé', () => {
    const c = lina({ entretien: { kind: 'perDay', cents: 400 } });
    expect(entretienForDay(c, '2026-10-05', H(9))).toBe(400);
    expect(entretienForDay(c, '2026-10-05', H(11))).toBe(479);
  });
});

describe('heures complémentaires et majorées', () => {
  test('2 h de plus dans une semaine de 40 h : complémentaires au taux du contrat', () => {
    const entries: DayEntry[] = [{ contractId: 'c1', date: '2026-10-06', arrival: H(7, 30), departure: H(19, 30) }];
    const r = computeMonth(lina(), '2026-10', ctx(entries));
    expect(r.complementaryMinutes).toBe(120);
    expect(r.complementaryCents).toBe(760);
    expect(r.majoredMinutes).toBe(0);
    expect(r.netSalaryCents).toBe(65_867 + 760);
  });
  test('au-delà de 45 h : majoration de 10 %', () => {
    const nine = [{ start: H(8), end: H(17) }];
    const c = lina({ pattern: { 0: nine, 1: nine, 2: nine, 3: nine, 4: nine } });
    const entries: DayEntry[] = [{ contractId: 'c1', date: '2026-10-07', arrival: H(8), departure: H(18) }];
    const r = computeMonth(c, '2026-10', ctx(entries));
    expect(r.complementaryMinutes).toBe(0);
    expect(r.majoredMinutes).toBe(60);
    expect(r.majoredCents).toBe(418);
  });
  test('arrivée plus tôt et départ plus tôt la même semaine : pas d’heures en plus', () => {
    const entries: DayEntry[] = [
      { contractId: 'c1', date: '2026-10-05', arrival: H(6, 30), departure: H(17, 30) },
      { contractId: 'c1', date: '2026-10-06', arrival: H(7, 30), departure: H(16, 30) },
    ];
    const r = computeMonth(lina(), '2026-10', ctx(entries));
    expect(r.complementaryMinutes).toBe(0);
  });
});

describe('absences (art. 111)', () => {
  test('52 semaines, méthode des heures : 2 jours d’enfant malade', () => {
    const r = computeMonth(lina(), '2026-10', ctx(
      [
        { contractId: 'c1', date: '2026-10-13', absence: 'enfant_malade', certificate: true },
        { contractId: 'c1', date: '2026-10-14', absence: 'enfant_malade', certificate: true },
      ],
      { sickDeductible: new Set(['2026-10-13', '2026-10-14']) },
    ));
    // 658,67 × 20 h ÷ 170 h = 77,49 €
    expect(r.deductionCents).toBe(7_749);
    expect(r.recap.activityDays).toBe(15);
    expect(r.recap.normalHours.toFixed(2)).toBe('153.33');
  });
  test('46 semaines ou moins, méthode des jours : 2 jours d’arrêt maladie de l’AM', () => {
    const eight = [{ start: H(8), end: H(16) }];
    const c = lina({ yearType: 'incomplete', programmedWeeks: 40, pattern: { 0: eight, 1: eight, 2: eight, 3: eight, 4: eight } });
    const r = computeMonth(c, '2026-10', ctx([
      { contractId: 'c1', date: '2026-10-08', absence: 'am_malade' },
      { contractId: 'c1', date: '2026-10-09', absence: 'am_malade' },
    ]));
    // 506,67 × 2 ÷ 22
    expect(r.deductionMethod).toBe('jours');
    expect(r.deductionDivisor).toBe(22);
    expect(r.deductionCents).toBe(4_606);
  });
  test('absence décidée par la famille : payée', () => {
    const r = computeMonth(lina(), '2026-10', ctx([{ contractId: 'c1', date: '2026-10-13', absence: 'famille' }]));
    expect(r.deductionCents).toBe(0);
    expect(r.recap.activityDays).toBe(16);
  });
  test('fin de contrat en cours de mois', () => {
    const r = computeMonth(lina({ endDate: '2026-10-15' }), '2026-10', ctx());
    // 8 jours de 10 h après le 15 : 658,67 × 80 ÷ 170
    expect(r.deductionCents).toBe(30_996);
    expect(r.recap.activityDays).toBe(9);
  });
});

describe('enfant malade (art. 105)', () => {
  const sick = (dates: string[], certificate = true): DayEntry[] =>
    dates.map((date) => ({ contractId: 'c1', date, absence: 'enfant_malade', certificate }));

  test('crédit de 5 jours par année de contrat, puis payé', () => {
    const r = classifySickness(lina(), sick(['2026-01-05', '2026-02-02', '2026-03-02', '2026-04-06', '2026-05-04', '2026-06-01']));
    expect(r.deductible.size).toBe(5);
    expect(r.paid.has('2026-06-01')).toBe(true);
  });
  test('le crédit repart à la date anniversaire du contrat', () => {
    const r = classifySickness(lina(), sick(['2026-01-05', '2026-02-02', '2026-03-02', '2026-04-06', '2026-05-04', '2026-09-07']));
    expect(r.deductible.size).toBe(6);
  });
  test('absence de 14 jours calendaires : non payée, sans entamer le crédit', () => {
    const r = classifySickness(lina(), sick(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']));
    expect(r.deductible.size).toBe(8);
    expect(r.usedByPeriod.size).toBe(0);
  });
  test('sans certificat : payée', () => {
    const r = classifySickness(lina(), sick(['2026-10-05'], false));
    expect(r.deductible.size).toBe(0);
    expect(r.paid.has('2026-10-05')).toBe(true);
  });
});

describe('abattement fiscal', () => {
  test('SMIC du jour de garde', () => {
    expect(dayAbattement({ date: '2026-05-31', minutes: H(8), majoration: false })).toBe(3_606);
    expect(dayAbattement({ date: '2026-06-01', minutes: H(10), majoration: false })).toBe(3_693);
    expect(dayAbattement({ date: '2026-06-01', minutes: H(4), majoration: false })).toBe(1_847);
    expect(dayAbattement({ date: '2026-06-01', minutes: H(8), majoration: true })).toBe(4_924);
  });
  test('exemple officiel 2025 : 190 jours à 4 SMIC et 10 jours de 24 h', () => {
    const days = [
      ...Array.from({ length: 190 }, () => ({ date: '2025-03-03', minutes: H(9), majoration: true })),
      ...Array.from({ length: 10 }, () => ({ date: '2025-03-04', minutes: 1440, majoration: true, consecutive24h: true })),
    ];
    // 9 028,80 € + 594 € (le dépliant arrondit à 9 029 + 594)
    expect(totalAbattement(days)).toBe(962_280);
  });
});

describe('congés payés', () => {
  test('acquisition au prorata puis plafond', () => {
    const c = lina();
    const periods = contractPeriods(c, '2026-12-31');
    expect(periods[0]?.start).toBe('2025-09-01');
    expect(periods[0]?.end).toBe('2026-05-31');
    const first = acquiredDays({ period: periods[0]!, amSickDates: new Set(), amChildrenBirthDates: [], amAtLeast21: true });
    expect(first.baseDays).toBe(23);
    const full = acquiredDays({ period: { start: '2026-06-01', end: '2027-05-31', closingYear: 2027 }, amSickDates: new Set(), amChildrenBirthDates: [], amAtLeast21: true });
    expect(full.baseDays).toBe(30);
  });
  test('jours pour enfants à charge, plafonnés à 30', () => {
    const p = { start: '2025-09-01', end: '2026-05-31', closingYear: 2026 };
    const a = acquiredDays({ period: p, amSickDates: new Set(), amChildrenBirthDates: ['2015-03-01', '2018-07-10'], amAtLeast21: true });
    expect(a.baseDays).toBe(23);
    expect(a.childrenDays).toBe(4);
    const b = acquiredDays({ period: { start: '2025-06-01', end: '2026-05-31', closingYear: 2026 }, amSickDates: new Set(), amChildrenBirthDates: ['2015-03-01'], amAtLeast21: true });
    expect(b.totalDays).toBe(30);
  });
  test('période en cours : acquis jusqu’au dernier mois calculé, pas jusqu’au 31 mai', () => {
    const c = lina({ startDate: '2026-09-01' });
    const d: Dossier = { contract: c, entries: [], history: [], controls: [], amLeave: [], amChildrenBirthDates: [], amAtLeast21: true };
    const ledger = computeLedger(d, { today: '2026-10-28', until: '2026-10' });
    expect(ledger.cpPeriods[0]?.acquisition.totalDays).toBe(5);
    expect(ledger.cpPeriods[0]?.indemnity).toBeUndefined();
  });
  test('départ oublié un jour passé : la fin prévue est retenue et signalée', () => {
    const c = lina({ startDate: '2026-09-01' });
    const day = resolveDay(c, '2026-10-21', { contractId: 'c1', date: '2026-10-21', arrival: H(7, 45) }, { today: '2026-10-28' });
    expect(day.actual).toBe(H(17, 30) - H(7, 45));
    expect(day.missingDeparture).toBe(true);
  });
  test('journée coupée : la coupure prévue ne compte pas, deux périodes saisies s’additionnent', () => {
    const split = { 2: [{ start: H(7, 45), end: H(8, 30) }, { start: H(16, 30), end: H(18, 30) }] };
    const c = lina({ startDate: '2026-09-01', pattern: split });
    const one = resolveDay(c, '2026-10-21', { contractId: 'c1', date: '2026-10-21', arrival: H(7, 45), departure: H(18, 30) }, { today: '2026-10-28' });
    expect(one.actual).toBe(H(2, 45));
    const two = resolveDay(c, '2026-10-21', { contractId: 'c1', date: '2026-10-21', arrival: H(7, 40), departure: H(8, 30), arrival2: H(16, 30), departure2: H(18, 45) }, { today: '2026-10-28' });
    expect(two.actual).toBe(H(0, 50) + H(2, 15));
  });
  test('année incomplète : indemnité versée en juin, méthode la plus favorable', () => {
    const eight = [{ start: H(8), end: H(16) }];
    const c = lina({ id: 'c2', startDate: '2026-06-01', yearType: 'incomplete', programmedWeeks: 40, pattern: { 0: eight, 1: eight, 2: eight, 3: eight, 4: eight } });
    const d: Dossier = { contract: c, entries: [], history: [], controls: [], amLeave: [], amChildrenBirthDates: [], amAtLeast21: true };
    const ledger = computeLedger(d, { today: '2027-12-31', until: '2027-06' });
    const period = ledger.cpPeriods[0];
    expect(period?.acquisition.totalDays).toBe(30);
    expect(period?.indemnity?.method).toBe('maintien');
    // maintien : 152 € par semaine × 30 ÷ 6 = 760 €
    expect(ledger.months.get('2027-06')?.cpIndemnityCents).toBe(76_000);
  });
});

describe('fin de contrat', () => {
  test('préavis selon l’ancienneté', () => {
    expect(notice('2026-09-01', '2026-10-15', 'retrait').label).toBe('8 jours calendaires');
    expect(notice('2026-01-15', '2026-10-14', 'retrait').label).toBe('15 jours calendaires');
    const year = notice('2025-01-15', '2026-10-14', 'retrait');
    expect(year.label).toBe('1 mois');
    expect(year.endDate).toBe('2026-11-13');
    expect(notice('2026-01-15', '2026-02-01', 'essai').applies).toBe(false);
  });
  test('indemnité de rupture seulement à partir de 9 mois d’accueil', () => {
    const c = lina({ startDate: '2026-01-15' });
    const d: Dossier = { contract: { ...c, endDate: '2026-10-31' }, entries: [], history: [], controls: [], amLeave: [], amChildrenBirthDates: [], amAtLeast21: true };
    const ledger = computeLedger(d, { today: '2026-10-31', until: '2026-10' });
    expect(endOfContract(ledger, 'retrait', '2026-10-14', '2026-10-31').ruptureIndemnity).toBe(0);
    const due = endOfContract(ledger, 'retrait', '2026-10-15', '2026-10-31');
    expect(due.ruptureIndemnity).toBeGreaterThan(0);
    expect(endOfContract(ledger, 'demission', '2026-10-15', '2026-10-31').ruptureIndemnity).toBe(0);
  });
});
