// T-118 : « Toujours afficher ma paie » (écran Mois). Choix gardé sur ce téléphone seulement, comme le thème : ce n'est pas
// une donnée du compte, rien ne part en ligne.
const KEY = 'pam-paie-visible';

export function paieToujoursVisible(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setPaieToujoursVisible(v: boolean) {
  // T-135 : l'écran ouvert garde ce qu'il montre ; le nouveau réglage vaut pour les écrans suivants.
  if (vue === null) vue = paieToujoursVisible();
  try { if (v) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* stockage indisponible */ }
}

/** Le téléphone demande moins de mouvement : pas de carte qui tourne, pas de montant qui monte */
export function mouvementReduit(): boolean {
  try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

// T-135 (décision de la direction du 26/11/2026) : un seul état « paie vue » pour toute l'app. Il part du réglage « Toujours
// afficher ma paie », s'ouvre d'un geste (« Voir ma paie ») et se referme à chaque changement d'écran (comme l'écran Mois de
// la T-118). Gardé en mémoire seulement : rien n'est écrit.
let vue: boolean | null = null;
const abonnes = new Set<() => void>();
const ecranDe = (h: string) => h.replace(/^#\/?/, '').split(/[/?]/)[0];
let ecran = typeof location !== 'undefined' ? ecranDe(location.hash) : '';
const prevenir = () => abonnes.forEach((f) => f());

export function paieVue(): boolean { return vue ?? paieToujoursVisible(); }
export function setPaieVue(v: boolean) { vue = v; prevenir(); }
export function abonnerPaie(f: () => void): () => void { abonnes.add(f); return () => { abonnes.delete(f); }; }
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const e = ecranDe(location.hash);
    if (e !== ecran) { ecran = e; vue = null; prevenir(); }
  });
}
