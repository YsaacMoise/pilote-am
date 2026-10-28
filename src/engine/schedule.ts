import { weekday, type ISODate, type Minutes } from './dates';
import { holidayOn, type PublicHoliday } from './holidays';
import type { AbsenceReason, Contract, DayEntry, WeeklyPattern } from './types';

export function slotsMinutes(slots: readonly { start: Minutes; end: Minutes }[] | undefined): Minutes {
  if (!slots) return 0;
  let total = 0;
  for (const s of slots) total += Math.max(0, s.end - s.start);
  return total;
}

/** Minutes prévues par le planning type pour un jour de semaine. */
export function patternMinutesOn(pattern: WeeklyPattern, date: ISODate): Minutes {
  return slotsMinutes(pattern[weekday(date)]);
}

/** Durée d'accueil hebdomadaire du contrat, en minutes. */
export function weeklyMinutes(pattern: WeeklyPattern): Minutes {
  let total = 0;
  for (let w = 0; w < 7; w++) total += slotsMinutes(pattern[w as 0 | 1 | 2 | 3 | 4 | 5 | 6]);
  return total;
}

/** Nombre de jours d'accueil par semaine dans le planning type. */
export function weeklyDays(pattern: WeeklyPattern): number {
  let n = 0;
  for (let w = 0; w < 7; w++) if (slotsMinutes(pattern[w as 0 | 1 | 2 | 3 | 4 | 5 | 6]) > 0) n++;
  return n;
}

export function inContract(c: Contract, date: ISODate): boolean {
  return date >= c.startDate && (c.endDate === undefined || date <= c.endDate);
}

export function inNonAccueil(c: Contract, date: ISODate): boolean {
  return c.nonAccueil.some((r) => r.from <= date && date <= r.to);
}

export function inAdaptation(c: Contract, date: ISODate): boolean {
  return c.adaptationEnd !== undefined && date >= c.startDate && date <= c.adaptationEnd;
}

export type DayStatus =
  /** Jour hors des dates du contrat */
  | 'hors_contrat'
  /** Pas d'accueil prévu ce jour de la semaine */
  | 'repos'
  /** Semaine de non-accueil programmée (année incomplète) */
  | 'non_accueil'
  /** Jour férié chômé tombant un jour d'accueil */
  | 'ferie_chome'
  /** Accueil réalisé ou présumé conforme au planning */
  | 'accueil'
  /** Absence saisie */
  | 'absence';

export interface ResolvedDay {
  date: ISODate;
  status: DayStatus;
  /** Minutes du planning type ce jour, quelles que soient les absences (diviseur de l'art. 111) */
  theoretical: Minutes;
  /** Minutes d'accueil attendues ce jour (0 hors contrat, en non-accueil ou férié chômé) */
  scheduled: Minutes;
  /** Minutes d'accueil effectif */
  actual: Minutes;
  /** Vrai si la journée n'a pas encore eu lieu ou est en cours : valeurs projetées */
  provisional: boolean;
  /** Vrai si la journée suit le planning sans saisie */
  presumed: boolean;
  absence?: AbsenceReason;
  certificate: boolean;
  holiday: PublicHoliday | null;
  holidayWorked: boolean;
  meal: boolean;
  km: number;
  consecutive24h: boolean;
  entry?: DayEntry;
  /** Arrivée saisie sans départ un jour passé : la fin prévue est retenue */
  missingDeparture?: boolean;
}

export interface ResolveOptions {
  /** Date du jour : les jours suivants sont projetés selon le planning */
  today: ISODate;
  /** Minutes écoulées aujourd'hui, pour un enfant arrivé et pas encore parti */
  nowMinutes?: Minutes;
  /** Repas fournis par l'AM par défaut (si l'indemnité de repas du contrat est positive) */
}

export function resolveDay(c: Contract, date: ISODate, entry: DayEntry | undefined, opts: ResolveOptions): ResolvedDay {
  const theoretical = patternMinutesOn(c.pattern, date);
  const holiday = holidayOn(date);
  const base = {
    date,
    theoretical,
    holiday,
    certificate: entry?.certificate === true,
    km: entry?.km ?? 0,
    consecutive24h: entry?.consecutive24h === true,
    holidayWorked: false,
    ...(entry ? { entry } : {}),
  };

  if (!inContract(c, date)) {
    return { ...base, status: 'hors_contrat', scheduled: 0, actual: 0, provisional: false, presumed: false, meal: false, km: 0 };
  }

  const nonAccueil = inNonAccueil(c, date);
  const isFuture = date > opts.today;
  const isToday = date === opts.today;
  const hasTimes = entry?.arrival !== undefined;

  // Absence saisie
  if (entry?.absence) {
    return {
      ...base,
      status: 'absence',
      scheduled: nonAccueil ? 0 : theoretical,
      actual: 0,
      provisional: isFuture,
      presumed: false,
      absence: entry.absence,
      meal: false,
      km: 0,
    };
  }

  // Heures saisies : elles font foi, même un jour non prévu
  if (hasTimes && entry) {
    const slots = [...(c.pattern[weekday(date)] ?? [])].sort((a, b) => a.start - b.start);
    const plannedEnd = (from: Minutes): Minutes => Math.max(from, ...slots.map((s) => s.end));
    let provisional = false;
    let missingDeparture = false;
    /** Fin d'une période d'accueil sans départ saisi */
    const closeOpen = (from: Minutes): Minutes => {
      if (isToday && opts.nowMinutes !== undefined) {
        provisional = true;
        return Math.max(from, opts.nowMinutes);
      }
      if (isFuture || isToday) {
        provisional = true;
        return plannedEnd(from);
      }
      // Départ oublié un jour passé : on retient l'heure de fin prévue et on le signale
      missingDeparture = true;
      return plannedEnd(from);
    };
    const arrival = entry.arrival ?? 0;
    let actual: Minutes;
    if (entry.arrival2 !== undefined) {
      // Deux périodes saisies (matin et soir, par exemple autour de l'école)
      const dep1 = entry.departure ?? entry.arrival2;
      const dep2 = entry.departure2 ?? closeOpen(entry.arrival2);
      actual = Math.max(0, dep1 - arrival) + Math.max(0, dep2 - entry.arrival2);
    } else {
      const departure = entry.departure ?? closeOpen(arrival);
      actual = Math.max(0, departure - arrival);
      // Une coupure prévue au planning (école) n'est pas du temps d'accueil
      for (let i = 0; i + 1 < slots.length; i++) {
        const gapStart = slots[i]?.end ?? 0;
        const gapEnd = slots[i + 1]?.start ?? 0;
        if (gapEnd > gapStart && arrival <= gapStart && departure >= gapEnd) actual -= gapEnd - gapStart;
      }
    }
    if (entry.consecutive24h) actual = 1440;
    const holidayWorked = holiday !== null && (entry.holidayWorked === true || theoretical === 0 || actual > 0);
    return {
      ...base,
      status: 'accueil',
      scheduled: nonAccueil || (holiday && !holidayWorked) ? 0 : theoretical,
      actual,
      provisional,
      presumed: false,
      holidayWorked,
      meal: entry.meal ?? c.mealCents > 0,
      ...(missingDeparture ? { missingDeparture } : {}),
    };
  }

  if (theoretical === 0) {
    return { ...base, status: 'repos', scheduled: 0, actual: 0, provisional: isFuture, presumed: false, meal: false, km: base.km };
  }
  if (nonAccueil) {
    return { ...base, status: 'non_accueil', scheduled: 0, actual: 0, provisional: isFuture, presumed: false, meal: false, km: base.km };
  }
  if (holiday) {
    return { ...base, status: 'ferie_chome', scheduled: 0, actual: 0, provisional: isFuture, presumed: false, meal: false, km: base.km };
  }

  // Journée sans saisie : présumée conforme au planning
  return {
    ...base,
    status: 'accueil',
    scheduled: theoretical,
    actual: theoretical,
    provisional: isFuture || isToday,
    presumed: true,
    meal: entry?.meal ?? c.mealCents > 0,
  };
}
