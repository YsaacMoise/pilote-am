// Moteur de paie d'un contrat d'assistante maternelle (CCN IDCC 3239). Montants en centimes entiers.
import {
  addDays, eachDay, firstDay, lastDay, minutes, monthOf, mondayOf, weekday, daysBetween, addMonthsToDate,
  type ISODate, type Month,
} from './dates';
import { holidayName, isMayDay } from './holidays';
import { entretienPlancher, netToBrut } from './rates';
import type { AmAbs, AmLeave, Contract, DayRec, Plage, Planning } from './model';

export interface Ctx {
  c: Contract;
  days: Map<ISODate, DayRec>;
  leaves: AmLeave[];
  today: ISODate;
  cache?: Map<string, unknown>;
}

export function makeCtx(c: Contract, recs: DayRec[], leaves: AmLeave[], today: ISODate): Ctx {
  const days = new Map<ISODate, DayRec>();
  for (const r of recs) if (r.cid === c.id) days.set(r.date, r);
  return { c, days, leaves, today, cache: new Map() };
}

function memo<T>(ctx: Ctx, key: string, f: () => T): T {
  if (!ctx.cache) ctx.cache = new Map();
  if (ctx.cache.has(key)) return ctx.cache.get(key) as T;
  const v = f();
  ctx.cache.set(key, v);
  return v;
}

export const H45 = 45 * 60;

export function plageMin(p: Plage): number {
  return Math.max(0, minutes(p.end) - minutes(p.start));
}

export function weeklyMinutes(pl: Planning): number {
  let t = 0;
  for (let d = 1; d <= 7; d++) for (const p of pl[d] ?? []) t += plageMin(p);
  return t;
}

export function daysPerWeek(pl: Planning): number {
  let n = 0;
  for (let d = 1; d <= 7; d++) if ((pl[d] ?? []).some((p) => plageMin(p) > 0)) n++;
  return n;
}

/** Heures mensualisées (en minutes) : hebdo × semaines ÷ 12 (art. 109) */
export function mensuelMinutes(c: Contract): number {
  return (weeklyMinutes(c.planning) * weeksPerYear(c)) / 12;
}

export function weeksPerYear(c: Contract): number {
  return c.yearType === 'complete' ? 52 : Math.min(46, c.weeks);
}

/** Salaire de base mensualisé (net, centimes). Les heures contractuelles au-delà de 45 h/semaine sont majorées. */
export function salaireMensualise(c: Contract): number {
  const h = weeklyMinutes(c.planning);
  const base = Math.min(h, H45) * c.rateNet + Math.max(0, h - H45) * c.rateNet * (1 + c.majoration / 100);
  return Math.round((base * weeksPerYear(c)) / 12 / 60);
}

export function joursMensualises(c: Contract): number {
  return Math.ceil((daysPerWeek(c.planning) * weeksPerYear(c)) / 12 - 1e-9);
}

export function inContract(c: Contract, d: ISODate): boolean {
  return d >= c.start && (!c.end || d <= c.end);
}

export function amLeaveOn(leaves: AmLeave[], d: ISODate): AmAbs | undefined {
  for (const l of leaves) if (d >= l.from && d <= l.to) return l.type;
  return undefined;
}

/** Plages prévues au planning ce jour-là (hors semaines sans accueil, hors contrat) */
export function plannedPlages(c: Contract, d: ISODate): Plage[] {
  if (!inContract(c, d)) return [];
  if (c.yearType === 'incomplete' && c.weeksOff.includes(mondayOf(d))) return [];
  return (c.planning[weekday(d)] ?? []).filter((p) => plageMin(p) > 0);
}

export type DayKind =
  | 'hors' // pas d'accueil prévu
  | 'prevu' // accueil prévu, rien à signaler (le planning fait foi)
  | 'present' // présence pointée
  | 'absent' // absence de l'enfant
  | 'am' // absence de l'AM
  | 'ferie'; // férié chômé

export interface DayInfo {
  date: ISODate;
  kind: DayKind;
  planned: Plage[];
  plannedMin: number;
  presentMin: number;
  /** Minutes au-delà du planning du jour */
  extraMin: number;
  ferie?: string;
  ferieTravaille: boolean;
  amLeave?: AmAbs;
  rec?: DayRec;
  /** Départ non pointé un jour passé */
  departOublie: boolean;
  /** En cours d'accueil (arrivée pointée aujourd'hui, pas encore de départ) */
  enCours: boolean;
  /** Absence retenue sur le salaire */
  deducted: boolean;
  /** Ce jour compte dans le diviseur (jour qui aurait été travaillé) */
  inDivisor: boolean;
}

export function dayInfo(ctx: Ctx, d: ISODate): DayInfo {
  return memo(ctx, 'day' + d, () => computeDay(ctx, d));
}

function computeDay(ctx: Ctx, d: ISODate): DayInfo {
  const { c } = ctx;
  const rec = ctx.days.get(d);
  const planned = plannedPlages(c, d);
  const plannedMin = planned.reduce((s, p) => s + plageMin(p), 0);
  const ferie = holidayName(d);
  const amLeave = inContract(c, d) ? amLeaveOn(ctx.leaves, d) : undefined;
  const info: DayInfo = {
    date: d, kind: 'hors', planned, plannedMin, presentMin: 0, extraMin: 0, ferie,
    ferieTravaille: !!rec?.ferieTravaille, amLeave, rec, departOublie: false, enCours: false,
    deducted: false, inDivisor: false,
  };
  if (!inContract(c, d)) return info;

  if (amLeave) {
    info.kind = 'am';
    if (plannedMin > 0) {
      // Congés payés : pas travaillé, hors diviseur. Autres absences de l'AM : retenue si non rémunérées.
      if (amLeave === 'am_malade' || amLeave === 'am_enfant_malade' || amLeave === 'sans_solde') {
        info.deducted = true;
        info.inDivisor = true;
      } else if (amLeave === 'evenement') {
        info.inDivisor = true;
      }
    }
    return info;
  }

  if (ferie && plannedMin > 0 && !rec?.ferieTravaille) {
    info.kind = 'ferie';
    return info;
  }

  if (rec?.abs) {
    info.kind = 'absent';
    if (plannedMin > 0) {
      info.inDivisor = true;
      if (rec.abs === 'sans_solde_enfant') info.deducted = true;
      if (rec.abs === 'malade_certif') info.deducted = sickDeductible(ctx).has(d);
    }
    return info;
  }

  const pres = (rec?.pres ?? []).filter((p) => p.a);
  if (plannedMin > 0) info.inDivisor = true;

  if (pres.length) {
    info.kind = 'present';
    let total = 0;
    let extra = 0;
    pres.forEach((p, i) => {
      const plage = planned[i];
      let dep = p.d;
      if (!dep) {
        if (d < ctx.today) {
          info.departOublie = true;
          dep = plage ? plage.end : p.a;
        } else {
          info.enCours = true;
          dep = plage ? plage.end : p.a; // provisoire
        }
      }
      const a = minutes(p.a!), b = minutes(dep!);
      if (b > a) total += b - a;
      if (plage) {
        extra += Math.max(0, minutes(plage.start) - a) + Math.max(0, b - minutes(plage.end));
      } else if (b > a) {
        extra += b - a;
      }
    });
    info.presentMin = total;
    info.extraMin = extra;
    return info;
  }

  if (plannedMin > 0) {
    // Pointage par exception : rien de saisi = le planning a été respecté.
    info.kind = 'prevu';
    info.presentMin = d <= ctx.today ? plannedMin : 0;
    return info;
  }
  return info;
}

/** Jours d'enfant malade avec certificat retenus (art. 105) : 5 jours par année de contrat,
 *  ou une seule absence continue jusqu'à 14 jours calendaires. Au-delà : rémunérés. */
export function sickDeductible(ctx: Ctx): Set<ISODate> {
  return memo(ctx, 'sick', () => {
    const { c } = ctx;
    const certDays = [...ctx.days.values()]
      .filter((r) => r.abs === 'malade_certif' && plannedPlages(c, r.date).length > 0)
      .map((r) => r.date)
      .sort();
    const out = new Set<ISODate>();
    // Épisodes : jours certifiés consécutifs, en sautant les jours sans accueil prévu.
    const episodes: ISODate[][] = [];
    for (const d of certDays) {
      const last = episodes.at(-1);
      if (last) {
        const prev = last.at(-1)!;
        let joined = true;
        for (let x = addDays(prev, 1); x < d; x = addDays(x, 1)) {
          if (plannedPlages(c, x).length > 0) { joined = false; break; }
        }
        if (joined) { last.push(d); continue; }
      }
      episodes.push([d]);
    }
    const yearState = new Map<number, { left: number; longUsed: boolean }>();
    const trackedYear = contractYearIndex(c, c.trackedFrom);
    for (const ep of episodes) {
      const y = contractYearIndex(c, ep[0]);
      let st = yearState.get(y);
      if (!st) {
        const used = y === trackedYear ? Math.min(5, c.balances.maladieDeduits) : 0;
        st = { left: 5 - used, longUsed: false };
        yearState.set(y, st);
      }
      if (st.longUsed) continue;
      if (ep.length <= st.left) {
        ep.forEach((d) => out.add(d));
        st.left -= ep.length;
      } else if (st.left === 5) {
        // Une seule longue absence : retenue sur 14 jours calendaires consécutifs au plus.
        const limit = addDays(ep[0], 13);
        ep.filter((d) => d <= limit).forEach((d) => out.add(d));
        st.longUsed = true;
        st.left = 0;
      } else {
        ep.slice(0, st.left).forEach((d) => out.add(d));
        st.left = 0;
      }
    }
    return out;
  });
}

export function contractYearIndex(c: Contract, d: ISODate): number {
  let i = 0;
  while (addMonthsToDate(c.start, 12 * (i + 1)) <= d) i++;
  return i;
}

/** Heures complémentaires et majorées, calculées par semaine (art. 96 et 110) */
export function weekOvertime(ctx: Ctx, monday: ISODate): Map<ISODate, { compl: number; maj: number }> {
  return memo(ctx, 'wk' + monday, () => {
    const out = new Map<ISODate, { compl: number; maj: number }>();
    let cum = weeklyMinutes(ctx.c.planning);
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      const di = dayInfo(ctx, d);
      const extra = di.extraMin;
      if (!extra) continue;
      const roomBefore45 = Math.max(0, H45 - cum);
      const compl = Math.min(extra, roomBefore45);
      out.set(d, { compl, maj: extra - compl });
      cum += extra;
    }
    return out;
  });
}

export interface MonthBase {
  month: Month;
  active: boolean;
  /** Mois avant le suivi par l'app */
  fromHistory: boolean;
  missing: boolean;
  salaireMens: number;
  mensuelMin: number;
  divisorDays: number;
  divisorMin: number;
  contractDays: number;
  contractMin: number;
  deductedDays: number;
  deductedMin: number;
  paidFraction: number;
  /** Salaire de base après proratisation et retenues */
  base: number;
  retenue: number;
  heuresNormales: number;
  joursActivite: number;
  complMin: number;
  majMin: number;
  complAmount: number;
  majAmount: number;
  ferieAmount: number;
  ferieDays: ISODate[];
  presenceDays: number;
  extraDays: number;
  entretien: number;
  repas: number;
  km: number;
  /** Salaire net hors congés payés */
  net: number;
  brut?: number;
  alerts: string[];
  forgotten: ISODate[];
  sickPaidNotice: boolean;
}

export function monthBase(ctx: Ctx, m: Month): MonthBase {
  return memo(ctx, 'mb' + m, () => computeMonthBase(ctx, m));
}

function emptyBase(m: Month): MonthBase {
  return {
    month: m, active: false, fromHistory: false, missing: false, salaireMens: 0, mensuelMin: 0, divisorDays: 0,
    divisorMin: 0, contractDays: 0, contractMin: 0, deductedDays: 0, deductedMin: 0, paidFraction: 0, base: 0,
    retenue: 0, heuresNormales: 0, joursActivite: 0, complMin: 0, majMin: 0, complAmount: 0, majAmount: 0,
    ferieAmount: 0, ferieDays: [], presenceDays: 0, extraDays: 0, entretien: 0, repas: 0, km: 0, net: 0,
    alerts: [], forgotten: [], sickPaidNotice: false,
  };
}

function computeMonthBase(ctx: Ctx, m: Month): MonthBase {
  const { c } = ctx;
  const r = emptyBase(m);
  const from = firstDay(m), to = lastDay(m);
  if (c.start > to || (c.end && c.end < from)) return r;
  r.active = true;

  if (m < monthOf(c.trackedFrom)) {
    r.fromHistory = true;
    const h = c.history.find((x) => x.month === m);
    if (!h) { r.missing = true; return r; }
    r.net = h.net;
    r.base = h.net;
    r.brut = h.brut;
    r.heuresNormales = h.heures ?? 0;
    r.joursActivite = h.jours ?? 0;
    r.entretien = h.entretien ?? 0;
    return r;
  }

  const smens = salaireMensualise(c);
  r.salaireMens = smens;
  r.mensuelMin = mensuelMinutes(c);
  const complete = c.yearType === 'complete';

  // Diviseur : jours (ou heures) qui auraient été travaillés sur le mois entier, d'après le planning.
  const allDays = eachDay(from, to);
  const startsOrEndsInMonth = c.start > from || (!!c.end && c.end < to);
  // Pour le mois entier on simule un contrat actif tout le mois.
  const full: Contract = { ...c, start: from < c.start ? from : c.start, end: undefined };
  const fullCtx: Ctx = { ...ctx, c: full, cache: new Map() };
  let fullDays = 0, fullMin = 0;
  for (const d of allDays) {
    const di = startsOrEndsInMonth ? dayInfo(fullCtx, d) : dayInfo(ctx, d);
    if (di.inDivisor) { fullDays++; fullMin += di.plannedMin; }
  }
  r.divisorDays = fullDays;
  r.divisorMin = fullMin;

  let cDays = 0, cMin = 0, dedDays = 0, dedMin = 0;
  const forgotten: ISODate[] = [];
  for (const d of allDays) {
    if (!inContract(c, d)) continue;
    const di = dayInfo(ctx, d);
    if (di.inDivisor) { cDays++; cMin += di.plannedMin; }
    if (di.deducted) { dedDays++; dedMin += di.plannedMin; }
    if (di.departOublie) forgotten.push(d);
    if (di.rec?.abs === 'malade_certif' && !di.deducted && di.plannedMin > 0) r.sickPaidNotice = true;
    if (di.kind === 'present' || di.kind === 'prevu') {
      if (di.presentMin > 0) {
        r.presenceDays++;
        if (di.plannedMin === 0) r.extraDays++;
        r.entretien += Math.max(c.entretienJour, entretienPlancher(d, di.presentMin));
        const nbRepas = di.rec?.repas ?? c.repasParJour;
        r.repas += nbRepas * c.repasPrix;
      }
      if (di.ferie && di.ferieTravaille && di.presentMin > 0) {
        const pct = isMayDay(d) ? 100 : 10;
        r.ferieAmount += Math.round((di.presentMin * c.rateNet * pct) / 100 / 60);
        r.ferieDays.push(d);
      }
    }
    if (di.rec?.km) r.km += Math.round(di.rec.km * c.kmTaux);
  }
  r.contractDays = cDays;
  r.contractMin = cMin;
  r.deductedDays = dedDays;
  r.deductedMin = dedMin;
  r.forgotten = forgotten;

  // Méthode des heures (année complète) ou des jours (année incomplète) — art. 111.
  let fraction: number;
  if (complete) fraction = fullMin > 0 ? (cMin - dedMin) / fullMin : startsOrEndsInMonth ? 0 : 1;
  else fraction = fullDays > 0 ? (cDays - dedDays) / fullDays : startsOrEndsInMonth ? 0 : 1;
  fraction = Math.max(0, Math.min(1, fraction));
  // Mois complet sans absence retenue : salaire mensualisé intégral.
  if (!startsOrEndsInMonth && dedDays === 0) fraction = 1;
  r.paidFraction = fraction;
  r.base = Math.round(smens * fraction);
  const prorataOnly = startsOrEndsInMonth
    ? Math.round(smens * Math.min(1, complete ? (fullMin ? cMin / fullMin : 0) : fullDays ? cDays / fullDays : 0))
    : smens;
  r.retenue = Math.max(0, prorataOnly - r.base);

  r.heuresNormales = Math.round((r.mensuelMin * fraction) / 60);
  if (startsOrEndsInMonth) r.joursActivite = Math.max(0, cDays - dedDays) + r.extraDays;
  else r.joursActivite = Math.max(0, joursMensualises(c) - dedDays) + r.extraDays;

  // Heures en plus, par semaine, rattachées au mois du jour.
  const weeks = new Set(allDays.filter((d) => inContract(c, d)).map(mondayOf));
  for (const mon of weeks) {
    for (const [d, v] of weekOvertime(ctx, mon)) {
      if (monthOf(d) !== m || !inContract(c, d)) continue;
      r.complMin += v.compl;
      r.majMin += v.maj;
    }
  }
  r.complAmount = Math.round((r.complMin * c.rateNet) / 60);
  r.majAmount = Math.round((r.majMin * c.rateNet * (100 + c.majoration)) / 100 / 60);

  r.net = r.base + r.complAmount + r.majAmount + r.ferieAmount;
  if (forgotten.length) r.alerts.push(`${forgotten.length} départ${forgotten.length > 1 ? 's' : ''} non pointé${forgotten.length > 1 ? 's' : ''} : l’heure prévue a été retenue.`);
  if (r.sickPaidNotice) r.alerts.push('Des jours d’enfant malade dépassent la limite de l’article 105 : ils restent payés.');
  return r;
}

export function monthBrut(ctx: Ctx, m: Month): number {
  const b = monthBase(ctx, m);
  if (b.brut) return b.brut;
  return netToBrut(b.net, lastDay(m));
}

export function dayCountLabel(n: number): string {
  return `${n} jour${n > 1 ? 's' : ''}`;
}

export { daysBetween };
