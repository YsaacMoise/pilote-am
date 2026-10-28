// Jours fériés légaux en métropole (hors Alsace-Moselle).
import { addDays, fmt, type ISODate } from './dates';

function easter(y: number): ISODate {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return fmt(new Date(Date.UTC(y, month - 1, day)));
}

const cache = new Map<number, Map<ISODate, string>>();

export function holidaysOf(y: number): Map<ISODate, string> {
  let m = cache.get(y);
  if (m) return m;
  const e = easter(y);
  m = new Map<ISODate, string>([
    [`${y}-01-01`, 'Jour de l’an'],
    [addDays(e, 1), 'Lundi de Pâques'],
    [`${y}-05-01`, '1er mai'],
    [`${y}-05-08`, '8 mai'],
    [addDays(e, 39), 'Ascension'],
    [addDays(e, 50), 'Lundi de Pentecôte'],
    [`${y}-07-14`, '14 juillet'],
    [`${y}-08-15`, 'Assomption'],
    [`${y}-11-01`, 'Toussaint'],
    [`${y}-11-11`, '11 novembre'],
    [`${y}-12-25`, 'Noël'],
  ]);
  cache.set(y, m);
  return m;
}

export function holidayName(d: ISODate): string | undefined {
  return holidaysOf(Number(d.slice(0, 4))).get(d);
}

export function isMayDay(d: ISODate): boolean {
  return d.slice(5) === '05-01';
}
