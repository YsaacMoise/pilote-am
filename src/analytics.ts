// Mesure d'usage (PostHog, hébergement UE).
// Corrections après audit (C-030, C-031, C-033, C-034) :
// - jamais en démonstration, jamais en local, jamais pendant les tests ;
// - aucun enregistrement d'écran, aucune capture automatique des clics, aucune carte de chaleur,
//   aucune capture des erreurs avec leur texte, aucune requête réseau enregistrée ;
// - seuls partent des noms d'événements métier (« arrivee », « depart »…) et le nom de l'écran ;
// - couper la mesure efface l'identifiant gardé sur le téléphone.
// Depuis le 04/11/2026 (C-032, décision de YKM) : pour les utilisatrices de l'app, la mesure est active par
// défaut et se coupe en un geste dans Réglages. Fondement visé : exemption de consentement de la CNIL pour la
// mesure d'audience (article 82 de la loi Informatique et Libertés), à faire valider par un juriste. Les
// données restent pseudonymes (identifiant au hasard), pas anonymes. Conditions tenues ici et testées : aucun
// profil de personne ni lien avec le compte, pas de géolocalisation, adresse IP non gardée (réglage du projet
// PostHog), identifiant renouvelé au plus tard tous les 13 mois sans prolongation, données gardées 1 an,
// PostHog sous-traitant sans réutilisation, jamais les visiteurs du site, le simulateur avant compte ni les parents.
import { state, toast } from './store';
import { isDemo } from './db';

declare const __APP_VERSION__: string;

const KEY = 'phc_o2YzAa4ztXQV3DNa9RQaEiiDZJWBjNY3TsJWEGpYThhD';
/** Refus donné dans Réglages (valeur « 1 »). Sans refus, la mesure est active. */
const REFUS = 'pam-mesure-refus';
/** Date de création de l'identifiant au hasard (millisecondes). */
const DEPUIS = 'pam-mesure-depuis';
/** Passage à la mesure active par défaut déjà fait sur ce téléphone. */
const MIGRE = 'pam-mesure-v2';
/** Anciennes clés : accord de l'époque où la mesure était éteinte par défaut, et refus plus ancien encore. */
const OLD_OPT_IN = 'pam-mesure-on';
const OLD_OPT_OUT = 'pam-mesure-off';
/** Durée de vie maximale de l'identifiant : 13 mois (recommandation CNIL), compté depuis sa création. */
export const DUREE_IDENTIFIANT_MS = 395 * 24 * 3600 * 1000;
let ph: any = null;

/**
 * Une seule fois par téléphone : une utilisatrice qui avait éteint la mesure à l'époque où elle était
 * allumable (PostHog garde alors sa clé de refus à « 0 ») reste refusée. Les autres passent à la mesure active.
 */
function migrer() {
  try {
    if (localStorage.getItem(MIGRE) === '1') return;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('__ph_opt_in_out') && localStorage.getItem(k) === '0') localStorage.setItem(REFUS, '1');
    }
    localStorage.removeItem(OLD_OPT_IN);
    localStorage.removeItem(OLD_OPT_OUT);
    localStorage.setItem(MIGRE, '1');
  } catch { /* stockage indisponible */ }
}

/** Un identifiant de plus de 13 mois est effacé : PostHog en tire un nouveau. Pas de prolongation à chaque visite. */
export function renouvelerIdentifiant(now = Date.now()) {
  try {
    const d = Number(localStorage.getItem(DEPUIS));
    if (!d || now - d > DUREE_IDENTIFIANT_MS) {
      if (d) effacerTracesMesure();
      localStorage.setItem(DEPUIS, String(now));
    }
  } catch { /* stockage indisponible */ }
}

export function mesureActive(): boolean {
  migrer();
  try { return localStorage.getItem(REFUS) !== '1'; } catch { return false; }
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
    localStorage.removeItem(DEPUIS);
  } catch { /* stockage indisponible */ }
  try {
    for (const k of Object.keys(sessionStorage)) if (!k.startsWith('__ph_opt_in_out') && (k.startsWith('ph_') || k.startsWith('__ph_'))) sessionStorage.removeItem(k);
  } catch { /* stockage indisponible */ }
}

export function setMesure(on: boolean) {
  migrer();
  try { on ? localStorage.removeItem(REFUS) : localStorage.setItem(REFUS, '1'); } catch { /* stockage indisponible */ }
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
    person_profiles: 'never',
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
      // Dernier verrou : après un refus, ou hors de l'app d'une utilisatrice, rien ne part.
      if (!ev || !mesureActive() || !utilisatrice()) return null;
      const props = (nettoyer(deep(ev.properties ?? {})) ?? {}) as Record<string, unknown>;
      // Mesure anonyme : jamais d'adresse internet ni de géolocalisation, jamais de propriété de personne.
      delete props.$ip;
      props.$geoip_disable = true;
      ev.properties = props;
      delete ev.$set;
      delete ev.$set_once;
      return ev;
    },
  };
}

function version(): string {
  try { return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'inconnue'; } catch { return 'inconnue'; }
}

/**
 * Seules les utilisatrices de l'app sont mesurées : jamais un simple visiteur du site, ni une famille qui
 * ouvre le simulateur, ni un parent sur sa page (relecture du 04/11/2026). Elles seules ont accès à Réglages
 * pour s'opposer.
 */
export function utilisatrice(): boolean {
  return !!state.settings?.onboarded && !isDemo();
}

export async function initAnalytics() {
  if (ph || !import.meta.env.PROD || !mesureActive() || !utilisatrice()) return;
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')) return;
  renouvelerIdentifiant();
  const mod: any = await import('posthog-js/dist/module.full.no-external');
  const posthog = mod.default ?? mod.posthog ?? mod;
  posthog.init(KEY, {
    ...posthogOptions(),
    loaded: (p: any) => {
      // Pas de géolocalisation à partir de l'adresse internet (mesure d'audience anonyme).
      p.register({ app_mode: 'reel', app_version: version(), $geoip_disable: true });
    },
  });
  // Mesure rallumée après un refus : PostHog garde sa propre clé de refus, on la lève.
  try { if (posthog.has_opted_out_capturing()) posthog.opt_in_capturing(); } catch { /* sans effet */ }
  ph = posthog;
  page();
  window.addEventListener('hashchange', page);
}

function page() {
  if (!ph || !mesureActive()) return;
  const ecran = ecranCourant(location.hash);
  ph.capture('$pageview', { $current_url: `${location.origin}/#/${ecran}`, ecran });
}

const INFO = 'pam-mesure-info';
/** Une seule fois par téléphone : dire que la mesure est active et comment la couper. */
export function informerUneFois() {
  try {
    if (!utilisatrice() || !mesureActive() || localStorage.getItem(INFO) === '1') return;
    localStorage.setItem(INFO, '1');
  } catch { return; }
  toast('Pour s’améliorer, Arvela compte les écrans et gestes utilisés, sans ton nom ni ce que tu écris. Tu peux couper dans Réglages.', async () => { location.hash = '#/reglages'; }, undefined, 'Réglages');
}

/** Événements métier (déjà notés dans le journal local) : un nom et l'écran, jamais de texte saisi. */
export function track(ev: string, screen?: string) {
  if (!ph || !mesureActive()) return;
  ph.capture(ev, screen ? { ecran: ecranCourant(screen) } : undefined);
}
