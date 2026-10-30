// Enfants fictifs pour découvrir l'app (démonstration) (base séparée « pam-demo »).
import * as db from './db';
import { addDays, addMonths, firstDay, monthOf, today, weekday } from './engine/dates';
import type { AmLeave, Contract, DayRec, Journal, Planning } from './engine/model';

function week(days: number[], plages: { start: string; end: string }[]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = plages.map((x) => ({ ...x }));
  return p;
}

/** Jour ouvré le plus proche avant (ou égal à) d */
function workday(d: string): string {
  let x = d;
  while (weekday(x) > 5) x = addDays(x, -1);
  return x;
}

export async function seedDemo() {
  const t = today();
  const cur = monthOf(t);
  const leo: Contract = {
    id: 'demo-leo', child: 'Léo', family: 'Martin', color: 0, start: firstDay(addMonths(cur, -14)), yearType: 'complete', weeks: 52, weeksOff: [],
    planning: week([1, 2, 3, 4, 5], [{ start: '08:00', end: '17:30' }]), rateNet: 360, majoration: 10, entretienJour: 400, repasPrix: 300,
    repasParJour: 1, repasParents: false, kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: firstDay(addMonths(cur, -3)),
    balances: { cpRestants: 18, cpEnCours: 7.5, maladieDeduits: 1 }, history: [], createdAt: 1,
  };
  // Historique : bulletins des mois passés (un mois laissé manquant pour montrer l'alerte)
  for (let i = 14; i >= 4; i--) {
    const m = addMonths(cur, -i);
    if (i === 9) continue;
    leo.history.push({ month: m, net: 74100, brut: 94878, heures: 195, jours: 22, entretien: 8800, source: i % 2 ? 'pdf' : 'manuel' });
  }
  const ines: Contract = {
    id: 'demo-ines', child: 'Inès', family: 'Diallo', color: 1, start: firstDay(addMonths(cur, -7)), yearType: 'incomplete', weeks: 36, weeksOff: [],
    planning: week([1, 2, 4, 5], [{ start: '07:30', end: '08:30' }, { start: '16:30', end: '18:30' }]), rateNet: 380, majoration: 10,
    entretienJour: 0, repasPrix: 0, repasParJour: 0, repasParents: true, kmTaux: 41, cpMode: 'juin', majoreFiscal: false, trackedFrom: firstDay(addMonths(cur, -7)),
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 2,
  };
  const malo: Contract = {
    id: 'demo-malo', child: 'Malo', family: 'Bernard', color: 2, start: firstDay(addMonths(cur, -1)), yearType: 'complete', weeks: 52, weeksOff: [],
    planning: week([1, 2, 3, 4], [{ start: '08:30', end: '17:00' }]), rateNet: 340, majoration: 15, entretienJour: 0, repasPrix: 250, repasParJour: 1, repasParents: false,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: firstDay(addMonths(cur, -1)),
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 3,
  };

  const days: DayRec[] = [];
  const rec = (c: Contract, date: string, r: Partial<DayRec>) => days.push({ key: `${c.id}|${date}`, cid: c.id, date, ...r });
  const y1 = workday(addDays(t, -1));
  const y2 = workday(addDays(y1, -1));
  const y3 = workday(addDays(y2, -1));
  const y6 = workday(addDays(t, -8));
  rec(leo, y1, { pres: [{ a: '08:05', d: '18:10' }] });
  rec(leo, y3, { abs: 'malade_certif' });
  rec(leo, y6, { abs: 'parents' });
  rec(malo, y2, { pres: [{ a: '08:30' }] }); // départ oublié
  rec(ines, y1, { pres: [{ a: '07:30', d: '08:30' }, { a: '16:30', d: '19:00' }], km: 6 });
  if (weekday(t) <= 5) rec(leo, t, { pres: [{ a: '07:58' }] });

  const leaves: AmLeave[] = [
    { id: 'demo-cp1', type: 'cp', from: addDays(firstDay(addMonths(cur, -2)), 9), to: addDays(firstDay(addMonths(cur, -2)), 14) },
    { id: 'demo-ev', type: 'evenement', from: addDays(t, 16), to: addDays(t, 16) },
  ];
  const journal: Journal[] = weekday(t) <= 5 ? [
    { id: 'demo-j1', cid: leo.id, date: t, time: '09:30', kind: 'humeur', detail: 'De bonne humeur' },
    { id: 'demo-j2', cid: leo.id, date: t, time: '11:45', kind: 'repas', detail: 'A bien mangé' },
    { id: 'demo-j3', cid: leo.id, date: t, time: '12:40', kind: 'sieste', detail: 'Endormissement' },
  ] : [];
  await db.replaceAll({
    kv: [{ k: 'settings', v: { amName: 'Sonia', enfantsACharge: 1, onboarded: true, lastBackup: Date.now() - 9 * 86400000 } }],
    contracts: [leo, ines, malo], days, leaves, bulletins: [], journal, feedback: [], usage: [],
  });
}
