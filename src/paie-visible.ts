// T-118 : « Toujours afficher ma paie » (écran Mois). Choix gardé sur ce téléphone seulement, comme le thème : ce n'est pas
// une donnée du compte, rien ne part en ligne.
const KEY = 'pam-paie-visible';

export function paieToujoursVisible(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setPaieToujoursVisible(v: boolean) {
  try { if (v) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* stockage indisponible */ }
}

/** Le téléphone demande moins de mouvement : pas de carte qui tourne, pas de montant qui monte */
export function mouvementReduit(): boolean {
  try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}
