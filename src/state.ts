import type { ISODate } from './engine/dates';
import type { EndKind } from './engine/rupture';
import type { Contract, ControlEntry, DateRange, DayEntry, HistoryMonth, OpeningBalances } from './engine/types';
import { loadStateJson, saveStateJson } from './storage';

export interface Profile {
  firstName: string;
  hasProfessionalTitle: boolean;
  /** Dates de naissance des enfants de l'AM (jours de congés supplémentaires) */
  childrenBirthDates: ISODate[];
  atLeast21: boolean;
  agrementEnd?: ISODate;
  places?: number;
}

export interface Family {
  id: string;
  name: string;
  parentNames: string;
  phone?: string;
  email?: string;
}

export interface Child {
  id: string;
  familyId: string;
  firstName: string;
  birthDate?: ISODate;
  color: string;
  instructions?: string;
}

export type NoteKind = 'repas' | 'sieste' | 'change' | 'humeur' | 'soin' | 'libre';

export interface CarnetNote {
  id: string;
  childId: string;
  date: ISODate;
  /** Minutes depuis minuit */
  time: number;
  kind: NoteKind;
  text: string;
}

export interface SentRecap {
  contractId: string;
  month: string;
  sentAt: string;
  totalCents: number;
  /** Envoyé avant la fin du mois : une estimation, le récapitulatif final reste à envoyer */
  provisional?: boolean;
}

export interface Ending {
  contractId: string;
  kind: EndKind;
  notificationDate: ISODate;
  endDate: ISODate;
}

export interface JournalEvent {
  at: string;
  screen: string;
  action: string;
}

export interface Report {
  at: string;
  screen: string;
  note: string;
}

export interface AppState {
  version: 1;
  profile: Profile | null;
  families: Family[];
  children: Child[];
  contracts: Contract[];
  entries: DayEntry[];
  amLeave: DateRange[];
  history: HistoryMonth[];
  openings: OpeningBalances[];
  controls: ControlEntry[];
  notes: CarnetNote[];
  sent: SentRecap[];
  endings: Ending[];
  journal: JournalEvent[];
  reports: Report[];
  /** Journées envoyées aux parents : clés « idEnfant|date » */
  daySent: string[];
  settings: {
    lastBackupAt?: string;
    lastBackupPromptDay?: ISODate;
  };
}

export function emptyState(): AppState {
  return {
    version: 1,
    profile: null,
    families: [],
    children: [],
    contracts: [],
    entries: [],
    amLeave: [],
    history: [],
    openings: [],
    controls: [],
    notes: [],
    sent: [],
    endings: [],
    journal: [],
    reports: [],
    daySent: [],
    settings: {},
  };
}

/** Vérifie la forme d'un état importé ; lève une erreur lisible sinon. */
export function parseState(json: string): AppState {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Ce fichier n’est pas une sauvegarde valide.');
  }
  if (!data || typeof data !== 'object' || (data as { version?: unknown }).version !== 1) {
    throw new Error('Ce fichier n’est pas une sauvegarde de ce site.');
  }
  const base = emptyState();
  const obj = data as Partial<AppState>;
  const arrays: Array<keyof AppState> = [
    'families', 'children', 'contracts', 'entries', 'amLeave', 'history', 'openings', 'controls',
    'notes', 'sent', 'endings', 'journal', 'reports', 'daySent',
  ];
  for (const k of arrays) {
    const v = obj[k];
    if (v !== undefined && !Array.isArray(v)) throw new Error(`Sauvegarde abîmée (${k}).`);
  }
  return { ...base, ...obj, settings: { ...base.settings, ...(obj.settings ?? {}) } } as AppState;
}

// ---------------------------------------------------------------------------
// Magasin : un état en mémoire, des abonnés, une écriture différée sur le téléphone
// ---------------------------------------------------------------------------

type Listener = () => void;

let state: AppState = emptyState();
let loaded = false;
const listeners = new Set<Listener>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSaveError: string | null = null;

export function getState(): AppState {
  return state;
}

export function isLoaded(): boolean {
  return loaded;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  for (const l of listeners) l();
}

export function todayISO(now = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function nowMinutes(now = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

export async function loadState(): Promise<void> {
  const json = await loadStateJson();
  state = json ? parseState(json) : emptyState();
  loaded = true;
  emit();
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveStateJson(JSON.stringify(state), todayISO())
      .then(() => {
        lastSaveError = null;
      })
      .catch((err: unknown) => {
        lastSaveError = err instanceof Error ? err.message : 'Enregistrement impossible';
        emit();
      });
  }, 250);
}

export function saveError(): string | null {
  return lastSaveError;
}

/** Applique une modification et l'enregistre. */
export function update(mutator: (draft: AppState) => AppState): void {
  state = mutator(state);
  emit();
  scheduleSave();
}

export function replaceState(next: AppState): void {
  state = next;
  emit();
  scheduleSave();
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Enregistre un événement d'usage pour le pilote (aucune donnée personnelle). */
export function logEvent(screen: string, action: string): void {
  update((s) => ({ ...s, journal: [...s.journal, { at: new Date().toISOString(), screen, action }].slice(-5000) }));
}

/** Remplace la saisie d'une journée (ou la supprime si `entry` est null). */
export function setEntry(contractId: string, date: ISODate, entry: Omit<DayEntry, 'contractId' | 'date'> | null): void {
  update((s) => {
    const others = s.entries.filter((e) => !(e.contractId === contractId && e.date === date));
    return { ...s, entries: entry ? [...others, { contractId, date, ...entry }] : others };
  });
}

export function entryFor(s: AppState, contractId: string, date: ISODate): DayEntry | undefined {
  return s.entries.find((e) => e.contractId === contractId && e.date === date);
}

/** Contrat en cours pour un enfant à une date. */
export function activeContract(s: AppState, childId: string, date: ISODate): Contract | undefined {
  return s.contracts.find((c) => c.childId === childId && c.startDate <= date && (!c.endDate || date <= c.endDate));
}
