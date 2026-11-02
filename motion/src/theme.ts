import charte from './charte.json';

// Charte des vidéos : lue dans l'app (src/styles.css) par scripts/charte.mjs. Un changement de couleurs ou de polices
// dans l'app passe dans les vidéos en relançant ce script, sans rien retoucher ici.
const k = charte.couleurs as Record<string, string>;
export const C = {
  bg: k.bg,
  surface: k.surface,
  subtle: k['surface-2'],
  border: k.line,
  ink: k.ink,
  muted: k['ink-2'],
  accent: k.accent,
  accentLarge: k['accent-large'],
  accentInk: k['accent-ink'],
  accentSoft: k['accent-soft'],
  sauge: k.sauge,
  ok: k.ok,
  okBg: k['ok-soft'],
  warn: k.warn,
  warnBg: k['warn-soft'],
};
export const F = {
  display: charte.familles.display,
  body: charte.familles.body,
  mono: charte.familles.num,
};
export const FPS = 30;
export const s = (sec: number) => Math.round(sec * FPS);
