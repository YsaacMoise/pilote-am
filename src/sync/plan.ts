// Logique pure de la synchronisation avec le compte en ligne (testée seule, sans Firebase).
//
// Chaque enregistrement local (un contrat, une journée, une note du carnet…) devient un document en ligne :
//   users/{uid}/data/{docId}  →  { s: magasin, k: clé, v: contenu JSON ou null si supprimé, t: heure serveur }
// Une suppression laisse une « pierre tombale » (v = null) pour que les autres appareils l'apprennent.

import { SYNCED, type SyncedStore } from '../db';

export interface RemoteDoc {
  s: SyncedStore;
  k: string;
  /** Contenu en JSON, ou null pour une suppression */
  v: string | null;
  /** Heure serveur en millisecondes (0 si pas encore attribuée) */
  t: number;
}

export interface LocalRecord {
  s: SyncedStore;
  k: string;
  value: unknown;
}

/** Identifiant de document : magasin + clé, encodés pour respecter les règles de nommage de Firestore. */
export function docId(s: string, k: string): string {
  return `${s}~${encodeURIComponent(k).replace(/\./g, '%2E')}`;
}

export function isSyncedStore(s: unknown): s is SyncedStore {
  return typeof s === 'string' && (SYNCED as readonly string[]).includes(s);
}

/** JSON stable (clés triées) pour comparer deux versions d'un même enregistrement. */
export function stable(v: unknown): string {
  return JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]]))
      : x,
  );
}

/** Champs des réglages propres à chaque appareil : jamais écrasés par la version en ligne. */
const DEVICE_SETTINGS = ['lastAutoCopy', 'persisted', 'lastBackup'];

/**
 * Version envoyée en ligne d'un enregistrement : les champs propres à l'appareil sont retirés des réglages,
 * pour qu'un téléphone ne réécrive jamais le prénom ou les autres réglages avec une version périmée.
 */
export function forRemote(s: string, k: string, value: unknown): unknown {
  if (s !== 'kv' || k !== 'settings') return value;
  const v = { ...((value as { v?: Record<string, unknown> }).v ?? {}) };
  for (const f of DEVICE_SETTINGS) delete v[f];
  return { ...(value as object), v };
}

/** Fusion des réglages : la version en ligne gagne (sauf `preferLocal`), jamais pour les champs propres à l'appareil. */
export function mergeSettings(local: Record<string, unknown> | undefined, remote: Record<string, unknown> | undefined, preferLocal = false): Record<string, unknown> {
  const out: Record<string, unknown> = preferLocal ? { ...(remote ?? {}), ...(local ?? {}) } : { ...(local ?? {}), ...(remote ?? {}) };
  for (const f of DEVICE_SETTINGS) {
    if (local && f in local) out[f] = local[f];
    else delete out[f];
  }
  // Un appareil déjà passé par l'accueil le reste.
  if (local?.onboarded || remote?.onboarded) out.onboarded = true;
  return out;
}

export interface MergePlan {
  /** À écrire dans le téléphone */
  toLocal: LocalRecord[];
  /** À supprimer du téléphone (supprimé en ligne) */
  deleteLocal: Array<{ s: SyncedStore; k: string }>;
  /** À envoyer au compte */
  toRemote: LocalRecord[];
  /** Enregistrements présents des deux côtés avec un contenu différent (la version en ligne a gagné) */
  conflicts: number;
}

/**
 * Réunit ce qu'il y a sur le téléphone et en ligne quand un appareil se branche sur un compte.
 * Quand les deux diffèrent, la version en ligne gagne (le téléphone est copié avant, par sécurité),
 * sauf `preferLocal` : ce téléphone était déjà branché sur ce compte, ses changements faits entre-temps sont les plus récents.
 * Une suppression en ligne l'emporte sur l'enregistrement local, sauf `preferLocal` (il est alors renvoyé).
 */
export function planMerge(local: LocalRecord[], remote: RemoteDoc[], preferLocal = false): MergePlan {
  const plan: MergePlan = { toLocal: [], deleteLocal: [], toRemote: [], conflicts: 0 };
  const rem = new Map<string, RemoteDoc>();
  for (const d of remote) if (isSyncedStore(d.s)) rem.set(docId(d.s, d.k), d);
  const seen = new Set<string>();

  for (const r of local) {
    const id = docId(r.s, r.k);
    seen.add(id);
    const d = rem.get(id);
    if (!d) { plan.toRemote.push(r); continue; }
    if (d.v === null) {
      if (preferLocal) plan.toRemote.push(r);
      else plan.deleteLocal.push({ s: r.s, k: r.k });
      continue;
    }
    const rv: unknown = JSON.parse(d.v);
    if (r.s === 'kv' && r.k === 'settings') {
      const merged = { k: 'settings', v: mergeSettings((r.value as { v?: Record<string, unknown> }).v, (rv as { v?: Record<string, unknown> }).v, preferLocal) };
      if (stable(merged) !== stable(r.value)) plan.toLocal.push({ s: r.s, k: r.k, value: merged });
      if (stable(forRemote(r.s, r.k, merged)) !== stable(forRemote(r.s, r.k, rv))) plan.toRemote.push({ s: r.s, k: r.k, value: merged });
      continue;
    }
    if (stable(rv) !== stable(r.value)) {
      plan.conflicts++;
      if (preferLocal) plan.toRemote.push(r);
      else plan.toLocal.push({ s: r.s, k: r.k, value: rv });
    }
  }
  for (const [id, d] of rem) {
    if (seen.has(id) || d.v === null) continue;
    plan.toLocal.push({ s: d.s, k: d.k, value: JSON.parse(d.v) });
  }
  return plan;
}

/** Ce que l'appareil doit faire d'un document reçu en direct d'un autre appareil. */
export function applyRemote(localValue: unknown, d: RemoteDoc): { op: 'put'; value: unknown } | { op: 'del' } | { op: 'none' } {
  if (d.v === null) return localValue === undefined ? { op: 'none' } : { op: 'del' };
  const rv: unknown = JSON.parse(d.v);
  if (d.s === 'kv' && d.k === 'settings') {
    const merged = { k: 'settings', v: mergeSettings((localValue as { v?: Record<string, unknown> } | undefined)?.v, (rv as { v?: Record<string, unknown> }).v) };
    return stable(merged) === stable(localValue) ? { op: 'none' } : { op: 'put', value: merged };
  }
  return stable(rv) === stable(localValue) ? { op: 'none' } : { op: 'put', value: rv };
}

/** Marge de recouvrement pour reprendre l'écoute : on relit la dernière minute, sans risque (l'application est idempotente). */
export const RESUME_MARGIN_MS = 60_000;

export function nextSince(prev: number, docs: RemoteDoc[]): number {
  let max = prev;
  for (const d of docs) if (d.t > max) max = d.t;
  return max;
}
