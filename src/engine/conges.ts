// Congés payés (art. 48 et 102) : acquisition, compteur, indemnité.
import { addDays, addMonths, cpPeriod, cpPeriodStartYear, daysBetween, eachDay, monthOf, monthsBetween, weekday, type ISODate, type Month } from './dates';
import { holidayName } from './holidays';
import { H45, makeCtx, monthBase, termsAt, weeklyMinutes, weeksPerYear, type Ctx } from './payroll';
import type { Contract } from './model';

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
  // Un avenant peut changer le type d'année : chaque morceau est compté selon ses propres conditions.
  const cuts = [...new Set((c.avenants ?? []).map((x) => x.from).filter((d) => d > a && d <= b))].sort();
  const bounds = [a, ...cuts];
  let total = 0;
  bounds.forEach((s, i) => {
    const e = i + 1 < bounds.length ? addDays(bounds[i + 1], -1) : b;
    const t = termsAt(c, s);
    const days = daysBetween(s, e) + 1;
    if (t.yearType === 'complete') { total += days / 7; return; }
    // Année incomplète : semaines programmées au prorata de la période de référence (365 ou 366 jours)
    const p = cpPeriod(cpPeriodStartYear(s));
    const periodDays = daysBetween(p.from, p.to) + 1;
    total += (Math.min(days, periodDays) / periodDays) * weeksPerYear(t);
  });
  return total;
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

/** Jours restant à prendre au titre de la période de référence `y` (droits acquis la période précédente) */
export function droitsAPrendre(ctx: Ctx, y: number, enfantsACharge = ctx.enfants ?? 0): number {
  const trackedY = cpPeriodStartYear(ctx.c.trackedFrom);
  if (y === trackedY) return ctx.c.balances.cpRestants;
  if (y > trackedY) return acquisition(ctx, y - 1, enfantsACharge).jours;
  return 0;
}

/**
 * Jours de congés payés pris au-delà des droits acquis (C-004), période de référence par période de référence.
 * Les droits sont consommés dans l'ordre chronologique : les premiers jours ouvrables pris sont payés,
 * les suivants deviennent des congés sans solde.
 */
export function cpExces(ctx: Ctx): Set<ISODate> {
  return memo(ctx, `cpx|${ctx.enfants ?? 0}`, () => {
    const out = new Set<ISODate>();
    const cpLeaves = ctx.leaves.filter((l) => l.type === 'cp');
    if (!cpLeaves.length) return out;
    const years = new Set<number>();
    for (const l of cpLeaves) for (const d of eachDay(l.from, l.to)) years.add(cpPeriodStartYear(d));
    for (const y of years) {
      if (y < cpPeriodStartYear(ctx.c.trackedFrom)) continue;
      const p = cpPeriod(y);
      // Le solde de départ est celui qui reste au début du suivi : les congés pris avant n'y sont pas imputés (bug A).
      const pris = cpPrisEntre(ctx, debutDecompte(ctx, y), p.to);
      // Un solde fractionnaire (2,5 jours) est arrondi au jour supérieur, en faveur de l'AM.
      const droits = Math.max(0, Math.ceil(droitsAPrendre(ctx, y) - 1e-9));
      pris.slice(droits).forEach((d) => out.add(d));
    }
    return out;
  });
}

/** Début du décompte des congés pris pour la période `y` : le début du suivi si le suivi commence dans cette période */
export function debutDecompte(ctx: Ctx, y: number): ISODate {
  const p = cpPeriod(y);
  const t = ctx.c.trackedFrom;
  return y === cpPeriodStartYear(t) && t > p.from ? t : p.from;
}

/**
 * Saisie simplifiée des soldes de départ (reprise d'un contrat en cours) : les droits sont calculés à partir de la date
 * de début du contrat (2,5 jours ouvrables par mois d'accueil, enfants à charge compris), en supposant aucune absence
 * non payée ; l'AM ne donne que les jours déjà pris depuis le dernier 1er juin.
 */
export function soldesDeDepart(c: Contract, trackedFrom: ISODate, prisDepuisJuin: number, enfants = 0): {
  droitsAnDernier: number; cpRestants: number; cpEnCours: number; depuis: ISODate;
} {
  const ctx = makeCtx({ ...c, trackedFrom: c.start, end: undefined }, [], [], trackedFrom, enfants);
  const y = cpPeriodStartYear(trackedFrom);
  const p = cpPeriod(y);
  const droitsAnDernier = c.start <= addDays(p.from, -1) ? acquisition(ctx, y - 1, enfants).jours : 0;
  const debut = c.start > p.from ? c.start : p.from;
  const cpEnCours = trackedFrom > debut ? Math.round((weeksIn(ctx, debut, addDays(trackedFrom, -1)) / 4) * 2.5 * 100) / 100 : 0;
  return { droitsAnDernier, cpRestants: Math.max(0, droitsAnDernier - Math.max(0, prisDepuisJuin)), cpEnCours, depuis: p.from };
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
  if (y === trackedY) aPrendre = Math.ceil(c.balances.cpRestants - 1e-9); // même arrondi que la paie (cpExces)
  else if (y > trackedY) aPrendre = acquisition(ctx, y - 1, enfantsACharge).jours;
  else aPrendre = 0;
  const p = cpPeriod(y);
  const pris = cpPrisEntre(ctx, debutDecompte(ctx, y), at < p.to ? at : p.to).length;
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
    if (termsAt(c, `${m}-01`).yearType === 'complete') {
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
