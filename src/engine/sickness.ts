import { addDays, diffDays, parts, make, daysInMonth, type ISODate } from './dates';
import { patternMinutesOn } from './schedule';
import type { Contract, DayEntry, OpeningBalances } from './types';

/**
 * Absences de l'enfant pour maladie (CCN art. 105).
 *
 * Avec certificat médical ou bulletin d'hospitalisation, l'absence n'est pas payée :
 * - dans la limite de 5 jours de courtes absences, consécutives ou non ;
 * - ou en cas d'absence de 14 jours calendaires consécutifs.
 * Limites appréciées par période de 12 mois à compter de la date d'embauche ou de sa date anniversaire.
 *
 * Interprétation retenue (le texte ne tranche pas, voir SICKNESS_INTERPRETATION) :
 * - un épisode = des jours d'absence pour maladie qui se suivent, les jours sans accueil prévu ne coupant pas l'épisode ;
 * - un épisode de 14 jours calendaires ou plus : ses 14 premiers jours calendaires ne sont pas payés,
 *   sans entamer le crédit de 5 jours ; au-delà, le salaire est dû ;
 * - un épisode plus court consomme le crédit de 5 jours de la période ; une fois épuisé, les jours sont payés ;
 * - sans certificat, l'absence est payée.
 */
export const SICKNESS_INTERPRETATION =
  'Absence de 14 jours ou plus : 14 jours calendaires non payés, hors crédit de 5 jours. Absence plus courte : imputée sur le crédit de 5 jours par année de contrat.';

export interface SicknessResult {
  deductible: Set<ISODate>;
  /** Jours imputés sur le crédit de 5 jours, par début de période (date anniversaire) */
  usedByPeriod: Map<ISODate, number>;
  /** Jours d'absence pour maladie payés faute de certificat ou au-delà des limites */
  paid: Set<ISODate>;
}

/** Début de la période de 12 mois qui contient la date (date d'embauche ou date anniversaire). */
export function contractYearStart(startDate: ISODate, date: ISODate): ISODate {
  const s = parts(startDate);
  const d = parts(date);
  let year = d.y;
  const candidate = anniversary(s.y, s.m, s.d, year);
  if (candidate > date) year -= 1;
  return anniversary(s.y, s.m, s.d, Math.max(year, s.y));
}

function anniversary(_y: number, m: number, d: number, year: number): ISODate {
  return make(year, m, Math.min(d, daysInMonth(year, m)));
}

export function classifySickness(c: Contract, entries: readonly DayEntry[], opening?: OpeningBalances): SicknessResult {
  const sick = entries
    .filter((e) => e.contractId === c.id && e.absence === 'enfant_malade')
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const deductible = new Set<ISODate>();
  const paid = new Set<ISODate>();
  const usedByPeriod = new Map<ISODate, number>();
  if (opening && opening.sickDaysDeducted > 0) {
    usedByPeriod.set(contractYearStart(c.startDate, opening.asOf), opening.sickDaysDeducted);
  }

  // Regroupement en épisodes : deux jours de maladie appartiennent au même épisode si
  // aucun jour d'accueil prévu ne les sépare.
  const episodes: DayEntry[][] = [];
  for (const e of sick) {
    const current = episodes[episodes.length - 1];
    const last = current?.[current.length - 1];
    if (current && last && sameEpisode(c, last.date, e.date)) current.push(e);
    else episodes.push([e]);
  }

  for (const episode of episodes) {
    const first = episode[0] as DayEntry;
    const last = episode[episode.length - 1] as DayEntry;
    // L'absence court jusqu'à la veille du jour d'accueil suivant (un enfant malade le jeudi,
    // sans accueil prévu le vendredi, reste absent jusqu'au dimanche inclus).
    let end = last.date;
    for (let i = 0; i < 7 && patternMinutesOn(c.pattern, addDays(end, 1)) === 0; i++) end = addDays(end, 1);
    const calendarLength = diffDays(first.date, end) + 1;
    const withCertificate = episode.filter((e) => e.certificate === true);
    const without = episode.filter((e) => e.certificate !== true);
    without.forEach((e) => paid.add(e.date));

    if (calendarLength >= 14) {
      const limit = addDays(first.date, 13);
      for (const e of withCertificate) {
        if (e.date <= limit) deductible.add(e.date);
        else paid.add(e.date);
      }
      continue;
    }
    for (const e of withCertificate) {
      const period = contractYearStart(c.startDate, e.date);
      const used = usedByPeriod.get(period) ?? 0;
      if (used < 5) {
        deductible.add(e.date);
        usedByPeriod.set(period, used + 1);
      } else {
        paid.add(e.date);
      }
    }
  }
  return { deductible, usedByPeriod, paid };
}

function sameEpisode(c: Contract, a: ISODate, b: ISODate): boolean {
  for (let d = addDays(a, 1); d < b; d = addDays(d, 1)) {
    if (patternMinutesOn(c.pattern, d) > 0) return false;
  }
  return true;
}
