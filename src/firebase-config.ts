// Configuration publique du projet Firebase « Arvela » (créé le 30/10/2026).
// Ces valeurs identifient le projet auprès de Google ; elles ne sont pas secrètes
// et finissent de toute façon dans le code envoyé au navigateur. La protection
// des données repose sur les règles de sécurité Firestore, pas sur cette clé.
// Base Firestore : europe-west9 (Paris), mode production (tout est fermé par défaut).
// Connexion activée : e-mail et mot de passe.
export const firebaseConfig = {
  apiKey: 'AIzaSyD9DxzHst1IlSyeat2GgIEe5PqsOqhgk6E',
  authDomain: 'arvela-app.firebaseapp.com',
  projectId: 'arvela-app',
  storageBucket: 'arvela-app.firebasestorage.app',
  messagingSenderId: '371665732009',
  appId: '1:371665732009:web:a0d17e3375b65eb28fc4b8',
} as const;

// Protection anti-robots (Firebase App Check, fournisseur reCAPTCHA Enterprise, créé le 03/11/2026).
// Clé de site publique par conception : elle est envoyée au navigateur et limitée au domaine arvela.fr
// dans la console Google Cloud. Clé à score, sans case à cocher : rien n'est visible pour l'utilisatrice.
export const RECAPTCHA_SITE_KEY = '6LdxAg8uAAAAAAahu93N7aNBjnG80EIM2QhxyJG-';

/** App Check ne tourne que sur l'adresse réelle : la clé refuse les autres domaines (tests, aperçus). */
export function appCheckActif(hostname: string): boolean {
  return hostname === 'arvela.fr';
}
