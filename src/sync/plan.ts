// Logique pure de la synchronisation avec le compte en ligne (testée seule, sans Firebase).
//
// Chaque enregistrement local (un contrat, une journée, une note du carnet…) devient un document en ligne :
//   users/{uid}/data/{docId}  →  { s: magasin, k: clé, v: contenu JSON ou null si supprimé, t: heure serveur }
// Une suppression laisse une « pierre tombale » (v = null) pour que les autres appareils l'apprennent.

import { SYNCED, type SyncedStore } from '../db';
import { absenceEnLigne, normaliserAbsence, ruptureSansSante, type AbsenceLue } from '../engine/absences';
import { avecSanteLocale, CHAMPS_SANTE_CONTRAT, contratSansSante, estNoteSante, resteSurTelephone } from './sante';

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
 * T-121 : un contrat part sans ses champs de santé (sante.ts). Une note de santé du carnet ne part pas du tout : chaque
 * envoi passe par `resteSurTelephone` (cloud.ts, `envoyer`), qui la retire du compte au lieu de l'écrire.
 */
export function forRemote(s: string, k: string, value: unknown): unknown {
  const v = formeT109(s, k, value);
  return s === 'contracts' ? contratSansSante(v) : v;
}

/** Forme en ligne d'avant la T-121 (T-109 et réglages) : sert aussi à savoir si une version en ligne doit être corrigée tout de suite. */
function formeT109(s: string, k: string, value: unknown): unknown {
  // Décision du DG du 21/11/2026 : jamais de nature d'événement ni de cas non géré envoyé en ligne (absences.ts).
  if (s === 'leaves' && value && typeof value === 'object') return absenceEnLigne(normaliserAbsence(value as AbsenceLue));
  // T-109 (décision de la direction du 26/11/2026) : la rupture part sans rien sur la grossesse.
  if (s === 'contracts' && value && typeof value === 'object' && (value as { rupture?: object }).rupture) {
    const v = value as { rupture: Record<string, unknown> };
    const r = ruptureSansSante(v.rupture);
    return r === v.rupture ? value : { ...v, rupture: r };
  }
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
  /** À marquer supprimé en ligne */
  deleteRemote: Array<{ s: SyncedStore; k: string }>;
  /** Enregistrements présents des deux côtés avec un contenu différent */
  conflicts: number;
}

/**
 * Façon de réunir le téléphone et le compte :
 * - « merge » : on garde tout ; en cas de différence la version en ligne gagne, sauf pour les clés de `localWins`
 *   (changées sur ce téléphone pendant qu'il n'était pas relié, donc plus récentes) ;
 * - « account » : le téléphone prend le contenu du compte (ce qui n'y est pas est retiré du téléphone) ;
 * - « phone » : le compte prend le contenu du téléphone (ce qui n'y est pas est marqué supprimé en ligne).
 * Les réglages sont toujours fusionnés champ par champ, les repères propres à l'appareil restent les siens.
 */
export type MergeMode = 'merge' | 'account' | 'phone';

export function planMerge(local: LocalRecord[], remote: RemoteDoc[], opts: { mode?: MergeMode; localWins?: Set<string> } = {}): MergePlan {
  const mode = opts.mode ?? 'merge';
  const wins = opts.localWins ?? new Set<string>();
  const plan: MergePlan = { toLocal: [], deleteLocal: [], toRemote: [], deleteRemote: [], conflicts: 0 };
  const rem = new Map<string, RemoteDoc>();
  for (const d of remote) if (isSyncedStore(d.s)) rem.set(docId(d.s, d.k), d);
  const seen = new Set<string>();

  for (const r of local) {
    const id = docId(r.s, r.k);
    seen.add(id);
    // T-121 : une note de santé du téléphone n'est ni envoyée, ni remplacée, ni effacée par la réunion. Sa copie en ligne
    // éventuelle (ancienne version de l'app) est retirée à part, après vérification (planRetraitSante).
    if (resteSurTelephone(r.s, r.value)) continue;
    const d = rem.get(id);
    const localFirst = mode === 'phone' || (mode === 'merge' && wins.has(id));
    if (r.s === 'kv' && r.k === 'settings') {
      const rv = d?.v ? (JSON.parse(d.v) as { v?: Record<string, unknown> }).v : undefined;
      const merged = { k: 'settings', v: mergeSettings((r.value as { v?: Record<string, unknown> }).v, rv, localFirst) };
      if (stable(merged) !== stable(r.value)) plan.toLocal.push({ s: r.s, k: r.k, value: merged });
      if (!d?.v || stable(forRemote(r.s, r.k, merged)) !== stable(forRemote(r.s, r.k, { k: 'settings', v: rv }))) plan.toRemote.push({ s: r.s, k: r.k, value: merged });
      continue;
    }
    if (!d || d.v === null) {
      // Absent en ligne (ou supprimé en ligne)
      if (mode === 'account' || (d && !localFirst)) plan.deleteLocal.push({ s: r.s, k: r.k });
      else plan.toRemote.push(r);
      continue;
    }
    const rv: unknown = JSON.parse(d.v);
    // T-109 (décision du DG du 26/11/2026) : la forme en ligne d'un enregistrement (forRemote) peut être plus pauvre que le
    // téléphone (examen de grossesse envoyé en « absence payée ») : pas de conflit, le téléphone garde son motif. Une version en
    // ligne qui contient encore une donnée qui ne doit pas y être est corrigée en ligne, sans rien perdre sur le téléphone.
    const rvSain = forRemote(r.s, r.k, rv);
    // T-121 : un champ de santé encore en ligne n'est pas corrigé ici, mais par planRetraitSante, après vérification du téléphone.
    const aCorriger = stable(formeT109(r.s, r.k, rv)) !== stable(rv);
    if (stable(rvSain) === stable(r.value) || stable(rvSain) === stable(forRemote(r.s, r.k, r.value))) {
      if (aCorriger) plan.toRemote.push(r);
      continue;
    }
    plan.conflicts++;
    if (localFirst) plan.toRemote.push(r);
    else {
      // T-121 : la version du compte gagne, sauf pour les champs de santé du téléphone, qu'elle n'a pas.
      plan.toLocal.push({ s: r.s, k: r.k, value: avecSanteLocale(r.s, rvSain, r.value, rv) });
      if (aCorriger) plan.toRemote.push({ s: r.s, k: r.k, value: rvSain });
    }
  }
  for (const [id, d] of rem) {
    if (seen.has(id) || d.v === null) continue;
    if (mode === 'phone') { plan.deleteRemote.push({ s: d.s, k: d.k }); continue; }
    // T-109 : une donnée qui ne doit pas être en ligne (ancien examen de grossesse) est retirée au chargement, puis corrigée en ligne.
    const rv: unknown = JSON.parse(d.v);
    const rvSain = forRemote(d.s, d.k, rv);
    // T-121 : une donnée de santé encore en ligne (ancienne version de l'app) arrive d'abord sur le téléphone ; elle n'est
    // retirée du compte qu'ensuite, quand le téléphone en a la même copie (planRetraitSante).
    plan.toLocal.push({ s: d.s, k: d.k, value: avecSanteLocale(d.s, rvSain, undefined, rv) });
    if (stable(formeT109(d.s, d.k, rv)) !== stable(rv)) plan.toRemote.push({ s: d.s, k: d.k, value: rvSain });
  }
  return plan;
}

/** Vrai si le téléphone et le compte ont chacun des enfants : les réunir sans demander risquerait des doublons. */
export function needsChoice(local: LocalRecord[], remote: RemoteDoc[]): boolean {
  const remoteKids = remote.some((d) => d.s === 'contracts' && d.v !== null);
  const localKids = local.some((r) => r.s === 'contracts');
  if (!remoteKids || !localKids) return false;
  // Exactement les mêmes enfants des deux côtés : pas de doublon possible.
  const rk = new Set(remote.filter((d) => d.s === 'contracts' && d.v !== null).map((d) => d.k));
  const lk = local.filter((r) => r.s === 'contracts').map((r) => r.k);
  return !(lk.length === rk.size && lk.every((k) => rk.has(k)));
}

/** Ce que l'appareil doit faire d'un document reçu en direct d'un autre appareil. */
export function applyRemote(localValue: unknown, d: RemoteDoc): { op: 'put'; value: unknown } | { op: 'del' } | { op: 'none' } {
  // T-121 : une note de santé du téléphone n'est jamais remplacée ni effacée par le compte (elle n'y est plus).
  if (localValue !== undefined && resteSurTelephone(d.s, localValue)) return { op: 'none' };
  if (d.v === null) return localValue === undefined ? { op: 'none' } : { op: 'del' };
  const rv: unknown = JSON.parse(d.v);
  if (d.s === 'kv' && d.k === 'settings') {
    const merged = { k: 'settings', v: mergeSettings((localValue as { v?: Record<string, unknown> } | undefined)?.v, (rv as { v?: Record<string, unknown> }).v) };
    return stable(merged) === stable(localValue) ? { op: 'none' } : { op: 'put', value: merged };
  }
  // T-109 : version en ligne lue sous sa forme permise (ancien examen de grossesse → « absence payée ») ; le téléphone qui a la
  // forme complète du même enregistrement la garde.
  const sain = forRemote(d.s, d.k, rv);
  if (localValue !== undefined && stable(sain) === stable(forRemote(d.s, d.k, localValue))) return { op: 'none' };
  // T-121 : les champs de santé du téléphone sont gardés sur la version reçue.
  const value = avecSanteLocale(d.s, sain, localValue, rv);
  return stable(value) === stable(localValue) ? { op: 'none' } : { op: 'put', value };
}

/**
 * T-121, point 3 de la consigne : retrait des données de santé déjà en ligne, décidé sur le téléphone de l'AM.
 * Pour chaque document en ligne qui en contient :
 * - note de santé du carnet : retirée du compte (document effacé, sans pierre tombale : les autres appareils gardent leur
 *   copie) seulement si le téléphone en a une copie identique ;
 * - contrat : réécrit sans ses champs de santé (le reste tel qu'en ligne) seulement si le téléphone a ce contrat avec les
 *   mêmes valeurs pour ces champs.
 * Copie du téléphone absente ou différente : rien n'est retiré, le document est noté dans `gardes`.
 */
export interface PlanRetrait {
  retirer: Array<{ s: SyncedStore; k: string }>;
  corriger: LocalRecord[];
  gardes: Array<{ s: SyncedStore; k: string; raison: 'manque' | 'differe' }>;
}

export function planRetraitSante(remote: RemoteDoc[], local: Map<string, unknown>): PlanRetrait {
  const out: PlanRetrait = { retirer: [], corriger: [], gardes: [] };
  for (const d of remote) {
    if (!isSyncedStore(d.s) || d.v === null) continue;
    if (d.s !== 'journal' && d.s !== 'contracts') continue;
    let rv: unknown;
    try { rv = JSON.parse(d.v); } catch { continue; }
    const loc = local.get(docId(d.s, d.k));
    if (d.s === 'journal') {
      if (!estNoteSante(rv)) continue;
      if (loc === undefined) out.gardes.push({ s: d.s, k: d.k, raison: 'manque' });
      else if (stable(loc) !== stable(rv)) out.gardes.push({ s: d.s, k: d.k, raison: 'differe' });
      else out.retirer.push({ s: d.s, k: d.k });
      continue;
    }
    const enLigne = rv as Record<string, unknown>;
    if (!enLigne || typeof enLigne !== 'object' || !CHAMPS_SANTE_CONTRAT.some((f) => f in enLigne)) continue;
    const l = loc as Record<string, unknown> | undefined;
    if (!l || typeof l !== 'object') out.gardes.push({ s: d.s, k: d.k, raison: 'manque' });
    else if (CHAMPS_SANTE_CONTRAT.some((f) => !(f in l) || stable(l[f]) !== stable(enLigne[f]))) out.gardes.push({ s: d.s, k: d.k, raison: 'differe' });
    else out.corriger.push({ s: d.s, k: d.k, value: contratSansSante(enLigne) });
  }
  return out;
}

/** Marge de recouvrement pour reprendre l'écoute : on relit la dernière minute, sans risque (l'application est idempotente). */
export const RESUME_MARGIN_MS = 60_000;

export function nextSince(prev: number, docs: RemoteDoc[]): number {
  let max = prev;
  for (const d of docs) if (d.t > max) max = d.t;
  return max;
}
