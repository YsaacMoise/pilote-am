// Simulateur d'accueil : ce que coûte une assistante maternelle à une famille, avant et après les aides.
// Règles et sources : docs/simulateur-regles.md (vérifiées le 1er novembre 2026).
// Montants en centimes entiers. Aucune donnée personnelle : tout est calculé sur le téléphone.
import type { ISODate } from './dates';
import type { Contract, Planning } from './model';
import { salaireMensualise } from './payroll';
import { entretienPlancher, ratesAt } from './rates';

/** Paramètres du CMG « emploi direct » d'une assistante maternelle (CSS D531-18, décret 2025-515), datés. */
interface CmgParams {
  from: ISODate;
  /** Plafond horaire du coût pris en compte (centimes) */
  plafondHoraire: number;
  /** Coût horaire de référence (centimes) */
  coutReference: number;
  /** Plancher de ressources mensuelles (euros) */
  plancher: number;
  /** Plafond de ressources mensuelles (euros) */
  plafond: number;
}

const CMG: CmgParams[] = [
  { from: '2025-09-01', plafondHoraire: 800, coutReference: 485, plancher: 815, plafond: 8500 },
  // Revalorisation au 1er avril 2026 (évolution du SMIC) ; plancher recalculé sur le RSA d'avril 2026.
  { from: '2026-04-01', plafondHoraire: 809, coutReference: 491, plancher: 821, plafond: 8500 },
];

export function cmgParams(d: ISODate): CmgParams {
  let p = CMG[0];
  for (const x of CMG) if (x.from <= d) p = x;
  return p;
}

/**
 * Cotisations sociales d'une assistante maternelle, datées.
 * Mesurées le 1er novembre 2026 sur le simulateur officiel Urssaf/Pajemploi (calculerResteACharge) :
 * total = 83,75 % du net + 5,00 € par mois (86,86 % en Alsace-Moselle), soit sur le brut
 * 21,88 % salariales (23,18 % en Alsace-Moselle) + 43,547 % patronales + 5 € fixes.
 */
interface CotisParams {
  from: ISODate;
  /** Cotisations salariales, en fraction du brut */
  salariale: number;
  /** Idem en Alsace-Moselle (régime local d'assurance maladie, +1,30 %) */
  salarialeAlsaceMoselle: number;
  /** Cotisations patronales, en fraction du brut */
  patronale: number;
  /** Part fixe mensuelle (centimes) */
  fixeMois: number;
  /** Réduction de cotisations salariales sur les heures majorées (CSS L241-17, décret 2019-40) */
  reductionHeuresMajorees: number;
}

const COTIS: CotisParams[] = [
  { from: '2025-01-01', salariale: 0.2188025, salarialeAlsaceMoselle: 0.2318025, patronale: 0.43547, fixeMois: 500, reductionHeuresMajorees: 0.1131 },
];

export function cotisParams(d: ISODate): CotisParams {
  let p = COTIS[0];
  for (const x of COTIS) if (x.from <= d) p = x;
  return p;
}

/** Part du net dans le brut, selon le lieu de travail de l'assistante maternelle */
export function ratioNet(d: ISODate, alsaceMoselle: boolean): number {
  const p = cotisParams(d);
  return 1 - (alsaceMoselle ? p.salarialeAlsaceMoselle : p.salariale);
}

/**
 * Cotisations sociales d'un mois (salariales et patronales), à partir du net déclaré (centimes).
 * `reduction` : réduction de cotisations salariales des heures majorées, déjà calculée.
 */
export function cotisationsDuMois(netDeclare: number, d: ISODate, alsaceMoselle: boolean, reduction = 0): number {
  if (netDeclare <= 0) return 0;
  const p = cotisParams(d);
  const salariale = alsaceMoselle ? p.salarialeAlsaceMoselle : p.salariale;
  const brut = netDeclare / (1 - salariale);
  return Math.round(brut * (salariale + p.patronale) + p.fixeMois) - reduction;
}

/** Taux d'effort horaire (assistante maternelle), en fraction des ressources mensuelles. */
const TAUX_EFFORT = [0.000619, 0.000516, 0.000413, 0.00031, 0.000206];

/** Rang du barème : 1, 2, 3, 4 à 7, 8 et plus. Chaque enfant ouvrant droit à l'AEEH fait descendre d'un rang. */
export function tauxEffort(enfantsACharge: number, enfantsAeeh = 0): number {
  const n = Math.max(1, Math.round(enfantsACharge));
  const rang = n <= 3 ? n - 1 : n <= 7 ? 3 : 4;
  return TAUX_EFFORT[Math.min(TAUX_EFFORT.length - 1, rang + Math.max(0, Math.round(enfantsAeeh)))];
}

export interface CmgCalc {
  /** Montant du CMG (centimes) */
  montant: number;
  /** Coût retenu, dans la limite du plafond horaire */
  coutRetenu: number;
  /** Ressources retenues (euros) */
  ressources: number;
  taux: number;
  /** Participation de la famille par heure, avant plafond (centimes) */
  participationHoraire: number;
  /** Coût horaire réel (centimes) */
  coutHoraire: number;
  /** Le coût horaire dépasse le plafond : une partie des cotisations reste à la charge de la famille */
  depassePlafond: boolean;
  /**
   * Part des cotisations prise en charge par la CAF (CSS D531-17 I) : 1 sous le plafond,
   * sinon plafond × heures ÷ coût, arrondi au centième supérieur (mesuré sur le simulateur Urssaf).
   */
  partCotisations: number;
  params: CmgParams;
}

/**
 * CMG d'un mois (D531-18) : coût × (1 − ressources × taux d'effort ÷ coût horaire de référence), jamais négatif.
 * `cout` : salaire net + entretien + repas du mois (centimes). `heures` : heures payées dans le mois.
 * `ressourcesMois` : ressources mensuelles connues de la CAF, en euros.
 */
export function calculCmg(cout: number, heures: number, ressourcesMois: number, enfantsACharge: number, enfantsAeeh: number, d: ISODate): CmgCalc {
  const params = cmgParams(d);
  const ressources = Math.min(params.plafond, Math.max(params.plancher, Math.round(ressourcesMois)));
  const taux = tauxEffort(enfantsACharge, enfantsAeeh);
  const plafondMois = params.plafondHoraire * heures;
  const coutRetenu = Math.min(cout, Math.round(plafondMois));
  const part = (ressources * 100 * taux) / params.coutReference; // part restant à la famille sur le coût retenu
  const montant = Math.max(0, Math.round(coutRetenu * (1 - part)));
  const coutHoraire = heures > 0 ? Math.round(cout / heures) : 0;
  const partCotisations = cout > plafondMois && cout > 0 ? Math.ceil((plafondMois / cout) * 100 - 1e-9) / 100 : 1;
  return {
    montant, coutRetenu, ressources, taux, params, coutHoraire, partCotisations,
    participationHoraire: Math.round(ressources * 100 * taux),
    depassePlafond: partCotisations < 1,
  };
}

/** Crédit d'impôt garde d'enfant hors du domicile (CGI 200 quater B) : 50 % des dépenses, 3 500 € par enfant au plus. */
export const CREDIT_TAUX = 0.5;
export const CREDIT_PLAFOND_DEPENSES = 350000;
/** Forfait d'entretien retenu par jour de garde (BOFiP BOI-IR-RICI-300 §150) */
export const CREDIT_FORFAIT_ENTRETIEN_JOUR = 265;

/**
 * Dépenses retenues : salaires nets de l'année + 2,65 € par jour de garde + cotisations restées à la charge
 * de la famille − CMG (BOFiP §135 à §150, brochure IR 2026). Les repas sont exclus.
 */
export function creditImpot(netAnnuel: number, joursAnnuels: number, cmgAnnuel: number, cotisationsAnnuelles = 0): { depenses: number; credit: number } {
  const depenses = Math.max(0, netAnnuel + joursAnnuels * CREDIT_FORFAIT_ENTRETIEN_JOUR + cotisationsAnnuelles - cmgAnnuel);
  return { depenses, credit: Math.round(Math.min(depenses, CREDIT_PLAFOND_DEPENSES) * CREDIT_TAUX) };
}

export type AgeEnfant = 'moins6' | '6a12';

export interface SimInput {
  /** Jours d'accueil par semaine (1 à 6) */
  jours: number;
  /** Heures d'accueil par semaine */
  heures: number;
  yearType: 'complete' | 'incomplete';
  /** Année incomplète : semaines sans accueil en plus des 5 semaines de congés payés */
  semainesAbsence: number;
  /** Majoration des heures au-delà de 45 h par semaine (%) */
  majoration: number;
  /** Salaire horaire brut (centimes), l'unité de la convention collective et du contrat */
  tauxBrut: number;
  /** L'assistante maternelle travaille en Alsace-Moselle (Bas-Rhin, Haut-Rhin, Moselle) : cotisations salariales plus élevées */
  alsaceMoselle: boolean;
  /** Indemnité d'entretien par jour (centimes) ; le minimum légal s'applique s'il est supérieur */
  entretienJour: number;
  /** Prix d'un repas fourni par l'assistante maternelle (centimes) et repas par jour */
  repasPrix: number;
  repasParJour: number;
  /** Famille */
  enfantsACharge: number;
  enfantsAeeh: number;
  age: AgeEnfant;
  parentSeul: boolean;
  /** Ressources mensuelles du foyer (euros) */
  ressourcesMois: number;
}

export interface SimResult {
  /** Semaines payées par an (52 en année complète, ≤ 46 sinon) */
  semaines: number;
  /** Semaines où l'enfant est réellement accueilli (année complète : 52 − 5 semaines de congés de l'AM) */
  semainesGarde: number;
  /** Heures par semaine retenues pour le calcul (après les limites légales) */
  heuresRetenues: number;
  /** Heures payées par mois (minutes) */
  heuresMoisMin: number;
  /** Heures au-delà de 45 h par semaine, par mois (minutes) */
  heuresMajMoisMin: number;
  /** Jours d'accueil par an, et en moyenne par mois */
  joursAn: number;
  joursMois: number;
  /** Minimum légal d'entretien pour une journée moyenne (centimes) */
  entretienMinimum: number;
  entretienJourRetenu: number;
  /** Taux horaire net (centimes), arrondi comme sur le contrat */
  tauxNet: number;
  /** Salaire net mensualisé, tel qu'il est déclaré à Pajemploi */
  salaire: number;
  /** Année incomplète : congés payés de l'année (≈ 10 % du salaire), et leur moyenne par mois */
  congesAnnuels: number;
  congesMois: number;
  /** Réduction de cotisations salariales des heures majorées : versée en plus du salaire net */
  reductionHeuresMaj: number;
  entretien: number;
  repas: number;
  /** À verser à l'assistante maternelle, en moyenne par mois : salaire, congés, réduction, entretien, repas */
  verse: number;
  /** Cotisations sociales du mois (salariales et patronales) */
  cotisations: number;
  /** Part prise en charge par la CAF avec le CMG, et ce qui reste à la famille */
  cotisationsPrisesEnCharge: number;
  cotisationsReste: number;
  /** Coût mensuel moyen avant aides : à verser + cotisations */
  total: number;
  cmgEligible: boolean;
  cmg: CmgCalc;
  /** À payer par la famille, en moyenne par mois, après le CMG (cotisations restantes comprises) */
  reste: number;
  /** Ce que la famille paie par heure, après le CMG (centimes) */
  resteHoraire: number;
  creditEligible: boolean;
  creditAnnuel: number;
  depensesAnnuelles: number;
  /** Coût mensuel réel, crédit d'impôt réparti sur 12 mois */
  reel: number;
  /** Heures maximales par semaine pour ce planning (13 h par jour, 2 250 h par an) */
  heuresMax: number;
  /** Heures saisies au-delà du possible : ramenées au maximum */
  heuresPlafonnees: boolean;
  /** Plus de 48 h par semaine : accord écrit de l'assistante maternelle nécessaire */
  accordNecessaire: boolean;
  sousMinimum: boolean;
  minimumNet: number;
  minimumBrut: number;
}

/** Durée maximale d'une journée d'accueil (11 h de repos quotidien, CASF L423-21) */
export const HEURES_MAX_JOUR = 13;
/** Durée hebdomadaire moyenne au-delà de laquelle l'accord écrit de l'AM est requis (CASF L423-22) */
export const HEURES_SANS_ACCORD = 48;
/** Plafond annuel avec l'accord de l'AM, tous contrats confondus (CASF L423-22) */
export const HEURES_MAX_AN = 2250;

export function semainesAccueil(i: Pick<SimInput, 'yearType' | 'semainesAbsence'>): number {
  return i.yearType === 'complete' ? 52 : Math.min(46, 52 - 5 - Math.max(1, Math.round(i.semainesAbsence)));
}

/** Semaines réellement travaillées : en année complète, les 5 semaines de congés de l'AM sont payées sans accueil. */
export function semainesTravaillees(i: Pick<SimInput, 'yearType' | 'semainesAbsence'>): number {
  return i.yearType === 'complete' ? 47 : semainesAccueil(i);
}

/** Heures maximales par semaine : 13 h par jour et 2 250 h par an, arrondi au quart d'heure inférieur. */
export function heuresMaxSemaine(jours: number, semainesTravail: number): number {
  return Math.min(jours * HEURES_MAX_JOUR, Math.floor((HEURES_MAX_AN / semainesTravail) * 4) / 4);
}

/** Planning régulier équivalent : `jours` journées identiques à partir de 7 h. */
function planningEquivalent(jours: number, minutesSemaine: number): Planning {
  const pl: Planning = {};
  const parJour = Math.round(minutesSemaine / jours);
  const fin = 7 * 60 + parJour;
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  for (let d = 1; d <= jours; d++) pl[d] = [{ start: '07:00', end: hhmm(fin) }];
  return pl;
}

export function simuler(i: SimInput, d: ISODate): SimResult {
  const rates = ratesAt(d);
  const cp = cotisParams(d);
  const jours = Math.max(1, Math.min(6, Math.round(i.jours) || 1));
  const semaines = semainesAccueil(i);
  const semainesGarde = semainesTravaillees(i);
  const heuresMax = heuresMaxSemaine(jours, semainesGarde);
  const heures = Math.max(0, Math.min(heuresMax, i.heures || 0));
  const majoration = Math.max(10, i.majoration);

  // Brut saisi, net calculé et arrondi au centime comme sur le contrat.
  const tauxSalarial = i.alsaceMoselle ? cp.salarialeAlsaceMoselle : cp.salariale;
  const ratio = 1 - tauxSalarial;
  const tauxBrut = Math.max(0, i.tauxBrut || 0);
  const tauxNet = Math.round(tauxBrut * ratio);

  const heuresSemMin = Math.round(heures * 60);
  const c = { yearType: i.yearType, weeks: semaines, planning: planningEquivalent(jours, heuresSemMin), rateNet: tauxNet, majoration } as Contract;
  const salaire = heuresSemMin > 0 ? salaireMensualise(c) : 0;
  const heuresMoisMin = Math.round((heuresSemMin * semaines) / 12);
  const heuresMajMoisMin = Math.round((Math.max(0, heuresSemMin - 45 * 60) * semaines) / 12);
  const joursAn = heuresSemMin > 0 ? jours * semainesGarde : 0;
  const joursMois = joursAn / 12;
  const entretienMinimum = entretienPlancher(d, heuresSemMin / jours);
  const entretienJourRetenu = Math.max(i.entretienJour, entretienMinimum);
  const entretien = Math.round(entretienJourRetenu * joursMois);
  const repas = Math.round(i.repasPrix * i.repasParJour * joursMois);
  // Année incomplète : congés payés en plus du salaire mensualisé (≈ 10 % du salaire de l'année), répartis ici sur 12 mois.
  const congesAnnuels = i.yearType === 'incomplete' ? Math.round(salaire * 12 * 0.1) : 0;
  const congesMois = Math.round(congesAnnuels / 12);

  // Cotisations : sur le brut du mois (salaire et congés), plus la part fixe.
  // Les heures majorées ouvrent une réduction de 11,31 % de leur brut sur les cotisations salariales,
  // reversée à l'assistante maternelle en plus du net déclaré.
  const brutMajMois = ((heuresMajMoisMin / 60) * tauxNet * (1 + majoration / 100)) / ratio;
  const reductionHeuresMaj = Math.round(brutMajMois * cp.reductionHeuresMajorees);
  const cotisations = cotisationsDuMois(salaire + congesMois, d, i.alsaceMoselle, reductionHeuresMaj);

  // CMG : enfant de moins de 6 ans, ou jusqu'à 12 ans pour un parent seul. Le coût aidé est le net déclaré + entretien + repas.
  const cout = salaire + congesMois + entretien + repas;
  const cmgEligible = i.age === 'moins6' || i.parentSeul;
  const cmgCalc = calculCmg(cout, heuresMoisMin / 60, i.ressourcesMois, i.enfantsACharge, i.enfantsAeeh, d);
  const cmg = cmgEligible ? cmgCalc : { ...cmgCalc, montant: 0 };
  const cotisationsPrisesEnCharge = cmgEligible ? Math.round(cotisations * cmgCalc.partCotisations) : 0;
  const cotisationsReste = cotisations - cotisationsPrisesEnCharge;

  const verse = salaire + congesMois + reductionHeuresMaj + entretien + repas;
  const total = verse + cotisations;
  const reste = verse + cotisationsReste - cmg.montant;

  // Crédit d'impôt : enfant de moins de 6 ans au 1er janvier.
  const creditEligible = i.age === 'moins6';
  const { depenses, credit } = creditImpot((salaire + reductionHeuresMaj) * 12 + congesAnnuels, joursAn, cmg.montant * 12, cotisationsReste * 12);
  const creditAnnuel = creditEligible ? credit : 0;

  return {
    semaines, semainesGarde, heuresRetenues: heures, heuresMoisMin, heuresMajMoisMin, joursAn, joursMois, entretienMinimum, entretienJourRetenu,
    tauxNet, salaire, congesAnnuels, congesMois, reductionHeuresMaj, entretien, repas, verse,
    cotisations, cotisationsPrisesEnCharge, cotisationsReste, total,
    cmgEligible, cmg, reste, resteHoraire: heuresMoisMin > 0 ? Math.round(reste / (heuresMoisMin / 60)) : 0,
    creditEligible, creditAnnuel, depensesAnnuelles: creditEligible ? depenses : 0,
    reel: reste - Math.round(creditAnnuel / 12),
    heuresMax,
    heuresPlafonnees: (i.heures || 0) > heuresMax,
    accordNecessaire: heures > HEURES_SANS_ACCORD,
    sousMinimum: tauxBrut < rates.minConvBrut,
    minimumNet: rates.minConvNet, minimumBrut: rates.minConvBrut,
  };
}

/** Valeurs de départ : accueil type au minimum conventionnel. */
export function simulationParDefaut(d: ISODate): SimInput {
  const r = ratesAt(d);
  return {
    jours: 5, heures: 45, yearType: 'complete', semainesAbsence: 1, majoration: 10,
    tauxBrut: r.minConvBrut, alsaceMoselle: false, entretienJour: 0, repasPrix: 0, repasParJour: 1,
    enfantsACharge: 1, enfantsAeeh: 0, age: 'moins6', parentSeul: false, ressourcesMois: 3500,
  };
}
