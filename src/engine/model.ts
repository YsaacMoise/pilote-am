import type { ISODate, Month } from './dates';

export interface Plage { start: string; end: string } // 'HH:MM'

/** Planning type : jour de semaine (1 = lundi … 7 = dimanche) → 0, 1 ou 2 plages */
export type Planning = Record<number, Plage[]>;

export type YearType = 'complete' | 'incomplete';
export type CpPayMode = 'juin' | 'principale' | 'fur';

export interface HistoryMonth {
  month: Month;
  /** Salaire net déclaré (centimes) */
  net: number;
  /** Salaire brut s'il figure sur le bulletin */
  brut?: number;
  heures?: number;
  jours?: number;
  cpJours?: number;
  entretien?: number;
  source: 'pdf' | 'manuel';
}

export interface StartBalances {
  /** Jours de congés acquis lors de la période précédente et pas encore pris */
  cpRestants: number;
  /** Jours de congés acquis depuis le 1er juin, avant le suivi par l'app */
  cpEnCours: number;
  /** Jours d'enfant malade (avec certificat) déjà déduits sur l'année de contrat en cours */
  maladieDeduits: number;
}

/** Conditions du contrat qu'un avenant peut changer */
export type Terms = Pick<Contract, 'planning' | 'rateNet' | 'majoration' | 'entretienJour' | 'repasPrix' | 'repasParJour' | 'repasParents' | 'kmTaux'>;
export const TERM_KEYS: (keyof Terms)[] = ['planning', 'rateNet', 'majoration', 'entretienJour', 'repasPrix', 'repasParJour', 'repasParents', 'kmTaux'];

/** Avenant : nouvelles conditions à partir du 1er jour d'un mois */
export interface Avenant {
  id: string;
  /** Premier jour du mois d'effet */
  from: ISODate;
  /** Date de signature, si connue */
  signe?: ISODate;
  changes: Partial<Terms>;
}

export interface Contract {
  id: string;
  /** Prénom de l'enfant (ne quitte jamais le téléphone) */
  child: string;
  /** Nom de la famille / du parent employeur */
  family: string;
  color: number;
  start: ISODate;
  end?: ISODate;
  yearType: YearType;
  /** Semaines d'accueil programmées par an (52 en année complète, ≤ 46 sinon) */
  weeks: number;
  /** Semaines sans accueil connues (lundi de chaque semaine) — année incomplète */
  weeksOff: ISODate[];
  planning: Planning;
  /** Taux horaire net (centimes) */
  rateNet: number;
  /** Majoration des heures au-delà de 45 h (pour cent, ≥ 10) */
  majoration: number;
  /** Indemnité d'entretien prévue au contrat par jour (centimes) — le plancher légal s'applique s'il est supérieur */
  entretienJour: number;
  /** Prix d'un repas fourni (centimes) et nombre de repas par jour d'accueil */
  repasPrix: number;
  repasParJour: number;
  /** Les parents fournissent les repas de l'enfant : avantage en nature imposable (impots.gouv). Non renseigné sur les anciens contrats. */
  repasParents?: boolean;
  /** Avenants, du plus ancien au plus récent */
  avenants?: Avenant[];
  /** Indemnité kilométrique (centimes par km) */
  kmTaux: number;
  cpMode: CpPayMode;
  /** Enfant ouvrant droit à l'abattement fiscal majoré (handicap, maladie, inadaptation) */
  majoreFiscal: boolean;
  /** Date à partir de laquelle l'app suit le contrat (avant : historique) */
  trackedFrom: ISODate;
  balances: StartBalances;
  history: HistoryMonth[];
  createdAt: number;
}

export type ChildAbs = 'malade_certif' | 'malade' | 'parents' | 'sans_solde_enfant';
export type AmAbs = 'cp' | 'am_malade' | 'am_enfant_malade' | 'evenement' | 'sans_solde';

export interface Presence { a?: string; d?: string }

export interface DayRec {
  /** clé = contractId|date */
  key: string;
  cid: string;
  date: ISODate;
  /** Présences réelles pointées (une par plage) */
  pres?: Presence[];
  abs?: ChildAbs;
  /** Accueil sur un jour non prévu au planning */
  extra?: boolean;
  /** Jour férié travaillé */
  ferieTravaille?: boolean;
  repas?: number;
  km?: number;
}

export interface AmLeave {
  id: string;
  type: AmAbs;
  from: ISODate;
  to: ISODate;
}

export interface Settings {
  amName: string;
  /** Enfants à charge de l'AM de moins de 15 ans (congés supplémentaires) */
  enfantsACharge: number;
  lastBackup?: number;
  lastAutoCopy?: number;
  lastExport?: Month;
  persisted?: boolean;
  onboarded?: boolean;
  /** Écran Aujourd'hui en liste compacte (tous les enfants visibles d'un coup) */
  compact?: boolean;
}

export interface Bulletin {
  id: string;
  cid: string;
  month: Month;
  net?: number;
  brut?: number;
  heures?: number;
  jours?: number;
  entretien?: number;
  source: 'pdf' | 'manuel';
}

export interface Journal {
  id: string;
  cid: string;
  date: ISODate;
  time: string;
  kind: 'repas' | 'sieste' | 'change' | 'humeur' | 'soin' | 'note';
  detail: string;
}

export const CHILD_ABS_LABEL: Record<ChildAbs, string> = {
  malade_certif: 'Malade, avec certificat',
  malade: 'Malade, sans certificat',
  parents: 'Absent à la demande des parents',
  sans_solde_enfant: 'Absence sans solde (accord écrit)',
};

export const AM_ABS_LABEL: Record<AmAbs, string> = {
  cp: 'Mes congés payés',
  am_malade: 'Je suis malade',
  am_enfant_malade: 'Mon enfant est malade',
  evenement: 'Événement familial',
  sans_solde: 'Congé sans solde',
};
