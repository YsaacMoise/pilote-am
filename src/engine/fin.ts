// Fin de contrat : préavis (art. 120), indemnité de rupture (art. 121), régularisation (art. 109.2),
// indemnité de congés non pris. Aucun document officiel n'est produit.
import { nonGeresPeriode } from './nonGeres';
import { pvActif } from './planningVariable';
import { cumulCpADemander, finPreavis, finsAdmises, MESSAGE_GROSSESSE_A_REPONDRE, preavisEmployeur } from './preavis';
import { alertesProtection, finPreavisProrogee, messageProrogation, MESSAGE_CUMUL_CP_A_REPONDRE } from './suspensions';
import { FINS_CDD, type DemandeurInexecution, type FinCdd, type FinCddNonGere, type Motif, type Rupture } from './model';
import { finEssaiCdd, messagesCdd, MESSAGE_CDD_12_MOIS, MESSAGE_CDD_DEVIENT_CDI } from './cdd';
import { euros } from './money';
import {
  addDays, addMonthsToDate, cpPeriod, cpPeriodStartYear, fullMonthsBetween, lastDay, monthOf, monthsBetween, shortDate,
  type ISODate, type Month,
} from './dates';
import { acquisition, baseDixieme, compteur, cpForMonth, cpPrisEntre, indemnite, maintien, verseDansSalairePV } from './conges';
import { makeCtx, monthBase, planningBrutMin, monthBrut, regulStart, semainesSansAccueilAnnee, semainesSansAccueilManquantes, termsAt, type Ctx, regularisation, brutConnu, brutDuNet } from './payroll';
import { regionDe } from './regions';

/** Entrée en vigueur de l'avenant n° 10 du 9 septembre 2025 (inaptitude) */
const AVENANT_10 = '2026-05-01';

export type { DemandeurInexecution, FinCdd, FinCddNonGere, Motif } from './model';
import { avecPreavisMotif } from './model';
import { finEssaiMaxCdi, QUESTION_ESSAI_AUTRE_ENFANT } from './preavis';

/** T-109 (correction 10) : inaptitude notifiée avant l'avenant n° 10 */
export const MESSAGE_INAPTITUDE_AVANT_AVENANT_10 = 'Inaptitude notifiée avant le 1er mai 2026 : la rupture pour inaptitude n’existait pas encore pour l’assistante maternelle (avenant n° 10 de la convention, en vigueur le 1er mai 2026). Le contrat a pris fin par un retrait de l’enfant (convention, article 119.1) : choisis « Les parents retirent l’enfant », avec la date de leur lettre, et dis si le préavis a été fait.';

/** T-109 (correction 7) : la réponse sur l'essai de l'autre enfant manque */
export const MESSAGE_ESSAI_AUTRE_ENFANT = `Rupture pendant l’essai : ${QUESTION_ESSAI_AUTRE_ENFANT} Si oui, l’essai de ce contrat dure au plus 30 jours (convention, article 95.1). Réponds dans l’écran « Fin de contrat » : l’app calcule ensuite.`;

export const MOTIF_LABEL: Record<Motif, string> = {
  retrait: 'Les parents retirent l’enfant',
  demission: 'Je démissionne',
  retraite: 'Je pars à la retraite',
  deces: 'Décès de l’enfant',
  deces_am: 'Décès de l’assistante maternelle',
  inaptitude: 'Inaptitude sans lien avec le travail',
  inaptitude_pro: 'Inaptitude après un accident du travail ou une maladie professionnelle',
  faute_grave: 'Faute grave reprochée',
  faute_lourde: 'Faute lourde reprochée',
  essai: 'Rupture pendant la période d’essai',
  agrement: 'Agrément suspendu, modifié ou retiré',
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
  /** T-103 (F8) : décès de l'enfant, dernier jour de la période couverte par l'indemnité égale au préavis (CCN 119.4.2) */
  periodeDecesFin?: ISODate;
  dernierJour: ISODate;
  indemniteRupture: number;
  ruptureExplication: string;
  /** T-103 : indemnité de rupture non calculée, une somme de son assiette manque (donnée à saisir) ; `indemniteRupture` vaut 0 */
  ruptureAConfirmer?: boolean;
  /** Décès de l'enfant : indemnité égale au préavis (R-FIN-07, CCN art. 119.4.2), 0 pour les autres motifs */
  indemnitePreavis: number;
  indemnitePreavisExplication?: string;
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
  /** T-103 : congés non pris non calculés (donnée à saisir), avec la raison : `cpIndemnite` vaut 0 et n'est pas compté */
  cpAConfirmer?: string;
  /** T-103 : régularisation d'un CDD non calculée, avec la raison : `regularisation` vaut 0 et n'est pas comptée */
  regularisationAConfirmer?: string;
  /** T-055 : régularisation non calculée (semaines sans accueil manquantes, C-002). `regularisation` vaut alors 0 mais n'est pas un montant. */
  regularisationNonCalculee?: string;
  manquants: Month[];
  alertes: string[];
  /** T-031 : cas non gérés pendant le contrat. Rempli : aucun montant n'est donné (tous à 0), le calcul est refusé. */
  nonGere?: string[];
  /**
   * T-074 : préavis dont les parents ont dispensé l'AM, en tout ou en partie (CCN art. 64, 64.2, 66, 122). Jours dispensés
   * (`du` au `au`, à partir du début du préavis) et indemnité compensatrice de préavis de ces jours (`net`, `brut` estimé). Elle
   * est comprise dans les salaires des mois du préavis (mensualisation) : information, jamais ajoutée au total de la fin.
   */
  dispense?: { du: ISODate; au: ISODate; net: number; brut: number };
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
  /** T-076, revu par la T-103 : IFC non calculée (base incomplète, donnée à saisir) : `ifc` vaut 0 et n'est pas compté */
  ifcAConfirmer?: string;
  /**
   * T-107 (cas 2) : préavis non fait sans l'accord des parents : indemnité que les parents peuvent demander à l'AM, égale à la
   * rémunération nette de la partie du préavis non faite (CCN 64.2, al. 2), du lendemain du dernier jour travaillé à la fin
   * prévue du préavis. 0 : rien n'est dû (grossesse, C. trav. L1225-34). Information : jamais retirée des sommes dues à l'AM.
   */
  indemniteDueParents?: { net: number; du: ISODate; au: ISODate };
  /**
   * T-107 (cas 4) : CDD rompu pour un sinistre relevant de la force majeure : indemnité compensatrice égale aux rémunérations
   * que l'AM aurait perçues jusqu'au terme (C. trav. L1243-4, al. 2), en net, du lendemain du dernier jour au terme.
   */
  indemniteSinistre?: { net: number; du: ISODate; au: ISODate };
  /** T-076 : sommes de la fin à déclarer à Pajemploi qui ne correspondent à aucune heure (champ de l'API Pajemploi) */
  declaration?: { champ: 'mntIndPrecarite'; libelle: string; net: number; hint: string }[];
}

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
 * T-074 : indemnité compensatrice de préavis des jours dispensés, en net et en brut estimé (rapport fixe, mois par mois).
 * CCN art. 122 : préavis qui finit en cours de mois, déduction de l'art. 111 (proportion des heures ou des jours du mois).
 */
function icpDispense(c: Ctx['c'], from: ISODate, to: ISODate): { net: number; brut: number; autre?: number } {
  const h: Ctx = { ...makeCtx({ ...c, start: from, end: to, trackedFrom: from, history: [], rupture: undefined }, [], [], to), finControlee: true };
  let net = 0, brut = 0, autre = 0;
  for (const m of monthsBetween(monthOf(from), monthOf(to))) {
    // T-104 : horaires variables, les heures complémentaires et majorées prévues des jours dispensés font partie de la
    // « rémunération due au salarié jusqu'à la date de fin » (CCN 66) : comprises (aucune heure faite dans ce calcul : seules
    // les heures prévues comptent). Planning fixe : 0, rien ne change.
    const mb = monthBase(h, m);
    const b = mb.base + (pvActif(termsAt(c, lastDay(m))) ? mb.complAmount + mb.majAmount : 0);
    net += b;
    brut += brutDuNet(c, b, lastDay(m));
    // P-1 : mois où des jours prévus précèdent la dispense (jours travaillés ou payés comme salaire) : seconde lecture,
    // heures dispensées du mois × taux horaire net du contrat. Ailleurs (mois entier ou dernier mois sans jour travaillé),
    // art. 122 et 111 : une seule lecture.
    const debutMois = `${m}-01` as ISODate;
    let avant = 0, dispMin = 0;
    for (let x = debutMois > c.start ? debutMois : c.start; x < from; x = addDays(x, 1)) avant += planningBrutMin(termsAt(c, x), x);
    for (let x = from > debutMois ? from : debutMois; x <= to && x <= lastDay(m); x = addDays(x, 1)) dispMin += planningBrutMin(termsAt(c, x), x);
    autre += avant > 0 ? Math.round((dispMin * termsAt(c, from).rateNet) / 60) : b;
  }
  // T-103 (F5) : CCN 122, « le particulier employeur tient compte de la déduction d'absence prévue à l'article 111 » : la
  // proportion de l'art. 111 est la seule méthode écrite ; « heures × taux » (`autre`) n'est plus proposée.
  void autre;
  return { net, brut };
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
  // T-103 (F7) : l'indemnité de la période précédente encore due à la fin y est ajoutée. CASF L423-6 : « indemnité représentative
  // du congé annuel payé qui est égale au dixième du total formé par la rémunération reçue […] et par l'indemnité de congé payé
  // de l'année précédente » (fiche DDETS 31 « Accueil sur 46 semaines ou moins », p. 11 : 400 € dans la base).
  // Point 1 de T-050 (direction) : dixième = base ÷ 10, sans prorata des jours pour enfants.
  const indCur = indemnite(endCtx, y, enfants);
  const joursCur = acq.joursADate;
  const regulDue = Math.max(0, regul);
  // Période précédente : jours restants, moins ce qui a déjà été versé.
  let precMontant = 0;
  if (restantsPrec > 0) {
    if (finTerms.yearType === 'complete') {
      // Les jours pris ont été payés dans le salaire, le complément du dixième en juin : reste le maintien.
      precMontant = maintien(endCtx, restantsPrec, dernierJour, y - 1);
      // T-076 (relecture R2, décision de la direction section 5) : planning variable, même base que le complément de juin
      // (cpForMonth). L'indemnité de la période précédente vaut la part sûre ; déjà versés : le complément de juin et, pour
      // chaque jour pris, le maintien compris dans le salaire mensualisé (`verseDansSalaire` ÷ jours). Reste dû = part sûre
      // − complément − versé des jours pris. En L1 comme en L2.
      const indPrevPv = y - 1 >= cpPeriodStartYear(c.trackedFrom) ? indemnite(endCtx, y - 1, enfants) : null;
      if (pvActif(finTerms) && indPrevPv?.pv && indPrevPv.jours > 0 && !indPrevPv.aConfirmer) {
        const complementJuin = cpForMonth(endCtx, `${y}-06` as Month, enfants).complement;
        const parJour = indPrevPv.pv.verseDansSalaire / indPrevPv.jours;
        precMontant = Math.max(0, Math.round(indPrevPv.montant - complementJuin - parJour * Math.min(cpt.pris, cpt.aPrendre)));
      }
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
  const dixiemeEnCours = regulDue > 0 || precMontant > 0 ? Math.round((baseDixieme(endCtx, y, enfants).base + regulDue + precMontant) / 10) : Math.round(indCur.dixieme);
  const curMontant = Math.max(dixiemeEnCours, maintien(endCtx, joursCur, dernierJour));
  let cpIndemnite = curMontant + precMontant;
  let cpExplication = `${joursCur} jour${joursCur > 1 ? 's' : ''} acquis depuis le 1er juin (${cpPeriod(y).from.slice(0, 4)})` +
    (restantsPrec ? ` et ${restantsPrec} jour${restantsPrec > 1 ? 's' : ''} de la période précédente non pris` : '') +
    ' : on retient le plus favorable entre le dixième et le maintien de salaire.';
  // T-076 (R-PV-13, P-PV-5) : les jours non pris n'ont pas de planning ; le maintien suit la lecture C1 (heures prévues
  // moyennes de la période de référence). La lecture C2 (heures des jours de congé pris) n'a pas d'objet ici.
  if (pvActif(finTerms)) cpExplication += ' Horaires variables : le maintien de salaire est calculé sur tes heures prévues moyennes de la période, car des jours non pris n’ont pas de planning.';
  // T-103 : jours acquis ou indemnité non calculés (donnée à saisir ou cas non géré), ou saisie contradictoire d'un congé :
  // aucun montant n'est donné, la raison dit quoi saisir.
  let cpAConfirmer: string | undefined;
  const indPrecAC = restantsPrec > 0 && finTerms.yearType !== 'complete' && y - 1 >= cpPeriodStartYear(c.trackedFrom)
    ? indemnite(endCtx, y - 1, enfants).aConfirmer : undefined;
  const motifsAC = [
    acq.aConfirmer?.message ?? indCur.aConfirmer?.message,
    cpt.aPrendreAConfirmer?.message ?? indPrecAC?.message,
    ...cpt.decompteAConfirmer,
  ].filter((x): x is string => !!x);
  if (motifsAC.length) {
    cpAConfirmer = `Indemnité de congés non pris non calculée. ${[...new Set(motifsAC)].join(' ')}`;
    cpIndemnite = 0;
    cpExplication = 'Non calculée : voir l’encadré plus haut.';
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
/**
 * T-107 : `reponses` : réponses de l'écran Fin demandées seulement dans leur cas : accord écrit de cumul des congés payés et du
 * préavis (CCN 64.1), grossesse de l'AM qui part sans préavis (C. trav. L1225-34). Absentes : celles enregistrées avec le
 * contrat (`ctx.c.rupture`).
 */
export function finDeContrat(ctx: Ctx, notif: ISODate, motif: Motif, enfants = 0, presentation?: ISODate,
  inexecutionOuBruts?: Inexecution | BrutsReels, brutsReels?: BrutsReels, reponses?: Pick<Rupture, 'cumulCpPreavis' | 'grossesse'> & Partial<Pick<Rupture, 'essaiAutreEnfant'>>, autreEnfantEnCours = false): FinResult {
  const inexecution = inexecutionOuBruts && 'demandeur' in inexecutionOuBruts ? inexecutionOuBruts : undefined;
  const bruts: BrutsReels = brutsReels ?? (inexecutionOuBruts && !('demandeur' in inexecutionOuBruts) ? inexecutionOuBruts : {});
  // T-076 : un CDD finit sans préavis ni indemnité de rupture (R-CDD-06) : calcul à part, finDeCdd. La façon dont il finit est
  // celle enregistrée avec le contrat (écran Fin) ; sans elle, aucun montant.
  if (ctx.c.cdd || motif === 'fin_cdd') return finDeCdd(ctx, notif, motif === 'fin_cdd' ? ctx.c.rupture?.finCdd : undefined, enfants, motif);
  const c = ctx.c;
  const alertes: string[] = [];
  const anc = fullMonthsBetween(c.start, notif);
  const depart = presentation && presentation > notif ? presentation : notif;
  const cumulCpPreavis = reponses ? reponses.cumulCpPreavis : c.rupture?.cumulCpPreavis;
  const grossesse = reponses ? reponses.grossesse : c.rupture?.grossesse;
  const refusFin: string[] = [];
  // T-109 (correction 7) : CDI, rupture « pendant l'essai » après sa durée maximale (CCN 95.1) : ce n'est pas une rupture pendant
  // l'essai (Cass. soc. 07/03/2000, n° 97-44.486, publié, comme pour le CDD) : aucun montant, l'écran le dit.
  if (motif === 'essai') {
    const essaiAutre = reponses && 'essaiAutreEnfant' in reponses ? reponses.essaiAutreEnfant : c.rupture?.essaiAutreEnfant;
    const general = finEssaiMaxCdi(c);
    if (autreEnfantEnCours && essaiAutre === undefined && notif > finEssaiMaxCdi(c, true).fin && notif <= general.fin) refusFin.push(MESSAGE_ESSAI_AUTRE_ENFANT);
    else {
      const max = finEssaiMaxCdi(c, autreEnfantEnCours && essaiAutre === true);
      if (notif > max.fin) refusFin.push(`Tu as choisi « ${MOTIF_LABEL.essai} », mais la lettre (${shortDate(notif)}) est après la fin possible de la période d’essai, le ${shortDate(max.fin)} : ${max.regle} (convention, article 95.1). Ce n’est donc pas une rupture pendant l’essai : choisis le vrai motif (retrait de l’enfant, démission…), avec son préavis et ses indemnités, ou corrige la date.`);
    }
  }

  // Préavis (art. 120) : « un préavis est à effectuer en cas de rupture à l'initiative du particulier employeur ou du
  // salarié. Sa durée est au minimum de : – 8 jours calendaires lorsque l'enfant est accueilli depuis moins de 3 mois »
  // (T-023 : la démission avant 3 mois a aussi 8 jours ; le conflit CASF L423-26 / CCN 120 de 3 mois à 1 an relève de T-024).
  // Inaptitude (avenant n° 10 du 9 septembre 2025, art. 119-5 et 64-4) : rupture sans préavis, à la date d'envoi.
  let preavisFin = notif;
  let preavisLabel = 'Pas de préavis';
  if (motif === 'inaptitude' || motif === 'inaptitude_pro') {
    preavisLabel = 'Pas de préavis en cas d’inaptitude : le contrat s’arrête à l’envoi de la lettre';
  } else if (motif === 'deces_am') {
    // T-109 : CCN 63.3.2, rupture de plein droit à la date du décès.
    preavisLabel = 'Pas de préavis : le contrat est rompu à la date du décès (convention, article 63.3.2)';
  } else if (motif === 'faute_grave' || motif === 'faute_lourde') {
    // T-109 : CCN 120 (pas de préavis en cas de faute grave ou lourde) et 64.3 (rupture à la date d'envoi de la notification).
    preavisLabel = 'Pas de préavis en cas de faute grave ou lourde : le contrat s’arrête à la date d’envoi de la lettre (convention, articles 64.3 et 120)';
  } else if (motif === 'agrement') {
    // T-107 (cas 5) : CCN 119.3, « le contrat de travail est rompu sans préavis, ni indemnité de rupture, du seul fait de la
    // suspension, de la modification ou du retrait de l'agrément » ; retrait forcé « à la date de notification de la suspension,
    // de la modification ou du retrait de l'agrément par le conseil départemental ».
    preavisLabel = 'Pas de préavis : l’agrément s’impose, le contrat s’arrête à la date de la décision du conseil départemental';
  } else if (avecPreavisMotif(motif)) {
    const p = preavisEmployeur(anc);
    preavisLabel = p.label;
    preavisFin = finPreavis(depart, p);
    // T-104 (R-ABS-07) : préavis fait en entier, suspendu par un congé de maternité ou un arrêt pour accident du travail ou
    // maladie professionnelle (CCN 64.1) : la fin du contrat est reculée d'autant.
    // T-107 (cas 1) : et par les congés payés pris pendant le préavis, sauf accord écrit et signé de cumul (CCN 64.1).
    if (!inexecution) {
      if (cumulCpADemander(c.start, { motif, notif, presentation, cumulCpPreavis }, ctx.leaves)) refusFin.push(MESSAGE_CUMUL_CP_A_REPONDRE);
      else if (cumulCpPreavis === true && cumulCpADemander(c.start, { motif, notif, presentation }, ctx.leaves)) {
        alertes.push('Congés payés pris pendant le préavis avec un accord écrit et signé des parents : le préavis n’est pas suspendu (convention, article 64.1). Garde cet accord.');
      }
      const prorogee = finPreavisProrogee(depart, preavisFin, ctx.leaves, cumulCpPreavis);
      if (prorogee !== preavisFin) { alertes.push(messageProrogation(preavisFin, prorogee)); preavisFin = prorogee; }
    }
    // T-103 (F1, F2 ; décision du DG du 24/11/2026) : une seule date de fin. Le jour de la première présentation est le premier
    // jour du préavis (CCN 64.1 et 120 ; CASF L423-24 ; fiche officielle F2883 : présentée le 8 juillet, préavis d'un mois
    // « du 8 juillet au 7 août 2026 inclus »). Démission de 3 mois à moins d'un an : 15 jours (CCN 120, plus favorable que
    // CASF L423-26, qui permet à l'employeur d'abréger le mois ; C. trav. L2251-1).
  }
  // Décès de l'enfant (R-FIN-07, CCN art. 119.4.2 ; Urssaf « motifs de fin de contrat » ; service-public.fr F16842) :
  // le contrat s'arrête le jour du décès, sans préavis à faire ; l'employeur verse une indemnité égale à l'indemnité
  // compensatrice de préavis (R-FIN-05), de la durée d'un retrait de l'enfant à la date du décès (R-FIN-02).
  // T-103 (F8) : CCN 119.4.2, le contrat est rompu « au jour du décès » et l'AM reçoit « le dernier salaire dû au jour du
  // décès » : le jour du décès est payé en salaire, la période de l'indemnité part du lendemain.
  let indemnitePreavis = 0;
  let indemnitePreavisExplication: string | undefined;
  let periodeDecesFin: ISODate | undefined;
  if (motif === 'deces') {
    const p = preavisEmployeur(anc);
    const debut = addDays(notif, 1);
    const fin = finPreavis(debut, p);
    periodeDecesFin = fin;
    indemnitePreavis = indemniteCompensatricePreavis(c, debut, fin);
    preavisLabel = `${p.label} : pas de préavis à faire, les parents te versent une indemnité égale au préavis`;
    indemnitePreavisExplication = `Égale au salaire que tu aurais touché pendant ${p.jours ? `${p.jours} jours` : 'un mois'}, du ${shortDate(debut)} au ${shortDate(fin)}.`;
    alertes.push(`Décès de l’enfant : l’indemnité égale au préavis couvre ${p.jours ? `${p.jours} jours` : 'un mois'} à partir du lendemain du décès, du ${shortDate(debut)} au ${shortDate(fin)} ; le jour du décès est payé avec le dernier salaire (convention, article 119.4.2).`);
  }
  // T-103 (R2) : Alsace-Moselle, pas de préavis local de six semaines pour l'AM : C. trav. L1234-16 vise les « personnes
  // employées chez des particuliers » (l'AM travaille chez elle) ; le CASF fixe son propre préavis (L423-25, L423-26).
  // T-045 : préavis non exécuté. Art. 64 : la date de fin est « la date prévue de fin du préavis » si l'inexécution est à
  // l'initiative de l'employeur, « le dernier jour travaillé » si elle est à l'initiative du salarié. Art. 64.2, al. 2 : avec
  // l'accord de l'employeur, « le contrat de travail prend fin au dernier jour travaillé » ; aucune indemnité n'est prévue
  // pour l'AM (service-public.fr F33164 et F16842 : l'AM « n'est pas payée pour la partie du préavis non réalisé »).
  // T-074 : la dispense par les parents est aussi calculée. T-107 (cas 2) : le départ sans accord aussi.
  let employeurValide = false;
  let dispense: { du: ISODate; au: ISODate } | undefined;
  let dernierJour = preavisFin;
  let finAuDernierJourTravaille = false;
  let indemniteDueParents: FinResult['indemniteDueParents'];
  if (inexecution) {
    const d = inexecution.dernierJourTravaille;
    if (!avecPreavisMotif(motif)) {
      refusFin.push(`Préavis non exécuté : ce motif (${MOTIF_LABEL[motif].toLowerCase()}) n’a pas de préavis. Retire la réponse sur le préavis ou vérifie le motif.`);
    } else if (d < notif && !(inexecution.demandeur === 'employeur' && d >= addDays(notif, -7))) {
      // T-074 (R2) : dispense totale, l'enfant n'est plus confié dès le jour de la lettre : le dernier jour d'accueil peut
      // précéder la lettre (veille, ou vendredi avant une lettre du lundi), dans la semaine qui précède.
      refusFin.push(`Préavis non exécuté : le dernier jour travaillé (${shortDate(d)}) est avant l’envoi de la lettre (${shortDate(notif)}). Cas non géré : vérifie les dates avec les parents.`);
    } else if (d > preavisFin) {
      refusFin.push(`Préavis non exécuté : le dernier jour travaillé (${shortDate(d)}) est après la fin du préavis calculée par l’app (${shortDate(preavisFin)}). Cas non géré : vérifie les dates avec les parents.`);
    } else if (inexecution.demandeur === 'am_acceptee') {
      dernierJour = d;
      finAuDernierJourTravaille = true;
      alertes.push(`Préavis non fait en entier, à ta demande, accepté par les parents : le contrat finit le ${shortDate(d)}, ton dernier jour travaillé (convention, articles 64 et 64.2). La partie du préavis non faite n’est pas payée. Garde l’accord des parents par écrit.`);
    } else if (inexecution.demandeur === 'employeur') {
      // T-074 (regles/t074-preavis-dispense.md) : art. 64, le contrat finit « à la date prévue de fin du préavis » ; art. 64.2,
      // al. 1, indemnité compensatrice « jusqu'à la date prévue de fin », égale à la rémunération brute, soumise à cotisations,
      // et la période « est prise en compte pour la détermination du droit à congés payés et au titre de l'ancienneté » ;
      // art. 66 et 122. La date de fin reste `preavisFin` ; les jours après le dernier jour travaillé sont payés sans
      // entretien (jourDispense, payroll.ts). Points ouverts, « à confirmer » plus bas : régularisation (D-2), indemnité de
      // rupture (envoi 1 question 4 ; D-1).
      employeurValide = true;
      // R4 : l'indemnité de préavis part du début du préavis ; un jour non confié avant ce début est une absence de l'enfant
      // payée comme salaire (art. 105), sans entretien.
      if (d < preavisFin) dispense = { du: addDays(d, 1) > depart ? addDays(d, 1) : depart, au: preavisFin };
    } else {
      // T-107 (cas 2) : CCN 64, le contrat finit « au dernier jour travaillé, en cas d'inexécution totale ou partielle du préavis
      // à l'initiative du salarié » ; CCN 64.2, al. 2 : « À défaut d'accord entre les parties, l'inexécution totale ou partielle du
      // préavis imposée par le salarié ouvre droit, au profit du particulier employeur, à une indemnité égale au montant de la
      // rémunération nette correspondant à la durée non exécutée du préavis. » C. trav. L1225-34 (CASF L423-2, 3°) : « La
      // salariée en état de grossesse médicalement constaté peut rompre son contrat de travail sans préavis et sans devoir
      // d'indemnité de rupture. »
      dernierJour = d;
      finAuDernierJourTravaille = true;
      if (motif === 'demission' && grossesse === undefined) {
        refusFin.push(MESSAGE_GROSSESSE_A_REPONDRE);
      } else if (motif === 'demission' && grossesse) {
        indemniteDueParents = { net: 0, du: addDays(d, 1), au: preavisFin };
        alertes.push(`Démission pendant ta grossesse, sans faire ton préavis : c’est ton droit. Tu ne dois rien aux parents pour le préavis non fait (code du travail, article L1225-34). Le contrat finit le ${shortDate(d)}, ton dernier jour travaillé (convention, article 64). Garde le certificat médical de grossesse.`);
      } else if (d < preavisFin) {
        indemniteDueParents = { net: icpDispense(c, addDays(d, 1), preavisFin).net, du: addDays(d, 1), au: preavisFin };
        alertes.push(`Préavis non fait sans l’accord des parents : le contrat finit le ${shortDate(d)}, ton dernier jour travaillé (convention, article 64). Les parents peuvent te demander une indemnité égale au salaire net de la partie du préavis non faite, du ${shortDate(addDays(d, 1))} au ${shortDate(preavisFin)} : ${euros(indemniteDueParents.net)} (convention, article 64.2). Ils ne peuvent pas la retenir sur les sommes ci-dessous : s’ils la veulent, ils doivent saisir le conseil de prud’hommes (service-public.gouv.fr, fiche « Démission d’une assistante maternelle », F33164).`);
      }
    }
  }
  // T-045 (B-2) : une date de fin du contrat déjà saisie avant la fin calculée n'est jamais dépassée en silence.
  // T-045b (C3-1) : une date saisie après la fin calculée non plus. Admises : la fin calculée et les autres fins possibles du
  // préavis fait en entier (lendemain, préavis d'un mois de la démission de 3 mois à 1 an), dont les montants sont déjà
  // donnés « à confirmer » ; avec un préavis non fait à la demande de l'AM, seul le dernier jour travaillé.
  const finAdmise = (e: ISODate) => e === dernierJour || (!finAuDernierJourTravaille && finsAdmises(c.start, { motif, notif, presentation, cumulCpPreavis }, regionDe(c) === 'alsaceMoselle', inexecution ? [] : ctx.leaves).admises.includes(e));
  // T-104 (R-ABS-06) : protection de l'AM pendant et après un congé de naissance (C. trav. L1225-4, L1225-4-1, L1225-4-5,
  // applicables par CASF L423-2, 3° ; Cass. soc. 31/01/2018, n° 16-17.886, publié : retrait d'enfant d'une AM annulé). Les
  // montants sont calculés comme la fin enregistrée ; l'app dit la règle.
  if (motif === 'retrait') alertes.push(...alertesProtection(ctx.leaves, notif, dernierJour));
  if (!refusFin.length && c.end && c.end > dernierJour && !finAdmise(c.end)) {
    refusFin.push(`La date de fin du contrat (${shortDate(c.end)}) est après ${finAuDernierJourTravaille ? 'le dernier jour travaillé indiqué' : 'la fin du préavis'} (${shortDate(dernierJour)}). L’app ne calcule pas au-delà, ni en deçà : corrige la date de fin du contrat, ou vérifie les dates de la lettre et du préavis.`);
  }
  if (!refusFin.length && c.end && c.end < dernierJour && employeurValide) {
    refusFin.push(`La date de fin du contrat (${shortDate(c.end)}) est avant la date prévue de fin du préavis (${shortDate(dernierJour)}). Préavis non fait à la demande des parents : le contrat finit à la date prévue de fin du préavis (convention, article 64), pas à ton dernier jour travaillé. Corrige la date de fin du contrat.`);
  }
  if (!refusFin.length && c.end && c.end < dernierJour) {
    refusFin.push(`La date de fin du contrat (${shortDate(c.end)}) est avant ${finAuDernierJourTravaille ? 'le dernier jour travaillé indiqué' : 'la fin du préavis'} (${shortDate(dernierJour)}). Si le préavis n’a pas été fait en entier, dis-le dans la question sur le préavis ; sinon corrige la date de fin du contrat. L’app ne calcule rien tant que les deux dates ne concordent pas.`);
  }
  // T-045b : contextes dont la date de fin vient de ce calcul, contrôlée ci-dessus (finControlee).
  // T-074 : la réponse sur le préavis vient de ce calcul (une réponse enregistrée plus ancienne ne compte pas) : jours dispensés.
  const rupturePreavis: Rupture | undefined = employeurValide && inexecution
    ? { motif, notif, ...(presentation && presentation > notif ? { presentation } : {}), preavis: 'employeur', dernierJourTravaille: inexecution.dernierJourTravaille }
    : undefined;
  const cFin: Ctx['c'] = { ...c, rupture: rupturePreavis };
  const endCtx: Ctx = { ...ctx, c: { ...cFin, end: dernierJour }, cache: new Map(), finControlee: true };
  // T-103 (F1, F2, F6) : une seule date de fin, celle du préavis (ou du dernier jour travaillé) : plus de variantes.
  let icp: { net: number; brut: number } | undefined;
  if (dispense) {
    icp = icpDispense(c, dispense.du, dispense.au);
    const jours = dispense.du === dispense.au ? `le ${shortDate(dispense.du)}` : `du ${shortDate(dispense.du)} au ${shortDate(dispense.au)}`;
    alertes.push(`Préavis non fait en entier, à la demande des parents : tu as accueilli l’enfant jusqu’au ${shortDate(inexecution!.dernierJourTravaille)}. Le contrat finit le ${shortDate(dernierJour)}, date prévue de fin du préavis (convention, article 64). Pour les jours dispensés (${jours}), les parents te versent une indemnité compensatrice de préavis égale au salaire de ces jours : ${euros(icp.net)} net, soit ${euros(icp.brut)} brut (proportion de l’article 111, convention, article 122). Elle est comprise dans tes salaires des mois du préavis, pas en plus, et soumise aux cotisations. Ces jours comptent pour tes congés et ton ancienneté (article 64.2). Pas d’indemnité d’entretien ni de repas ces jours-là (article 114). Garde par écrit que ce sont les parents qui t’ont dispensée : si c’est toi qui as demandé à partir, le contrat finit à ton dernier jour travaillé et ces jours ne sont pas payés.`);
    alertes.push('Déclaration à Pajemploi : mets le montant de l’indemnité de préavis dans la case « indemnité compensatrice de préavis non effectué » (documentation officielle de la déclaration Pajemploi). Les jours dispensés ne sont ni des heures ni des jours d’activité : rien n’y est travaillé. Le total à verser ne change pas.');
  }

  // Salaires bruts depuis le début du contrat
  let totalBrut = 0;
  let cpManquants = false;
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
    if (!b.brut && !brutConnu(c, lastDay(m))) brutsEstimes.push(m);
    totalBrut += monthBrut(endCtx, m);
    const cp = cpForMonth(endCtx, m, enfants);
    totalBrut += brutDuNet(c, cp.indemnite + cp.complement, lastDay(m));
    if (cp.aConfirmer) cpManquants = true;
  }
  if (manquants.length) {
    alertes.push(`Historique incomplet : ${manquants.length} mois sans bulletin. Ajoute les bulletins manquants dans l’historique pour un calcul juste.`);
  }

  // Avenant n° 10 (inaptitude) en vigueur le 1er mai 2026 : avant, ses règles ne s'appliquaient pas.
  // T-109 (comparateur, correction 10 et section 6, point 6) : avant le 01/05/2026, ni la convention (63.4, 64.4 et 119.5 datent
  // de l'avenant n° 10) ni la loi (CASF L423-2 ne rend pas applicable à l'AM le chapitre VI du titre II du livre II de la 1re
  // partie du code du travail, L1226-1 à L1226-24) ne prévoyaient de rupture pour inaptitude de l'AM : le contrat finissait par
  // un retrait de l'enfant (CCN 119.1, « quel qu'en soit le motif »). Plus de calcul « à faire vérifier » : refus, avec la raison.
  if ((motif === 'inaptitude' || motif === 'inaptitude_pro') && notif < AVENANT_10) refusFin.push(MESSAGE_INAPTITUDE_AVANT_AVENANT_10);

  // Régularisation (CCN 124) : heures réellement dues (planning, hors absences retenues) contre heures payées, depuis
  // l'embauche, le début du suivi ou le dernier passage d'une année à l'autre (C-001 : les autres avenants ne coupent pas).
  // T-103 (F6) : CCN 124, régularisation « à la date de fin du contrat » ; CCN 64 : cette date est la date prévue de fin du
  // préavis, jours dispensés compris (payés comme prévus, CCN 66).
  const finTerms = termsAt(c, dernierJour);
  const regStart = regulStart(c, addDays(dernierJour, 1));
  const reg = regularisation(endCtx, regStart, dernierJour);
  const regulMinutes = reg.minutes;
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
    regularisationNonCalculee = `Régularisation non calculée : il manque ${manque} semaine${manque > 1 ? 's' : ''} sans accueil dans le contrat. Saisis-les d’abord, sinon les vacances compteraient comme des semaines accueillies. L’indemnité de congés non pris en dépend : elle n’est pas calculée non plus.`;
    alertes.push(regularisationNonCalculee);
  } else if (finTerms.yearType === 'incomplete') {
    alertes.push('Vérifie que toutes les semaines sans accueil de la dernière année sont saisies : une semaine non saisie compte comme accueillie dans la régularisation.');
  }
  const regularisation_ = finTerms.yearType === 'incomplete' && manque === 0 ? reg.montant : 0;
  if (finTerms.yearType === 'complete' && regulMinutes > 60 && !c.accueilOccasionnel) {
    alertes.push('Année complète : la régularisation ne s’applique pas en principe, vérifie le planning du contrat.');
  }

  // Congés non pris. T-050b (A-50) : la régularisation due entre dans la base du dixième de la période en cours.
  // T-104 (cas 2, R-OCC-10) : accueil occasionnel, les congés sont versés au terme de chaque accueil (CCN 102.1.2.3), avec le
  // salaire du dernier mois si l'accueil finit avec le contrat : aucune indemnité de congés non pris en plus (CCN 67 : congés
  // « non rémunérés au jour de la date de fin »). Pas de régularisation (124 : 46 semaines ou moins seulement).
  const cp = c.accueilOccasionnel
    ? { cpIndemnite: 0, jours: 0, cpExplication: 'Accueil occasionnel : tes congés payés (10 % des salaires) sont versés à la fin de chaque accueil, avec le salaire du mois. Rien de plus à la fin du contrat (convention, articles 67 et 102.1.2.3).', cpAConfirmer: undefined as string | undefined, dixiemeEnCours: 0 }
    : congesNonPris(endCtx, c, dernierJour, enfants, regularisation_);
  let { cpIndemnite, cpExplication, cpAConfirmer } = cp;
  const cpJoursRestants = cp.jours;
  // T-072 (T-055) : sans la régularisation, qui y entre, la base du dixième en cours n'est pas connue.
  const regulNonCalculee = finTerms.yearType === 'incomplete' && manque > 0;
  const cpDixiemeEnCours = regulNonCalculee ? undefined : cp.dixiemeEnCours;
  if (regulNonCalculee) {
    // T-050d (C-1) : la régularisation entre dans la base du dixième (A-50) : l'indemnité de congés non pris attend la donnée.
    const raison = `Indemnité de congés non pris non calculée : la régularisation de fin de contrat n’est pas calculée (il manque ${manque} semaine${manque > 1 ? 's' : ''} sans accueil), or elle entre dans la base du dixième (convention, articles 48.1.1.5 et 124).`;
    cpAConfirmer = cpAConfirmer ? `${cpAConfirmer} ${raison}` : raison;
    cpIndemnite = 0;
    cpExplication = 'Non calculée : voir l’encadré plus haut.';
  }

  // T-050b (A-45) : assiette de l'indemnité de rupture. CCN art. 121.1 : 1/80 « du total des salaires bruts perçus pendant la
  // durée du contrat », « hors indemnités non soumises à contributions et cotisations sociales » (seule exclusion écrite).
  // L'ICCP des deux périodes et la régularisation de fin de contrat en font partie, comme l'indemnité de préavis (T-103, F4).
  // Elles sont payées sur le dernier bulletin : déjà comprises si ce bulletin est couvert par le total saisi ou lu (C-008).
  const finCouverte = (m: Month) => couvert(m) || (bruts.parMois?.[m] != null && bruts.parMois[m]! > 0);
  const dernierMois = monthOf(dernierJour);
  if (!finCouverte(dernierMois)) totalBrut += brutDuNet(c, cpIndemnite + regularisation_, lastDay(dernierMois));
  // T-103 (F13, même règle que F4) : décès de l'enfant, l'indemnité « égale à l'indemnité compensatrice de préavis définie à
  // l'article 122 » (CCN 119.4.2) est de même nature, « soumise à contributions et cotisations sociales » (CCN 64.2) : elle entre
  // dans les salaires bruts du 1/80 (CCN 121.1 n'exclut que les sommes non soumises). Versée à la fin, sur le dernier bulletin.
  if (motif === 'deces' && indemnitePreavis > 0 && !finCouverte(dernierMois)) totalBrut += brutDuNet(c, indemnitePreavis, lastDay(dernierMois));
  const iccpManquante = !finCouverte(dernierMois) && !!cpAConfirmer;
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
    // T-103 (F3) : CCN 60, l'ancienneté « s'arrête à la date à laquelle le contrat de travail prend fin » ; CCN 64 et 64.2 : la
    // fin est la fin du préavis, ou sa date prévue s'il est dispensé, et la période dispensée compte. La seule exception écrite
    // (CCN 120, ancienneté « au jour de la date d'envoi de la lettre ») vise la durée du préavis.
    const ancFinContrat = fullMonthsBetween(c.start, addDays(dernierJour, 1));
    if (ancFinContrat >= 9) {
      indemniteRupture = Math.round(totalBrut / 80);
      ruptureExplication = `1/80e des salaires bruts perçus depuis le début du contrat (9 mois d’ancienneté atteints à la fin du contrat : ${ancFinContrat} mois).`;
    } else {
      ruptureExplication = `Pas d’indemnité : moins de 9 mois d’ancienneté à la fin du contrat (${ancFinContrat} mois).`;
    }
  } else if (motif === 'demission') {
    ruptureExplication = 'Pas d’indemnité de rupture en cas de démission.';
  } else if (motif === 'agrement') {
    // T-107 (cas 5) : CCN 119.3 (« ni indemnité de rupture ») et 121.1 (indemnité « pas due […] en cas de modification ou de
    // suspension ou de retrait d'agrément »). L'ICCP est versée (119.3, renvoi à l'art. 67), et la régularisation de l'art. 124.
    ruptureExplication = 'Pas d’indemnité de rupture quand l’agrément est suspendu, modifié ou retiré (convention, articles 119.3 et 121.1). Tes congés non pris te sont payés.';
    alertes.push(`Agrément suspendu, modifié ou retiré : le contrat est rompu sans préavis à la date de la décision du conseil départemental (${shortDate(notif)}) ; les parents te notifient le retrait forcé de l’enfant par lettre recommandée ou remise en main propre (convention, article 119.3).`);
  } else if (motif === 'faute_grave' || motif === 'faute_lourde') {
    // T-109 (correction 6) : faute lourde, comme la faute grave : pas de préavis (CCN 120), pas d'indemnité (121.1), rupture à la
    // date d'envoi de la notification (64.3). L'indemnité de congés non pris reste due.
    ruptureExplication = `Pas d’indemnité de rupture en cas de faute ${motif === 'faute_lourde' ? 'lourde' : 'grave'} (convention, article 121.1 ; à contester si elle est injustifiée). Tes congés non pris te sont payés.`;
  } else if (motif === 'retraite') {
    // T-109 (correction 6) : CCN 121.2 et annexe 4, art. 4.2 : l'indemnité conventionnelle de départ volontaire à la retraite
    // « est versée au salarié par l'organisme assureur » et « ne saurait en aucun cas constituer une obligation incombant
    // personnellement au particulier employeur ». Réserve de l'arrêté d'extension (D1237-1, D1237-2 « dans le cas où elles
    // seraient plus avantageuses ») : l'indemnité légale suppose 10 ans chez le même employeur et vaut un demi-mois à 10 ans
    // (D1237-1) ; celle de l'annexe 4 vaut au moins un mois dès 10 ans d'emploi dans la branche, sur le salaire de
    // référence le plus favorable (art. 2.2, 4.1, 4.2) : elle est toujours plus avantageuse ; rien n'est dû par les parents.
    ruptureExplication = 'Départ à la retraite : pas d’indemnité de rupture des parents. L’indemnité de départ volontaire à la retraite (un mois de salaire brut à partir de 10 ans de travail chez des particuliers employeurs, plus au-delà de 15, 20 et 30 ans) est versée par l’organisme assureur de la branche, pas par les parents (convention, article 121.2 et annexe 4). Demande-la à cet organisme, à partir du lendemain de la fin du contrat.';
  } else if (motif === 'deces_am') {
    // T-109 (correction 6) : CCN 63.3.2 : rupture « à la date du décès du salarié » ; versement aux ayants droit « du dernier
    // salaire dû au jour du décès » et de l'indemnité de congés payés non rémunérés. Ni préavis (aucune rupture à l'initiative
    // d'une partie, 120), ni indemnité de rupture (121.1 ne vise que le retrait de l'enfant).
    ruptureExplication = 'Décès de l’assistante maternelle : pas d’indemnité de rupture. Ses ayants droit reçoivent le dernier salaire dû au jour du décès et l’indemnité de congés payés non pris (convention, article 63.3.2).';
  } else {
    ruptureExplication = 'Pas d’indemnité pendant la période d’essai.';
  }

  // T-103 : une somme de l'assiette non calculée (donnée à saisir) : l'indemnité de rupture n'est pas donnée, la raison est dite.
  const manqueRupture = [cpManquants ? 'les congés payés, qui ne sont pas calculés' : '', iccpManquante ? 'l’indemnité de congés non pris, qui n’est pas calculée' : '',
    regulNonCalculee ? 'la régularisation de fin de contrat, qui n’est pas calculée : il manque des semaines sans accueil' : ''].filter(Boolean);
  const ruptureAConfirmer = manqueRupture.length > 0 && indemniteRupture > 0;
  if (ruptureAConfirmer) {
    alertes.push(`Indemnité de rupture non calculée : elle ne compte pas encore ${manqueRupture.join(', ni ')}.`);
    indemniteRupture = 0;
    ruptureExplication = 'Non calculée : voir l’encadré plus haut.';
  }

  // T-031 : un cas non géré pendant le contrat fausse les salaires de référence, l'ancienneté retenue ou les congés : aucun
  // montant. T-074 (D1) : contrat avec la fin et la réponse sur le préavis de ce calcul.
  const nonGere = [...refusFin, ...nonGeresPeriode(endCtx.c, ctx.leaves, c.start, dernierJour, 'non')];
  if (nonGere.length) {
    return {
      ancienneteMois: anc, preavisLabel, preavisFin, dernierJour, indemniteRupture: 0, ruptureExplication: 'Non calculée : cas non géré.',
      totalBrut: 0, indemnitePreavis: 0, regularisation: 0, regulMinutes: 0, cpJoursRestants: 0, cpIndemnite: 0, cpDixiemeEnCours: 0,
      cpExplication: 'Non calculés : cas non géré.', manquants, brutsEstimes, alertes, nonGere,
    };
  }
  return {
    ancienneteMois: anc, preavisLabel, preavisFin, ...(periodeDecesFin ? { periodeDecesFin } : {}), dernierJour, indemniteRupture, ruptureExplication, ruptureAConfirmer, totalBrut, brutsEstimes,
    indemnitePreavis, indemnitePreavisExplication,
    regularisation: regularisation_, regulMinutes, cpJoursRestants, cpIndemnite, cpDixiemeEnCours, cpExplication, cpAConfirmer, regularisationNonCalculee, manquants, alertes,
    ...(dispense && icp ? { dispense: { ...dispense, ...icp } } : {}),
    ...(indemniteDueParents ? { indemniteDueParents } : {}),
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
  // T-107 (cas 4) : fins calculées (regles/t107-fins-cdd.md).
  force_majeure: { l: 'Fin avant la date, pour force majeure', sub: 'Un événement imprévisible et irrésistible, extérieur au parent et à toi, rend l’accueil impossible' },
  inaptitude: { l: 'Fin avant la date, pour inaptitude constatée par le médecin du travail' },
  agrement: { l: 'Fin avant la date : mon agrément est suspendu ou retiré', sub: 'Décision du conseil départemental' },
  jeune_vacances: { l: 'CDD d’un jeune pendant ses vacances scolaires ou universitaires', sub: 'À la date de fin prévue' },
  saisonnier: { l: 'CDD saisonnier, à la date de fin prévue', sub: 'Accueil qui revient chaque année aux mêmes saisons. Le CDD d’usage n’existe pas pour une assistante maternelle : à la date de fin, choisis « Le CDD arrive à sa date de fin ».' },
  // Anciennes valeurs (jamais enregistrées, décision D17) : libellés gardés pour la lecture.
  saisonnier_usage: { l: 'CDD saisonnier ou d’usage' },
  autre: { l: 'Autre cas' },
};

/**
 * T-107 (cas 4) : CDD rompu par la suspension ou le retrait de l'agrément (regles/t107-fins-cdd.md). CASF L423-24, al. 2 : « Le
 * particulier employeur qui ne peut plus confier d'enfant à un assistant maternel qu'il employait depuis trois mois au moins, en
 * raison de la suspension ou du retrait de l'agrément de celui-ci […] doit notifier à l'intéressé la rupture du contrat de
 * travail par lettre recommandée avec demande d'avis de réception. Les charges liées à la rupture du contrat de travail
 * consécutives à la suspension ou au retrait de l'agrément ne peuvent être supportées par le particulier employeur. » L'IFC, due
 * ici du seul fait de cette rupture, en est une : pas d'IFC depuis trois mois d'emploi. Avant trois mois, aucun texte ne
 * l'exclut (L1243-10) : IFC due (L1243-8). L'indemnité de congés payés n'est pas une charge de la rupture : elle paie des
 * congés acquis (CCN 67 ; comme pour le CDI, CCN 119.3). Pas de dommages et intérêts : la rupture n'est pas « à l'initiative de
 * l'employeur » (L1243-4) ; elle s'impose (CASF L421-1 : l'AM exerce « après avoir été agréé »).
 */
const IFC_AGREMENT = false;
const MESSAGE_IFC_AGREMENT = 'Pas d’indemnité de fin de contrat : ton agrément est suspendu ou retiré, et les charges de cette rupture ne peuvent pas être payées par le parent (code de l’action sociale et des familles, article L423-24).';
/** IFC due pour cette fin de ce CDD (R-CDD-08 ; T-107 : agrément selon les trois mois d'emploi de L423-24) */
function ifcDue(c: Ctx['c'], fin: FinCdd, dernierJour: ISODate): boolean {
  if (fin === 'agrement') return fullMonthsBetween(c.start, addDays(dernierJour, 1)) < 3;
  return IFC_DUE[fin];
}

/** R-CDD-08 : l'IFC est-elle due ? (table de décision du rapport, une ligne par fin) */
const IFC_DUE: Record<FinCdd, boolean> = {
  terme: true, suite_cdi: false, refus_cdi: false, initiative_am: false, faute_grave: false, essai: false, commun_accord: true, employeur: true,
  // T-107 (cas 4) : L1243-10, 1° (saisonnier), 2° (jeune pendant ses vacances), 4° (force majeure) ; inaptitude : non exclue.
  jeune_vacances: false, saisonnier: false, force_majeure: false, inaptitude: true, agrement: IFC_AGREMENT,
};

/** Raison affichée quand l'IFC n'est pas due (R-CDD-08, textes cités) */
const IFC_NON_DUE: Partial<Record<FinCdd, string>> = {
  jeune_vacances: 'Pas d’indemnité de fin de contrat : CDD conclu avec un jeune pour une période comprise dans ses vacances scolaires ou universitaires (code du travail, article L1243-10, 2°).',
  saisonnier: 'Pas d’indemnité de fin de contrat pour un CDD saisonnier (code du travail, articles L1242-2, 3°, et L1243-10, 1°).',
  force_majeure: 'Pas d’indemnité de fin de contrat quand le CDD est rompu pour force majeure (code du travail, article L1243-10, 4°).',
  agrement: MESSAGE_IFC_AGREMENT,
  suite_cdi: 'Pas d’indemnité de fin de contrat : ton CDD continue en CDI (code du travail, articles L1243-8 et L1243-11).',
  refus_cdi: 'Pas d’indemnité de fin de contrat : tu as refusé un CDI pour le même accueil, à salaire au moins égal (code du travail, article L1243-10, 3°).',
  initiative_am: 'Pas d’indemnité de fin de contrat : le CDD s’arrête avant la date à ta demande (code du travail, article L1243-10, 4°).',
  faute_grave: 'Pas d’indemnité de fin de contrat en cas de faute grave (code du travail, article L1243-10, 4°). À contester si elle est injustifiée.',
  essai: 'Pas d’indemnité de fin de contrat pendant la période d’essai (code du travail, article L1242-11, 4°).',
};

/**
 * T-076 : fins de CDD non gérées. T-107 : plus aucune ; anciennes valeurs (jamais enregistrées) renvoyées vers le bon choix.
 */
export const MESSAGES_FIN_CDD_NON_GEREE: Record<FinCddNonGere, string> = {
  saisonnier_usage: 'Choisis de nouveau comment finit le CDD : « CDD saisonnier », ou, à la date de fin, « Le CDD arrive à sa date de fin » (le CDD d’usage n’existe pas pour une assistante maternelle : code du travail, article D1242-1).',
  autre: 'Choisis de nouveau comment finit le CDD dans la liste (agrément suspendu ou retiré, force majeure, inaptitude…).',
};

/** T-107 (cas 4) : questions de l'écran Fin d'un CDD rompu pour force majeure (C. trav. L1243-4, al. 2) */
export const QUESTION_SINISTRE = 'La force majeure est-elle un sinistre (incendie, inondation, tempête…) ?';
export const MESSAGE_SINISTRE_A_REPONDRE = `Fin du CDD pour force majeure : ${QUESTION_SINISTRE.toLowerCase()} Si oui, le parent te doit une indemnité égale aux salaires que tu aurais touchés jusqu’à la date de fin prévue (code du travail, article L1243-4). Réponds à la question.`;
export const MESSAGE_TERME_SINISTRE = 'CDD de remplacement sans date de fin précise, rompu pour un sinistre : indique la date à laquelle la personne remplacée devait revenir. L’indemnité couvre les salaires jusqu’à cette date (code du travail, articles L1242-7 et L1243-4).';

export const MESSAGE_CDD_PAS_DE_PREAVIS = 'À la fin d’un CDD, il n’y a ni préavis ni indemnité de rupture.';
export const MESSAGE_CDD_DOCUMENTS = 'Ton employeur te remet le certificat de travail, l’attestation France Travail et le reçu pour solde de tout compte.';
export const MESSAGE_CDD_IFC = 'Tu touches une indemnité de fin de contrat : 10 % de tous tes salaires bruts du CDD. Les indemnités d’entretien, de repas et de kilomètres ne comptent pas.';
export const MESSAGE_CDD_ICCP = 'Tes congés non payés te sont payés à la fin. Cette indemnité compte aussi l’indemnité de fin de contrat.';
/** T-103 (D10) : durée d'essai du CDD à saisir */
export const MESSAGE_CDD_ESSAI_A_SAISIR = 'Fin pendant la période d’essai : indique dans le contrat le dernier jour de la période d’essai écrite au contrat (convention, article 41.1). L’app vérifie qu’il respecte la loi (code du travail, article L1242-10) et calcule la fin dès que c’est saisi.';
export const MESSAGE_CDD_DOMMAGES = 'Le parent a mis fin au CDD avant la date, sans faute grave : il peut te devoir aussi des dommages et intérêts, au moins les salaires jusqu’à la date prévue (code du travail, article L1243-4). L’app ne les calcule pas : vois-les avec un conseil (relais petite enfance, DREETS, avocat).';

/** Montant possible d'un élément de la fin : de `lo` (part sûre) à `hi` ; `inconnu` : aucun montant ne peut être donné */

interface CoeurCdd {
  /** Assiette nette de l'IFC : salaires nets du CDD, congés versés et régularisation (part basse) compris */
  netCdd: number;
  /** Salaires nets des mois du CDD, congés versés compris, sans régularisation */
  salairesNet: number;
  manquants: Month[];
  incomplets: string[];
  regul: number;
  regulInconnu?: string;
  regulMinutes: number;
  ifc: number;
  ifcInconnu?: string;
  iccp: number;
  iccpInconnu?: string;
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
  let netCdd = 0, cpPayeNet = 0;
  const manquants: Month[] = [];
  const incomplets = new Set<string>();
  for (const m of monthsBetween(monthOf(c.start), dernierMois)) {
    const b = monthBase(endCtx, m);
    if (!b.active) continue;
    if (b.missing) { manquants.push(m); continue; }
    const cp = cpForMonth(endCtx, m, enfants);
    netCdd += b.net + cp.indemnite + cp.complement;
    cpPayeNet += cp.indemnite + cp.complement;
    // T-103 : une indemnité de congés non calculée (donnée à saisir) laisse l'assiette incomplète : IFC non calculée.
    if (cp.aConfirmer) incomplets.add('l’indemnité de congés payés, qui n’est pas calculée');
  }
  if (manquants.length) alertes.push(`Historique incomplet : ${manquants.length} mois sans bulletin. Ajoute les bulletins manquants dans l’historique pour un calcul juste.`);

  // Étape 2 : régularisation (R-CDD-09, R-FIN-11). 52 semaines : aucune (R-CDD-11). 46 semaines ou moins : art. 109.2 et 124.
  // T-103 (F12) : mode 46 semaines, avec la régularisation de l'art. 124 (CCN 97.1 et 109.2 ; L1242-14).
  let regul = 0;
  let regulInconnu: string | undefined;
  let regulMinutes = 0;
  if (termsAt(c, dernierJour).yearType === 'incomplete') {
    const regStart = regulStart(c, addDays(dernierJour, 1));
    let manque = semainesSansAccueilManquantes(c, regStart, dernierJour);
    let debut = c.start;
    while (addMonthsToDate(debut, 12) <= dernierJour) debut = addMonthsToDate(debut, 12);
    const { attendu, saisies } = semainesSansAccueilAnnee(c, debut);
    if (debut >= regStart && attendu > 0 && saisies === 0) manque += attendu;
    if (manque > 0) {
      regulInconnu = `Régularisation non calculée : il manque ${manque} semaine${manque > 1 ? 's' : ''} sans accueil dans le contrat. Saisis-les d’abord.`;
      incomplets.add('la régularisation, qui n’est pas calculée');
    } else {
      const reg = regularisation(endCtx, regStart, dernierJour);
      regulMinutes = reg.minutes;
      regul = reg.montant;
    }
  }
  const salairesNet = netCdd;
  netCdd += regul;

  // Étape 4 : IFC nette = arrondi(10 % × assiette nette) (R-CDD-07, direction T-076), si elle est due (R-CDD-08).
  // T-103 (F10, décision du DG du 24/11/2026) : sans l'indemnité de congés non pris (circulaire DRT n° 18/90, § 4.2.3 ; Urssaf).
  const due = ifcDue(c, finCdd, dernierJour);
  const ifc = due ? Math.round(netCdd / 10) : 0;
  const ifcInconnu = due && incomplets.size ? `Indemnité de fin de contrat non calculée : elle ne compte pas encore ${joindreNi([...incomplets])}.` : undefined;

  // Étape 5 : ICCP (R-CDD-10), IFC dans la base du dixième de la dernière période, plancher L1242-16.
  // T-103 (F9) : CCN 48.1.1.5, « le montant le plus avantageux pour le salarié sera retenu » (dixième ou maintien), pour
  // chaque période ; CCN 67 et 123 valent pour tout contrat ; L1242-14 (égalité CDD et CDI) ; L1242-16 n'est qu'un minimum.
  let iccp = 0;
  let iccpInconnu: string | undefined;
  let cpJours = 0, cpDixiemeEnCours = 0;
  let cpExplication = `${MESSAGE_CDD_ICCP} L’app retient le plus favorable du dixième et du maintien de salaire, pour chaque période (convention, article 48.1.1.5).`;
  if (finCdd === 'suite_cdi') {
    // L1242-16, al. 3 : « sauf si le contrat à durée déterminée se poursuit par un contrat de travail à durée indéterminée ».
    cpExplication = 'Pas d’indemnité de congés non pris : ton CDD continue en CDI, tes congés restent acquis (code du travail, article L1242-16).';
  } else if (c.accueilOccasionnel) {
    // T-104 (cas 2, R-OCC-10) : accueil occasionnel en CDD. Congés versés au terme de chaque accueil (CCN 102.1.2.3) ; à la fin,
    // seul le minimum de L1242-16 peut rester dû : le dixième de toute la rémunération du CDD, indemnité de fin de contrat
    // comprise, moins les congés déjà versés.
    const plancher = Math.round((netCdd + ifc) / 10);
    iccp = Math.max(0, plancher - cpPayeNet);
    cpExplication = iccp
      ? 'Accueil occasionnel : tes congés (10 % des salaires) sont versés à la fin de chaque accueil. Le code du travail (article L1242-16) fixe un minimum : le dixième de tous les salaires du CDD, indemnité de fin de contrat comprise. Le reste t’est dû à la fin.'
      : 'Accueil occasionnel : tes congés (10 % des salaires) sont versés à la fin de chaque accueil. Rien de plus à la fin du CDD.';
  } else {
    const y = cpPeriodStartYear(dernierJour);
    const cpt = compteur(endCtx, dernierJour, enfants);
    const acq = acquisition(endCtx, y, enfants);
    const bd = baseDixieme(endCtx, y, enfants);
    const restantsPrec = Math.max(0, cpt.reste);
    cpJours = acq.joursADate + restantsPrec;
    cpDixiemeEnCours = Math.round((bd.base + regul + ifc) / 10);
    // Période précédente (CDD à cheval sur le 1er juin, D10) : le plus favorable du dixième et du maintien des jours acquis,
    // moins ce qui est déjà versé pour elle pendant le CDD (indemnités et compléments depuis le 1er juin ; en année complète,
    // maintien des jours pris, payé dans le salaire).
    const juin = `${y}-06` as Month;
    const complete = termsAt(c, dernierJour).yearType === 'complete';
    let prec = 0;
    const yPrec = y - 1;
    if (yPrec >= cpPeriodStartYear(c.trackedFrom) && `${y}-05-31` >= c.start) {
      const indP = indemnite(endCtx, yPrec, enfants);
      if (indP.aConfirmer) iccpInconnu = `Indemnité de congés non pris non calculée. ${indP.aConfirmer.message}`;
      else if (indP.manquants.length) iccpInconnu = 'Indemnité de congés non pris non calculée : des mois de la période de congés précédente n’ont pas de bulletin. Ajoute-les dans l’historique.';
      else if (indP.jours > 0) {
        let paye = 0;
        for (const m of monthsBetween(juin, dernierMois)) { const k = cpForMonth(endCtx, m, enfants); paye += k.indemnite + k.complement; }
        // T-104 (cas 4, relecture T-076 R3) : planning variable, les jours pris ont été payés par le salaire mensualisé.
        const pv = pvActif(termsAt(c, dernierJour)) && !!indP.pv;
        if (complete) paye += pv ? verseDansSalairePV(endCtx, Math.min(cpt.pris, cpt.aPrendre), dernierJour) : maintien(endCtx, cpt.pris, dernierJour);
        // Planning variable : indemnité de la période précédente calculée sur cette période (maintien C1 de la période, T-103 C13).
        prec = Math.max(0, (pv ? indP.montant : Math.max(indP.dixieme, maintien(endCtx, indP.jours, `${y}-06-01`))) - paye);
      }
    }
    if (!iccpInconnu) {
      if (cpt.decompteAConfirmer.length) iccpInconnu = `Indemnité de congés non pris non calculée. ${cpt.decompteAConfirmer.join(' ')}`;
      else if (acq.aConfirmer) iccpInconnu = `Indemnité de congés non pris non calculée. ${acq.aConfirmer.message}`;
      else if (bd.aConfirmer || bd.manquants.length) iccpInconnu = 'Indemnité de congés non pris non calculée : la base du dixième contient une indemnité de congés non calculée ou des mois sans bulletin.';
      else if (regulInconnu) iccpInconnu = `Indemnité de congés non pris non calculée : la régularisation, qui entre dans sa base, n’est pas calculée.`;
    }
    if (!iccpInconnu) {
      iccp = Math.max(cpDixiemeEnCours, maintien(endCtx, acq.joursADate, dernierJour)) + prec;
      // Plancher L1242-16 : « ne peut être inférieur au dixième de la rémunération totale brute perçue par le salarié pendant
      // la durée de son contrat ». T-103 (lecture de la finalité du texte, signalée au DG) : le total des congés payés pour le
      // CDD atteint au moins ce dixième ; les congés déjà payés en sont déduits (indemnités et compléments versés, et en année
      // complète le maintien des jours pris, payé dans le salaire). CDD suivi après son début : jours pris avant le suivi demandés.
      const plancher = Math.round((netCdd + ifc) / 10);
      const prisSuivis = cpPrisEntre(endCtx, c.trackedFrom > c.start ? c.trackedFrom : c.start, dernierJour).length;
      const suiviTardif = c.trackedFrom > c.start;
      const prisAvant = suiviTardif ? c.cddCpPrisAvantSuivi : 0;
      const dansSalaire = complete && prisAvant !== undefined
        ? (pvActif(termsAt(c, dernierJour)) ? verseDansSalairePV(endCtx, prisSuivis + prisAvant, dernierJour) : maintien(endCtx, prisSuivis + prisAvant, dernierJour))
        : 0;
      if (iccp + cpPayeNet + dansSalaire < plancher) {
        if (prisAvant === undefined) {
          iccpInconnu = `Indemnité de congés non pris non calculée : l’app suit ton CDD depuis le ${shortDate(c.trackedFrom)}. Indique dans le contrat les jours de congés payés pris pendant le CDD avant cette date (0 si aucun) : le minimum du code du travail (article L1242-16) compte les congés déjà payés.`;
          iccp = 0;
        } else {
          iccp = plancher - cpPayeNet - dansSalaire;
          cpExplication = `${cpExplication} Le code du travail (article L1242-16) fixe un minimum : le dixième de tous les salaires du CDD, indemnité de fin de contrat comprise, moins les congés déjà payés. Il s’applique ici.`;
        }
      }
    }
  }
  return { netCdd, salairesNet, manquants, incomplets: [...incomplets], regul, regulInconnu, regulMinutes, ifc, ifcInconnu, iccp, iccpInconnu, cpJours, cpDixiemeEnCours, cpExplication, alertes };
}

const joindreNi = (l: string[]) => (l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} ni ${l.at(-1)}`);

/**
 * T-076 : fin d'un CDD. `dernierJour` : dernier jour du contrat (date de fin réelle, report de L1243-7 compris).
 * `finCdd` : façon dont le CDD finit (R-CDD-08). Ni préavis ni indemnité de rupture (R-CDD-06). Ordre R-CDD-09.
 * P1 et P2 : les deux lectures du salaire sont calculées ; pour chaque somme, la part sûre (la plus basse) est donnée, l'écart
 * est « à confirmer », hors du total. P3 et P4 : même principe sur l'ICCP et l'IFC.
 * `motifCdi` : motif de CDI reçu pour un CDD (refusé).
 */
export function finDeCdd(ctx: Ctx, dernierJour: ISODate, finCdd: FinCdd | FinCddNonGere | undefined, enfants = 0, motifCdi?: Motif,
  reponses?: Pick<Rupture, 'sinistre' | 'termeSinistre'>): FinResult {
  const c = ctx.c;
  const sinistre = reponses ? reponses.sinistre : c.rupture?.sinistre;
  const termeSinistre = reponses ? reponses.termeSinistre : c.rupture?.termeSinistre;
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
  if (Object.prototype.hasOwnProperty.call(MESSAGES_FIN_CDD_NON_GEREE, finCdd)) return vide([MESSAGES_FIN_CDD_NON_GEREE[finCdd as FinCddNonGere]]);
  // Revue 2 (r1) : une valeur de fin que l'app ne connaît pas n'est jamais calculée comme une fin ordinaire.
  if (!(FINS_CDD as string[]).includes(finCdd)) return vide([`Fin de CDD inconnue de l’app (« ${finCdd} ») : rien n’est calculé. Choisis comment finit le CDD dans la liste.`]);
  const fin = finCdd as FinCdd;
  if (dernierJour < c.start) return vide([`Le dernier jour (${shortDate(dernierJour)}) est avant le début du contrat (${shortDate(c.start)}). Corrige la date.`]);
  const alertes: string[] = [];
  // T-107 (cas 4) : CDD d'un jeune pendant ses vacances et CDD saisonnier : fins au terme, comme `terme`.
  if ((fin === 'terme' || fin === 'jeune_vacances' || fin === 'saisonnier') && c.cddTerme && dernierJour < c.cddTerme) {
    return vide([`Tu as choisi « ${fin === 'terme' ? 'le CDD arrive à sa date de fin' : FIN_CDD_LABEL[fin].l.replace(/, à la date de fin prévue$/, '')} »${fin === 'terme' ? '' : ', une fin à la date prévue'}, mais le dernier jour (${shortDate(dernierJour)}) est avant la ${c.cddTermeImprecis ? 'fin de la durée minimale' : 'date de fin prévue'} (${shortDate(c.cddTerme)}). Choisis comment le CDD s’est arrêté avant la date, ou corrige la date : l’indemnité de fin de contrat en dépend.`]);
  }
  // Décision D9 de la direction (22/11/2026) : cohérence des dates face au terme précis.
  const anticipees: FinCdd[] = ['initiative_am', 'commun_accord', 'employeur', 'faute_grave', 'essai', 'force_majeure', 'inaptitude', 'agrement'];
  if (anticipees.includes(fin) && c.cddTerme && !c.cddTermeImprecis && dernierJour >= c.cddTerme) {
    return vide([`Tu as choisi une fin avant la date, mais le dernier jour (${shortDate(dernierJour)}) est ${dernierJour === c.cddTerme ? 'la' : 'après la'} date de fin prévue (${shortDate(c.cddTerme)}). Au terme, choisis « ${FIN_CDD_LABEL.terme.l} » ; sinon corrige la date.`]);
  }
  // Décision D19 (section 5) : C. trav. L1242-10, l'essai d'un CDD ne dépasse jamais un mois (« dans la limite de deux
  // semaines lorsque la durée initialement prévue au contrat est au plus égale à six mois et d'un mois dans les autres cas »).
  // Un dernier jour à un mois du début ou plus est hors essai à coup sûr : refusé (R-CDD-12 ; l'app ne connaît pas la durée
  // d'essai écrite au contrat, elle ne contrôle que cette limite sûre).
  // N1 (relecture 2) : limite de deux semaines pour un CDD de six mois ou moins, d'un mois sinon, et un jour par semaine ;
  // entre les deux façons de compter les semaines, refus avec message (aucun texte ne tranche).
  // T-107 (cas 7, regles/t107-essai-cdd.md) : le maximum légal est celui des semaines entières (`court`). L1242-10 : l'essai « ne
  // peut excéder une durée calculée à raison d'un jour par semaine » : au plus un septième de la durée du contrat. L'essai se
  // compte en jours calendaires entiers (Cass. soc. 28/04/2011, n° 09-72.165, publié) : le plus grand nombre de jours qui ne
  // dépasse pas ce septième est celui des semaines entières ; compter la semaine commencée donnerait plus d'un jour par semaine.
  // Un essai écrit plus long ne vaut pas au-delà (Cass. soc. 11/06/1987, n° 84-41.299, publié) ; une rupture après le maximum
  // légal n'est pas une rupture pendant l'essai (Cass. soc. 07/03/2000, n° 97-44.486, publié).
  const essai = fin === 'essai' ? finEssaiCdd(c) : undefined;
  if (fin === 'essai' && (dernierJour >= addMonthsToDate(c.start, 1) || (essai && dernierJour > essai.court))) {
    const max = essai && essai.court < addDays(addMonthsToDate(c.start, 1), -1) ? essai.court : addDays(addMonthsToDate(c.start, 1), -1);
    const ecritPlusLong = !!(c.cddEssaiFin && c.cddEssaiFin > max);
    return vide([`Tu as choisi « ${FIN_CDD_LABEL.essai.l} », mais le dernier jour (${shortDate(dernierJour)}) est après la fin possible de la période d’essai (au plus tard le ${shortDate(max)}). L’essai d’un CDD compte un jour par semaine entière, au plus deux semaines si le CDD dure six mois ou moins, un mois sinon (code du travail, article L1242-10).${ecritPlusLong ? ` Ton contrat prévoit un essai jusqu’au ${shortDate(c.cddEssaiFin!)} : la partie au-delà du ${shortDate(max)} ne vaut pas (Cour de cassation, 11/06/1987 et 07/03/2000).` : ''} Ce n’est donc pas une fin pendant l’essai : choisis comment le CDD a fini (à ta demande, voulue par le parent…), ou corrige la date. L’indemnité de fin de contrat en dépend.`]);
  }
  // T-103 (D10) : CCN 41.1, la durée de l'essai est écrite au contrat : l'app la demande une fois (B). Un dernier jour après
  // l'essai écrit n'est pas une fin pendant l'essai. T-107 (cas 7) : le cas C (semaine commencée) est tranché plus haut.
  if (fin === 'essai' && !c.cddEssaiFin) {
    return vide([MESSAGE_CDD_ESSAI_A_SAISIR]);
  }
  if (fin === 'essai' && c.cddEssaiFin && dernierJour > c.cddEssaiFin) {
    return vide([`Tu as choisi « ${FIN_CDD_LABEL.essai.l} », mais le dernier jour (${shortDate(dernierJour)}) est après la fin de la période d’essai écrite au contrat (${shortDate(c.cddEssaiFin)}). Choisis comment le CDD a fini, ou corrige la date : l’indemnité de fin de contrat en dépend.`]);
  }

  if (fin !== 'suite_cdi' && c.cddTerme && !c.cddTermeImprecis && dernierJour > c.cddTerme) {
    // C. trav. L1243-11 : « Lorsque la relation contractuelle de travail se poursuit après l'échéance du terme du contrat à
    // durée déterminée, celui-ci devient un contrat à durée indéterminée. » Un report écrit du terme (L1243-7, renouvellement)
    // change la date de fin prévue du contrat.
    return vide([`Le dernier jour (${shortDate(dernierJour)}) est après la date de fin prévue du CDD (${shortDate(c.cddTerme)}). Si la date a été reportée (renouvellement écrit, ou retour de la personne remplacée : code du travail, article L1243-7), mets la nouvelle date de fin prévue dans le contrat. Sinon, si tu as continué à travailler après la date sans nouveau contrat, ton CDD est devenu un CDI (code du travail, article L1243-11) : l’app ne calcule pas ce cas comme une fin de CDD.`]);
  }
  // T-107 (cas 4) : force majeure, sinistre (L1243-4, al. 2) : réponse demandée une fois ; sans terme précis, la date prévue
  // du retour de la personne remplacée aussi (L1242-7 : le CDD a pour terme la fin de l'absence).
  let periodeSinistre: { du: ISODate; au: ISODate } | undefined;
  if (fin === 'force_majeure') {
    if (sinistre === undefined) return vide([MESSAGE_SINISTRE_A_REPONDRE]);
    if (sinistre) {
      const terme = c.cddTermeImprecis ? termeSinistre : c.cddTerme;
      if (!terme) return vide([c.cddTermeImprecis ? MESSAGE_TERME_SINISTRE : 'CDD sans date de fin prévue : indique-la dans le contrat.']);
      if (terme <= dernierJour) return vide([`La date de fin prévue (${shortDate(terme)}) n’est pas après le dernier jour (${shortDate(dernierJour)}) : vérifie les dates. L’indemnité du sinistre couvre les salaires entre les deux.`]);
      periodeSinistre = { du: addDays(dernierJour, 1), au: terme };
    }
  }
  const endCtx: Ctx = { ...ctx, c: { ...c, end: dernierJour }, cache: new Map(), finControlee: true };
  const nonGere = nonGeresPeriode(endCtx.c, ctx.leaves, c.start, dernierJour, 'non');
  if (nonGere.length) return vide(nonGere);

  // T-103 (F11, F12) : une seule lecture du salaire du CDD : mensualisé (CCN 108.1, L1242-14) et mode 46 semaines avec la
  // régularisation de l'art. 124 (CCN 97.1, 109.2).
  const l1 = coeurCdd(endCtx, dernierJour, fin, enfants);
  for (const a of l1.alertes) if (!alertes.includes(a)) alertes.push(a);
  // Décision D8 (22/11/2026) : suite en CDI, ni régularisation de fin ni ICCP (L1243-11 : même contrat ; CCN 124).
  const reg = fin === 'suite_cdi' ? { valeur: 0 } : { valeur: l1.regulInconnu ? 0 : l1.regul, inconnu: l1.regulInconnu };
  const ifc = { valeur: l1.ifcInconnu ? 0 : l1.ifc, inconnu: l1.ifcInconnu };
  const iccp = { valeur: l1.iccpInconnu ? 0 : l1.iccp, inconnu: l1.iccpInconnu };
  const assiette = l1.netCdd;
  const finMois = lastDay(monthOf(dernierJour));
  // Brut affiché seulement, dérivé du net (rapport fixe de l'app).
  const brutCdd = brutDuNet(c, assiette, finMois);
  const due = ifcDue(c, fin, dernierJour);
  const ifcNet = ifc.valeur;
  const ifcExplication = !due
    ? IFC_NON_DUE[fin as keyof typeof IFC_NON_DUE]
    : ifc.inconnu ? 'Non calculée : voir l’encadré plus haut.'
      : `10 % de ${euros(assiette)} de salaires nets du CDD (code du travail, article L1243-8 ; l’Urssaf la fait déclarer et payer en net). Les indemnités d’entretien, de repas et de kilomètres ne comptent pas.`;
  if (fin === 'employeur') alertes.push(MESSAGE_CDD_DOMMAGES);
  // T-107 (cas 4) : C. trav. L1243-4, al. 2 : « Lorsque ce contrat est rompu avant l'échéance du terme en raison d'un sinistre
  // relevant d'un cas de force majeure, le salarié a également droit à une indemnité compensatrice dont le montant est égal aux
  // rémunérations qu'il aurait perçues jusqu'au terme du contrat. » Rémunérations : salaire mensualisé de chaque mois, au prorata
  // de l'art. 111 pour un mois partiel (même calcul que l'indemnité compensatrice de préavis, CCN 122). Hors de la base des
  // congés et de l'IFC : elle couvre une période après le contrat (L1242-16 et CCN 48.1.1.5 comptent la rémunération « pendant la
  // durée de son contrat » ou de la période de référence, qui finit avec le contrat : CCN 48.1.1.1).
  let indemniteSinistre: FinResult['indemniteSinistre'];
  if (periodeSinistre) {
    indemniteSinistre = { ...periodeSinistre, net: icpDispense({ ...c, end: undefined, rupture: undefined }, periodeSinistre.du, periodeSinistre.au).net };
    alertes.push(`Sinistre : le parent te verse une indemnité égale aux salaires que tu aurais touchés du ${shortDate(periodeSinistre.du)} au ${shortDate(periodeSinistre.au)}, date de fin prévue du CDD : ${euros(indemniteSinistre.net)} net (code du travail, article L1243-4). Elle s’ajoute aux sommes de la fin.`);
  }
  if (fin === 'force_majeure') alertes.push('Force majeure : un événement imprévisible, irrésistible et extérieur aux deux parties rend l’accueil impossible. Si le parent invoque la force majeure sans que ce soit le cas, la rupture lui ouvre des dommages et intérêts pour toi (code du travail, article L1243-4) : renseigne-toi (relais petite enfance, DREETS).');
  if (fin === 'agrement') alertes.push(`Agrément suspendu ou retiré : tu ne peux plus accueillir l’enfant (code de l’action sociale et des familles, article L421-1). Le parent te notifie la rupture par lettre recommandée${due ? '' : ' ; les charges de cette rupture ne sont pas pour lui (article L423-24)'}. Pas de dommages et intérêts. Tes congés non pris te sont payés.`);
  if (fin === 'inaptitude') alertes.push('Inaptitude constatée par le médecin du travail : le CDD peut être rompu avant la date (code du travail, article L1243-1). Pas de dommages et intérêts (article L1243-4), mais l’indemnité de fin de contrat est due.');
  if (fin === 'jeune_vacances') alertes.push('Ce cas ne vaut que si le CDD a été conclu avec toi pendant tes vacances scolaires ou universitaires, alors que tu fais tes études (code du travail, article L1243-10, 2°).');
  if (fin === 'saisonnier') alertes.push('Un CDD saisonnier porte sur des tâches qui reviennent chaque année à des dates à peu près fixes, selon les saisons (code du travail, article L1242-2, 3°). Sinon, c’est une fin au terme : l’indemnité de fin de contrat est due.');
  if (fin === 'suite_cdi') alertes.push('Ton CDD continue en CDI : dans l’app, ne termine pas ce contrat. Ouvre-le et passe-le en CDI. Tu gardes l’ancienneté du CDD (code du travail, article L1243-11) : elle compte pour le préavis et l’indemnité de rupture du CDI, et les salaires du CDD restent dans ceux du contrat.');
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
    cpJoursRestants: l1.cpJours, cpIndemnite: iccp.valeur, cpDixiemeEnCours: l1.cpDixiemeEnCours,
    cpExplication: iccp.inconnu ? 'Non calculée : voir l’encadré plus haut.' : l1.cpExplication,
    ...(iccp.inconnu ? { cpAConfirmer: iccp.inconnu } : {}),
    alertes,
    cdd: true, finCdd: fin, ifc: brutDuNet(c, ifcNet, finMois), ifcNet, ifcExplication, brutCdd, assietteNetteCdd: assiette,
    ...(ifc.inconnu ? { ifcAConfirmer: ifc.inconnu } : {}),
    ...(indemniteSinistre ? { indemniteSinistre } : {}),
    declaration: due && ifc.valeur > 0 ? [{ champ: 'mntIndPrecarite', libelle: 'Indemnité de précarité', net: ifcNet, hint: 'Montant net. Elle ne correspond à aucune heure : ne l’ajoute ni aux heures ni aux jours.' }] : [],
  };
}
