// Congés payés (art. 48 et 102) : acquisition, compteur, indemnité.
import { addDays, addMonths, addMonthsToDate, cpPeriod, cpPeriodStartYear, daysBetween, eachDay, mondayOf, monthOf, monthsBetween, weekday, type ISODate, type Month } from './dates';
import { holidayName } from './holidays';
import { euros } from './money';
import {
  H45, daysPerWeek, inContract, makeCtx, monthBase, plannedPlages, planningBrutMin, salaireMensualise, semainesSansAccueilAnnee, termsAt,
  toutesSemainesSansAccueil, weeklyMinutes, weeksPerYear, type Ctx,
} from './payroll';
import type { AmLeave, Contract } from './model';

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
  return !holidayName(d) || !!ctx.days.get(d)?.ferieTravaille;
}

const ouvrable = (d: ISODate) => weekday(d) <= 6 && !holidayName(d);

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
  /** Jours décomptés compris dans la saisie : seuls retenus par la paie quand le décompte est à confirmer */
  joursSaisis: ISODate[];
  /** Décompte ambigu : message à afficher (l'app ne tranche pas) */
  aConfirmer?: string;
}

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
      const veille = reprise ? addDays(reprise, -1) : to;
      const jours = premier && premier <= veille ? eachDay(premier, veille).filter((d) => ouvrable(d) && inContract(c, d)) : [];
      const b: DecompteCP = { from, to, leaves, premier, reprise, jours, joursSaisis: jours.filter((d) => d <= to) };
      // Cas que la règle ne tranche pas : signalés, jamais choisis.
      const fin = reprise ?? to;
      const debutContrat = from < c.start ? c.start : from;
      const raisons: string[] = [];
      if (premier && autres.some((l) => l.from <= fin && l.to >= debutContrat)) {
        raisons.push('Une autre absence (maladie, congé sans solde…) tombe pendant ce congé ou le jour de ta reprise.');
      }
      if (premier && !reprise) {
        const apres = c.end && c.end > to ? eachDay(addDays(to, 1), c.end).filter(ouvrable) : [];
        if (finContrat && apres.length) raisons.push('Le contrat finit avant ta reprise.');
        else if (!finContrat) raisons.push('L’app ne trouve pas ton jour de reprise.');
      }
      if (raisons.length) {
        b.aConfirmer = `Congé du ${jjmm(from)} au ${jjmm(to)} : nombre de jours décomptés à confirmer. ${raisons.join(' ')} Vérifie le décompte avec les parents.`;
      }
      out.push(b);
    }
    return out;
  });
}

/** Décompte d'un congé saisi : ses jours décomptés pour ce contrat */
export function decompteConge(ctx: Ctx, leave: AmLeave): { jours: number; aConfirmer?: string } {
  for (const b of decomptesCP(ctx)) {
    const k = b.leaves.findIndex((l) => l.id === leave.id);
    if (k < 0) continue;
    // Les jours du groupe vont au dernier congé commencé avant eux.
    const debuts = b.leaves.map((l) => l.from);
    const n = b.jours.filter((d) => d >= leave.from && !debuts.some((f, j) => j !== k && f > leave.from && f <= d)).length;
    return { jours: n, aConfirmer: b.aConfirmer };
  }
  return { jours: 0 };
}

/** Messages des congés au décompte ambigu qui touchent [from, to] */
export function cpAConfirmerEntre(ctx: Ctx, from: ISODate, to: ISODate): string[] {
  const out: string[] = [];
  for (const b of decomptesCP(ctx)) {
    if (!b.aConfirmer) continue;
    const fin = b.reprise ? addDays(b.reprise, -1) : b.to;
    if (b.from <= to && fin >= from) out.push(b.aConfirmer);
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
    // Année incomplète : semaines programmées au prorata de la période de référence (365 ou 366 jours).
    // Ce calcul n'est plus affiché ni payé (T-019) : la période passe « à confirmer » (voir lecturesAnneeIncomplete).
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

/** Semaines d'arrêt maladie de l'AM (« je suis malade ») comprises dans [from, to], comptées comme `weeksIn` */
function semainesMaladie(ctx: Ctx, from: ISODate, to: ISODate): number {
  const jours = new Set<ISODate>();
  for (const l of ctx.leaves) {
    if (l.type !== 'am_malade') continue;
    const a = l.from > from ? l.from : from;
    const b = l.to < to ? l.to : to;
    if (b < a) continue;
    for (const d of eachDay(a, b)) jours.add(d);
  }
  if (!jours.size) return 0;
  // Regroupe les jours en intervalles continus, puis les compte comme le reste du contrat
  const tri = [...jours].sort();
  let total = 0, debut = tri[0], prec = tri[0];
  for (const d of tri.slice(1)) {
    if (d === addDays(prec, 1)) { prec = d; continue; }
    total += weeksIn(ctx, debut, prec);
    debut = prec = d;
  }
  return total + weeksIn(ctx, debut, prec);
}

/** Jours bruts acquis sur [from, to] : 2,5 jours par 4 semaines travaillées, 2 par 4 semaines d'arrêt maladie (24 au plus) */
function joursBruts(ctx: Ctx, from: ISODate, to: ISODate): number {
  const semaines = weeksIn(ctx, from, to);
  const malade = Math.min(semaines, semainesMaladie(ctx, from, to));
  const auTitreMaladie = Math.min(CP_MALADIE_PLAFOND, (malade / 4) * CP_MALADIE_PAR_4_SEMAINES);
  return ((semaines - malade) / 4) * 2.5 + auTitreMaladie;
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

/**
 * Les deux lectures officielles de l'acquisition en année incomplète (SUS-11), sans en choisir une :
 * - semaines et jours d'accueil (Urssaf « gestion des congés payés », deux formules : semaines × 2,5 ÷ 4, et
 *   [(semaines × jours par semaine) + jours en plus] × 2,5 ÷ (4 × jours par semaine) ; S-BERTRAND et S-OCC : cas C-CPA-04,
 *   C-CPA-05, C-CPA-07, C-CPA-10). La lecture affichée compte les jours d'accueil réels (seconde formule ; C-CPA-04 : 155
 *   jours, 20 ; C-CPA-05 : 58 jours, 8 retenus). La formule en semaines peut donner un autre nombre (C-CPA-05 : 7), et le
 *   comptage d'une semaine partielle n'est pas le même d'un exemple à l'autre (C-CPA-04 la compte comme une semaine,
 *   C-CPA-05 en jours) : elle sert seulement de contrôle (`controles`), un nombre n'est sûr que si tout concorde ;
 * - mois d'accueil (S-BFC fiche 04-III : 2,5 jours par mois, « seuls les mois totalement non travaillés » n'ouvrent pas
 *   droit ; cas C-CPA-12).
 * Les congés payés pris pendant les semaines sans accueil comptent comme travail (C-CPA-05 : « 11 semaines (dont les
 * 2 semaines de congés payés pris … au mois d'août) et 3 jours »). Calculées seulement quand l'app a toutes les données.
 */
function lecturesAnneeIncomplete(ctx: Ctx, y: number, enfants: number, moins21: boolean): { lectures: LectureCP[]; controles?: number[]; raison?: string } {
  const { c } = ctx;
  const p = cpPeriod(y);
  const a = c.start > p.from ? c.start : p.from;
  const b = c.end && c.end < p.to ? c.end : p.to;
  if (b < a) return { lectures: [] };
  if ((c.avenants ?? []).some((x) => x.from > a && x.from <= b) || termsAt(c, a).yearType !== 'incomplete') {
    return { lectures: [], raison: 'un avenant change le contrat pendant la période' };
  }
  if (c.trackedFrom > a) return { lectures: [], raison: 'le suivi par l’app a commencé après le début de la période' };
  const planningType = (d: ISODate) => planningBrutMin(termsAt(c, d), d) > 0;
  const absence = ctx.leaves.some((l) => l.type !== 'cp' && l.from <= b && l.to >= a
    && eachDay(l.from > a ? l.from : a, l.to < b ? l.to : b).some(planningType))
    || [...ctx.days.values()].some((r) => r.abs === 'sans_solde_enfant' && r.date >= a && r.date <= b);
  if (absence) return { lectures: [], raison: 'une absence (maladie, congé sans solde…) change le calcul' };
  // Semaines sans accueil : toutes celles des années de contrat comprises dans le contrat et qui touchent la période.
  for (let i = 0; ; i++) {
    const debut = addMonthsToDate(c.start, 12 * i);
    if (debut > b) break;
    const finAnnee = addDays(addMonthsToDate(c.start, 12 * (i + 1)), -1);
    if (finAnnee < a || (c.end && c.end < finAnnee)) continue;
    const { attendu, saisies } = semainesSansAccueilAnnee(c, debut);
    if (saisies < attendu) return { lectures: [], raison: 'il manque des semaines sans accueil dans le contrat' };
  }
  const off = toutesSemainesSansAccueil(c);
  const cpJours = new Set<ISODate>();
  for (const l of ctx.leaves) if (l.type === 'cp') for (const d of eachDay(l.from, l.to)) cpJours.add(d);
  const upTo = ctx.today < b ? ctx.today : b;
  let jours = 0, joursAD = 0;
  const mois = new Set<Month>(), moisAD = new Set<Month>();
  const entieres = new Set<ISODate>(), touchees = new Set<ISODate>();
  for (const d of eachDay(a, b)) {
    const accueil = plannedPlages(c, d).length > 0;
    const cpHorsAccueil = !accueil && planningType(d) && off.has(mondayOf(d)) && cpJours.has(d);
    if (!accueil && !cpHorsAccueil) continue;
    jours++; mois.add(monthOf(d));
    const lundi = mondayOf(d);
    touchees.add(lundi);
    if (lundi >= a && addDays(lundi, 6) <= b) entieres.add(lundi);
    if (d <= upTo) { joursAD++; moisAD.add(monthOf(d)); }
  }
  const jps = daysPerWeek(termsAt(c, a).planning);
  if (!jps) return { lectures: [] };
  const lecture = (methode: LectureCP['methode'], brut: number, brutAD: number): LectureCP => {
    const base = round(brut);
    const bonus = joursEnfants(base, enfants, moins21);
    const info = methode === 'semaines' ? LECTURE_SEMAINES : LECTURE_MOIS;
    return { methode, ...info, jours: base + bonus, joursADate: round(Math.max(0, brutAD)), enfantsBonus: bonus };
  };
  const enSemaines = (n: number) => { const base = round((n * 2.5) / 4); return base + joursEnfants(base, enfants, moins21); };
  return {
    lectures: [
      lecture('semaines', (jours * 2.5) / (4 * jps), (joursAD * 2.5) / (4 * jps)),
      lecture('mois', mois.size * 2.5, moisAD.size * 2.5),
    ],
    controles: [enSemaines(entieres.size), enSemaines(touchees.size)],
  };
}

function messageAcquisition(lectures: LectureCP[], raison?: string): string {
  const debut = 'Année incomplète : tes jours de congés sont à confirmer. Deux lectures officielles existent';
  const fin = 'En attendant une réponse officielle, mets-toi d’accord par écrit avec les parents.';
  if (lectures.length === 2) {
    const [s, m] = lectures;
    return `${debut} : ${s.jours} jours ${s.libelle} (${s.source}), ou ${m.jours} jours ${m.libelle} (${m.source}). ${fin}`;
  }
  return `${debut} : ${LECTURE_SEMAINES.libelle} (${LECTURE_SEMAINES.source}), ou ${LECTURE_MOIS.libelle} (${LECTURE_MOIS.source}).`
    + (raison ? ` L’app ne peut pas les calculer ici : ${raison}.` : '') + ` ${fin}`;
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

function messageAcquisition52(lectures: LectureCP[]): string {
  const [s, m] = lectures;
  return `Tes jours de congés de cette période sont à confirmer. Les fiches officielles ne comptent pas de la même façon : ${s.jours} jours ${s.libelle} (${s.source}), ou ${m.jours} jours ${m.libelle} (${m.source}). `
    + 'Aucun texte ne dit laquelle retenir. En attendant une réponse officielle, mets-toi d’accord par écrit avec les parents.';
}

/**
 * Lectures de l'acquisition en année complète (A-23). Chaque lecture retient le plus favorable de deux modes :
 * - mois : 2,5 jours par mois civil entier de travail, 2 par mois civil entier d'arrêt maladie (24 au plus, L3141-5-1).
 *   Un mois commencé (embauche, fin, arrêt en cours de mois) n'a pas de règle écrite : borne basse (non compté, ou compté
 *   en maladie s'il a de l'arrêt) et borne haute (compté en travail) ;
 * - semaines : `brut` (semaines avec leurs fractions, calcul de base) pour la lecture Occitanie ; périodes entières de
 *   4 semaines pour la lecture Bourgogne-Franche-Comté.
 * `lectures` : bornes basses ; `controles` : bornes hautes. Rien à confirmer si tout donne le même nombre.
 */
function lecturesAnneeComplete(ctx: Ctx, a: ISODate, b: ISODate, upTo: ISODate, brut: number, brutAD: number,
  enfants: number, moins21: boolean): { lectures: LectureCP[]; controles: number[] } {
  const maladie = new Set<ISODate>();
  for (const l of ctx.leaves) if (l.type === 'am_malade') for (const d of eachDay(l.from > a ? l.from : a, l.to < b ? l.to : b)) maladie.add(d);
  let bas = 0, haut = 0, malBas = 0, malHaut = 0, basAD = 0, malAD = 0;
  for (const m of monthsBetween(monthOf(a), monthOf(b))) {
    const premier = `${m}-01`, dernier = lastOf(m);
    const entier = a <= premier && b >= dernier;
    const jours = eachDay(premier > a ? premier : a, dernier < b ? dernier : b);
    const nMal = jours.filter((d) => maladie.has(d)).length;
    const nTot = eachDay(premier, dernier).length;
    if (entier && nMal === 0) { bas++; haut++; if (dernier <= upTo) basAD++; continue; }
    if (entier && nMal === nTot) { malBas++; malHaut++; if (dernier <= upTo) malAD++; continue; }
    if (nMal > 0) malBas++;
    haut++;
  }
  const mois = (n: number, mal: number) => n * 2.5 + Math.min(CP_MALADIE_PLAFOND, mal * CP_MALADIE_PAR_4_SEMAINES);
  const semaines = weeksIn(ctx, a, b);
  const mal = Math.min(semaines, semainesMaladie(ctx, a, b));
  const periodes = Math.floor((semaines - mal) / 4 + 1e-9) * 2.5 + Math.min(CP_MALADIE_PLAFOND, Math.floor(mal / 4 + 1e-9) * CP_MALADIE_PAR_4_SEMAINES);
  const avecEnfants = (x: number) => { const n = round(x); return n + joursEnfants(n, enfants, moins21); };
  const lect = (info: { libelle: string; source: string }, methode: LectureCP['methode'], x: number, xAD: number): LectureCP => {
    const n = round(x);
    const bonus = joursEnfants(n, enfants, moins21);
    return { methode, ...info, jours: n + bonus, joursADate: round(Math.max(0, xAD)), enfantsBonus: bonus };
  };
  const moisAD = mois(basAD, malAD);
  return {
    lectures: [
      lect(LECTURE_SEMAINES_52, 'semaines', Math.max(brut, mois(bas, malBas)), Math.max(brutAD, moisAD)),
      lect(LECTURE_MOIS_52, 'mois', Math.max(periodes, mois(bas, malBas)), moisAD),
    ],
    controles: [avecEnfants(Math.max(brut, mois(haut, malHaut))), avecEnfants(Math.max(periodes, mois(haut, malHaut)))],
  };
}

/** Acquisition pour la période de référence commençant le 1er juin `y` */
export function acquisition(ctx: Ctx, y: number, enfantsAChargeSaisis = 0): Acquisition {
  return memo(ctx, `acq${y}|${enfantsAChargeSaisis}`, () => {
    const { c } = ctx;
    const p = cpPeriod(y);
    // T-030 (C-CPA-03) : CCN 48.1.3.3, « Le droit aux jours de congés pour enfant(s) à charge est déterminé et acquis à
    // l'issue de la période de référence (…) soit au 31 mai de chaque année ». Une période arrêtée avant le 31 mai (fin
    // du contrat) n'ouvre pas ces jours. S-DURAND p. 8 : « Pas de jours enfant à charge » pour juin-septembre 2022.
    const enfantsACharge = c.end && c.end < p.to ? 0 : enfantsAChargeSaisis;
    const trackedY = cpPeriodStartYear(c.trackedFrom);
    let raw: number, rawADate: number, semaines: number;
    const upTo = ctx.today < p.to ? ctx.today : p.to;
    if (y === trackedY && c.trackedFrom > c.start) {
      semaines = weeksIn(ctx, c.trackedFrom, p.to);
      raw = c.balances.cpEnCours + joursBruts(ctx, c.trackedFrom, p.to);
      rawADate = c.balances.cpEnCours + joursBruts(ctx, c.trackedFrom, upTo);
    } else {
      semaines = weeksIn(ctx, p.from, p.to);
      raw = joursBruts(ctx, p.from, p.to);
      rawADate = joursBruts(ctx, p.from, upTo);
    }
    const moins21 = moinsDe21Ans(ctx.amMoins21Jusqu, y);
    const base = round(raw);
    const bonus = joursEnfants(base, enfantsACharge, moins21);
    const out: Acquisition = {
      startYear: y, from: p.from, to: p.to, jours: base + bonus, joursADate: round(Math.max(0, rawADate)),
      semaines, enfantsBonus: bonus,
    };
    // Année incomplète (SUS-11, T-019) : la méthode d'acquisition n'est pas tranchée. L'app ne choisit pas : elle donne
    // les deux lectures officielles. Si elles donnent le même nombre, ce nombre est sûr.
    const a = c.start > p.from ? c.start : p.from;
    const b = c.end && c.end < p.to ? c.end : p.to;
    if (touchesIncomplete(c, a, b)) {
      const { lectures, controles, raison } = lecturesAnneeIncomplete(ctx, y, enfantsACharge, moins21);
      const l1 = lectures[0];
      // Toutes les lectures et variantes donnent le même nombre (à date aussi) : il est sûr, quelle que soit la méthode
      // retenue plus tard. La période doit être close pour que les variantes en semaines comptent à date.
      const close = ctx.today >= b;
      if (l1 && close && lectures.every((l) => l.jours === l1.jours && l.joursADate === l1.joursADate)
        && (controles ?? []).every((n) => n === l1.jours)) {
        out.jours = l1.jours; out.joursADate = l1.joursADate; out.enfantsBonus = l1.enfantsBonus;
      } else if (lectures.length || raison) {
        out.aConfirmer = { message: messageAcquisition(lectures, raison), lectures, controles, raison };
        if (lectures.length) {
          // Borne interne seulement (jamais affichée ni payée) : la lecture la plus haute, pour ne pas retenir à tort.
          out.jours = Math.max(...lectures.map((l) => l.jours));
          out.joursADate = Math.max(...lectures.map((l) => l.joursADate));
          out.enfantsBonus = Math.max(...lectures.map((l) => l.enfantsBonus));
        }
      }
    } else if (b >= a && !(y === trackedY && c.trackedFrom > a)) {
      // Année complète (A-23, T-030) : mois ou périodes de 4 semaines, non tranché. Le suivi commencé en cours de période
      // garde le solde saisi par l'AM (`cpEnCours`) : cette période n'est pas recomptée.
      const { lectures, controles } = lecturesAnneeComplete(ctx, a, b, upTo, raw, rawADate, enfantsACharge, moins21);
      const tous = [...lectures.map((l) => l.jours), ...controles];
      if (tous.every((n) => n === tous[0])) {
        out.jours = lectures[0].jours; out.enfantsBonus = lectures[0].enfantsBonus;
      } else {
        out.aConfirmer = { message: messageAcquisition52(lectures), lectures, controles };
        // Borne interne seulement (jamais affichée ni payée) : la lecture la plus haute, pour ne pas retenir à tort.
        out.jours = Math.max(...tous);
        out.joursADate = Math.max(...lectures.map((l) => l.joursADate));
        out.enfantsBonus = Math.max(...lectures.map((l) => l.enfantsBonus));
      }
    }
    return out;
  });
}

/** Jours de congés payés pris (jours ouvrables décomptés, R-CP-09) pendant la période [from, to] pour ce contrat */
export function cpPrisEntre(ctx: Ctx, from: ISODate, to: ISODate): ISODate[] {
  const out = new Set<ISODate>();
  for (const b of decomptesCP(ctx)) {
    // Décompte ambigu : la paie ne retient que les jours sûrs (ceux de la saisie) ; l'écart est signalé.
    for (const d of b.aConfirmer ? b.joursSaisis : b.jours) if (d >= from && d <= to) out.add(d);
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
      pris.slice(droits).forEach((d) => out.add(d));
    }
    return out;
  });
}

/**
 * T-030 (A-23) : année complète, droits de la période précédente à confirmer. Les jours pris au-delà de la lecture la plus
 * basse mais dans la plus haute ne sont ni payés ni retenus : ils sont à confirmer (au-delà de la plus haute, `cpExces`).
 */
export function cpExcesAConfirmer(ctx: Ctx): Set<ISODate> {
  return memo(ctx, `cpxac|${ctx.enfants ?? 0}`, () => {
    const out = new Set<ISODate>();
    if (!ctx.leaves.some((l) => l.type === 'cp')) return out;
    const years = new Set<number>();
    for (const b of decomptesCP(ctx)) for (const d of b.jours) years.add(cpPeriodStartYear(d));
    for (const y of years) {
      if (y <= cpPeriodStartYear(ctx.c.trackedFrom)) continue;
      const prec = acquisition(ctx, y - 1, ctx.enfants ?? 0);
      if (!prec.aConfirmer || !prec.aConfirmer.lectures.length) continue;
      const bas = Math.min(...prec.aConfirmer.lectures.map((l) => l.jours), ...(prec.aConfirmer.controles ?? []));
      const haut = Math.max(0, Math.ceil(droitsAPrendre(ctx, y) - 1e-9));
      const pris = cpPrisEntre(ctx, debutDecompte(ctx, y), cpPeriod(y).to);
      pris.slice(bas, haut).forEach((d) => out.add(d));
    }
    return out;
  });
}

export const MESSAGE_CP_AU_DELA_A_CONFIRMER =
  'Congés pris peut-être au-delà de tes droits : selon la façon de compter tes jours acquis, ces jours sont payés ou pris sans solde. Ils ne sont ni payés ni retenus pour l’instant. Mets-toi d’accord par écrit avec les parents.';

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
  const decompteAConfirmer = cpAConfirmerEntre(ctx, debutDecompte(ctx, y), fin);
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
export function baseDixieme(ctx: Ctx, y: number, enfants = 0): { base: number; manquants: Month[]; aConfirmer: boolean; evenementAConfirmer: number; joursCpAConfirmer: number } {
  return memo(ctx, `b10${y}|${enfants}`, () => {
    const p = cpPeriod(y);
    let base = 0;
    let aConfirmer = false;
    let evenementAConfirmer = 0, joursCpAConfirmer = 0;
    const manquants: Month[] = [];
    for (const m of monthsBetween(monthOf(p.from), monthOf(p.to))) {
      const b = monthBase(ctx, m);
      if (!b.active) continue;
      if (b.missing) manquants.push(m);
      base += b.net;
      // T-025 C-5 : salaire d'événement familial à confirmer, hors de `b.net`. CCN 48.1.3.1.1 : ces congés « sont
      // assimilés à du temps de travail effectif pour la détermination du droit à congés payés ».
      // T-030 : comprend aussi les congés pris peut-être au-delà des droits (année complète, A-23).
      evenementAConfirmer += b.evenementAConfirmer;
      joursCpAConfirmer += b.joursCpAConfirmer;
      if (!b.fromHistory) {
        const cp = cpForMonth(ctx, m, enfants);
        base += cp.indemnite + cp.complement;
        // Une indemnité de congés à confirmer manque dans la base : le dixième l'est aussi.
        if (cp.aConfirmer) aConfirmer = true;
      }
    }
    return { base, manquants, aConfirmer, evenementAConfirmer, joursCpAConfirmer };
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
  /** Indemnité à confirmer : ni `jours` ni `montant` ne doivent être affichés ou payés */
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
    const { base, manquants, aConfirmer: baseAC, evenementAConfirmer: evAC, joursCpAConfirmer: evCp } = baseDixieme(ctx, y, enfants);
    const dix = Math.round(base / 10);
    const at = `${y + 1}-06-01`;
    const mt = maintien(ctx, acq.jours, at);
    const out: IndemniteCP = {
      startYear: y, jours: acq.jours, dixieme: dix, maintien: mt, montant: Math.max(dix, mt),
      methode: dix > mt ? 'dixieme' : 'maintien', manquants,
    };
    if (acq.aConfirmer) {
      const montants = acq.aConfirmer.lectures.map((l) => ({ libelle: l.libelle, jours: l.jours, montant: Math.max(dix, maintien(ctx, l.jours, at)) }));
      const vus = new Map<number, string[]>();
      for (const x of montants) vus.set(x.montant, [...(vus.get(x.montant) ?? []), x.libelle]);
      const detail = montants.length && !baseAC
        ? ` Selon la lecture, l’indemnité serait de ${[...vus].map(([v, l]) => `${euros(v)} (${l.join(' ou ')})`).join(', ou de ')}.`
        : '';
      const tous = [...montants, ...(acq.aConfirmer.controles ?? []).map((j) => ({ jours: j, montant: Math.max(dix, maintien(ctx, j, at)) }))];
      out.aConfirmer = { message: `Indemnité de congés payés à confirmer : elle dépend du nombre de jours acquis.${detail} ${acq.aConfirmer.message}`, montants, tous, baseSure: !baseAC };
    } else if (baseAC) {
      out.aConfirmer = { message: 'Indemnité de congés payés à confirmer : la règle du dixième compte l’indemnité de l’an dernier, qui est elle-même à confirmer.', montants: [], tous: [], baseSure: false };
    }
    // T-030 (A-26, C-CPI-13) : année incomplète, formule du maintien non tranchée. CCN 48.1.1.5 : « la rémunération brute
    // que le salarié aurait perçue pour une durée de travail égale à celle du congé payé », sans formule ; 102.1.2.2 renvoie
    // à 48.1.1.5. Urssaf (C-CPI-07) et DREETS Occitanie (C-CPI-03, C-CPI-04) : jours ÷ 6 × heures par semaine × taux.
    // DREETS Bourgogne-Franche-Comté (fiche 08, C-CPI-13 à C-CPI-15) : jours ÷ 26 × salaire mensualisé. Les deux formules
    // coïncident en année complète, pas en année incomplète : si l'indemnité change, elle est à confirmer.
    const tAt = termsAt(ctx.c, at);
    if (tAt.yearType === 'incomplete') {
      const sm = salaireMensualise(tAt);
      const m26 = (j: number) => Math.max(dix, Math.round((j * sm) / 26));
      const l26 = 'maintien au 1/26 du salaire mensualisé (DREETS Bourgogne-Franche-Comté)';
      if (out.aConfirmer) {
        if (out.aConfirmer.baseSure) {
          const extra = [...out.aConfirmer.montants.map((x) => x.jours), ...(acq.aConfirmer?.controles ?? [])].map((j) => ({ jours: j, montant: m26(j) }));
          if (extra.some((x) => !out.aConfirmer!.tous.some((t) => t.jours === x.jours && t.montant === x.montant))) {
            out.aConfirmer = { ...out.aConfirmer, tous: [...out.aConfirmer.tous, ...extra],
              message: `${out.aConfirmer.message} La formule du maintien de salaire n’est pas tranchée non plus en année incomplète (jours ÷ 6 × heures par semaine, ou ${l26}).` };
          }
        }
      } else if (m26(acq.jours) !== out.montant) {
        const montants = [
          { libelle: 'maintien en semaines : jours ÷ 6 × heures par semaine × taux (Urssaf, DREETS Occitanie)', jours: acq.jours, montant: out.montant },
          { libelle: l26, jours: acq.jours, montant: m26(acq.jours) },
        ];
        out.aConfirmer = {
          message: `Indemnité de congés payés à confirmer : la formule du maintien de salaire n’est pas tranchée en année incomplète. ${euros(out.montant)} (${montants[0].libelle}), ou ${euros(m26(acq.jours))} (${l26}). Aucun texte ne dit laquelle retenir. En attendant une réponse officielle, mets-toi d’accord par écrit avec les parents.`,
          montants, tous: montants, baseSure: !baseAC,
        };
      }
    }
    // T-025 C-5 : si le salaire d'événement à confirmer change l'indemnité (le dixième l'emporte), l'indemnité est à
    // confirmer, avec les deux montants. S'il ne la change pas (le maintien l'emporte dans les deux cas), rien ne change.
    if (evAC > 0) {
      const avec = Math.max(Math.round((base + evAC) / 10), mt);
      if (avec !== out.montant) {
        const msg = `L’indemnité de congés payés dépend d’un salaire ${evCp ? 'd’événement familial ou de congés pris au-delà des droits' : 'd’événement familial'} encore à confirmer (${euros(evAC)}) : ${euros(avec)} s’il est payé, ${euros(out.montant)} sinon.`;
        if (out.aConfirmer) {
          out.aConfirmer = { ...out.aConfirmer, message: `${out.aConfirmer.message} ${msg}`, baseSure: false };
        } else {
          const montants = [
            { libelle: 'événement familial payé', jours: acq.jours, montant: avec },
            { libelle: 'événement familial non payé', jours: acq.jours, montant: out.montant },
          ];
          out.aConfirmer = { message: `Indemnité de congés payés à confirmer. ${msg}`, montants, tous: montants, baseSure: true };
        }
      }
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
  /** Somme due ce mois mais à confirmer : non comptée dans le salaire du mois (T-019) */
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
      // Jours acquis à confirmer : si les deux lectures donnent le même versement ce mois-ci, ce versement est sûr.
      const lectures = ind.aConfirmer
        ? (ind.aConfirmer.baseSure && ind.aConfirmer.montants.length ? ind.aConfirmer.tous.map((l) => part(l.jours, l.montant)) : [])
        : [part(ind.jours, ind.montant)];
      const r = lectures[0];
      const sur = !!r && lectures.every((x) => x.n === r.n && x.montant === r.montant);
      if (ind.aConfirmer && !sur) {
        if (before + inMonth > 0 && inMonth > 0) return aConfirmer();
      } else if (r && r.n > 0) {
        out.jours = r.n;
        out.indemnite = r.montant;
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
