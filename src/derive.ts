import { addMonthsYM, yearMonth, type ISODate, type YearMonth } from './engine/dates';
import { computeLedger, yearTax, type Dossier, type Ledger } from './engine/ledger';
import type { Contract } from './engine/types';
import type { AppState, Child, Family } from './state';

export function dossierFor(s: AppState, c: Contract): Dossier {
  const opening = s.openings.find((o) => o.contractId === c.id);
  return {
    contract: c,
    entries: s.entries.filter((e) => e.contractId === c.id),
    history: s.history.filter((h) => h.contractId === c.id),
    ...(opening ? { opening } : {}),
    controls: s.controls.filter((x) => x.contractId === c.id),
    amLeave: s.amLeave,
    amChildrenBirthDates: s.profile?.childrenBirthDates ?? [],
    amAtLeast21: s.profile?.atLeast21 ?? true,
  };
}

const cache = new WeakMap<AppState, Map<string, Ledger>>();

/** Registre d'un contrat jusqu'au mois demandé (mémorisé pour un même état). */
export function ledgerFor(s: AppState, c: Contract, today: ISODate, until: YearMonth, nowMinutes?: number): Ledger {
  let byKey = cache.get(s);
  if (!byKey) {
    byKey = new Map();
    cache.set(s, byKey);
  }
  const key = `${c.id}|${today}|${until}|${nowMinutes ?? ''}`;
  const hit = byKey.get(key);
  if (hit) return hit;
  const ledger = computeLedger(dossierFor(s, c), {
    today,
    until,
    ...(nowMinutes !== undefined ? { nowMinutes } : {}),
  });
  byKey.set(key, ledger);
  return ledger;
}

export function childOf(s: AppState, c: Contract): Child | undefined {
  return s.children.find((k) => k.id === c.childId);
}

export function familyOf(s: AppState, c: Contract): Family | undefined {
  return s.families.find((f) => f.id === c.familyId);
}

/** Contrats actifs pendant au moins un jour du mois. */
export function contractsInMonth(s: AppState, ym: YearMonth): Contract[] {
  const start = `${ym}-01`;
  const end = `${ym}-31`;
  return s.contracts.filter((c) => c.startDate <= end && (!c.endDate || c.endDate >= start));
}

export function lastClosedMonth(today: ISODate): YearMonth {
  return addMonthsYM(yearMonth(today), -1);
}

export function taxForYear(s: AppState, year: number, today: ISODate): ReturnType<typeof yearTax> {
  const ledgers = s.contracts
    .filter((c) => c.startDate <= `${year}-12-31` && (!c.endDate || c.endDate >= `${year}-01-01`))
    .map((c) => ledgerFor(s, c, today, `${year}-12`));
  return yearTax(ledgers, year);
}

/** Couleur d'identité d'un enfant : classe CSS kid-1 … kid-6. */
export function kidClass(child: Child | undefined): string {
  return child?.color ?? 'kid-6';
}

export const KID_COLORS = ['kid-1', 'kid-2', 'kid-3', 'kid-4', 'kid-5', 'kid-6'] as const;

export function nextKidColor(s: AppState): string {
  const used = new Set(s.children.map((c) => c.color));
  return KID_COLORS.find((k) => !used.has(k)) ?? KID_COLORS[s.children.length % KID_COLORS.length] ?? 'kid-6';
}

/** Initiale de l'enfant, ou deux lettres si un autre enfant commence par la même. */
export function initialsOf(s: AppState, child: Child | undefined): string {
  if (!child) return '?';
  const first = (child.firstName.trim()[0] ?? '?').toUpperCase();
  const clash = s.children.some((k) => k.id !== child.id && (k.firstName.trim()[0] ?? '').toUpperCase() === first);
  if (!clash) return first;
  return first + (child.firstName.trim()[1] ?? '').toLowerCase();
}
