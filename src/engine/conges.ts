// Congés payés (art. 48 et 102) : acquisition, compteur, indemnité.
import { addDays, addMonths, addMonthsToDate, cpPeriod, cpPeriodStartYear, daysBetween, eachDay, mondayOf, monthOf, monthsBetween, weekday, type ISODate, type Month } from './dates';
import { holidayName } from './holidays';
import { ferieDe, regionDe } from './regions';
import {
  H45, daysPerWeek, inContract, makeCtx, monthBase, plannedPlages, planningBrutMin, semainesSansAccueilAnnee, termsAt,
  toutesSemainesSansAccueil, weeklyMinutes, weeksPerYear, type Ctx,
} from './payroll';
import type { AmLeave, Contract } from './model';
import { nonGeresContrat, nonGeresPeriode } from './nonGeres';
import { minutesPlanning, planningSemainePV, pvActif, semainesParAn } from './planningVariable';

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

function jjmm(d: ISODate): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

// ---------- Décompte des jours pris (R-CP-09) ----------
// « Le premier jour décompté est le premier jour ouvrable qui aurait dû être travaillé. On décompte chaque jour
// ouvrable jusqu'à la veille de la reprise. Un jour férié chômé n'est pas décompté. » CCN art. 48, 48.1.1.3 et 102.1.1 ;
// CASF D423-16 ; service-public.fr F31655. Cas officiels : C-CPA-18 (une semaine = 6 jours, 5 avec un jeudi férié) et
// C-CPI-03 (congés du 1er au 13 août 2022, pendant des semaines sans accueil : 12 jours ouvrables).
// « Aurait dû être travaillé » se lit sur le planning type du contrat : C-CPI-03 décompte 12 jours pour des congés
// pris pendant des semaines sans accueil.

/** Jour qui aurait dû être travaillé pour ce contrat : jour du planning type, dans le contrat, hors férié chômé */
function jourTravaille(ctx: Ctx, d: ISODate): boolean {
  const { c } = ctx;
  if (!inContract(c, d) || planningBrutMin(termsAt(c, d), d) <= 0) return false;
  return !ferieDe(regionDe(c), d) || !!ctx.days.get(d)?.ferieTravaille;
}

/** Jour ouvrable (lundi → samedi, hors fériés de la région, T-103 R1 et R4) */
const ouvrable = (region: ReturnType<typeof regionDe>, d: ISODate) => weekday(d) <= 6 && !ferieDe(region, d);

export interface DecompteCP {
  /** Congés saisis regroupés : un congé suivi d'un autre sans reprise entre les deux */
  from: ISODate;
  to: ISODate;
  leaves: AmLeave[];
  /** Premier jour décompté (premier jour ouvrable qui aurait dû être travaillé) */
  premier?: ISODate;
  /** Jour de reprise (premier jour qui aurait dû être travaillé après le congé) */
  reprise?: ISODate;
  /** Jours décomptés : du premier jour à la veille de la reprise */
  jours: ISODate[];
  /** T-103 (C17) : saisie contradictoire à corriger (autre absence pendant le congé) ; le mois attend la correction */
  demande?: string;
}

/** T-103 (C17) : congé payé et autre absence saisis sur les mêmes jours */
export const messageDoubleSaisieCP = (from: ISODate, to: ISODate): string =>
  `Congé du ${jjmm(from)} au ${jjmm(to)} : une autre absence est saisie sur les mêmes jours. Garde la bonne saisie et retire l’autre : l’app ne calcule pas ces jours tant que les deux restent.`;

/** Décompte de tous les congés payés de l'AM pour ce contrat (chaque employeur a son propre planning) */
export function decomptesCP(ctx: Ctx): DecompteCP[] {
  return memo(ctx, 'dcp', () => {
    const { c } = ctx;
    const cps = ctx.leaves.filter((l) => l.type === 'cp').sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
    const autres = ctx.leaves.filter((l) => l.type !== 'cp');
    const out: DecompteCP[] = [];
    let i = 0;
    while (i < cps.length) {
      const leaves = [cps[i]];
      const from = cps[i].from;
      let to = cps[i].to;
      i++;
      // Reprise : premier jour qui aurait dû être travaillé après le congé. Un congé qui commence avant la reprise
      // prolonge le premier (pas de reprise entre les deux).
      let reprise: ISODate | undefined;
      let finContrat = false;
      let x = addDays(to, 1);
      for (let n = 0; n < 800; n++, x = addDays(x, 1)) {
        while (i < cps.length && cps[i].from <= x) {
          leaves.push(cps[i]);
          if (cps[i].to > to) to = cps[i].to;
          i++;
        }
        if (x <= to) continue;
        if (c.end && x > c.end) { finContrat = true; break; }
        if (x < c.start) continue;
        if (jourTravaille(ctx, x)) { reprise = x; break; }
      }
      const premier = eachDay(from, to).find((d) => jourTravaille(ctx, d) && weekday(d) <= 6);
      // T-103 (C16) : CCN 48.1.1.3, décompte « jusqu'au dernier jour ouvrable précédant le jour de la reprise » ; sans reprise
      // avant la fin du contrat, jusqu'à la fin du contrat (le reste est payé en indemnité compensatrice, CCN 67).
      const veille = reprise ? addDays(reprise, -1) : finContrat && c.end && c.end > to ? c.end : to;
      // T-103 (C15) : CCN 48.1.1.3, « les jours de congés payés qui coïncident avec la période de l'arrêt de travail ne sont
      // pas décomptés » : un jour d'arrêt maladie de l'AM saisi pendant le congé n'est pas un jour de congé.
      const malade = (d: ISODate) => autres.some((l) => l.type === 'am_malade' && d >= l.from && d <= l.to);
      const jours = premier && premier <= veille ? eachDay(premier, veille).filter((d) => ouvrable(regionDe(c), d) && inContract(c, d) && !malade(d)) : [];
      const b: DecompteCP = { from, to, leaves, premier, reprise, jours };
      // T-103 (C17) : une autre absence (enfant malade, sans solde, événement familial…) saisie sur un jour du congé : deux
      // saisies contradictoires. L'app demande laquelle garder (B), elle ne choisit pas.
      const autre = autres.find((l) => l.type !== 'am_malade' && l.from <= to && l.to >= from);
      if (autre) b.demande = messageDoubleSaisieCP(from, to);
      out.push(b);
    }
    return out;
  });
}

/** Décompte d'un congé saisi : ses jours décomptés pour ce contrat */
export function decompteConge(ctx: Ctx, leave: AmLeave): { jours: number; demande?: string } {
  for (const b of decomptesCP(ctx)) {
    const k = b.leaves.findIndex((l) => l.id === leave.id);
    if (k < 0) continue;
    // Les jours du groupe vont au dernier congé commencé avant eux.
    const debuts = b.leaves.map((l) => l.from);
    const n = b.jours.filter((d) => d >= leave.from && !debuts.some((f, j) => j !== k && f > leave.from && f <= d)).length;
    return { jours: n, demande: b.demande };
  }
  return { jours: 0 };
}

/** T-103 (C17) : saisies contradictoires des congés qui touchent [from, to] */
export function cpDemandesEntre(ctx: Ctx, from: ISODate, to: ISODate): string[] {
  const out: string[] = [];
  for (const b of decomptesCP(ctx)) {
    if (!b.demande) continue;
    const fin = b.reprise ? addDays(b.reprise, -1) : b.to;
    if (b.from <= to && fin >= from) out.push(b.demande);
  }
  return out;
}

// ---------- Acquisition ----------

export interface LectureCP {
  /** « semaines » : lecture Urssaf et DREETS Occitanie, comptée sur les jours d'accueil ; « mois » : DREETS Bourgogne-Franche-Comté */
  methode: 'semaines' | 'mois';
  /** Texte court pour l'AM */
  libelle: string;
  source: string;
  /** Jours acquis au 31 mai (ou à la fin du contrat), enfants à charge compris */
  jours: number;
  /** Jours acquis à date */
  joursADate: number;
  enfantsBonus: number;
}

/** Acquisition à confirmer (SUS-11 : année incomplète, méthode à trancher par la DDETS) */
export interface AcquisitionAConfirmer {
  message: string;
  /** Les deux lectures officielles (semaines et jours, mois), calculées quand l'app a toutes les données (vide sinon) */
  lectures: LectureCP[];
  /** Variantes de la formule en semaines (semaines civiles entières ; toute semaine avec de l'accueil) : contrôle seulement */
  controles?: number[];
  /** Pourquoi les lectures ne sont pas calculées */
  raison?: string;
}

export interface Acquisition {
  startYear: number;
  from: ISODate;
  to: ISODate;
  /**
   * Jours acquis (arrondis au supérieur, 30 au plus, enfants à charge compris). Si `aConfirmer` est rempli, ce nombre
   * n'est qu'une borne interne (la lecture la plus haute) : il ne doit jamais être affiché ni payé.
   */
  jours: number;
  /** Jours acquis à date (pour une période en cours) */
  joursADate: number;
  semaines: number;
  enfantsBonus: number;
  /** Année incomplète : nombre de jours à confirmer, avec les deux lectures officielles */
  aConfirmer?: AcquisitionAConfirmer;
}

/** Toutes les semaines sans accueil des années de contrat qui touchent [s, e] sont saisies (52 − N par année) */
function semainesToutesSaisies(c: Contract, s: ISODate, e: ISODate): boolean {
  if (!toutesSemainesSansAccueil(c).size) return false;
  for (let i = 0; ; i++) {
    const a = addMonthsToDate(c.start, 12 * i);
    if (a > e) break;
    const b = addDays(addMonthsToDate(c.start, 12 * (i + 1)), -1);
    if (b < s) continue;
    const { attendu, saisies } = semainesSansAccueilAnnee(c, a);
    if (saisies < attendu) return false;
  }
  return true;
}

/** Jours ouvrables de congés payés pris dans [s, e] pendant des semaines sans accueil, dans la limite des droits */
function cpAssimiles(ctx: Ctx, s: ISODate, e: ISODate, off: Set<ISODate>): number {
  return cpAssimilesJours(ctx, s, e, off).size;
}

/** Les mêmes jours, en dates (T-103, C10 : décompte de l'arrêt de 1980) */
function cpAssimilesJours(ctx: Ctx, s: ISODate, e: ISODate, off: Set<ISODate>): Set<ISODate> {
  const out = new Set<ISODate>();
  for (let y = cpPeriodStartYear(s); y <= cpPeriodStartYear(e); y++) {
    if (y < cpPeriodStartYear(ctx.c.trackedFrom)) continue;
    const p = cpPeriod(y);
    const droits = Math.max(0, Math.ceil(droitsAPrendre(ctx, y) - 1e-9));
    const payes = cpPrisEntre(ctx, debutDecompte(ctx, y), p.to).slice(0, droits);
    for (const d of payes) if (d >= s && d <= e && off.has(mondayOf(d))) out.add(d);
  }
  return out;
}

function weeksIn(ctx: Ctx, from: ISODate, to: ISODate): number {
  const { c } = ctx;
  const a = from < c.start ? c.start : from;
  const b = c.end && c.end < to ? c.end : to;
  if (b < a) return 0;
  // Un avenant peut changer le type d'année : chaque morceau est compté selon ses propres conditions. Coupure aussi à
  // chaque date anniversaire du contrat : les semaines sans accueil d'une année peuvent être saisies, l'année suivante pas encore.
  const anniv: ISODate[] = [];
  for (let i = 1; addMonthsToDate(c.start, 12 * i) <= b; i++) anniv.push(addMonthsToDate(c.start, 12 * i));
  const cuts = [...new Set([...(c.avenants ?? []).map((x) => x.from), ...anniv].filter((d) => d > a && d <= b))].sort();
  const bounds = [a, ...cuts];
  let total = 0;
  bounds.forEach((s, i) => {
    const e = i + 1 < bounds.length ? addDays(bounds[i + 1], -1) : b;
    const t = termsAt(c, s);
    const days = daysBetween(s, e) + 1;
    if (t.yearType === 'complete') { total += days / 7; return; }
    // Année incomplète : ce calcul n'est plus affiché ni payé (T-019) : la période passe « à confirmer » (voir
    // lecturesAnneeIncomplete) ; il reste une borne interne, affinée par le lot 3 (main) ci-dessous.
    // Année incomplète, semaines sans accueil toutes saisies : semaines réellement programmées (jours hors semaines
    // sans accueil ÷ 7), plus les congés payés pris pendant ces semaines dans la limite des droits (assimilés à du
    // travail effectif, 6 jours ouvrables = 1 semaine). Fiche DDETS 31 « Accueil sur 46 semaines ou moins »
    // (30/03/2023) : 31 semaines du 01/09/2021 au 31/05/2022 → 20 jours ; « 11 semaines (dont les 2 semaines de
    // congés payés pris […] en août) et 3 jours » du 01/06 au 30/09/2022 → 8 jours.
    if (semainesToutesSaisies(c, s, e)) {
      const off = toutesSemainesSansAccueil(c);
      let jours = 0;
      for (const d of eachDay(s, e)) if (!off.has(mondayOf(d))) jours++;
      total += jours / 7 + cpAssimiles(ctx, s, e, off) / 6;
      return;
    }
    // Sinon : semaines programmées au prorata de la période de référence (365 ou 366 jours)
    const p = cpPeriod(cpPeriodStartYear(s));
    const periodDays = daysBetween(p.from, p.to) + 1;
    total += (Math.min(days, periodDays) / periodDays) * weeksPerYear(t);
  });
  return total;
}

function round(x: number): number {
  return Math.min(30, Math.ceil(x - 1e-9));
}

/** Arrêt maladie non professionnel : 2 jours ouvrables par mois, 24 au plus par période (C. trav. L3141-5 7° et L3141-5-1, loi 2024-364) */
export const CP_MALADIE_PAR_4_SEMAINES = 2;
export const CP_MALADIE_PLAFOND = 24;



/**
 * T-103 (C10, C11 ; décision du DG du 24/11/2026). Jours acquis sur [from, to], une seule méthode :
 * - Cass. soc. 10/01/1980, n° 78-41.140, publié : « retenir d'abord le nombre des mois complets de travail, puis celui des
 *   semaines supplémentaires groupées par quatre et enfin celui des jours restants groupés par vingt-quatre » ;
 * - CCN 48.1.1.2 : « 2,5 jours ouvrables […] à l'issue de chaque mois de travail ou de chaque période équivalente » (C. trav.
 *   L3141-4 : « quatre semaines ou vingt-quatre jours de travail »), calcul « pro rata temporis, en cas d'embauche, de départ ou
 *   d'absence » : les semaines au-delà des groupes de 4 et les jours au-delà des groupes de 24 comptent au prorata
 *   (2,5 × (mois + semaines ÷ 4 + jours ÷ 24)), au lieu d'être perdus ;
 * - mois de travail : mois civil entier de la période, sans jour hors travail (dont congé sans solde et enfant malade de
 *   l'AM, absences non assimilées). Semaine sans accueil de l'année incomplète :
 *   hors travail (ni travail effectif ni assimilée, L3141-5), sauf les congés payés qui y sont pris (assimilés) ;
 * - arrêt maladie non professionnel : 2 jours ouvrables par mois, même décompte, 24 au plus
 *   (L3141-5-1, applicable par CASF L423-2, 11°).
 * Le total est arrondi au jour supérieur par `round` (CCN 48.1.1.2, L3141-7).
 */
function joursAcquis(ctx: Ctx, from: ISODate, to: ISODate): number {
  const { c } = ctx;
  const a = from < c.start ? c.start : from;
  const b = c.end && c.end < to ? c.end : to;
  if (b < a) return 0;
  const off = toutesSemainesSansAccueil(c);
  const malade = new Set<ISODate>();
  for (const l of ctx.leaves) if (l.type === 'am_malade') for (const d of eachDay(l.from > a ? l.from : a, l.to < b ? l.to : b)) malade.add(d);
  // T-103 (C10) : absence non assimilée à du travail effectif (L3141-5 ne la cite pas) : congé sans solde, enfant malade de
  // l'AM. CCN 48.1.1.2 : calcul « pro rata temporis, en cas […] d'absence » : ces jours sortent du mois de travail.
  const nonAssimile = new Set<ISODate>();
  for (const l of ctx.leaves) if (l.type === 'sans_solde' || l.type === 'am_enfant_malade') for (const d of eachDay(l.from > a ? l.from : a, l.to < b ? l.to : b)) nonAssimile.add(d);
  // Congés payés pris pendant des semaines sans accueil (année incomplète, semaines toutes saisies) : assimilés à du
  // travail effectif (L3141-5, 1° ; CCN 48.1.1.3). Une semaine dont le lundi au samedi sont des congés payés compte entière.
  const cpPayes = off.size && semainesSaisiesCP(c, a, b) ? cpAssimilesJours(ctx, a, b, off) : new Set<ISODate>();
  const cpSemaine = (d: ISODate) => { const l = mondayOf(d); return [0, 1, 2, 3, 4, 5].every((i) => cpPayes.has(addDays(l, i)) || !!holidayName(addDays(l, i))); };
  const sorte = (d: ISODate): 'travail' | 'maladie' | 'hors' => {
    if (malade.has(d)) return 'maladie';
    if (nonAssimile.has(d)) return 'hors';
    if (termsAt(c, d).yearType === 'incomplete' && off.has(mondayOf(d))) return cpPayes.has(d) || ((weekday(d) === 7 || !!holidayName(d)) && cpSemaine(d)) ? 'travail' : 'hors';
    return 'travail';
  };
  const travail = compte1980(a, b, (d) => sorte(d) === 'travail');
  const arret = malade.size ? compte1980(a, b, (d) => sorte(d) === 'maladie') : { mois: 0, semaines: 0, jours: 0 };
  // T-103 (C10 bis) : fiche officielle service-public F18260 (reprise par le Code du travail numérique, mise à jour du
  // 20/02/2026) : « Si le salarié est absent durant la période de référence », le décompte se fait « selon la règle qui lui
  // est la plus favorable » : mensuel (2,5 jours
  // par mois), hebdomadaire (2,5 jours toutes les 4 semaines) ou journalier (2,5 jours pour 24 jours de travail, ou 20 si
  // les horaires sont sur 5 jours par semaine, 22 sur 5,5 jours) ; C. trav. L3141-4 (« quatre semaines ou vingt-quatre
  // jours »). Mensuel : méthode de Cass. soc. 10/01/1980 (mois complets, puis semaines, puis jours), restes au prorata
  // (CCN 48.1.1.2). Hebdomadaire : jours calendaires de travail ÷ 7 ÷ 4. Journalier : jours d'accueil prévus et travaillés
  // ÷ (4 × jours d'accueil par semaine du planning). Le plus haut est retenu. Sans absence ni semaine sans accueil dans la
  // période (seulement l'embauche ou la fin), le décompte mensuel s'applique seul (fiche 4/5 de la DDETS 31, 05/11/2024 :
  // septembre à mai, 9 mois → 23 jours ; Code du travail numérique : novembre à mai, 7 mois → 18 jours).
  let joursCal = 0, joursPlan = 0, absence = false;
  for (const d of eachDay(a, b)) {
    if (sorte(d) !== 'travail') { absence = true; continue; }
    joursCal++;
    const t = termsAt(c, d);
    if (planningBrutMin(t, d) > 0) joursPlan += 1 / (4 * Math.max(1, daysPerWeek(t.planning)));
  }
  const mensuel = travail.mois + travail.semaines / 4 + travail.jours / 24;
  const periodes = absence ? Math.max(mensuel, joursCal / 28, joursPlan) : mensuel;
  const maladie = Math.min(CP_MALADIE_PLAFOND, (arret.mois + arret.semaines / 4 + arret.jours / 24) * CP_MALADIE_PAR_4_SEMAINES);
  return periodes * 2.5 + maladie;
}

/**
 * T-103 (C10) : décompte de l'arrêt Cass. soc. 10/01/1980 sur [a, b] : « d'abord le nombre des mois complets de travail,
 * puis celui des semaines supplémentaires […] et enfin celui des jours restants ». Mois complet : mois civil entier dans
 * [a, b] dont chaque jour compte. Semaine : lundi à dimanche dans [a, b], hors des mois complets, dont chaque jour compte.
 * Jour restant : jour ouvrable (lundi à samedi, L3141-4 « vingt-quatre jours ») qui compte.
 */
function compte1980(a: ISODate, b: ISODate, compte: (d: ISODate) => boolean): { mois: number; semaines: number; jours: number } {
  const pris = new Set<ISODate>();
  let mois = 0, semaines = 0, jours = 0;
  for (const m of monthsBetween(monthOf(a), monthOf(b))) {
    const premier = `${m}-01`, dernier = lastOf(m);
    if (premier < a || dernier > b) continue;
    const j = eachDay(premier, dernier);
    if (j.every(compte)) { mois++; j.forEach((d) => pris.add(d)); }
  }
  for (let l = mondayOf(a); l <= b; l = addDays(l, 7)) {
    const sem = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(l, i));
    if (sem.every((d) => d >= a && d <= b && !pris.has(d) && compte(d))) { semaines++; sem.forEach((d) => pris.add(d)); }
  }
  for (const d of eachDay(a, b)) if (!pris.has(d) && weekday(d) !== 7 && compte(d)) jours++;
  return { mois, semaines, jours };
}

/**
 * AM de moins de 21 ans pour la période qui commence le 1er juin `y` (R-CP-03 ; C. trav. L3141-8 : « moins de vingt et un
 * ans au 30 avril de l'année précédente »). Les droits sont acquis au 31 mai `y + 1` ; l'année précédente est `y` : l'âge
 * se lit au 30 avril `y`. Sans case cochée : règle des 21 ans et plus (comportement d'avant T-019).
 */
export function moinsDe21Ans(moins21Jusqu: number | undefined, y: number): boolean {
  return moins21Jusqu !== undefined && Number.isInteger(moins21Jusqu) && y <= moins21Jusqu;
}

/**
 * Jours supplémentaires pour enfants à charge (R-CP-03 ; CCN art. 48.1.3.3 ; C. trav. L3141-8).
 * 21 ans et plus : 2 jours par enfant, sans dépasser 30 jours au total. Moins de 21 ans : 2 jours par enfant sans limite
 * de 30 jours, réduits à 1 jour si le congé acquis ne dépasse pas 6 jours.
 */
export function joursEnfants(base: number, enfants: number, moins21: boolean): number {
  if (base <= 0 || enfants <= 0) return 0;
  if (moins21) return (base <= 6 ? 1 : 2) * enfants;
  return Math.max(0, Math.min(30, base + 2 * enfants) - base);
}

export const LECTURE_SEMAINES = {
  libelle: 'en comptant tes semaines et jours d’accueil',
  source: 'Urssaf, page « La gestion des congés payés » ; DREETS Occitanie',
};
export const LECTURE_MOIS = {
  libelle: 'en comptant tes mois d’accueil',
  source: 'DREETS Bourgogne-Franche-Comté, guide des assistantes maternelles',
};

/** La période [a, b] touche-t-elle une année incomplète ? */
function touchesIncomplete(c: Contract, a: ISODate, b: ISODate): boolean {
  if (b < a) return false;
  const bornes = [a, ...(c.avenants ?? []).map((x) => x.from).filter((d) => d > a && d <= b)];
  return bornes.some((d) => termsAt(c, d).yearType === 'incomplete');
}


// ---------- Année complète : mois ou périodes de 4 semaines (A-23, T-030) ----------
// CCN 48.1.1.2 : « 2,5 jours ouvrables de congés payés à l'issue de chaque mois de travail ou de chaque période
// équivalente telle que définie par les dispositions légales et réglementaires de droit commun », calcul « pro rata
// temporis, en cas d'embauche, de départ ou d'absence ». C. trav. L3141-4 : « les périodes équivalentes à quatre semaines
// ou vingt-quatre jours de travail ». Aucun texte lu ne dit comment compter une période de 4 semaines commencée.
// Les deux fiches officielles retiennent le plus favorable des modes, mais ne comptent pas les semaines de la même façon :
// - DREETS Occitanie (S-DURAND, C-CPA-01 et C-CPA-03) : semaines comptées avec leurs fractions (« 39 semaines ÷ 4 = 9,75 ») ;
// - DREETS Bourgogne-Franche-Comté (fiche 04-III, C-CPA-14 : « 41 semaines/4 = 10 périodes » ; C-CPA-16 ; fiche 11,
//   C-FIN-09) : mois, ou périodes entières de 4 semaines.
// L'app ne choisit pas : si les deux lectures diffèrent, le nombre est à confirmer.
export const LECTURE_SEMAINES_52 = {
  libelle: 'en comptant aussi les semaines commencées',
  source: 'DREETS Occitanie, fiche « Accueil sur 52 semaines »',
};
export const LECTURE_MOIS_52 = {
  libelle: 'en comptant les mois ou les périodes entières de 4 semaines',
  source: 'DREETS Bourgogne-Franche-Comté, guide des assistantes maternelles',
};


/** Acquisition pour la période de référence commençant le 1er juin `y` */
export function acquisition(ctx: Ctx, y: number, enfantsAChargeSaisis = 0): Acquisition {
  return memo(ctx, `acq${y}|${enfantsAChargeSaisis}`, () => {
    const { c } = ctx;
    const p = cpPeriod(y);
    // T-030 (C-CPA-03) : CCN 48.1.3.3, « Le droit aux jours de congés pour enfant(s) à charge est déterminé et acquis à
    // l'issue de la période de référence (…) soit au 31 mai de chaque année ». Une période arrêtée avant le 31 mai (fin
    // du contrat) n'ouvre pas ces jours.
    const enfantsACharge = c.end && c.end < p.to ? 0 : enfantsAChargeSaisis;
    const trackedY = cpPeriodStartYear(c.trackedFrom);
    let raw: number, rawADate: number, semaines: number;
    const upTo = ctx.today < p.to ? ctx.today : p.to;
    if (y === trackedY && c.trackedFrom > c.start) {
      // Suivi commencé en cours de période : le solde saisi par l'AM (`cpEnCours`, donnée B) plus les jours suivis.
      semaines = weeksIn(ctx, c.trackedFrom, p.to);
      raw = c.balances.cpEnCours + joursAcquis(ctx, c.trackedFrom, p.to);
      rawADate = c.balances.cpEnCours + joursAcquis(ctx, c.trackedFrom, upTo);
    } else {
      semaines = weeksIn(ctx, p.from, p.to);
      raw = joursAcquis(ctx, p.from, p.to);
      rawADate = joursAcquis(ctx, p.from, upTo);
    }
    const moins21 = moinsDe21Ans(ctx.amMoins21Jusqu, y);
    const base = round(raw);
    const bonus = joursEnfants(base, enfantsACharge, moins21);
    const out: Acquisition = {
      startYear: y, from: p.from, to: p.to, jours: base + bonus, joursADate: round(Math.max(0, rawADate)),
      semaines, enfantsBonus: bonus,
    };
    // T-103 (B) : année incomplète sans toutes les semaines sans accueil au contrat : l'app ne peut pas compter les jours de
    // travail. Donnée demandée (contrat), jamais un nombre deviné.
    const a = c.start > p.from ? c.start : p.from;
    const b = c.end && c.end < p.to ? c.end : p.to;
    if (touchesIncomplete(c, a, b) && !semainesSaisiesCP(c, a, b)) {
      out.aConfirmer = { message: MESSAGE_SEMAINES_SANS_ACCUEIL, lectures: [], raison: 'il manque des semaines sans accueil dans le contrat' };
    }
    // T-031 : un cas non géré touche la période (Alsace-Moselle, horaires variables, accueil occasionnel, congé maternité,
    // accident du travail…) : les jours acquis ne sont pas calculés. `jours` reste une borne interne, jamais affichée ni payée.
    const ng = nonGeresPeriode(c, ctx.leaves, p.from, p.to, ctx.finControlee ? 'non' : 'connu');
    if (ng.length) {
      out.aConfirmer = { message: `Jours de congés acquis non calculés. ${ng.join(' ')}`, lectures: [], raison: 'un cas non géré par l’app touche la période' };
    }
    return out;
  });
}

/**
 * T-103 (B) : toutes les semaines sans accueil des années de contrat qui touchent [a, b] sont saisies. Une année de contrat
 * coupée par la fin du contrat n'est pas exigée en entier (même règle que l'ancienne lecture « semaines »).
 */
function semainesSaisiesCP(c: Contract, a: ISODate, b: ISODate): boolean {
  for (let i = 0; ; i++) {
    const debut = addMonthsToDate(c.start, 12 * i);
    if (debut > b) break;
    const finAnnee = addDays(addMonthsToDate(c.start, 12 * (i + 1)), -1);
    if (finAnnee < a || (c.end && c.end < finAnnee)) continue;
    if (termsAt(c, debut).yearType !== 'incomplete') continue;
    const { attendu, saisies } = semainesSansAccueilAnnee(c, debut);
    if (saisies < attendu) return false;
  }
  return true;
}

/** T-103 (B) : donnée du contrat qui manque pour compter les jours de congés d'une année incomplète */
export const MESSAGE_SEMAINES_SANS_ACCUEIL = 'Indique dans le contrat toutes tes semaines sans accueil de l’année : l’app en a besoin pour compter tes jours de congés (convention, article 48.1.1.2).';

/** Jours de congés payés pris (jours ouvrables décomptés, R-CP-09) pendant la période [from, to] pour ce contrat */
export function cpPrisEntre(ctx: Ctx, from: ISODate, to: ISODate): ISODate[] {
  const out = new Set<ISODate>();
  for (const b of decomptesCP(ctx)) {
    // Décompte ambigu : la paie ne retient que les jours sûrs (ceux de la saisie) ; l'écart est signalé.
    for (const d of b.jours) if (d >= from && d <= to) out.add(d);
  }
  return [...out].sort();
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
    for (const b of decomptesCP(ctx)) for (const d of b.jours) years.add(cpPeriodStartYear(d));
    for (const y of years) {
      if (y < cpPeriodStartYear(ctx.c.trackedFrom)) continue;
      const p = cpPeriod(y);
      // Le solde de départ est celui qui reste au début du suivi : les congés pris avant n'y sont pas imputés (bug A).
      const pris = cpPrisEntre(ctx, debutDecompte(ctx, y), p.to);
      // Un solde fractionnaire (2,5 jours) est arrondi au jour supérieur, en faveur de l'AM.
      const droits = Math.max(0, Math.ceil(droitsAPrendre(ctx, y) - 1e-9));
      // T-052 : droits de la période précédente à confirmer sans aucune lecture (absence ou cas non géré) : la borne
      // interne n'est pas un droit sûr. Rien n'est retenu ; ces jours sont à confirmer (cpExcesAConfirmer).
      if (y > cpPeriodStartYear(ctx.c.trackedFrom) && droitsSansLecture(ctx, y)) continue;
      pris.slice(droits).forEach((d) => out.add(d));
    }
    return out;
  });
}

/**
 * T-103 (C14) : année complète, droits de la période précédente non calculés (semaines sans accueil à saisir, ou cas non géré
 * par l'app) : un jour de congé pris au-delà de la borne interne est payé ou sans solde selon ces droits. Le jour porte le
 * message de la donnée qui manque ; le mois attend (payroll.ts, `donneeManquante`).
 */
export function cpDroitsInconnus(ctx: Ctx): Map<ISODate, string> {
  return memo(ctx, `cpdi|${ctx.enfants ?? 0}`, () => {
    const out = new Map<ISODate, string>();
    if (!ctx.leaves.some((l) => l.type === 'cp')) return out;
    const years = new Set<number>();
    for (const b of decomptesCP(ctx)) for (const d of b.jours) years.add(cpPeriodStartYear(d));
    for (const y of years) {
      if (y <= cpPeriodStartYear(ctx.c.trackedFrom)) continue;
      const prec = acquisition(ctx, y - 1, ctx.enfants ?? 0);
      if (!prec.aConfirmer) continue;
      const haut = Math.max(0, Math.ceil(droitsAPrendre(ctx, y) - 1e-9));
      cpPrisEntre(ctx, debutDecompte(ctx, y), cpPeriod(y).to).slice(haut).forEach((d) => out.set(d, prec.aConfirmer!.message));
    }
    return out;
  });
}

/** T-052 : les droits à prendre en période `y` (acquis en `y - 1`) sont à confirmer sans aucune lecture chiffrée. */
function droitsSansLecture(ctx: Ctx, y: number): boolean {
  const a = acquisition(ctx, y - 1, ctx.enfants ?? 0).aConfirmer;
  return !!a && !a.lectures.length;
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
 * Année incomplète (T-019) : `aConfirmer` est rempli, l'app ne propose pas de chiffres et l'AM les saisit elle-même.
 */
export function soldesDeDepart(c: Contract, trackedFrom: ISODate, prisDepuisJuin: number, enfants = 0, amMoins21Jusqu?: number): {
  droitsAnDernier: number; cpRestants: number; cpEnCours: number; depuis: ISODate; aConfirmer?: string;
} {
  const ctx = makeCtx({ ...c, trackedFrom: c.start, end: undefined }, [], [], trackedFrom, enfants, amMoins21Jusqu);
  const y = cpPeriodStartYear(trackedFrom);
  const p = cpPeriod(y);
  const acqPrec = c.start <= addDays(p.from, -1) ? acquisition(ctx, y - 1, enfants) : undefined;
  const droitsAnDernier = acqPrec ? acqPrec.jours : 0;
  const debut = c.start > p.from ? c.start : p.from;
  const cpEnCours = trackedFrom > debut ? Math.round((weeksIn(ctx, debut, addDays(trackedFrom, -1)) / 4) * 2.5 * 100) / 100 : 0;
  const incomplete = touchesIncomplete(c, c.start, addDays(trackedFrom, -1));
  const ng = nonGeresContrat(c);
  if (ng.length) {
    return { droitsAnDernier, cpRestants: 0, cpEnCours: 0, depuis: p.from, aConfirmer: `${ng.join(' ')} L’app ne calcule pas tes jours de congés de départ : saisis-les toi-même, à partir de tes bulletins.` };
  }
  return {
    droitsAnDernier, cpRestants: Math.max(0, droitsAnDernier - Math.max(0, prisDepuisJuin)), cpEnCours, depuis: p.from,
    aConfirmer: incomplete || acqPrec?.aConfirmer
      ? `${incomplete ? 'Année incomplète : l’' : 'L’'}app ne calcule pas tes jours de congés de départ, la méthode officielle n’est pas tranchée. Saisis-les toi-même, à partir de tes bulletins ou de l’accord avec les parents.`
      : undefined,
  };
}

export interface Compteur {
  /** Période en cours */
  enCours: Acquisition;
  /** Jours acquis la période précédente, à prendre avant le 31 mai */
  aPrendre: number;
  /** Droits de la période précédente à confirmer (année incomplète, SUS-11) : `aPrendre` ne doit pas être affiché */
  aPrendreAConfirmer?: AcquisitionAConfirmer;
  pris: number;
  /** Congés au décompte ambigu (R-CP-09) : `pris` et `reste` ne doivent pas être affichés comme sûrs */
  decompteAConfirmer: string[];
  reste: number;
  /** Prise au-delà des droits (seulement quand rien n'est à confirmer) */
  depassement: boolean;
  /** T-030 (C-CPA-17) : congés pris entre le 1er novembre et le 30 avril, jours de fractionnement non calculés par l'app */
  fractionnementNonGere?: string;
}

export const MESSAGE_FRACTIONNEMENT_NON_GERE =
  'Tu as pris des congés entre le 1er novembre et le 30 avril. Ils peuvent te donner 1 ou 2 jours de congés en plus (fractionnement, article 48.1.1.4 de la convention), sauf si tu y as renoncé par écrit. L’app ne calcule pas ces jours : vois-les avec les parents.';

export function compteur(ctx: Ctx, at: ISODate, enfantsACharge = 0): Compteur {
  const { c } = ctx;
  const y = cpPeriodStartYear(at);
  const trackedY = cpPeriodStartYear(c.trackedFrom);
  const enCours = acquisition(ctx, y, enfantsACharge);
  let aPrendre: number;
  let aPrendreAConfirmer: AcquisitionAConfirmer | undefined;
  if (y === trackedY) aPrendre = Math.ceil(c.balances.cpRestants - 1e-9); // même arrondi que la paie (cpExces)
  else if (y > trackedY) {
    const prec = acquisition(ctx, y - 1, enfantsACharge);
    aPrendre = prec.jours;
    aPrendreAConfirmer = prec.aConfirmer;
  } else aPrendre = 0;
  const p = cpPeriod(y);
  const fin = at < p.to ? at : p.to;
  const pris = cpPrisEntre(ctx, debutDecompte(ctx, y), fin).length;
  const decompteAConfirmer = cpDemandesEntre(ctx, debutDecompte(ctx, y), fin);
  const reste = aPrendre - pris;
  // CCN 48.1.1.4 : jours de fractionnement si 3 jours ou plus du congé principal sont pris hors du 1er mai - 31 octobre.
  // L'app ne sait pas quels jours relèvent du congé principal (hors 5e semaine) ni s'il y a eu renonciation : non géré.
  const horsPeriode = cpPrisEntre(ctx, debutDecompte(ctx, y), fin).filter((d) => { const mo = Number(d.slice(5, 7)); return mo >= 11 || mo <= 4; });
  return {
    enCours, aPrendre, aPrendreAConfirmer, pris, decompteAConfirmer, reste,
    depassement: reste < 0 && !aPrendreAConfirmer && !decompteAConfirmer.length,
    ...(horsPeriode.length >= 3 ? { fractionnementNonGere: MESSAGE_FRACTIONNEMENT_NON_GERE } : {}),
  };
}

/** Base du dixième : salaires nets (hors frais) de la période, indemnités de congés versées incluses */
export function baseDixieme(ctx: Ctx, y: number, enfants = 0): { base: number; manquants: Month[]; aConfirmer: boolean } {
  return memo(ctx, `b10${y}|${enfants}`, () => {
    const p = cpPeriod(y);
    let base = 0;
    let aConfirmer = false;
    const manquants: Month[] = [];
    for (const m of monthsBetween(monthOf(p.from), monthOf(p.to))) {
      const b = monthBase(ctx, m);
      if (!b.active) continue;
      if (b.missing) manquants.push(m);
      base += b.net;
      if (!b.fromHistory) {
        const cp = cpForMonth(ctx, m, enfants);
        base += cp.indemnite + cp.complement;
        // T-103 : une indemnité de congés non calculée manque dans la base : le dixième n'est pas calculé non plus.
        if (cp.aConfirmer) aConfirmer = true;
      }
    }
    return { base, manquants, aConfirmer };
  });
}

/**
 * Maintien de salaire pour n jours ouvrables de congés. T-076 (planning variable) : lecture C1 de P-PV-5, heures prévues
 * moyennes de la période de référence commençant le 1er juin `refY` (défaut : celle qui contient `at`) ; voir `maintienC1`.
 */
export function maintien(ctx: Ctx, jours: number, at: ISODate = ctx.today, refY?: number): number {
  const c = termsAt(ctx.c, at);
  if (pvActif(c)) return maintienC1(ctx, jours, refY ?? cpPeriodStartYear(at), at);
  // Salaire d'une semaine, heures au-delà de 45 h majorées comme dans le salaire mensualisé
  const h = weeklyMinutes(c.planning);
  const semaine = Math.min(h, H45) * c.rateNet + Math.max(0, h - H45) * c.rateNet * (1 + c.majoration / 100);
  return Math.round(((jours / 6) * semaine) / 60);
}

/**
 * T-076, P-PV-5 lecture C1 : maintien = taux × (heures prévues de la période de référence ÷ semaines prévues travaillées de
 * la période) × jours ÷ 6. Jours de la période compris dans le contrat ; heures prévues : planning de la semaine de chaque
 * jour (congés, absences et fériés compris, hors semaines sans accueil de l'année incomplète) ; semaines prévues travaillées :
 * nombre de jours des semaines dont le planning n'est pas vide, divisé par 7 (une semaine coupée par la période compte pour
 * sa part). S2 : un jour dont la semaine n'a pas de planning saisi n'est compté nulle part.
 */
export function maintienC1(ctx: Ctx, jours: number, refY: number, at: ISODate): number {
  const c = ctx.c;
  const p = cpPeriod(refY);
  const a = c.start > p.from ? c.start : p.from;
  const b = c.end && c.end < p.to ? c.end : p.to;
  const off = toutesSemainesSansAccueil(c);
  let total = 0, joursSemaines = 0;
  // T-103 (H5) : heures d'une semaine prévues au-delà de 45 h, majorées comme dans le salaire (CCN 110.1, 48.1.1.5).
  const parSemaine = new Map<ISODate, { min: number; maj: number }>();
  for (const d of b < a ? [] : eachDay(a, b)) {
    const t = termsAt(c, d);
    const l = mondayOf(d);
    if (t.yearType === 'incomplete' && off.has(l)) continue;
    const h = minutesPlanning(planningSemainePV(t, l));
    if (h <= 0) continue;
    const m = planningBrutMin(t, d);
    total += m;
    const w = parSemaine.get(l) ?? { min: 0, maj: t.majoration };
    w.min += m; parSemaine.set(l, w);
    joursSemaines++;
  }
  for (const w of parSemaine.values()) total += (Math.max(0, w.min - H45) * w.maj) / 100;
  const rate = termsAt(c, at).rateNet;
  return joursSemaines ? Math.round(((jours / 6) * (total / (joursSemaines / 7)) * rate) / 60) : 0;
}

/**
 * T-076, P-PV-5 lecture C2 : maintien = taux × heures prévues (planning de la semaine) des jours de congé pris au titre de
 * la période `y`, c'est-à-dire les `jours` premiers jours décomptés à partir du 1er juin `y + 1`. `complet` faux : tous ces
 * jours ne sont pas encore saisis, `montant` ne compte que les jours connus (borne basse).
 */
export function maintienC2(ctx: Ctx, y: number, jours: number, at: ISODate): { montant: number; complet: boolean; connus: number } {
  const n = Math.max(0, Math.ceil(jours - 1e-9));
  const pris = cpPrisEntre(ctx, debutDecompte(ctx, y + 1), cpPeriod(y + 1).to).slice(0, n);
  let min = 0;
  for (const d of pris) min += plannedPlages(ctx.c, d).reduce((s, x) => s + Math.max(0, minutesHHMM(x.end) - minutesHHMM(x.start)), 0);
  const rate = termsAt(ctx.c, at).rateNet;
  return { montant: Math.round((min * rate) / 60), complet: pris.length >= n, connus: pris.length };
}

const minutesHHMM = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

export interface IndemniteCP {
  startYear: number;
  jours: number;
  dixieme: number;
  maintien: number;
  /** Indemnité retenue : la plus favorable. T-076 (planning variable) : part sûre, max(dixième ; min(C1, C2)). */
  montant: number;
  /**
   * T-076, P-PV-5 : planning variable, deux lectures du maintien. `aConfirmer` : max(dixième ; max(C1, C2)) − part sûre,
   * affiché à part, hors du total. `verseDansSalaire` (année complète) : maintien déjà versé par le salaire mensualisé
   * pendant les congés (heures mensualisées × 12 ÷ 52 par semaine × jours ÷ 6 × taux).
   */
  pv?: { c1: number; c2: number; c2Complet: boolean; verseDansSalaire: number };
  methode: 'dixieme' | 'maintien';
  manquants: Month[];
  /** T-103 : indemnité non calculée (donnée à saisir ou cas non géré) : ni `jours` ni `montant` ne sont affichés ou payés */
  aConfirmer?: {
    message: string;
    montants: { libelle: string; jours: number; montant: number }[];
    /** Montants de toutes les variantes (lectures et contrôles en semaines) : sert à vérifier qu'un versement est sûr */
    tous: { jours: number; montant: number }[];
    /** La base du dixième est sûre : les montants par lecture peuvent servir */
    baseSure: boolean;
  };
}

export function indemnite(ctx: Ctx, y: number, enfants = 0): IndemniteCP {
  return memo(ctx, `ind${y}|${enfants}`, () => {
    const acq = acquisition(ctx, y, enfants);
    const bd = baseDixieme(ctx, y, enfants);
    const { base, manquants, aConfirmer: baseAC } = bd;
    const dix = Math.round(base / 10);
    const at = `${y + 1}-06-01`;
    let mt = maintien(ctx, acq.jours, at, y);
    let pv: IndemniteCP['pv'];
    if (pvActif(termsAt(ctx.c, at))) {
      // T-103 (C13) : Cass. soc. 09/05/2019, n° 17-26.232 (AM) : rechercher « la durée normale habituelle d'accueil de l'enfant
      // […] pendant toute la période de référence ». Une seule méthode : C1, heures prévues moyennes de la période.
      const c2 = maintienC2(ctx, y, acq.jours, at);
      const tAt = termsAt(ctx.c, at);
      const verse = Math.round(((acq.jours / 6) * ((tAt.heuresMensualisees ?? 0) * 60 * 12 / semainesParAn(tAt)) * tAt.rateNet) / 60);
      pv = { c1: mt, c2: c2.montant, c2Complet: c2.complet, verseDansSalaire: verse };
    }
    const out: IndemniteCP = {
      startYear: y, jours: acq.jours, dixieme: dix, maintien: mt, montant: Math.max(dix, mt),
      methode: dix > mt ? 'dixieme' : 'maintien', manquants, ...(pv ? { pv } : {}),
    };
    // T-103 : jours acquis non calculés (donnée à saisir ou cas non géré), ou base du dixième qui comprend une indemnité de
    // l'an dernier non calculée : l'indemnité n'est pas calculée, la raison dit quoi saisir. Jamais un montant « à confirmer ».
    if (acq.aConfirmer) {
      out.aConfirmer = { message: `Indemnité de congés payés non calculée. ${acq.aConfirmer.message}`, montants: [], tous: [], baseSure: !baseAC };
    } else if (baseAC) {
      out.aConfirmer = { message: 'Indemnité de congés payés non calculée : le dixième compte l’indemnité de l’an dernier, qui n’est pas calculée (voir le mois de juin).', montants: [], tous: [], baseSure: false };
    }
    return out;
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
  /** T-103 : somme due ce mois mais non calculée (donnée à saisir) : le mois attend la donnée */
  aConfirmer?: string;
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
    const aConfirmer = (): CpMonth => ({ jours: 0, indemnite: 0, complement: 0, aConfirmer: ind.aConfirmer!.message });
    if (termsAt(c, `${m}-01`).yearType === 'complete') {
      if (m === juin) {
        if (ind.aConfirmer) return aConfirmer();
        if (ind.pv) {
          // T-076 : le salaire mensualisé versé pendant les congés paie déjà `verseDansSalaire` ; le complément paie le reste
          // (T-103, C13 : une seule méthode du maintien).
          out.complement = Math.max(0, ind.montant - ind.pv.verseDansSalaire);
          if (out.complement) out.note = 'Complément de congés payés (année complète), versé en juin.';
          return out;
        }
        out.complement = Math.max(0, ind.dixieme - ind.maintien);
        if (out.complement) out.note = 'Complément du dixième (année complète), versé en juin.';
      }
      return out;
    }
    if (c.cpMode === 'juin') {
      if (m === juin) {
        if (ind.aConfirmer) return aConfirmer();
        out.jours = ind.jours;
        out.indemnite = ind.montant;
        out.note = 'Indemnité de congés payés versée en juin.';
      }
    } else if (c.cpMode === 'principale') {
      const p = cpPeriod(y);
      let best: { from: ISODate; n: number } | undefined;
      for (const l of ctx.leaves) {
        if (l.type !== 'cp' || l.to < p.from || l.from > p.to) continue;
        const n = decompteConge(ctx, l).jours;
        if (!best || n > best.n) best = { from: l.from, n };
      }
      if (best && monthOf(best.from) === m) {
        if (ind.aConfirmer) return aConfirmer();
        out.jours = ind.jours;
        out.indemnite = ind.montant;
        out.note = 'Indemnité de congés payés versée avec la prise principale.';
      }
    } else {
      const p = cpPeriod(y);
      const before = m === monthOf(p.from) ? 0 : cpPrisEntre(ctx, p.from, lastOf(addMonths(m, -1))).length;
      const inMonth = cpPrisEntre(ctx, `${m}-01`, lastOf(m)).length;
      const part = (jours: number, montant: number) => {
        const total = Math.min(jours, before + inMonth);
        const dejaPaye = Math.min(jours, before);
        return { n: total - dejaPaye, montant: Math.round((montant * total) / jours) - Math.round((montant * dejaPaye) / jours) };
      };
      if (ind.aConfirmer) {
        if (inMonth > 0) return aConfirmer();
      } else {
        const r = part(ind.jours, ind.montant);
        if (r.n > 0) {
          out.jours = r.n;
          out.indemnite = r.montant;
          out.note = 'Indemnité de congés payés versée au fur et à mesure de la prise.';
        }
      }
    }
    return out;
  });
}

function lastOf(m: Month): ISODate {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
}
