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
