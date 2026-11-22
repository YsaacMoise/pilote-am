// Fin de contrat : préavis (art. 120), indemnité de rupture (art. 121), régularisation (art. 109.2),
// indemnité de congés non pris. Aucun document officiel n'est produit.
import { nonGeresPeriode } from './nonGeres';
import { finPreavis, finsAdmises, preavisEmployeur } from './preavis';
import type { DemandeurInexecution, Motif } from './model';
import { euros } from './money';
import {
  addDays, addMonthsToDate, cpPeriod, cpPeriodStartYear, fullMonthsBetween, lastDay, monthLabel, monthOf, monthsBetween, shortDate,
  type ISODate, type Month,
} from './dates';
import { acquisition, baseDixieme, compteur, cpForMonth, indemnite, maintien } from './conges';
import { libelleRegulJoursAConfirmer, makeCtx, monthBase, naturesAConfirmer, monthBrut, regularisationLectures, regulStart, semainesSansAccueilAnnee, semainesSansAccueilManquantes, termsAt, type Ctx } from './payroll';
import { netToBrut } from './rates';

/** Entrée en vigueur de l'avenant n° 10 du 9 septembre 2025 (inaptitude) */
const AVENANT_10 = '2026-05-01';

export type { DemandeurInexecution, Motif } from './model';

export const MOTIF_LABEL: Record<Motif, string> = {
  retrait: 'Les parents retirent l’enfant',
  demission: 'Je démissionne',
  deces: 'Décès de l’enfant',
  inaptitude: 'Inaptitude sans lien avec le travail',
  inaptitude_pro: 'Inaptitude après un accident du travail ou une maladie professionnelle',
  faute_grave: 'Faute grave reprochée',
  essai: 'Rupture pendant la période d’essai',
};

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
  /** Base du dixième de la période en cours ; absente quand la régularisation n'est pas calculée (T-072, T-055). */
  cpDixiemeEnCours?: number;
  cpExplication: string;
  /** Congés non pris à confirmer : `cpIndemnite` vaut 0 et n'est pas compté (T-019) */
  cpAConfirmer?: string;
  /**
   * T-033 (décision de la direction, 18/11/2026) : la date de fin du préavis est « à confirmer » (PREAVIS-DATE-FIN). Si la
   * régularisation change quand le préavis finit un jour plus tard (seconde lecture : le jour de présentation ne compte pas,
   * ou le mois finit à la même date), elle n'est ni donnée ni comptée : `regularisation` vaut 0.
   */
  regularisationAConfirmer?: string;
  /** T-055 : régularisation non calculée (semaines sans accueil manquantes, C-002). `regularisation` vaut alors 0 mais n'est pas un montant : à confirmer. */
  regularisationNonCalculee?: string;
  manquants: Month[];
  alertes: string[];
  /** T-031 : cas non gérés pendant le contrat. Rempli : aucun montant n'est donné (tous à 0), le calcul est refusé. */
  nonGere?: string[];
}

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


/**
 * T-038 suite : total des salaires bruts (salaires et congés versés) du début du contrat au `fin`, comme dans `finDeContrat`.
 * T-054 : sans les mois couverts par le total saisi des bulletins (`couvert`), et avec le brut lu d'un bulletin contrôlé
 * (`lus`) : les bruts perçus de ces mois sont ceux des bulletins, quelle que soit la date de fin retenue.
 */
function brutJusqua(endCtx: Ctx, c: Ctx['c'], fin: ISODate, enfants: number, couvert: (m: Month) => boolean = () => false, lus?: Partial<Record<Month, number>>): number {
  let total = 0;
  for (const m of monthsBetween(monthOf(c.start), monthOf(fin))) {
    if (couvert(m)) continue;
    const b = monthBase(endCtx, m);
    if (!b.active || b.missing) continue;
    const lu = lus?.[m];
    if (lu != null && lu > 0) { total += lu; continue; }
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
      precMontant = maintien(endCtx, restantsPrec, dernierJour);
    } else {
      const indPrev = y - 1 >= cpPeriodStartYear(c.trackedFrom) ? indemnite(endCtx, y - 1, enfants) : null;
      if (indPrev && indPrev.jours) {
        let deja = 0;
        for (const m of monthsBetween(`${y}-06`, monthOf(dernierJour))) deja += cpForMonth(endCtx, m, enfants).indemnite;
        precMontant = Math.max(0, indPrev.montant - deja);
      } else {
        precMontant = maintien(endCtx, restantsPrec, dernierJour);
      }
    }
  }
  let cpIndemnite = curMontant + precMontant;
  let cpExplication = `${joursCur} jour${joursCur > 1 ? 's' : ''} acquis depuis le 1er juin (${cpPeriod(y).from.slice(0, 4)})` +
    (restantsPrec ? ` et ${restantsPrec} jour${restantsPrec > 1 ? 's' : ''} de la période précédente non pris` : '') +
    ' : on retient le plus favorable entre le dixième et le maintien de salaire.';
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
  // T-055 : le message est aussi rendu à part, pour que l'écran ne montre pas « 0,00 € » à la place d'un montant non calculé.
  let regularisationNonCalculee: string | undefined;
  if (manque > 0) {
    regularisationNonCalculee = `Régularisation non calculée : il manque ${manque} semaine${manque > 1 ? 's' : ''} sans accueil dans le contrat. Saisis-les d’abord, sinon les vacances compteraient comme des semaines accueillies. L’indemnité de congés non pris en dépend : elle est à confirmer. L’indemnité de rupture aussi, même si tes bulletins couvrent le dernier mois.`;
    alertes.push(regularisationNonCalculee);
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
  // T-072 (T-055) : sans la régularisation, qui y entre, la base du dixième en cours n'est pas connue.
  const cpDixiemeEnCours = finTerms.yearType === 'incomplete' && manque > 0 ? undefined : cp.dixiemeEnCours;
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
  // Direction T-072 (T-055) : une régularisation non calculée n'est connue nulle part, pas même dans un bulletin qui couvre le
  // dernier mois (CCN art. 121.1 et 124 : elle entre dans l'assiette) : l'indemnité est « à confirmer » dans tous les cas.
  const regulManquante = (!finCouverte(dernierMois) && !!regularisationAConfirmer) || regulNonCalculee;

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
    // T-054 : un mois couvert par les bulletins (total saisi ou brut lu) garde le brut du bulletin dans chaque variante ;
    // seul le salaire d'un mois non couvert change avec la date de fin.
    const brutFin = brutJusqua(endCtx, c, dernierJour, enfants, couvert, bruts.parMois);
    const conversionFin = (fin: ISODate) => netToBrut(assietteFinNet, lastDay(monthOf(fin)));
    // Relecture T-072 (B-1) : dernier mois couvert par les bulletins, variante dans un mois qui ne l'est pas. L'ICCP et la
    // régularisation de la fin seraient payées sur le bulletin de ce mois-là, hors du total saisi (CCN art. 121.1, 123.1,
    // 124) : elles s'ajoutent entières. Si l'une est « à confirmer », le montant de cette variante l'est aussi.
    const deplacees = (fin: ISODate) => finCouverte(dernierMois) && !finCouverte(monthOf(fin));
    const sommesFinAConfirmer = !!cpAConfirmer || !!regularisationAConfirmer || regulNonCalculee;
    const ecartFin = (fin: ISODate) => (deplacees(fin) ? conversionFin(fin) : conversionFin(fin) - conversionFin(dernierJour));
    const autres = variantes.map((v) => ({ ...v, montant: v.fin === dernierJour ? indemniteRupture
      : deplacees(v.fin) && sommesFinAConfirmer ? null
        : Math.round(((totalBrut + brutJusqua(ctxFin(v.fin), c, v.fin, enfants, couvert, bruts.parMois) - brutFin + ecartFin(v.fin)) * facteur) / 80) }));
    if (autres.some((v) => v.montant !== indemniteRupture)) {
      const valeur = (v: (typeof autres)[number]) => (v.montant == null
        ? `à confirmer (l’indemnité de congés non pris ou la régularisation de la fin, à confirmer, serait sur le bulletin de ${monthLabel(monthOf(v.fin))}, hors du total de tes bulletins)`
        : euros(v.montant));
      ruptureVariantes = `Indemnité de rupture à confirmer : elle dépend de la date de fin du préavis, à confirmer. ${autres.map((v) => `${v.libelle.replace(/^./, (x) => x.toUpperCase())} : ${valeur(v)}`).join(' ; ')}. Elle n'est pas comptée dans le total.`;
      ruptureAConfirmer = true;
    }
  }

  // T-031 : un cas non géré pendant le contrat (Alsace-Moselle, horaires variables, accueil occasionnel, congé maternité,
  // accident du travail…) fausse les salaires de référence, l'ancienneté retenue ou les congés : aucun montant.
  const nonGere = [...refusFin, ...nonGeresPeriode(c, ctx.leaves, c.start, dernierJour, 'non')];
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
    regularisation: regularisation_, regulMinutes, cpJoursRestants, cpIndemnite, cpDixiemeEnCours, cpExplication, cpAConfirmer, regularisationAConfirmer, regularisationNonCalculee, manquants, alertes,
  };
}
