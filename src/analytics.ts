// Mesure d'usage du pilote (PostHog, hébergement UE).
// Corrections après audit (C-030, C-031, C-032, C-033, C-034) :
// - la mesure est éteinte par défaut et ne démarre qu'après un accord donné dans Plus › Réglages ;
// - jamais en démonstration, jamais en local, jamais pendant les tests ;
// - aucun enregistrement d'écran, aucune capture automatique des clics, aucune carte de chaleur,
//   aucune capture des erreurs avec leur texte, aucune requête réseau enregistrée ;
// - seuls partent des noms d'événements métier (« arrivee », « depart »…) et le nom de l'écran ;
// - couper la mesure efface l'identifiant gardé sur le téléphone.
import { state } from './store';
import { isDemo } from './db';

declare const __APP_VERSION__: string;

const KEY = 'phc_o2YzAa4ztXQV3DNa9RQaEiiDZJWBjNY3TsJWEGpYThhD';
/** Accord donné dans Réglages (valeur « 1 »). Sans cet accord, rien ne part. */
const OPT_IN = 'pam-mesure-on';
/** Ancienne clé (mesure active par défaut) : retirée, elle ne vaut plus accord. */
const OLD_OPT_OUT = 'pam-mesure-off';
let ph: any = null;

export function mesureActive(): boolean {
  try { return localStorage.getItem(OPT_IN) === '1'; } catch { return false; }
}

/**
 * Efface ce que PostHog a pu garder sur le téléphone (identifiant, file d'attente).
 * La clé de refus `__ph_opt_in_out_…` est gardée : l'effacer remettait PostHog en « non décidé »
 * et les envois reprenaient (contrôle indépendant du 31/10/2026, scénario C).
 */
export function effacerTracesMesure() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && !k.startsWith('__ph_opt_in_out') && (k.startsWith('ph_') || k.startsWith('__ph_') || k.startsWith('_ph_'))) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem(OLD_OPT_OUT);
  } catch { /* stockage indisponible */ }
  try {
    for (const k of Object.keys(sessionStorage)) if (!k.startsWith('__ph_opt_in_out') && (k.startsWith('ph_') || k.startsWith('__ph_'))) sessionStorage.removeItem(k);
  } catch { /* stockage indisponible */ }
}

export function setMesure(on: boolean) {
  try { on ? localStorage.setItem(OPT_IN, '1') : localStorage.removeItem(OPT_IN); } catch { /* stockage indisponible */ }
  if (on) {
    if (ph) {
      try {
        ph.set_config({ disable_persistence: false });
        ph.opt_in_capturing();
        window.addEventListener('hashchange', page);
      } catch { /* sans effet */ }
    } else void initAnalytics();
    return;
  }
  if (typeof window !== 'undefined') window.removeEventListener('hashchange', page);
  if (ph) {
    try {
      ph.reset();
      // Refus posé après reset() (reset ne doit pas l'annuler), puis plus rien n'est écrit sur le téléphone.
      ph.opt_out_capturing();
      ph.set_config({ disable_persistence: true });
    } catch { /* sans effet */ }
  }
  effacerTracesMesure();
}

/** Remplace, dans une adresse, tout ce qui suit le nom d'écran (identifiant de contrat, paramètres). */
export function nettoyerAdresse(v: string): string {
  return v.replace(/#\/?([^/?#\s]*)[^\s"]*/g, (_m, e: string) => `#/${e || 'aujourdhui'}`);
}

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let cacheKey = '';
let cacheTable: Array<[RegExp, string]> = [];

/** Table de remplacement construite à partir des contrats du moment (mise en cache) */
function table(): Array<[RegExp, string]> {
  const key = JSON.stringify([state.contracts.map((c) => [c.child, c.family, c.createdAt]), state.settings?.amName]);
  if (key === cacheKey) return cacheTable;
  const out: Array<[RegExp, string]> = [];
  const cs = [...state.contracts].sort((a, b) => a.createdAt - b.createdAt);
  const fams: string[] = [];
  cs.forEach((c, i) => {
    if (c.child?.trim()) out.push([new RegExp(`(?<!\\p{L})${esc(c.child.trim())}(?!\\p{L})`, 'giu'), `Enfant ${i + 1}`]);
    const f = c.family?.trim();
    if (f && !fams.includes(f.toLowerCase())) fams.push(f.toLowerCase());
  });
  fams.forEach((f, i) => out.push([new RegExp(`(?<!\\p{L})${esc(f)}(?!\\p{L})`, 'giu'), `Famille ${i + 1}`]));
  const am = state.settings?.amName?.trim();
  if (am) out.push([new RegExp(`(?<!\\p{L})${esc(am)}(?!\\p{L})`, 'giu'), 'AM']);
  // Les noms longs d'abord (« Marie-Lou » avant « Marie »)
  cacheTable = out.sort((a, b) => b[0].source.length - a[0].source.length);
  cacheKey = key;
  return cacheTable;
}

const EMAIL = /[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[A-Za-z]{2,}/g;

export function pseudonymise(text: string): string {
  if (!text) return text;
  // Les adresses e-mail (écran Compte) ne partent jamais.
  let t = text.replace(EMAIL, 'e-mail masqué');
  for (const [re, rep] of table()) t = t.replace(re, rep);
  return t;
}

/** Pseudonymise toutes les chaînes, à toute profondeur (C-031 : l'ancienne version s'arrêtait à 6 niveaux). */
export function deep(v: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof v === 'string') return pseudonymise(v);
  if (!v || typeof v !== 'object') return v;
  if (seen.has(v as object)) return undefined;
  seen.add(v as object);
  if (Array.isArray(v)) return v.map((x) => deep(x, seen));
  const o: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) o[k] = deep(x, seen);
  return o;
}

/** Toute chaîne qui contient une adresse de l'app perd l'identifiant de contrat (C-034, $current_url, $session_entry_url…). */
function nettoyer(v: unknown): unknown {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
  const o: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) o[k] = typeof x === 'string' && x.includes('#') ? nettoyerAdresse(x) : x;
  return o;
}

/** Nom d'écran sans identifiant de contrat ni paramètre (C-034). */
export function ecranCourant(hash: string): string {
  return hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'aujourdhui';
}

/** Réglages passés à posthog.init : exportés pour être vérifiés par les tests. */
export function posthogOptions() {
  return {
    api_host: 'https://eu.i.posthog.com',
    ui_host: 'https://eu.posthog.com',
    persistence: 'localStorage',
    // Pas de profil de personne : des événements seulement.
    person_profiles: 'identified_only',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_dead_clicks: false,
    rageclick: false,
    enable_heatmaps: false,
    capture_heatmaps: false,
    capture_exceptions: false,
    capture_performance: false,
    disable_surveys: true,
    disable_session_recording: true,
    // Défense en profondeur : même si l'enregistrement était réactivé depuis la console PostHog,
    // aucun corps ni en-tête de requête ne serait copié, et tout le texte serait masqué.
    session_recording: {
      recordBody: false,
      recordHeaders: false,
      maskAllInputs: true,
      maskTextSelector: '*',
      maskTextFn: (text: string) => text.replace(/\S/g, '•'),
    },
    advanced_disable_feature_flags: true,
    before_send: (ev: any) => {
      // Dernier verrou : sans accord en cours, rien ne part, même un événement déjà en file.
      if (!ev || !mesureActive()) return null;
      ev.properties = nettoyer(deep(ev.properties)) as any;
      if (ev.$set) ev.$set = nettoyer(deep(ev.$set));
      if (ev.$set_once) ev.$set_once = nettoyer(deep(ev.$set_once));
      return ev;
    },
  };
}

function version(): string {
  try { return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'inconnue'; } catch { return 'inconnue'; }
}

export async function initAnalytics() {
  if (ph || !import.meta.env.PROD || !mesureActive() || isDemo()) return;
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')) return;
  const mod: any = await import('posthog-js/dist/module.full.no-external');
  const posthog = mod.default ?? mod.posthog ?? mod;
  posthog.init(KEY, {
    ...posthogOptions(),
    loaded: (p: any) => {
      p.register({ app_mode: 'reel', app_version: version() });
    },
  });
  ph = posthog;
  page();
  window.addEventListener('hashchange', page);
}

function page() {
  if (!ph || !mesureActive()) return;
  const ecran = ecranCourant(location.hash);
  ph.capture('$pageview', { $current_url: `${location.origin}/#/${ecran}`, ecran });
}

/** Événements métier (déjà notés dans le journal local) : un nom et l'écran, jamais de texte saisi. */
export function track(ev: string, screen?: string) {
  if (!ph || !mesureActive()) return;
  ph.capture(ev, screen ? { ecran: ecranCourant(screen) } : undefined);
}
