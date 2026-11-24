// Moteur de paie d'un contrat d'assistante maternelle (CCN IDCC 3239). Montants en centimes entiers.
import {
  addDays, eachDay, firstDay, monthsBetween, lastDay, minutes, monthOf, mondayOf, daysBetween, addMonthsToDate,
  type ISODate, type Month,
} from './dates';
import { isMayDay } from './holidays';
import { entretienPlancher, MESSAGE_PERIODE_NON_GEREE, netToBrut } from './rates';
import { statutJourEvenement } from './evenements';
import { controleKm, indemniteKmJour } from './km';
import { euros } from './money';
import { cpDemandesEntre, cpDroitsInconnus, cpExces } from './conges';
import { nonGeresPeriode } from './nonGeres';
import { ferieDe, MESSAGE_IJ_MAINTIEN_LOCAL, MESSAGE_MAINTIEN_LOCAL, regionDe } from './regions';
import { jourDispense } from './preavis';
import { baseHebdoMin, formePV, lecturePV, mensuelMinutesPV, messageBasePV, minutesPlanning, plagesDuJour, pvActif } from './planningVariable';
import { joursApresTermeRefuses, messageApresTerme, messageMoisApresTerme, messageTermeAVenir } from './cdd';
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
  let found: AmLeave | undefined;
  for (const l of leaves) {
    if (d < l.from || d > l.to) continue;
    // T-103 (C15) : un arrêt maladie de l'AM pendant ses congés l'emporte : ce jour n'est pas un jour de congé (CCN 48.1.1.3).
    if (l.type === 'am_malade') return l;
    found ??= l;
  }
  return found;
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
  /** T-035b : absence de l'enfant notée « sans solde » (ancienne option), désormais payée */
  sansSoldeEnfantPaye?: boolean;
  /** T-103 (C3, C5) : donnée à saisir pour calculer ce jour ; le mois n'est pas calculé tant qu'elle manque */
  donneeManquante?: string;
  /** T-103 : jour retenu avec une raison à dire dans le mois (jour d'événement familial au-delà de la durée) */
  raisonRetenue?: string;
  /** T-103 (R3) : absence de l'AM pour sa maladie ou celle de son enfant, en Alsace-Moselle : salaire maintenu (L1226-23) */
  maintienLocal?: boolean;
  /** T-074 : jour d'un préavis dont les parents ont dispensé l'AM : payé, sans entretien (CCN art. 64.2, 114.1) */
  dispense?: boolean;
}

/** T-035b : alerte du jour noté « sans solde » avant la correction (CCN art. 105 ; CASF L423-20). */
export const messageSansSoldeEnfant = (d: ISODate): string =>
  `Absence du ${d.slice(8, 10)}/${d.slice(5, 7)} notée « sans solde » : elle est payée. La convention (article 105) ne permet de retenir une absence de l’enfant qu’en cas de maladie avec certificat. Pour ne plus payer ces jours, il faut un avenant signé qui change le planning.`;

/** T-038 (G-1) : alerte d'un mois terminé dont des jours notés « sans solde » sont désormais payés (CCN art. 105). */
export const messageMoisSansSoldeChange = (n: number): string =>
  `Salaire de ce mois modifié par la mise à jour de l’app : ${dayCountLabel(n)} d’absence de l’enfant noté${n > 1 ? 's' : ''} « sans solde » ${n > 1 ? 'sont' : 'est'} maintenant payé${n > 1 ? 's' : ''}. Avant, l’app les retenait. La convention (article 105) ne permet de retenir une absence de l’enfant qu’en cas de maladie avec certificat. Si ce mois est déjà déclaré à Pajemploi avec la retenue, le salaire déclaré était trop bas : il faut une régularisation avec les parents.`;

export const joindre = (l: string[], et = 'et') => (l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} ${et} ${l.at(-1)}`);

/** T-074 (P-1, regles/t074-preavis-dispense.md, point 9) : déclaration d'un mois avec des jours de préavis dispensés */
export const MESSAGE_DISPENSE_PAJEMPLOI =
  'Préavis dont les parents t’ont dispensée : le salaire de ce mois comprend l’indemnité de préavis des jours dispensés, payés sans indemnité d’entretien. Déclaration à Pajemploi : mets l’indemnité de préavis dans la case « indemnité compensatrice de préavis non effectué » ; les jours dispensés ne sont ni des heures ni des jours d’activité (documentation officielle de la déclaration Pajemploi). Le total à verser ne change pas.';

export function dayInfo(ctx: Ctx, d: ISODate): DayInfo {
  return memo(ctx, 'day' + d, () => computeDay(ctx, d));
}

function computeDay(ctx: Ctx, d: ISODate): DayInfo {
  const { c } = ctx;
  const rec = ctx.days.get(d);
  const planned = plannedPlages(c, d);
  const plannedMin = planned.reduce((s, p) => s + plageMin(p), 0);
  const region = regionDe(c);
  // T-103 (R1, R4) : fériés de l'AM selon la région (regions.ts, ferieDe).
  const ferie = ferieDe(region, d);
  const amLeave = inContract(c, d) ? amLeaveOn(ctx.leaves, d) : undefined;
  const info: DayInfo = {
    date: d, kind: 'hors', planned, plannedMin, presentMin: 0, extraMin: 0, ferie,
    ferieTravaille: !!rec?.ferieTravaille, amLeave, rec, departOublie: false, enCours: false,
    deducted: false, inDivisor: false,
  };
  if (!inContract(c, d)) return info;
  // T-103 (K1) : CCN 113, partage au prorata des enfants transportés seulement si plusieurs employeurs demandent le trajet.
  // Sans les deux réponses, le jour attend la saisie (B) : jamais des km « à confirmer ».
  if (rec?.km && indemniteKmJour(rec.km, c.kmTaux, rec.kmPartage, rec.kmEnfants) === undefined) info.donneeManquante = messageKmACompleter(d);

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
      } else if (amLeave === 'cp' && termsAt(c, d).yearType === 'complete' && cpDroitsInconnus(ctx).has(d)) {
        // T-103 (C14) : droits de la période précédente non calculés (donnée à saisir ou cas non géré) : ce jour est payé
        // ou sans solde selon ces droits. Le mois attend la donnée (B), jamais « à confirmer ».
        info.inDivisor = true;
        info.donneeManquante = cpDroitsInconnus(ctx).get(d);
      } else if (region === 'alsaceMoselle' && (amLeave === 'am_malade' || amLeave === 'am_enfant_malade')) {
        // T-103 (R3, décision du DG du 24/11/2026) : salaire maintenu (C. trav. L1226-23), moins les indemnités journalières
        // saisies (déduites dans le mois, plus bas). Sans leur montant, le mois attend la saisie (B).
        info.inDivisor = true;
        info.maintienLocal = true;
        if (amLeaveAt(ctx.leaves, d)?.ijSecu === undefined) info.donneeManquante = MESSAGE_IJ_MAINTIEN_LOCAL;
      } else if (amLeave === 'am_malade' || amLeave === 'am_enfant_malade' || amLeave === 'sans_solde') {
        // T-034 : congé sans solde = absence non rémunérée, retenue par la déduction d'absence de l'art. 111. Fiches DREETS
        // Occitanie du 19/01/2023, section 3 : « Absence du salarié pour congés sans solde » ; Urssaf « gérer les absences
        // de votre salarié » (17/09/2026) : « raison personnelle » parmi « Les absences engendrant une minoration de la
        // rémunération », formule en heures (52 semaines) ou en jours (46 semaines ou moins).
        info.deducted = true;
        info.inDivisor = true;
      } else if (amLeave === 'evenement') {
        info.inDivisor = true;
        const st = statutJourEvenement(amLeaveAt(ctx.leaves, d)!, d, ctx.leaves, c.reposHebdo ?? 7);
        // T-103 (C6 à C8) : un jour au-delà de la durée est retenu (absence non payée), avec la raison ; une saisie que l'app
        // ne sait pas lire refuse le mois (nonGeresPeriode).
        if (!st.paye && !st.nonGere) { info.deducted = true; info.raisonRetenue = st.raison; }
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
    if (!d.endsWith('-05-01')) {
      if (ferieNonPaye(ctx, d)) { info.deducted = true; info.ferieNonPaye = true; }
    }
    return info;
  }

  // T-074 : jour du préavis dont les parents ont dispensé l'AM (CCN art. 64.2, 66, 122). Absence imposée par l'employeur :
  // payée, dans le diviseur, jamais retenue (même un jour noté « enfant malade ») ; pas d'entretien (art. 114.1). Une présence
  // pointée ce jour-là l'emporte : l'enfant a été accueilli.
  if (plannedMin > 0 && jourDispense(c, d) && !rec?.pres?.some((p) => p.a)) {
    info.kind = 'absent';
    info.inDivisor = true;
    info.dispense = true;
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
        const demande = sick.demandes.get(d);
        if (demande) info.donneeManquante = demande;
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
  const region = regionDe(c);
  for (let i = 1, x = addDays(d, sens); i <= 14; i++, x = addDays(x, sens)) {
    if (!inContract(c, x)) return undefined;
    if (plannedPlages(c, x).length === 0) continue;
    if (ferieDe(region, x) && !ctx.days.get(x)?.ferieTravaille) continue;
    return x;
  }
  return undefined;
}

/**
 * T-103 (D7) : férié chômé dont la condition de l'art. 47.2 (travail le jour prévu juste avant et juste après) n'est pas
 * encore connue : l'un de ces jours n'est pas passé. L'écran dit la condition, jamais « à confirmer ».
 */
export function ferieEnAttente(ctx: Ctx, d: ISODate): boolean {
  const apres = jourPrevuVoisin(ctx, d, 1);
  return !ferieNonPaye(ctx, d) && (d >= ctx.today || (!!apres && apres >= ctx.today));
}
export const libelleFerie = (ctx: Ctx, di: Pick<DayInfo, 'date' | 'ferie' | 'deducted'>): string =>
  di.deducted ? `Férié : ${di.ferie} (non payé : absence le jour prévu juste avant ou juste après)`
    : ferieEnAttente(ctx, di.date) ? `Férié : ${di.ferie} (payé si tu travailles le jour prévu juste avant et juste après)`
      : `Férié : ${di.ferie} (payé)`;

/** T-103 (K1) : km d'un jour sans les réponses sur le partage du trajet */
export const messageKmACompleter = (d: ISODate): string =>
  `Frais kilométriques du ${d.slice(8, 10)}/${d.slice(5, 7)} : indique si une autre famille a aussi demandé ce trajet et, si oui, combien d’enfants étaient dans la voiture (convention, article 113). L’app ne calcule pas ce mois sans ces réponses.`;

/** Férié chômé non payé : absence non autorisée de l'AM le jour prévu juste avant ou juste après (CCN 47.2). */
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
 * T-103 (C1 à C5, décision du DG du 24/11/2026) : jours d'enfant malade retenus (CCN 105), une seule lecture, celle de la
 * lettre du texte (méthode de la Cour de cassation : Cass. soc. 25/03/2020, n° 18-12.467) :
 * - « courtes absences […] dans la limite de 5 jours d'absence » : jours d'accueil prévus, par période de 12 mois ;
 * - « absence durant 14 jours calendaires consécutifs » : seule une absence qui dure 14 jours calendaires ou plus est
 *   l'absence longue (C1 : une absence de 6 à 13 jours est une absence courte ; C2 : 14 jours ou plus, même avec 5 jours
 *   d'accueil ou moins, est l'absence longue), retenue sur 14 jours calendaires au plus ;
 * - « appréciées par période de 12 mois glissants à compter de la date d'effet de l'embauche ou de sa date anniversaire » :
 *   chaque jour compte dans sa période (C4) ;
 * - les jours calendaires se comptent du premier au dernier jour du certificat (C3, `certifDu`, `certifAu`) ; deux
 *   épisodes séparés par des jours sans accueil prévu forment une seule absence si un même certificat les couvre ;
 * - jours déjà retenus avant le suivi par l'app : `balances.maladieDeduitsLongue` (C5).
 * `demandes` : jours dont le résultat dépend d'une donnée non saisie (dates du certificat, origine des jours déjà retenus).
 * Le mois n'est pas calculé tant qu'elle manque (B : l'app la demande, jamais « à confirmer »).
 */
export function sickLectures(ctx: Ctx): { retenus: Set<ISODate>; demandes: Map<ISODate, string> } {
  return memo(ctx, 'sick', () => {
    const { c } = ctx;
    const prevu = (x: ISODate) => plannedPlages(c, x).length > 0;
    const sansAccueilPrevu = (x: ISODate): boolean =>
      !prevu(x) ? false : (!!ferieDe(regionDe(c), x) && !ctx.days.get(x)?.ferieTravaille) || !!amLeaveOn(ctx.leaves, x);
    const sansAccueil = (x: ISODate) => !prevu(x) || sansAccueilPrevu(x);
    const recs = [...ctx.days.values()].filter((r) => r.abs === 'malade_certif' && prevu(r.date) && !sansAccueilPrevu(r.date)).sort((x, y) => (x.date < y.date ? -1 : 1));
    const certDays = recs.map((r) => r.date);
    const recOf = new Map(recs.map((r) => [r.date, r]));
    // Certificat d'un épisode : la plus large des dates saisies sur ses jours ; `undefined` si aucune n'est saisie.
    const certif = (ep: ISODate[]) => {
      const du = ep.map((d) => recOf.get(d)?.certifDu).filter((x): x is ISODate => !!x).sort()[0];
      const au = ep.map((d) => recOf.get(d)?.certifAu).filter((x): x is ISODate => !!x).sort().at(-1);
      return { du, au };
    };
    // Épisodes : jours certifiés consécutifs en sautant les jours sans accueil prévu ; coupés à la date anniversaire (C4).
    // Deux épisodes séparés par un férié chômé ou un congé de l'AM sont joints si le certificat de l'un couvre l'autre ;
    // sans certificat saisi (`joindreInconnu`), la variante jointe sert seulement à savoir si la donnée compte.
    const episodesDe = (joindreInconnu: boolean): ISODate[][] => {
      const eps: ISODate[][] = [];
      for (const d of certDays) {
        const last = eps.at(-1);
        if (last) {
          const prev = last.at(-1)!;
          let joined = contractYearIndex(c, prev) === contractYearIndex(c, d);
          let trou = false;
          for (let x = addDays(prev, 1); joined && x < d; x = addDays(x, 1)) {
            if (!prevu(x)) continue;
            if (!sansAccueilPrevu(x)) { joined = false; break; }
            trou = true;
          }
          if (joined && trou) {
            const ce = certif(last), ce2 = certif([d]);
            const couvert = (ce.au && ce.au >= d) || (ce2.du && ce2.du <= prev);
            const inconnu = !ce.au && !ce2.du;
            joined = !!couvert || (joindreInconnu && inconnu);
          }
          if (joined) { last.push(d); continue; }
        }
        eps.push([d]);
      }
      return eps;
    };
    // Bornes possibles quand le certificat manque : il peut commencer dès le lendemain du dernier jour d'accueil prévu
    // avant l'absence (13 jours au plus) et finir la veille du suivant. Servent seulement à savoir si la donnée compte.
    const debutAuPlusTot = (d: ISODate): ISODate => {
      let s = d;
      for (let x = addDays(d, -1), n = 0; n < 13 && x >= c.start && sansAccueil(x) && contractYearIndex(c, x) === contractYearIndex(c, d); x = addDays(x, -1), n++) s = x;
      return s;
    };
    const finAuPlusTard = (d: ISODate): ISODate => {
      let e = d;
      for (let x = addDays(d, 1), n = 0; n < 13 && (!c.end || x <= c.end) && sansAccueil(x) && contractYearIndex(c, x) === contractYearIndex(c, d); x = addDays(x, 1), n++) e = x;
      return e;
    };
    const trackedYear = contractYearIndex(c, c.trackedFrom);
    const deja = c.balances.maladieDeduits;
    const lecture = (tot: boolean, tard: boolean, soldeLong: boolean, joindre: boolean): Set<ISODate> => {
      const out = new Set<ISODate>();
      const yearState = new Map<number, { left: number; longUsed: boolean }>();
      for (const ep of episodesDe(joindre)) {
        const ce = certif(ep);
        const debut = ce.du && ce.du <= ep[0] ? ce.du : tot ? debutAuPlusTot(ep[0]) : ep[0];
        const fin = ce.au && ce.au >= ep.at(-1)! ? ce.au : tard ? finAuPlusTard(ep.at(-1)!) : ep.at(-1)!;
        const y = contractYearIndex(c, ep[0]);
        let st = yearState.get(y);
        if (!st) {
          st = y !== trackedYear || deja <= 0 ? { left: 5, longUsed: false }
            : soldeLong ? { left: 5, longUsed: true } : { left: 5 - Math.min(5, deja), longUsed: deja > 5 };
          yearState.set(y, st);
        }
        const calendaires = daysBetween(debut, fin) + 1;
        if (calendaires >= 14 && !st.longUsed) {
          // L'absence longue : retenue sur 14 jours calendaires consécutifs au plus, sans entamer les 5 jours.
          const limit = addDays(debut, 13);
          ep.filter((d) => d <= limit).forEach((d) => out.add(d));
          st.longUsed = true;
        } else {
          ep.slice(0, st.left).forEach((d) => out.add(d));
          st.left = Math.max(0, st.left - ep.length);
        }
      }
      return out;
    };
    const soldeConnu = c.balances.maladieDeduitsLongue;
    const soldes = deja > 0 && soldeConnu === undefined ? [false, true] : [soldeConnu ?? false];
    const variantes: Set<ISODate>[] = [];
    for (const tot of [false, true]) for (const tard of [false, true]) for (const s of soldes) for (const j of [false, true]) variantes.push(lecture(tot, tard, s, j));
    const base = variantes[0];
    const retenus = new Set([...base]);
    const demandes = new Map<ISODate, string>();
    for (const ep of episodesDe(false)) {
      const diff = ep.filter((d) => !variantes.every((v) => v.has(d) === base.has(d)));
      if (!diff.length) continue;
      const ce = certif(ep);
      const manque: string[] = [];
      if (!ce.du || !ce.au) manque.push(`les dates de début et de fin du certificat médical de l’absence du ${jjmm(ep[0])} au ${jjmm(ep.at(-1)!)} (saisis-les sur un des jours de l’absence)`);
      if (soldes.length > 1) manque.push('dans le contrat, si les jours d’enfant malade déjà retenus avant le suivi par l’app venaient d’absences courtes ou d’une absence de 14 jours');
      const msg = `Enfant malade : indique ${manque.join(', et ')}. La convention (article 105) compte « 14 jours calendaires consécutifs » : le résultat en dépend. L’app calcule ce mois dès que c’est saisi.`;
      for (const d of diff) demandes.set(d, msg);
    }
    return { retenus, demandes };
  });
}

const jjmm = (d: ISODate) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function contractYearIndex(c: Contract, d: ISODate): number {
  let i = 0;
  while (addMonthsToDate(c.start, 12 * (i + 1)) <= d) i++;
  return i;
}

/**
 * Minutes prévues d'un jour qui comptent dans les seuils de la semaine (durée du contrat, 45 h). T-103 (H1 à H3) :
 * - CCN 96.4 : heures « de travail effectuées » ; CCN 99 : le travail commence et finit aux heures prévues, même si l'enfant
 *   arrive plus tard ou part plus tôt : un jour d'accueil compte ses heures prévues ;
 * - H1 : jour de congé payé de l'AM : compté (Cass. soc. 10/09/2025, n° 23-14.455, publié : le salarié en congé payé une
 *   partie de la semaine « peut prétendre au paiement des majorations […] qu'il aurait perçues s'il avait travaillé ») ;
 * - H2 : absence de l'enfant, même payée : non comptée (aucune heure effectuée) ;
 * - H3 : férié chômé et jour d'événement familial : non comptés (rien n'est effectué), sauf le 1er mai chômé (décision D1,
 *   CCN 47.1) ; jours retenus sur le salaire : non comptés.
 */
export function minutesSeuil45(ctx: Ctx, d: ISODate): number {
  const di = dayInfo(ctx, d);
  if (di.plannedMin <= 0) return 0;
  switch (di.kind) {
    case 'present':
    case 'prevu':
      return di.plannedMin;
    case 'am':
      return di.amLeave === 'cp' && !di.cpSansDroits ? di.plannedMin : 0;
    case 'ferie':
      return isMayDay(d) ? di.plannedMin : 0;
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
 * `complPrevu` (part des heures complémentaires qui sont des heures prévues au-delà de la base, sert à la régularisation).
 */
export function weekOvertimeDetail(ctx: Ctx, monday: ISODate): { parJour: Map<ISODate, { compl: number; maj: number; complPrevu?: number }> } {
  return memo(ctx, 'wkd' + monday, () => {
    const base = weekOvertimeL1(ctx, monday);
    const t = termsAt(ctx.c, monday);
    if (!pvActif(t) || (lecturePV(t) !== 'L2' && formePV(t) !== 'remis')) return { parJour: base };
    return { parJour: weekOvertimeL2(ctx, monday, baseHebdoMin(t), base) };
  });
}

/**
 * T-076, lecture L2 (spécification, section 1 ; R-PV-04, P-PV-1, P-PV-2) : HC(s) = max(0 ; réel(s) − B − HM(s)),
 * B = heures mensualisées × 12 ÷ (52 ou N). Les heures prévues au-delà de B sont des HC. Heures majorées (au-delà de 45 h,
 * R-PV-05) : calcul de l'app (`base`). Réel(s) : heures qui comptent (minutesSeuil45, T-103 H1 à H3) plus les heures en plus.
 * T-103 (H4) : première ou dernière semaine coupée par le contrat : CCN 96.4, au-delà de « la durée de travail hebdomadaire
 * prévue au contrat » pour cette semaine-là : B × jours prévus de la semaine dans le contrat ÷ jours prévus de la semaine.
 * Rattachement au mois : les heures de la semaine sont rangées dans l'ordre des jours ; les HC vont au jour où elles tombent.
 */
function weekOvertimeL2(ctx: Ctx, monday: ISODate, B: number, base: Map<ISODate, { compl: number; maj: number }>): Map<ISODate, { compl: number; maj: number; complPrevu?: number }> {
  const c = ctx.c;
  const jours = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const prevus = jours.filter((d) => planningBrutMin(termsAt(c, d), d) > 0);
  const dansContrat = prevus.filter((d) => inContract(c, d));
  const b = prevus.length && dansContrat.length < prevus.length ? (B * dansContrat.length) / prevus.length : B;
  const hm = jours.reduce((a, d) => a + (base.get(d)?.maj ?? 0), 0);
  const morceaux = jours.map((d) => ({ d, prevu: minutesSeuil45(ctx, d), extra: dayInfo(ctx, d).extraMin }));
  const total = Math.max(0, morceaux.reduce((a, x) => a + x.prevu + x.extra, 0) - b - hm);
  let pos = 0;
  const part = (n: number) => { const a = pos, e = pos + n; pos = e; return Math.max(0, Math.min(e, b + total) - Math.max(a, b)); };
  const out = new Map<ISODate, { compl: number; maj: number; complPrevu?: number }>();
  for (const x of morceaux) {
    const p = part(x.prevu), e = part(x.extra), m = base.get(x.d);
    if (p || e || m) out.set(x.d, { compl: p + e, maj: m?.maj ?? 0, complPrevu: p });
  }
  return out;
}


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
  ferieAmount: number;
  ferieDays: ISODate[];
  presenceDays: number;
  extraDays: number;
  entretien: number;
  repas: number;
  km: number;

  /** T-103 (C9) : indemnités journalières de la Sécurité sociale déduites du salaire de ce mois (CCN 48.1.3.1.3) */
  ijDeduites?: number;
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
    // T-076, D18 et N2 : mois qui va au-delà du terme précis d'un CDD sans fin enregistrée à cette date. Terme passé : les jours
    // après sont travaillés hors du CDD (L1243-11), le mois est refusé. Terme à venir : mois calculé, alerte.
    const c0 = ctx.c;
    if (r.active && !r.fromHistory && c0.cdd && c0.cddTerme && !c0.cddTermeImprecis && (!c0.end || c0.end > c0.cddTerme) && lastDay(m) > c0.cddTerme && firstDay(m) <= (c0.end ?? lastDay(m))) {
      if (joursApresTermeRefuses(c0, lastDay(m), ctx.today)) r.nonGere.push(messageApresTerme(c0.cddTerme));
      else if (monthOf(c0.cddTerme) === m) r.alerts.push(messageTermeAVenir(c0.cddTerme));
      else r.nonGere.push(messageMoisApresTerme(c0.cddTerme));
    }
    // T-103 (C3, C5) : donnée à saisir (dates du certificat, origine des jours déjà retenus) : le mois attend la saisie.
    // T-103 (C14, R3) : même règle pour les droits à congés non calculés et les indemnités journalières à saisir.
    if (r.active && !r.fromHistory) {
      const dem = sickLectures(ctx).demandes;
      for (const x of cpDemandesEntre(ctx, firstDay(m), lastDay(m))) if (!r.nonGere.includes(x)) r.nonGere.push(x);
      for (const d of eachDay(firstDay(m), lastDay(m))) {
        for (const x of [dem.get(d), dayInfo(ctx, d).donneeManquante]) if (x && !r.nonGere.includes(x)) r.nonGere.push(x);
      }
    }
    return r;
  });
}

function emptyBase(m: Month): MonthBase {
  return {
    month: m, active: false, fromHistory: false, missing: false, salaireMens: 0, mensuelMin: 0, divisorDays: 0,
    divisorMin: 0, contractDays: 0, contractMin: 0, deductedDays: 0, deductedMin: 0, paidFraction: 0, base: 0,
    retenue: 0, heuresNormales: 0, joursActivite: 0, complMin: 0, majMin: 0, majContratMin: 0, majContratAmount: 0, complAmount: 0, majAmount: 0,
    ferieAmount: 0, ferieDays: [], presenceDays: 0, extraDays: 0, entretien: 0, repas: 0, km: 0, net: 0,
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

/** Régularisation : heures dues (planning, hors absences retenues) contre heures payées, sur [from, to] (CCN 124). */
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
    // T-076 (L2) : les heures prévues au-delà de la base, payées en heures complémentaires, sont déjà versées (au taux du contrat).
    const verse = b.base + Math.round(((b.complPrevuMin ?? 0) * termsAt(c, lastDay(m)).rateNet) / 60);
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

const SUM_KEYS = ['base', 'retenue', 'majContratMin', 'majContratAmount', 'joursActivite', 'complMin', 'majMin', 'complAmount', 'majAmount', 'complPrevuMin', 'ferieAmount',
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
  let entretienExact = 0;
  let kmJours = 0, sansSoldePayes = 0;
  const forgotten: ISODate[] = [];
  for (const d of allDays) {
    if (!inSeg(d)) continue;
    const di = dayInfo(ctx, d);
    if (di.inDivisor) { cDays++; cMin += di.plannedMin; }
    if (di.deducted) { dedDays++; dedMin += di.plannedMin; }
    // Jours d'activité (Pajemploi) : jours prévus et payés, sans les fériés chômés.
    // T-025 C-4 : un férié pendant un congé pour événement familial reste un férié chômé (art. 47) : payé, pas compté.
    if (di.inDivisor && !di.deducted && di.kind !== 'ferie' && !(di.kind === 'am' && di.ferie)) actDays++;
    if (di.cpSansDroits) cpSansDroits++;
    if (di.sansSoldeEnfantPaye && di.plannedMin > 0) { r.alerts.push(messageSansSoldeEnfant(d)); sansSoldePayes++; }
    if (di.departOublie) forgotten.push(d);
    // T-074 (P-1) : mois avec des jours de préavis dispensés par les parents : déclaration Pajemploi à confirmer.
    if (di.dispense && !r.alerts.includes(MESSAGE_DISPENSE_PAJEMPLOI)) r.alerts.push(MESSAGE_DISPENSE_PAJEMPLOI);
    if (di.raisonRetenue && !r.alerts.includes(di.raisonRetenue)) r.alerts.push(di.raisonRetenue);
    if (di.ferieNonPaye) r.alerts.push(`Férié du ${d.slice(8, 10)}/${d.slice(5, 7)} non payé : tu étais absente le jour prévu juste avant ou juste après (article 47 de la convention).`);
    if (di.rec?.abs === 'malade_certif' && !di.deducted && di.plannedMin > 0) r.sickPaidNotice = true;
    if (di.kind === 'present' || di.kind === 'prevu') {
      if (di.presentMin > 0) {
        r.presenceDays++;
        if (di.plannedMin === 0) r.extraDays++;
        // T-103 (décision du DG du 24/11/2026, rapports/T-103-inventaire.md, M1 à M3). Un seul montant par jour :
        // - durée : temps de travail de l'art. 99 (CCN 114.1 : « versée en cas de travail effectif, par heure de travail » ;
        //   « Il varie en fonction de la durée de travail effectif ») : heures prévues plus présence hors des plages prévues ;
        //   hors planning, la présence de l'enfant ;
        // - contrat par heure : montant horaire × durée ; contrat « montant fixe par journée » : ce montant, quelle que soit
        //   la durée (clause du contrat) ;
        // - au moins le minimum de l'art. 114.1 sur cette durée. Arrondi au centime le plus proche (ARR-01).
        const duree = di.plannedMin > 0 ? di.plannedMin + di.extraMin : di.presentMin;
        const plancher = entretienPlancher(d, duree);
        // T-023 : avant les barèmes vérifiés, le plancher légal n'est pas connu. L'app retient le montant du contrat et le dit.
        if (plancher === undefined) entretienNonVerifie = true;
        const parHeure = (c.entretienMode ?? (c.entretienHeure ? 'heure' : 'jour')) === 'heure';
        const brutJour = parHeure ? ((c.entretienHeure ?? 0) * duree) / 60 : c.entretienJour;
        entretienExact += Math.round(Math.max(brutJour, plancher ?? 0));
        // T-034 (ENTRETIEN-SOUS-MINIMUM) : tarif du contrat sous le minimum.
        if (plancher !== undefined && brutJour < plancher) { entretienSousMin++; entretienMinVerse += plancher - brutJour; }
        const nbRepas = di.rec?.repas ?? c.repasParJour;
        r.repas += nbRepas * c.repasPrix;
      }
      if (di.ferie && (di.ferieTravaille || di.kind === 'present') && di.presentMin > 0) {
        const pct = isMayDay(d) ? 100 : 10;
        r.ferieAmount += Math.round((di.presentMin * c.rateNet * pct) / 100 / 60);
        r.ferieDays.push(d);
      }
    }
    // CCN art. 113 (T-025 C-2) : donnée manquante, le jour porte `donneeManquante` (computeDay) et le mois attend.
    if (di.rec?.km) {
      kmJours++;
      r.km += indemniteKmJour(di.rec.km, c.kmTaux, di.rec.kmPartage, di.rec.kmEnfants) ?? 0;
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
  const fraction = fractionPayee;
  const basePayee = Math.round(smens * fractionPayee);
  r.paidFraction = fraction;
  r.base = basePayee;
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
  else if (startsOrEndsInMonth) r.joursActivite = Math.max(0, (joursMensualises(c) * (fullDays ? segDays / fullDays : 0)) - dedDays) + r.extraDays;
  else r.joursActivite = Math.max(0, joursMensualises(c) - dedDays) + r.extraDays;
  // ARR-01 (décision du DG du 18/11/2026) : chaque montant du jour est arrondi au centime le plus proche (CCN 114.1 fixe un
  // montant journalier), comme les km jour par jour.
  r.entretien = entretienExact;
  // T-038 (G-1, relecture V4 du diff m8) : mois terminé avec des jours notés « sans solde » avant la mise à jour T-035b. Il a
  // pu être déclaré à Pajemploi avec la retenue ; son salaire affiché est maintenant plus haut. Le dire, et quoi faire.
  if (sansSoldePayes && to < ctx.today) {
    r.alerts.push(messageMoisSansSoldeChange(sansSoldePayes));
    if (!r.alerts.includes(MESSAGE_MOIS_DEJA_DECLARE)) r.alerts.push(MESSAGE_MOIS_DEJA_DECLARE);
  }
  if (kmJours && c.kmTaux > 0) for (const m of controleKm(ctx.c.kmCv, c.kmTaux, segFrom).messages) if (!r.alerts.includes(m)) r.alerts.push(m);
  // CCN art. 114.1 : « le montant journalier de cette indemnité ne peut pas être inférieur à 2,65 € » et le montant horaire
  // ne peut être « inférieur à 90 % du minimum garanti lorsque la durée de travail journalière est de 9 heures ».
  if (entretienSousMin) r.alerts.push(`Indemnité d’entretien : le montant du contrat (${c.entretienHeure ? `${euros(c.entretienHeure)} par heure` : `${euros(c.entretienJour)} par jour`}) est sous le minimum de la convention (article 114.1) pour ${dayCountLabel(entretienSousMin)}. L’app verse le minimum, soit ${euros(Math.round(entretienMinVerse))} de plus que le contrat ce mois-ci. Fais corriger le contrat avec les parents, par un avenant.`);
  if (entretienNonVerifie) r.alerts.push(`${MESSAGE_PERIODE_NON_GEREE} Indemnité d’entretien : l’app retient le montant du contrat, sans contrôle du minimum légal ; vérifie-le avec les parents.`);
  // R-CP-09 : un congé dont le décompte reste ambigu est signalé, pas tranché (T-019).
  if (cpSansDroits) {
    r.alerts.push(`${dayCountLabel(cpSansDroits)} de congés pris au-delà de tes droits acquis : retenu${cpSansDroits > 1 ? 's' : ''} comme congés sans solde. Si ton solde de congés au début du suivi est faux, corrige-le dans le contrat ; si les parents ont accepté par écrit des congés par anticipation, signale-le avec « Ça coince ».`);
  }
  if (c.yearType === 'incomplete') {
    const manque = semainesSansAccueilManquantes(ctx.c, regulStart(ctx.c, addDays(segTo, 1)), segTo);
    if (manque > 0) r.alerts.push(`Année incomplète : il manque ${manque} semaine${manque > 1 ? 's' : ''} sans accueil dans le contrat. Tant qu’elles ne sont pas saisies, la régularisation de fin de contrat n’est pas calculée.`);
  }

  // Heures en plus, par semaine, rattachées au mois du jour.
  const weeks = new Set(allDays.filter(inSeg).map(mondayOf));
  // T-103 (H8) : planning remis, une seule lecture : CCN 96.4 définit les heures complémentaires comme les heures effectuées
  // « au-delà de la durée de travail hebdomadaire prévue au contrat » ; l'art. 98.1.2, al. 3, permet des heures au-delà du
  // planning remis sans les qualifier. Base = durée du contrat (weekOvertimeDetail, lecture L2).
  const t0 = { compl: 0, maj: 0, prevu: 0 };
  for (const mon of weeks) for (const [d, v] of weekOvertimeDetail(ctx, mon).parJour) {
    if (monthOf(d) !== m || !inSeg(d)) continue;
    t0.compl += v.compl; t0.maj += v.maj; t0.prevu += v.complPrevu ?? 0;
  }
  r.complMin = t0.compl; r.majMin = t0.maj;
  const complPrevu = t0.prevu;
  // R-HC-02 (CCN art. 96.4 et 110.2) : payées au taux du contrat, majorées seulement si le contrat le prévoit (T-019).
  r.complAmount = Math.round((r.complMin * c.rateNet * (100 + (c.majorationCompl ?? 0))) / 100 / 60);
  r.majAmount = Math.round((r.majMin * c.rateNet * (100 + c.majoration)) / 100 / 60);
  if (pvActif(c)) {
    // T-076 : la base des heures complémentaires est celle du contrat (message à l'AM, spécification section 1).
    r.alerts.unshift(messageBasePV(c));
    if (complPrevu) r.complPrevuMin = complPrevu;
  }

  // T-103 (C9) : congé indemnisé par la Sécurité sociale (congé de deuil, CCN 48.1.3.1.3) : « le particulier employeur maintient
  // le salaire sous déduction des indemnités journalières versées ». Montant saisi par l'AM (AmLeave.ijSecu), réparti sur les
  // mois au prorata des jours calendaires du congé.
  // T-103 (R3) : en Alsace-Moselle, même déduction pour l'absence de l'AM pour sa maladie ou celle de son enfant (L1226-23).
  const maintienLocal = regionDe(ctx.c) === 'alsaceMoselle';
  for (const l of ctx.leaves) {
    const local = maintienLocal && (l.type === 'am_malade' || l.type === 'am_enfant_malade');
    if ((l.type !== 'evenement' && !local) || !l.ijSecu || l.to < segFrom || l.from > segTo) continue;
    const tous = daysBetween(l.from, l.to) + 1;
    const ici = daysBetween(l.from > segFrom ? l.from : segFrom, l.to < segTo ? l.to : segTo) + 1;
    const part = Math.round((l.ijSecu * ici) / tous);
    if (!part) continue;
    r.base = Math.max(0, r.base - part);
    r.ijDeduites = (r.ijDeduites ?? 0) + part;
    r.alerts.push(local
      ? `${MESSAGE_MAINTIEN_LOCAL} ${euros(part)} d’indemnités journalières déduits du salaire de ce mois.`
      : `Congé indemnisé par la Sécurité sociale : ${euros(part)} d’indemnités journalières déduits du salaire de ce mois (convention, article 48.1.3.1.3 : salaire maintenu « sous déduction des indemnités journalières versées »).`);
  }
  r.net = r.base + r.complAmount + r.majAmount + r.ferieAmount;
  if (forgotten.length) r.alerts.push(`${forgotten.length} départ${forgotten.length > 1 ? 's' : ''} non pointé${forgotten.length > 1 ? 's' : ''} : l’heure prévue a été retenue.`);
  if (r.sickPaidNotice) r.alerts.push('Des jours d’enfant malade dépassent la limite de l’article 105 : ils restent payés.');
  return r;
}

export function monthBrut(ctx: Ctx, m: Month): number {
  const b = monthBase(ctx, m);
  if (b.brut) return b.brut;
  return brutDuNet(ctx.c, b.net, lastDay(m));
}

/**
 * T-103 (D1) : brut d'une somme nette du salaire. Avec le taux horaire brut du contrat : net × brut ÷ net (CCN 107, 109 : le
 * salaire se calcule sur le salaire horaire brut, les heures et majorations suivent le même taux). Sans lui : estimation
 * interne (part fixe, rates.ts), jamais affichée comme un montant (`brutConnu`).
 */
export function brutDuNet(c: Contract, net: number, d: ISODate): number {
  const t = termsAt(c, d);
  if (t.rateBrut && t.rateNet) return Math.round((net * t.rateBrut) / t.rateNet);
  return netToBrut(net, d, regionDe(c));
}
/** T-103 (D1) : le brut de la date `d` se calcule exactement (taux horaire brut du contrat saisi) */
export const brutConnu = (c: Contract, d: ISODate): boolean => !!termsAt(c, d).rateBrut;
/** T-103 (D1) : donnée demandée quand le brut n'est pas connu */
export const MESSAGE_TAUX_BRUT = 'Indique dans le contrat ton salaire horaire brut (il est écrit dans ton contrat, à côté du net : convention, article 41.1). L’app en a besoin pour donner ton salaire brut exact.';

export function dayCountLabel(n: number): string {
  return `${n} jour${n > 1 ? 's' : ''}`;
}

export { daysBetween };
