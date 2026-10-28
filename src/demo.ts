/**
 * Données d'exemple pour l'aperçu : quatre enfants fictifs, datés autour d'aujourd'hui.
 * Elles ne servent qu'à découvrir l'app ; rien n'est envoyé nulle part.
 */
import { addDays, addMonthsYM, weekday, yearMonth, type ISODate } from './engine/dates';
import type { Contract, DayEntry } from './engine/types';
import { emptyState, type AppState } from './state';

function contract(id: string, childId: string, familyId: string, startDate: ISODate, days: number[], start: number, end: number, rate: number, extra: Partial<Contract> = {}): Contract {
  return {
    id, childId, familyId, startDate, yearType: 'complete', programmedWeeks: 52, nonAccueil: [],
    pattern: Object.fromEntries(days.map((d) => [d, [{ start, end }]])), hourlyNetMilli: rate, majorationPct: 10,
    complementaryPct: 0, entretien: { kind: 'minimum' }, mealCents: 0, kmMilli: 0, cpPaymentMode: 'juin', childMajoration: false,
    ...extra,
  };
}

export function demoState(today: ISODate, now: number): AppState {
  const start = `${addMonthsYM(yearMonth(today), -1)}-01`;
  // Un jour de semaine passé de ce mois pour l'absence maladie d'exemple
  let sick = addDays(today, -1);
  while (weekday(sick) > 3 && sick.slice(0, 7) === today.slice(0, 7)) sick = addDays(sick, -1);
  const entries: DayEntry[] = [];
  const wd = weekday(today);
  if (wd <= 3 && now >= 7 * 60 + 52) entries.push({ contractId: 'c1', date: today, arrival: 7 * 60 + 52 });
  if (wd <= 4 && now >= 8 * 60 + 30) entries.push({ contractId: 'c2', date: today, arrival: 8 * 60 + 30 });
  if (wd >= 1 && wd <= 4) entries.push({ contractId: 'c4', date: today, absence: 'enfant_malade' });
  if (sick.slice(0, 7) === today.slice(0, 7) && sick !== today) entries.push({ contractId: 'c1', date: sick, absence: 'enfant_malade', certificate: true });
  return {
    ...emptyState(),
    profile: { firstName: 'Sandrine', hasProfessionalTitle: false, childrenBirthDates: [], atLeast21: true },
    families: [
      { id: 'f1', name: 'Moreau', parentNames: 'Julie et Marc' },
      { id: 'f2', name: 'Bernard', parentNames: '' },
      { id: 'f3', name: 'Petit', parentNames: '' },
      { id: 'f4', name: 'Roux', parentNames: '' },
    ],
    children: [
      { id: 'k1', familyId: 'f1', firstName: 'Lina', color: 'kid-1' },
      { id: 'k2', familyId: 'f2', firstName: 'Maël', color: 'kid-2' },
      { id: 'k3', familyId: 'f3', firstName: 'Noé', color: 'kid-3' },
      { id: 'k4', familyId: 'f4', firstName: 'Inès', color: 'kid-4' },
    ],
    contracts: [
      contract('c1', 'k1', 'f1', start, [0, 1, 2, 3], 450, 1050, 3800, { mealCents: 400 }),
      contract('c2', 'k2', 'f2', start, [0, 1, 2, 3, 4], 510, 1050, 4000),
      contract('c3', 'k3', 'f3', start, [0, 1, 2, 3, 4], 540, 1065, 3900),
      contract('c4', 'k4', 'f4', start, [1, 2, 3, 4], 480, 1080, 4100),
    ],
    entries,
    notes: wd <= 3 && now >= 500 ? [{ id: 'n1', childId: 'k1', date: today, time: 500, kind: 'humeur', text: 'Un peu fatiguée, a pleuré au départ de maman puis a joué' }] : [],
    settings: { lastBackupAt: new Date().toISOString() },
  };
}
