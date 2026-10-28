import type { ISODate, Minutes, Weekday, YearMonth } from './dates';
import type { Cents, Milli } from './money';

/** Une plage d'accueil dans la journée. */
export interface Slot {
  start: Minutes;
  end: Minutes;
}

/** Planning type d'une semaine : plages par jour (lundi = 0). Un jour absent = pas d'accueil. */
export type WeeklyPattern = Partial<Record<Weekday, Slot[]>>;

export interface DateRange {
  from: ISODate;
  to: ISODate;
}

/** 52 semaines (congés de l'AM compris) ou 46 semaines et moins. */
export type YearType = 'complete' | 'incomplete';

export type EntretienRule =
  | { kind: 'minimum' }
  | { kind: 'perHour'; milli: Milli }
  | { kind: 'perDay'; cents: Cents };

/**
 * Paiement des congés en accueil sur 46 semaines ou moins (CCN art. 102.1.2.2).
 * Toute autre modalité est proscrite : ni douzième, ni 10 % chaque mois.
 */
export type CpPaymentMode = 'juin' | 'prise_principale' | 'au_fur_et_a_mesure';

export interface Contract {
  id: string;
  childId: string;
  familyId: string;
  startDate: ISODate;
  endDate?: ISODate;
  yearType: YearType;
  /** Semaines d'accueil programmées par an (52 en année complète). */
  programmedWeeks: number;
  /** Semaines de non-accueil prévues (année incomplète), congés de l'AM compris. */
  nonAccueil: DateRange[];
  pattern: WeeklyPattern;
  /** Taux horaire net, en millièmes d'euro. */
  hourlyNetMilli: Milli;
  /** Majoration des heures au-delà de 45 h par semaine, en % (10 au minimum). */
  majorationPct: number;
  /** Majoration éventuelle des heures complémentaires prévue au contrat, en % (0 par défaut). */
  complementaryPct: number;
  entretien: EntretienRule;
  /** Indemnité de repas par jour quand l'AM fournit les repas (0 si les parents les fournissent). */
  mealCents: Cents;
  /** Indemnité kilométrique par km, en millièmes. */
  kmMilli: Milli;
  cpPaymentMode: CpPaymentMode;
  /** Fin de la période d'adaptation, si le contrat en prévoit une. */
  adaptationEnd?: ISODate;
  /** Enfant ouvrant droit à majoration (handicap, maladie, inadaptation). */
  childMajoration: boolean;
}

/** Motifs d'absence ou d'événement saisis par l'AM. */
export type AbsenceReason =
  /** Enfant malade, avec certificat médical ou bulletin d'hospitalisation : non payé dans les limites de la CCN */
  | 'enfant_malade'
  /** Absence de l'enfant décidée par les parents, hors contrat : payée */
  | 'famille'
  /** AM en arrêt maladie : non payé par l'employeur */
  | 'am_malade'
  /** Congé sans solde de l'AM, accordé par écrit : non payé */
  | 'am_sans_solde'
  /** Congé de l'AM pour enfant malade : non payé */
  | 'am_enfant_malade'
  /** Congés payés de l'AM */
  | 'am_conges_payes'
  /** Événement familial de l'AM (mariage, naissance, décès…) : payé */
  | 'am_evenement_familial';

export const UNPAID_REASONS: readonly AbsenceReason[] = ['am_malade', 'am_sans_solde', 'am_enfant_malade'];

/** Saisie d'une journée. Une journée sans saisie suit le planning du contrat. */
export interface DayEntry {
  contractId: string;
  date: ISODate;
  arrival?: Minutes;
  departure?: Minutes;
  /** Seconde période de la journée (retour après une coupure, l'école par exemple) */
  arrival2?: Minutes;
  departure2?: Minutes;
  absence?: AbsenceReason;
  /** Certificat médical reçu (enfant malade) */
  certificate?: boolean;
  /** Repas fourni par l'AM ce jour-là (sinon la valeur par défaut du contrat s'applique) */
  meal?: boolean;
  km?: number;
  /** Accueil de 24 heures consécutives */
  consecutive24h?: boolean;
  /** Jour férié travaillé d'un commun accord */
  holidayWorked?: boolean;
}

/** Mois repris d'un bulletin Pajemploi ou saisi à la main (reprise d'historique). */
export interface HistoryMonth {
  contractId: string;
  month: YearMonth;
  netSalaryCents: Cents;
  /** Salaire brut indiqué sur le bulletin, quand il est connu */
  grossSalaryCents?: Cents;
  declaredHours?: number;
  declaredDays?: number;
  entretienCents: Cents;
  mealsCents: Cents;
  kmCents: Cents;
  source: 'bulletin' | 'manuel';
}

/** Soldes de départ saisis une fois à la reprise d'un contrat en cours. */
export interface OpeningBalances {
  contractId: string;
  /** Date à laquelle les soldes sont arrêtés (veille du premier jour suivi dans l'app) */
  asOf: ISODate;
  /** Congés acquis et non pris au titre de la période précédente (au 31 mai) */
  cpPreviousRemaining: number;
  /** Congés acquis sur la période en cours (depuis le 1er juin) */
  cpCurrentAcquired: number;
  /** Jours d'absence pour maladie de l'enfant déjà retenus sur l'année du contrat en cours */
  sickDaysDeducted: number;
}

/** Montants déclarés par le parent, relevés sur le bulletin reçu (écran Contrôle). */
export interface ControlEntry {
  contractId: string;
  month: YearMonth;
  declaredNetCents: Cents;
  declaredGrossCents?: Cents;
  declaredEntretienCents: Cents;
  declaredMealsCents: Cents;
  declaredKmCents: Cents;
  declaredHours?: number;
  declaredDays?: number;
}
