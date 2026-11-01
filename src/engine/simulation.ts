// Simulateur d'accueil : ce que coûte une assistante maternelle à une famille, avant et après les aides.
// Règles et sources : docs/simulateur-regles.md (vérifiées le 1er novembre 2026).
// Montants en centimes entiers. Aucune donnée personnelle : tout est calculé sur le téléphone.
import type { ISODate } from './dates';
import type { Contract, Planning } from './model';
import { joursMensualises, salaireMensualise } from './payroll';
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
  const coutRetenu = Math.min(cout, Math.round(params.plafondHoraire * heures));
  const part = (ressources * 100 * taux) / params.coutReference; // part restant à la famille sur le coût retenu
  const montant = Math.max(0, Math.round(coutRetenu * (1 - part)));
  const coutHoraire = heures > 0 ? Math.round(cout / heures) : 0;
  return {
    montant, coutRetenu, ressources, taux, params, coutHoraire,
    participationHoraire: Math.round(ressources * 100 * taux),
    depassePlafond: coutHoraire > params.plafondHoraire,
  };
}

/** Crédit d'impôt garde d'enfant hors du domicile (CGI 200 quater B) : 50 % des dépenses, 3 500 € par enfant au plus. */
export const CREDIT_TAUX = 0.5;
export const CREDIT_PLAFOND_DEPENSES = 350000;
/** Forfait d'entretien retenu par jour de garde (BOFiP BOI-IR-RICI-300 §150) */
export const CREDIT_FORFAIT_ENTRETIEN_JOUR = 265;

export function creditImpot(netAnnuel: number, joursAnnuels: number, cmgAnnuel: number): { depenses: number; credit: number } {
  const depenses = Math.max(0, netAnnuel + joursAnnuels * CREDIT_FORFAIT_ENTRETIEN_JOUR - cmgAnnuel);
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
  /** Salaire horaire net (centimes) */
  tauxNet: number;
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
  semaines: number;
  /** Heures payées par mois (minutes) */
  heuresMoisMin: number;
  /** Heures au-delà de 45 h par semaine, par mois (minutes) */
  heuresMajMoisMin: number;
  joursMois: number;
  /** Minimum légal d'entretien pour une journée moyenne (centimes) */
  entretienMinimum: number;
  entretienJourRetenu: number;
  salaire: number;
  entretien: number;
  repas: number;
  /** À verser chaque mois à l'assistante maternelle (hors congés payés en année incomplète) */
  total: number;
  /** Année incomplète : congés payés à prévoir sur l'année (≈ 10 % du salaire net de l'année) */
  congesAnnuels: number;
  cmgEligible: boolean;
  cmg: CmgCalc;
  /** À payer par la famille chaque mois, après le CMG */
  reste: number;
  creditEligible: boolean;
  creditAnnuel: number;
  depensesAnnuelles: number;
  /** Coût mensuel réel, crédit d'impôt réparti sur 12 mois */
  reel: number;
  /** Le salaire horaire est sous le minimum conventionnel */
  sousMinimum: boolean;
  minimumNet: number;
  minimumBrut: number;
  /** Salaire horaire brut estimé */
  tauxBrut: number;
}

export function semainesAccueil(i: Pick<SimInput, 'yearType' | 'semainesAbsence'>): number {
  return i.yearType === 'complete' ? 52 : Math.min(46, 52 - 5 - Math.max(1, Math.round(i.semainesAbsence)));
}

/** Planning régulier équivalent : `jours` journées identiques à partir de 8 h. */
function planningEquivalent(jours: number, heures: number): Planning {
  const pl: Planning = {};
  const n = Math.max(1, Math.min(6, Math.round(jours)));
  const parJour = Math.round((heures * 60) / n);
  const fin = 8 * 60 + parJour;
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  for (let d = 1; d <= n; d++) pl[d] = [{ start: '08:00', end: hhmm(Math.min(fin, 24 * 60 - 1)) }];
  return pl;
}

export function simuler(i: SimInput, d: ISODate): SimResult {
  const rates = ratesAt(d);
  const semaines = semainesAccueil(i);
  const planning = planningEquivalent(i.jours, i.heures);
  const c = { yearType: i.yearType, weeks: semaines, planning, rateNet: i.tauxNet, majoration: i.majoration } as Contract;
  const salaire = salaireMensualise(c);
  const heuresSemMin = Math.round(i.heures * 60);
  const heuresMoisMin = Math.round((heuresSemMin * semaines) / 12);
  const heuresMajMoisMin = Math.round((Math.max(0, heuresSemMin - 45 * 60) * semaines) / 12);
  const joursMois = joursMensualises(c);
  const minutesJour = i.jours > 0 ? heuresSemMin / Math.round(i.jours) : 0;
  const entretienMinimum = entretienPlancher(d, minutesJour);
  const entretienJourRetenu = Math.max(i.entretienJour, entretienMinimum);
  const entretien = entretienJourRetenu * joursMois;
  const repas = i.repasPrix * i.repasParJour * joursMois;
  const total = salaire + entretien + repas;
  const congesAnnuels = i.yearType === 'incomplete' ? Math.round(salaire * 12 * 0.1) : 0;

  // CMG : enfant de moins de 6 ans, ou de 6 à 12 ans pour un parent seul (D531-18-1).
  const cmgEligible = i.age === 'moins6' || i.parentSeul;
  const cmgCalc = calculCmg(total, heuresMoisMin / 60, i.ressourcesMois, i.enfantsACharge, i.enfantsAeeh, d);
  const cmg = cmgEligible ? cmgCalc : { ...cmgCalc, montant: 0 };
  const reste = total - cmg.montant;

  // Crédit d'impôt : enfant de moins de 6 ans au 1er janvier.
  const creditEligible = i.age === 'moins6';
  const joursAnnuels = Math.round(i.jours) * semaines;
  const { depenses, credit } = creditImpot(salaire * 12 + congesAnnuels, joursAnnuels, cmg.montant * 12);
  const creditAnnuel = creditEligible ? credit : 0;

  return {
    semaines, heuresMoisMin, heuresMajMoisMin, joursMois, entretienMinimum, entretienJourRetenu,
    salaire, entretien, repas, total, congesAnnuels,
    cmgEligible, cmg, reste,
    creditEligible, creditAnnuel, depensesAnnuelles: creditEligible ? depenses : 0,
    reel: reste - Math.round(creditAnnuel / 12),
    sousMinimum: i.tauxNet < rates.minConvNet,
    minimumNet: rates.minConvNet, minimumBrut: rates.minConvBrut,
    tauxBrut: Math.round((i.tauxNet * 10000) / rates.netSurBrut),
  };
}

/** Valeurs de départ : accueil type au minimum conventionnel. */
export function simulationParDefaut(d: ISODate): SimInput {
  const r = ratesAt(d);
  return {
    jours: 5, heures: 45, yearType: 'complete', semainesAbsence: 1, majoration: 10,
    tauxNet: r.minConvNet, entretienJour: 0, repasPrix: 0, repasParJour: 1,
    enfantsACharge: 1, enfantsAeeh: 0, age: 'moins6', parentSeul: false, ressourcesMois: 3500,
  };
}
