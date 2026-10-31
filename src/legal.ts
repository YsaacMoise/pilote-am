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
  maj: '31 octobre 2026',
};

/** Phrase de responsabilité reprise dans l'app et dans le message envoyé au parent (C-120, C-121) */
export const AVERTISSEMENT_CALCUL =
  'Arvela est un outil d’aide au calcul, indépendant de l’Urssaf et de Pajemploi. Vérifie les montants avant de les déclarer : la déclaration Pajemploi et le bulletin de salaire font foi.';

/**
 * Message que l'assistante maternelle envoie aux parents qui l'emploient (C-152, C-153) :
 * il informe pour la paie et demande un accord écrit pour le carnet de liaison.
 */
export const TEXTE_PARENTS = `Bonjour,

Pour gérer l'accueil de votre enfant, j'utilise l'application Arvela. J'y note son prénom, votre nom de famille, les horaires, les absences et leur motif (sans aucun diagnostic) et les informations du contrat, pour calculer le salaire à déclarer sur Pajemploi. Arvela est un outil d'aide, indépendant de l'Urssaf : la déclaration Pajemploi fait foi.

Ces données sont enregistrées sur mon téléphone, avec une copie dans mon compte Arvela, hébergée à Paris par Google Firebase. Aucun autre utilisateur de l'application n'y a accès. L'éditeur de l'application peut techniquement accéder à cette copie pour l'entretien du service ; il s'engage à ne pas la consulter sans mon accord. Aucune information sur votre enfant n'est utilisée pour mesurer l'usage de l'application.

Je souhaite aussi tenir dans l'application un carnet de liaison : repas, sieste, change, humeur, et les soins (température prise, médicament donné sur ordonnance avec votre autorisation écrite, petite chute). Ces informations touchent à la santé de votre enfant : je ne les note que si vous êtes d'accord. Pouvez-vous me répondre « J'accepte le carnet de liaison dans Arvela » ? Vous pourrez retirer votre accord à tout moment, et je supprimerai alors ce carnet.

Je conserve ces informations pendant le contrat, puis le temps de mes obligations (déclarations, impôts), et je les supprime ensuite. Vous pouvez me demander à tout moment de les consulter, de les corriger ou de les supprimer.

Bien cordialement`;
