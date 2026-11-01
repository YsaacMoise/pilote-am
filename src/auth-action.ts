// Liens reçus par e-mail (Firebase les ouvre sur https://arvela.fr/?mode=…&oobCode=…).
// Le code est lu une seule fois au démarrage puis retiré de l'adresse : il ne reste ni dans l'historique
// du navigateur, ni dans une adresse que la mesure d'usage pourrait voir.

export interface AuthAction { mode: string; code: string }

/** Clé de session : après un nouveau mot de passe, l'accueil ouvre la connexion avec l'adresse déjà remplie. */
export const LOGIN_HINT = 'pam-login-email';

function take(): AuthAction | null {
  try {
    const q = new URLSearchParams(location.search);
    const mode = q.get('mode');
    const code = q.get('oobCode');
    if (!mode || !code) return null;
    history.replaceState(null, '', location.pathname + (location.hash || ''));
    return { mode, code };
  } catch {
    return null;
  }
}

export const authAction: AuthAction | null = take();
