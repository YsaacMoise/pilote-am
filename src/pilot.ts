import type { AppState } from './state';

/**
 * Export mensuel du pilote : usage du site, sans aucun prénom ni donnée d'enfant.
 * Les enfants deviennent A, B, C ; les notes du carnet ne sont jamais exportées.
 */
export function pilotExport(state: AppState, month: string): string {
  const letters = new Map<string, string>();
  state.children.forEach((c, i) => letters.set(c.id, String.fromCharCode(65 + (i % 26))));
  const contractLetter = (id: string) => {
    const c = state.contracts.find((x) => x.id === id);
    return c ? letters.get(c.childId) ?? '?' : '?';
  };

  const inMonth = (iso: string) => iso.startsWith(month);
  const journal = state.journal.filter((e) => inMonth(e.at));
  const reports = state.reports.filter((r) => inMonth(r.at)).map((r) => ({ at: r.at, screen: r.screen, note: r.note }));
  const entries = state.entries.filter((e) => inMonth(e.date));

  const byScreen: Record<string, number> = {};
  for (const e of journal) byScreen[e.screen] = (byScreen[e.screen] ?? 0) + 1;
  const activeDays = new Set(journal.map((e) => e.at.slice(0, 10))).size;

  const controls = state.controls
    .filter((c) => c.month === month)
    .map((c) => ({ enfant: contractLetter(c.contractId), saisi: true }));

  const data = {
    mois: month,
    genereLe: new Date().toISOString(),
    joursOuverture: activeDays,
    actionsParEcran: byScreen,
    saisiesDeJournees: entries.length,
    saisiesParEnfant: Object.fromEntries(
      [...new Set(entries.map((e) => contractLetter(e.contractId)))].map((l) => [l, entries.filter((e) => contractLetter(e.contractId) === l).length]),
    ),
    notesCarnet: state.notes.filter((n) => inMonth(n.date)).length,
    recapitulatifsEnvoyes: state.sent.filter((s) => s.month === month).length,
    bulletinsControles: controls,
    signalements: reports,
    journal: journal.map((e) => ({ at: e.at, ecran: e.screen, action: e.action })),
  };
  return JSON.stringify(data, null, 2);
}
