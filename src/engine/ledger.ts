import { addDays, addMonthsYM, range, yearMonth, type ISODate, type Minutes, type YearMonth } from './dates';
import { totalAbattement, type CareDay } from './abattement';
import {
  acquiredDays, contractPeriods, cpIndemnity, mainLeaveMonth, scheduleIncompletePayment, workingDaysTaken,
  type Acquisition, type CpIndemnity, type ReferencePeriod,
} from './conges';
import { computeMonth, type MonthResult } from './month';
import { type Cents } from './money';
import { rateOn, RATES, type RateLine } from './rates';
import { classifySickness, type SicknessResult } from './sickness';
import { patternMinutesOn } from './schedule';
import type { Contract, ControlEntry, DateRange, DayEntry, HistoryMonth, OpeningBalances } from './types';

/** Tout ce que le moteur sait d'un contrat. */
export interface Dossier {
  contract: Contract;
  entries: readonly DayEntry[];
  history: readonly HistoryMonth[];
  opening?: OpeningBalances;
  controls: readonly ControlEntry[];
  /** Congés payés de l'AM (plages de dates) */
  amLeave: readonly DateRange[];
  amChildrenBirthDates: readonly ISODate[];
  amAtLeast21: boolean;
}

export interface LedgerOptions {
  today: ISODate;
  nowMinutes?: Minutes;
  /** Dernier mois à calculer (inclus) */
  until: YearMonth;
  rates?: readonly RateLine[];
}

export interface CpPeriodStatus {
  period: ReferencePeriod;
  acquisition: Acquisition;
  /** Jours ouvrables pris sur les droits de cette période (de juin à mai suivant) */
  taken: number;
  remaining: number;
  /** Indemnité calculée au 31 mai (absente tant que la période n'est pas close) */
  indemnity?: CpIndemnity;
  /** Vrai si l'acquisition repose en partie sur des soldes saisis à la reprise */
  fromOpening: boolean;
}

export interface MonthGross {
  cents: Cents;
  source: 'bulletin' | 'historique' | 'estimation';
}

export interface Ledger {
  contract: Contract;
  /** Premier mois suivi par l'application */
  trackingStart: YearMonth;
  months: Map<YearMonth, MonthResult>;
  history: Map<YearMonth, HistoryMonth>;
  netByMonth: Map<YearMonth, Cents>;
  grossByMonth: Map<YearMonth, MonthGross>;
  /** Rapport net ÷ brut retenu pour les estimations */
  netToGross: { ratio: number; source: 'bulletin' | 'taux conventionnels' };
  sickness: SicknessResult;
  cpPeriods: CpPeriodStatus[];
  cpUnpaid: Set<ISODate>;
  careDays: CareDay[];
  /** Vrai si des mois antérieurs au suivi manquent dans l'historique */
  historyGaps: YearMonth[];
}

/** Entrées réelles complétées par les congés de l'AM sur les jours d'accueil prévus. */
export function effectiveEntries(d: Dossier): DayEntry[] {
  const byDate = new Map<ISODate, DayEntry>();
  for (const e of d.entries) if (e.contractId === d.contract.id) byDate.set(e.date, e);
  for (const r of d.amLeave) {
    for (const date of range(r.from, r.to)) {
      if (byDate.has(date)) continue;
      if (patternMinutesOn(d.contract.pattern, date) === 0) continue;
      byDate.set(date, { contractId: d.contract.id, date, absence: 'am_conges_payes' });
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function trackingStartOf(d: Dossier): YearMonth {
  if (d.opening) return yearMonth(addDays(d.opening.asOf, 1));
  return yearMonth(d.contract.startDate);
}

export function computeLedger(d: Dossier, opts: LedgerOptions): Ledger {
  const c = d.contract;
  const rates = opts.rates ?? RATES;
  const entries = effectiveEntries(d);
  const entryMap = new Map(entries.map((e) => [e.date, e]));
  const sickness = classifySickness(c, entries, d.opening);
  const trackingStart = trackingStartOf(d);
  const history = new Map(d.history.filter((h) => h.contractId === c.id).map((h) => [h.month, h]));
  const controls = new Map(d.controls.filter((x) => x.contractId === c.id).map((x) => [x.month, x]));

  // Mois couverts : de l'embauche au dernier mois demandé (ou à la fin du contrat)
  const firstMonth = yearMonth(c.startDate);
  const endMonth = c.endDate && yearMonth(c.endDate) < opts.until ? yearMonth(c.endDate) : opts.until;

  const netByMonth = new Map<YearMonth, Cents>();
  const historyGaps: YearMonth[] = [];
  for (let ym = firstMonth; ym < trackingStart && ym <= endMonth; ym = addMonthsYM(ym, 1)) {
    const h = history.get(ym);
    if (h) netByMonth.set(ym, h.netSalaryCents);
    else historyGaps.push(ym);
  }

  const amSickDates = new Set(entries.filter((e) => e.absence === 'am_malade').map((e) => e.date));
  const upTo = c.endDate && c.endDate < lastDayOf(endMonth) ? c.endDate : lastDayOf(endMonth);
  // La période en cours s'arrête au dernier jour calculé : on n'acquiert pas des congés à l'avance
  const periods = contractPeriods(c, upTo).map((p) => (p.end > upTo ? { ...p, end: upTo } : p));

  // Acquisition par période, en tenant compte des soldes de reprise
  const cpPeriods: CpPeriodStatus[] = periods.map((period) => {
    let fromOpening = false;
    let acquisition: Acquisition;
    if (d.opening && period.start <= d.opening.asOf && d.opening.asOf < period.end) {
      const rest = acquiredDays({
        period: { ...period, start: addDays(d.opening.asOf, 1) },
        amSickDates,
        amChildrenBirthDates: d.amChildrenBirthDates,
        amAtLeast21: d.amAtLeast21,
      });
      const base = Math.min(30, d.opening.cpCurrentAcquired + rest.baseDays);
      const full = acquiredDays({ period, amSickDates, amChildrenBirthDates: d.amChildrenBirthDates, amAtLeast21: d.amAtLeast21 });
      acquisition = { baseDays: base, childrenDays: Math.min(full.childrenDays, Math.max(0, 30 - base)), totalDays: 0 };
      acquisition.totalDays = acquisition.baseDays + acquisition.childrenDays;
      fromOpening = true;
    } else if (d.opening && period.end <= d.opening.asOf) {
      // Période déjà close à la reprise : seuls les jours restants comptent
      acquisition = { baseDays: d.opening.cpPreviousRemaining, childrenDays: 0, totalDays: d.opening.cpPreviousRemaining };
      fromOpening = true;
    } else {
      acquisition = acquiredDays({ period, amSickDates, amChildrenBirthDates: d.amChildrenBirthDates, amAtLeast21: d.amAtLeast21 });
    }
    return { period, acquisition, taken: 0, remaining: acquisition.totalDays, fromOpening };
  });

  // Congés pris : imputés sur la période close précédente (droits disponibles de juin à mai)
  const cpUnpaid = new Set<ISODate>();
  const leaveStart = d.opening ? addDays(d.opening.asOf, 1) : c.startDate;
  const leaveEnd = c.endDate ?? lastDayOf(endMonth);
  const takenDays = workingDaysTaken(d.amLeave, leaveStart, leaveEnd);
  for (const date of takenDays) {
    const closed = cpPeriods.find((p) => p.period.end < date && date <= `${p.period.closingYear + 1}-05-31`);
    if (closed && closed.remaining > 0) {
      closed.taken += 1;
      closed.remaining -= 1;
    } else if (c.yearType === 'complete') {
      cpUnpaid.add(date);
    }
  }

  // Calcul mois par mois, dans l'ordre, pour que les indemnités de juin voient l'année écoulée
  const months = new Map<YearMonth, MonthResult>();
  const cpPayments = new Map<YearMonth, { cents: Cents; label: string }>();
  for (let ym = trackingStart; ym <= endMonth; ym = addMonthsYM(ym, 1)) {
    if (ym.endsWith('-06')) {
      const closing = cpPeriods.find((p) => p.period.closingYear === Number(ym.slice(0, 4)) && !p.indemnity);
      if (closing && closing.period.end.endsWith('-05-31')) {
        closing.indemnity = cpIndemnity(c, closing.period, closing.acquisition, netByMonth);
        if (c.yearType === 'complete') {
          if (closing.indemnity.dueCents > 0) {
            addPayment(cpPayments, ym, closing.indemnity.dueCents, 'Complément de congés payés (règle du dixième)');
          }
        } else {
          const plan = scheduleIncompletePayment(c, closing.indemnity, d.amLeave, mainLeaveMonth(d.amLeave, closing.period.closingYear));
          for (const [month, cents] of plan) addPayment(cpPayments, month, cents, 'Indemnité de congés payés');
        }
      }
    }
    const result = computeMonth(c, ym, {
      today: opts.today,
      ...(opts.nowMinutes !== undefined ? { nowMinutes: opts.nowMinutes } : {}),
      entries: entryMap,
      sickDeductible: sickness.deductible,
      cpUnpaid,
      ...(cpPayments.has(ym) ? { cpIndemnity: cpPayments.get(ym) as { cents: Cents; label: string } } : {}),
      rates,
    });
    months.set(ym, result);
    netByMonth.set(ym, result.netSalaryCents);
  }

  // Rapport net / brut : dernier bulletin connu, sinon taux conventionnels du jour
  let netToGross: Ledger['netToGross'] | undefined;
  const pairs: Array<{ month: YearMonth; net: Cents; gross: Cents }> = [];
  for (const h of history.values()) if (h.grossSalaryCents && h.netSalaryCents > 0) pairs.push({ month: h.month, net: h.netSalaryCents, gross: h.grossSalaryCents });
  for (const x of controls.values()) if (x.declaredGrossCents && x.declaredNetCents > 0) pairs.push({ month: x.month, net: x.declaredNetCents, gross: x.declaredGrossCents });
  pairs.sort((a, b) => (a.month < b.month ? 1 : -1));
  const latest = pairs[0];
  if (latest) netToGross = { ratio: latest.net / latest.gross, source: 'bulletin' };
  else {
    const net = rateOn('SALAIRE_MIN_NET', opts.today, rates);
    const gross = rateOn('SALAIRE_MIN_BRUT', opts.today, rates);
    netToGross = { ratio: net / gross, source: 'taux conventionnels' };
  }

  const grossByMonth = new Map<YearMonth, MonthGross>();
  for (const [ym, net] of netByMonth) {
    const control = controls.get(ym);
    const h = history.get(ym);
    if (control?.declaredGrossCents !== undefined) grossByMonth.set(ym, { cents: control.declaredGrossCents, source: 'bulletin' });
    else if (h?.grossSalaryCents !== undefined) grossByMonth.set(ym, { cents: h.grossSalaryCents, source: 'historique' });
    else grossByMonth.set(ym, { cents: Math.round(net / netToGross.ratio), source: 'estimation' });
  }

  const careDays: CareDay[] = [];
  for (const m of months.values()) careDays.push(...m.careDays);

  return {
    contract: c, trackingStart, months, history, netByMonth, grossByMonth, netToGross,
    sickness, cpPeriods, cpUnpaid, careDays, historyGaps,
  };
}

function addPayment(map: Map<YearMonth, { cents: Cents; label: string }>, ym: YearMonth, cents: Cents, label: string): void {
  const existing = map.get(ym);
  map.set(ym, { cents: (existing?.cents ?? 0) + cents, label: existing ? existing.label : label });
}

function lastDayOf(ym: YearMonth): ISODate {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(last).padStart(2, '0')}`;
}

/** Abattement fiscal et revenu imposable estimé d'une année civile, tous contrats confondus. */
export function yearTax(ledgers: readonly Ledger[], year: number, rates: readonly RateLine[] = RATES): {
  income: Cents; abattement: Cents; taxable: Cents; partial: boolean;
} {
  let income = 0;
  const days: CareDay[] = [];
  let partial = false;
  for (const l of ledgers) {
    for (const [ym, m] of l.months) {
      if (!ym.startsWith(`${year}-`)) continue;
      income += m.netSalaryCents + m.entretienCents + m.mealsCents + m.kmCents;
      days.push(...m.careDays);
    }
    for (const [ym, h] of l.history) {
      if (!ym.startsWith(`${year}-`) || ym >= l.trackingStart) continue;
      income += h.netSalaryCents + h.entretienCents + h.mealsCents + h.kmCents;
      partial = true; // les jours de garde des mois repris ne sont pas connus un par un
    }
  }
  const abattementBrut = totalAbattement(days, rates);
  const abattement = Math.min(abattementBrut, income);
  return { income, abattement, taxable: Math.max(0, income - abattement), partial };
}
