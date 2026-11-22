// Fin de contrat : préavis (art. 120), indemnité de rupture (art. 121), régularisation (art. 109.2),
// indemnité de congés non pris. Aucun document officiel n'est produit.
import { nonGeresPeriode } from './nonGeres';
import { pvActif } from './planningVariable';
import { finPreavis, finsAdmises, preavisEmployeur } from './preavis';
import { FINS_CDD, FINS_CDD_NON_GEREES, type DemandeurInexecution, type FinCdd, type FinCddNonGere, type Motif } from './model';
import { libelleLecturesCdd, messagesCdd, MESSAGE_CDD_12_MOIS, MESSAGE_CDD_DEVIENT_CDI } from './cdd';
import { euros } from './money';
import {
  addDays, addMonthsToDate, cpPeriod, cpPeriodStartYear, fullMonthsBetween, lastDay, monthOf, monthsBetween, shortDate,
  type ISODate, type Month,
} from './dates';
import { acquisition, baseDixieme, compteur, cpForMonth, indemnite, maintien } from './conges';
import { absencesL2NonGerees, ctxLectureCdd2, messageAbsenceL2, libelleRegulJoursAConfirmer, makeCtx, monthBase, naturesAConfirmer, monthBrut, regularisationLectures, regulStart, semainesSansAccueilAnnee, semainesSansAccueilManquantes, termsAt, type Ctx } from './payroll';
import { netToBrut } from './rates';
import { computeMonth } from './month';

/** Entrée en vigueur de l'avenant n° 10 du 9 septembre 2025 (inaptitude) */
const AVENANT_10 = '2026-05-01';

export type { DemandeurInexecution, FinCdd, FinCddNonGere, Motif } from './model';

export const MOTIF_LABEL: Record<Motif, string> = {
  retrait: 'Les parents retirent l’enfant',
  demission: 'Je démissionne',
  deces: 'Décès de l’enfant',
  inaptitude: 'Inaptitude sans lien avec le travail',
  inaptitude_pro: 'Inaptitude après un accident du travail ou une maladie professionnelle',
  faute_grave: 'Faute grave reprochée',
  essai: 'Rupture pendant la période d’essai',
  fin_cdd: 'Fin de CDD',
};

/** Motifs de fin d'un CDI (écran Fin) : le motif `fin_cdd` est réservé au CDD (T-076) */
export const MOTIFS_CDI = (Object.keys(MOTIF_LABEL) as Motif[]).filter((m) => m !== 'fin_cdd');

/**
 * T-045 (constat B-2 de V5) : préavis non exécuté en tout ou en partie. CCN IDCC 3239, art. 64 (date de fin) et 64.2
 * (inexécution), Légifrance KALITEXT000043941642, lus en entier le 18/11/2026.
 * - `am_acceptee` : l'AM a demandé à ne pas faire tout ou partie du préavis et les parents l'ont accepté (art. 64.2, al. 2).
 * - `employeur` : les parents dispensent l'AM de tout ou partie du préavis (art. 64.2, al. 1).
 * - `am_sans_accord` : l'AM ne fait pas son préavis sans l'accord des parents (art. 64.2, al. 2, fin).
 */
export interface Inexecution { demandeur: DemandeurInexecution; dernierJourTravaille: ISODate }

export interface FinResult {
  ancienneteMois: number;
  preavisLabel: string;
  preavisFin: ISODate;
  /**
   * PREAVIS-DATE-FIN (regles/triage-f3.md) : aucun texte ne dit si le premier jour du préavis compte, ni comment compter
   * « un mois ». La date calculée est gardée, affichée « à confirmer ». Absent : pas de préavis à faire.
   */
  preavisFinAConfirmer?: string;
  dernierJour: ISODate;
  indemniteRupture: number;
  ruptureExplication: string;
  /** L'assiette de l'indemnité de rupture ne contient pas des congés payés encore à confirmer (T-019) */
  ruptureAConfirmer?: boolean;
  /** T-038 suite : l'indemnité change avec la date de fin à confirmer ; message avec les valeurs (non comptée) */
  ruptureVariantes?: string;
  /** Décès de l'enfant : indemnité égale au préavis (R-FIN-07, CCN art. 119.4.2), 0 pour les autres motifs */
  indemnitePreavis: number;
  indemnitePreavisExplication?: string;
  /** T-038 (R-1) : le montant change selon le premier jour retenu ; `indemnitePreavis` vaut 0 et n'est pas compté */
  indemnitePreavisAConfirmer?: string;
  totalBrut: number;
  /**
   * C-008 : mois dont le brut est estimé à partir du net (rapport fixe), faute de brut lu sur un bulletin.
   * Vide quand le total des salaires bruts a été saisi.
   */
  brutsEstimes: Month[];
  regularisation: number;
  regulMinutes: number;
  cpJoursRestants: number;
  cpIndemnite: number;
  /**
   * T-050b (A-50) : dixième de la période en cours (base ÷ 10, régularisation de fin comprise), avant comparaison au
   * maintien. Information pour le contrôle : ce n'est jamais un montant à payer seul (voir `cpIndemnite`, `cpAConfirmer`).
   */
  cpDixiemeEnCours: number;
  cpExplication: string;
  /** Congés non pris à confirmer : `cpIndemnite` vaut 0 et n'est pas compté (T-019) */
  cpAConfirmer?: string;
  /**
   * T-033 (décision de la direction, 18/11/2026) : la date de fin du préavis est « à confirmer » (PREAVIS-DATE-FIN). Si la
   * régularisation change quand le préavis finit un jour plus tard (seconde lecture : le jour de présentation ne compte pas,
   * ou le mois finit à la même date), elle n'est ni donnée ni comptée : `regularisation` vaut 0.
   */
  regularisationAConfirmer?: string;
  manquants: Month[];
  alertes: string[];
  /** T-031 : cas non gérés pendant le contrat. Rempli : aucun montant n'est donné (tous à 0), le calcul est refusé. */
  nonGere?: string[];
  /** T-076 : fin d'un CDD (champs suivants remplis seulement pour un CDD) */
  cdd?: true;
  finCdd?: FinCdd | FinCddNonGere;
  /**
   * T-076 : indemnité de fin de contrat (dite « de précarité »), en net, part sûre : arrondi(10 % × assiette nette, R-CDD-07) ;
   * 0 quand elle n'est pas due (R-CDD-08). Montant déclaré et payé (Urssaf : « sur la base du net »).
   */
  ifcNet?: number;
  /** T-076 : la même en brut, pour l'affichage seulement (dérivée du net, netToBrut) */
  ifc?: number;
  ifcExplication?: string;
  /** T-076 : assiette nette de l'IFC (salaires nets du CDD, congés versés et régularisation compris) */
  assietteNetteCdd?: number;
  /** T-076 : la même en brut, affichage seulement (netToBrut) */
  brutCdd?: number;
  /** T-076 : IFC impossible à donner (base incomplète, congés à confirmer…) : `ifc` vaut 0 et n'est pas compté */
  ifcAConfirmer?: string;
  /** T-076 : part de l'IFC (en net) qui dépend d'une lecture (P1, P2, P4) : hors du total, `ifcNet` est la part sûre */
  ifcPartAConfirmer?: PartAConfirmer;
  /** T-076 : part de l'indemnité de congés non pris qui dépend d'une lecture (P1 à P3, plancher L1242-16) : hors du total */
  cpPartAConfirmer?: PartAConfirmer;
  /**
   * T-076 : part de la somme de fin (régularisation et, pour P1 et P2, complément qui porte le total versé au plus petit des
   * deux totaux du CDD) qui dépend d'une lecture : hors du total. `lectures` : reste dû à la fin dans chaque lecture.
   */
  regularisationPartAConfirmer?: PartAConfirmer;
  /**
   * T-076 : régularisation de fin de contrat (art. 109.2 et 124) de chaque lecture du salaire (P2 : lecture 1 puis lecture 2),
   * part basse si elle dépend aussi de jours à confirmer. Information : la somme versée à la fin est `regularisation`.
   */
  regularisationParLecture?: number[];
  /** T-076 : sommes de la fin à déclarer à Pajemploi qui ne correspondent à aucune heure (champ de l'API Pajemploi) */
  declaration?: { champ: 'mntIndPrecarite'; libelle: string; net: number; hint: string }[];
}

/**
 * T-076 (decisions-direction, principe commun) : « la part sûre est payée ; la part qui dépend de la lecture est affichée
 * « à confirmer » à côté, hors du total ». `montant` : écart, hors du total ; `lectures` : valeurs de chaque lecture.
 */
export interface PartAConfirmer { montant: number; message: string; lectures: number[] }

/** PREAVIS-DATE-FIN : méthode de l'app sans texte (premier jour compté ; un mois de date à date, du 15/10 au 14/11) */
export const MESSAGE_PREAVIS_FIN =
  'Date de fin du préavis à confirmer. Aucun texte ne dit si le jour où la lettre est présentée compte comme premier jour, ni comment compter un mois. L’app compte ce jour comme le premier. Vérifie la date avec les parents : le dernier salaire en dépend.';

/**
 * PREAVIS-DEMISSION-3-12 (T-034, décision du DG) : démission de 3 mois à moins d'un an d'accueil. La durée elle-même est en
 * conflit : CASF L423-26 (« un enfant qui lui était confié depuis au moins trois mois est subordonnée […] à un préavis
 * d'un mois ») ; CCN art. 120 (« 15 jours calendaires si l'enfant est accueilli depuis 3 mois et jusqu'à moins d'un an »).
 * L'app applique 15 jours, le dit, et garde la date de fin à confirmer (MESSAGE_PREAVIS_FIN). T-038 (AC-1) : la régularisation
 * et l'indemnité de congés non pris sont aussi calculées avec un préavis d'un mois ; si elles changent, « à confirmer ».
 */
export const MESSAGE_PREAVIS_DEMISSION_3_12 =
  'Durée du préavis à confirmer. Pour une démission entre 3 mois et 1 an d’accueil, la loi (code de l’action sociale et des familles, article L423-26) prévoit un mois, la convention (article 120) 15 jours. La question a été posée à la DDETS le 18/11/2026. L’app applique 15 jours : si c’est un mois, la date de fin et le dernier salaire changent, et la régularisation et l’indemnité de congés non pris peuvent changer aussi (elles sont alors à confirmer).';

/**
 * Indemnité compensatrice de préavis (R-FIN-05, CCN art. 64.2, 66, 122) : salaire mensualisé de chaque mois couvert,
 * réduit au prorata des heures (année complète) ou des jours (année incomplète) prévus quand le préavis ne couvre qu'une
 * partie du mois (art. 111, comme un mois d'entrée ou de sortie).
 */
function indemniteCompensatricePreavis(c: Ctx['c'], from: ISODate, to: ISODate): number {
  const h: Ctx = { ...makeCtx({ ...c, start: from, end: to, trackedFrom: from, history: [] }, [], [], to), finControlee: true };
  let total = 0;
  for (const m of monthsBetween(monthOf(from), monthOf(to))) total += monthBase(h, m).base;
  return total;
}


/** T-038 suite : total des salaires bruts (salaires et congés versés) du début du contrat au `fin`, comme dans `finDeContrat`. */
function brutJusqua(endCtx: Ctx, c: Ctx['c'], fin: ISODate, enfants: number): number {
  let total = 0;
  for (const m of monthsBetween(monthOf(c.start), monthOf(fin))) {
    const b = monthBase(endCtx, m);
    if (!b.active || b.missing) continue;
    total += monthBrut(endCtx, m);
    const cp = cpForMonth(endCtx, m, enfants);
    total += netToBrut(cp.indemnite + cp.complement, lastDay(m));
  }
  return total;
}

/**
 * Indemnité de congés non pris à la fin `dernierJour` (T-038 : sortie de `finDeContrat` pour être recalculée à une autre
 * date de fin). `endCtx` : contexte dont le contrat finit le `dernierJour`. `regul` : régularisation de fin de contrat due
 * à l'AM (T-050b, A-50), ajoutée à la base du dixième de la période en cours. Exportée pour les tests (T-050b).
 */
export function congesNonPris(endCtx: Ctx, c: Ctx['c'], dernierJour: ISODate, enfants: number, regul = 0): { cpIndemnite: number; jours: number; cpExplication: string; cpAConfirmer?: string; dixiemeEnCours: number } {
  const finTerms = termsAt(c, dernierJour);
  const cpt = compteur(endCtx, dernierJour, enfants);
  const y = cpPeriodStartYear(dernierJour);
  const acq = acquisition(endCtx, y, enfants);
  const restantsPrec = Math.max(0, cpt.reste);
  // Période en cours : dixième de la base à date, ou maintien, le plus favorable.
  // T-050b (A-50, regles/t050-trois-regles.md, point 3) : la base comprend la régularisation de fin de contrat due à l'AM.
  // CCN art. 123.1 et 123.2 : l'ICCP suit l'article 48.1.1.5 ; 48.1.1.5 : dixième de la rémunération totale brute « perçue
  // au cours de la période de référence », seule exclusion les indemnités du chapitre VIII (art. 57 à 59) ; 48.1.1.1 : la
  // dernière période va jusqu'à la date de fin comprise ; 124 : « régularisation définitive du salaire », « effectuée à la
  // date de fin du contrat de travail », soumise à cotisations. CASF L423-6 et L423-19 : même résultat. Fiches DDETS 31 5/5
  // et « Régularisation » du 05/11/2024 : « la somme due est à intégrer dans la base de calcul de l'ICCP selon la méthode du
  // dixième » ; fiche « Accueil sur 46 semaines ou moins » : 285,71 € dans la base. Un solde en faveur de l'employeur ne
  // se retire pas de la base (art. 124 : versement « au profit de l'assistant maternel »).
  // L'ICCP de la période précédente n'y est PAS ajoutée : les sources se contredisent (M-5, SUS-04, question à la DDETS n° 5).
  // Point 1 de T-050 (direction) : dixième = base ÷ 10, sans prorata des jours pour enfants.
  const indCur = indemnite(endCtx, y, enfants);
  const joursCur = acq.joursADate;
  const regulDue = Math.max(0, regul);
  const dixiemeEnCours = regulDue > 0 ? Math.round((baseDixieme(endCtx, y, enfants).base + regulDue) / 10) : Math.round(indCur.dixieme);
  const curMontant = Math.max(dixiemeEnCours, maintien(endCtx, joursCur, dernierJour));
  // Période précédente : jours restants, moins ce qui a déjà été versé.
  let precMontant = 0;
  if (restantsPrec > 0) {
    if (finTerms.yearType === 'complete') {
      // Les jours pris ont été payés dans le salaire, le complément du dixième en juin : reste le maintien.
      precMontant = maintien(endCtx, restantsPrec, dernierJour, y - 1);
    } else {
      const indPrev = y - 1 >= cpPeriodStartYear(c.trackedFrom) ? indemnite(endCtx, y - 1, enfants) : null;
      if (indPrev && indPrev.jours) {
        let deja = 0;
        for (const m of monthsBetween(`${y}-06`, monthOf(dernierJour))) deja += cpForMonth(endCtx, m, enfants).indemnite;
        precMontant = Math.max(0, indPrev.montant - deja);
      } else {
        precMontant = maintien(endCtx, restantsPrec, dernierJour, y - 1);
      }
    }
  }
  let cpIndemnite = curMontant + precMontant;
  let cpExplication = `${joursCur} jour${joursCur > 1 ? 's' : ''} acquis depuis le 1er juin (${cpPeriod(y).from.slice(0, 4)})` +
    (restantsPrec ? ` et ${restantsPrec} jour${restantsPrec > 1 ? 's' : ''} de la période précédente non pris` : '') +
    ' : on retient le plus favorable entre le dixième et le maintien de salaire.';
  // T-076 (R-PV-13, P-PV-5) : les jours non pris n'ont pas de planning ; le maintien suit la lecture C1 (heures prévues
  // moyennes de la période de référence). La lecture C2 (heures des jours de congé pris) n'a pas d'objet ici.
  if (pvActif(finTerms)) cpExplication += ' Horaires variables : le maintien de salaire est calculé sur tes heures prévues moyennes de la période, car des jours non pris n’ont pas de planning.';
  // T-019 : jours acquis (année incomplète, SUS-11) ou jours pris (R-CP-09) à confirmer : aucun montant n'est donné.
  let cpAConfirmer: string | undefined;
  const indPrecAC = restantsPrec > 0 && finTerms.yearType !== 'complete' && y - 1 >= cpPeriodStartYear(c.trackedFrom)
    ? indemnite(endCtx, y - 1, enfants).aConfirmer : undefined;
  // T-050b : les montants par lecture d'`indemnite` ne comptent pas la régularisation ; avec elle, chacun vaut au moins le
  // dixième régularisation comprise (montant = plus favorable entre dixième et maintien).
  let msgCur = acq.aConfirmer?.message ?? indCur.aConfirmer?.message;
  if (!acq.aConfirmer && indCur.aConfirmer && regulDue > 0) {
    // T-050d (C-3) : base du dixième elle-même incomplète (indemnité de l'an dernier ou salaire à confirmer, baseSure faux) :
    // chaque montant donné n'est qu'un minimum.
    const auMoins = indCur.aConfirmer.baseSure ? '' : 'au moins ';
    const avec = indCur.aConfirmer.montants.map((x) => `${auMoins}${euros(Math.max(dixiemeEnCours, x.montant))} (${x.libelle})`);
    msgCur = `${indCur.aConfirmer.message} Ces montants ne comptent pas la régularisation de fin de contrat (${euros(regulDue)}), qui entre dans la base du dixième (convention, articles 48.1.1.5 et 124) : ${avec.length ? `avec elle, ${avec.join(', ou ')}` : `avec elle, le dixième vaut ${auMoins}${euros(dixiemeEnCours)}`}.`;
  }
  const motifsAC = [
    msgCur,
    cpt.aPrendreAConfirmer?.message ?? indPrecAC?.message,
    ...cpt.decompteAConfirmer,
  ].filter((x): x is string => !!x);
  if (motifsAC.length) {
    cpAConfirmer = [...new Set(motifsAC)].join(' ');
    cpIndemnite = 0;
    cpExplication = 'À confirmer : le nombre de jours de congés n’est pas tranché. L’app ne donne pas de montant.';
  }
  return { cpIndemnite, jours: joursCur + restantsPrec, cpExplication, cpAConfirmer, dixiemeEnCours };
}

/**
 * `notif` : date d'envoi de la lettre recommandée ou de remise en main propre contre décharge (date du décès pour
 * un décès). L'ancienneté s'apprécie à cette date.
 * `presentation` : date de première présentation de la lettre recommandée (avis de passage). Le préavis part de
 * cette date ; en remise en main propre, c'est la date de remise (= `notif`). Jamais de l'annonce orale (C-017,
 * CCN art. 120 ; fiches DREETS Auvergne-Rhône-Alpes du 18/03/2024 ; code.travail.gouv.fr, IDCC 3239).
 */
/** Bruts réels connus : par mois (bulletins contrôlés), ou total saisi depuis les bulletins Pajemploi (C-008, main) */
export interface BrutsReels {
  parMois?: Partial<Record<Month, number>>;
  /** Total des bruts des bulletins Pajemploi, du début du contrat jusqu'au mois `jusqua` compris */
  total?: number;
  /** Dernier mois compris dans `total` ; les mois suivants (préavis, mois en cours) restent comptés à part */
  jusqua?: Month;
}

/**
 * T-050 (fusion) : le 6e paramètre est l'inexécution du préavis (T-045, direction) ou, pour les appels écrits avant la
 * fusion (écran Fin et tests de main), les bruts réels (C-008, main). Les deux ensemble : inexécution en 6e, bruts en 7e.
 */
export function finDeContrat(ctx: Ctx, notif: ISODate, motif: Motif, enfants = 0, presentation?: ISODate,
  inexecutionOuBruts?: Inexecution | BrutsReels, brutsReels?: BrutsReels): FinResult {
  const inexecution = inexecutionOuBruts && 'demandeur' in inexecutionOuBruts ? inexecutionOuBruts : undefined;
  const bruts: BrutsReels = brutsReels ?? (inexecutionOuBruts && !('demandeur' in inexecutionOuBruts) ? inexecutionOuBruts : {});
  // T-076 : un CDD finit sans préavis ni indemnité de rupture (R-CDD-06) : calcul à part, finDeCdd. La façon dont il finit est
  // celle enregistrée avec le contrat (écran Fin) ; sans elle, aucun montant.
  if (ctx.c.cdd || motif === 'fin_cdd') return finDeCdd(ctx, notif, motif === 'fin_cdd' ? ctx.c.rupture?.finCdd : undefined, enfants, motif);
  const c = ctx.c;
  const alertes: string[] = [];
  const anc = fullMonthsBetween(c.start, notif);
  const depart = presentation && presentation > notif ? presentation : notif;

  // Préavis (art. 120) : « un préavis est à effectuer en cas de rupture à l'initiative du particulier employeur ou du
  // salarié. Sa durée est au minimum de : – 8 jours calendaires lorsque l'enfant est accueilli depuis moins de 3 mois »
  // (T-023 : la démission avant 3 mois a aussi 8 jours ; le conflit CASF L423-26 / CCN 120 de 3 mois à 1 an relève de T-024).
  // Inaptitude (avenant n° 10 du 9 septembre 2025, art. 119-5 et 64-4) : rupture sans préavis, à la date d'envoi.
  let preavisFin = notif;
  let preavisFinAConfirmer: string | undefined;
  let preavisLabel = 'Pas de préavis';
  let demission312 = false;
  if (motif === 'inaptitude' || motif === 'inaptitude_pro') {
    preavisLabel = 'Pas de préavis en cas d’inaptitude : le contrat s’arrête à l’envoi de la lettre';
  } else if (motif === 'retrait' || motif === 'demission') {
    const p = preavisEmployeur(anc);
    preavisLabel = p.label;
    preavisFin = finPreavis(depart, p);
    demission312 = motif === 'demission' && anc >= 3 && anc < 12;
    preavisFinAConfirmer = demission312
      ? `${MESSAGE_PREAVIS_DEMISSION_3_12} ${MESSAGE_PREAVIS_FIN}`
      : MESSAGE_PREAVIS_FIN;
  }
  // Décès de l'enfant (R-FIN-07, CCN art. 119.4.2 ; Urssaf « motifs de fin de contrat » ; service-public.fr F16842) :
  // le contrat s'arrête le jour du décès, sans préavis à faire ; l'employeur verse une indemnité égale à l'indemnité
  // compensatrice de préavis (R-FIN-05), de la durée d'un retrait de l'enfant à la date du décès (R-FIN-02).
  // Choix de l'app, à valider (aucun texte ne fixe le premier jour) : la période part du lendemain du décès, car le jour
  // du décès est payé avec le dernier salaire.
  let indemnitePreavis = 0;
  let indemnitePreavisExplication: string | undefined;
  let indemnitePreavisAConfirmer: string | undefined;
  if (motif === 'deces') {
    const p = preavisEmployeur(anc);
    const debut = addDays(notif, 1);
    const fin = finPreavis(debut, p);
    indemnitePreavis = indemniteCompensatricePreavis(c, debut, fin);
    preavisLabel = `${p.label} : pas de préavis à faire, les parents te versent une indemnité égale au préavis`;
    indemnitePreavisExplication = `Égale au salaire que tu aurais touché pendant ${p.jours ? `${p.jours} jours` : 'un mois'}, du ${shortDate(debut)} au ${shortDate(fin)}.`;
    // T-038 (R-1, relecture V4) : le premier jour n'est fixé par aucun texte. Seconde lecture : la période part du jour du
    // décès. Si le montant change, il n'est ni donné ni compté.
    const fin2 = finPreavis(notif, p);
    const autre = indemniteCompensatricePreavis(c, notif, fin2);
    if (autre !== indemnitePreavis) {
      indemnitePreavisAConfirmer = `Indemnité égale au préavis à confirmer : aucun texte ne fixe son premier jour. Du ${shortDate(debut)} au ${shortDate(fin)} (lendemain du décès) : ${euros(indemnitePreavis)} ; du ${shortDate(notif)} au ${shortDate(fin2)} (jour du décès) : ${euros(autre)}. Elle n'est pas comptée dans le total. Vois-la avec les parents.`;
      indemnitePreavis = 0;
      indemnitePreavisExplication = 'À confirmer : le montant dépend du premier jour retenu.';
    } else {
      alertes.push(`Décès de l’enfant : l’indemnité égale au préavis est calculée du ${shortDate(debut)} au ${shortDate(fin)}. Aucun texte ne fixe le premier jour ; à partir du jour du décès, le montant serait le même.`);
    }
  }
  // T-045 : préavis non exécuté. Art. 64 : la date de fin est « la date prévue de fin du préavis » si l'inexécution est à
  // l'initiative de l'employeur, « le dernier jour travaillé » si elle est à l'initiative du salarié. Art. 64.2, al. 2 : avec
  // l'accord de l'employeur, « le contrat de travail prend fin au dernier jour travaillé » ; aucune indemnité n'est prévue
  // pour l'AM (service-public.fr F33164 et F16842 : l'AM « n'est pas payée pour la partie du préavis non réalisé »).
  // Seul ce cas est calculé. Les deux autres sont refusés, le texte ne fixant pas tous leurs effets (voir T-045-corrections.md).
  const refusFin: string[] = [];
  let dernierJour = preavisFin;
  let finAuDernierJourTravaille = false;
  if (inexecution) {
    const d = inexecution.dernierJourTravaille;
    if (motif !== 'retrait' && motif !== 'demission') {
      refusFin.push(`Préavis non exécuté : ce motif (${MOTIF_LABEL[motif].toLowerCase()}) n’a pas de préavis. Retire la réponse sur le préavis ou vérifie le motif.`);
    } else if (d < notif) {
      refusFin.push(`Préavis non exécuté : le dernier jour travaillé (${shortDate(d)}) est avant l’envoi de la lettre (${shortDate(notif)}). Cas non géré : vérifie les dates avec les parents.`);
    } else if (d > preavisFin) {
      refusFin.push(`Préavis non exécuté : le dernier jour travaillé (${shortDate(d)}) est après la fin du préavis calculée par l’app (${shortDate(preavisFin)}). Cas non géré : vérifie les dates avec les parents.`);
    } else if (inexecution.demandeur === 'am_acceptee') {
      dernierJour = d;
      finAuDernierJourTravaille = true;
      alertes.push(`Préavis non fait en entier, à ta demande, accepté par les parents : le contrat finit le ${shortDate(d)}, ton dernier jour travaillé (convention, articles 64 et 64.2). La partie du préavis non faite n’est pas payée. Garde l’accord des parents par écrit.`);
    } else if (inexecution.demandeur === 'employeur') {
      refusFin.push(`Préavis non fait à la demande des parents : le contrat finit à la date prévue de fin du préavis (${shortDate(preavisFin)}) et les parents te versent une indemnité compensatrice de préavis égale au salaire brut jusqu’à cette date ; la période compte pour tes congés et ton ancienneté (convention, articles 64, 64.2 et 66). L’app ne calcule pas ce cas : aucun texte ne dit comment cette indemnité entre dans l’indemnité de rupture, la régularisation et le dixième des congés. Fais le calcul avec les parents.`);
    } else {
      dernierJour = d;
      refusFin.push(`Préavis non fait sans l’accord des parents : le contrat finit le ${shortDate(d)}, ton dernier jour travaillé (convention, article 64). Les parents peuvent te demander une indemnité égale au salaire net de la partie du préavis non faite (article 64.2) et des dommages et intérêts (code de l’action sociale et des familles, article L423-26). L’app ne calcule pas ce cas. Renseigne-toi avant de partir (relais petite enfance, DREETS).`);
    }
  }
  // T-045 (B-2) : une date de fin du contrat déjà saisie avant la fin calculée n'est jamais dépassée en silence.
  // T-045b (C3-1) : une date saisie après la fin calculée non plus. Admises : la fin calculée et les autres fins possibles du
  // préavis fait en entier (lendemain, préavis d'un mois de la démission de 3 mois à 1 an), dont les montants sont déjà
  // donnés « à confirmer » ; avec un préavis non fait à la demande de l'AM, seul le dernier jour travaillé.
  const finAdmise = (e: ISODate) => e === dernierJour || (!finAuDernierJourTravaille && finsAdmises(c.start, { motif, notif, presentation }).admises.includes(e));
  if (!refusFin.length && c.end && c.end > dernierJour && !finAdmise(c.end)) {
    refusFin.push(`La date de fin du contrat (${shortDate(c.end)}) est après ${finAuDernierJourTravaille ? 'le dernier jour travaillé indiqué' : 'la fin du préavis'} (${shortDate(dernierJour)}). L’app ne calcule pas au-delà, ni en deçà : corrige la date de fin du contrat, ou vérifie les dates de la lettre et du préavis.`);
  }
  if (!refusFin.length && c.end && c.end < dernierJour) {
    refusFin.push(`La date de fin du contrat (${shortDate(c.end)}) est avant ${finAuDernierJourTravaille ? 'le dernier jour travaillé indiqué' : 'la fin du préavis'} (${shortDate(dernierJour)}). Si le préavis n’a pas été fait en entier, dis-le dans la question sur le préavis ; sinon corrige la date de fin du contrat. L’app ne calcule rien tant que les deux dates ne concordent pas.`);
  }
  // T-045b : contextes dont la date de fin vient de ce calcul, contrôlée ci-dessus (finControlee).
  const endCtx: Ctx = { ...ctx, c: { ...c, end: dernierJour }, cache: new Map(), finControlee: true };

  // Salaires bruts depuis le début du contrat
  let totalBrut = 0;
  let cpManquants = false;
  let evenementManquant = false;
  const naturesManquantes = new Set<'evenement' | 'cp' | 'maladie'>();
  const manquants: Month[] = [];
  const brutsEstimes: Month[] = [];
  // C-008 : le total saisi depuis les bulletins Pajemploi remplace les mois qu'il couvre ; les mois suivants
  // (préavis, mois sans bulletin encore) restent comptés, estimés si besoin (relecture contradictoire du 04/11/2026).
  const saisi = bruts.total != null && bruts.total > 0;
  const couvert = (m: Month) => saisi && (!bruts.jusqua || m <= bruts.jusqua);
  if (saisi) totalBrut = bruts.total!;
  for (const m of monthsBetween(monthOf(c.start), monthOf(dernierJour))) {
    if (couvert(m)) continue;
    const b = monthBase(endCtx, m);
    if (!b.active) continue;
    if (b.missing) { manquants.push(m); continue; }
    // Brut d'un bulletin contrôlé : congés compris, rien à ajouter.
    const lu = bruts.parMois?.[m];
    if (lu != null && lu > 0) { totalBrut += lu; continue; }
    if (!b.brut) brutsEstimes.push(m);
    totalBrut += monthBrut(endCtx, m);
    const cp = cpForMonth(endCtx, m, enfants);
    totalBrut += netToBrut(cp.indemnite + cp.complement, lastDay(m));
    if (cp.aConfirmer) cpManquants = true;
    // T-025 C-5 : salaire d'un événement familial à confirmer, absent de ce total (CCN 48.1.3.1.1 : pas de réduction de la rémunération).
    if (b.evenementAConfirmer) evenementManquant = true;
    if (b.evenementAConfirmer) for (const n of naturesAConfirmer(b)) naturesManquantes.add(n);
  }
  if (manquants.length) {
    alertes.push(`Historique incomplet : ${manquants.length} mois sans bulletin. Ajoute les bulletins manquants dans l’historique pour un calcul juste.`);
  }

  // Avenant n° 10 (inaptitude) en vigueur le 1er mai 2026 : avant, ses règles ne s'appliquaient pas.
  if ((motif === 'inaptitude' || motif === 'inaptitude_pro') && notif < AVENANT_10) {
    alertes.push('Inaptitude notifiée avant le 1er mai 2026 : les règles de l’avenant n° 10 appliquées ici n’étaient pas encore en vigueur. Fais vérifier le calcul (relais petite enfance, DREETS).');
  }

  // Régularisation : heures réellement dues (planning, hors absences retenues) contre heures payées,
  // depuis l'embauche, le début du suivi ou le dernier passage d'une année à l'autre (C-001 : les autres avenants ne coupent pas).
  const finTerms = termsAt(c, dernierJour);
  const regStart = regulStart(c, addDays(dernierJour, 1));
  // T-038 : chaque date de fin possible (fin calculée ; fin un jour plus tard si la date est à confirmer, AC-2 ; fin au bout
  // d'un mois pour la démission de 3 mois à 1 an, AC-1, CASF L423-26 contre CCN art. 120) donne sa régularisation et ses
  // congés non pris. Un montant qui change d'une variante à l'autre, ou selon les jours « à confirmer » (B-1), n'est ni donné
  // ni compté : il est « à confirmer » avec ses valeurs.
  const variantes: { fin: ISODate; libelle: string }[] = [{ fin: dernierJour, libelle: `fin le ${shortDate(dernierJour)}` }];
  // T-045 : fin au dernier jour travaillé, avant la fin du préavis : la date de fin ne dépend plus du préavis.
  if (preavisFinAConfirmer && !finAuDernierJourTravaille) variantes.push({ fin: addDays(dernierJour, 1), libelle: `fin le ${shortDate(addDays(dernierJour, 1))}` });
  if (demission312 && !finAuDernierJourTravaille) {
    const finMois = finPreavis(depart, {});
    variantes.push({ fin: finMois, libelle: `préavis d’un mois, fin le ${shortDate(finMois)}` });
    variantes.push({ fin: addDays(finMois, 1), libelle: `préavis d’un mois, fin le ${shortDate(addDays(finMois, 1))}` });
  }
  const ctxFin = (fin: ISODate): Ctx => (fin === dernierJour ? endCtx : { ...ctx, c: { ...c, end: fin }, cache: new Map(), finControlee: true });
  const regPour = (fin: ISODate) => regularisationLectures(ctxFin(fin), regulStart(c, addDays(fin, 1)), fin);
  const reg = regPour(dernierJour);
  const regulMinutes = reg.dus.minutes;
  // C-002 : sans toutes les semaines sans accueil, les semaines non saisies compteraient comme accueillies.
  let manque = finTerms.yearType === 'incomplete' ? semainesSansAccueilManquantes(c, regStart, dernierJour) : 0;
  // Dernière année de contrat non terminée : aucune semaine sans accueil saisie alors qu'il en faut = blocage
  // (seconde relecture, point 5b : sinon les vacances déjà passées compteraient comme accueillies).
  if (finTerms.yearType === 'incomplete') {
    let debut = c.start;
    while (addMonthsToDate(debut, 12) <= dernierJour) debut = addMonthsToDate(debut, 12);
    const { attendu, saisies } = semainesSansAccueilAnnee(c, debut);
    if (debut >= regStart && attendu > 0 && saisies === 0) manque += attendu;
  }
  if (manque > 0) {
    alertes.push(`Régularisation non calculée : il manque ${manque} semaine${manque > 1 ? 's' : ''} sans accueil dans le contrat. Saisis-les d’abord, sinon les vacances compteraient comme des semaines accueillies. L’indemnité de congés non pris en dépend : elle est à confirmer. L’indemnité de rupture aussi, sauf si le total de tes bulletins couvre le dernier mois.`);
  } else if (finTerms.yearType === 'incomplete') {
    alertes.push('Vérifie que toutes les semaines sans accueil de la dernière année sont saisies : une semaine non saisie compte comme accueillie dans la régularisation.');
  }
  let regularisation_ = finTerms.yearType === 'incomplete' && manque === 0 ? reg.dus.montant : 0;
  let regularisationAConfirmer: string | undefined;
  if (finTerms.yearType === 'incomplete' && manque === 0) {
    const lectures = variantes.map((v) => ({ ...v, r: v.fin === dernierJour ? reg : regPour(v.fin) }));
    const valeurs = new Set(lectures.flatMap((l) => [l.r.dus.montant, l.r.retenus.montant]));
    if (valeurs.size > 1) {
      const montant = (l: (typeof lectures)[number]) => (l.r.sure ? euros(l.r.dus.montant) : libelleRegulJoursAConfirmer(l.r.dus.montant, l.r.retenus.montant));
      const causes = [
        lectures.some((l) => l.r.dus.montant !== lectures[0].r.dus.montant || l.r.retenus.montant !== lectures[0].r.retenus.montant)
          ? (demission312 ? 'de la durée du préavis et de sa date de fin, à confirmer' : 'de la date de fin du préavis, elle-même à confirmer') : '',
        lectures.some((l) => !l.r.sure) ? 'de jours de salaire encore à confirmer (voir les mois concernés)' : '',
      ].filter(Boolean).join(' et ');
      const detail = new Set(lectures.map(montant)).size === 1 ? `${montant(lectures[0]).replace(/^./, (x) => x.toUpperCase())}.` : `${lectures.map((l) => `${l.libelle.replace(/^./, (x) => x.toUpperCase())} : ${montant(l)}`).join(' ; ')}.`;
      regularisationAConfirmer = `Régularisation à confirmer : elle dépend ${causes}. ${detail} Elle n'est pas comptée dans le total.`;
      regularisation_ = 0;
    }
  }
  if (finTerms.yearType === 'complete' && regulMinutes > 60) {
    alertes.push('Année complète : la régularisation ne s’applique pas en principe, vérifie le planning du contrat.');
  }

  // Congés non pris. T-050b (A-50) : la régularisation due entre dans la base du dixième de la période en cours. Chaque date
  // de fin possible (variantes) et, si la régularisation est « à confirmer », chacune de ses valeurs possibles donne son
  // indemnité ; si elle change, l'indemnité est « à confirmer » avec ses valeurs.
  const regulCalculee = finTerms.yearType === 'incomplete' && manque === 0;
  const regulsPour = (fin: ISODate): number[] => {
    if (!regulCalculee) return [0];
    const r = fin === dernierJour ? reg : regPour(fin);
    return [...new Set([r.dus.montant, r.retenus.montant])];
  };
  const regulFin = regulCalculee ? reg.dus.montant : 0;
  const cpPour = (fin: ISODate, r: number) => congesNonPris(ctxFin(fin), c, fin, enfants, r);
  const cp = cpPour(dernierJour, regulFin);
  let { cpIndemnite, cpExplication, cpAConfirmer } = cp;
  const cpJoursRestants = cp.jours;
  const cpDixiemeEnCours = cp.dixiemeEnCours;
  const candidatsCp = variantes.flatMap((v) => regulsPour(v.fin).map((r) => ({
    fin: v.fin, r,
    libelle: regularisationAConfirmer ? `${v.libelle}, régularisation de ${euros(r)}` : v.libelle,
    x: v.fin === dernierJour && r === regulFin ? cp : cpPour(v.fin, r),
  })));
  if (!cpAConfirmer && candidatsCp.length > 1) {
    // T-038 (AC-1, AC-2) : l'indemnité de congés non pris dépend aussi de la date de fin (acquisition, base du dixième).
    if (candidatsCp.some((v) => v.x.cpAConfirmer || v.x.cpIndemnite !== cp.cpIndemnite)) {
      // La date de fin change-t-elle le montant à régularisation égale ? Sinon, seule la régularisation le change.
      const parFin = variantes.some((v) => v.fin !== dernierJour && ((x) => !!x.cpAConfirmer || x.cpIndemnite !== cp.cpIndemnite)(candidatsCp.find((k) => k.fin === v.fin && k.r === regulFin)?.x ?? cpPour(v.fin, regulFin)));
      const causes = [
        parFin ? (demission312 ? 'de la durée du préavis et de sa date de fin' : 'de la date de fin du préavis') : '',
        regularisationAConfirmer ? 'de la régularisation de fin de contrat, qui entre dans la base du dixième (convention, articles 48.1.1.5 et 124)' : '',
      ].filter(Boolean).join(' et ');
      cpAConfirmer = `Indemnité de congés non pris à confirmer : elle dépend ${causes}, à confirmer. `
        + `${candidatsCp.map((v) => `${v.libelle.replace(/^./, (x) => x.toUpperCase())} : ${v.x.cpAConfirmer ? 'nombre de jours à confirmer' : euros(v.x.cpIndemnite)}`).join(' ; ')}. Elle n'est pas comptée dans le total.`;
      cpIndemnite = 0;
      cpExplication = parFin
        ? (regularisationAConfirmer ? 'À confirmer : le montant dépend de la date de fin du contrat et de la régularisation. L’app ne donne pas de montant.' : 'À confirmer : le montant dépend de la date de fin du contrat. L’app ne donne pas de montant.')
        : 'À confirmer : le montant dépend de la régularisation, elle-même à confirmer. L’app ne donne pas de montant.';
    }
  }

  // T-050d (C-1) : régularisation non calculée (semaines sans accueil manquantes, C-002) en année incomplète. Elle entre dans
  // la base du dixième (A-50) : l'indemnité de congés non pris ne peut pas être donnée. Elle est « à confirmer », avec la raison.
  const regulNonCalculee = finTerms.yearType === 'incomplete' && manque > 0;
  if (regulNonCalculee) {
    const raison = `Indemnité de congés non pris à confirmer : la régularisation de fin de contrat n’est pas calculée (il manque ${manque} semaine${manque > 1 ? 's' : ''} sans accueil), or elle entre dans la base du dixième (convention, articles 48.1.1.5 et 124). Elle n'est pas comptée dans le total.`;
    cpAConfirmer = cpAConfirmer ? `${cpAConfirmer} ${raison}` : raison;
    cpIndemnite = 0;
    cpExplication = 'À confirmer : le montant dépend de la régularisation, qui n’est pas calculée. L’app ne donne pas de montant.';
  }

  // T-050b (A-45, regles/t050-trois-regles.md, point 2) : assiette de l'indemnité de rupture. CCN art. 121.1 : 1/80 « du
  // total des salaires bruts perçus pendant la durée du contrat », « hors indemnités non soumises à contributions et
  // cotisations sociales » (seule exclusion écrite). L'ICCP des deux périodes (art. 123.1, 123.2 et 48.1.1.5 : « revêt le
  // caractère de salaire », soumise à cotisations) et la régularisation de fin de contrat (art. 124 : « régularisation
  // définitive du salaire », à la date de fin, soumise à cotisations) en font partie. Fiches DDETS 31 de 2023 : 11 662,78 €
  // (Durand) et 9 148,57 € (Bertrand) ; fiche « Régularisation » du 05/11/2024, p. 4 ; guide DREETS BFC d'août 2026, fiche
  // 11-I. Elles sont payées sur le dernier bulletin : déjà comprises si ce bulletin est couvert par le total saisi ou lu
  // (C-008, garde contre le double compte). Une part « à confirmer » n'est pas ajoutée et rend l'indemnité « à confirmer ».
  // Hors périmètre (point à rouvrir par la direction) : l'indemnité compensatrice de préavis n'est pas ajoutée.
  const finCouverte = (m: Month) => couvert(m) || (bruts.parMois?.[m] != null && bruts.parMois[m]! > 0);
  const dernierMois = monthOf(dernierJour);
  const assietteFinNet = cpIndemnite + regularisation_;
  const ajoutFin = (fin: ISODate) => (finCouverte(monthOf(fin)) ? 0 : netToBrut(assietteFinNet, lastDay(monthOf(fin))));
  totalBrut += ajoutFin(dernierJour);
  const iccpManquante = !finCouverte(dernierMois) && !!cpAConfirmer;
  const regulManquante = !finCouverte(dernierMois) && (!!regularisationAConfirmer || regulNonCalculee);

  // Indemnité de rupture. Ancienneté appréciée à la date d'envoi de la lettre (ou au décès), comme pour le préavis.
  let indemniteRupture = 0;
  let ruptureExplication = '';
  if (motif === 'deces') {
    // T-034 (A-47) : due quelle que soit l'ancienneté. CCN art. 119.4.2 : « une indemnité dont le montant est calculé de
    // la même manière que l'indemnité de rupture en cas de retrait d'enfant prévue à l'article 121-1 » (renvoi au seul
    // calcul du montant, aucune condition d'ancienneté) ; service-public.fr F16842 (vérifiée le 13/06/2025) : « En cas de
    // décès de l'enfant du particulier employeur, cette condition d'ancienneté est supprimée et l'indemnité est due ».
    indemniteRupture = Math.round(totalBrut / 80);
    ruptureExplication = 'Décès de l’enfant : 1/80e des salaires bruts perçus depuis le début du contrat, due quelle que soit l’ancienneté (article 119.4.2 de la convention).';
  } else if (motif === 'inaptitude_pro') {
    // Avenant n° 10 du 9 septembre 2025 (étendu, JO du 4 avril 2026, en vigueur le 1er mai 2026), art. 119-5 :
    // indemnité spécifique de 2/80e, « selon les conditions d'ancienneté définies à l'article 121-1 » (9 mois).
    if (anc >= 9) {
      indemniteRupture = Math.round((totalBrut * 2) / 80);
      ruptureExplication = 'Inaptitude après un accident du travail ou une maladie professionnelle : indemnité spécifique de 2/80e des salaires bruts (avenant n° 10, 9 mois d’ancienneté atteints).';
    } else {
      ruptureExplication = `Inaptitude d’origine professionnelle : pas d’indemnité, moins de 9 mois d’ancienneté (${anc} mois).`;
    }
  } else if (motif === 'inaptitude') {
    if (anc >= 9) {
      indemniteRupture = Math.round(totalBrut / 80);
      ruptureExplication = 'Inaptitude sans lien avec le travail : 1/80e des salaires bruts (avenant n° 10, 9 mois d’ancienneté atteints).';
    } else {
      ruptureExplication = `Inaptitude : pas d’indemnité, moins de 9 mois d’ancienneté (${anc} mois).`;
    }
  } else if (motif === 'retrait') {
    if (anc >= 9) {
      indemniteRupture = Math.round(totalBrut / 80);
      ruptureExplication = '1/80e des salaires bruts perçus depuis le début du contrat (9 mois d’ancienneté atteints à l’envoi de la lettre).';
    } else {
      ruptureExplication = `Pas d’indemnité : moins de 9 mois d’ancienneté à l’envoi de la lettre (${anc} mois).`;
    }
  } else if (motif === 'demission') {
    ruptureExplication = 'Pas d’indemnité de rupture en cas de démission.';
  } else if (motif === 'faute_grave') {
    ruptureExplication = 'Pas d’indemnité de rupture en cas de faute grave (à contester si elle est injustifiée).';
  } else {
    ruptureExplication = 'Pas d’indemnité pendant la période d’essai.';
  }

  let ruptureAConfirmer = (cpManquants || evenementManquant || iccpManquante || regulManquante) && indemniteRupture > 0;
  if (ruptureAConfirmer) {
    const natures = (['evenement', 'cp', 'maladie'] as const).filter((n) => naturesManquantes.has(n))
      .map((n) => ({ evenement: 'd’événement familial', cp: 'de congés pris au-delà des droits', maladie: 'd’enfant malade' })[n]);
    const evenement = evenementManquant ? `le salaire ${natures.length > 1 ? `${natures.slice(0, -1).join(', ')} ou ${natures.at(-1)}` : natures[0] ?? 'd’événement familial'}` : '';
    // T-050b : l'indemnité de congés non pris et la régularisation de la fin entrent dans l'assiette (A-45).
    // T-050d (C-1) : une régularisation non calculée (semaines sans accueil manquantes) est dite telle quelle.
    const regulAC = regulManquante && !regulNonCalculee;
    const manque = [cpManquants ? 'les congés payés' : '', evenement, iccpManquante ? 'l’indemnité de congés non pris' : '', regulAC ? 'la régularisation de fin de contrat' : ''].filter(Boolean).join(' ni ');
    const nonCalculee = regulManquante && regulNonCalculee ? 'la régularisation de fin de contrat, qui n’est pas calculée : il manque des semaines sans accueil' : '';
    alertes.push(`Indemnité de rupture à confirmer : elle ne compte pas encore ${[manque ? `${manque} à confirmer` : '', nonCalculee].filter(Boolean).join(', ni ')}.`);
  }

  // T-038 suite (point 3 remonté au DG) : l'indemnité de rupture (1/80 ou 2/80 des salaires bruts jusqu'à la fin) change si la
  // fin du préavis, à confirmer, bouge d'un jour. Même mécanisme qu'AC-2 : si elle change, « à confirmer » avec les valeurs.
  let ruptureVariantes: string | undefined;
  if (indemniteRupture > 0 && !ruptureAConfirmer && variantes.length > 1) {
    const facteur = motif === 'inaptitude_pro' ? 2 : 1;
    // T-050 : écart de bruts entre la variante et la fin calculée, ajouté au total retenu (qui peut venir des bulletins saisis, C-008).
    // T-050b : même assiette pour chaque variante (ICCP et régularisation de la fin).
    // T-050d (B-1) : ces sommes sont dans le total retenu une seule fois : ajoutées au dernier mois (ajoutFin), ou déjà dans
    // les bulletins saisis ou lus quand ils couvrent ce mois. Dans une variante, elles quittent le dernier mois pour le mois de
    // la variante : seul l'écart de conversion en brut entre les deux mois s'ajoute, jamais une seconde fois la somme.
    const brutFin = brutJusqua(endCtx, c, dernierJour, enfants);
    const conversionFin = (fin: ISODate) => netToBrut(assietteFinNet, lastDay(monthOf(fin)));
    const autres = variantes.map((v) => ({ ...v, montant: v.fin === dernierJour ? indemniteRupture : Math.round(((totalBrut + brutJusqua(ctxFin(v.fin), c, v.fin, enfants) - brutFin + conversionFin(v.fin) - conversionFin(dernierJour)) * facteur) / 80) }));
    if (autres.some((v) => v.montant !== indemniteRupture)) {
      ruptureVariantes = `Indemnité de rupture à confirmer : elle dépend de la date de fin du préavis, à confirmer. ${autres.map((v) => `${v.libelle.replace(/^./, (x) => x.toUpperCase())} : ${euros(v.montant)}`).join(' ; ')}. Elle n'est pas comptée dans le total.`;
      ruptureAConfirmer = true;
    }
  }

  // T-031 : un cas non géré pendant le contrat (Alsace-Moselle, horaires variables, accueil occasionnel, congé maternité,
  // accident du travail…) fausse les salaires de référence, l'ancienneté retenue ou les congés : aucun montant.
  const nonGere = [...refusFin, ...nonGeresPeriode(c, ctx.leaves, c.start, dernierJour, 'non')];
  // T-076, D2 : planning variable en L2, absence retenue dans une semaine au-delà de la base (mois non calculé, donc fin non plus).
  const absL2 = absencesL2NonGerees(endCtx, c.trackedFrom > c.start ? c.trackedFrom : c.start, dernierJour);
  if (absL2.length) nonGere.push(messageAbsenceL2(absL2));
  if (nonGere.length) {
    return {
      ancienneteMois: anc, preavisLabel, preavisFin, preavisFinAConfirmer, dernierJour, indemniteRupture: 0, ruptureExplication: 'Non calculée : cas non géré.',
      totalBrut: 0, indemnitePreavis: 0, regularisation: 0, regulMinutes: 0, cpJoursRestants: 0, cpIndemnite: 0, cpDixiemeEnCours: 0,
      cpExplication: 'Non calculés : cas non géré.', manquants, brutsEstimes, alertes, nonGere,
    };
  }
  return {
    ancienneteMois: anc, preavisLabel, preavisFin, preavisFinAConfirmer, dernierJour, indemniteRupture, ruptureExplication, ruptureAConfirmer, ruptureVariantes, totalBrut, brutsEstimes,
    indemnitePreavis, indemnitePreavisExplication, indemnitePreavisAConfirmer,
    regularisation: regularisation_, regulMinutes, cpJoursRestants, cpIndemnite, cpDixiemeEnCours, cpExplication, cpAConfirmer, regularisationAConfirmer, manquants, alertes,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// T-076 : fin d'un CDD (regles/t076-cdd.md ; regles/t076-decisions-direction.md, section 2).
// ---------------------------------------------------------------------------------------------------------------------

/** Libellés de l'écran Fin, question « Comment finit le CDD ? » (regles/t076-cdd.md, partie 5.1, point 8) */
export const FIN_CDD_LABEL: Record<FinCdd | FinCddNonGere, { l: string; sub?: string }> = {
  terme: { l: 'Le CDD arrive à sa date de fin', sub: 'Y compris après un renouvellement ou un report de la date' },
  suite_cdi: { l: 'Je continue en CDI avec ce parent' },
  refus_cdi: { l: 'Le parent m’a proposé un CDI et j’ai refusé', sub: 'Pour le même accueil, au même salaire ou plus' },
  commun_accord: { l: 'Fin avant la date, d’un commun accord' },
  initiative_am: { l: 'Fin avant la date, à ma demande', sub: 'Par exemple pour un CDI ailleurs' },
  employeur: { l: 'Fin avant la date, voulue par le parent, sans faute grave' },
  faute_grave: { l: 'Fin pour faute grave' },
  essai: { l: 'Fin pendant la période d’essai' },
  force_majeure: { l: 'Force majeure', sub: 'Non géré par l’app' },
  inaptitude: { l: 'Inaptitude constatée par le médecin du travail', sub: 'Non géré par l’app' },
  jeune_vacances: { l: 'CDD d’un jeune pendant ses vacances scolaires ou universitaires', sub: 'Non géré par l’app' },
  saisonnier_usage: { l: 'CDD saisonnier ou d’usage', sub: 'Non géré par l’app' },
  autre: { l: 'Autre cas', sub: 'Agrément suspendu ou retiré, décès de l’enfant… : non géré par l’app' },
};

/** R-CDD-08 : l'IFC est-elle due ? (table de décision du rapport, une ligne par fin) */
const IFC_DUE: Record<FinCdd, boolean> = {
  terme: true, suite_cdi: false, refus_cdi: false, initiative_am: false, faute_grave: false, essai: false, commun_accord: true, employeur: true,
};

/** Raison affichée quand l'IFC n'est pas due (R-CDD-08, textes cités) */
const IFC_NON_DUE: Record<Exclude<FinCdd, 'terme' | 'commun_accord' | 'employeur'>, string> = {
  suite_cdi: 'Pas d’indemnité de fin de contrat : ton CDD continue en CDI (code du travail, articles L1243-8 et L1243-11).',
  refus_cdi: 'Pas d’indemnité de fin de contrat : tu as refusé un CDI pour le même accueil, à salaire au moins égal (code du travail, article L1243-10, 3°).',
  initiative_am: 'Pas d’indemnité de fin de contrat : le CDD s’arrête avant la date à ta demande (code du travail, article L1243-10, 4°).',
  faute_grave: 'Pas d’indemnité de fin de contrat en cas de faute grave (code du travail, article L1243-10, 4°). À contester si elle est injustifiée.',
  essai: 'Pas d’indemnité de fin de contrat pendant la période d’essai (code du travail, article L1242-11, 4°).',
};

/** Fins de CDD non gérées (R-CDD-08, partie 6 du rapport) : message précis, aucun montant */
export const MESSAGES_FIN_CDD_NON_GEREE: Record<FinCddNonGere, string> = {
  force_majeure: 'Fin du CDD pour force majeure : non géré. L’app ne calcule pas ce cas (indemnité de fin de contrat non due, indemnité possible en cas de sinistre : code du travail, articles L1243-10 et L1243-4). Fais ta fin de contrat sans l’app.',
  inaptitude: 'Fin du CDD pour inaptitude : non géré. La convention ne règle l’inaptitude que pour le CDI, et l’app ne calcule pas ce cas. Fais ta fin de contrat sans l’app.',
  jeune_vacances: 'CDD d’un jeune pendant ses vacances scolaires ou universitaires : non géré. L’indemnité de fin de contrat n’est pas due (code du travail, article L1243-10, 2°), mais l’app ne calcule pas ce cas. Fais ta fin de contrat sans l’app.',
  saisonnier_usage: 'CDD saisonnier ou d’usage : non géré. Ce n’est pas un cas prévu pour une assistante maternelle employée par un particulier, et l’app ne le calcule pas. Fais ta fin de contrat sans l’app.',
  autre: 'L’app ne calcule pas ce cas (agrément suspendu ou retiré, décès de l’enfant ou autre). Fais ta fin de contrat sans l’app.',
};

export const MESSAGE_CDD_PAS_DE_PREAVIS = 'À la fin d’un CDD, il n’y a ni préavis ni indemnité de rupture.';
export const MESSAGE_CDD_DOCUMENTS = 'Ton employeur te remet le certificat de travail, l’attestation France Travail et le reçu pour solde de tout compte.';
export const MESSAGE_CDD_IFC = 'Tu touches une indemnité de fin de contrat : 10 % de tous tes salaires bruts du CDD. Les indemnités d’entretien, de repas et de kilomètres ne comptent pas.';
export const MESSAGE_CDD_ICCP = 'Tes congés non payés te sont payés à la fin. Cette indemnité compte aussi l’indemnité de fin de contrat.';
export const MESSAGE_CDD_DOMMAGES = 'Le parent a mis fin au CDD avant la date, sans faute grave : il peut te devoir aussi des dommages et intérêts, au moins les salaires jusqu’à la date prévue (code du travail, article L1243-4). L’app ne les calcule pas : vois-les avec un conseil (relais petite enfance, DREETS, avocat).';
const MESSAGE_P3 = 'La convention (article 48.1.1.5) retient le plus favorable entre le maintien de salaire et le dixième. Pour un CDD, la DREETS Occitanie et le modèle de contrat Pajemploi ne retiennent que le dixième.';
const MESSAGE_P4 = 'L’Urssaf, la DREETS et une réponse ministérielle calculent l’indemnité de fin de contrat sans l’indemnité de congés non pris, mais aucun texte ne le dit. Avec elle, l’indemnité de fin de contrat compte 10 % de l’indemnité de congés en plus.';

/** Montant possible d'un élément de la fin : de `lo` (part sûre) à `hi` ; `inconnu` : aucun montant ne peut être donné */
interface Plage { lo: number; hi: number; inconnu?: string; raisons: string[] }

interface CoeurCdd {
  /** Assiette nette de l'IFC : salaires nets du CDD, congés versés et régularisation (part basse) compris */
  netCdd: number;
  /** Salaires nets des mois du CDD, congés versés compris, sans régularisation */
  salairesNet: number;
  manquants: Month[];
  incomplets: string[];
  regul: Plage;
  regulMinutes: number;
  ifc: Plage;
  iccp: Plage;
  cpJours: number;
  cpDixiemeEnCours: number;
  cpExplication: string;
  alertes: string[];
}

/** Calcul d'une fin de CDD dans une lecture du salaire (R-CDD-09, étapes 1 à 5). `endCtx` : contrat qui finit le `dernierJour`. */
function coeurCdd(endCtx: Ctx, dernierJour: ISODate, finCdd: FinCdd, enfants: number): CoeurCdd {
  const c = endCtx.c;
  const alertes: string[] = [];
  const dernierMois = monthOf(dernierJour);
  // Étapes 1 et 3 : salaires du CDD (dernier mois compris, art. 111 pour les jours après la fin : monthBase).
  // R-CDD-07 : assiette = salaires mensualisés après déductions, HC, HM, majorations de fériés, congés payés versés,
  // régularisation ; sans entretien, repas ni kilomètres (CCN 114.1, 114.2, 57), sans ICCP (P4) ni IFC.
  // Direction T-076 (22/11/2026) : l'IFC est calculée sur le net, montant déclaré et payé (Urssaf : « La déclaration et le
  // paiement doivent être réalisés sur la base du net ») ; le brut n'est qu'un affichage, dérivé du net (netToBrut).
  let netCdd = 0, cpPayeNet = 0, extraHi = 0;
  let congesAC = false;
  const manquants: Month[] = [];
  const incomplets = new Set<string>();
  for (const m of monthsBetween(monthOf(c.start), dernierMois)) {
    const b = monthBase(endCtx, m);
    if (!b.active) continue;
    if (b.missing) { manquants.push(m); continue; }
    const cp = cpForMonth(endCtx, m, enfants);
    netCdd += b.net + cp.indemnite + cp.complement;
    cpPayeNet += cp.indemnite + cp.complement;
    // m4 : parts « à confirmer » du planning variable (HC, maintien des congés) : dans la borne haute de l'IFC seulement.
    extraHi += (b.complAConfirmerAmount ?? 0) + (cp.maintienAConfirmer ?? 0);
    // D10 : des congés « à confirmer » (non versés) ne bloquent plus l'IFC : la part sûre les laisse de côté ; ils sont payés
    // à la fin dans l'ICCP (période précédente) et la lecture haute de P4 les compte.
    if (cp.aConfirmer) congesAC = true;
    if (b.evenementAConfirmer) incomplets.add(`le salaire ${libelleNatures(naturesAConfirmer(b))} à confirmer`);
  }
  if (manquants.length) alertes.push(`Historique incomplet : ${manquants.length} mois sans bulletin. Ajoute les bulletins manquants dans l’historique pour un calcul juste.`);

  // Étape 2 : régularisation (R-CDD-09, R-FIN-11). 52 semaines : aucune (R-CDD-11). 46 semaines ou moins : art. 109.2 et 124.
  const regul: Plage = { lo: 0, hi: 0, raisons: [] };
  let regulMinutes = 0;
  if (termsAt(c, dernierJour).yearType === 'incomplete') {
    const regStart = regulStart(c, addDays(dernierJour, 1));
    let manque = semainesSansAccueilManquantes(c, regStart, dernierJour);
    let debut = c.start;
    while (addMonthsToDate(debut, 12) <= dernierJour) debut = addMonthsToDate(debut, 12);
    const { attendu, saisies } = semainesSansAccueilAnnee(c, debut);
    if (debut >= regStart && attendu > 0 && saisies === 0) manque += attendu;
    if (manque > 0) {
      regul.inconnu = `Régularisation non calculée : il manque ${manque} semaine${manque > 1 ? 's' : ''} sans accueil dans le contrat. Saisis-les d’abord.`;
    } else {
      const reg = regularisationLectures(endCtx, regStart, dernierJour);
      regulMinutes = reg.dus.minutes;
      regul.lo = Math.min(reg.dus.montant, reg.retenus.montant);
      regul.hi = Math.max(reg.dus.montant, reg.retenus.montant);
      if (!reg.sure) regul.raisons.push(`Elle dépend de jours de salaire encore à confirmer (voir les mois concernés) : ${libelleRegulJoursAConfirmer(reg.dus.montant, reg.retenus.montant)}.`);
    }
  }
  if (regul.inconnu) incomplets.add('la régularisation, qui n’est pas calculée');
  const salairesNet = netCdd;
  netCdd += regul.lo;
  const netHi = netCdd - regul.lo + regul.hi + extraHi;

  // Étape 4 : IFC nette = arrondi(10 % × assiette nette) (R-CDD-07, direction T-076), si elle est due (R-CDD-08).
  // P4 (lecture 1, retenue) : sans l'ICCP.
  const due = IFC_DUE[finCdd];
  const ifc: Plage = { lo: due ? Math.round(netCdd / 10) : 0, hi: due ? Math.round(netHi / 10) : 0, raisons: [] };
  if (due && regul.hi > regul.lo) ifc.raisons.push('Elle compte la régularisation, elle-même en partie à confirmer.');
  if (due && congesAC) ifc.raisons.push('Des congés payés sont à confirmer : ils ne sont pas dans la part sûre.');
  if (due && extraHi) ifc.raisons.push('Des heures complémentaires ou des congés du planning variable sont à confirmer : ils ne sont pas dans la part sûre.');
  const ifcNet = (x: number) => x;

  // Étape 5 : ICCP (R-CDD-10), IFC dans la base du dixième de la dernière période, plancher L1242-16.
  const iccp: Plage = { lo: 0, hi: 0, raisons: [] };
  let cpJours = 0, cpDixiemeEnCours = 0;
  let cpExplication = `${MESSAGE_CDD_ICCP} L’app retient le dixième ; le maintien de salaire, s’il est plus haut, est à confirmer.`;
  if (finCdd === 'suite_cdi') {
    // L1242-16, al. 3 : « sauf si le contrat à durée déterminée se poursuit par un contrat de travail à durée indéterminée ».
    cpExplication = 'Pas d’indemnité de congés non pris : ton CDD continue en CDI, tes congés restent acquis (code du travail, article L1242-16).';
  } else {
    // R-CDD-10 et P3. Part sûre = dixième de la dernière période, régularisation et IFC comprises (CCN 48.1.1.5 et 124 ;
    // L1243-8). Il ne dépend pas du nombre de jours acquis : un nombre de jours à confirmer (T-030, SUS-11) ne change que le
    // maintien, donc la part à confirmer. À confirmer = max(dixième ; maintien) − dixième.
    const y = cpPeriodStartYear(dernierJour);
    const cpt = compteur(endCtx, dernierJour, enfants);
    const acq = acquisition(endCtx, y, enfants);
    const bd = baseDixieme(endCtx, y, enfants);
    const restantsPrec = Math.max(0, cpt.reste);
    cpJours = acq.joursADate + restantsPrec;
    cpDixiemeEnCours = Math.round((bd.base + regul.lo + ifcNet(ifc.lo)) / 10);
    // Décision D10 (22/11/2026) : CDD à cheval sur le 1er juin, la part sûre de l'ICCP est donnée.
    // Période précédente : toute lecture doit au moins le dixième de cette période (P3, lecture B ; L1242-16), moins ce qui
    // est déjà versé pour elle pendant le CDD (indemnités et compléments depuis le 1er juin ; en année complète, maintien des
    // jours pris, payé dans le salaire). Haut : le plus favorable entre dixième et maintien des jours (lecture la plus haute).
    const juin = `${y}-06` as Month;
    const complete = termsAt(c, dernierJour).yearType === 'complete';
    let precLo = 0, precHi = 0, complHi = 0;
    let precInconnu: string | undefined;
    const yPrec = y - 1;
    if (yPrec >= cpPeriodStartYear(c.trackedFrom) && `${y}-05-31` >= c.start) {
      const indP = indemnite(endCtx, yPrec, enfants);
      if (indP.jours > 0 || indP.aConfirmer) {
        if (indP.manquants.length || (indP.aConfirmer && !indP.aConfirmer.baseSure)) {
          precInconnu = 'Indemnité de congés non pris à confirmer : la base du dixième de la période de congés précédente n’est pas sûre (mois sans bulletin ou sommes à confirmer). L’app ne donne pas de montant.';
        } else {
          const jours = indP.aConfirmer ? (indP.aConfirmer.montants.length ? indP.aConfirmer.montants.map((x) => x.jours) : [indP.jours]) : [indP.jours];
          let paye = 0;
          for (const m of monthsBetween(juin, dernierMois)) { const k = cpForMonth(endCtx, m, enfants); paye += k.indemnite + k.complement; }
          if (complete) paye += maintien(endCtx, cpt.pris, dernierJour);
          const maints = jours.map((j) => maintien(endCtx, j, `${y}-06-01`));
          const haut = Math.max(indP.dixieme, ...maints);
          precLo = Math.max(0, indP.dixieme - paye);
          precHi = Math.max(precLo, haut - paye);
          if (precHi > precLo || precLo > 0) iccp.raisons.push('Il te reste des congés de la période précédente : l’app paie au moins le dixième de cette période, moins ce qui est déjà payé (DREETS, Pajemploi : dixième seul). La convention (article 48.1.1.5) peut donner plus.');
          // Complément ou indemnité de juin « à confirmer », pas versé : il peut entrer dans la base de la période en cours.
          if (dernierMois >= juin && cpForMonth(endCtx, juin, enfants).aConfirmer) complHi = complete ? Math.max(0, indP.dixieme - Math.min(...maints)) : haut;
        }
      }
    }
    const juinAC = dernierMois >= juin && !!cpForMonth(endCtx, juin, enfants).aConfirmer;
    const autresAC = dernierMois >= juin && monthsBetween(juin, dernierMois).some((m) => m !== juin && !!cpForMonth(endCtx, m, enfants).aConfirmer);
    if (precInconnu) {
      iccp.inconnu = precInconnu;
    } else if (cpt.decompteAConfirmer.length) {
      iccp.inconnu = `Indemnité de congés non pris à confirmer : ${cpt.decompteAConfirmer.join(' ')}`;
    } else if ((bd.aConfirmer && (autresAC || !juinAC)) || bd.evenementAConfirmer || bd.manquants.length) {
      iccp.inconnu = 'Indemnité de congés non pris à confirmer : la base du dixième contient des sommes encore à confirmer (congés ou salaire de jours à confirmer) ou des mois sans bulletin. L’app ne donne pas de montant.';
    } else {
      const dixHi = Math.round((bd.base + complHi + regul.hi + ifcNet(ifc.hi)) / 10);
      // Jours acquis : les lectures officielles quand elles sont calculées ; sinon la borne haute interne (acquisition).
      const lecturesJours = (acq.aConfirmer?.lectures ?? []).map((l) => l.joursADate);
      const joursMax = acq.aConfirmer ? (lecturesJours.length ? Math.max(...lecturesJours) : acq.jours) : acq.joursADate;
      const maintienHi = maintien(endCtx, joursMax, dernierJour);
      iccp.lo = cpDixiemeEnCours + precLo;
      iccp.hi = Math.max(dixHi, maintienHi) + precHi;
      if (maintienHi > dixHi) iccp.raisons.push(MESSAGE_P3);
      if (complHi) iccp.raisons.push('Le complément de congés de juin, à confirmer, peut aussi entrer dans sa base.');
      if (maintienHi > dixHi && acq.aConfirmer) iccp.raisons.push('Le nombre de jours de congés acquis n’est pas tranché non plus (les fiches officielles comptent différemment) : le maintien de salaire en dépend.');
      if (regul.hi > regul.lo || ifc.hi > ifc.lo) iccp.raisons.push('Sa base compte la régularisation et l’indemnité de fin de contrat, en partie à confirmer.');
      // Plancher L1242-16 : « ne peut être inférieur au dixième de la rémunération totale brute perçue par le salarié pendant
      // la durée de son contrat ». Rapport (R-CDD-10) : sans congé pris ni payé pendant le CDD, ce dixième vaut
      // 0,10 × (BrutCDD + IFC). Avec des congés pris ou payés, aucun texte ne dit s'ils comptent : l'écart reste à confirmer.
      const cpPris = cpPayeNet > 0 || endCtx.leaves.some((l) => l.type === 'cp' && l.to >= c.start && l.from <= dernierJour);
      const plancherLo = Math.round((netCdd + ifcNet(ifc.lo)) / 10);
      if (!cpPris) {
        if (plancherLo > iccp.lo) iccp.raisons.push('Le code du travail (article L1242-16) fixe un minimum : le dixième de tous les salaires bruts du CDD, indemnité de fin de contrat comprise.');
        iccp.lo = Math.max(iccp.lo, plancherLo);
        iccp.hi = Math.max(iccp.hi, plancherLo);
      } else if (iccp.lo + cpPayeNet < plancherLo) {
        iccp.hi = Math.max(iccp.hi, plancherLo - cpPayeNet);
        iccp.raisons.push('Le code du travail (article L1242-16) fixe un minimum : le dixième de tous les salaires bruts du CDD. Tu as eu des congés pendant le CDD, et aucun texte ne dit s’ils comptent dans ce minimum.');
      }
    }
  }
  // P4 : à confirmer = 10 % × ICCP (lecture 2 : ICCP dans la base de l'IFC).
  if (due) {
    if (iccp.inconnu) ifc.raisons.push('Si l’indemnité de congés non pris entre aussi dans sa base (point non tranché), elle augmente de 10 % de cette indemnité, elle-même à confirmer.');
    else if (iccp.hi > 0) {
      // Lecture 2 de P4 : arrondi(10 % × (assiette nette + ICCP nette)).
      ifc.hi = Math.max(ifc.hi, Math.round((netHi + iccp.hi) / 10));
      ifc.raisons.push(MESSAGE_P4);
    }
  }
  if (due && incomplets.size) ifc.inconnu = `Indemnité de fin de contrat à confirmer : elle ne compte pas encore ${joindreNi([...incomplets])}. L’app ne donne pas de montant.`;
  return { netCdd, salairesNet, manquants, incomplets: [...incomplets], regul, regulMinutes, ifc, iccp, cpJours, cpDixiemeEnCours, cpExplication, alertes };
}

const joindreNi = (l: string[]) => (l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} ni ${l.at(-1)}`);
const libelleNatures = (n: ('evenement' | 'cp' | 'maladie')[]) => n.map((x) => ({ evenement: 'd’événement familial', cp: 'de congés pris au-delà des droits', maladie: 'd’enfant malade' })[x]).join(' ou ');

/**
 * T-076 : fin d'un CDD. `dernierJour` : dernier jour du contrat (date de fin réelle, report de L1243-7 compris).
 * `finCdd` : façon dont le CDD finit (R-CDD-08). Ni préavis ni indemnité de rupture (R-CDD-06). Ordre R-CDD-09.
 * P1 et P2 : les deux lectures du salaire sont calculées ; pour chaque somme, la part sûre (la plus basse) est donnée, l'écart
 * est « à confirmer », hors du total. P3 et P4 : même principe sur l'ICCP et l'IFC.
 * `motifCdi` : motif de CDI reçu pour un CDD (refusé).
 */
export function finDeCdd(ctx: Ctx, dernierJour: ISODate, finCdd: FinCdd | FinCddNonGere | undefined, enfants = 0, motifCdi?: Motif): FinResult {
  const c = ctx.c;
  const anc = fullMonthsBetween(c.start, dernierJour);
  const vide = (nonGere: string[], alertes: string[] = []): FinResult => ({
    ancienneteMois: anc, preavisLabel: 'Pas de préavis : fin de CDD', preavisFin: dernierJour, dernierJour, indemniteRupture: 0,
    ruptureExplication: 'Non calculée : cas non géré.', totalBrut: 0, brutsEstimes: [], indemnitePreavis: 0, regularisation: 0, regulMinutes: 0,
    cpJoursRestants: 0, cpIndemnite: 0, cpDixiemeEnCours: 0, cpExplication: 'Non calculés : cas non géré.', manquants: [], alertes, nonGere,
    cdd: true, finCdd, ifc: 0, ifcNet: 0, ifcExplication: 'Non calculée : cas non géré.', brutCdd: 0, assietteNetteCdd: 0,
  });
  if (!c.cdd) return vide(['Ce contrat est un CDI : la fin « fin de CDD » ne s’applique pas. Choisis qui arrête et pourquoi.']);
  if (motifCdi && motifCdi !== 'fin_cdd') return vide(['Ce contrat est un CDD : les règles de fin d’un CDI (lettre, préavis, indemnité de rupture) ne s’appliquent pas. Dis comment finit le CDD.']);
  if (!finCdd) return vide(['Dis comment finit le CDD : l’indemnité de fin de contrat en dépend.']);
  if ((FINS_CDD_NON_GEREES as string[]).includes(finCdd)) return vide([MESSAGES_FIN_CDD_NON_GEREE[finCdd as FinCddNonGere]]);
  // Revue 2 (r1) : une valeur de fin que l'app ne connaît pas n'est jamais calculée comme une fin ordinaire.
  if (!(FINS_CDD as string[]).includes(finCdd)) return vide([`Fin de CDD inconnue de l’app (« ${finCdd} ») : rien n’est calculé. Choisis comment finit le CDD dans la liste.`]);
  const fin = finCdd as FinCdd;
  if (dernierJour < c.start) return vide([`Le dernier jour (${shortDate(dernierJour)}) est avant le début du contrat (${shortDate(c.start)}). Corrige la date.`]);
  const alertes: string[] = [];
  if (fin === 'terme' && c.cddTerme && dernierJour < c.cddTerme) {
    return vide([`Tu as choisi « le CDD arrive à sa date de fin », mais le dernier jour (${shortDate(dernierJour)}) est avant la ${c.cddTermeImprecis ? 'fin de la durée minimale' : 'date de fin prévue'} (${shortDate(c.cddTerme)}). Choisis comment le CDD s’est arrêté avant la date, ou corrige la date : l’indemnité de fin de contrat en dépend.`]);
  }
  // Décision D9 de la direction (22/11/2026) : cohérence des dates face au terme précis.
  const anticipees: FinCdd[] = ['initiative_am', 'commun_accord', 'employeur', 'faute_grave', 'essai'];
  if (anticipees.includes(fin) && c.cddTerme && !c.cddTermeImprecis && dernierJour >= c.cddTerme) {
    return vide([`Tu as choisi une fin avant la date, mais le dernier jour (${shortDate(dernierJour)}) est ${dernierJour === c.cddTerme ? 'la' : 'après la'} date de fin prévue (${shortDate(c.cddTerme)}). Au terme, choisis « ${FIN_CDD_LABEL.terme.l} » ; sinon corrige la date.`]);
  }
  if (fin !== 'suite_cdi' && c.cddTerme && !c.cddTermeImprecis && dernierJour > c.cddTerme) {
    // C. trav. L1243-11 : « Lorsque la relation contractuelle de travail se poursuit après l'échéance du terme du contrat à
    // durée déterminée, celui-ci devient un contrat à durée indéterminée. » Un report écrit du terme (L1243-7, renouvellement)
    // change la date de fin prévue du contrat.
    return vide([`Le dernier jour (${shortDate(dernierJour)}) est après la date de fin prévue du CDD (${shortDate(c.cddTerme)}). Si la date a été reportée (renouvellement écrit, ou retour de la personne remplacée : code du travail, article L1243-7), mets la nouvelle date de fin prévue dans le contrat. Sinon, si tu as continué à travailler après la date sans nouveau contrat, ton CDD est devenu un CDI (code du travail, article L1243-11) : l’app ne calcule pas ce cas comme une fin de CDD.`]);
  }
  const endCtx: Ctx = { ...ctx, c: { ...c, end: dernierJour }, cache: new Map(), finControlee: true };
  const nonGere = nonGeresPeriode(endCtx.c, ctx.leaves, c.start, dernierJour, 'non');
  const absL2 = absencesL2NonGerees(endCtx, c.trackedFrom > c.start ? c.trackedFrom : c.start, dernierJour);
  if (absL2.length) nonGere.push(messageAbsenceL2(absL2));
  if (nonGere.length) return vide(nonGere);

  const ctx2 = ctxLectureCdd2(endCtx);
  const lectures = [coeurCdd(endCtx, dernierJour, fin, enfants), ...(ctx2 ? [coeurCdd(ctx2, dernierJour, fin, enfants)] : [])];
  const noms = ctx2 ? (() => { const l = libelleLecturesCdd(c); return [`lecture 1 (${l.l1})`, `lecture 2 (${l.l2})`]; })() : [];
  const l1 = lectures[0];
  for (const l of lectures) for (const a of l.alertes) if (!alertes.includes(a)) alertes.push(a);
  // Direction T-076 (22/11/2026, point bloquant) : la part sûre porte sur le TOTAL de chaque lecture (salaires des mois +
  // régularisation), jamais en dessous du plus petit des deux. Les mois versent déjà le plus bas des deux calculs
  // (computeMonth) : `verse`. À la fin, chaque lecture doit encore (son total − verse) ; la somme de fin sûre est le plus
  // petit de ces restes, l'écart est à confirmer. Total versé = min(total lecture 1, total lecture 2). Sans seconde lecture,
  // verse = salaires de la lecture 1 et le reste est la régularisation : calcul inchangé.
  let verse = 0;
  for (const m of monthsBetween(monthOf(c.start), monthOf(dernierJour))) {
    const r = computeMonth(endCtx, m, enfants);
    if (r.active && !r.missing) verse += r.netTotal;
  }
  const finSalaires = lectures.map((l): Plage => ({
    lo: l.salairesNet + l.regul.lo - verse, hi: l.salairesNet + l.regul.hi - verse, inconnu: l.regul.inconnu, raisons: [...l.regul.raisons],
  }));
  if (ctx2) {
    const l = libelleLecturesCdd(c);
    const totaux = lectures.map((x) => x.salairesNet + x.regul.lo);
    const raison = `Chaque mois, l’app a versé le plus bas des deux calculs, soit ${euros(verse)} sur tout le CDD. À la fin, elle complète jusqu’au plus petit des deux totaux du CDD (salaires, congés versés et régularisation) : ${euros(totaux[0])} en lecture 1, ${euros(totaux[1])} en lecture 2.`;
    for (const p of finSalaires) p.raisons.unshift(raison);
    alertes.push(`${l.pourquoi} L’app calcule les deux façons : ${l.l1}, ou ${l.l2}. Chaque mois, elle verse la plus basse ; à la fin, elle complète pour que le total versé soit le plus petit des deux totaux. L’écart est à confirmer, hors du total.`);
  }

  // Réunit les lectures d'une somme : part sûre = la plus basse, à confirmer = la plus haute moins la part sûre.
  const reunir = (nom: string, plages: Plage[]): { valeur: number; inconnu?: string; part?: PartAConfirmer } => {
    const inconnu = plages.find((p) => p.inconnu)?.inconnu;
    if (inconnu) return { valeur: 0, inconnu };
    const lo = Math.min(...plages.map((p) => p.lo));
    const hi = Math.max(...plages.map((p) => p.hi));
    if (hi <= lo) return { valeur: lo };
    const raisons = [...new Set(plages.flatMap((p) => p.raisons))];
    const parLecture = plages.length > 1 && plages.some((p) => p.lo !== plages[0].lo || p.hi !== plages[0].hi)
      ? ` Selon la façon de calculer le salaire du CDD : ${plages.map((p, i) => `${noms[i]} : ${p.lo === p.hi ? euros(p.lo) : `de ${euros(p.lo)} à ${euros(p.hi)}`}`).join(' ; ')}.`
      : '';
    return {
      valeur: lo,
      part: {
        montant: hi - lo,
        lectures: [hi, lo],
        message: `${nom} : ${euros(lo)} sûrs, ${euros(hi - lo)} à confirmer, non compris dans le total (de ${euros(lo)} à ${euros(hi)} selon la lecture).${parLecture} ${raisons.join(' ')} Question posée à la DDETS : mets-toi d’accord avec les parents, par écrit.`.replace(/\s+/g, ' ').trim(),
      },
    };
  };
  // Décision D8 (22/11/2026) : suite en CDI, ni régularisation de fin, ni solde P2, ni ICCP (L1243-11 : même contrat ;
  // CCN 124 : régularisation « à la date de fin du contrat de travail »). Rien n'est dû maintenant.
  const reg = fin === 'suite_cdi' ? { valeur: 0 } as ReturnType<typeof reunir> : reunir(ctx2 ? 'Régularisation et complément de salaire du CDD' : 'Régularisation', finSalaires);
  const ifc = reunir('Indemnité de fin de contrat', lectures.map((l) => l.ifc));
  const iccp = reunir('Indemnité de congés non pris', lectures.map((l) => l.iccp));
  const assiette = Math.min(...lectures.map((l) => l.netCdd));
  const finMois = lastDay(monthOf(dernierJour));
  // Brut affiché seulement, dérivé du net (rapport fixe de l'app).
  const brutCdd = netToBrut(assiette, finMois);
  const due = IFC_DUE[fin];
  const ifcNet = ifc.valeur;
  const ifcExplication = !due
    ? IFC_NON_DUE[fin as keyof typeof IFC_NON_DUE]
    : ifc.inconnu ? 'À confirmer : voir l’encadré plus haut.'
      : `10 % de ${euros(assiette)} de salaires nets du CDD (code du travail, article L1243-8 ; l’Urssaf la fait déclarer et payer en net). Les indemnités d’entretien, de repas et de kilomètres ne comptent pas.`;
  if (fin === 'employeur') alertes.push(MESSAGE_CDD_DOMMAGES);
  if (fin === 'suite_cdi') alertes.push('Ton CDD continue en CDI : dans l’app, ne termine pas ce contrat. Ouvre-le et passe-le en CDI. L’app ne sait pas encore si la durée et les salaires du CDD comptent pour le préavis et l’indemnité de rupture du CDI (point à confirmer).');
  // Messages du contrat (motif « autre », plus de 18 mois) ; la règle des 12 mois concerne les mois, pas la fin.
  for (const m of messagesCdd(c)) {
    if (m === MESSAGE_CDD_12_MOIS || (m === MESSAGE_CDD_DEVIENT_CDI && fin === 'suite_cdi') || alertes.includes(m)) continue;
    alertes.push(m);
  }
  alertes.push(MESSAGE_CDD_DOCUMENTS);
  const regulExpl = reg.inconnu;
  return {
    ancienneteMois: anc, preavisLabel: 'Pas de préavis : fin de CDD', preavisFin: dernierJour, dernierJour,
    indemniteRupture: 0, ruptureExplication: MESSAGE_CDD_PAS_DE_PREAVIS, indemnitePreavis: 0,
    totalBrut: brutCdd, brutsEstimes: [], manquants: l1.manquants,
    regularisation: reg.valeur, regulMinutes: fin === 'suite_cdi' ? 0 : l1.regulMinutes,
    ...(regulExpl ? { regularisationAConfirmer: `${regulExpl} Elle n'est pas comptée dans le total.` } : {}),
    ...(reg.part ? { regularisationPartAConfirmer: reg.part } : {}),
    ...(ctx2 && fin !== 'suite_cdi' ? { regularisationParLecture: lectures.map((l) => l.regul.lo) } : {}),
    cpJoursRestants: l1.cpJours, cpIndemnite: iccp.valeur, cpDixiemeEnCours: l1.cpDixiemeEnCours,
    cpExplication: iccp.inconnu ? 'À confirmer : l’app ne donne pas de montant.' : l1.cpExplication,
    ...(iccp.inconnu ? { cpAConfirmer: iccp.inconnu } : {}),
    ...(iccp.part ? { cpPartAConfirmer: iccp.part } : {}),
    alertes,
    cdd: true, finCdd: fin, ifc: netToBrut(ifcNet, finMois), ifcNet, ifcExplication, brutCdd, assietteNetteCdd: assiette,
    ...(ifc.inconnu ? { ifcAConfirmer: ifc.inconnu } : {}),
    ...(ifc.part ? { ifcPartAConfirmer: ifc.part } : {}),
    declaration: due && ifc.valeur > 0 ? [{ champ: 'mntIndPrecarite', libelle: 'Indemnité de précarité', net: ifcNet, hint: 'Montant net. Elle ne correspond à aucune heure : ne l’ajoute ni aux heures ni aux jours.' }] : [],
  };
}
