// État de l'app en mémoire, écrit dans IndexedDB à chaque changement. Chaque action peut être annulée.
import { useEffect, useState } from 'preact/hooks';
import * as db from './db';
import type { AmLeave, Bulletin, Contract, DayRec, Journal, Settings } from './engine/model';
import { makeCtx, type Ctx } from './engine/payroll';
import { today } from './engine/dates';

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
    db.getAll<AmLeave>('leaves'), db.getAll<Bulletin>('bulletins'), db.getAll<Journal>('journal'),
    db.getAll<Feedback>('feedback'), db.getAll<Usage>('usage'),
  ]);
  const s = kv.find((x) => x.k === 'settings');
  state.settings = { ...DEFAULT_SETTINGS, ...((s?.v as Settings) ?? {}) };
  state.contracts = contracts.sort((a, b) => a.createdAt - b.createdAt);
  state.days = new Map(days.map((d) => [d.key, d]));
  state.leaves = leaves.sort((a, b) => a.from.localeCompare(b.from));
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
  state.leaves = state.leaves.filter((x) => x.id !== id);
  await db.del('leaves', id);
  emit();
  return async () => { if (prev) await putLeave(prev); };
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

// ---------- Contexte de calcul ----------
const ctxCache = new Map<string, Ctx>();
export function ctxFor(c: Contract, at = today()): Ctx {
  const enfants = state.settings?.enfantsACharge ?? 0;
  const k = c.id + at + '|' + enfants;
  let x = ctxCache.get(k);
  if (!x) {
    x = makeCtx(c, [...state.days.values()].filter((d) => d.cid === c.id), state.leaves, at, enfants);
    ctxCache.set(k, x);
  }
  return x;
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
