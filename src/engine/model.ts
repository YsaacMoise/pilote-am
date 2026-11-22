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
export type Terms = Pick<Contract, 'planning' | 'rateNet' | 'majoration' | 'majorationCompl' | 'entretienJour' | 'entretienHeure' | 'entretienMode' | 'repasPrix' | 'repasParJour' | 'repasParents' | 'kmTaux' | 'yearType' | 'weeks' | 'weeksOff'>;
export const TERM_KEYS: (keyof Terms)[] = ['planning', 'rateNet', 'majoration', 'majorationCompl', 'entretienJour', 'entretienHeure', 'entretienMode', 'repasPrix', 'repasParJour', 'repasParents', 'kmTaux', 'yearType', 'weeks', 'weeksOff'];

/** Avenant : nouvelles conditions à partir d'une date */
export interface Avenant {
  id: string;
  /** Premier jour d'application */
  from: ISODate;
  /** Date de signature, si connue */
  signe?: ISODate;
  changes: Partial<Terms>;
}

/** Motif de fin de contrat (écran Fin) */
export type Motif = 'retrait' | 'demission' | 'deces' | 'inaptitude' | 'inaptitude_pro' | 'faute_grave' | 'essai' | 'fin_cdd';
/**
 * T-076 : façon dont un CDD finit (regles/t076-decisions-direction.md, section 2 ; regles/t076-cdd.md, R-CDD-08).
 * - `terme` : terme atteint, y compris après renouvellement ou report du terme (L1243-8 : IFC due) ;
 * - `suite_cdi` : la relation continue en CDI (L1243-8 al. 1, L1243-11 : ni IFC ni ICCP) ;
 * - `refus_cdi` : l'AM refuse un CDI pour le même emploi, à salaire au moins égal (L1243-10, 3° : pas d'IFC) ;
 * - `initiative_am` : rupture anticipée à l'initiative de l'AM, dont L1243-2 (L1243-10, 4° : pas d'IFC) ;
 * - `faute_grave` : rupture anticipée pour faute grave de l'AM (L1243-10, 4° : pas d'IFC) ;
 * - `essai` : rupture pendant la période d'essai (L1242-11, 4° : pas d'IFC) ;
 * - `commun_accord` : rupture anticipée d'un commun accord (IFC due, L1243-10 ne l'exclut pas) ;
 * - `employeur` : rupture anticipée par les parents hors faute grave (L1243-4 : IFC due ; dommages et intérêts non calculés).
 */
export type FinCdd = 'terme' | 'suite_cdi' | 'refus_cdi' | 'initiative_am' | 'faute_grave' | 'essai' | 'commun_accord' | 'employeur';
/** T-076 : fins de CDD que l'app ne calcule pas (R-CDD-08, partie 6 du rapport) : message précis, aucun montant */
export type FinCddNonGere = 'force_majeure' | 'inaptitude' | 'jeune_vacances' | 'saisonnier_usage' | 'autre';
export const FINS_CDD: FinCdd[] = ['terme', 'suite_cdi', 'refus_cdi', 'commun_accord', 'initiative_am', 'employeur', 'faute_grave', 'essai'];
export const FINS_CDD_NON_GEREES: FinCddNonGere[] = ['force_majeure', 'inaptitude', 'jeune_vacances', 'saisonnier_usage', 'autre'];
/**
 * T-045 : préavis non exécuté en tout ou en partie (CCN art. 64 et 64.2).
 * - `am_acceptee` : l'AM a demandé à ne pas faire tout ou partie du préavis et les parents l'ont accepté (art. 64.2, al. 2).
 * - `employeur` : les parents dispensent l'AM de tout ou partie du préavis (art. 64.2, al. 1).
 * - `am_sans_accord` : l'AM ne fait pas son préavis sans l'accord des parents (art. 64.2, al. 2, fin).
 */
export type DemandeurInexecution = 'am_acceptee' | 'employeur' | 'am_sans_accord';
/**
 * T-045b (P3-B1) : réponses de l'écran Fin enregistrées avec le contrat. Le calcul des mois s'en sert pour savoir si la date
 * de fin saisie concorde avec le préavis.
 */
export interface Rupture {
  motif: Motif;
  /** Date d'envoi de la lettre (ou de remise, ou du décès) */
  notif: ISODate;
  /** Date de première présentation de la lettre recommandée, si elle est après l'envoi */
  presentation?: ISODate;
  preavis: 'execute' | DemandeurInexecution;
  dernierJourTravaille?: ISODate;
  /** T-076 : CDD seulement (motif `fin_cdd`) : comment le CDD finit. `notif` porte alors le dernier jour du contrat. */
  finCdd?: FinCdd | FinCddNonGere;
}

export interface Contract {
  id: string;
  /** Prénom de l'enfant (copié dans le compte de l'AM ; jamais envoyé à la mesure d'usage) */
  child: string;
  /** Nom de la famille / du parent employeur */
  family: string;
  color: number;
  start: ISODate;
  end?: ISODate;
  /** T-045b : réponses de l'écran Fin (lettre, préavis), enregistrées avec la date de fin */
  rupture?: Rupture;
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
  /**
   * Majoration des heures complémentaires (jusqu'à 45 h), seulement si le contrat la prévoit (pour cent, 0 par défaut).
   * R-HC-02 : CCN art. 96.4 et 110.2. Non renseigné sur les anciens contrats : 0.
   */
  majorationCompl?: number;
  /** Indemnité d'entretien prévue au contrat par jour (centimes) — le plancher légal s'applique s'il est supérieur */
  entretienJour: number;
  /**
   * T-044 : indemnité d'entretien prévue au contrat par heure de travail (centimes). CCN art. 114.1 : « versée en cas de
   * travail effectif, par heure de travail. Le montant horaire de cette indemnité est prévu dans le contrat de travail ».
   * Renseignée (> 0), elle remplace `entretienJour`. Absente sur les anciens contrats : tarif par jour.
   */
  entretienHeure?: number;
  /** T-044b : choix explicite de l'AM, « par heure » ou « par jour » (sans valeur par défaut sur un nouveau contrat). Absent : déduit du montant saisi. */
  entretienMode?: 'heure' | 'jour';
  /** Prix d'un repas fourni (centimes) et nombre de repas par jour d'accueil */
  repasPrix: number;
  repasParJour: number;
  /** Les parents fournissent les repas de l'enfant : avantage en nature imposable (impots.gouv). Non renseigné sur les anciens contrats. */
  repasParents?: boolean;
  /** Avenants, du plus ancien au plus récent */
  avenants?: Avenant[];
  /** Indemnité kilométrique (centimes par km) */
  kmTaux: number;
  /**
   * Puissance fiscale de la voiture de l'AM (CV), pour contrôler le tarif contre les barèmes (CCN art. 57, T-017).
   * Non renseignée : contrôle impossible, signalé.
   */
  kmCv?: number;
  cpMode: CpPayMode;
  /** Enfant ouvrant droit à l'abattement fiscal majoré (handicap, maladie, inadaptation) */
  majoreFiscal: boolean;
  /**
   * Le parent a adhéré à Pajemploi+ : l'Urssaf prélève le parent et verse le salaire à l'AM.
   * Condition du CMG à partir du 1er septembre 2027 (LFSS 2026, article 101). Non renseigné sur les anciens contrats.
   */
  pajemploiPlus?: boolean;
  /**
   * T-031 : cas que l'app ne gère pas, demandés à la création du contrat. Vrai : tous les mois calculés du contrat sont
   * refusés (« non géré »). Absent (contrats d'avant T-031) : réponse à donner, signalée dans chaque mois.
   * L'AM travaille dans le Bas-Rhin, le Haut-Rhin ou la Moselle.
   */
  alsaceMoselle?: boolean;
  /**
   * T-038 suite 2 (décision du DG) : l'AM travaille à Mayotte. Vrai : contrat non géré (SMIC, minimum et cotisations propres
   * à Mayotte ; Urssaf « Rémunérer un salarié à domicile ou un assistant maternel » : minimum net de 3,70 € au 01/06/2026
   * à Mayotte contre 3,28 € en métropole et Drom). Absent : « Ailleurs en France (hors Mayotte) » ou Alsace-Moselle.
   */
  mayotte?: boolean;
  /** Horaires qui changent d'une semaine à l'autre (semaines A et B, planning remis par écrit, CCN art. 98.1.2) */
  planningVariable?: boolean;
  /** Accueil occasionnel : « de courte durée et n'a pas de caractère régulier » (CCN art. 97.2) */
  accueilOccasionnel?: boolean;
  /**
   * Contrat à durée déterminée. T-033 (18/11/2026) : réponse demandée ; absent = réponse à donner. T-076 (22/11/2026) : le CDD
   * est calculé (regles/t076-cdd.md ; regles/t076-decisions-direction.md, section 2).
   */
  cdd?: boolean;
  /**
   * T-076 : date de fin prévue du CDD (terme précis), ou date de fin de la durée minimale (remplacement sans date précise,
   * C. trav. L1242-7 ; `cddTermeImprecis` vrai). Sert au cas P1 (CDD de moins d'un mois), aux contrôles et à l'écran Fin.
   */
  cddTerme?: ISODate;
  /** T-076 : vrai = « jusqu'au retour de la personne remplacée », `cddTerme` est la fin de la durée minimale */
  cddTermeImprecis?: boolean;
  /** T-076 : motif du CDD (R-CDD-03) ; message seulement, aucun effet sur les montants */
  cddMotif?: 'remplacement' | 'autre';
  /** Date à partir de laquelle l'app suit le contrat (avant : historique) */
  trackedFrom: ISODate;
  balances: StartBalances;
  history: HistoryMonth[];
  createdAt: number;
  /** Lien privé pour les parents (clés gardées dans le compte de l'AM, jamais en clair en ligne ailleurs) */
  partage?: { id: string; secret: string; code: string; salt: string; createdAt: number };
}

export type ChildAbs = 'malade_certif' | 'malade' | 'parents' | 'sans_solde_enfant';
/**
 * Type d'absence de l'AM enregistré. `non_gere` : absence que l'app ne calcule pas (T-031, charte verrou 6), saisie pour que
 * l'app refuse les mois, les congés et la fin de contrat concernés. Décision du DG du 21/11/2026 (« sans la raison ») : le
 * cas précis (maternité, accident du travail…) n'est pas enregistré, seulement « non gérée » et les dates.
 */
export type AmAbs = 'cp' | 'am_malade' | 'am_enfant_malade' | 'evenement' | 'sans_solde' | 'non_gere';
/**
 * Cas non gérés proposés dans la liste de choix de l'écran (T-031). Ils servent seulement à l'écran : l'app enregistre
 * `non_gere`, jamais le cas choisi (décision du DG du 21/11/2026). Les saisies d'avant portent encore ces valeurs dans
 * `type` : la lecture les ramène à `non_gere` (absences.ts).
 */
export type AmAbsNonGeree = 'maternite' | 'paternite' | 'naissance_supp' | 'accident_travail';
export const AM_ABS_NON_GEREES: AmAbsNonGeree[] = ['maternite', 'paternite', 'naissance_supp', 'accident_travail'];

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
  /**
   * T-025 C-2. Vrai : ce trajet est demandé par plusieurs particuliers employeurs (CCN art. 113 : « Lorsque plusieurs
   * particuliers employeurs sont demandeurs de déplacements, l'indemnité due par chacun d'entre eux est déterminée au
   * prorata du nombre d'enfants transportés »). Faux : seule cette famille l'a demandé, l'indemnité est due en entier
   * (art. 113 al. 2 et art. 57). Absent (saisies d'avant T-025) : voir `kmEnfants`.
   */
  kmPartage?: boolean;
  /**
   * Enfants présents dans la voiture pour ces km, y compris ceux de l'AM si le trajet répond à leurs besoins (CCN
   * art. 113). Sert seulement au partage, quand plusieurs familles ont demandé le trajet.
   */
  kmEnfants?: number;
}

/**
 * Nature d'un événement familial (CCN art. 48.1.3.1.1 et 48.1.3.1.2 ; C. trav. L3142-4) : la durée prévue en dépend (T-023).
 * Décision du DG du 21/11/2026 : la nature sert seulement à l'écran de saisie, pour proposer la durée. Elle n'est jamais
 * enregistrée : seule la durée l'est (`AmLeave.joursEvenement`).
 */
export type NatureEvenement = 'mariage' | 'mariage_enfant' | 'naissance' | 'deces_enfant' | 'deces_enfant_14' | 'deces_proche'
  | 'handicap_enfant' | 'deces_descendant' | 'deces_ascendant' | 'deuil';

export interface AmLeave {
  id: string;
  type: AmAbs;
  from: ISODate;
  to: ISODate;
  /**
   * Événement familial seulement : nombre de jours ouvrables payés prévus pour cet événement, calculé à la saisie à partir
   * de la nature choisie et de la date de début (evenements.ts, dureeEvenement). 0 : durée non gérée par l'app (jours « à
   * confirmer »). Absent (absence saisie avec l'app en ligne avant la n° 52, sans nature) : jours payés comme avant
   * (décision du DG du 21/11/2026, « Payer comme avant »), hors de tout groupe « suite de ».
   * Décision du DG du 21/11/2026 (« sans la raison ») : la nature n'est ni enregistrée, ni envoyée, ni affichée.
   */
  joursEvenement?: number;
  /**
   * Événement familial seulement : identifiant interne de l'absence dont celle-ci est la suite (même événement saisi en
   * plusieurs fois), quand l'AM a répondu « oui » à la question de la saisie (décision du DG du 21/11/2026). Ne dit rien
   * de la raison. Absent : événement à part.
   */
  suiteDe?: string;
}

export interface Settings {
  amName: string;
  /** Enfants à charge de l'AM de moins de 15 ans (congés supplémentaires) */
  enfantsACharge: number;
  /**
   * Dernière année `y` où l'AM avait moins de 21 ans au 30 avril `y`, déclarée par une case à cocher (pas de date de
   * naissance, décision du DG du 18/11/2026 : donnée minimale). Sert seulement aux jours pour enfants à charge
   * (R-CP-03 ; CCN art. 48.1.3.3 ; C. trav. L3141-8). Vide : l'app applique la règle des 21 ans et plus.
   */
  amMoins21Jusqu?: number;
  lastBackup?: number;
  lastAutoCopy?: number;
  lastExport?: Month;
  /** Liens parents coupés : un autre appareil ou une vieille sauvegarde ne doit pas les rouvrir */
  liensCoupes?: string[];
  persisted?: boolean;
  onboarded?: boolean;
  /** Écran Aujourd'hui en liste compacte (tous les enfants visibles d'un coup) */
  compact?: boolean;
  /** Conditions d'utilisation acceptées : version (CONDITIONS_VERSION de legal.ts) et date (AAAA-MM-JJ). Copié dans le compte. */
  conditionsAcceptees?: { version: string; date: string };
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
  /** Texte lu par les parents et par le résumé (recalculé à partir des champs précis quand il y en a) */
  detail: string;
  /** Sieste : période de sommeil commencée à `time` (terminée quand `fin` est rempli) */
  sommeil?: boolean;
  /** Sieste : heure du réveil (HH:MM) */
  fin?: string;
  /** Repas : quantité du biberon en ml */
  ml?: number;
  /** Soin : température en °C (une décimale) */
  temp?: number;
}

export const CHILD_ABS_LABEL: Record<ChildAbs, string> = {
  malade_certif: 'Malade, avec certificat',
  malade: 'Malade, sans certificat',
  parents: 'Absent à la demande des parents',
  // T-035b : ancienne option, plus proposée à la saisie ; les jours déjà notés ainsi sont payés (CCN art. 105).
  sans_solde_enfant: 'Absent, noté « sans solde »',
};

export const AM_ABS_LABEL: Record<AmAbs, string> = {
  cp: 'Mes congés payés',
  am_malade: 'Je suis malade',
  am_enfant_malade: 'Mon enfant est malade',
  evenement: 'Événement familial',
  sans_solde: 'Congé sans solde',
  non_gere: 'Absence non gérée par l’app',
};

/** Libellés des cas non gérés, pour la liste de choix seulement (jamais enregistrés) */
export const AM_ABS_NON_GEREE_LABEL: Record<AmAbsNonGeree, string> = {
  maternite: 'Congé maternité',
  paternite: 'Congé paternité et d’accueil de l’enfant',
  naissance_supp: 'Congé supplémentaire de naissance',
  accident_travail: 'Accident du travail ou maladie professionnelle',
};
