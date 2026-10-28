/**
 * Modifications de l'état déclenchées par l'interface, avec de quoi les annuler.
 * Chaque fonction renvoie une fonction d'annulation qui remet l'état d'avant.
 */
import { addDays, formatLongDate, formatTime, type ISODate, type Minutes } from './engine/dates';
import { patternMinutesOn } from './engine/schedule';
import type { AbsenceReason, DateRange, DayEntry } from './engine/types';
import { getState, newId, update, type AppState, type CarnetNote, type NoteKind } from './state';

export type Undo = () => void;

type Slice = 'entries' | 'amLeave' | 'notes' | 'contracts' | 'children' | 'families' | 'controls' | 'history' | 'openings' | 'endings' | 'sent';

/**
 * Photo des seules parties de l'état qu'une action va modifier : l'annulation les remet
 * en place sans effacer ce qui a été fait ailleurs entre-temps (une note, un signalement).
 */
export function snapshotSlices(keys: readonly Slice[]): Undo {
  const before = getState();
  const saved = Object.fromEntries(keys.map((k) => [k, before[k]])) as Partial<AppState>;
  return () => update((s) => ({ ...s, ...saved }));
}

function snapshot(): Undo {
  return snapshotSlices(['entries', 'amLeave']);
}

type EntryFields = Omit<DayEntry, 'contractId' | 'date'>;

function strip(e: DayEntry | undefined): EntryFields {
  if (!e) return {};
  const { contractId: _c, date: _d, ...rest } = e;
  return rest;
}

function putEntry(s: AppState, contractId: string, date: ISODate, fields: EntryFields | null): AppState {
  const others = s.entries.filter((e) => !(e.contractId === contractId && e.date === date));
  const clean = fields ? Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as EntryFields : null;
  const keep = clean && Object.keys(clean).length > 0;
  return { ...s, entries: keep ? [...others, { contractId, date, ...clean }] : others };
}

function entryOf(s: AppState, contractId: string, date: ISODate): DayEntry | undefined {
  return s.entries.find((e) => e.contractId === contractId && e.date === date);
}

/** Arrivée : première de la journée, ou retour après un départ (journée coupée). */
export function arrive(contractId: string, date: ISODate, at: Minutes): Undo {
  const undo = snapshot();
  update((s) => {
    const e = strip(entryOf(s, contractId, date));
    if (e.arrival !== undefined && e.departure !== undefined && e.arrival2 === undefined) {
      return putEntry(s, contractId, date, { ...e, arrival2: Math.max(at, e.departure) });
    }
    const { absence: _a, certificate: _c, departure: _d, arrival2: _a2, departure2: _d2, ...rest } = e;
    return putEntry(s, contractId, date, { ...rest, arrival: at });
  });
  return undo;
}

export function depart(contractId: string, date: ISODate, at: Minutes): Undo {
  const undo = snapshot();
  update((s) => {
    const e = strip(entryOf(s, contractId, date));
    if (e.arrival2 !== undefined) return putEntry(s, contractId, date, { ...e, departure2: Math.max(at, e.arrival2) });
    return putEntry(s, contractId, date, { ...e, departure: Math.max(at, e.arrival ?? at) });
  });
  return undo;
}

/** Remplace la saisie d'une journée (null : la journée redevient « comme prévu »). */
export function saveDay(contractId: string, date: ISODate, fields: EntryFields | null): Undo {
  const undo = snapshot();
  update((s) => putEntry(s, contractId, date, fields));
  return undo;
}

/** Contrats qui prévoient un accueil ce jour-là. */
export function contractsScheduledOn(s: AppState, date: ISODate): string[] {
  return s.contracts
    .filter((c) => c.startDate <= date && (!c.endDate || date <= c.endDate) && patternMinutesOn(c.pattern, date) > 0)
    .map((c) => c.id);
}

export const AM_REASONS: readonly AbsenceReason[] = ['am_malade', 'am_enfant_malade', 'am_sans_solde', 'am_evenement_familial'];

export function setAbsence(contractIds: readonly string[], date: ISODate, reason: AbsenceReason, certificate: boolean): Undo {
  const undo = snapshot();
  update((s) => {
    let next = s;
    for (const id of contractIds) {
      const e = strip(entryOf(next, id, date));
      next = putEntry(next, id, date, {
        absence: reason,
        ...(reason === 'enfant_malade' && certificate ? { certificate: true } : {}),
        ...(e.km ? { km: e.km } : {}),
      });
    }
    return next;
  });
  return undo;
}

/**
 * Congés payés de l'AM : ajoute une plage (fusionnée avec les plages voisines).
 * Les saisies sans heures de la plage (absence, repas décoché…) sont effacées :
 * sinon elles primeraient sur les congés.
 */
export function addLeave(range: DateRange): Undo {
  const undo = snapshot();
  update((s) => ({
    ...s,
    amLeave: mergeRanges([...s.amLeave, range]),
    entries: s.entries.filter((e) => e.date < range.from || e.date > range.to || e.arrival !== undefined),
  }));
  return undo;
}

/** Retire des congés de l'AM les jours d'une plage. */
export function removeLeave(range: DateRange): Undo {
  const undo = snapshot();
  update((s) => {
    const out: DateRange[] = [];
    for (const r of s.amLeave) {
      if (r.to < range.from || r.from > range.to) {
        out.push(r);
        continue;
      }
      if (r.from < range.from) out.push({ from: r.from, to: addDays(range.from, -1) });
      if (r.to > range.to) out.push({ from: addDays(range.to, 1), to: r.to });
    }
    return { ...s, amLeave: out };
  });
  return undo;
}

export function inLeave(s: AppState, date: ISODate): boolean {
  return s.amLeave.some((r) => r.from <= date && date <= r.to);
}

export function mergeRanges(ranges: readonly DateRange[]): DateRange[] {
  const sorted = [...ranges].filter((r) => r.from <= r.to).sort((a, b) => (a.from < b.from ? -1 : 1));
  const out: DateRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.from <= addDays(last.to, 1)) {
      if (r.to > last.to) last.to = r.to;
    } else out.push({ ...r });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Carnet de liaison
// ---------------------------------------------------------------------------

export function addNotes(childIds: readonly string[], date: ISODate, time: Minutes, kind: NoteKind, text: string): { ids: string[]; undo: Undo } {
  const undo = snapshot();
  const notes: CarnetNote[] = childIds.map((childId) => ({ id: newId(), childId, date, time, kind, text }));
  update((s) => ({ ...s, notes: [...s.notes, ...notes] }));
  return { ids: notes.map((n) => n.id), undo };
}

/** Supprime un contrat et tout ce qui n'appartient qu'à lui. */
export function deleteContract(contractId: string): Undo {
  const undo = snapshotSlices(['contracts', 'children', 'families', 'entries', 'notes', 'controls', 'history', 'openings', 'endings', 'sent']);
  update((s) => {
    const c = s.contracts.find((x) => x.id === contractId);
    if (!c) return s;
    const contracts = s.contracts.filter((x) => x.id !== contractId);
    const childKept = contracts.some((x) => x.childId === c.childId);
    const familyKept = contracts.some((x) => x.familyId === c.familyId);
    const mine = <T extends { contractId: string }>(list: T[]): T[] => list.filter((x) => x.contractId !== contractId);
    return {
      ...s,
      contracts,
      children: childKept ? s.children : s.children.filter((k) => k.id !== c.childId),
      families: familyKept ? s.families : s.families.filter((f) => f.id !== c.familyId),
      notes: childKept ? s.notes : s.notes.filter((n) => n.childId !== c.childId),
      entries: mine(s.entries),
      controls: mine(s.controls),
      history: mine(s.history),
      openings: mine(s.openings),
      endings: mine(s.endings),
      sent: mine(s.sent),
    };
  });
  return undo;
}

export function editNotes(ids: readonly string[], patch: Partial<Pick<CarnetNote, 'text' | 'time'>>): void {
  const set = new Set(ids);
  update((s) => ({ ...s, notes: s.notes.map((n) => (set.has(n.id) ? { ...n, ...patch } : n)) }));
}

export function deleteNotes(ids: readonly string[]): Undo {
  const undo = snapshot();
  const set = new Set(ids);
  update((s) => ({ ...s, notes: s.notes.filter((n) => !set.has(n.id)) }));
  return undo;
}

export const NOTE_LABELS: Record<NoteKind, string> = {
  repas: 'Repas',
  sieste: 'Sieste',
  change: 'Change',
  humeur: 'Humeur',
  soin: 'Soin',
  libre: 'Note',
};

export const NOTE_CHIPS: Record<NoteKind, string[]> = {
  repas: ['A tout mangé', 'A bien mangé', 'A peu mangé', 'N’a pas mangé', 'Biberon'],
  sieste: [],
  change: ['Pipi', 'Selles', 'Rien'],
  humeur: ['De bonne humeur', 'Calme', 'Fatigue', 'Grognon', 'A pleuré'],
  soin: ['Température', 'Crème', 'Médicament prescrit', 'Petite chute'],
  libre: [],
};

export const NAP_START = 'Début de sieste';
export const NAP_END = 'Fin de sieste';

/** Heure de début de la sieste en cours, ou null. */
export function napSince(s: AppState, childId: string, date: ISODate): Minutes | null {
  const naps = s.notes.filter((n) => n.childId === childId && n.date === date && n.kind === 'sieste').sort((a, b) => a.time - b.time);
  const last = naps[naps.length - 1];
  return last && last.text.startsWith(NAP_START) ? last.time : null;
}

function durationText(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

export interface TimelineItem {
  time: Minutes;
  title: string;
  detail?: string;
  noteIds?: string[];
  kind: 'arrivee' | 'depart' | 'note' | 'sieste';
}

/** Journée d'un enfant : arrivée, notes (siestes regroupées), départ. */
export function timeline(s: AppState, childId: string, contractId: string | undefined, date: ISODate): TimelineItem[] {
  const items: TimelineItem[] = [];
  const entry = contractId ? entryOf(s, contractId, date) : undefined;
  if (entry?.arrival !== undefined) items.push({ time: entry.arrival, title: 'Arrivée', kind: 'arrivee' });
  if (entry?.departure !== undefined) items.push({ time: entry.departure, title: 'Départ', kind: 'depart' });
  if (entry?.arrival2 !== undefined) items.push({ time: entry.arrival2, title: 'Retour', kind: 'arrivee' });
  if (entry?.departure2 !== undefined) items.push({ time: entry.departure2, title: 'Départ', kind: 'depart' });
  const notes = s.notes.filter((n) => n.childId === childId && n.date === date).sort((a, b) => a.time - b.time);
  let napStart: CarnetNote | null = null;
  for (const n of notes) {
    if (n.kind === 'sieste') {
      if (n.text.startsWith(NAP_START)) {
        napStart = n;
        items.push({ time: n.time, title: 'Sieste', detail: 'en cours', noteIds: [n.id], kind: 'sieste' });
      } else if (napStart) {
        const item = items.find((i) => i.noteIds?.[0] === napStart?.id);
        if (item) {
          item.detail = `jusqu’à ${formatTime(n.time)}, ${durationText(n.time - napStart.time)}`;
          item.noteIds = [napStart.id, n.id];
        }
        napStart = null;
      } else {
        items.push({ time: n.time, title: 'Réveil', noteIds: [n.id], kind: 'sieste' });
      }
      continue;
    }
    if (n.kind === 'libre' && !n.text.trim()) continue;
    items.push({ time: n.time, title: NOTE_LABELS[n.kind], ...(n.text ? { detail: n.text } : {}), noteIds: [n.id], kind: 'note' });
  }
  return items.sort((a, b) => a.time - b.time);
}

/** Texte de la journée, envoyé aux parents. */
export function daySummary(s: AppState, childId: string, contractId: string | undefined, date: ISODate): string {
  const child = s.children.find((c) => c.id === childId);
  const lines = [`Journée de ${child?.firstName ?? ''}, ${formatLongDate(date)}`, ''];
  for (const item of timeline(s, childId, contractId, date)) {
    const detail = item.detail && item.detail !== 'en cours' ? ` : ${item.detail}` : '';
    lines.push(`${formatTime(item.time)}  ${item.title}${detail}`);
  }
  if (s.profile?.firstName) lines.push('', s.profile.firstName);
  return lines.join('\n');
}

export function markDaySent(childId: string, date: ISODate): void {
  const key = `${childId}|${date}`;
  update((s) => (s.daySent.includes(key) ? s : { ...s, daySent: [...s.daySent, key].slice(-2000) }));
}

export function isDaySent(s: AppState, childId: string, date: ISODate): boolean {
  return s.daySent.includes(`${childId}|${date}`);
}
