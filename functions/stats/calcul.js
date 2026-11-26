// T-127 : calculs purs des totaux d'Arvela (aucun accès à Firebase ; testés par functions/stats/test/calcul.test.js).
//
// Règle : seuls des nombres sortent d'ici. Aucun identifiant, aucune adresse, aucun prénom, aucune date de naissance.
// L'événement est construit clé par clé à partir des listes blanches ci-dessous, jamais par copie d'un objet reçu.

/** Version de la fonction, envoyée avec les totaux pour savoir quel calcul les a produits. */
export const VERSION = 'stats-1';
export const JOUR_MS = 24 * 3600 * 1000;
/** Nombre de semaines du tableau des inscriptions (semaine en cours comprise). */
export const SEMAINES = 26;

/** Clés de l'événement envoyé à PostHog, et seulement elles. */
export const CLES_EVENEMENT = ['api_key', 'event', 'distinct_id', 'properties', 'timestamp'];
/** Totaux tirés des seuls comptes (Firebase Authentication ; Arvela en est responsable : registre, A1). Nombres entiers. */
export const CLES_COMPTES = [
  'inscrites_total', 'nouvelles_1j', 'nouvelles_7j', 'nouvelles_30j',
  'connectees_7j', 'connectees_30j', 'emails_verifies', 'comptes_exclus',
];
/**
 * Totaux tirés des données que l'AM confie à Arvela pour son compte (registre, partie B) : calculés et envoyés seulement si le
 * paramètre STATS_DONNEES_CONFIEES est vrai (décision du DG, docs/stats.md, section 2). Nombres entiers.
 */
export const CLES_DONNEES_CONFIEES = ['actives_7j', 'actives_30j', 'comptes_avec_contrat', 'contrats_en_cours', 'liens_parents_actifs'];
/** Tous les totaux possibles. */
export const CLES_NOMBRES = [...CLES_COMPTES, ...CLES_DONNEES_CONFIEES];
/**
 * Réglages de PostHog (pas des données) : `$process_person_profile: false` (aucune fiche de personne créée pour
 * `arvela-serveur`, comme `person_profiles: 'never'` de l'app) et `$geoip_disable: true` (aucune localisation tirée de
 * l'adresse du serveur, comme l'app).
 */
const CLES_FIXES = ['inscrites_par_semaine', 'version', '$process_person_profile', '$geoip_disable'];
/** Propriétés de l'événement, selon que les totaux des données confiées sont envoyés ou non. */
export function clesProprietes(donneesConfiees) {
  return [...CLES_COMPTES, ...(donneesConfiees ? CLES_DONNEES_CONFIEES : []), ...CLES_FIXES];
}
/** Clés d'une ligne du tableau des semaines. */
export const CLES_SEMAINE = ['lundi', 'nombre'];
export const EVENEMENT = 'stats_jour';
export const DISTINCT_ID = 'arvela-serveur';

/** Liste des comptes exclus (comptes de test), écrite dans le paramètre STATS_COMPTES_EXCLUS : séparés par virgule ou espace. */
export function listeExclus(texte) {
  return new Set(String(texte ?? '').split(/[\s,;]+/).filter(Boolean));
}

const FMT_PARIS = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Jour à Paris (AAAA-MM-JJ) d'un instant en millisecondes. */
export function jourParis(ms) {
  return FMT_PARIS.format(new Date(ms));
}

/** Jour décalé de n jours (calcul sur la date seule, sans heure). */
export function ajouterJours(jour, n) {
  const [a, m, j] = jour.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
}

/** Lundi (AAAA-MM-JJ) de la semaine, à l'heure de Paris, d'un instant en millisecondes. */
export function lundiParis(ms) {
  const jour = jourParis(ms);
  const [a, m, j] = jour.split('-').map(Number);
  const js = new Date(Date.UTC(a, m - 1, j)).getUTCDay(); // 0 = dimanche
  return ajouterJours(jour, -((js + 6) % 7));
}

const ms = (texte) => {
  const t = texte ? Date.parse(texte) : NaN;
  return Number.isFinite(t) ? t : null;
};

/**
 * Dernier passage d'un compte : la plus récente de la dernière connexion (`lastSignInTime`) et du dernier renouvellement de
 * session (`lastRefreshTime` : Firebase renouvelle la session environ chaque heure quand l'app est ouverte et en ligne ; une AM
 * restée connectée sur son téléphone ne se reconnecte presque jamais).
 */
export function dernierPassage(metadata) {
  const a = ms(metadata?.lastSignInTime);
  const b = ms(metadata?.lastRefreshTime);
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/**
 * Totaux des comptes (Firebase Authentication seulement). `comptes` : [{ creation, passage, verifie }], comptes de test déjà
 * retirés. `creation` et `passage` en millisecondes (null si inconnu).
 */
export function totauxComptes(comptes, maintenant) {
  const depuis = (jours) => maintenant - jours * JOUR_MS;
  const nb = (f) => comptes.filter(f).length;
  const recente = (t, jours) => t !== null && t >= depuis(jours) && t <= maintenant;
  const lundi = lundiParis(maintenant);
  const semaines = [];
  for (let i = SEMAINES - 1; i >= 0; i--) semaines.push(ajouterJours(lundi, -7 * i));
  const parSemaine = new Map(semaines.map((s) => [s, 0]));
  for (const c of comptes) {
    if (c.creation === null || c.creation > maintenant) continue;
    const s = lundiParis(c.creation);
    if (parSemaine.has(s)) parSemaine.set(s, parSemaine.get(s) + 1);
  }
  return {
    inscrites_total: comptes.length,
    nouvelles_1j: nb((c) => recente(c.creation, 1)),
    nouvelles_7j: nb((c) => recente(c.creation, 7)),
    nouvelles_30j: nb((c) => recente(c.creation, 30)),
    connectees_7j: nb((c) => recente(c.passage, 7)),
    connectees_30j: nb((c) => recente(c.passage, 30)),
    emails_verifies: nb((c) => c.verifie === true),
    inscrites_par_semaine: semaines.map((s) => ({ lundi: s, nombre: parSemaine.get(s) })),
  };
}

/**
 * Documents techniques écrits par l'app sans saisie de l'AM : ils ne rendent pas un compte « actif ». Noms : src/sync/plan.ts, `docId`.
 * - `kv~appareil-<id>` : repère écrit chaque jour par chaque appareil à jour (src/cloud.ts, `poserRepere`) ;
 * - `kv~coffre` : empreinte de la clé de secours (T-121, src/sync/backend-firebase.ts, `creerCoffre`) ;
 * - `kv~sequestre` : copie scellée de la clé, écrite par chaque téléphone à l'activation (T-125, src/sync/sequestre.ts) ;
 * - `kv~cleacces-<id>` : paquet d'une clé d'accès (T-125, src/sync/cleacces.ts, `PREFIXE`).
 */
export function estRepere(idDocument) {
  if (typeof idDocument !== 'string') return false;
  return idDocument.startsWith('kv~appareil-') || idDocument.startsWith('kv~cleacces-') || idDocument === 'kv~coffre' || idDocument === 'kv~sequestre';
}

/**
 * Dates d'un contrat lues dans le texte du document, et rien d'autre. `null` : contrat supprimé (pierre tombale, `v` null).
 * Texte illisible : contrat présent, dates inconnues. La partie chiffrée (`sante`) n'est jamais ouverte.
 */
export function datesContrat(v) {
  if (typeof v !== 'string') return null;
  let c;
  try { c = JSON.parse(v); } catch { return { start: undefined, end: undefined }; }
  if (!c || typeof c !== 'object') return { start: undefined, end: undefined };
  return {
    start: typeof c.start === 'string' ? c.start : undefined,
    end: typeof c.end === 'string' && c.end ? c.end : undefined,
  };
}

/** Contrat en cours ce jour-là : même règle que l'app (src/store.ts, `activeContracts`). */
export function contratEnCours(dates, jour) {
  return !!dates && typeof dates.start === 'string' && dates.start <= jour && (!dates.end || dates.end >= jour);
}

const entier = (cle, n) => {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`Total invalide : ${cle}`);
  return n;
};

/**
 * Événement PostHog, construit clé par clé. Toute valeur qui n'est pas un entier positif ou nul arrête l'envoi.
 * `totaux` peut contenir d'autres champs : ils ne sont jamais recopiés. Sans `donneesConfiees`, les totaux tirés des données
 * confiées par l'AM ne partent pas, même s'ils sont présents.
 */
export function evenement(totaux, cleProjet, maintenant, donneesConfiees = false) {
  const properties = {};
  for (const k of CLES_COMPTES) properties[k] = entier(k, totaux[k]);
  if (donneesConfiees) for (const k of CLES_DONNEES_CONFIEES) properties[k] = entier(k, totaux[k]);
  const semaines = totaux.inscrites_par_semaine;
  if (!Array.isArray(semaines) || semaines.length !== SEMAINES) throw new Error('Tableau des semaines invalide');
  properties.inscrites_par_semaine = semaines.map((s) => {
    if (typeof s?.lundi !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.lundi)) throw new Error('Semaine invalide');
    return { lundi: s.lundi, nombre: entier('inscrites_par_semaine', s.nombre) };
  });
  properties.version = VERSION;
  properties.$process_person_profile = false;
  properties.$geoip_disable = true;
  return {
    api_key: cleProjet,
    event: EVENEMENT,
    distinct_id: DISTINCT_ID,
    properties,
    timestamp: new Date(maintenant).toISOString(),
  };
}
