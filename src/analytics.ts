// Mesure d'usage du pilote (PostHog, hébergement UE). Chargée après l'app, jamais en local ni pendant les tests.
// Prénoms d'enfants, noms de familles et prénom de l'AM sont remplacés avant tout envoi (« Enfant 1 », « Famille 1 », « AM »).
import { state } from './store';
import { isDemo } from './db';

const KEY = 'phc_o2YzAa4ztXQV3DNa9RQaEiiDZJWBjNY3TsJWEGpYThhD';
const OPT_OUT = 'pam-mesure-off';
let ph: any = null;

export function mesureActive(): boolean {
  try { return localStorage.getItem(OPT_OUT) !== '1'; } catch { return true; }
}

export function setMesure(on: boolean) {
  try { on ? localStorage.removeItem(OPT_OUT) : localStorage.setItem(OPT_OUT, '1'); } catch { /* stockage indisponible */ }
  if (ph) on ? ph.opt_in_capturing() : ph.opt_out_capturing();
  else if (on) void initAnalytics();
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

export function pseudonymise(text: string): string {
  if (!text) return text;
  let t = text;
  for (const [re, rep] of table()) t = t.replace(re, rep);
  return t;
}

function deep(v: unknown, depth = 0): unknown {
  if (depth > 6) return v;
  if (typeof v === 'string') return pseudonymise(v);
  if (Array.isArray(v)) return v.map((x) => deep(x, depth + 1));
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) o[k] = deep(x, depth + 1);
    return o;
  }
  return v;
}

export async function initAnalytics() {
  if (ph || !import.meta.env.PROD || !mesureActive()) return;
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')) return;
  const mod: any = await import('posthog-js/dist/module.full.no-external');
  const posthog = mod.default ?? mod.posthog ?? mod;
  posthog.init(KEY, {
    api_host: 'https://eu.i.posthog.com',
    ui_host: 'https://eu.posthog.com',
    persistence: 'localStorage',
    debug: location.search.includes('phdebug'),
    person_profiles: 'always',
    autocapture: true,
    capture_pageview: false,
    capture_pageleave: true,
    capture_dead_clicks: true,
    enable_heatmaps: true,
    capture_exceptions: true,
    capture_performance: { web_vitals: true },
    disable_surveys: false,
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: true,
      // Tout le texte passe par la pseudonymisation ; les notes libres du carnet sont masquées.
      maskTextSelector: '*',
      maskTextFn: (text: string, el?: HTMLElement | null) => (el?.closest?.('[data-ph-mask]') ? text.replace(/\S/g, '•') : pseudonymise(text)),
      // Les attributs (aria-label, title, value…) passent aussi par la pseudonymisation.
      maskAttributeFn: (_name: string, value: string) => (typeof value === 'string' && value ? pseudonymise(value) : value),
    },
    before_send: (ev: any) => {
      if (!ev) return ev;
      ev.properties = deep(ev.properties) as any;
      if (ev.$set) ev.$set = deep(ev.$set);
      return ev;
    },
    loaded: (p: any) => {
      p.register({ app_mode: isDemo() ? 'exemple' : 'reel', app_version: (window as any).__PAM_VERSION ?? 'inconnue' });
    },
  });
  ph = posthog;
  const page = () => ph?.capture('$pageview', { $current_url: pseudonymise(location.href), ecran: location.hash.replace(/^#\/?/, '').split('/')[0] || 'aujourdhui' });
  page();
  window.addEventListener('hashchange', page);
}

/** Événements métier (déjà notés dans le journal local) */
export function track(ev: string, screen?: string) {
  if (!ph) return;
  ph.capture(ev, screen ? { ecran: screen } : undefined);
}
