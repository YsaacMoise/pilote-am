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
  /**
   * T-103 (C5) : ces jours déjà déduits venaient-ils de l'absence de 14 jours calendaires (vrai) ou d'absences courtes
   * (faux) ? CCN 105. Demandé une fois, seulement si le calcul en dépend.
   */
  maladieDeduitsLongue?: boolean;
}

/** Conditions du contrat qu'un avenant peut changer */
/**
 * Conditions qu'un avenant peut changer. T-104 (cas 3, regles/t104-horaires-variables.md) : aussi les horaires variables
 * (planning variable ou non, forme, cycle et sa semaine de départ, heures payées chaque mois). Les plannings remis semaine par
 * semaine (`planningsSemaines`) restent au contrat : ils sont datés par leur lundi.
 */
export type Terms = Pick<Contract, 'planning' | 'rateNet' | 'rateBrut' | 'majoration' | 'majorationCompl' | 'entretienJour' | 'entretienHeure' | 'entretienMode' | 'repasPrix' | 'repasParJour' | 'repasParents' | 'kmTaux' | 'yearType' | 'weeks' | 'weeksOff' | 'planningVariable' | 'pvForme' | 'cycle' | 'cycleAncre' | 'heuresMensualisees'>;
export const TERM_KEYS: (keyof Terms)[] = ['planning', 'rateNet', 'rateBrut', 'majoration', 'majorationCompl', 'entretienJour', 'entretienHeure', 'entretienMode', 'repasPrix', 'repasParJour', 'repasParents', 'kmTaux', 'yearType', 'weeks', 'weeksOff', 'planningVariable', 'pvForme', 'cycle', 'cycleAncre', 'heuresMensualisees'];

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
/** T-107 (cas 5) : `agrement` : suspension, modification ou retrait de l'agrément de l'AM, retrait forcé de l'enfant (CCN 119.3) */
/**
 * T-109 (comparateur, correction 6) : `retraite` (départ volontaire à la retraite de l'AM, CCN 63.2.2, 119.2.2, 120, 121.2,
 * annexe 4) ; `faute_lourde` (CCN 64.3, 120, 121.1) ; `deces_am` (décès de l'AM, CCN 63.3.2, 119.4.1) ; `deces_employeur`
 * (comparateur, section 6, point 7) : aucune règle pour l'AM (CCN 63.3.1 renvoie aux socles spécifiques ; le socle AM n'en dit
 * rien) : jamais calculé, l'écran renvoie au retrait de l'enfant (CCN 119.1).
 */
export type Motif = 'retrait' | 'demission' | 'retraite' | 'deces' | 'deces_am' | 'deces_employeur' | 'inaptitude' | 'inaptitude_pro' | 'faute_grave' | 'faute_lourde' | 'essai' | 'agrement' | 'fin_cdd';
/** T-109 : motifs avec un préavis (CCN 120 : rupture à l'initiative du particulier employeur ou du salarié) */
export const avecPreavisMotif = (m: Motif | undefined): boolean => m === 'retrait' || m === 'demission' || m === 'retraite';
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
/*
 * T-107 (cas 4, regles/t107-fins-cdd.md) :
 * - `jeune_vacances` : CDD d'un jeune pour une période comprise dans ses vacances scolaires ou universitaires, au terme
 *   (L1243-10, 2° : pas d'IFC) ;
 * - `saisonnier` : CDD saisonnier au terme (L1242-2, 3° ; L1243-10, 1° : pas d'IFC) ;
 * - `force_majeure` : rupture anticipée pour force majeure (L1243-1 ; L1243-10, 4° : pas d'IFC ; sinistre : indemnité
 *   compensatrice des rémunérations jusqu'au terme, L1243-4, al. 2) ;
 * - `inaptitude` : rupture anticipée pour inaptitude constatée par le médecin du travail (L1243-1 ; IFC due, L1243-8, que
 *   L1243-10 n'exclut pas ; ni dommages et intérêts, L1243-4, al. 1) ;
 * - `agrement` : suspension, modification ou retrait de l'agrément (CASF L421-1 et L423-2 ; regles/t107-fins-cdd.md).
 */
export type FinCdd = 'terme' | 'suite_cdi' | 'refus_cdi' | 'initiative_am' | 'faute_grave' | 'essai' | 'commun_accord' | 'employeur'
  | 'jeune_vacances' | 'saisonnier' | 'force_majeure' | 'inaptitude' | 'agrement';
/**
 * T-076 : fins de CDD que l'app ne calcule pas. T-107 : plus aucune ; type gardé pour lire les anciennes valeurs (jamais
 * enregistrées, décision D17) : `saisonnier_usage` (remplacé par `saisonnier`) et `autre` (remplacé par `agrement`).
 */
export type FinCddNonGere = 'saisonnier_usage' | 'autre';
export const FINS_CDD: FinCdd[] = ['terme', 'suite_cdi', 'refus_cdi', 'commun_accord', 'initiative_am', 'employeur', 'faute_grave', 'essai',
  'force_majeure', 'inaptitude', 'agrement', 'jeune_vacances', 'saisonnier'];
export const FINS_CDD_NON_GEREES: FinCddNonGere[] = [];
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
  /**
   * T-076 : CDD seulement (motif `fin_cdd`) : comment le CDD finit. `notif` porte alors le dernier jour du contrat.
   * Décision D17 : une fin non gérée (force majeure, inaptitude…) n'est jamais enregistrée : seules les fins calculées.
   */
  finCdd?: FinCdd;
  /**
   * T-107 (cas 1) : préavis fait en entier, congés payés pris pendant le préavis : accord écrit et signé des parties pour que
   * les congés et le préavis se cumulent (CCN 64.1). Vrai : pas de suspension ; faux : le préavis est prorogé des jours de
   * congé. Demandé seulement quand des congés tombent dans le préavis.
   */
  cumulCpPreavis?: boolean;
  /*
   * T-109 (second contrôle qualité de la n° 67, décision de la direction du 26/11/2026) : Arvela ne demande pas si l'AM est
   * enceinte et n'enregistre rien qui en dépende (ni `grossesse`, ni résultat qui la code). L'écran de fin donne les deux cas
   * en texte. Les anciens champs `grossesse` et `sommeDuePreavis` (branche jamais publiée) sont retirés à la lecture, à
   * l'enregistrement et à l'envoi en ligne (absences.ts, ruptureSansSante).
   */
  /**
   * T-109 (correction 7) : rupture pendant l'essai d'un CDI, contrat conclu pour un autre enfant de la même famille alors qu'un
   * contrat était en cours avec une période d'essai concluante : essai de 30 jours calendaires au plus (CCN 95.1, al. 3).
   * Demandé seulement quand un tel contrat existe et que la rupture tombe après ces 30 jours.
   */
  essaiAutreEnfant?: boolean;
  /**
   * T-107 (cas 4) : CDD rompu pour force majeure : la force majeure est un sinistre (L1243-4, al. 2 : indemnité compensatrice
   * égale aux rémunérations jusqu'au terme). Demandé seulement dans ce cas.
   */
  sinistre?: boolean;
  /**
   * T-107 (cas 4) : CDD de remplacement sans terme précis rompu pour un sinistre : date à laquelle le CDD aurait pris fin
   * (retour de la personne remplacée ; L1242-7). Demandée seulement dans ce cas.
   */
  termeSinistre?: ISODate;
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
  /**
   * T-103 (D1) : taux horaire brut écrit au contrat (centimes). CCN 41.1 : la rémunération, « incluant le salaire horaire »,
   * figure au contrat ; CCN 107 et 109 : le salaire se calcule sur le salaire horaire brut. Connu, le brut est exact
   * (net × brut ÷ net du contrat) ; absent, l'app le demande au lieu d'afficher une estimation.
   */
  rateBrut?: number;
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
  /** T-103 (K2) : voiture électrique (barème fiscal majoré de 20 %, CGI ann. IV art. 6 B, II). Demandé si le contrôle en dépend. */
  kmElectrique?: boolean;
  cpMode: CpPayMode;
  /** Enfant ouvrant droit à l'abattement fiscal majoré (handicap, maladie, inadaptation) */
  majoreFiscal: boolean;
  /**
   * Le parent a adhéré à Pajemploi+ : l'Urssaf prélève le parent et verse le salaire à l'AM.
   * Condition du CMG à partir du 1er septembre 2027 (LFSS 2026, article 101). Non renseigné sur les anciens contrats.
   */
  pajemploiPlus?: boolean;
  /**
   * L'AM travaille dans le Bas-Rhin, le Haut-Rhin ou la Moselle. Demandé depuis T-031 ; calculé depuis T-077 (engine/regions.ts :
   * cotisation du régime local, jours fériés et préavis locaux). T-104 : aussi avec des horaires variables ou un CDD. Absent (contrats d'avant T-031) : réponse à donner, signalée dans chaque mois.
   */
  alsaceMoselle?: boolean;
  /**
   * T-038 suite 2 (décision du DG) : l'AM travaille à Mayotte. Calculé depuis T-077 avec le SMIC, le minimum et les
   * cotisations propres à Mayotte (engine/regions.ts ; Urssaf « Rémunérer un salarié à domicile ou un assistant maternel » :
   * minimum net de 3,70 € au 01/06/2026 à Mayotte contre 3,28 € en métropole et Drom). T-104 : aussi avec des horaires
   * variables ou un CDD. Absent : « Ailleurs en France (hors Mayotte) » ou Alsace-Moselle.
   */
  mayotte?: boolean;
  /**
   * T-079 (décision de la direction, consigne T-071) : numéro du département où l'AM accueille l'enfant (« 75 », « 2A »,
   * « 976 »). Il remplace la question « Où travailles-tu ? » à l'écran ; alsaceMoselle et mayotte en sont déduits
   * (engine/departements.ts) et restent les seuls champs lus par le calcul. Absent : contrat saisi avant la T-079.
   */
  departement?: string;
  /** Horaires qui changent d'une semaine à l'autre (semaines A et B, planning remis par écrit, CCN art. 98.1.2) */
  planningVariable?: boolean;
  /**
   * T-076 (regles/t076-decisions-direction.md, section 1) : forme du planning variable. `cycle` (S1) : semaines types écrites
   * au contrat (CCN 98.1.1) ; `remis` (S2) : planning écrit remis par les parents (CCN 98.1.2). Absent : déduit des champs
   * remplis (`cycle` ou `planningsSemaines`). Sans effet quand `planningVariable` n'est pas vrai.
   */
  pvForme?: 'cycle' | 'remis';
  /** T-076, S1 : 2 à 4 semaines types (planning d'une semaine chacune), dans l'ordre du cycle */
  cycle?: Planning[];
  /** T-076, S1 : lundi d'une semaine qui suit la première semaine type du cycle (le cycle suit le calendrier, P-PV-4 lecture Q1) */
  cycleAncre?: ISODate;
  /**
   * T-076, S2 : planning de chaque semaine (clé : lundi, AAAA-MM-JJ). Un planning vide ({}) = semaine sans accueil (0 h).
   * Une semaine absente = planning non saisi : les mois qu'elle touche ne sont pas calculés.
   */
  planningsSemaines?: Record<ISODate, Planning>;
  /** T-076 : heures payées chaque mois, écrites au contrat (heures, décimal ; CASF D423-5, 14° ; R-PV-03). Obligatoire en planning variable. */
  heuresMensualisees?: number;
  /** Accueil occasionnel : « de courte durée et n'a pas de caractère régulier » (CCN art. 97.2) */
  accueilOccasionnel?: boolean;
  /**
   * T-104 (regles/t104-accueil-occasionnel.md) : accueil occasionnel, périodes d'accueil prévues au contrat (CCN 98.2 : « Les
   * conditions de l'accueil occasionnel sont déterminées dans le contrat de travail »), chacune avec ses dates et ses horaires
   * prévus (planning d'une semaine type, vide si le contrat ne fixe pas d'horaires). Hors de ces périodes : aucun accueil prévu.
   */
  accueils?: AccueilOcc[];
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
  /**
   * T-103 (D10) : dernier jour de la période d'essai écrite au contrat (CCN 41.1 : la durée de la période d'essai figure au
   * contrat). Demandé seulement quand le CDD finit pendant l'essai.
   */
  cddEssaiFin?: ISODate;
  /**
   * T-109 (comparateur, correction 9) : accord écrit de l'AM pour un contrat de plus de 48 h par semaine en moyenne (CASF
   * L423-22, al. 2). Demandé seulement au-delà de 48 h.
   */
  accord48h?: boolean;
  /** T-103 : CDD suivi après son début : jours de congés payés pris pendant le CDD avant le suivi (plancher L1242-16) */
  cddCpPrisAvantSuivi?: number;
  /** T-076 : motif du CDD (R-CDD-03) ; message seulement, aucun effet sur les montants */
  cddMotif?: 'remplacement' | 'autre';
  /**
   * T-109 (comparateur, correction 12) : cas du remplacement (C. trav. L1242-2, 1°), qui fixe la durée maximale d'un CDD à terme
   * précis (L1242-8-1) : `absence` (18 mois), `attente_cdi` (attente de l'arrivée d'une AM embauchée en CDI : 9 mois),
   * `depart_suppression` (départ définitif de l'AM avant la suppression de son poste : 24 mois).
   */
  cddCasRemplacement?: 'absence' | 'attente_cdi' | 'depart_suppression';
  /** Date à partir de laquelle l'app suit le contrat (avant : historique) */
  trackedFrom: ISODate;
  /**
   * T-103 (C8) : jour de repos hebdomadaire (1 = lundi … 7 = dimanche), CCN 46 (« prévue par le contrat de travail »).
   * Demandé seulement si le planning prévoit le dimanche : il sert au décompte des jours ouvrables (CCN 48, liminaire).
   */
  reposHebdo?: number;
  balances: StartBalances;
  history: HistoryMonth[];
  createdAt: number;
  /** Lien privé pour les parents (clés gardées dans le compte de l'AM, jamais en clair en ligne ailleurs) */
  partage?: { id: string; secret: string; code: string; salt: string; createdAt: number };
}

/** T-104 : une période d'accueil occasionnel (du premier au dernier jour, horaires prévus de chaque jour de la semaine) */
export interface AccueilOcc { id: string; du: ISODate; au: ISODate; planning: Planning }

export type ChildAbs = 'malade_certif' | 'malade' | 'parents' | 'sans_solde_enfant';
/**
 * Type d'absence de l'AM enregistré. `non_gere` : absence que l'app ne calcule pas (T-031, charte verrou 6), saisie pour que
 * l'app refuse les mois, les congés et la fin de contrat concernés. Décision du DG du 21/11/2026 (« sans la raison ») : le
 * cas précis (maternité, accident du travail…) n'est pas enregistré, seulement « non gérée » et les dates.
 */
/**
 * T-109 (comparateur, correction 5) : absences payées de l'AM. `formation` : formation obligatoire des assistants maternels
 * (CASF L421-14) ; « La rémunération [...] reste due par l'employeur : 1° Pendant les périodes de formation » (CASF L423-5) ;
 * « constitue un temps de travail effectif » (C. trav. L6321-2, applicable par CASF L423-2, 17°).
 * `examen_grossesse` : examens médicaux obligatoires de la grossesse (C. trav. L1225-16, applicable par CASF L423-2) : « Ces
 * absences n'entraînent aucune diminution de la rémunération ».
 * `remuneree` (décision du DG du 26/11/2026) : absence payée par les parents, sans motif. C'est la seule forme qui part en
 * ligne pour un examen de grossesse (le motif reste sur le téléphone de l'AM) ; l'AM peut aussi la choisir pour toute autre
 * absence que les parents lui paient. Même calcul que l'examen : payée, hors du seuil des heures, comptée pour les congés.
 */
export type AmAbsPayee = 'formation' | 'examen_grossesse' | 'remuneree';
export type AmAbs = 'cp' | 'am_malade' | 'am_enfant_malade' | 'evenement' | 'sans_solde' | 'non_gere' | AmAbsPayee | AmSuspension;
/**
 * T-104 (regles/t104-absences-protegees.md ; décision du DG du 22/11/2026 : la raison est enregistrée pour ces absences) :
 * suspensions du contrat calculées par l'app. Congé de maternité (C. trav. L1225-17, L1225-24), congé de paternité et
 * d'accueil de l'enfant (L1225-35), congé supplémentaire de naissance (L1225-46-2), accident du travail, de trajet ou
 * maladie professionnelle (CCN 49 ; CSS L411-1, L411-2, L461-1).
 */
export type AmSuspension = 'maternite' | 'paternite' | 'naissance_supp' | 'at_mp';
export const AM_SUSPENSIONS: AmSuspension[] = ['maternite', 'paternite', 'naissance_supp', 'at_mp'];
/** T-104 : nature de l'arrêt « accident du travail ou maladie professionnelle » (les effets diffèrent : CCN 49, 64.1 ; CSS L433-1) */
export type NatureAtMp = 'accident' | 'trajet' | 'maladie_pro';
/**
 * Cas non gérés proposés dans la liste de choix de l'écran (T-031). Ils servent seulement à l'écran : l'app enregistre
 * `non_gere`, jamais le cas choisi (décision du DG du 21/11/2026). Les saisies d'avant portent encore ces valeurs dans
 * `type` : la lecture les ramène à `non_gere` (absences.ts).
 */
export type AmAbsNonGeree = 'maternite' | 'paternite' | 'naissance_supp' | 'accident_travail';
export const AM_ABS_NON_GEREES: AmAbsNonGeree[] = ['maternite', 'paternite', 'naissance_supp', 'accident_travail'];
/** T-104 : seule valeur d'avant encore ramenée à la lecture (« accident_travail » devient `at_mp`, nature à préciser) */
export const AM_ABS_ANCIENNES: string[] = ['accident_travail'];

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
  /**
   * T-103 (C3) : enfant malade (abs = 'malade_certif') : premier et dernier jour couverts par le certificat médical ou le
   * bulletin d'hospitalisation (CCN 105 compte « 14 jours calendaires consécutifs »). Demandés à la saisie.
   */
  certifDu?: ISODate;
  certifAu?: ISODate;
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
  /*
   * T-109 (contrôles qualité de la n° 67) : aucune marque propre à un événement. Les « sept jours ouvrés » d'avant 2022
   * (C. trav. L3142-4, 4°) s'enregistrent comme tout événement (`joursEvenement` : 7) et se comptent au calcul, contrat par
   * contrat, sur les jours de travail prévus (evenements.ts, dureeEnJoursOuvres).
   * Les anciennes marques `joursOuvres` et `joursEvenementContrat` sont retirées à la lecture et à l'envoi (absences.ts).
   */
  /**
   * Événement familial seulement : identifiant interne de l'absence dont celle-ci est la suite (même événement saisi en
   * plusieurs fois), quand l'AM a répondu « oui » à la question de la saisie (décision du DG du 21/11/2026). Ne dit rien
   * de la raison. Absent : événement à part.
   */
  suiteDe?: string;
  /**
   * T-103 (C9) : congé indemnisé par la Sécurité sociale (congé de deuil, CCN 48.1.3.1.2 et 48.1.3.1.3) : montant net des
   * indemnités journalières de la CPAM pour ce
   * congé, en centimes. Le salaire est maintenu « sous déduction des indemnités journalières versées ». Demandé à la saisie.
   */
  ijSecu?: number;
  /**
   * T-103 (N1) : salaires bruts versés à l'AM, les 3 mois civils avant l'absence, par ses employeurs qui ne sont pas dans
   * l'app (centimes ; 0 si aucun). Sert à la part des indemnités journalières de chaque parent (CSS R323-4).
   */
  ijSalairesAutres?: number;
  /** T-104 : arrêt `at_mp` seulement : accident du travail, accident de trajet ou maladie professionnelle (demandé à la saisie) */
  atmp?: NatureAtMp;
  /**
   * T-104 : arrêt `at_mp` pour un accident (du travail ou de trajet) : vrai si le premier jour de l'absence est le jour de
   * l'accident. CSS L433-1 : « La journée de travail au cours de laquelle l'accident s'est produit, quel que soit le mode de
   * paiement du salaire, est intégralement à la charge de l'employeur. » Demandé à la saisie.
   */
  jourAccident?: boolean;
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
  /**
   * T-103 (K2) : kilomètres faits pour le travail avec la voiture de l'AM, par année civile (« AAAA »), tous parents
   * confondus. Sert seulement au contrôle du tarif kilométrique (CCN 57 : barème de l'administration et barème fiscal).
   */
  kmAnnee?: Record<string, number>;
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
  non_gere: 'Absence à préciser',
  formation: 'Formation obligatoire',
  examen_grossesse: 'Examen médical de grossesse',
  remuneree: 'Absence payée',
  maternite: 'Congé maternité',
  paternite: 'Congé paternité et d’accueil de l’enfant',
  naissance_supp: 'Congé supplémentaire de naissance',
  at_mp: 'Accident du travail ou maladie professionnelle',
};

/** T-104 : libellés de la nature d'un arrêt `at_mp` */
export const NATURE_ATMP_LABEL: Record<NatureAtMp, string> = {
  accident: 'Accident du travail',
  trajet: 'Accident de trajet',
  maladie_pro: 'Maladie professionnelle',
};

/** Libellés des cas non gérés, pour la liste de choix seulement (jamais enregistrés) */
export const AM_ABS_NON_GEREE_LABEL: Record<AmAbsNonGeree, string> = {
  maternite: 'Congé maternité',
  paternite: 'Congé paternité et d’accueil de l’enfant',
  naissance_supp: 'Congé supplémentaire de naissance',
  accident_travail: 'Accident du travail ou maladie professionnelle',
};
