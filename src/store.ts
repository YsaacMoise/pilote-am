// État de l'app en mémoire, écrit dans IndexedDB à chaque changement. Chaque action peut être annulée.
import { useEffect, useState } from 'preact/hooks';
import * as db from './db';
import type { AmLeave, Bulletin, Contract, DayRec, Journal, Settings } from './engine/model';
import { brutDuNet, makeCtx, monthBase, type Ctx } from './engine/payroll';
import { addMonths, firstDay, lastDay, monthOf, today, type Month } from './engine/dates';
import { computeMonth } from './engine/month';
import { liensApresSuppression, normaliserAbsences, type AbsenceLue } from './engine/absences';
import { ecranDe, evErreur, type ErreurCode } from './usage-events';

export interface Feedback { id: string; ts: number; screen: string; text: string }
export interface Usage { id: string; ts: number; ev: string; screen?: string }
export interface Snapshot { id: string; ts: number; data: db.Dump }

export interface State {
  ready: boolean;
  settings: Settings;
  contracts: Contract[];
  days: Map<string, DayRec>;
  leaves: AmLeave[];
  bulletins: Bulletin[];
  journal: Journal[];
  feedback: Feedback[];
  usage: Usage[];
}

const DEFAULT_SETTINGS: Settings = { amName: '', enfantsACharge: 0 };

export const state: State = {
  ready: false, settings: { ...DEFAULT_SETTINGS }, contracts: [], days: new Map(), leaves: [], bulletins: [], journal: [],
  feedback: [], usage: [],
};

let version = 0;
const subs = new Set<() => void>();
function emit() {
  version++;
  ctxCache.clear();
  subs.forEach((f) => f());
  scheduleAutoCopy();
}

export function useStore(): State {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set(version);
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  return state;
}

/** Prévient à chaque changement des données (hors écran) ; renvoie la fonction pour arrêter */
export function subscribe(f: () => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function load(): Promise<void> {
  const [kv, contracts, days, leaves, bulletins, journal, feedback, usage] = await Promise.all([
    db.getAll<{ k: string; v: unknown }>('kv'), db.getAll<Contract>('contracts'), db.getAll<DayRec>('days'),
    db.getAll<AbsenceLue>('leaves'), db.getAll<Bulletin>('bulletins'), db.getAll<Journal>('journal'),
    db.getAll<Feedback>('feedback'), db.getAll<Usage>('usage'),
  ]);
  const s = kv.find((x) => x.k === 'settings');
  state.settings = { ...DEFAULT_SETTINGS, ...((s?.v as Settings) ?? {}) };
  state.contracts = contracts.sort((a, b) => a.createdAt - b.createdAt);
  state.days = new Map(days.map((d) => [d.key, d]));
  // Décision du DG du 21/11/2026 (« sans la raison ») : une absence enregistrée avec sa nature ou son cas non géré est
  // ramenée à la forme sans raison, puis réécrite (téléphone et compte en ligne). Jours et dates gardés.
  // Le lien « suite de » est posé avant, selon l'ancienne règle (normaliserAbsences), pour garder la même paie.
  const normalisees = normaliserAbsences(leaves);
  const ramenees = normalisees.filter((n, i) => n !== leaves[i]);
  state.leaves = normalisees.sort((a, b) => a.from.localeCompare(b.from));
  for (const l of ramenees) {
    try { await db.put('leaves', l); } catch { /* réécrite au prochain chargement ; la forme lue est déjà sans raison */ }
  }
  state.bulletins = bulletins;
  state.journal = journal;
  state.feedback = feedback;
  state.usage = usage;
  state.ready = true;
  emit();
}

// ---------- Annulation ----------
type Undo = () => Promise<void>;
export interface ToastMsg { id: number; text: string; undo?: Undo; tone?: 'ok' | 'warn'; action?: string }
let toastId = 0;
const toastSubs = new Set<(t: ToastMsg | null) => void>();
export function onToast(f: (t: ToastMsg | null) => void) {
  toastSubs.add(f);
  return () => toastSubs.delete(f);
}
export function toast(text: string, undo?: Undo, tone?: 'ok' | 'warn', action?: string) {
  const t = { id: ++toastId, text, undo, tone, action };
  toastSubs.forEach((f) => f(t));
}

// ---------- Mutations ----------
export async function saveSettings(patch: Partial<Settings>) {
  state.settings = { ...state.settings, ...patch };
  await db.put('kv', { k: 'settings', v: state.settings });
  emit();
}

export async function putContract(c: Contract) {
  const prev = state.contracts.find((x) => x.id === c.id);
  state.contracts = prev ? state.contracts.map((x) => (x.id === c.id ? c : x)) : [...state.contracts, c];
  await db.put('contracts', c);
  emit();
  return prev;
}

export async function deleteContract(id: string): Promise<Undo> {
  const c = state.contracts.find((x) => x.id === id);
  const days = [...state.days.values()].filter((d) => d.cid === id);
  const bul = state.bulletins.filter((b) => b.cid === id);
  const jr = state.journal.filter((j) => j.cid === id);
  state.contracts = state.contracts.filter((x) => x.id !== id);
  for (const d of days) { state.days.delete(d.key); await db.del('days', d.key); }
  state.bulletins = state.bulletins.filter((b) => b.cid !== id);
  state.journal = state.journal.filter((j) => j.cid !== id);
  await db.del('contracts', id);
  for (const b of bul) await db.del('bulletins', b.id);
  for (const j of jr) await db.del('journal', j.id);
  emit();
  return async () => {
    if (c) await putContract(c);
    for (const d of days) await putDayRaw(d);
    for (const b of bul) await putBulletin(b);
    for (const j of jr) await addJournal(j);
    emit();
  };
}

async function putDayRaw(r: DayRec) {
  state.days.set(r.key, r);
  await db.put('days', r);
}

function isEmptyDay(r: DayRec): boolean {
  return !r.pres?.length && !r.abs && !r.extra && !r.ferieTravaille && r.repas == null && r.km == null;
}

/** Modifie un jour ; renvoie la fonction d'annulation */
export async function updateDay(cid: string, date: string, f: (r: DayRec) => DayRec): Promise<Undo> {
  const key = `${cid}|${date}`;
  const prev = state.days.get(key);
  const next = f(prev ? structuredClone(prev) : { key, cid, date });
  if (isEmptyDay(next)) {
    state.days.delete(key);
    await db.del('days', key);
  } else {
    await putDayRaw(next);
  }
  emit();
  return async () => {
    if (prev) await putDayRaw(prev);
    else { state.days.delete(key); await db.del('days', key); }
    emit();
  };
}

export async function putLeave(l: AmLeave): Promise<Undo> {
  const prev = state.leaves.find((x) => x.id === l.id);
  state.leaves = [...state.leaves.filter((x) => x.id !== l.id), l].sort((a, b) => a.from.localeCompare(b.from));
  await db.put('leaves', l);
  emit();
  return async () => {
    if (prev) await putLeave(prev);
    else await deleteLeave(l.id);
  };
}

export async function deleteLeave(id: string): Promise<Undo> {
  const prev = state.leaves.find((x) => x.id === id);
  // Relecture n° 52 (N1) : le groupe d'un événement familial reste entier quand une de ses absences est supprimée.
  const relies = liensApresSuppression(id, state.leaves);
  const avant = relies.map((r) => state.leaves.find((x) => x.id === r.id)!);
  for (const r of relies) {
    state.leaves = state.leaves.map((x) => (x.id === r.id ? r : x));
    await db.put('leaves', r);
  }
  state.leaves = state.leaves.filter((x) => x.id !== id);
  await db.del('leaves', id);
  emit();
  return async () => {
    if (prev) await putLeave(prev);
    for (const a of avant) await putLeave(a);
  };
}

export async function putBulletin(b: Bulletin) {
  state.bulletins = [...state.bulletins.filter((x) => x.id !== b.id), b];
  await db.put('bulletins', b);
  emit();
}

export async function addJournal(j: Journal): Promise<Undo> {
  state.journal = [...state.journal.filter((x) => x.id !== j.id), j];
  await db.put('journal', j);
  emit();
  return async () => { await deleteJournal(j.id); };
}

/** Remplace une note existante ; l'annulation remet la version d'avant */
export async function updateJournal(j: Journal): Promise<Undo> {
  const prev = state.journal.find((x) => x.id === j.id);
  await addJournal(j);
  return async () => { if (prev) await addJournal(prev); else await deleteJournal(j.id); };
}

export async function deleteJournal(id: string): Promise<Undo> {
  const prev = state.journal.find((x) => x.id === id);
  state.journal = state.journal.filter((x) => x.id !== id);
  await db.del('journal', id);
  emit();
  return async () => { if (prev) await addJournal(prev); };
}

export async function addFeedback(screen: string, text: string) {
  const f: Feedback = { id: uid(), ts: Date.now(), screen, text };
  state.feedback = [...state.feedback, f];
  await db.put('feedback', f);
  emit();
  return async () => {
    state.feedback = state.feedback.filter((x) => x.id !== f.id);
    await db.del('feedback', f.id);
    emit();
  };
}

/** Journal d'usage local : événements sans contenu personnel */
export function logUsage(ev: string, screen?: string) {
  const u: Usage = { id: uid(), ts: Date.now(), ev, screen };
  state.usage.push(u);
  db.put('usage', u).catch(() => {});
  import('./analytics').then((a) => a.track(ev, screen)).catch(() => {});
}

/** Erreur affichée (C-101) : nom d'événement fixe et écran courant, jamais le texte du message ni la saisie. */
export function logErreur(code: ErreurCode) {
  const h = typeof location === 'undefined' ? '' : location.hash;
  logUsage(evErreur(code), ecranDe(h));
}

// ---------- Contexte de calcul ----------
const ctxCache = new Map<string, Ctx>();
export function ctxFor(c: Contract, at = today()): Ctx {
  const enfants = state.settings?.enfantsACharge ?? 0;
  const moins21 = state.settings?.amMoins21Jusqu;
  const k = c.id + at + '|' + enfants + '|' + (moins21 ?? '');
  let x = ctxCache.get(k);
  if (!x) {
    x = makeCtx(c, [...state.days.values()].filter((d) => d.cid === c.id), state.leaves, at, enfants, moins21);
    x.autresContrats = state.contracts.filter((o) => o.id !== c.id);
    x.partIJ = (l) => partIJContrat(c, l);
    x.kmAnnee = state.settings?.kmAnnee;
    ctxCache.set(k, x);
  }
  return x;
}

/**
 * T-103 (N1) : part de ce contrat dans les indemnités journalières de l'absence `l`. CSS R323-4 : le gain journalier de base
 * est calculé sur les salaires des trois mois civils qui précèdent l'arrêt, tous employeurs : la part d'un parent est son
 * salaire brut de ces trois mois sur le total (contrats de l'app, plus les salaires hors de l'app saisis par l'AM).
 * `undefined` : les salaires hors de l'app ne sont pas saisis, ou aucun salaire n'est connu.
 */
const ijEnCours = new Set<string>();
export function partIJContrat(c: Contract, l: AmLeave): number | undefined {
  if (l.ijSalairesAutres === undefined) return undefined;
  const debut = monthOf(l.from);
  const mois = [3, 2, 1].map((k) => addMonths(debut, -k));
  // Salaire brut du mois, congés payés versés compris (computeMonth). Un calcul de congés qui reviendrait sur cette absence
  // (période de référence en cours) est coupé : le mois est alors lu sans ses congés (monthBase).
  const brutMois = (x: Contract, m: Month) => {
    const cle = `${l.id}|${x.id}|${m}`;
    if (ijEnCours.has(cle)) return brutDuNet(x, monthBase(ctxFor(x), m).net, lastDay(m));
    ijEnCours.add(cle);
    try { const r = computeMonth(ctxFor(x), m); return r.nonGere.length ? 0 : r.brutEstime; } finally { ijEnCours.delete(cle); }
  };
  const brut = (x: Contract) => mois.reduce((t, m) => (x.start > lastDay(m) || (x.end && x.end < firstDay(m)) ? t : t + brutMois(x, m)), 0);
  const ici = brut(c);
  const total = state.contracts.reduce((t, x) => t + (x.id === c.id ? ici : brut(x)), 0) + l.ijSalairesAutres;
  return total > 0 ? ici / total : undefined;
}

export function activeContracts(at = today()): Contract[] {
  return state.contracts.filter((c) => c.start <= at && (!c.end || c.end >= at));
}

// ---------- Copies automatiques locales ----------
let autoTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleAutoCopy() {
  if (!state.ready) return;
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => { autoCopy().catch(() => {}); }, 4000);
}

export async function autoCopy(force = false) {
  const last = state.settings.lastAutoCopy ?? 0;
  if (!force && Date.now() - last < 20 * 3600 * 1000) return;
  if (!state.contracts.length) return;
  const data = await db.dumpAll();
  const snap: Snapshot = { id: new Date().toISOString(), ts: Date.now(), data };
  await db.put('snapshots', snap);
  const all = (await db.getAll<Snapshot>('snapshots')).sort((a, b) => b.ts - a.ts);
  for (const s of all.slice(7)) await db.del('snapshots', s.id);
  // Relu juste avant d'écrire : un autre appareil a pu changer les réglages pendant la copie.
  const cur = await db.get<{ k: string; v: Settings }>('kv', 'settings');
  state.settings = { ...state.settings, ...(cur?.v ?? {}), lastAutoCopy: Date.now() };
  await db.put('kv', { k: 'settings', v: state.settings });
}

export async function listSnapshots(): Promise<Snapshot[]> {
  return (await db.getAll<Snapshot>('snapshots')).sort((a, b) => b.ts - a.ts);
}

export async function restoreDump(d: db.Dump) {
  // Avant d'écraser : une copie de sécurité de l'état actuel.
  if (state.contracts.length) await autoCopy(true);
  // Une sauvegarde ancienne peut contenir un lien parent coupé depuis : on ne le rouvre pas.
  await db.replaceAll({ ...d, contracts: (d.contracts as Contract[]).map(({ partage: _, ...c }) => c) });
  await load();
}
