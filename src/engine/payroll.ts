// Moteur de paie d'un contrat d'assistante maternelle (CCN IDCC 3239). Montants en centimes entiers.
import {
  addDays, eachDay, firstDay, monthsBetween, lastDay, minutes, monthOf, mondayOf, weekday, daysBetween, addMonthsToDate,
  type ISODate, type Month,
} from './dates';
import { holidayName, isMayDay } from './holidays';
import { entretienPlancher, netToBrut } from './rates';
import { cpExces } from './conges';
import type { AmAbs, AmLeave, Contract, DayRec, Plage, Planning } from './model';

export interface Ctx {
  c: Contract;
  days: Map<ISODate, DayRec>;
  leaves: AmLeave[];
  today: ISODate;
  /** Enfants à charge de l'AM (2 jours de congés en plus chacun) : sert au contrôle des droits à congés (C-004) */
  enfants?: number;
  cache?: Map<string, unknown>;
}

/** Contrat tel qu'il s'applique le jour d (avenants en vigueur compris) */
export function termsAt(c: Contract, d: ISODate): Contract {
  if (!c.avenants?.length) return c;
  let out = c;
  for (const a of [...c.avenants].sort((x, y) => (x.from < y.from ? -1 : 1))) {
    if (a.from <= d) out = { ...out, ...a.changes };
  }
  return out;
}

export function makeCtx(c: Contract, recs: DayRec[], leaves: AmLeave[], today: ISODate, enfants = 0): Ctx {
  const days = new Map<ISODate, DayRec>();
  for (const r of recs) if (r.cid === c.id) days.set(r.date, r);
  return { c, days, leaves, today, enfants, cache: new Map() };
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

/** Part des heures mensualisées au-delà de 45 h par semaine (en minutes) : à déclarer en « heures majorées » (art. 96.4) */
export function mensuelMajoreesMinutes(c: Contract): number {
  return (Math.max(0, weeklyMinutes(c.planning) - H45) * weeksPerYear(c)) / 12;
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
  const t = termsAt(c, d);
  if (t.yearType === 'incomplete' && t.weeksOff.includes(mondayOf(d))) return [];
  return (t.planning[weekday(d)] ?? []).filter((p) => plageMin(p) > 0);
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
  /** Férié chômé non payé (absence de l'AM la veille ou le lendemain, art. 47) */
  ferieNonPaye?: boolean;
  /** Jour de congé payé pris au-delà des droits acquis : retenu comme congé sans solde (C-004) */
  cpSansDroits?: boolean;
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
      // Année complète : un jour de congé pris au-delà des droits acquis est un congé sans solde, donc retenu
      // (fiche DREETS Occitanie « Accueil sur 52 semaines » : 5 semaines « rémunérées ou prises sans solde en fonction des droits acquis »).
      if (amLeave === 'cp' && termsAt(c, d).yearType === 'complete' && cpExces(ctx).has(d)) {
        info.deducted = true;
        info.inDivisor = true;
        info.cpSansDroits = true;
      } else if (amLeave === 'am_malade' || amLeave === 'am_enfant_malade' || amLeave === 'sans_solde') {
        info.deducted = true;
        info.inDivisor = true;
      } else if (amLeave === 'evenement') {
        info.inDivisor = true;
      }
    }
    return info;
  }

  if (ferie && plannedMin > 0 && !rec?.ferieTravaille && !rec?.pres?.some((p) => p.a)) {
    info.kind = 'ferie';
    // Le férié chômé d'un jour habituellement travaillé compte dans le diviseur des retenues (C-006 ;
    // fiches DREETS Occitanie et DDETS 31 : « les jours fériés chômés correspondant à un jour habituellement travaillé »).
    info.inDivisor = true;
    // Art. 47 : payé si l'AM a travaillé le dernier jour prévu avant et le premier jour prévu après,
    // sauf absence autorisée au préalable (congés, événement familial, absence voulue par les parents).
    if (!d.endsWith('-05-01') && ferieNonPaye(ctx, d)) { info.deducted = true; info.ferieNonPaye = true; }
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
    // Les heures en plus = temps de présence hors des plages prévues (sans associer présence et plage par rang).
    for (const p of pres) {
      const a = minutes(p.a!);
      let dep = p.d;
      if (!dep) {
        const plage = planned.find((x) => minutes(x.end) > a);
        if (d < ctx.today) info.departOublie = true;
        else info.enCours = true;
        dep = plage ? plage.end : p.a;
      }
      const b = minutes(dep!);
      if (b <= a) continue;
      total += b - a;
      let overlap = 0;
      for (const x of planned) overlap += Math.max(0, Math.min(b, minutes(x.end)) - Math.max(a, minutes(x.start)));
      extra += b - a - overlap;
    }
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

const ABSENCES_NON_AUTORISEES: AmAbs[] = ['am_malade', 'am_enfant_malade'];

function jourPrevuVoisin(ctx: Ctx, d: ISODate, sens: 1 | -1): ISODate | undefined {
  const { c } = ctx;
  for (let i = 1, x = addDays(d, sens); i <= 14; i++, x = addDays(x, sens)) {
    if (!inContract(c, x)) return undefined;
    if (plannedPlages(c, x).length === 0) continue;
    if (holidayName(x) && !ctx.days.get(x)?.ferieTravaille) continue;
    return x;
  }
  return undefined;
}

/** Férié chômé non payé : absence non autorisée de l'AM le jour prévu juste avant ou juste après */
export function ferieNonPaye(ctx: Ctx, d: ISODate): boolean {
  for (const sens of [-1, 1] as const) {
    const x = jourPrevuVoisin(ctx, d, sens);
    const abs = x ? amLeaveOn(ctx.leaves, x) : undefined;
    if (abs && ABSENCES_NON_AUTORISEES.includes(abs)) return true;
  }
  return false;
}

/** Jours d'enfant malade avec certificat retenus (art. 105) : par période de 12 mois depuis le début du contrat,
 *  5 jours consécutifs ou non, et une absence de 14 jours calendaires consécutifs. Au-delà : rémunérés. */
export function sickDeductible(ctx: Ctx): Set<ISODate> {
  return memo(ctx, 'sick', () => {
    const { c } = ctx;
    const certDays = [...ctx.days.values()]
      .filter((r) => r.abs === 'malade_certif' && plannedPlages(c, r.date).length > 0 && !amLeaveOn(ctx.leaves, r.date)
        && !(holidayName(r.date) && !r.ferieTravaille))
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
      // Les deux limites se cumulent : 5 jours d'absences courtes « et » une absence de 14 jours calendaires consécutifs
      // Absence courte : 5 jours prévus au plus. Absence longue : au-delà, une fois par période.
      if (ep.length <= st.left) {
        ep.forEach((d) => out.add(d));
        st.left -= ep.length;
      } else if (ep.length > 5 && !st.longUsed) {
        // L'absence longue : retenue sur 14 jours calendaires consécutifs au plus, sans entamer les 5 jours.
        const limit = addDays(ep[0], 13);
        ep.filter((d) => d <= limit).forEach((d) => out.add(d));
        st.longUsed = true;
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
    // Base de la semaine : heures prévues dans le contrat cette semaine-là (hors semaines sans accueil, hors contrat).
    let cum = 0;
    for (let i = 0; i < 7; i++) cum += plannedPlages(ctx.c, addDays(monday, i)).reduce((s, p) => s + plageMin(p), 0);
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
  /** Heures en plus occasionnelles au-delà de 45 h (payées en plus du salaire mensualisé) */
  majMin: number;
  /** Heures du contrat au-delà de 45 h, mensualisées et proratisées (déjà dans le salaire de base) */
  majContratMin: number;
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
  /** Régularisation versée avec un avenant (année incomplète qui se termine) */
  regulAvenant?: number;
  /** Heures normales non arrondies (minutes) */
  normalesMin?: number;
  /** Périodes du mois quand un avenant tombe en cours de mois */
  segments?: { from: ISODate; salaireMens: number; base: number }[];
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
    retenue: 0, heuresNormales: 0, joursActivite: 0, complMin: 0, majMin: 0, majContratMin: 0, complAmount: 0, majAmount: 0,
    ferieAmount: 0, ferieDays: [], presenceDays: 0, extraDays: 0, entretien: 0, repas: 0, km: 0, net: 0,
    alerts: [], forgotten: [], sickPaidNotice: false,
  };
}

/** Dates d'avenant qui tombent après le 1er du mois (le mois est alors coupé en périodes) */
export function avenantCuts(c: Contract, m: Month): ISODate[] {
  const from = firstDay(m), to = lastDay(m);
  return [...new Set((c.avenants ?? []).map((a) => a.from).filter((d) => d > from && d <= to))].sort();
}

function computeMonthBase(ctx: Ctx, m: Month): MonthBase {
  const c0 = ctx.c;
  const from = firstDay(m), to = lastDay(m);
  if (c0.start > to || (c0.end && c0.end < from) || m < monthOf(c0.trackedFrom)) return computeRange(ctx, m, from, to);
  const cuts = avenantCuts(c0, m);
  if (!cuts.length) { const r = computeRange(ctx, m, from, to); applyAvenantRegul(ctx, m, r); return r; }
  // Avenant en cours de mois : chaque période est calculée comme un mois d'entrée ou de sortie (prorata), puis additionnée.
  const bounds = [from, ...cuts];
  const parts = bounds.map((a, i) => computeRange(ctx, m, a, i + 1 < bounds.length ? addDays(bounds[i + 1], -1) : to)).filter((p) => p.active);
  const r = mergeParts(m, parts, cuts);
  applyAvenantRegul(ctx, m, r, parts[0]);
  return r;
}

/** Avenant qui change le type d'année (complète ↔ incomplète) : seul cas où la période de régularisation est coupée */
export function changeTypeAnnee(c: Contract, from: ISODate): boolean {
  return termsAt(c, addDays(from, -1)).yearType !== termsAt(c, from).yearType;
}

/**
 * Début de la période à régulariser qui se termine la veille de `until` : embauche (ou début du suivi),
 * ou dernier avenant qui a changé le type d'année. Les autres avenants (taux, entretien, planning) ne coupent
 * plus la période (C-001, art. 109.2 : régularisations annuelles prévisionnelles sans règlement, paiement en fin de contrat).
 */
export function regulStart(c: Contract, until: ISODate): ISODate {
  let s = c.trackedFrom > c.start ? c.trackedFrom : c.start;
  for (const a of c.avenants ?? []) if (a.from < until && a.from > s && changeTypeAnnee(c, a.from)) s = a.from;
  return s;
}

/** Toutes les semaines sans accueil connues : contrat de départ et avenants (relecture contradictoire, bug C) */
export function toutesSemainesSansAccueil(c: Contract): Set<ISODate> {
  const out = new Set<ISODate>(c.weeksOff);
  for (const a of c.avenants ?? []) for (const w of a.changes.weeksOff ?? []) out.add(w);
  return out;
}

/** Semaines sans accueil attendues et saisies pour l'année de contrat qui commence le `debutAnnee` */
export function semainesSansAccueilAnnee(c: Contract, debutAnnee: ISODate): { attendu: number; saisies: number } {
  const t = termsAt(c, debutAnnee);
  const fin = addDays(addMonthsToDate(debutAnnee, 12), -1);
  const saisies = [...toutesSemainesSansAccueil(c)].filter((w) => w >= mondayOf(debutAnnee) && w <= fin).length;
  return { attendu: t.yearType === 'incomplete' ? Math.max(0, 52 - Math.min(46, t.weeks)) : 0, saisies };
}

/**
 * Semaines sans accueil manquantes (année incomplète, C-002) sur les années de contrat entièrement comprises
 * entre `from` (début de la période à régulariser) et `until`. Une année entamée avant `from` (suivi commencé en
 * cours d'année) ou pas encore terminée n'est pas exigée : les semaines peuvent être communiquées plus tard
 * (art. 98.1.2), l'app le signale par une alerte au lieu de bloquer.
 */
export function semainesSansAccueilManquantes(c: Contract, from: ISODate, until: ISODate): number {
  let manque = 0;
  for (let i = 0; ; i++) {
    const a = addMonthsToDate(c.start, 12 * i);
    const b = addDays(addMonthsToDate(c.start, 12 * (i + 1)), -1);
    if (a > until || (c.end && a > c.end) || b > until) break;
    if (a < from) continue;
    const { attendu, saisies } = semainesSansAccueilAnnee(c, a);
    manque += Math.max(0, attendu - saisies);
  }
  return manque;
}

/** Minutes prévues au planning type du contrat ce jour-là, sans tenir compte des semaines sans accueil, absences ni fériés */
export function planningBrutMin(t: Contract, d: ISODate): number {
  return (t.planning[weekday(d)] ?? []).reduce((s, p) => s + plageMin(p), 0);
}

/**
 * Régularisation (année incomplète, art. 109.2) : salaire des heures prévues réellement dues (hors absences retenues),
 * chacune au taux de son jour, moins le salaire de base versé par la mensualisation sur [from, to].
 * `cur` donne le salaire de base du mois en cours de calcul (évite la récursion).
 */
export function regularisation(ctx: Ctx, from: ISODate, to: ISODate, cur?: { m: Month; payees: number }): { minutes: number; montant: number } {
  const c = ctx.c;
  if (to < from) return { minutes: 0, montant: 0 };
  let dues = 0, payees = 0;
  for (const d of eachDay(from, to)) {
    const di = dayInfo(ctx, d);
    if (di.inDivisor && !di.deducted) dues += (di.plannedMin * termsAt(c, d).rateNet) / 60;
  }
  for (const m of monthsBetween(monthOf(from), monthOf(to))) {
    if (cur && m === cur.m) { payees += cur.payees; continue; }
    const b = monthBase(ctx, m);
    if (!b.active || b.fromHistory) continue;
    if (m === monthOf(from) && from > c.start && from.slice(8) !== '01') {
      // Mois entamé : seule la part postérieure au début de la période compte.
      let part = 0;
      for (const d of eachDay(from, lastDay(m))) if (inContract(c, d)) part += planningBrutMin(termsAt(c, d), d);
      payees += (b.base * part) / (b.contractMin || 1);
    } else {
      payees += b.base;
    }
  }
  const montant = Math.max(0, Math.round(dues - payees));
  const taux = termsAt(c, to).rateNet;
  return { minutes: taux ? Math.round((montant * 60) / taux) : 0, montant };
}

/**
 * Régularisation versée le mois d'un avenant qui fait passer de l'année incomplète à l'année complète (fiche DDETS 31, 2021).
 * Les autres avenants ne déclenchent plus de régularisation (C-001) : elle se fait en fin de contrat.
 */
function applyAvenantRegul(ctx: Ctx, m: Month, r: MonthBase, firstPart?: MonthBase) {
  const c = ctx.c;
  for (const a of c.avenants ?? []) {
    if (monthOf(a.from) !== m || a.from <= c.start || a.from <= c.trackedFrom) continue;
    const veille = addDays(a.from, -1);
    if (termsAt(c, veille).yearType !== 'incomplete' || termsAt(c, a.from).yearType !== 'complete') continue;
    const manque = semainesSansAccueilManquantes(c, regulStart(c, a.from), veille);
    if (manque > 0) {
      r.alerts.push(`Régularisation à l’avenant non calculée : il manque ${manque} semaine${manque > 1 ? 's' : ''} sans accueil dans le contrat.`);
      continue;
    }
    const start = regulStart(c, a.from);
    const cur = a.from.slice(8) !== '01' && firstPart ? { m, payees: firstPart.base } : undefined;
    const reg = regularisation(ctx, start, veille, cur);
    if (reg.montant > 0) {
      r.regulAvenant = (r.regulAvenant ?? 0) + reg.montant;
      r.net += reg.montant;
      r.alerts.push(`Régularisation à l’avenant du ${a.from.slice(8, 10)}/${a.from.slice(5, 7)} : ${hoursMin(reg.minutes)} accueillies depuis le ${start.split('-').reverse().join('/')} et pas encore payées.`);
    }
  }
}

function hoursMin(min: number): string {
  const h = Math.floor(min / 60), mm = min % 60;
  return mm ? `${h} h ${String(mm).padStart(2, '0')}` : `${h} h`;
}

const SUM_KEYS = ['base', 'retenue', 'majContratMin', 'joursActivite', 'complMin', 'majMin', 'complAmount', 'majAmount', 'ferieAmount',
  'presenceDays', 'extraDays', 'entretien', 'repas', 'km', 'net', 'contractDays', 'contractMin', 'deductedDays', 'deductedMin', 'normalesMin'] as const;

function mergeParts(m: Month, parts: MonthBase[], cuts: ISODate[]): MonthBase {
  const r = emptyBase(m);
  if (!parts.length) return r;
  r.active = true;
  for (const p of parts) {
    for (const k of SUM_KEYS) (r as any)[k] = ((r as any)[k] ?? 0) + ((p as any)[k] ?? 0);
    r.ferieDays.push(...p.ferieDays);
    r.forgotten.push(...p.forgotten);
    for (const a of p.alerts) if (!r.alerts.includes(a)) r.alerts.push(a);
    r.sickPaidNotice ||= p.sickPaidNotice;
    // Heures payées par la mensualisation (sert à la régularisation)
    r.mensuelMin += p.mensuelMin * p.paidFraction;
  }
  const last = parts[parts.length - 1];
  r.salaireMens = last.salaireMens;
  r.divisorDays = last.divisorDays;
  r.divisorMin = last.divisorMin;
  r.paidFraction = 1;
  r.heuresNormales = Math.round((r.normalesMin ?? 0) / 60);
  r.segments = parts.map((p, i) => ({ from: i === 0 ? firstDay(m) : cuts[i - 1], salaireMens: p.salaireMens, base: p.base }));
  r.alerts.unshift(`Avenant au ${cuts.map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`).join(', ')} : le salaire du mois est calculé au prorata de chaque période.`);
  return r;
}

function computeRange(ctx: Ctx, m: Month, segFrom: ISODate, segTo: ISODate): MonthBase {
  // Conditions en vigueur au début de la période.
  const c = termsAt(ctx.c, segFrom);
  const r = emptyBase(m);
  const from = firstDay(m), to = lastDay(m);
  if (c.start > segTo || (c.end && c.end < segFrom)) return r;
  r.active = true;
  const inSeg = (d: ISODate) => inContract(c, d) && d >= segFrom && d <= segTo;

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

  // Diviseur de l'article 111 : heures (ou jours) du planning type sur tout le mois. « Les périodes d'absence,
  // les semaines de non-accueil ainsi que les jours fériés chômés correspondant à un jour habituellement travaillé
  // sont comptabilisés » (CCN 2021, art. 111 ; fiches DREETS Occitanie et DDETS 31).
  const allDays = eachDay(from, to);
  const startsOrEndsInMonth = c.start > from || (!!c.end && c.end < to) || segFrom > from || segTo < to;
  let fullDays = 0, fullMin = 0, segDays = 0, segMin = 0;
  for (const d of allDays) {
    const x = planningBrutMin(c, d);
    if (x <= 0) continue;
    fullDays++; fullMin += x;
    if (inSeg(d)) { segDays++; segMin += x; }
  }
  r.divisorDays = fullDays;
  r.divisorMin = fullMin;

  let cDays = 0, cMin = 0, dedDays = 0, dedMin = 0, actDays = 0, cpSansDroits = 0;
  const forgotten: ISODate[] = [];
  for (const d of allDays) {
    if (!inSeg(d)) continue;
    const di = dayInfo(ctx, d);
    if (di.inDivisor) { cDays++; cMin += di.plannedMin; }
    if (di.deducted) { dedDays++; dedMin += di.plannedMin; }
    // Jours d'activité (Pajemploi) : jours prévus et payés, sans les fériés chômés.
    if (di.inDivisor && !di.deducted && di.kind !== 'ferie') actDays++;
    if (di.cpSansDroits) cpSansDroits++;
    if (di.departOublie) forgotten.push(d);
    if (di.ferieNonPaye) r.alerts.push(`Férié du ${d.slice(8, 10)}/${d.slice(5, 7)} non payé : tu étais absente le jour prévu juste avant ou juste après (article 47 de la convention).`);
    if (di.rec?.abs === 'malade_certif' && !di.deducted && di.plannedMin > 0) r.sickPaidNotice = true;
    if (di.kind === 'present' || di.kind === 'prevu') {
      if (di.presentMin > 0) {
        r.presenceDays++;
        if (di.plannedMin === 0) r.extraDays++;
        r.entretien += Math.max(c.entretienJour, entretienPlancher(d, di.presentMin));
        const nbRepas = di.rec?.repas ?? c.repasParJour;
        r.repas += nbRepas * c.repasPrix;
      }
      if (di.ferie && (di.ferieTravaille || di.kind === 'present') && di.presentMin > 0) {
        const pct = isMayDay(d) ? 100 : 10;
        r.ferieAmount += Math.round((di.presentMin * c.rateNet * pct) / 100 / 60);
        r.ferieDays.push(d);
      }
    }
    if (di.rec?.km) r.km += Math.round(di.rec.km * c.kmTaux);
  }
  // Jours (heures) de la période payés par la mensualisation, avant retenues
  r.contractDays = segDays;
  r.contractMin = segMin;
  r.deductedDays = dedDays;
  r.deductedMin = dedMin;
  r.forgotten = forgotten;

  // Méthode des heures (année complète) ou des jours (année incomplète) — art. 111.
  let fraction: number;
  if (complete) fraction = fullMin > 0 ? (segMin - dedMin) / fullMin : startsOrEndsInMonth ? 0 : 1;
  else fraction = fullDays > 0 ? (segDays - dedDays) / fullDays : startsOrEndsInMonth ? 0 : 1;
  fraction = Math.max(0, Math.min(1, fraction));
  // Mois complet sans absence retenue : salaire mensualisé intégral.
  if (!startsOrEndsInMonth && dedDays === 0) fraction = 1;
  r.paidFraction = fraction;
  r.base = Math.round(smens * fraction);
  const prorataOnly = startsOrEndsInMonth
    ? Math.round(smens * Math.min(1, complete ? (fullMin ? segMin / fullMin : 0) : fullDays ? segDays / fullDays : 0))
    : smens;
  r.retenue = Math.max(0, prorataOnly - r.base);

  // Pajemploi : les heures du contrat au-delà de 45 h/semaine vont en « heures majorées », pas en heures normales.
  const majContrat = mensuelMajoreesMinutes(c);
  r.normalesMin = (r.mensuelMin - majContrat) * fraction;
  r.heuresNormales = Math.round(r.normalesMin / 60);
  r.majContratMin = Math.round(majContrat * fraction);
  if (startsOrEndsInMonth) r.joursActivite = actDays + r.extraDays;
  else r.joursActivite = Math.max(0, joursMensualises(c) - dedDays) + r.extraDays;
  if (cpSansDroits) {
    r.alerts.push(`${dayCountLabel(cpSansDroits)} de congés pris au-delà de tes droits acquis : retenu${cpSansDroits > 1 ? 's' : ''} comme congés sans solde. Si ton solde de congés au début du suivi est faux, corrige-le dans le contrat ; si les parents ont accepté par écrit des congés par anticipation, signale-le avec « Ça coince ».`);
  }
  if (c.yearType === 'incomplete') {
    const manque = semainesSansAccueilManquantes(ctx.c, regulStart(ctx.c, addDays(segTo, 1)), segTo);
    if (manque > 0) r.alerts.push(`Année incomplète : il manque ${manque} semaine${manque > 1 ? 's' : ''} sans accueil dans le contrat. Tant qu’elles ne sont pas saisies, la régularisation de fin de contrat n’est pas calculée.`);
  }

  // Heures en plus, par semaine, rattachées au mois du jour.
  const weeks = new Set(allDays.filter(inSeg).map(mondayOf));
  for (const mon of weeks) {
    for (const [d, v] of weekOvertime(ctx, mon)) {
      if (monthOf(d) !== m || !inSeg(d)) continue;
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
