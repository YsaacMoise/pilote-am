import { addDays, make, type ISODate } from './dates';

/** Dimanche de Pâques (algorithme de Meeus pour le calendrier grégorien). */
export function easterSunday(year: number): ISODate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return make(year, month, day);
}

export interface PublicHoliday {
  date: ISODate;
  name: string;
  /** Le 1er mai suit des règles particulières. */
  isMayFirst: boolean;
}

/** Les 11 jours fériés légaux en France métropolitaine (hors Alsace-Moselle). */
export function publicHolidays(year: number): PublicHoliday[] {
  const easter = easterSunday(year);
  const list: Array<[ISODate, string]> = [
    [make(year, 1, 1), 'Jour de l’an'],
    [addDays(easter, 1), 'Lundi de Pâques'],
    [make(year, 5, 1), 'Fête du travail'],
    [make(year, 5, 8), 'Victoire 1945'],
    [addDays(easter, 39), 'Ascension'],
    [addDays(easter, 50), 'Lundi de Pentecôte'],
    [make(year, 7, 14), 'Fête nationale'],
    [make(year, 8, 15), 'Assomption'],
    [make(year, 11, 1), 'Toussaint'],
    [make(year, 11, 11), 'Armistice 1918'],
    [make(year, 12, 25), 'Noël'],
  ];
  return list
    .map(([date, name]) => ({ date, name, isMayFirst: date.endsWith('-05-01') }))
    .sort((x, y) => (x.date < y.date ? -1 : 1));
}

const cache = new Map<number, Map<ISODate, PublicHoliday>>();

export function holidayOn(date: ISODate): PublicHoliday | null {
  const year = Number(date.slice(0, 4));
  let byDate = cache.get(year);
  if (!byDate) {
    byDate = new Map(publicHolidays(year).map((h) => [h.date, h]));
    cache.set(year, byDate);
  }
  return byDate.get(date) ?? null;
}
