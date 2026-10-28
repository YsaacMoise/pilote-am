import { addDays, datesOfMonth, mondayOf, type ISODate, type Minutes, type YearMonth } from './dates';
import { type CareDay } from './abattement';
import { hourlyAmount, mulMulDiv, roundDiv, type Cents } from './money';
import { entretienHourlyMilli, rateOn, RATES, type RateLine } from './rates';
import { inContract, inAdaptation, inNonAccueil, resolveDay, weeklyMinutes, type ResolveOptions, type ResolvedDay } from './schedule';
import { UNPAID_REASONS, type Contract, type DayEntry } from './types';

/** Seuil hebdomadaire au-delà duquel les heures sont majorées (CCN art. 96.4). */
export const MAJORATION_THRESHOLD: Minutes = 45 * 60;

export interface MonthContext extends ResolveOptions {
  /** Saisies du contrat, indexées par date (y compris les jours des semaines à cheval) */
  entries: ReadonlyMap<ISODate, DayEntry>;
  /** Jours d'absence pour maladie de l'enfant qui donnent lieu à retenue (calculés par sickness.ts) */
  sickDeductible: ReadonlySet<ISODate>;
  /** Jours de congés pris sans droits acquis (année complète) : retenue */
  cpUnpaid: ReadonlySet<ISODate>;
  /** Indemnité de congés payés à verser ce mois-ci, et son libellé (calculée par conges.ts) */
  cpIndemnity?: { cents: Cents; label: string };
  rates?: readonly RateLine[];
}

export interface CalcLine {
  label: string;
  cents: Cents;
}

export interface PajemploiRecap {
  /** Heures normales (mensualisées, retenues déduites), valeur exacte en heures */
  normalHours: number;
  complementaryHours: number;
  majoredHours: number;
  activityDays: number;
  paidLeaveDays: number;
  netSalaryCents: Cents;
  entretienCents: Cents;
  mealsCents: Cents;
  kmCents: Cents;
  /** Jours d'accueil de 24 heures consécutives */
  days24h: number;
  /** Enfant en situation de handicap, de longue maladie ou inadapté */
  childMajoration: boolean;
}

export interface MonthResult {
  contractId: string;
  month: YearMonth;
  days: ResolvedDay[];
  mensualisedCents: Cents;
  mensualisedMinutes: number;
  deductionCents: Cents;
  deductionMethod: 'heures' | 'jours';
  deductionNumerator: number;
  deductionDivisor: number;
  complementaryMinutes: Minutes;
  complementaryCents: Cents;
  majoredMinutes: Minutes;
  majoredCents: Cents;
  holidayPremiumCents: Cents;
  cpIndemnityCents: Cents;
  netSalaryCents: Cents;
  entretienCents: Cents;
  mealsCents: Cents;
  kmCents: Cents;
  /** Total versé à l'AM : salaire net + indemnités */
  totalCents: Cents;
  careDays: CareDay[];
  recap: PajemploiRecap;
  lines: CalcLine[];
  /** Vrai si des jours du mois sont encore à venir : montants projetés */
  provisional: boolean;
  warnings: string[];
}

function pct(milliRate: number, percent: number, minutes: Minutes): Cents {
  // taux × (pourcentage ÷ 100) × minutes ÷ 60, en centimes
  return mulMulDiv(milliRate, percent, minutes, 100 * 600);
}

/** Salaire mensualisé net et heures mensualisées (CCN art. 109.1 et 109.2). */
export function mensualisation(c: Contract): { cents: Cents; minutes: number } {
  const weekly = weeklyMinutes(c.pattern);
  const weeks = c.yearType === 'complete' ? 52 : c.programmedWeeks;
  const normalWeekly = Math.min(weekly, MAJORATION_THRESHOLD);
  const majoredWeekly = Math.max(0, weekly - MAJORATION_THRESHOLD);
  // (taux × normal + taux × (1 + maj) × majorées) × semaines ÷ 12
  const numerator =
    BigInt(c.hourlyNetMilli) * BigInt(normalWeekly) * 100n +
    BigInt(c.hourlyNetMilli) * BigInt(majoredWeekly) * BigInt(100 + c.majorationPct);
  const cents = roundDiv(numerator * BigInt(weeks), 12n * 600n * 100n);
  return { cents, minutes: (weekly * weeks) / 12 };
}

function isDeductible(c: Contract, day: ResolvedDay, ctx: MonthContext): boolean {
  if (day.status === 'hors_contrat') return day.theoretical > 0;
  if (day.status !== 'absence' || !day.absence) return false;
  if (UNPAID_REASONS.includes(day.absence)) return day.theoretical > 0 && !inNonAccueil(c, day.date);
  if (day.absence === 'enfant_malade') return ctx.sickDeductible.has(day.date);
  if (day.absence === 'am_conges_payes') return ctx.cpUnpaid.has(day.date);
  return false;
}

export function computeMonth(c: Contract, ym: YearMonth, ctx: MonthContext): MonthResult {
  const rates = ctx.rates ?? RATES;
  const warnings: string[] = [];
  const dates = datesOfMonth(ym);
  const days = dates.map((d) => resolveDay(c, d, ctx.entries.get(d), ctx));
  const mens = mensualisation(c);

  // --- Retenues (art. 111) ---------------------------------------------------
  const method: 'heures' | 'jours' = c.yearType === 'complete' ? 'heures' : 'jours';
  let numerator = 0;
  let divisor = 0;
  let adaptationMinutes = 0;
  for (const day of days) {
    if (method === 'heures') divisor += day.theoretical;
    else if (day.theoretical > 0) divisor += 1;

    if (isDeductible(c, day, ctx)) {
      numerator += method === 'heures' ? day.theoretical : 1;
    } else if (day.status === 'accueil' && inAdaptation(c, day.date) && !day.provisional) {
      adaptationMinutes += Math.max(0, day.scheduled - day.actual);
    }
  }

  let deductionCents = 0;
  if (divisor > 0 && numerator > 0) {
    deductionCents = mulMulDiv(mens.cents, numerator, 1, divisor);
  } else if (divisor === 0 && days.every((d) => d.status === 'hors_contrat')) {
    deductionCents = mens.cents;
  }
  let adaptationCents = 0;
  if (adaptationMinutes > 0) {
    const theoreticalMinutes = days.reduce((s, d) => s + d.theoretical, 0);
    adaptationCents = theoreticalMinutes > 0 ? mulMulDiv(mens.cents, adaptationMinutes, 1, theoreticalMinutes) : 0;
    if (method === 'jours') {
      warnings.push('Période d’adaptation en année incomplète : retenue calculée en heures, la CCN ne précise pas la méthode.');
    }
  }
  deductionCents = Math.min(mens.cents, deductionCents + adaptationCents);

  // --- Heures complémentaires et majorées, semaine civile par semaine civile ---
  let complementaryMinutes = 0;
  let majoredMinutes = 0;
  const firstMonday = mondayOf(dates[0] as ISODate);
  const lastDate = dates[dates.length - 1] as ISODate;
  for (let monday = firstMonday; monday <= lastDate; monday = addDays(monday, 7)) {
    let expected = 0;
    let cumulative = 0;
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i);
      const day = date.startsWith(ym) ? days[Number(date.slice(8)) - 1] : resolveDay(c, date, ctx.entries.get(date), ctx);
      if (!day) continue;
      if (inContract(c, date) && !inNonAccueil(c, date)) expected += day.theoretical;
    }
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i);
      const day = date.startsWith(ym) ? days[Number(date.slice(8)) - 1] : resolveDay(c, date, ctx.entries.get(date), ctx);
      if (!day) continue;
      const before = cumulative;
      cumulative += day.actual;
      if (!date.startsWith(ym)) continue;
      const compLow = expected;
      const compHigh = MAJORATION_THRESHOLD;
      const majLow = Math.max(expected, MAJORATION_THRESHOLD);
      complementaryMinutes += overlap(before, cumulative, compLow, compHigh);
      majoredMinutes += overlap(before, cumulative, majLow, Number.POSITIVE_INFINITY);
    }
  }
  const complementaryCents = pct(c.hourlyNetMilli, 100 + c.complementaryPct, complementaryMinutes);
  const majoredCents = pct(c.hourlyNetMilli, 100 + c.majorationPct, majoredMinutes);

  // --- Jours fériés travaillés (art. 47) ---------------------------------------
  let holidayPremiumCents = 0;
  for (const day of days) {
    if (day.holiday && day.holidayWorked && day.actual > 0) {
      holidayPremiumCents += pct(c.hourlyNetMilli, day.holiday.isMayFirst ? 100 : 10, day.actual);
    }
  }

  // --- Indemnités ----------------------------------------------------------------
  let entretienCents = 0;
  let mealsCents = 0;
  let km10 = 0;
  let activityDays = 0;
  let paidLeaveDays = 0;
  let days24h = 0;
  const careDays: CareDay[] = [];
  for (const day of days) {
    if (day.absence === 'am_conges_payes') paidLeaveDays += 1;
    if (day.actual <= 0) continue;
    activityDays += 1;
    if (day.consecutive24h) days24h += 1;
    entretienCents += entretienForDay(c, day.date, day.actual, rates);
    if (day.meal) mealsCents += c.mealCents;
    km10 += Math.round(day.km * 10);
    careDays.push({ date: day.date, minutes: day.actual, majoration: c.childMajoration, consecutive24h: day.consecutive24h });
  }
  const kmCents = roundDiv(BigInt(km10) * BigInt(c.kmMilli), 100n);

  const cpIndemnityCents = ctx.cpIndemnity?.cents ?? 0;
  const netSalaryCents =
    mens.cents - deductionCents + complementaryCents + majoredCents + holidayPremiumCents + cpIndemnityCents;

  // --- Contrôles ---------------------------------------------------------------
  const minNet = c.hourlyNetMilli;
  const monthStartDate = dates[0] as ISODate;
  const minRate = rateOn('SALAIRE_MIN_NET', monthStartDate, rates);
  if (minNet < minRate) {
    warnings.push('Le taux horaire du contrat est inférieur au minimum conventionnel en vigueur.');
  }

  // --- Heures pour Pajemploi ------------------------------------------------------
  let normalMinutes: number;
  if (method === 'heures') {
    const deductedMinutes = divisor > 0 ? numerator : 0;
    normalMinutes = mens.minutes - deductedMinutes - adaptationMinutes;
  } else {
    normalMinutes = divisor > 0 ? mens.minutes * (1 - numerator / divisor) : 0;
    normalMinutes -= adaptationMinutes;
  }
  normalMinutes = Math.max(0, normalMinutes);

  const lines: CalcLine[] = [{ label: 'Salaire mensualisé', cents: mens.cents }];
  if (deductionCents > 0) lines.push({ label: 'Retenue pour absence', cents: -deductionCents });
  if (complementaryCents > 0) lines.push({ label: 'Heures complémentaires', cents: complementaryCents });
  if (majoredCents > 0) lines.push({ label: 'Heures majorées', cents: majoredCents });
  if (holidayPremiumCents > 0) lines.push({ label: 'Majoration jour férié travaillé', cents: holidayPremiumCents });
  if (ctx.cpIndemnity && cpIndemnityCents !== 0) lines.push({ label: ctx.cpIndemnity.label, cents: cpIndemnityCents });

  const provisional = days.some((d) => d.provisional && d.status !== 'hors_contrat');

  return {
    contractId: c.id,
    month: ym,
    days,
    mensualisedCents: mens.cents,
    mensualisedMinutes: mens.minutes,
    deductionCents,
    deductionMethod: method,
    deductionNumerator: numerator,
    deductionDivisor: divisor,
    complementaryMinutes,
    complementaryCents,
    majoredMinutes,
    majoredCents,
    holidayPremiumCents,
    cpIndemnityCents,
    netSalaryCents,
    entretienCents,
    mealsCents,
    kmCents,
    totalCents: netSalaryCents + entretienCents + mealsCents + kmCents,
    careDays,
    recap: {
      normalHours: normalMinutes / 60,
      complementaryHours: complementaryMinutes / 60,
      majoredHours: majoredMinutes / 60,
      activityDays,
      paidLeaveDays,
      netSalaryCents,
      entretienCents,
      mealsCents,
      kmCents,
      days24h,
      childMajoration: c.childMajoration,
    },
    lines,
    provisional,
    warnings,
  };
}

function overlap(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

/**
 * Indemnité d'entretien d'une journée (CCN art. 114.1) : par heure d'accueil effectif,
 * jamais moins de 90 % du minimum garanti pour 9 heures (au prorata), ni moins de 2,65 €.
 */
export function entretienForDay(c: Contract, date: ISODate, minutes: Minutes, rates: readonly RateLine[] = RATES): Cents {
  if (minutes <= 0) return 0;
  const forfait = roundDiv(BigInt(rateOn('ENTRETIEN_FORFAIT_JOUR', date, rates)), 10n);
  const conventional = hourlyAmount(entretienHourlyMilli(date, rates), minutes);
  const minimum = Math.max(forfait, conventional);
  switch (c.entretien.kind) {
    case 'minimum':
      return minimum;
    case 'perHour':
      return Math.max(minimum, hourlyAmount(c.entretien.milli, minutes));
    case 'perDay':
      return Math.max(minimum, c.entretien.cents);
  }
}
