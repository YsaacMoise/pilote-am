import { addDays, daysInMonth, make, parts, range, weekday, type ISODate, type YearMonth } from './dates';
import { holidayOn } from './holidays';
import { mulMulDiv, roundDiv, type Cents } from './money';
import { weeklyMinutes } from './schedule';
import { MAJORATION_THRESHOLD } from './month';
import type { Contract, DateRange } from './types';

/**
 * Congés payés (CCN art. 48.1 et 102).
 *
 * - Période de référence : du 1er juin au 31 mai (première année : de l'embauche au 31 mai).
 * - 2,5 jours ouvrables par mois de travail, arrondi à l'entier supérieur, 30 jours au plus.
 *   Un mois incomplet compte au prorata des jours de contrat.
 * - Mois entièrement couvert par un arrêt maladie de l'AM : 2 jours (Code du travail, art. L3141-5-1).
 * - Jours supplémentaires pour enfants à charge (art. 48.1.3.3) : 2 jours par enfant de moins de 15 ans
 *   au 30 avril (1 jour si les congés acquis ne dépassent pas 6 jours), total plafonné à 30 jours
 *   pour une salariée de 21 ans ou plus.
 * - Indemnité : la plus favorable entre le maintien de salaire et le dixième de la rémunération
 *   de la période (art. 48.1.1.5). Les calculs se font en net, comme la déclaration Pajemploi :
 *   le rapport entre les deux méthodes est le même en net et en brut.
 * - Année complète : les congés sont déjà dans le salaire mensualisé ; un complément est dû
 *   si le dixième est plus favorable. Il est versé en juin (date non fixée par la CCN).
 * - Année incomplète : l'indemnité s'ajoute au salaire, en juin, à la prise principale ou au
 *   fur et à mesure de la prise (toute autre modalité est proscrite).
 */

export interface ReferencePeriod {
  /** Premier jour de la période (1er juin, ou date d'embauche) */
  start: ISODate;
  /** Dernier jour (31 mai, ou fin du contrat) */
  end: ISODate;
  /** Année du 31 mai qui clôt la période */
  closingYear: number;
}

export function referencePeriodFor(date: ISODate): { start: ISODate; end: ISODate; closingYear: number } {
  const { y, m } = parts(date);
  const closingYear = m >= 6 ? y + 1 : y;
  return { start: make(closingYear - 1, 6, 1), end: make(closingYear, 5, 31), closingYear };
}

export function contractPeriods(c: Contract, upTo: ISODate): ReferencePeriod[] {
  const out: ReferencePeriod[] = [];
  const last = c.endDate && c.endDate < upTo ? c.endDate : upTo;
  let cursor = c.startDate;
  while (cursor <= last) {
    const p = referencePeriodFor(cursor);
    const start = cursor > p.start ? cursor : p.start;
    const end = c.endDate && c.endDate < p.end ? c.endDate : p.end;
    out.push({ start, end, closingYear: p.closingYear });
    cursor = addDays(p.end, 1);
  }
  return out;
}

export interface AcquisitionInput {
  period: ReferencePeriod;
  /** Dates d'arrêt maladie de l'AM (pour la règle des 2 jours par mois) */
  amSickDates: ReadonlySet<ISODate>;
  /** Dates de naissance des enfants à charge de l'AM */
  amChildrenBirthDates: readonly ISODate[];
  /** L'AM a 21 ans ou plus au 30 avril de l'année précédente */
  amAtLeast21: boolean;
}

export interface Acquisition {
  baseDays: number;
  childrenDays: number;
  totalDays: number;
}

export function acquiredDays(input: AcquisitionInput): Acquisition {
  const { period } = input;
  let raw = 0;
  const startParts = parts(period.start);
  let y = startParts.y;
  let m = startParts.m;
  for (;;) {
    const first = make(y, m, 1);
    if (first > period.end) break;
    const last = make(y, m, daysInMonth(y, m));
    const from = first < period.start ? period.start : first;
    const to = last > period.end ? period.end : last;
    const covered = range(from, to).length;
    const monthDays = daysInMonth(y, m);
    const allSick = range(from, to).every((d) => input.amSickDates.has(d));
    const rate = allSick ? 2 : 2.5;
    raw += (rate * covered) / monthDays;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  const baseDays = Math.min(30, Math.ceil(raw - 1e-9));
  const april30 = make(period.closingYear, 4, 30);
  const eligibleChildren = input.amChildrenBirthDates.filter((b) => b <= april30 && ageOn(b, april30) < 15).length;
  const perChild = baseDays <= 6 ? 1 : 2;
  let childrenDays = eligibleChildren * perChild;
  if (input.amAtLeast21) childrenDays = Math.max(0, Math.min(childrenDays, 30 - baseDays));
  return { baseDays, childrenDays, totalDays: baseDays + childrenDays };
}

function ageOn(birth: ISODate, date: ISODate): number {
  const b = parts(birth);
  const d = parts(date);
  let age = d.y - b.y;
  if (d.m < b.m || (d.m === b.m && d.d < b.d)) age -= 1;
  return age;
}

/** Jours ouvrables (lundi à samedi, hors jours fériés) compris dans des plages de congés. */
export function workingDaysTaken(leave: readonly DateRange[], from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (const r of leave) {
    const start = r.from > from ? r.from : from;
    const end = r.to < to ? r.to : to;
    if (start > end) continue;
    for (const d of range(start, end)) {
      if (weekday(d) <= 5 && !holidayOn(d)) out.push(d);
    }
  }
  return [...new Set(out)].sort();
}

/** Salaire net d'une semaine de planning type (majoration au-delà de 45 h incluse). */
export function weeklyNetCents(c: Contract): Cents {
  const weekly = weeklyMinutes(c.pattern);
  const normal = Math.min(weekly, MAJORATION_THRESHOLD);
  const majored = Math.max(0, weekly - MAJORATION_THRESHOLD);
  return roundDiv(
    BigInt(c.hourlyNetMilli) * BigInt(normal) * 100n + BigInt(c.hourlyNetMilli) * BigInt(majored) * BigInt(100 + c.majorationPct),
    600n * 100n,
  );
}

export interface CpIndemnity {
  period: ReferencePeriod;
  acquired: Acquisition;
  /** Somme des salaires nets de la période, congés payés compris, hors indemnités */
  base: Cents;
  /** Vrai si toutes les paies de la période sont connues */
  baseComplete: boolean;
  tenth: Cents;
  maintain: Cents;
  /** Méthode retenue */
  method: 'dixieme' | 'maintien';
  /** Année incomplète : indemnité totale ; année complète : complément au-delà du maintien */
  dueCents: Cents;
}

export function cpIndemnity(
  c: Contract,
  period: ReferencePeriod,
  acquired: Acquisition,
  netSalariesByMonth: ReadonlyMap<YearMonth, Cents>,
): CpIndemnity {
  let base = 0;
  let complete = true;
  const startParts = parts(period.start);
  let y = startParts.y;
  let m = startParts.m;
  for (;;) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    if (make(y, m, 1) > period.end) break;
    const value = netSalariesByMonth.get(ym);
    if (value === undefined) complete = false;
    else base += value;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  const tenth = roundDiv(BigInt(base), 10n);
  const maintain = mulMulDiv(weeklyNetCents(c), acquired.totalDays, 1, 6);
  const method = tenth > maintain ? 'dixieme' : 'maintien';
  const best = Math.max(tenth, maintain);
  const dueCents = c.yearType === 'complete' ? Math.max(0, tenth - maintain) : best;
  return { period, acquired, base, baseComplete: complete, tenth, maintain, method, dueCents };
}

/**
 * Répartition du paiement d'une indemnité d'année incomplète sur les mois qui suivent le 31 mai.
 * Retourne la somme à verser par mois.
 */
export function scheduleIncompletePayment(
  c: Contract,
  indemnity: CpIndemnity,
  leave: readonly DateRange[],
  mainLeaveMonth?: YearMonth,
): Map<YearMonth, Cents> {
  const out = new Map<YearMonth, Cents>();
  const june = `${indemnity.period.closingYear}-06`;
  if (indemnity.dueCents <= 0) return out;
  switch (c.cpPaymentMode) {
    case 'juin':
      out.set(june, indemnity.dueCents);
      return out;
    case 'prise_principale':
      out.set(mainLeaveMonth ?? june, indemnity.dueCents);
      return out;
    case 'au_fur_et_a_mesure': {
      const from = make(indemnity.period.closingYear, 6, 1);
      const to = make(indemnity.period.closingYear + 1, 5, 31);
      const taken = workingDaysTaken(leave, from, to).slice(0, indemnity.acquired.totalDays);
      const total = indemnity.acquired.totalDays;
      if (total === 0) return out;
      let paid = 0;
      taken.forEach((d, i) => {
        const cumulative = mulMulDiv(indemnity.dueCents, i + 1, 1, total);
        const amount = cumulative - paid;
        paid = cumulative;
        const ym = d.slice(0, 7);
        out.set(ym, (out.get(ym) ?? 0) + amount);
      });
      return out;
    }
  }
}

/** Mois de la plus longue plage de congés commençant après le 31 mai de la période. */
export function mainLeaveMonth(leave: readonly DateRange[], closingYear: number): YearMonth | undefined {
  const from = make(closingYear, 6, 1);
  const to = make(closingYear + 1, 5, 31);
  let best: DateRange | undefined;
  let bestLen = -1;
  for (const r of leave) {
    if (r.from < from || r.from > to) continue;
    const len = range(r.from, r.to).length;
    if (len > bestLen) {
      best = r;
      bestLen = len;
    }
  }
  return best ? best.from.slice(0, 7) : undefined;
}
