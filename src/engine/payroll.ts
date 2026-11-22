// Moteur de paie d'un contrat d'assistante maternelle (CCN IDCC 3239). Montants en centimes entiers.
import {
  addDays, eachDay, firstDay, monthsBetween, lastDay, minutes, monthOf, mondayOf, daysBetween, addMonthsToDate,
  type ISODate, type Month,
} from './dates';
import { holidayName, isMayDay } from './holidays';
import { entretienPlancher, MESSAGE_PERIODE_NON_GEREE, netToBrut } from './rates';
import { statutJourEvenement } from './evenements';
import { controleKm, indemniteKmJour } from './km';
import { euros } from './money';
import { cpAConfirmerEntre, cpExces, cpExcesAConfirmer, MESSAGE_CP_AU_DELA_A_CONFIRMER } from './conges';
import { nonGeresPeriode } from './nonGeres';
import { baseHebdoMin, formePV, lecturePV, mensuelMinutesPV, messageBasePV, minutesPlanning, plagesDuJour, pvActif } from './planningVariable';
import { cddDeuxLectures, estCddMoinsUnMois, estCddSemainesSansAccueil } from './cdd';
import type { AmAbs, AmLeave, Contract, DayRec, Plage, Planning } from './model';

export interface Ctx {
  c: Contract;
  days: Map<ISODate, DayRec>;
  leaves: AmLeave[];
  today: ISODate;
  /** Enfants à charge de l'AM (2 jours de congés en plus chacun) : sert au contrôle des droits à congés (C-004) */
  enfants?: number;
  /** Dernière année où l'AM avait moins de 21 ans au 30 avril, si elle l'a cochée : jours pour enfants à charge (R-CP-03) */
  amMoins21Jusqu?: number;
  cache?: Map<string, unknown>;
  /**
   * T-045b : contexte construit par le calcul de fin de contrat (fin.ts), dont la date de fin vient de ce calcul et a déjà
   * été contrôlée face au préavis. Le contrôle de la date de fin saisie (controleFinContrat) n'y est pas refait.
   */
  finControlee?: boolean;
  /**
   * T-076 : seconde lecture du salaire d'un CDD (points P1 et P2 de regles/t076-cdd.md ; decisions-direction, section 2).
   * Absent : lecture 1, celle du contrat tel qu'il est saisi. Contexte construit par `ctxLectureCdd2`.
   */
  lectureCdd?: 2;
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

export function makeCtx(c: Contract, recs: DayRec[], leaves: AmLeave[], today: ISODate, enfants = 0, amMoins21Jusqu?: number): Ctx {
  const days = new Map<ISODate, DayRec>();
  for (const r of recs) if (r.cid === c.id) days.set(r.date, r);
  return { c, days, leaves, today, enfants, amMoins21Jusqu, cache: new Map() };
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

/** Heures mensualisées (en minutes) : hebdo × semaines ÷ 12 (art. 109). T-076 : planning variable, heures écrites au contrat. */
export function mensuelMinutes(c: Contract): number {
  if (pvActif(c)) return mensuelMinutesPV(c);
  return (weeklyMinutes(c.planning) * weeksPerYear(c)) / 12;
}

/** Part des heures mensualisées au-delà de 45 h par semaine (en minutes) : à déclarer en « heures majorées » (art. 96.4) */
export function mensuelMajoreesMinutes(c: Contract): number {
  // T-076 : planning variable, aucune semaine prévue au-delà de 45 h n'est calculée (refus, P-PV-3) : rien de majoré ici.
  if (pvActif(c)) return 0;
  return (Math.max(0, weeklyMinutes(c.planning) - H45) * weeksPerYear(c)) / 12;
}

export function weeksPerYear(c: Contract): number {
  return c.yearType === 'complete' ? 52 : Math.min(46, c.weeks);
}

/** Salaire de base mensualisé (net, centimes). Les heures contractuelles au-delà de 45 h/semaine sont majorées. */
export function salaireMensualise(c: Contract): number {
  // T-076 (spécification, section 1) : salaire mensualisé = heures mensualisées × taux (R-PV-03, règle commune).
  if (pvActif(c)) return Math.round(Math.round((c.heuresMensualisees ?? 0) * c.rateNet * 1e6) / 1e6);
  const h = weeklyMinutes(c.planning);
  const base = Math.min(h, H45) * c.rateNet + Math.max(0, h - H45) * c.rateNet * (1 + c.majoration / 100);
  return Math.round((base * weeksPerYear(c)) / 12 / 60);
}

export function joursMensualises(c: Contract): number {
  // T-076 : planning variable, pas de nombre de jours par semaine unique. Valeur indicative pour les écrans (moyenne du
  // cycle) ; le calcul du mois compte les jours prévus et payés du mois (computeRange).
  if (pvActif(c) && c.cycle?.length) return Math.ceil((c.cycle.reduce((s, p) => s + daysPerWeek(p), 0) / c.cycle.length) * weeksPerYear(c) / 12 - 1e-9);
  return Math.ceil((daysPerWeek(c.planning) * weeksPerYear(c)) / 12 - 1e-9);
}

export function inContract(c: Contract, d: ISODate): boolean {
  return d >= c.start && (!c.end || d <= c.end);
}

export function amLeaveOn(leaves: AmLeave[], d: ISODate): AmAbs | undefined {
  return amLeaveAt(leaves, d)?.type;
}

export function amLeaveAt(leaves: AmLeave[], d: ISODate): AmLeave | undefined {
  for (const l of leaves) if (d >= l.from && d <= l.to) return l;
  return undefined;
}

/** Plages prévues au planning ce jour-là (hors semaines sans accueil, hors contrat) */
export function plannedPlages(c: Contract, d: ISODate): Plage[] {
  if (!inContract(c, d)) return [];
  const t = termsAt(c, d);
  // Semaines sans accueil du contrat et de ses avenants réunies, comme pour le contrôle (seconde relecture, point 5a).
  if (t.yearType === 'incomplete' && toutesSemainesSansAccueil(c).has(mondayOf(d))) return [];
  // T-076 : plages du planning fixe, ou de la semaine (cycle ou planning remis) en planning variable.
  return plagesDuJour(t, d);
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
  /** Jour de congé payé peut-être au-delà des droits, selon la lecture de l'acquisition (T-030, A-23) : à confirmer */
  cpAConfirmer?: boolean;
  /** T-033 : jour d'enfant malade (certificat) que les lectures de l'art. 105 retiennent ou paient selon le cas */
  maladieAConfirmer?: boolean;
  /**
   * Jour d'événement familial à confirmer (T-023, R-ABS-06) : ni payé ni retenu. Son montant est sorti du salaire du
   * mois et affiché « à confirmer » ; la raison dit quoi renseigner.
   */
  aConfirmer?: string;
  /** T-035b : absence de l'enfant notée « sans solde » (ancienne option), désormais payée */
  sansSoldeEnfantPaye?: boolean;
}

/** T-030 : nature du salaire mis « à confirmer » dans le mois (événement familial, congés au-delà des droits, ou les deux) */
/** T-035b : alerte du jour noté « sans solde » avant la correction (CCN art. 105 ; CASF L423-20). */
export const messageSansSoldeEnfant = (d: ISODate): string =>
  `Absence du ${d.slice(8, 10)}/${d.slice(5, 7)} notée « sans solde » : elle est payée. La convention (article 105) ne permet de retenir une absence de l’enfant qu’en cas de maladie avec certificat. Pour ne plus payer ces jours, il faut un avenant signé qui change le planning.`;

/** T-038 (G-1) : alerte d'un mois terminé dont des jours notés « sans solde » sont désormais payés (CCN art. 105). */
export const messageMoisSansSoldeChange = (n: number): string =>
  `Salaire de ce mois modifié par la mise à jour de l’app : ${dayCountLabel(n)} d’absence de l’enfant noté${n > 1 ? 's' : ''} « sans solde » ${n > 1 ? 'sont' : 'est'} maintenant payé${n > 1 ? 's' : ''}. Avant, l’app les retenait. La convention (article 105) ne permet de retenir une absence de l’enfant qu’en cas de maladie avec certificat. Si ce mois est déjà déclaré à Pajemploi avec la retenue, le salaire déclaré était trop bas : il faut une régularisation avec les parents.`;

export function libelleSalaireAConfirmer(b: Pick<MonthBase, 'joursCpAConfirmer' | 'joursEvenementAConfirmer'> & Partial<Pick<MonthBase, 'joursMaladieAConfirmer'>>, et = 'et'): string {
  return joindre(naturesAConfirmer(b).map((n) => ({ evenement: 'd’événement familial', cp: 'de congés', maladie: 'd’enfant malade' })[n]), et);
}

/** T-033 : natures des jours mis « à confirmer » dans le mois, dans l'ordre d'affichage (événement par défaut) */
export function naturesAConfirmer(b: Partial<Pick<MonthBase, 'joursCpAConfirmer' | 'joursEvenementAConfirmer' | 'joursMaladieAConfirmer'>>): ('evenement' | 'cp' | 'maladie')[] {
  const out: ('evenement' | 'cp' | 'maladie')[] = [];
  if (b.joursEvenementAConfirmer) out.push('evenement');
  if (b.joursCpAConfirmer) out.push('cp');
  if (b.joursMaladieAConfirmer) out.push('maladie');
  return out.length ? out : ['evenement'];
}
export const joindre = (l: string[], et = 'et') => (l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} ${et} ${l.at(-1)}`);

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
      } else if (amLeave === 'cp' && termsAt(c, d).yearType === 'complete' && cpExcesAConfirmer(ctx).has(d)) {
        // T-030 (A-23) : droits à confirmer, ce jour est payé dans une lecture et sans solde dans l'autre.
        info.inDivisor = true;
        info.aConfirmer = MESSAGE_CP_AU_DELA_A_CONFIRMER;
        info.cpAConfirmer = true;
      } else if (amLeave === 'am_malade' || amLeave === 'am_enfant_malade' || amLeave === 'sans_solde') {
        // T-034 : congé sans solde = absence non rémunérée, retenue par la déduction d'absence de l'art. 111. Fiches DREETS
        // Occitanie du 19/01/2023, section 3 : « Absence du salarié pour congés sans solde » ; Urssaf « gérer les absences
        // de votre salarié » (17/09/2026) : « raison personnelle » parmi « Les absences engendrant une minoration de la
        // rémunération », formule en heures (52 semaines) ou en jours (46 semaines ou moins).
        info.deducted = true;
        info.inDivisor = true;
      } else if (amLeave === 'evenement') {
        info.inDivisor = true;
        const st = statutJourEvenement(amLeaveAt(ctx.leaves, d)!, d, ctx.leaves);
        if (!st.paye) info.aConfirmer = st.raison;
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
      // T-035b : plus de retenue. CCN art. 105 al. 1 : « les temps d'absence non prévus sont rémunérés » ; seule exception,
      // l'absence justifiée par certificat médical ou bulletin d'hospitalisation (art. 105 al. 2 et 3). CASF L423-20 : maintien
      // de la rémunération sauf fait de l'AM ou maladie attestée. Aucun texte ne prévoit de retenue sur accord écrit. Le jour
      // noté « sans solde » (saisies d'avant) est payé comme une absence voulue par les parents, et signalé.
      if (rec.abs === 'sans_solde_enfant') info.sansSoldeEnfantPaye = true;
      if (rec.abs === 'malade_certif') {
        const sick = sickLectures(ctx);
        info.deducted = sick.retenus.has(d);
        const raison = sick.aConfirmer.get(d);
        if (raison) { info.aConfirmer = raison; info.maladieAConfirmer = true; }
      }
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
 *  5 jours consécutifs ou non, et une absence de 14 jours calendaires consécutifs. Au-delà : rémunérés.
 *  T-033 (A-17) : jours retenus dans les deux lectures ci-dessous seulement. */
export function sickDeductible(ctx: Ctx): Set<ISODate> {
  return sickLectures(ctx).retenus;
}

/**
 * T-033 (A-15, A-17 ; regles/t020-comparatifs.md). CCN art. 105 : « en cas de courtes absences de l'enfant, pas
 * nécessairement consécutives, dans la limite de 5 jours d'absence » ; « en cas d'absence durant 14 jours calendaires
 * consécutifs ». Le texte ne dit pas où classer une absence de plus de 5 jours qui dure moins de 14 jours calendaires.
 * - Lecture 1 (app avant T-033) : toute absence de plus de 5 jours est l'absence longue, retenue en entier (14 jours
 *   calendaires au plus), sans entamer les 5 jours.
 * - Lecture 2 (DREETS BFC 2026, fiche 03, IV : « Une absence de 9 jours consécutifs devra ainsi être considérée comme
 *   une absence courte et les 4 derniers jours devront faire l'objet d'une rémunération ») : seule une absence d'au moins
 *   14 jours calendaires consécutifs est l'absence longue ; une absence plus courte entame les 5 jours, le reste est payé.
 * Un jour retenu dans les deux lectures est retenu ; payé dans les deux, payé ; sinon « à confirmer » (ni payé ni
 * retenu). Le choix de l'une modifie aussi les absences suivantes de la même période de 12 mois : elles sont comparées
 * de la même façon.
 */
export function sickLectures(ctx: Ctx): { retenus: Set<ISODate>; aConfirmer: Map<ISODate, string> } {
  return memo(ctx, 'sick', () => {
    const { c } = ctx;
    const prevu = (x: ISODate) => plannedPlages(c, x).length > 0;
    // Jour prévu où l'enfant n'est pas attendu : férié chômé ou congé de l'AM. Le certificat peut le couvrir ou non.
    const sansAccueilPrevu = (x: ISODate): 'ferie' | 'conge' | undefined =>
      !prevu(x) ? undefined : holidayName(x) && !ctx.days.get(x)?.ferieTravaille ? 'ferie' : amLeaveOn(ctx.leaves, x) ? 'conge' : undefined;
    const sansAccueil = (x: ISODate) => !prevu(x) || !!sansAccueilPrevu(x);
    const certDays = [...ctx.days.values()]
      .filter((r) => r.abs === 'malade_certif' && prevu(r.date) && !sansAccueilPrevu(r.date))
      .map((r) => r.date)
      .sort();
    // Épisodes : jours certifiés consécutifs, en sautant les jours sans accueil prévu. `joindre` : en sautant aussi les
    // fériés chômés et les congés de l'AM (un même certificat peut les couvrir, ou deux certificats les encadrer).
    // `couper` (T-041 suite 2, ambiguïté a) : une absence qui chevauche la date anniversaire du contrat est coupée en deux,
    // chaque partie comptant dans sa période de 12 mois.
    const episodesDe = (joindre: boolean, couper = false): ISODate[][] => {
      const episodes: ISODate[][] = [];
      for (const d of certDays) {
        const last = episodes.at(-1);
        if (last) {
          const prev = last.at(-1)!;
          let joined = !couper || contractYearIndex(c, prev) === contractYearIndex(c, d);
          for (let x = addDays(prev, 1); joined && x < d; x = addDays(x, 1)) {
            if (prevu(x) && !(joindre && sansAccueilPrevu(x))) { joined = false; break; }
          }
          if (joined) { last.push(d); continue; }
        }
        episodes.push([d]);
      }
      return episodes;
    };
    // T-041 suite : dates du certificat que l'app ne connaît pas. Le certificat peut commencer dès le lendemain du dernier
    // jour d'accueil prévu avant l'absence, et finir la veille du suivant (13 jours au plus de chaque côté).
    const debutAuPlusTot = (d: ISODate, memePeriode = false): ISODate => {
      let s = d;
      for (let x = addDays(d, -1), n = 0; n < 13 && x >= c.start && sansAccueil(x) && (!memePeriode || contractYearIndex(c, x) === contractYearIndex(c, d)); x = addDays(x, -1), n++) s = x;
      return s;
    };
    const finAuPlusTard = (d: ISODate, memePeriode = false): ISODate => {
      let e = d;
      for (let x = addDays(d, 1), n = 0; n < 13 && (!c.end || x <= c.end) && sansAccueil(x) && (!memePeriode || contractYearIndex(c, x) === contractYearIndex(c, d)); x = addDays(x, 1), n++) e = x;
      return e;
    };
    const trackedYear = contractYearIndex(c, c.trackedFrom);
    // T-041 suite 2. `longue14` (ambiguïté b) : une absence de 14 jours calendaires ou plus qui ne compte que 5 jours
    // d'accueil ou moins est l'absence longue (sinon : absence courte). `soldeLong` (ambiguïté c) : les jours déjà retenus
    // avant l'app viennent d'une absence longue (sinon : d'absences courtes, et d'une absence longue au-delà de 5).
    type Variante = { longueSiPlusDe5: boolean; debutTot: boolean; finTard: boolean; joindre: boolean; couper: boolean; longue14: boolean; soldeLong: boolean };
    const deja = c.balances.maladieDeduits;
    const lecture = (v: Variante): Set<ISODate> => {
      const out = new Set<ISODate>();
      const yearState = new Map<number, { left: number; longUsed: boolean }>();
      for (const ep of episodesDe(v.joindre, v.couper)) {
        const debut = v.debutTot ? debutAuPlusTot(ep[0], v.couper) : ep[0];
        const fin = v.finTard ? finAuPlusTard(ep.at(-1)!, v.couper) : ep.at(-1)!;
        const y = contractYearIndex(c, debut);
        let st = yearState.get(y);
        if (!st) {
          st = y !== trackedYear || deja <= 0 ? { left: 5, longUsed: false }
            : v.soldeLong ? { left: 5, longUsed: true } : { left: 5 - Math.min(5, deja), longUsed: deja > 5 };
          yearState.set(y, st);
        }
        const calendaires = daysBetween(debut, fin) + 1;
        const longue = (ep.length > 5 && (v.longueSiPlusDe5 || calendaires >= 14)) || (v.longue14 && calendaires >= 14);
        if (v.longue14 && ep.length <= 5 && calendaires >= 14 && !st.longUsed) {
          const limit = addDays(debut, 13);
          ep.filter((d) => d <= limit).forEach((d) => out.add(d));
          st.longUsed = true;
        } else if (ep.length <= st.left) {
          ep.forEach((d) => out.add(d));
          st.left -= ep.length;
        } else if (longue && !st.longUsed) {
          // L'absence longue : retenue sur 14 jours calendaires consécutifs au plus, sans entamer les 5 jours.
          const limit = addDays(debut, 13);
          ep.filter((d) => d <= limit).forEach((d) => out.add(d));
          st.longUsed = true;
        } else {
          ep.slice(0, st.left).forEach((d) => out.add(d));
          st.left = 0;
        }
      }
      return out;
    };
    // Toutes les combinaisons : deux lectures du texte × dates du certificat (début, fin, férié ou congé couvert).
    const variantes: (Variante & { res: Set<ISODate> })[] = [];
    const B = [false, true];
    for (const longueSiPlusDe5 of [true, false]) for (const debutTot of B) for (const finTard of B) for (const joindre of B)
      for (const couper of B) for (const longue14 of B) for (const soldeLong of deja > 0 ? B : [false]) {
        const v = { longueSiPlusDe5, debutTot, finTard, joindre, couper, longue14, soldeLong };
        variantes.push({ ...v, res: lecture(v) });
      }
    const CLES = ['longueSiPlusDe5', 'debutTot', 'finTard', 'joindre', 'couper', 'longue14', 'soldeLong'] as const;
    const base = (l: boolean) => variantes.find((v) => v.longueSiPlusDe5 === l && CLES.slice(1).every((k) => !v[k]))!.res;
    const l1 = base(true), l2 = base(false);
    const retenus = new Set([...l1].filter((d) => variantes.every((v) => v.res.has(d))));
    // Une dimension compte pour un jour si, à lecture et autres dates égales, la changer change le jour.
    const compte = (d: ISODate, dim: (typeof CLES)[number]) => variantes.some((v) => {
      const w = variantes.find((x) => CLES.every((k) => k === dim ? x[k] !== v[k] : x[k] === v[k]));
      return !!w && v.res.has(d) !== w.res.has(d);
    });
    const aConfirmer = new Map<ISODate, string>();
    for (const ep of episodesDe(false)) {
      const diff = ep.filter((d) => !variantes.every((v) => v.res.has(d) === l1.has(d)));
      if (!diff.length) continue;
      const fin = ep.at(-1)!;
      const parties: string[] = [];
      if (diff.some((d) => l1.has(d) !== l2.has(d))) {
        parties.push('La convention (article 105) prévoit 5 jours d’absences courtes et une absence de 14 jours calendaires consécutifs. Elle ne dit pas où classer une absence de plus de 5 jours qui dure moins de 14 jours, ni comment cela compte pour les absences suivantes. Selon la lecture, ces jours sont retenus ou payés, et aucune source officielle ne tranche.');
      }
      const dates: string[] = [];
      const joint = diff.some((d) => compte(d, 'joindre'));
      // Bornes affichées : celles de l'absence réunie quand un férié ou un congé peut la relier à une autre.
      const tous = joint ? episodesDe(true).find((e) => e.includes(ep[0]))! : ep;
      if (diff.some((d) => compte(d, 'debutTot'))) dates.push(`le premier jour du certificat (entre le ${jjmm(debutAuPlusTot(tous[0]))} et le ${jjmm(tous[0])})`);
      if (diff.some((d) => compte(d, 'finTard'))) dates.push(`le dernier jour du certificat (entre le ${jjmm(tous.at(-1)!)} et le ${jjmm(finAuPlusTard(tous.at(-1)!))})`);
      if (joint) {
        const trous: string[] = [];
        for (let x = tous[0]; x <= tous.at(-1)!; x = addDays(x, 1)) {
          const k = sansAccueilPrevu(x);
          if (k) trous.push(`${k === 'ferie' ? 'le férié' : 'le congé'} du ${jjmm(x)}`);
        }
        dates.push(`si un même certificat couvre aussi ${trous.join(', ')} (une seule absence) ou non`);
      }
      const lectures: string[] = [];
      if (diff.some((d) => compte(d, 'couper'))) {
        // Date anniversaire qui tombe dans l'absence la plus large possible (dates du certificat et férié compris).
        const touche = episodesDe(true).find((e) => e.includes(ep[0]))!;
        const a = addMonthsToDate(c.start, 12 * contractYearIndex(c, finAuPlusTard(touche.at(-1)!)));
        lectures.push(`l’absence chevauche la date anniversaire du contrat (${jjmm(a)}) : la convention apprécie les limites « par période de 12 mois glissants » sans dire dans quelle période compter une absence qui touche les deux`);
      }
      if (diff.some((d) => compte(d, 'longue14'))) {
        lectures.push('l’absence dure 14 jours calendaires ou plus mais compte 5 jours d’accueil ou moins : la convention ne dit pas si c’est une absence courte (dans la limite des 5 jours) ou l’absence de 14 jours calendaires consécutifs');
      }
      if (diff.some((d) => compte(d, 'soldeLong'))) {
        lectures.push(`${dayCountLabel(deja)} déjà retenus avant le suivi par l’app : l’app ne sait pas s’ils venaient d’absences courtes ou d’une absence de 14 jours calendaires, et cela change les limites restantes`);
      }
      if (lectures.length) parties.push(`${parties.length ? 'Autres points que' : 'Points que'} la convention (article 105) ne tranche pas : ${lectures.join(' ; ')}.`);
      if (dates.length) {
        parties.push(`Le résultat dépend ${parties.length ? 'aussi ' : ''}de dates que l’app ne connaît pas : ${dates.join(' ; ')}. La convention (article 105) compte 14 jours calendaires consécutifs et ne dit pas si les jours sans accueil couverts par le certificat en font partie. L’app ne devine pas : ces jours restent à confirmer.`);
      }
      const nb = variantes.map((v) => ep.filter((d) => v.res.has(d)).length);
      parties.push(`Selon la lecture et les dates, ${Math.min(...nb)} à ${Math.max(...nb)} jours de cette absence sont retenus.`);
      const raison = `Enfant malade du ${jjmm(ep[0])} au ${jjmm(fin)} : ${dayCountLabel(diff.length)} ni payé${diff.length > 1 ? 's' : ''} ni retenu${diff.length > 1 ? 's' : ''}. ${parties.join(' ')} Mets-toi d’accord avec les parents, par écrit, avant de déclarer.`;
      for (const d of diff) aConfirmer.set(d, raison);
    }
    return { retenus, aConfirmer };
  });
}

const jjmm = (d: ISODate) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function contractYearIndex(c: Contract, d: ISODate): number {
  let i = 0;
  while (addMonthsToDate(c.start, 12 * (i + 1)) <= d) i++;
  return i;
}

/**
 * Minutes prévues d'un jour qui comptent dans le seuil des 45 h de la semaine.
 * Art. 96-4 : sont majorées les « heures de travail effectuées au-delà de 45 heures de travail par semaine ».
 * Art. 99 : le travail commence et finit aux heures prévues, même si l'enfant arrive plus tard ou part plus tôt.
 * Comptent donc : les jours d'accueil (heures prévues entières), les absences de l'enfant payées (l'AM reste
 * à disposition : absence voulue par les parents, absence notée « sans solde » avant T-035b et désormais payée,
 * maladie sans certificat, maladie avec certificat au-delà des limites de l'art. 105), et les congés payés de l'AM
 * (Cass. soc. 10 sept. 2025, n° 23-14.455).
 * Ne comptent pas : les jours retenus sur le salaire (maladie avec certificat retenue, congé sans solde de l'AM,
 * congés pris sans droits), les absences de l'AM autres que les congés payés (dont l'événement familial),
 * et les jours fériés chômés (art. 47 ; Cass. soc. 1er déc. 2004 et 4 avr. 2012).
 */
export function minutesSeuil45(ctx: Ctx, d: ISODate): number {
  const di = dayInfo(ctx, d);
  if (di.plannedMin <= 0) return 0;
  switch (di.kind) {
    case 'present':
    case 'prevu':
      return di.plannedMin;
    case 'absent':
      return di.deducted ? 0 : di.plannedMin;
    case 'am':
      return di.amLeave === 'cp' && !di.cpSansDroits ? di.plannedMin : 0;
    default:
      return 0;
  }
}

/** Heures complémentaires et majorées, calculées par semaine civile (art. 96-4 et 110) */
export function weekOvertime(ctx: Ctx, monday: ISODate): Map<ISODate, { compl: number; maj: number }> {
  return weekOvertimeDetail(ctx, monday).parJour;
}

/**
 * Détail d'une semaine. `parJour` : heures complémentaires et majorées par jour (mois de rattachement). T-076, lecture L2 :
 * `complPrevu` (part des heures complémentaires qui sont des heures prévues au-delà de la base, sert à la régularisation) et
 * `complAConfirmer` (heures complémentaires de plus si les jours de congés payés comptent dans les heures réelles).
 */
export function weekOvertimeDetail(ctx: Ctx, monday: ISODate): { parJour: Map<ISODate, { compl: number; maj: number; complPrevu?: number; complAConfirmer?: number }> } {
  return memo(ctx, 'wkd' + monday, () => {
    const base = weekOvertimeL1(ctx, monday);
    const t = termsAt(ctx.c, monday);
    if (!pvActif(t) || lecturePV(t) !== 'L2') return { parJour: base };
    return { parJour: weekOvertimeL2(ctx, monday, baseHebdoMin(t), base) };
  });
}

/**
 * T-076, lecture L2 + H2 (spécification, section 1 ; R-PV-04, P-PV-1, P-PV-2) : HC(s) = max(0 ; min(réel(s) ; 45 h) − B),
 * B = heures mensualisées × 12 ÷ (52 ou N). Les heures prévues au-delà de B sont des HC. Heures majorées (au-delà de 45 h,
 * R-PV-05) : inchangées (calcul de l'app, `base`). Écrit HC(s) = max(0 ; réel(s) − B − HM(s)) : même nombre quand rien
 * n'est maintenu, et un jour non travaillé mais payé (férié) ne compte pas dans le seuil des 45 h (minutesSeuil45).
 * Réel(s) : heures prévues qui comptent comme travail (minutesSeuil45 : présence, absence payée de l'enfant, congés payés)
 * plus les heures en plus, et :
 * - 1er mai chômé un jour prévu : ses heures comptent (décision D1 ; CCN 47.1 « Le chômage du 1er mai n'entraîne aucune
 *   réduction de la rémunération du salarié », tranché).
 * Deux lectures pour les points non tranchés ; la part sûre (lecture basse) est payée, l'écart est à confirmer :
 * - jour de congé payé : ses heures comptent ou non (lecture sûre : non, elles relèvent de l'indemnité de congés) ;
 * - absence de l'enfant payée (D13, même traitement que D1 ; CCN 105, CASF L423-20) : ses heures prévues comptent ou non ;
 * - autre férié chômé payé et jour d'événement familial payé : leurs heures prévues comptent ou non (D1 ; CCN 47.2
 *   « maintien de la rémunération brute habituelle » ; question DDETS) ;
 * - première et dernière semaine du contrat, coupées : base B entière, ou B × jours prévus de la semaine dans le contrat ÷
 *   jours prévus de la semaine entière (D4).
 * Rattachement au mois : les heures de la semaine sont rangées dans l'ordre des jours ; les HC vont au jour où elles tombent.
 */
function weekOvertimeL2(ctx: Ctx, monday: ISODate, B: number, base: Map<ISODate, { compl: number; maj: number }>): Map<ISODate, { compl: number; maj: number; complPrevu?: number; complAConfirmer?: number }> {
  const c = ctx.c;
  const jours = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const cpMin = (d: ISODate) => { const di = dayInfo(ctx, d); return di.kind === 'am' && di.amLeave === 'cp' && !di.cpSansDroits ? di.plannedMin : 0; };
  const mai1Min = (d: ISODate) => { const di = dayInfo(ctx, d); return di.kind === 'ferie' && isMayDay(d) ? di.plannedMin : 0; };
  // D13 : absence de l'enfant payée (comptée dans minutesSeuil45) : lecture sûre sans ses heures, lecture haute avec.
  const enfantPaye = (d: ISODate) => { const di = dayInfo(ctx, d); return di.kind === 'absent' && !di.deducted && !di.aConfirmer ? di.plannedMin : 0; };
  const autreMin = (d: ISODate) => {
    const di = dayInfo(ctx, d);
    if (di.kind === 'absent' && !di.deducted && !di.aConfirmer) return di.plannedMin;
    if (di.kind === 'ferie' && !isMayDay(d) && !di.deducted) return di.plannedMin;
    if (di.kind === 'am' && di.amLeave === 'evenement' && !di.aConfirmer && !di.deducted) return di.plannedMin;
    return 0;
  };
  // D4 : semaine coupée par le début ou la fin du contrat.
  const prevus = jours.filter((d) => planningBrutMin(termsAt(c, d), d) > 0);
  const dansContrat = prevus.filter((d) => inContract(c, d));
  const Bcoupee = prevus.length && dansContrat.length < prevus.length ? (B * dansContrat.length) / prevus.length : B;
  const hm = jours.reduce((a, d) => a + (base.get(d)?.maj ?? 0), 0);
  const ranger = (large: boolean) => {
    const morceaux = jours.map((d) => ({
      d,
      prevu: minutesSeuil45(ctx, d) - (large ? 0 : cpMin(d) + enfantPaye(d)) + mai1Min(d) + (large ? autreMin(d) - enfantPaye(d) : 0),
      extra: dayInfo(ctx, d).extraMin,
    }));
    const b = large ? Bcoupee : B;
    const total = Math.max(0, morceaux.reduce((a, x) => a + x.prevu + x.extra, 0) - b - hm);
    const out = new Map<ISODate, { prevu: number; extra: number }>();
    let pos = 0;
    const part = (n: number) => { const a = pos, e = pos + n; pos = e; return Math.max(0, Math.min(e, b + total) - Math.max(a, b)); };
    for (const x of morceaux) {
      const p = part(x.prevu), e = part(x.extra);
      if (p || e) out.set(x.d, { prevu: p, extra: e });
    }
    return out;
  };
  const sure = ranger(false), large = ranger(true);
  const out = new Map<ISODate, { compl: number; maj: number; complPrevu?: number; complAConfirmer?: number }>();
  for (const d of jours) {
    const s = sure.get(d), m = base.get(d);
    if (s || m) out.set(d, { compl: (s?.prevu ?? 0) + (s?.extra ?? 0), maj: m?.maj ?? 0, complPrevu: s?.prevu ?? 0 });
  }
  const tot = (x: Map<ISODate, { prevu: number; extra: number }>) => [...x.values()].reduce((a, v) => a + v.prevu + v.extra, 0);
  const ecart = tot(large) - tot(sure);
  if (ecart > 0) {
    // Écart rattaché au premier jour qui le cause (congé, férié, événement), sinon au premier jour du contrat de la semaine.
    const d = jours.find((x) => cpMin(x) > 0 || autreMin(x) > 0) ?? dansContrat[0] ?? jours.find((x) => inContract(c, x))!;
    const v = out.get(d) ?? { compl: 0, maj: 0, complPrevu: 0 };
    out.set(d, { ...v, complAConfirmer: ecart });
  }
  return out;
}

/**
 * T-076, décision D2 : lecture L2, absence retenue sur le salaire (art. 111) dans une semaine dont les heures prévues
 * dépassent la base B. Aucune règle ne dit comment combiner la déduction de l'art. 111 et la perte des HC prévues : les
 * mois des jours retenus ne sont pas calculés (passage 2). Renvoie les jours retenus concernés de [from, to].
 */
export function absencesL2NonGerees(ctx: Ctx, from: ISODate, to: ISODate): ISODate[] {
  const t = termsAt(ctx.c, from);
  if (!pvActif(t) || lecturePV(t) !== 'L2' || to < from) return [];
  const B = baseHebdoMin(t);
  // Revue 2 (B4 a) : toutes les semaines qui touchent [from, to], jour retenu dans ou hors de la période : une semaine à
  // cheval range ses HC dans les deux mois, les deux sont refusés.
  const out: ISODate[] = [];
  for (const l of [...new Set(eachDay(from, to).map(mondayOf))]) {
    const jours = Array.from({ length: 7 }, (_, i) => addDays(l, i));
    const prevu = jours.reduce((a, d) => a + dayInfo(ctx, d).plannedMin, 0);
    if (prevu <= B + 1e-9) continue;
    for (const d of jours) { const di = dayInfo(ctx, d); if (di.deducted && di.plannedMin > 0) out.push(d); }
  }
  return out;
}

export const messageAbsenceL2 = (jours: ISODate[]): string =>
  `Absence retenue sur ton salaire ${jours.length > 1 ? 'les' : 'le'} ${jours.map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`).join(', ')}, une semaine où tes heures prévues dépassent la base de ton contrat : non géré pour l’instant. La convention ne dit pas comment combiner la retenue sur le salaire mensualisé (article 111) et les heures complémentaires prévues que tu n’as pas faites. La question est posée à la DDETS. Fais ce mois sans l’app.`;

function weekOvertimeL1(ctx: Ctx, monday: ISODate): Map<ISODate, { compl: number; maj: number }> {
  return memo(ctx, 'wk' + monday, () => {
    const out = new Map<ISODate, { compl: number; maj: number }>();
    // Base de la semaine : heures prévues qui comptent comme heures de travail (voir minutesSeuil45).
    // Les heures en plus sous ce seuil sont payées au taux du contrat ; seules celles au-delà de 45 h sont majorées.
    let cum = 0;
    for (let i = 0; i < 7; i++) cum += minutesSeuil45(ctx, addDays(monday, i));
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
  /** Valeur nette de ces heures du contrat au-delà de 45 h (comprise dans `base`) */
  majContratAmount: number;
  complAmount: number;
  majAmount: number;
  /** T-076, lecture L2 : minutes d'heures complémentaires qui sont des heures prévues au-delà de la base (déjà dans complMin) */
  complPrevuMin?: number;
  /** T-076, lecture L2 : heures complémentaires à confirmer (jours de congés payés comptés ou non dans les heures réelles), hors du total */
  complAConfirmerMin?: number;
  complAConfirmerAmount?: number;
  ferieAmount: number;
  ferieDays: ISODate[];
  presenceDays: number;
  extraDays: number;
  entretien: number;
  repas: number;
  km: number;
  /**
   * Salaire net des jours d'événement familial à confirmer (T-023) : sorti de `net` et de `base`, affiché à part.
   * Les heures et jours déclarés sont calculés sans ces jours. Les raisons sont dans `alerts`.
   */
  evenementAConfirmer: number;
  /** Jours compris dans `evenementAConfirmer` qui sont des congés pris peut-être au-delà des droits (T-030) */
  joursCpAConfirmer: number;
  /** Jours compris dans `evenementAConfirmer` qui sont des jours d'événement familial */
  joursEvenementAConfirmer: number;
  /** T-033 : jours compris dans `evenementAConfirmer` qui sont des jours d'enfant malade (art. 105, lectures divergentes) */
  joursMaladieAConfirmer: number;
  /** Kilomètres saisis sans le nombre d'enfants transportés (CCN art. 113) : non payés, à confirmer (T-017) */
  kmAConfirmer: number;
  /** T-044 : part de l'indemnité d'entretien qui dépend d'une lecture non tranchée (tarif par jour, jour d'une autre durée) ; hors du total */
  entretienAConfirmer: number;
  /** T-044c : jours dont l'entretien est à confirmer, par raison (durée d'accueil ou de travail ; tarif par jour et durée différente du planning ; jour hors planning au tarif par jour) */
  entretienJoursDuree: number;
  entretienJoursTarifJour: number;
  entretienJoursHorsPlanning: number;
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
  /**
   * T-031 : cas non gérés qui touchent ce mois (Alsace-Moselle, horaires variables, accueil occasionnel, absence non
   * gérée). Non vide : le mois est refusé, aucun montant ne doit être affiché, envoyé ni additionné.
   */
  nonGere: string[];
}

export function monthBase(ctx: Ctx, m: Month): MonthBase {
  return memo(ctx, 'mb' + m, () => {
    const r = computeMonthBase(ctx, m);
    // T-031 : les mois repris de l'historique gardent les montants du bulletin réel ; les mois calculés sont refusés.
    if (r.active && !r.fromHistory) r.nonGere = nonGeresPeriode(ctx.c, ctx.leaves, firstDay(m), lastDay(m), ctx.finControlee ? 'non' : 'tout');
    // T-076, D2 : planning variable en lecture L2, absence retenue dans une semaine au-delà de la base.
    if (r.active && !r.fromHistory) { const j = absencesL2NonGerees(ctx, firstDay(m), lastDay(m)); if (j.length) r.nonGere.push(messageAbsenceL2(j)); }
    return r;
  });
}

function emptyBase(m: Month): MonthBase {
  return {
    month: m, active: false, fromHistory: false, missing: false, salaireMens: 0, mensuelMin: 0, divisorDays: 0,
    divisorMin: 0, contractDays: 0, contractMin: 0, deductedDays: 0, deductedMin: 0, paidFraction: 0, base: 0,
    retenue: 0, heuresNormales: 0, joursActivite: 0, complMin: 0, majMin: 0, majContratMin: 0, majContratAmount: 0, complAmount: 0, majAmount: 0,
    ferieAmount: 0, ferieDays: [], presenceDays: 0, extraDays: 0, entretien: 0, repas: 0, km: 0, evenementAConfirmer: 0, joursCpAConfirmer: 0, joursEvenementAConfirmer: 0, joursMaladieAConfirmer: 0, kmAConfirmer: 0, entretienAConfirmer: 0, entretienJoursDuree: 0, entretienJoursTarifJour: 0, entretienJoursHorsPlanning: 0, net: 0,
    alerts: [], forgotten: [], sickPaidNotice: false, nonGere: [],
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
const semainesCache = new WeakMap<Contract, Set<ISODate>>();
export function toutesSemainesSansAccueil(c: Contract): Set<ISODate> {
  let out = semainesCache.get(c);
  if (out) return out;
  out = new Set<ISODate>(c.weeksOff);
  for (const a of c.avenants ?? []) for (const w of a.changes.weeksOff ?? []) out.add(w);
  // T-076, D6 : planning remis, année incomplète : une semaine saisie « sans accueil » (0 h) est une semaine sans accueil du
  // contrat, comme pour un planning fixe (art. 111 : règle existante, ambiguïté A-19 inchangée).
  if (c.yearType === 'incomplete' && pvActif(c) && formePV(c) === 'remis') {
    for (const [l, p] of Object.entries(c.planningsSemaines ?? {})) if (minutesPlanning(p) === 0) out.add(l);
  }
  semainesCache.set(c, out);
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
  return plagesDuJour(t, d).reduce((s, p) => s + plageMin(p), 0);
}

/**
 * Régularisation (année incomplète, art. 109.2) : salaire des heures prévues réellement dues (hors absences retenues),
 * chacune au taux de son jour, moins le salaire de base versé par la mensualisation sur [from, to].
 * `cur` donne le salaire de base du mois en cours de calcul (évite la récursion).
 * T-038 (B-1, relecture V4) : les jours « à confirmer » (événement familial, enfant malade selon l'art. 105, congés au-delà
 * des droits) ne sont ni payés ni retenus dans leur mois ; leur salaire est montré à part. La régularisation ne doit pas
 * le verser en silence. Deux lectures : `dus` (ces jours sont dus, donc payés dans leur mois : leur salaire compte dans
 * les heures dues et dans ce qui est versé) ; `retenus` (ils ne sont pas dus : ni dans les heures dues ni dans ce qui est
 * versé). Voir `regularisationLectures`.
 */
export function regularisation(ctx: Ctx, from: ISODate, to: ISODate, cur?: { m: Month; payees: number; aConfirmer?: number }, lecture: 'dus' | 'retenus' = 'dus'): { minutes: number; montant: number } {
  const c = ctx.c;
  if (to < from) return { minutes: 0, montant: 0 };
  let dues = 0, payees = 0;
  for (const d of eachDay(from, to)) {
    const di = dayInfo(ctx, d);
    if (di.inDivisor && !di.deducted && !(lecture === 'retenus' && di.aConfirmer)) dues += (di.plannedMin * termsAt(c, d).rateNet) / 60;
  }
  for (const m of monthsBetween(monthOf(from), monthOf(to))) {
    if (cur && m === cur.m) { payees += cur.payees + (lecture === 'dus' ? cur.aConfirmer ?? 0 : 0); continue; }
    const b = monthBase(ctx, m);
    if (!b.active || b.fromHistory) continue;
    // T-076 (L2) : les heures prévues au-delà de la base, payées en heures complémentaires, sont déjà versées (au taux du contrat).
    const verse = b.base + (lecture === 'dus' ? b.evenementAConfirmer : 0) + Math.round(((b.complPrevuMin ?? 0) * termsAt(c, lastDay(m)).rateNet) / 60);
    if (m === monthOf(from) && from > c.start && from.slice(8) !== '01') {
      // Mois entamé : seule la part postérieure au début de la période compte.
      let part = 0;
      for (const d of eachDay(from, lastDay(m))) if (inContract(c, d)) part += planningBrutMin(termsAt(c, d), d);
      payees += (verse * part) / (b.contractMin || 1);
    } else {
      payees += verse;
    }
  }
  const montant = Math.max(0, Math.round(dues - payees));
  const taux = termsAt(c, to).rateNet;
  return { minutes: taux ? Math.round((montant * 60) / taux) : 0, montant };
}

/** T-038 (B-1) : les deux lectures de la régularisation ; `sure` faux si elles diffèrent (montant « à confirmer »). */
export function regularisationLectures(ctx: Ctx, from: ISODate, to: ISODate, cur?: { m: Month; payees: number; aConfirmer?: number }): { dus: { minutes: number; montant: number }; retenus: { minutes: number; montant: number }; sure: boolean } {
  const dus = regularisation(ctx, from, to, cur, 'dus');
  const retenus = regularisation(ctx, from, to, cur, 'retenus');
  return { dus, retenus, sure: dus.montant === retenus.montant };
}

/** T-038 (B-1) : phrase qui explique les deux lectures d'une régularisation qui dépend de jours « à confirmer » */
export const libelleRegulJoursAConfirmer = (dus: number, retenus: number): string =>
  `${euros(dus)} si les jours à confirmer sont dus (leur salaire, montré à part dans leur mois, reste alors à payer en plus), ${euros(retenus)} s’ils ne le sont pas`;

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
    // T-038 (M-5, relecture V4) : une absence non gérée (maternité, accident du travail…) n'a pas de branche dans computeDay :
    // ses jours compteraient comme travaillés. Pas de régularisation, refus clair (même règle que les mois, T-031).
    const ng = nonGeresPeriode(c, ctx.leaves, start, veille, ctx.finControlee ? 'non' : 'tout');
    if (ng.length) {
      r.alerts.push(`Régularisation à l’avenant du ${a.from.slice(8, 10)}/${a.from.slice(5, 7)} non calculée : un cas non géré par l’app touche la période depuis le ${start.split('-').reverse().join('/')}. ${ng.join(' ')} Calcule-la avec les parents.`);
      continue;
    }
    const cur = a.from.slice(8) !== '01' && firstPart ? { m, payees: firstPart.base, aConfirmer: firstPart.evenementAConfirmer } : undefined;
    const lect = regularisationLectures(ctx, start, veille, cur);
    if (!lect.sure) {
      // T-038 (B-1) : rien n'est versé ; les deux montants sont montrés.
      r.alerts.push(`Régularisation à l’avenant du ${a.from.slice(8, 10)}/${a.from.slice(5, 7)} à confirmer, non comprise dans le total : elle dépend de jours encore à confirmer depuis le ${start.split('-').reverse().join('/')} (voir les mois concernés). ${libelleRegulJoursAConfirmer(lect.dus.montant, lect.retenus.montant).replace(/^./, (x) => x.toUpperCase())}.`);
      continue;
    }
    const reg = lect.dus;
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

const SUM_KEYS = ['base', 'retenue', 'majContratMin', 'majContratAmount', 'joursActivite', 'complMin', 'majMin', 'complAmount', 'majAmount', 'complPrevuMin', 'complAConfirmerMin', 'complAConfirmerAmount', 'ferieAmount',
  'presenceDays', 'extraDays', 'entretien', 'repas', 'km', 'evenementAConfirmer', 'joursCpAConfirmer', 'joursEvenementAConfirmer', 'joursMaladieAConfirmer', 'kmAConfirmer', 'entretienAConfirmer', 'entretienJoursDuree', 'entretienJoursTarifJour', 'entretienJoursHorsPlanning', 'net', 'contractDays', 'contractMin', 'deductedDays', 'deductedMin', 'normalesMin'] as const;

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
  // Parts fractionnaires des jours mensualisés (C-003) : arrondies une seule fois, à l'entier supérieur,
  // comme la règle Pajemploi des jours mensualisés (joursMensualises).
  r.joursActivite = Math.ceil(r.joursActivite - 1e-9);
  r.segments = parts.map((p, i) => ({ from: i === 0 ? firstDay(m) : cuts[i - 1], salaireMens: p.salaireMens, base: p.base }));
  r.alerts.unshift(`Avenant au ${cuts.map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`).join(', ')} : le salaire du mois est calculé au prorata de chaque période.`);
  return r;
}

/** T-025 C-7 : phrase ajoutée aux mois terminés qui ont des montants à confirmer */
export const MESSAGE_MOIS_DEJA_DECLARE =
  'Si ce mois est déjà déclaré à Pajemploi, ne change rien seule. Vois d’abord avec les parents ce qui est dû. Si le montant change, voyez ensemble comment corriger la déclaration.';

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
  let entretienNonVerifie = false;
  let entretienSousMin = 0, entretienMinVerse = 0;
  // T-044 : montants exacts (centimes non arrondis), arrondis une seule fois sur le mois.
  let entretienExact = 0, entretienExactNonArrondi = 0, entretienAConfExact = 0, entretienJoursAConf = 0;
  const entretienCauses = new Set<'base' | 'jour' | 'hors'>();
  let suspDays = 0, suspMin = 0, kmJours = 0, sansSoldePayes = 0;
  const suspRaisons: string[] = [];
  const forgotten: ISODate[] = [];
  for (const d of allDays) {
    if (!inSeg(d)) continue;
    const di = dayInfo(ctx, d);
    if (di.inDivisor) { cDays++; cMin += di.plannedMin; }
    if (di.deducted) { dedDays++; dedMin += di.plannedMin; }
    if (di.aConfirmer && di.plannedMin > 0) {
      suspDays++; suspMin += di.plannedMin;
      if (di.cpAConfirmer) r.joursCpAConfirmer++; else if (di.maladieAConfirmer) r.joursMaladieAConfirmer++; else r.joursEvenementAConfirmer++;
      if (!suspRaisons.includes(di.aConfirmer)) suspRaisons.push(di.aConfirmer);
    }
    // Jours d'activité (Pajemploi) : jours prévus et payés, sans les fériés chômés ni les jours à confirmer.
    // T-025 C-4 : un férié pendant un congé pour événement familial reste un férié chômé (art. 47) : payé, pas compté.
    if (di.inDivisor && !di.deducted && !di.aConfirmer && di.kind !== 'ferie' && !(di.kind === 'am' && di.ferie)) actDays++;
    if (di.cpSansDroits) cpSansDroits++;
    if (di.sansSoldeEnfantPaye && di.plannedMin > 0) { r.alerts.push(messageSansSoldeEnfant(d)); sansSoldePayes++; }
    if (di.departOublie) forgotten.push(d);
    if (di.ferieNonPaye) r.alerts.push(`Férié du ${d.slice(8, 10)}/${d.slice(5, 7)} non payé : tu étais absente le jour prévu juste avant ou juste après (article 47 de la convention).`);
    if (di.rec?.abs === 'malade_certif' && !di.deducted && di.plannedMin > 0) r.sickPaidNotice = true;
    if (di.kind === 'present' || di.kind === 'prevu') {
      if (di.presentMin > 0) {
        r.presenceDays++;
        if (di.plannedMin === 0) r.extraDays++;
        // T-044b. Montant de l'entretien du jour : toutes les lectures non tranchées sont calculées, chacune arrondie au
        // centime le plus proche (décision ARR-01 du DG, 18/11/2026, comme les km jour par jour). Le plus bas est versé,
        // l'écart est « à confirmer », hors du total.
        // Durée du jour, deux lectures (relecture V5, P2-B1) :
        // - accueil : présence de l'enfant (CCN 98.1.1 « Les périodes de travail correspondent au temps d'accueil de
        //   l'enfant » ; CASF D423-7 « durée effective d'accueil quotidien » ; Urssaf « nombre d'heures d'accueil par
        //   jour » ; service-public F12812 « durée d'accueil ») ;
        // - travail : CCN 99, heures prévues plus présence hors des plages prévues ; hors planning, la présence.
        const durees = [...new Set([di.presentMin, di.plannedMin > 0 ? di.plannedMin + di.extraMin : di.presentMin])];
        const planchers = durees.map((m) => entretienPlancher(d, m));
        // T-023 : avant les barèmes vérifiés, le plancher légal n'est pas connu. L'app retient le montant du contrat et le dit.
        if (planchers.some((x) => x === undefined)) entretienNonVerifie = true;
        const parHeure = (c.entretienMode ?? (c.entretienHeure ? 'heure' : 'jour')) === 'heure';
        // Chaque lecture : [montant brut du contrat, plancher]. `undefined` : lecture sans durée de référence (hors planning).
        const lectures: { brut?: number; p: number; cause: 'base' | 'jour' | 'hors' }[] = [];
        durees.forEach((m, k) => {
          const p = planchers[k] ?? 0;
          if (parHeure) {
            // CCN 114.1 : « versée en cas de travail effectif, par heure de travail » ; montant horaire prévu au contrat.
            lectures.push({ brut: ((c.entretienHeure ?? 0) * m) / 60, p, cause: 'base' });
          } else {
            // Tarif par jour. Lecture 1 : il vaut pour la journée, quelle que soit sa durée. Lecture 2 : il vaut pour les
            // heures prévues ce jour-là et suit la durée (« Il varie en fonction de la durée de travail effectif »).
            // Hors planning, aucune durée de référence : seul le minimum est certain.
            lectures.push({ brut: c.entretienJour, p, cause: 'jour' });
            lectures.push(di.plannedMin > 0 ? { brut: (c.entretienJour * m) / di.plannedMin, p, cause: 'jour' } : { p, cause: 'hors' });
          }
        });
        const montants = lectures.map((l) => Math.round(Math.max(l.brut ?? (planchers.includes(undefined) ? c.entretienJour : 0), l.p)));
        const exacts = lectures.map((l) => Math.max(l.brut ?? (planchers.includes(undefined) ? c.entretienJour : 0), l.p));
        // Le montant de la lecture « hors planning » sans durée de référence est inconnu : borne haute = tarif du jour.
        const hauts = lectures.map((l, k) => (l.cause === 'hors' ? Math.round(Math.max(c.entretienJour, l.p)) : montants[k]));
        const certain = Math.min(...montants);
        const ecart = Math.max(...hauts) - certain;
        entretienExact += certain;
        entretienExactNonArrondi += Math.min(...exacts);
        // T-034 (ENTRETIEN-SOUS-MINIMUM), sur la présence de l'enfant (base d'avant T-044) : tarif du contrat sous le minimum.
        const pAccueil = planchers[0];
        const brutAccueil = parHeure ? ((c.entretienHeure ?? 0) * durees[0]) / 60 : c.entretienJour;
        if (pAccueil !== undefined && brutAccueil < pAccueil) { entretienSousMin++; entretienMinVerse += pAccueil - brutAccueil; }
        if (ecart > 0) {
          entretienAConfExact += ecart; entretienJoursAConf++;
          if (durees.length > 1) { entretienCauses.add('base'); r.entretienJoursDuree++; }
          if (!parHeure && di.plannedMin > 0 && di.presentMin !== di.plannedMin) { entretienCauses.add('jour'); r.entretienJoursTarifJour++; }
          if (lectures.some((l) => l.cause === 'hors')) { entretienCauses.add('hors'); r.entretienJoursHorsPlanning++; }
        }
        const nbRepas = di.rec?.repas ?? c.repasParJour;
        r.repas += nbRepas * c.repasPrix;
      }
      if (di.ferie && (di.ferieTravaille || di.kind === 'present') && di.presentMin > 0) {
        const pct = isMayDay(d) ? 100 : 10;
        r.ferieAmount += Math.round((di.presentMin * c.rateNet * pct) / 100 / 60);
        r.ferieDays.push(d);
      }
    }
    // CCN art. 113 : partage au prorata des enfants transportés seulement si plusieurs employeurs demandent le trajet
    // (T-025 C-2). Donnée manquante : km à confirmer, rien n'est payé en silence.
    if (di.rec?.km) {
      kmJours++;
      const part = indemniteKmJour(di.rec.km, c.kmTaux, di.rec.kmPartage, di.rec.kmEnfants);
      if (part !== undefined) r.km += part;
      else r.kmAConfirmer += di.rec.km;
    }
  }
  // Jours (heures) de la période payés par la mensualisation, avant retenues
  r.contractDays = segDays;
  r.contractMin = segMin;
  r.deductedDays = dedDays;
  r.deductedMin = dedMin;
  r.forgotten = forgotten;

  // Méthode des heures (année complète) ou des jours (année incomplète) — art. 111.
  // T-034 : l'embauche et la fin de contrat en cours de mois suivent cette même déduction d'absence. Fiches DREETS
  // Occitanie (DDETS 31) du 19/01/2023, « Accueil sur 52 semaines » et « Accueil sur 46 semaines ou moins », section 3 :
  // « Les absences non rémunérées qui nécessitent le calcul d'une déduction d'absence sont notamment les suivantes :
  // - Embauche et fin de contrat en cours de mois ». Année complète : « Salaire mensualisé x nombre d'heures non
  // travaillées dans le mois […] ÷ par le nombre d'heures qui auraient été réellement travaillées dans le mois
  // considéré » ; année incomplète : même formule en jours, les semaines de non-accueil comptées au diviseur.
  // Les jours du mois hors contrat sont les jours non travaillés : (segMin − min) / fullMin = 1 − non travaillé ÷ diviseur.
  const fractionHors = (days: number, min: number): number => {
    const f = complete ? (fullMin > 0 ? (segMin - min) / fullMin : startsOrEndsInMonth ? 0 : 1)
      : (fullDays > 0 ? (segDays - days) / fullDays : startsOrEndsInMonth ? 0 : 1);
    return Math.max(0, Math.min(1, f));
  };
  let fractionPayee = fractionHors(dedDays, dedMin);
  // Mois complet sans absence retenue : salaire mensualisé intégral.
  if (!startsOrEndsInMonth && dedDays === 0) fractionPayee = 1;
  // T-023 : les jours d'événement à confirmer sont sortis du salaire (ni payés ni retenus) et chiffrés à part.
  const fraction = suspDays ? fractionHors(dedDays + suspDays, dedMin + suspMin) : fractionPayee;
  const basePayee = Math.round(smens * fractionPayee);
  r.paidFraction = fraction;
  r.base = Math.round(smens * fraction);
  r.evenementAConfirmer = basePayee - r.base;
  const prorataOnly = startsOrEndsInMonth
    ? Math.round(smens * Math.min(1, complete ? (fullMin ? segMin / fullMin : 0) : fullDays ? segDays / fullDays : 0))
    : smens;
  r.retenue = Math.max(0, prorataOnly - basePayee);

  // Pajemploi : les heures du contrat au-delà de 45 h/semaine vont en « heures majorées », pas en heures normales.
  const majContrat = mensuelMajoreesMinutes(c);
  r.normalesMin = (r.mensuelMin - majContrat) * fraction;
  r.heuresNormales = Math.round(r.normalesMin / 60);
  r.majContratMin = Math.round(majContrat * fraction);
  r.majContratAmount = Math.round((r.majContratMin * c.rateNet * (100 + c.majoration)) / 100 / 60);
  // Jours d'activité. Entrée ou sortie dans le mois : jours réellement prévus et payés. Sinon jours mensualisés, moins
  // les jours retenus. Avenant en cours de mois (C-003) : la coupure ne doit pas changer la case ; chaque période
  // reçoit sa part des jours mensualisés de ses propres conditions (jours prévus de la période ÷ jours prévus du mois),
  // la somme est arrondie dans mergeParts.
  const entreeSortie = c.start > from || (!!c.end && c.end < to);
  // T-076 : planning variable, aucun nombre de jours par semaine unique : jours prévus et payés du mois, comme une entrée.
  if (entreeSortie || pvActif(c)) r.joursActivite = actDays + r.extraDays;
  else if (startsOrEndsInMonth) r.joursActivite = Math.max(0, (joursMensualises(c) * (fullDays ? segDays / fullDays : 0)) - dedDays - suspDays) + r.extraDays;
  else r.joursActivite = Math.max(0, joursMensualises(c) - dedDays - suspDays) + r.extraDays;
  if (suspRaisons.length) {
    r.alerts.push(...suspRaisons);
    const objet = joindre(naturesAConfirmer(r).map((n) => ({ evenement: 'événement familial', cp: 'congés', maladie: 'enfant malade' })[n])).replace(/^./, (x) => x.toUpperCase());
    r.alerts.push(`${objet} : ${dayCountLabel(suspDays)} ni payé${suspDays > 1 ? 's' : ''} ni retenu${suspDays > 1 ? 's' : ''}, ${euros(r.evenementAConfirmer)} de salaire à confirmer (non compris dans le total).`);
  }
  // ARR-01 (décision du DG du 18/11/2026, jusqu'à la réponse de la DDETS) : chaque montant du jour est arrondi au centime le
  // plus proche, comme les km jour par jour. Si l'arrondi du total du mois donne un autre montant, l'app le dit.
  r.entretien = entretienExact;
  r.entretienAConfirmer = Math.round(entretienAConfExact);
  const auMois = Math.round(entretienExactNonArrondi);
  if (auMois !== r.entretien) r.alerts.push(`Indemnité d’entretien : ${euros(r.entretien)} en arrondissant chaque jour au centime le plus proche. En arrondissant seulement le total du mois, elle serait de ${euros(auMois)}. Aucun texte ne dit à quel moment arrondir : l’app arrondit chaque jour en attendant une réponse officielle.`);
  if (r.kmAConfirmer) r.alerts.push(`${r.kmAConfirmer} km à confirmer, non comptés. Pour chaque jour, indique si une autre famille a aussi demandé le trajet. Si oui, indique aussi les enfants dans la voiture : l’indemnité est alors partagée entre eux (article 113 de la convention). Si non, elle est due en entier.`);
  // T-025 C-7 : mois terminé, peut-être déjà déclaré à Pajemploi avant la mise à jour qui a rendu ces montants « à confirmer ».
  if ((r.evenementAConfirmer || r.kmAConfirmer || r.entretienAConfirmer) && to < ctx.today && !r.alerts.includes(MESSAGE_MOIS_DEJA_DECLARE)) r.alerts.push(MESSAGE_MOIS_DEJA_DECLARE);
  // T-038 (G-1, relecture V4 du diff m8) : mois terminé avec des jours notés « sans solde » avant la mise à jour T-035b. Il a
  // pu être déclaré à Pajemploi avec la retenue ; son salaire affiché est maintenant plus haut. Le dire, et quoi faire.
  if (sansSoldePayes && to < ctx.today) {
    r.alerts.push(messageMoisSansSoldeChange(sansSoldePayes));
    if (!r.alerts.includes(MESSAGE_MOIS_DEJA_DECLARE)) r.alerts.push(MESSAGE_MOIS_DEJA_DECLARE);
  }
  if (kmJours && c.kmTaux > 0) for (const m of controleKm(ctx.c.kmCv, c.kmTaux, segFrom).messages) if (!r.alerts.includes(m)) r.alerts.push(m);
  // CCN art. 114.1 : « le montant journalier de cette indemnité ne peut pas être inférieur à 2,65 € » et le montant horaire
  // ne peut être « inférieur à 90 % du minimum garanti lorsque la durée de travail journalière est de 9 heures ».
  if (r.entretienAConfirmer) {
    const causes: string[] = [];
    if (entretienCauses.has('base')) causes.push('la durée du jour se compte en temps de présence de l’enfant (articles 98.1.1 et 114.1 de la convention, code de l’action sociale, Urssaf) ou en temps de travail (article 99 : heures prévues, plus la présence en dehors) ; aucun texte ne dit laquelle retenir pour l’entretien');
    if (entretienCauses.has('jour')) causes.push('le contrat donne un montant par jour, alors que la convention (article 114.1) prévoit un montant par heure : il peut valoir pour la journée entière ou pour les heures prévues ce jour-là');
    if (entretienCauses.has('hors')) causes.push('un jour hors planning n’a pas de durée de référence pour le montant par jour : seul le minimum est certain');
    r.alerts.push(`Indemnité d’entretien : ${euros(r.entretienAConfirmer)} à confirmer, non compris dans le total, pour ${dayCountLabel(entretienJoursAConf)}. L’app verse ${euros(r.entretien)}, le plus bas des calculs possibles et au moins le minimum ; selon la lecture, le mois va jusqu’à ${euros(r.entretien + r.entretienAConfirmer)}. Pourquoi : ${causes.join(' ; ')}. Mets-toi d’accord avec les parents, par écrit${entretienCauses.has('jour') ? ' ; le plus simple est un avenant qui fixe un montant par heure' : ''}.`);
  }
  if (entretienSousMin) r.alerts.push(`Indemnité d’entretien : le montant du contrat (${c.entretienHeure ? `${euros(c.entretienHeure)} par heure` : `${euros(c.entretienJour)} par jour`}) est sous le minimum de la convention (article 114.1) pour ${dayCountLabel(entretienSousMin)}. L’app verse le minimum, soit ${euros(Math.round(entretienMinVerse))} de plus que le contrat ce mois-ci. Fais corriger le contrat avec les parents, par un avenant.`);
  if (entretienNonVerifie) r.alerts.push(`${MESSAGE_PERIODE_NON_GEREE} Indemnité d’entretien : l’app retient le montant du contrat, sans contrôle du minimum légal ; vérifie-le avec les parents.`);
  // R-CP-09 : un congé dont le décompte reste ambigu est signalé, pas tranché (T-019).
  for (const a of cpAConfirmerEntre(ctx, segFrom, segTo)) if (!r.alerts.includes(a)) r.alerts.push(a);
  if (cpSansDroits) {
    r.alerts.push(`${dayCountLabel(cpSansDroits)} de congés pris au-delà de tes droits acquis : retenu${cpSansDroits > 1 ? 's' : ''} comme congés sans solde. Si ton solde de congés au début du suivi est faux, corrige-le dans le contrat ; si les parents ont accepté par écrit des congés par anticipation, signale-le avec « Ça coince ».`);
  }
  if (c.yearType === 'incomplete') {
    const manque = semainesSansAccueilManquantes(ctx.c, regulStart(ctx.c, addDays(segTo, 1)), segTo);
    if (manque > 0) r.alerts.push(`Année incomplète : il manque ${manque} semaine${manque > 1 ? 's' : ''} sans accueil dans le contrat. Tant qu’elles ne sont pas saisies, la régularisation de fin de contrat n’est pas calculée.`);
  }

  // Heures en plus, par semaine, rattachées au mois du jour.
  const weeks = new Set(allDays.filter(inSeg).map(mondayOf));
  let complPrevu = 0, complAConf = 0;
  for (const mon of weeks) {
    for (const [d, v] of weekOvertimeDetail(ctx, mon).parJour) {
      if (monthOf(d) !== m || !inSeg(d)) continue;
      r.complMin += v.compl;
      r.majMin += v.maj;
      complPrevu += v.complPrevu ?? 0;
      complAConf += v.complAConfirmer ?? 0;
    }
  }
  // R-HC-02 (CCN art. 96.4 et 110.2) : payées au taux du contrat, majorées seulement si le contrat le prévoit (T-019).
  r.complAmount = Math.round((r.complMin * c.rateNet * (100 + (c.majorationCompl ?? 0))) / 100 / 60);
  r.majAmount = Math.round((r.majMin * c.rateNet * (100 + c.majoration)) / 100 / 60);
  if (pvActif(c)) {
    // T-076 : la base des heures complémentaires est celle du contrat (message à l'AM, spécification section 1).
    r.alerts.unshift(messageBasePV(c));
    if (complPrevu) r.complPrevuMin = complPrevu;
    if (complAConf) {
      r.complAConfirmerMin = complAConf;
      r.complAConfirmerAmount = Math.round(((r.complMin + complAConf) * c.rateNet * (100 + (c.majorationCompl ?? 0))) / 100 / 60) - r.complAmount;
      r.alerts.push(`Heures complémentaires à confirmer : ${hoursMin(complAConf)} (${euros(r.complAConfirmerAmount)}), non comprises dans le total. Une semaine où tes heures prévues dépassent la base de ton contrat contient des jours payés sans être travaillés (congés payés, jour férié, événement familial, absence de l’enfant payée) ou le début ou la fin du contrat. La convention ne dit pas si les heures prévues de ces jours comptent pour les heures complémentaires, ni si la base se réduit pour une semaine coupée. L’app paie la part sûre. La question est posée à la DDETS. Mets-toi d’accord par écrit avec les parents.`);
      if (to < ctx.today && !r.alerts.includes(MESSAGE_MOIS_DEJA_DECLARE)) r.alerts.push(MESSAGE_MOIS_DEJA_DECLARE);
    }
  }

  // T-076 (P1, lecture 2) : CDD à terme précis de moins d'un mois. DREETS Occitanie (guide CDD, p. 7 ; fiche CDD, p. 3) :
  // « le salaire dû est déterminé en multipliant la rémunération horaire par le nombre d'heures de travail réellement
  // effectuées ». Décision D7 de la direction (22/11/2026) : ces heures comprennent aussi les heures payées par un autre
  // texte, férié chômé (CCN 47) et absence de l'enfant rémunérée (CASF L423-20, CCN 105) ; seules les absences non payées
  // de l'AM en sont retirées. Heures comptées : jours prévus du contrat, payés, ni retenus ni « à confirmer » (art. 99 : le
  // travail commence et finit aux heures prévues). Un jour « à confirmer » est chiffré à part au taux horaire, comme en
  // lecture 1. Heures prévues au-delà de 45 h dans la semaine civile entière (jours des deux mois compris, dans l'ordre) :
  // majorées, comme dans le salaire mensualisé. Les heures en plus du planning restent payées à part (HC, HM).
  if (ctx.lectureCdd === 2 && estCddMoinsUnMois(ctx.c)) {
    const compte = (di: DayInfo) => di.plannedMin > 0 && di.inDivisor && !di.deducted && !di.aConfirmer;
    let normales = 0, majorees = 0, joursFaits = 0, aConfMin = 0;
    for (const mon of new Set(allDays.filter(inSeg).map(mondayOf))) {
      let cum = 0;
      for (let i = 0; i < 7; i++) {
        const d = addDays(mon, i);
        if (!inContract(c, d)) continue;
        const di = dayInfo(ctx, d);
        if (!compte(di)) {
          if (inSeg(d) && di.aConfirmer && di.plannedMin > 0) aConfMin += di.plannedMin;
          continue;
        }
        const n = Math.max(0, Math.min(di.plannedMin, H45 - cum));
        cum += di.plannedMin;
        if (!inSeg(d)) continue;
        normales += n;
        majorees += di.plannedMin - n;
        if (di.kind !== 'ferie' && !(di.kind === 'am' && di.ferie)) joursFaits++;
      }
    }
    const exact = normales * c.rateNet + majorees * c.rateNet * (1 + c.majoration / 100);
    r.base = Math.round(exact / 60);
    r.retenue = 0;
    r.evenementAConfirmer = Math.round((aConfMin * c.rateNet) / 60);
    r.paidFraction = r.mensuelMin ? Math.min(1, (normales + majorees) / r.mensuelMin) : 0;
    r.normalesMin = normales;
    r.heuresNormales = Math.round(normales / 60);
    r.majContratMin = majorees;
    r.majContratAmount = Math.round((majorees * c.rateNet * (100 + c.majoration)) / 100 / 60);
    r.joursActivite = joursFaits + r.extraDays;
  }
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

/**
 * T-076 : contexte de la seconde lecture du salaire d'un CDD (decisions-direction, section 2), ou rien si le CDD n'en a pas.
 * - P1 (CDD à terme précis de moins d'un mois) : même contrat ; le salaire de base de chaque mois devient taux × heures
 *   réellement faites (computeRange).
 * - P2 (CDD avec semaines sans accueil) : lecture 2 = formule 52 semaines (CCN 109.1) et déduction de l'art. 111 pour chaque
 *   semaine sans accueil (DREETS Occitanie, FAQ q. 1.24 : « pour les mois de travail comportant ces semaines d'absences, le
 *   salaire sera alors minoré et calculé selon la méthode de calcul prévue à l'article 111 »), sans régularisation finale.
 *   Le contrat devient « toute l'année » ; chaque semaine sans accueil du contrat devient une absence non rémunérée (même
 *   déduction que le congé sans solde, art. 111, méthode des heures), placée avant les autres absences.
 * La lecture 1 est le contexte lui-même (contrat tel qu'il est saisi : mensualisé puis art. 111 ; ou 46 semaines ou moins).
 */
export function ctxLectureCdd2(ctx: Ctx): Ctx | undefined {
  const c = ctx.c;
  if (ctx.lectureCdd === 2 || !cddDeuxLectures(c)) return undefined;
  return memo(ctx, 'cddL2', () => {
    if (estCddMoinsUnMois(c) && !estCddSemainesSansAccueil(c)) return { ...ctx, lectureCdd: 2 as const, cache: new Map() };
    const semaines = [...toutesSemainesSansAccueil(c)].sort();
    const sansAccueil: AmLeave[] = semaines.map((w) => ({ id: `cdd-sans-accueil-${w}`, type: 'sans_solde', from: w, to: addDays(w, 6) }));
    const sansType = (ch: Partial<Contract>): Partial<Contract> => {
      const { yearType: _y, weeks: _w, weeksOff: _o, ...reste } = ch;
      return reste;
    };
    const c2: Contract = {
      ...c, yearType: 'complete', weeks: 52, weeksOff: [],
      ...(c.avenants ? { avenants: c.avenants.map((a) => ({ ...a, changes: sansType(a.changes) })) } : {}),
    };
    return { ...ctx, c: c2, leaves: [...sansAccueil, ...ctx.leaves], lectureCdd: 2 as const, cache: new Map() };
  });
}

export { daysBetween };
