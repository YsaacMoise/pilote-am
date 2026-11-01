// Simulateur d'accueil : ce que coûte une assistante maternelle à une famille, avant et après les aides.
// Règles et sources : docs/simulateur-regles.md (vérifiées le 1er novembre 2026).
// Montants en centimes entiers. Aucune donnée personnelle : tout est calculé sur le téléphone.
import { addDays, weekday, type ISODate } from './dates';
import { holidaysOf } from './holidays';
import type { Contract, Plage, Planning } from './model';
import { daysPerWeek, plageMin, salaireMensualise, weeklyMinutes } from './payroll';
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

/** Situation de chaque parent du foyer au regard de la condition d'activité (CSS L531-5 I, D531-19 ; service-public F39152) */
export type Statut = 'travail' | 'assimile' | 'etudes' | 'aidee' | 'sans';
export const STATUTS: { v: Statut; l: string; sub: string }[] = [
  { v: 'travail', l: 'Travaille', sub: 'Salarié, indépendant à jour de ses cotisations' },
  { v: 'assimile', l: 'Situation assimilée', sub: 'Chômage indemnisé, arrêt maladie ou maternité, formation rémunérée' },
  { v: 'etudes', l: 'Études ou service civique', sub: '' },
  { v: 'aidee', l: 'AAH, ASS ou RSA', sub: 'RSA avec inscription comme demandeur d’emploi' },
  { v: 'sans', l: 'Sans activité', sub: '' },
];

/**
 * Condition d'activité : le parent seul, ou chacun des deux membres du couple, travaille ou est dans une situation assimilée
 * (études et service civique comptent ici comme une activité). Elle ne s'applique pas si l'un d'eux touche l'AAH, l'ASS ou le RSA.
 */
export function activiteOk(foyer: 'couple' | 'seul', vous: Statut, conjoint: Statut): boolean {
  if (foyer === 'seul') return vous !== 'sans';
  if (vous === 'aidee' || conjoint === 'aidee') return true;
  return vous !== 'sans' && conjoint !== 'sans';
}

/** Situations qui changent les revenus retenus par la CAF (CSS R532-5 à R532-7) */
export type SituationRevenus = 'aucune' | 'chomage' | 'sansRevenus' | 'arret' | 'cessation';
export const SITUATIONS_REVENUS: { v: SituationRevenus; l: string; taux: number }[] = [
  { v: 'aucune', l: 'Aucune', taux: 0 },
  { v: 'chomage', l: 'Chômage indemnisé depuis 2 mois ou plus', taux: 0.3 },
  { v: 'sansRevenus', l: 'Chômage non indemnisé depuis 2 mois, ou RSA', taux: 1 },
  { v: 'arret', l: 'Arrêt de travail de plus de 6 mois', taux: 0.3 },
  { v: 'cessation', l: 'Arrêt d’activité avec retraite, invalidité ou AAH', taux: 0.3 },
];

/** Revenus mensuels retenus : revenu fiscal de référence ÷ 12, après l'abattement ou la neutralisation des revenus d'activité concernés. */
export function ressourcesRetenues(revenusAn: number, situation: SituationRevenus, revenusConcernes: number): number {
  const taux = SITUATIONS_REVENUS.find((x) => x.v === situation)?.taux ?? 0;
  const retire = Math.min(Math.max(0, revenusConcernes), Math.max(0, revenusAn)) * taux;
  return Math.round((Math.max(0, revenusAn) - retire) / 12);
}

/** Âge en mois au mois de `d`, à partir d'une naissance « AAAA-MM » */
export function ageMois(naissance: string, d: ISODate): number {
  const [y, m] = naissance.split('-').map(Number);
  return (Number(d.slice(0, 4)) - y) * 12 + (Number(d.slice(5, 7)) - m);
}
const moisPlus = (naissance: string, n: number): string => {
  const [y, m] = naissance.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
/**
 * Dernier mois d'aide de la CAF : le mois des 6 ans (des 12 ans pour un parent seul) ; le droit s'arrête le mois civil suivant
 * celui où une condition n'est plus remplie (service-public F39152, vérifié le 26 juin 2026).
 */
export function dernierMoisCmg(naissance: string, seul: boolean): string {
  return moisPlus(naissance, (seul ? 12 : 6) * 12);
}
/** Dernière année de dépenses ouvrant droit au crédit d'impôt : moins de 6 ans au 1er janvier (BOFiP §30). */
export function derniereAnneeCredit(naissance: string): number {
  return Number(naissance.slice(0, 4)) + 6;
}

/** Repas que l'assistante maternelle peut fournir (CCN art. 114.2 : nature, nombre et prix fixés au contrat) */
export type TypeRepas = 'petitDej' | 'dejeuner' | 'gouter' | 'diner';
export const TYPES_REPAS: TypeRepas[] = ['petitDej', 'dejeuner', 'gouter', 'diner'];
export const REPAS_NOMS: Record<TypeRepas, string> = { petitDej: 'Petit-déjeuner', dejeuner: 'Déjeuner', gouter: 'Goûter', diner: 'Dîner' };
/**
 * Un repas est compté un jour d'accueil si l'enfant est présent à son heure (choix du simulateur, réglable en le désactivant) :
 * petit-déjeuner si l'enfant arrive à 8 h au plus tard ; déjeuner s'il est présent de 11 h 30 à 12 h 30 ;
 * goûter s'il est présent de 16 h 30 à 17 h ; dîner s'il part à 19 h ou après.
 */
export const REPAS_REGLES: Record<TypeRepas, string> = {
  petitDej: 'les jours où l’enfant arrive à 8 h au plus tard',
  dejeuner: 'les jours où l’enfant est là de 11 h 30 à 12 h 30',
  gouter: 'les jours où l’enfant est là de 16 h 30 à 17 h (retour d’école compris)',
  diner: 'les jours où l’enfant part à 19 h ou après',
};

const hm = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
function couvre(plages: Plage[], de: number, a: number): boolean {
  return plages.some((p) => plageMin(p) > 0 && hm(p.start) <= de && hm(p.end) >= a);
}
export function repasDuJour(plages: Plage[], type: TypeRepas): boolean {
  const ok = plages.filter((p) => plageMin(p) > 0);
  if (!ok.length) return false;
  switch (type) {
    case 'petitDej': return ok.some((p) => hm(p.start) <= 8 * 60);
    case 'dejeuner': return couvre(ok, 11 * 60 + 30, 12 * 60 + 30);
    case 'gouter': return couvre(ok, 16 * 60 + 30, 17 * 60);
    case 'diner': return ok.some((p) => hm(p.end) >= 19 * 60);
  }
}

/** Indemnités kilométriques (CCN art. 113 ; service-public F12812, vérifié le 17 juin 2026) */
/** Barème administratif, limite basse (€ par km × 1 000) : ≤ 5 CV, 6-7 CV, ≥ 8 CV ; jusqu'à 2 000 km, 2 001 à 10 000 km, au-delà */
const KM_ADMIN: number[][] = [[320, 400, 230], [410, 510, 300], [450, 550, 320]];
/** Barème fiscal, limite haute jusqu'à 5 000 km par an (€ par km × 1 000) : 3, 4, 5, 6, 7 CV et plus (arrêté du 27 mars 2023, reconduit en 2026) */
const KM_FISCAL: Record<number, number> = { 3: 529, 4: 606, 5: 636, 6: 665, 7: 697 };

/** Fourchette légale du tarif kilométrique (millièmes d'euro par km) pour une puissance et un kilométrage annuel. */
export function bornesKm(cv: number, kmAn: number): { min: number; max: number } {
  const g = cv <= 5 ? 0 : cv <= 7 ? 1 : 2;
  const t = kmAn <= 2000 ? 0 : kmAn <= 10000 ? 1 : 2;
  return { min: KM_ADMIN[g][t], max: KM_FISCAL[Math.max(3, Math.min(7, Math.round(cv)))] };
}

/** Jours fériés des 12 mois qui suivent `d`, par jour de la semaine (1 = lundi … 7 = dimanche). */
export function feriesParJour(d: ISODate, alsaceMoselle: boolean): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0, 0];
  const fin = addDays(d, 365);
  for (const y of [Number(d.slice(0, 4)), Number(d.slice(0, 4)) + 1]) {
    const jours = [...holidaysOf(y).keys()];
    // Alsace-Moselle : Vendredi saint et 26 décembre en plus (code du travail L3134-13)
    if (alsaceMoselle) {
      const lundiPaques = [...holidaysOf(y).entries()].find(([, n]) => n === 'Lundi de Pâques')?.[0];
      if (lundiPaques) jours.push(addDays(lundiPaques, -3));
      jours.push(`${y}-12-26`);
    }
    for (const j of jours) if (j >= d && j < fin) out[weekday(j)]++;
  }
  return out;
}

export interface SimInput {
  /** Planning type de la semaine : jour (1 = lundi … 7 = dimanche) → 0, 1 ou 2 plages */
  planning: Planning;
  yearType: 'complete' | 'incomplete';
  /** Année incomplète : semaines sans accueil en plus des 5 semaines de congés payés */
  semainesAbsence: number;
  /** Majoration des heures au-delà de 45 h par semaine (%) */
  majoration: number;
  /** Salaire horaire brut (centimes), l'unité de la convention collective et du contrat */
  tauxBrut: number;
  /** L'assistante maternelle travaille en Alsace-Moselle (Bas-Rhin, Haut-Rhin, Moselle) : cotisations salariales plus élevées */
  alsaceMoselle: boolean;
  /** Indemnité d'entretien prévue au contrat (centimes), par jour ou par heure ; le minimum légal s'applique chaque jour */
  entretien: number;
  entretienMode: 'jour' | 'heure';
  /** Prix de chaque repas fourni par l'assistante maternelle (centimes) ; 0 = non fourni */
  repas: Record<TypeRepas, number>;
  /** Déplacements avec l'enfant dans la voiture de l'assistante maternelle : km par mois, tarif (centimes par km), puissance fiscale */
  kmMois: number;
  kmTaux: number;
  cv: number;
  /** Famille */
  foyer: 'couple' | 'seul';
  /** Statut de chaque parent du foyer (le conjoint seulement en couple) */
  statutVous: Statut;
  statutConjoint: Statut;
  /** L'enfant vit en résidence alternée : chaque parent est calculé sur sa propre situation, crédit d'impôt divisé par deux */
  residenceAlternee: boolean;
  /** Enfants gardés chez cette assistante maternelle, mêmes horaires et même tarif : mois de naissance « AAAA-MM » */
  enfants: string[];
  /** Enfants à charge de moins de 20 ans dans le foyer, gardés ou non */
  enfantsACharge: number;
  enfantsAeeh: number;
  /** Revenu fiscal de référence de l'avant-dernière année (euros par an), comme le simulateur Urssaf */
  revenusAn: number;
  situationRevenus: SituationRevenus;
  /** Revenus d'activité de la personne concernée par cette situation (euros par an) */
  revenusConcernes: number;
  /** Autres aides à la garde, par mois (centimes) : employeur, CSE, commune, CESU préfinancé */
  autresAides: number;
  /** Calendrier : premier mois du contrat « AAAA-MM » */
  debut: string;
  /** Année incomplète : congés payés versés en juin, ou au mois du congé principal (CCN art. 102) */
  cpMode: 'juin' | 'principale';
  /** Mois du congé principal (6 à 10) */
  moisCongePrincipal: number;
  /** Premier mois : adaptation payée aux heures réelles (0 = pas d'adaptation), et jours d'accueil de ce mois */
  adaptationHeures: number;
  adaptationJours: number;
}

export interface EnfantResult {
  naissance: string;
  ageMois: number;
  cmgEligible: boolean;
  cmg: number;
  cotisationsPrisesEnCharge: number;
  cotisationsReste: number;
  creditEligible: boolean;
  credit: number;
  /** Dépenses retenues pour le crédit d'impôt, sur l'année */
  depenses: number;
  dernierMoisCmg: string;
  derniereAnneeCredit: number;
}

export interface SimResult {
  /** Semaines payées par an (52 en année complète, ≤ 46 sinon) */
  semaines: number;
  /** Semaines où l'enfant est réellement accueilli (année complète : 52 − 5 semaines de congés de l'AM) */
  semainesGarde: number;
  /** Jours d'accueil et heures par semaine (minutes) */
  joursSemaine: number;
  minutesSemaine: number;
  /** Détail par jour de la semaine (jours d'accueil seulement) */
  parJour: { jour: number; minutes: number; entretien: number; entretienMinimum: number; repas: TypeRepas[]; feries: number }[];
  /** Jours fériés attendus sur des jours d'accueil, sur un an (sans accueil, donc sans entretien ni repas) */
  feriesAn: number;
  /** Heures payées par mois (minutes) */
  heuresMoisMin: number;
  /** Heures au-delà de 45 h par semaine, par mois (minutes) */
  heuresMajMoisMin: number;
  /** Jours d'accueil par an, et en moyenne par mois */
  joursAn: number;
  joursMois: number;
  /** Repas fournis par an, par type */
  repasAn: Record<TypeRepas, number>;
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
  /** Indemnités kilométriques du mois, et la fourchette légale du tarif (millièmes d'euro par km) */
  km: number;
  kmBornes: { min: number; max: number };
  /** À verser à l'assistante maternelle, en moyenne par mois : salaire, congés, réduction, entretien, repas */
  verse: number;
  /** Cotisations sociales du mois (salariales et patronales) */
  cotisations: number;
  /** Part prise en charge par la CAF avec le CMG, et ce qui reste à la famille */
  cotisationsPrisesEnCharge: number;
  cotisationsReste: number;
  /** Coût mensuel moyen avant aides : à verser + cotisations */
  total: number;
  /** Condition d'activité remplie */
  activiteOk: boolean;
  /** Ressources mensuelles retenues avant plancher et plafond (euros) */
  ressourcesMois: number;
  /** Détail par enfant gardé ; les montants d'accueil ci-dessus sont les totaux pour tous les enfants */
  nbEnfants: number;
  enfants: EnfantResult[];
  /** Montants pour un seul enfant (le contrat de chaque enfant) */
  parEnfant: { salaire: number; verse: number; cotisations: number };
  autresAides: number;
  cmgEligible: boolean;
  /** Calcul du CMG pour un enfant ; `montant` est celui du premier enfant ouvrant droit (0 sinon) */
  cmg: CmgCalc;
  cmgTotal: number;
  /** À payer par la famille, en moyenne par mois, après le CMG (cotisations restantes comprises) */
  reste: number;
  /** Ce que la famille paie par heure, après le CMG (centimes) */
  resteHoraire: number;
  creditEligible: boolean;
  creditAnnuel: number;
  depensesAnnuelles: number;
  /** Coût mensuel réel, crédit d'impôt réparti sur 12 mois */
  reel: number;
  /** Heures maximales par semaine pour ce planning (2 250 h par an) */
  heuresMax: number;
  /** Jours où l'amplitude dépasse 13 h (11 h de repos obligatoire) */
  joursTropLongs: number[];
  /** Plus de 2 250 h par an */
  depasseAnnuel: boolean;
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

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Planning régulier : `jours` journées identiques (lundi, mardi…) à partir de 8 h, pour `heures` par semaine. */
export function planningRegulier(jours: number, heures: number): Planning {
  const n = Math.max(1, Math.min(6, Math.round(jours) || 1));
  const parJour = Math.min(HEURES_MAX_JOUR * 60, Math.round((Math.max(0, heures) * 60) / n));
  const pl: Planning = {};
  for (let d = 1; d <= n; d++) pl[d] = parJour > 0 ? [{ start: '08:00', end: hhmm(8 * 60 + parJour) }] : [];
  return pl;
}

/** Lien partagé : « 1:0800-1700,3:0800-1200+1630-1830 ». */
export function planningVersTexte(pl: Planning): string {
  const out: string[] = [];
  for (let d = 1; d <= 7; d++) {
    const ok = (pl[d] ?? []).filter((p) => plageMin(p) > 0);
    if (ok.length) out.push(`${d}:${ok.map((p) => `${p.start.replace(':', '')}-${p.end.replace(':', '')}`).join('+')}`);
  }
  return out.join(',');
}

export function planningDepuisTexte(t: string): Planning | null {
  const pl: Planning = {};
  for (const part of t.split(',')) {
    const m = /^([1-7]):(.+)$/.exec(part.trim());
    if (!m) return null;
    const plages: Plage[] = [];
    for (const r of m[2].split(/[+ ]/).slice(0, 2)) { // « + » devient une espace s'il n'est pas encodé dans l'adresse
      const x = /^([01]\d|2[0-3])([0-5]\d)-([01]\d|2[0-3])([0-5]\d)$/.exec(r);
      if (!x) return null;
      plages.push({ start: `${x[1]}:${x[2]}`, end: `${x[3]}:${x[4]}` });
    }
    pl[Number(m[1])] = plages;
  }
  return pl;
}

export function simuler(i: SimInput, d: ISODate): SimResult {
  const rates = ratesAt(d);
  const cp = cotisParams(d);
  const planning = i.planning ?? {};
  const semaines = semainesAccueil(i);
  const semainesGarde = semainesTravaillees(i);
  const joursSemaine = daysPerWeek(planning);
  const heuresSemMin = weeklyMinutes(planning);
  const heuresMax = Math.floor((HEURES_MAX_AN / semainesGarde) * 4) / 4;
  const joursTropLongs: number[] = [];
  for (let w = 1; w <= 7; w++) {
    const ok = (planning[w] ?? []).filter((p) => plageMin(p) > 0);
    if (!ok.length) continue;
    const amplitude = Math.max(...ok.map((p) => hm(p.end))) - Math.min(...ok.map((p) => hm(p.start)));
    if (amplitude > HEURES_MAX_JOUR * 60) joursTropLongs.push(w);
  }
  const majoration = Math.max(10, i.majoration);

  // Brut saisi, net calculé et arrondi au centime comme sur le contrat.
  const tauxSalarial = i.alsaceMoselle ? cp.salarialeAlsaceMoselle : cp.salariale;
  const ratio = 1 - tauxSalarial;
  const tauxBrut = Math.max(0, i.tauxBrut || 0);
  const tauxNet = Math.round(tauxBrut * ratio);

  const c = { yearType: i.yearType, weeks: semaines, planning, rateNet: tauxNet, majoration } as Contract;
  const salaire = heuresSemMin > 0 ? salaireMensualise(c) : 0;
  const heuresMoisMin = Math.round((heuresSemMin * semaines) / 12);
  const heuresMajMoisMin = Math.round((Math.max(0, heuresSemMin - 45 * 60) * semaines) / 12);

  // Jour par jour : entretien (minimum légal de la journée), repas, et jours fériés sans accueil.
  // Un férié tombe en moyenne sur une semaine d'accueil dans la proportion semaines travaillées ÷ 52.
  const feries = feriesParJour(d, i.alsaceMoselle);
  const parJour: SimResult['parJour'] = [];
  const repasAn: Record<TypeRepas, number> = { petitDej: 0, dejeuner: 0, gouter: 0, diner: 0 };
  let joursAnExact = 0, entretienAn = 0, repasMontantAn = 0, feriesAn = 0;
  for (let w = 1; w <= 7; w++) {
    const plages = (planning[w] ?? []).filter((p) => plageMin(p) > 0);
    if (!plages.length) continue;
    const minutes = plages.reduce((t, p) => t + plageMin(p), 0);
    const entretienMinimum = entretienPlancher(d, minutes);
    const prevu = i.entretienMode === 'heure' ? Math.round((i.entretien * minutes) / 60) : i.entretien;
    const ent = Math.max(prevu, entretienMinimum);
    const repasJour = TYPES_REPAS.filter((t) => (i.repas?.[t] ?? 0) > 0 && repasDuJour(plages, t));
    const feriesW = (feries[w] * semainesGarde) / 52;
    const n = semainesGarde - feriesW;
    joursAnExact += n; feriesAn += feriesW;
    entretienAn += n * ent;
    for (const t of repasJour) { repasAn[t] += n; repasMontantAn += n * i.repas[t]; }
    parJour.push({ jour: w, minutes, entretien: ent, entretienMinimum, repas: repasJour, feries: feries[w] });
  }
  for (const t of TYPES_REPAS) repasAn[t] = Math.round(repasAn[t]);
  const joursAn = Math.round(joursAnExact);
  const joursMois = joursAnExact / 12;
  const entretien = Math.round(entretienAn / 12);
  const repas = Math.round(repasMontantAn / 12);
  const kmMois = Math.max(0, i.kmMois || 0);
  const km = Math.round(kmMois * Math.max(0, i.kmTaux || 0));
  const kmBornes = bornesKm(i.cv || 5, kmMois * 12);
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
  // Chaque enfant a son contrat et sa déclaration : un CMG par enfant, au taux d'effort du nombre total d'enfants à charge
  // (simulateur Urssaf : 2 enfants gardés → 2 CMG identiques, 5 € de cotisations fixes chacun).
  const cout = salaire + congesMois + entretien + repas;
  const seul = i.foyer === 'seul';
  const activite = activiteOk(i.foyer, i.statutVous, i.statutConjoint);
  const ressourcesMois = ressourcesRetenues(i.revenusAn, i.situationRevenus, i.revenusConcernes);
  const naissances = i.enfants?.length ? i.enfants.slice(0, 4) : [];
  const n = naissances.length;
  const enfantsACharge = Math.max(i.enfantsACharge, n);
  const cmgCalc = calculCmg(cout, heuresMoisMin / 60, ressourcesMois, enfantsACharge, i.enfantsAeeh, d);
  const plafondCredit = i.residenceAlternee ? CREDIT_PLAFOND_DEPENSES / 2 : CREDIT_PLAFOND_DEPENSES;
  const annee = Number(d.slice(0, 4));
  const autresAidesParEnfant = n ? Math.round((i.autresAides || 0) / n) : 0;
  const enfants: EnfantResult[] = naissances.map((naissance) => {
    const age = ageMois(naissance, d);
    const cmgEligible = activite && age <= (seul ? 144 : 72);
    const cmg = cmgEligible ? cmgCalc.montant : 0;
    const pec = cmgEligible ? Math.round(cotisations * cmgCalc.partCotisations) : 0;
    const creditEligible = annee <= derniereAnneeCredit(naissance);
    const depenses = Math.max(0, (salaire + reductionHeuresMaj) * 12 + congesAnnuels + joursAnExact * CREDIT_FORFAIT_ENTRETIEN_JOUR
      + (cotisations - pec) * 12 - cmg * 12 - autresAidesParEnfant * 12);
    const credit = creditEligible ? Math.round(Math.min(depenses, plafondCredit) * CREDIT_TAUX) : 0;
    return {
      naissance, ageMois: age, cmgEligible, cmg, cotisationsPrisesEnCharge: pec, cotisationsReste: cotisations - pec,
      creditEligible, credit, depenses, dernierMoisCmg: dernierMoisCmg(naissance, seul), derniereAnneeCredit: derniereAnneeCredit(naissance),
    };
  });
  const somme = (f: (e: EnfantResult) => number) => enfants.reduce((t, e) => t + f(e), 0);
  const cmgEligible = enfants.some((e) => e.cmgEligible);
  const cmgTotal = somme((e) => e.cmg);
  const cotisationsPrisesEnCharge = somme((e) => e.cotisationsPrisesEnCharge);
  const cotisationsTotal = cotisations * n;
  const cotisationsReste = cotisationsTotal - cotisationsPrisesEnCharge;
  const verse1 = salaire + congesMois + reductionHeuresMaj + entretien + repas;

  // Les indemnités kilométriques ne sont ni dans le coût aidé par le CMG, ni dans le crédit d'impôt : à la charge de la famille.
  const verse = verse1 * n + km;
  const total = verse + cotisationsTotal;
  const autresAides = Math.min(i.autresAides || 0, Math.max(0, verse + cotisationsReste - cmgTotal));
  const reste = verse + cotisationsReste - cmgTotal - autresAides;
  const creditEligible = enfants.some((e) => e.creditEligible);
  const creditAnnuel = somme((e) => e.credit);
  const depenses = enfants.filter((e) => e.creditEligible).reduce((t, e) => t + e.depenses, 0);

  return {
    semaines, semainesGarde, joursSemaine, minutesSemaine: heuresSemMin, parJour, feriesAn, heuresMoisMin, heuresMajMoisMin, joursAn, joursMois, repasAn,
    tauxNet, salaire: salaire * n, congesAnnuels: congesAnnuels * n, congesMois: congesMois * n, reductionHeuresMaj: reductionHeuresMaj * n,
    entretien: entretien * n, repas: repas * n, km, kmBornes, verse,
    cotisations: cotisationsTotal, cotisationsPrisesEnCharge, cotisationsReste, total,
    activiteOk: activite, ressourcesMois, nbEnfants: n, enfants, parEnfant: { salaire, verse: verse1, cotisations }, autresAides,
    cmgEligible, cmg: { ...cmgCalc, montant: enfants.find((e) => e.cmgEligible)?.cmg ?? 0 }, cmgTotal,
    reste, resteHoraire: heuresMoisMin > 0 && n ? Math.round(reste / n / (heuresMoisMin / 60)) : 0,
    creditEligible, creditAnnuel, depensesAnnuelles: depenses,
    reel: reste - Math.round(creditAnnuel / 12),
    heuresMax, joursTropLongs,
    depasseAnnuel: heuresSemMin / 60 > heuresMax,
    accordNecessaire: heuresSemMin > HEURES_SANS_ACCORD * 60,
    sousMinimum: tauxBrut < rates.minConvBrut,
    minimumNet: rates.minConvNet, minimumBrut: rates.minConvBrut,
  };
}

/** Mois de naissance d'un enfant qui a `mois` mois au mois de `d` */
export function naissanceIlYA(d: ISODate, mois: number): string {
  return moisPlus(d.slice(0, 7), -mois);
}

/** Valeurs de départ : accueil type au minimum conventionnel. */
export function simulationParDefaut(d: ISODate): SimInput {
  const r = ratesAt(d);
  return {
    planning: planningRegulier(5, 45), yearType: 'complete', semainesAbsence: 1, majoration: 10,
    tauxBrut: r.minConvBrut, alsaceMoselle: false, entretien: 0, entretienMode: 'jour',
    repas: { petitDej: 0, dejeuner: 0, gouter: 0, diner: 0 }, kmMois: 0, kmTaux: 0, cv: 5,
    foyer: 'couple', statutVous: 'travail', statutConjoint: 'travail', residenceAlternee: false,
    enfants: [naissanceIlYA(d, 18)], enfantsACharge: 1, enfantsAeeh: 0,
    revenusAn: 42000, situationRevenus: 'aucune', revenusConcernes: 0, autresAides: 0,
    debut: naissanceIlYA(d, -1), cpMode: 'juin', moisCongePrincipal: 8, adaptationHeures: 0, adaptationJours: 0,
  };
}
