/**
 * Dates civiles sans fuseau horaire.
 *
 * Une date est une chaîne « AAAA-MM-JJ ». Les calculs passent par un numéro de jour
 * (jours depuis le 1970-01-01, en UTC) pour éviter tout décalage d'heure d'été.
 * Les heures de la journée sont des minutes depuis minuit (0 à 1440).
 */

export type ISODate = string;
export type Minutes = number;

/** Lundi = 0 … dimanche = 6 */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(s: string): boolean {
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function parts(date: ISODate): { y: number; m: number; d: number } {
  const match = ISO_RE.exec(date);
  if (!match) throw new Error(`Date invalide : ${date}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function make(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function dayNumber(date: ISODate): number {
  const { y, m, d } = parts(date);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function fromDayNumber(n: number): ISODate {
  const dt = new Date(n * 86_400_000);
  return make(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromDayNumber(dayNumber(date) + days);
}

export function diffDays(from: ISODate, to: ISODate): number {
  return dayNumber(to) - dayNumber(from);
}

export function weekday(date: ISODate): Weekday {
  // 1970-01-01 était un jeudi (lundi = 0 → jeudi = 3)
  const n = dayNumber(date);
  return ((((n + 3) % 7) + 7) % 7) as Weekday;
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  const table = [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const value = table[m - 1];
  if (value === undefined) throw new Error(`Mois invalide : ${m}`);
  return value;
}

/** Mois au format « AAAA-MM ». */
export type YearMonth = string;

export function yearMonth(date: ISODate): YearMonth {
  return date.slice(0, 7);
}

export function monthStart(ym: YearMonth): ISODate {
  return `${ym}-01`;
}

export function monthEnd(ym: YearMonth): ISODate {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return make(y, m, daysInMonth(y, m));
}

export function addMonthsYM(ym: YearMonth, n: number): YearMonth {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}`;
}

/** Toutes les dates d'un mois, dans l'ordre. */
export function datesOfMonth(ym: YearMonth): ISODate[] {
  const start = monthStart(ym);
  const end = monthEnd(ym);
  return range(start, end);
}

/** Dates de from à to inclus. */
export function range(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const a = dayNumber(from);
  const b = dayNumber(to);
  for (let n = a; n <= b; n++) out.push(fromDayNumber(n));
  return out;
}

/** Lundi de la semaine civile qui contient la date. */
export function mondayOf(date: ISODate): ISODate {
  return addDays(date, -weekday(date));
}

export function compare(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

/**
 * Ancienneté en mois révolus entre deux dates (la date de fin incluse dans le calcul
 * comme jour d'anniversaire) : du 15/01 au 14/10 → 8 mois, au 15/10 → 9 mois.
 */
export function fullMonthsBetween(from: ISODate, to: ISODate): number {
  const a = parts(from);
  const b = parts(to);
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d < a.d) {
    // Le jour anniversaire n'est pas encore atteint, sauf si le mois de fin est trop court
    const lastDay = daysInMonth(b.y, b.m);
    if (!(b.d === lastDay && a.d > lastDay)) months -= 1;
  }
  return Math.max(0, months);
}

/** « 7 h 52 » à partir de minutes depuis minuit. */
export function formatTime(min: Minutes): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/** « 8 h 30 » ou « 8:30 » → minutes ; null si invalide. */
export function parseTime(input: string): Minutes | null {
  const m = /^\s*(\d{1,2})\s*(?:h|:)\s*(\d{0,2})\s*$/i.exec(input);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = m[2] ? Number(m[2]) : 0;
  if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return null;
  return h * 60 + mi;
}

/** « 173,33 h » à partir de minutes. */
export function formatHours(min: Minutes, decimals = 2): string {
  const value = min / 60;
  const fixed = value.toFixed(decimals);
  const trimmed = decimals > 0 ? fixed.replace(/\.?0+$/, '') : fixed;
  return `${trimmed.replace('.', ',')} h`;
}

const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
const WEEKDAYS_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

export function monthNameFR(m: number): string {
  return MONTHS_FR[m - 1] ?? '';
}

export function weekdayNameFR(w: Weekday): string {
  return WEEKDAYS_FR[w] ?? '';
}

/** « mercredi 28 octobre » */
export function formatLongDate(date: ISODate): string {
  const { m, d } = parts(date);
  return `${weekdayNameFR(weekday(date))} ${d === 1 ? '1er' : d} ${monthNameFR(m)}`;
}

/** « octobre 2026 » */
export function formatYearMonth(ym: YearMonth): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return `${monthNameFR(m)} ${y}`;
}
