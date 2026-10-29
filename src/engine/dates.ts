// Dates au format 'AAAA-MM-JJ', calculées en UTC pour éviter les pièges de l'heure d'été.

export type ISODate = string;
export type Month = string; // 'AAAA-MM'

export function parse(d: ISODate): Date {
  const [y, m, j] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, j));
}

export function fmt(dt: Date): ISODate {
  return dt.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  const dt = parse(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fmt(dt);
}

/** 1 = lundi … 7 = dimanche */
export function weekday(d: ISODate): number {
  const w = parse(d).getUTCDay();
  return w === 0 ? 7 : w;
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
}

export function monthOf(d: ISODate): Month {
  return d.slice(0, 7);
}

export function firstDay(m: Month): ISODate {
  return `${m}-01`;
}

export function lastDay(m: Month): ISODate {
  const [y, mo] = m.split('-').map(Number);
  return fmt(new Date(Date.UTC(y, mo, 0)));
}

export function addMonths(m: Month, n: number): Month {
  const [y, mo] = m.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1 + n, 1));
  return dt.toISOString().slice(0, 7);
}

export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function monthsBetween(from: Month, to: Month): Month[] {
  const out: Month[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** Lundi de la semaine qui contient d */
export function mondayOf(d: ISODate): ISODate {
  return addDays(d, 1 - weekday(d));
}

export function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function hhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Ajoute n mois calendaires à une date (fin de mois gérée) */
export function addMonthsToDate(d: ISODate, n: number): ISODate {
  const dt = parse(d);
  const day = dt.getUTCDate();
  const target = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return fmt(target);
}

/** Ancienneté en mois révolus entre deux dates */
export function fullMonthsBetween(a: ISODate, b: ISODate): number {
  let n = 0;
  while (addMonthsToDate(a, n + 1) <= b) n++;
  return n;
}

/** Période de référence des congés (1er juin – 31 mai) contenant d : renvoie l'année de début */
export function cpPeriodStartYear(d: ISODate): number {
  const y = Number(d.slice(0, 4));
  return d.slice(5) >= '06-01' ? y : y - 1;
}

export function cpPeriod(startYear: number): { from: ISODate; to: ISODate } {
  return { from: `${startYear}-06-01`, to: `${startYear + 1}-05-31` };
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

export function monthLabel(m: Month): string {
  const [y, mo] = m.split('-').map(Number);
  return `${MOIS[mo - 1]} ${y}`;
}

export function dayLabel(d: ISODate, withYear = false): string {
  const dt = parse(d);
  const s = `${JOURS[weekday(d) - 1]} ${dt.getUTCDate()} ${MOIS[dt.getUTCMonth()]}`;
  return withYear ? `${s} ${dt.getUTCFullYear()}` : s;
}

export function shortDate(d: ISODate): string {
  const [y, m, j] = d.split('-');
  return `${j}/${m}/${y}`;
}

export const JOUR_NOMS = JOURS;
export const MOIS_NOMS = MOIS;

/** Date locale du téléphone (et non UTC) */
export function today(): ISODate {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

export function nowHHMM(): string {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}

/** « de juin », « d’octobre » */
export function deMois(m: Month): string {
  const l = monthLabel(m);
  return /^[aeiouyhâéèê]/i.test(l) ? `d’${l}` : `de ${l}`;
}
