// Version nuit de la charte : automatique (réglage du téléphone), ou choisie à la main.
// Le choix est gardé sur cet appareil ; index.html l'applique avant l'affichage (pas de flash).
export type Theme = 'auto' | 'light' | 'dark';
const KEY = 'pam-theme';

export function getTheme(): Theme {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'auto'; } catch { return 'auto'; }
}

/** Thème réellement affiché */
export function effectiveTheme(): 'light' | 'dark' {
  const t = getTheme();
  if (t !== 'auto') return t;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(t: Theme) {
  try { if (t === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch { /* stockage indisponible */ }
  applyTheme();
  window.dispatchEvent(new Event('pam-theme'));
}

export function applyTheme() {
  const t = getTheme();
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  // Barre du navigateur et de l'app installée de la même couleur que la page
  const color = effectiveTheme() === 'dark' ? '#1E201D' : '#F7F4EF';
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    if (t === 'auto') m.content = m.media.includes('dark') ? '#1E201D' : '#F7F4EF';
    else m.content = color;
  });
}
