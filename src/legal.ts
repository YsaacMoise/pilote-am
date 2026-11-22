// Informations légales d'Arvela (corrigées après l'audit du 30 octobre 2026 : C-120, C-121, C-140, C-144, C-151, C-153, C-156).
export const LEGAL = {
  /** Éditeur non professionnel : son identité complète est communiquée à l'hébergeur (loi pour la confiance dans l'économie numérique). */
  editeur: 'YKM, particulier, éditeur non professionnel',
  /** Personne qui décide de la mesure d'usage et de l'hébergement des comptes */
  responsable: 'YKM, éditeur d’Arvela (particulier, phase de test)',
  /** Adresse de contact pour toute question sur l'app et sur les données */
  email: 'contact@arvela.fr',
  /** Moyen de contact affiché dans les textes */
  contact: 'contact@arvela.fr, ou le bouton « Ça coince » de l’app',
  hebergeurSite: 'Google Ireland Limited (Firebase Hosting), Gordon House, Barrow Street, Dublin 4, Irlande',
  hebergeurDonnees: 'Google Cloud (Firebase Firestore), centre de données de Paris (europe-west9) ; société Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irlande',
  /** Date de fin de la phase de test (3 mois) */
  finTest: '31 janvier 2027',
  /** Date de la dernière mise à jour des textes */
  maj: '4 novembre 2026',
  /** Date de la dernière mise à jour des conditions d'utilisation (contrat de traitement des données, article 28 du RGPD) */
  majConditions: '4 novembre 2026',
  /** Durée de conservation des sauvegardes quotidiennes de la base (réglage de la console Firebase) */
  joursSauvegardes: 98,
};

/** Version des conditions d'utilisation : à changer quand leur contenu change, pour redemander l'accord. */
export const CONDITIONS_VERSION = '2026-11-04';

/** Accord donné aux conditions d'utilisation, enregistré dans les réglages copiés dans le compte. */
export function acceptationConditions(now: Date = new Date()): { version: string; date: string } {
  const p = (n: number) => String(n).padStart(2, '0');
  return { version: CONDITIONS_VERSION, date: `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}` };
}

/** Vrai quand une utilisatrice déjà installée doit encore accepter la version en vigueur des conditions. */
export function conditionsAAccepter(s: { onboarded?: boolean; conditionsAcceptees?: { version: string } }): boolean {
  return !!s.onboarded && s.conditionsAcceptees?.version !== CONDITIONS_VERSION;
}

/** Message affiché une fois aux comptes existants, jusqu'à leur accord. */
export const MESSAGE_CONDITIONS = 'Les conditions d’utilisation ont changé le 4 novembre 2026. Elles contiennent désormais le contrat de traitement des données.';

/** Phrase de responsabilité reprise dans l'app et dans le message envoyé au parent (C-120, C-121) */
/** Pajemploi+ : vérifié sur Légifrance le 06/11/2026 (LFSS 2026, article 101 : « Le I du présent article entre en vigueur le 1er septembre 2027 ») */
export const PAJEMPLOI_PLUS_DATE = '2027-09-01';
export const PAJEMPLOI_PLUS_AIDE =
  'Avec Pajemploi+, l’Urssaf prélève le parent et te verse ton salaire. À partir du 1er septembre 2027, l’aide de la CAF (CMG) ne sera versée qu’aux parents qui y ont adhéré.';
export const PAJEMPLOI_PLUS_RAPPEL =
  'Pajemploi+ n’est pas coché pour ce contrat. À partir du 1er septembre 2027, l’adhésion à Pajemploi+ sera la condition pour que les parents touchent l’aide de la CAF (CMG). Coche-le dans le contrat quand ils l’ont activé.';

/** Cas que le moteur de paie ne calcule pas : à dire plutôt qu'à calculer faux (README, « Interprétations de paie ») */
export const ABSENCES_NON_GEREES =
  'Congé maternité, paternité, de naissance, accident du travail : choisis-les dans la liste, pas « Je suis malade ». L’app ne les calcule pas : elle bloque les mois concernés pour éviter un montant faux.';
/** T-031 : affiché quand une absence non gérée est choisie */
export const ABSENCE_NON_GEREE_CHOISIE =
  'Non géré : l’app ne calculera pas les mois de cette absence, ni les congés et la fin de contrat qui en dépendent. Fais-les avec les parents, sans l’app.';
/** T-077 : l'Alsace-Moselle est calculée (regions.ts). Texte gardé pour les écrans qui le citent. */
export const ALSACE_MOSELLE_NON_GEREE =
  'Bas-Rhin, Haut-Rhin, Moselle : l’app compte la cotisation maladie du régime local. Les jours fériés locaux, le maintien de salaire et le préavis du droit local sont affichés à confirmer, avec l’écart.';

export const AVERTISSEMENT_CALCUL =
  'Arvela est un outil d’aide au calcul, indépendant de l’Urssaf et de Pajemploi. Vérifie les montants avant de les déclarer : la déclaration Pajemploi et le bulletin de salaire font foi.';

/**
 * Message que l'assistante maternelle envoie aux parents qui l'emploient (C-152, C-153) :
 * il informe pour la paie et demande un accord écrit pour le carnet de liaison.
 */
export const TEXTE_PARENTS = `Bonjour,

Pour gérer l'accueil de votre enfant, j'utilise l'application Arvela. J'y note son prénom, votre nom de famille, les horaires, les absences et leur motif (sans aucun diagnostic) et les informations du contrat, pour calculer le salaire à déclarer sur Pajemploi. Arvela est un outil d'aide, indépendant de l'Urssaf : la déclaration Pajemploi fait foi.

Ces données sont enregistrées sur mon téléphone, avec une copie dans mon compte Arvela, hébergée à Paris par Google Firebase. Aucun autre utilisateur de l'application n'y a accès. L'éditeur de l'application peut techniquement accéder à cette copie pour l'entretien du service ; il s'engage à ne pas la consulter sans mon accord. Aucune information sur votre enfant n'est utilisée pour mesurer l'usage de l'application.

Si vous le souhaitez, je peux vous envoyer un lien privé pour suivre la journée de votre enfant et retrouver la déclaration Pajemploi du mois. Les informations y sont chiffrées : il faut le lien et un code à 4 chiffres, que je vous donnerai de vive voix. Merci de ne pas transférer ce lien.

Je souhaite aussi tenir dans l'application un carnet de liaison : repas, sieste, change, humeur, et les soins (température prise, médicament donné sur ordonnance avec votre autorisation écrite, petite chute). Ces informations touchent à la santé de votre enfant : je ne les note que si vous êtes d'accord. Pouvez-vous me répondre « J'accepte le carnet de liaison dans Arvela » ? Vous pourrez retirer votre accord à tout moment, et je supprimerai alors ce carnet.

Deux autres informations touchent aussi à la santé, et je ne les note que parce qu'elles servent au calcul : le motif « malade » d'une absence (qui compte pour le salaire), et, si c'est le cas, le fait que votre enfant soit en situation de handicap ou de maladie (qui compte pour mon abattement fiscal). Dites-moi si vous n'êtes pas d'accord.

Je conserve ces informations pendant le contrat, puis le temps de mes obligations (déclarations, impôts), et je les supprime ensuite. Vous pouvez me demander à tout moment de les consulter, de les corriger ou de les supprimer. Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la CNIL (Commission nationale de l'informatique et des libertés) sur cnil.fr.

Bien cordialement`;
