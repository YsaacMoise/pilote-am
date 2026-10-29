// Congés payés (art. 48 et 102) : acquisition, compteur, indemnité.
import { addMonths, cpPeriod, cpPeriodStartYear, daysBetween, eachDay, monthOf, monthsBetween, weekday, type ISODate, type Month } from './dates';
import { holidayName } from './holidays';
import { H45, monthBase, termsAt, weeklyMinutes, weeksPerYear, type Ctx } from './payroll';

/** Jours ouvrables (lundi → samedi, hors fériés) d'un intervalle */
export function joursOuvrables(from: ISODate, to: ISODate): ISODate[] {
  return eachDay(from, to).filter((d) => weekday(d) <= 6 && !holidayName(d));
}

function memo<T>(ctx: Ctx, key: string, f: () => T): T {
  if (!ctx.cache) ctx.cache = new Map();
  if (ctx.cache.has(key)) return ctx.cache.get(key) as T;
  const v = f();
  ctx.cache.set(key, v);
  return v;
}

export interface Acquisition {
  startYear: number;
  from: ISODate;
  to: ISODate;
  /** Jours acquis (arrondis au supérieur, 30 au plus, enfants à charge compris) */
  jours: number;
  /** Jours acquis à date (pour une période en cours) */
  joursADate: number;
  semaines: number;
  enfantsBonus: number;
}

function weeksIn(ctx: Ctx, from: ISODate, to: ISODate): number {
  const { c } = ctx;
  const a = from < c.start ? c.start : from;
  const b = c.end && c.end < to ? c.end : to;
  if (b < a) return 0;
  const cal = (daysBetween(a, b) + 1) / 7;
  if (c.yearType === 'complete') return cal;
  // Année incomplète : semaines programmées au prorata de la période de référence (365 ou 366 jours)
  const p = cpPeriod(cpPeriodStartYear(a));
  const periodDays = daysBetween(p.from, p.to) + 1;
  return (Math.min(daysBetween(a, b) + 1, periodDays) / periodDays) * weeksPerYear(c);
}

function round(x: number): number {
  return Math.min(30, Math.ceil(x - 1e-9));
}

/** Acquisition pour la période de référence commençant le 1er juin `y` */
export function acquisition(ctx: Ctx, y: number, enfantsACharge = 0): Acquisition {
  return memo(ctx, `acq${y}|${enfantsACharge}`, () => {
    const { c } = ctx;
    const p = cpPeriod(y);
    const trackedY = cpPeriodStartYear(c.trackedFrom);
    let raw: number, rawADate: number, semaines: number;
    const upTo = ctx.today < p.to ? ctx.today : p.to;
    if (y === trackedY && c.trackedFrom > c.start) {
      semaines = weeksIn(ctx, c.trackedFrom, p.to);
      raw = c.balances.cpEnCours + (semaines / 4) * 2.5;
      rawADate = c.balances.cpEnCours + (weeksIn(ctx, c.trackedFrom, upTo) / 4) * 2.5;
    } else {
      semaines = weeksIn(ctx, p.from, p.to);
      raw = (semaines / 4) * 2.5;
      rawADate = (weeksIn(ctx, p.from, upTo) / 4) * 2.5;
    }
    const base = round(raw);
    // Salarié de 21 ans et plus : 2 jours par enfant à charge, sans dépasser 30 jours au total.
    const bonus = base > 0 ? Math.max(0, Math.min(30, base + 2 * enfantsACharge) - base) : 0;
    return {
      startYear: y, from: p.from, to: p.to, jours: base + bonus, joursADate: round(Math.max(0, rawADate)),
      semaines, enfantsBonus: bonus,
    };
  });
}

/** Jours de congés payés pris (jours ouvrables) pendant la période [from, to] pour ce contrat */
export function cpPrisEntre(ctx: Ctx, from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (const l of ctx.leaves) {
    if (l.type !== 'cp') continue;
    const a = l.from > from ? l.from : from;
    const b = l.to < to ? l.to : to;
    if (b < a) continue;
    for (const d of joursOuvrables(a, b)) {
      if (d >= ctx.c.start && (!ctx.c.end || d <= ctx.c.end)) out.push(d);
    }
  }
  return [...new Set(out)].sort();
}

export interface Compteur {
  /** Période en cours */
  enCours: Acquisition;
  /** Jours acquis la période précédente, à prendre avant le 31 mai */
  aPrendre: number;
  pris: number;
  reste: number;
  /** Prise au-delà des droits */
  depassement: boolean;
}

export function compteur(ctx: Ctx, at: ISODate, enfantsACharge = 0): Compteur {
  const { c } = ctx;
  const y = cpPeriodStartYear(at);
  const trackedY = cpPeriodStartYear(c.trackedFrom);
  const enCours = acquisition(ctx, y, enfantsACharge);
  let aPrendre: number;
  if (y === trackedY) aPrendre = c.balances.cpRestants;
  else if (y > trackedY) aPrendre = acquisition(ctx, y - 1, enfantsACharge).jours;
  else aPrendre = 0;
  const p = cpPeriod(y);
  const pris = cpPrisEntre(ctx, p.from, at < p.to ? at : p.to).length;
  const reste = aPrendre - pris;
  return { enCours, aPrendre, pris, reste, depassement: reste < 0 };
}

/** Base du dixième : salaires nets (hors frais) de la période, indemnités de congés versées incluses */
export function baseDixieme(ctx: Ctx, y: number, enfants = 0): { base: number; manquants: Month[] } {
  return memo(ctx, `b10${y}|${enfants}`, () => {
    const p = cpPeriod(y);
    let base = 0;
    const manquants: Month[] = [];
    for (const m of monthsBetween(monthOf(p.from), monthOf(p.to))) {
      const b = monthBase(ctx, m);
      if (!b.active) continue;
      if (b.missing) manquants.push(m);
      base += b.net;
      if (!b.fromHistory) { const cp = cpForMonth(ctx, m, enfants); base += cp.indemnite + cp.complement; }
    }
    return { base, manquants };
  });
}

/** Maintien de salaire pour n jours ouvrables de congés */
export function maintien(ctx: Ctx, jours: number, at: ISODate = ctx.today): number {
  const c = termsAt(ctx.c, at);
  // Salaire d'une semaine, heures au-delà de 45 h majorées comme dans le salaire mensualisé
  const h = weeklyMinutes(c.planning);
  const semaine = Math.min(h, H45) * c.rateNet + Math.max(0, h - H45) * c.rateNet * (1 + c.majoration / 100);
  return Math.round(((jours / 6) * semaine) / 60);
}

export interface IndemniteCP {
  startYear: number;
  jours: number;
  dixieme: number;
  maintien: number;
  /** Indemnité retenue : la plus favorable */
  montant: number;
  methode: 'dixieme' | 'maintien';
  manquants: Month[];
}

export function indemnite(ctx: Ctx, y: number, enfants = 0): IndemniteCP {
  return memo(ctx, `ind${y}|${enfants}`, () => {
    const acq = acquisition(ctx, y, enfants);
    const { base, manquants } = baseDixieme(ctx, y, enfants);
    const dix = Math.round(base / 10);
    const mt = maintien(ctx, acq.jours, `${y + 1}-06-01`);
    return {
      startYear: y, jours: acq.jours, dixieme: dix, maintien: mt, montant: Math.max(dix, mt),
      methode: dix > mt ? 'dixieme' : 'maintien', manquants,
    };
  });
}

export interface CpMonth {
  /** Jours de congés payés indiqués sur la déclaration (année incomplète) */
  jours: number;
  /** Indemnité de congés versée ce mois (année incomplète) */
  indemnite: number;
  /** Complément du dixième versé en juin (année complète) */
  complement: number;
  note?: string;
}

/** Ce qui est dû ce mois-ci au titre des congés payés */
export function cpForMonth(ctx: Ctx, m: Month, enfants = 0): CpMonth {
  return memo(ctx, `cpm${m}|${enfants}`, () => {
    const { c } = ctx;
    const out: CpMonth = { jours: 0, indemnite: 0, complement: 0 };
    if (m < monthOf(c.trackedFrom)) return out;
    const y = cpPeriodStartYear(`${m}-15`);
    const prevY = y - 1;
    // Seules les périodes suivies par l'app sont calculées.
    if (prevY < cpPeriodStartYear(c.trackedFrom) || `${prevY + 1}-05-31` < c.start) return out;
    const ind = indemnite(ctx, prevY, enfants);
    if (ind.jours === 0) return out;
    const juin = `${y}-06` as Month;
    if (c.yearType === 'complete') {
      if (m === juin) {
        out.complement = Math.max(0, ind.dixieme - ind.maintien);
        if (out.complement) out.note = 'Complément du dixième (année complète), versé en juin.';
      }
      return out;
    }
    if (c.cpMode === 'juin') {
      if (m === juin) {
        out.jours = ind.jours;
        out.indemnite = ind.montant;
        out.note = 'Indemnité de congés payés versée en juin.';
      }
    } else if (c.cpMode === 'principale') {
      const p = cpPeriod(y);
      let best: { from: ISODate; n: number } | undefined;
      for (const l of ctx.leaves) {
        if (l.type !== 'cp' || l.to < p.from || l.from > p.to) continue;
        const n = joursOuvrables(l.from, l.to).length;
        if (!best || n > best.n) best = { from: l.from, n };
      }
      if (best && monthOf(best.from) === m) {
        out.jours = ind.jours;
        out.indemnite = ind.montant;
        out.note = 'Indemnité de congés payés versée avec la prise principale.';
      }
    } else {
      const p = cpPeriod(y);
      const before = m === monthOf(p.from) ? 0 : cpPrisEntre(ctx, p.from, lastOf(addMonths(m, -1))).length;
      const inMonth = cpPrisEntre(ctx, `${m}-01`, lastOf(m)).length;
      const total = Math.min(ind.jours, before + inMonth);
      const dejaPaye = Math.min(ind.jours, before);
      const n = total - dejaPaye;
      if (n > 0) {
        out.jours = n;
        out.indemnite = Math.round((ind.montant * total) / ind.jours) - Math.round((ind.montant * dejaPaye) / ind.jours);
        out.note = 'Indemnité de congés payés versée au fur et à mesure de la prise.';
      }
    }
    return out;
  });
}

function lastOf(m: Month): ISODate {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
}
