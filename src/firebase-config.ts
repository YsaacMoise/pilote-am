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

/**
 * T-125, point 4 : clé PUBLIQUE de la clé Cloud KMS de la copie scellée (RSA-OAEP 3072, SHA-256, niveau HSM, europe-west9),
 * au format PEM. Clé créée le 26/11/2026 (version 1, empreinte MD5 du fichier PEM 567b1a49…). Vide : copie scellée désactivée.
 * Une clé publique n'est pas un secret.
 */
export const SEQUESTRE_PEM = [
  '-----BEGIN PUBLIC KEY-----',
  'MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAjxzfVpSmSdpjQpr0VV39',
  'pP1B9/Sr2Boax24NA/2gUMnO4iWNjdwqHlHxaOM/B+x9P95IH75jYO9qBdYjagho',
  '4Pc0lS0rQCCXCiSBYOriG5gQKqZx0VvbzpfgbVYTQ3TjonvfxPe3iidkJ9OpqABN',
  'uxytM5PHlSPrs9xq7wKpYQDKgdZ64VZMQhZtQSL15711AKCSWAy4ZAwQdv9wiw7A',
  'bF+x554HhIzPQLjTbjWFwsmijMW0W1gS3EUvMrqK3CFMsCk6cGxEwQSO4r2vYnlm',
  'T5Qg1WLe5eomT/9DZ4flJVgtwp7SCXOOmzEDXDI+WmaJxxs3H6Huunn8q4QKbSOn',
  'SMzNmY/GcaDJk/idKxPUMuOEvIAXJbAh7YDytq6e3szEZEciM0tWv5F5mUR6oKrv',
  '1u8GHtEbfZojv4A9aTrX0kuwZ3UQNRNr1/c2gBvizt/+8gi0yFB3YuG/sueqIj+3',
  '6hUrNni0KWTRuMZcDsd6fXHTGqLcwpjM3039t44iGl4NAgMBAAE=',
  '-----END PUBLIC KEY-----',
].join('\n');
