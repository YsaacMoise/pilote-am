import { formatYearMonth } from './engine/dates';
import type { MonthResult } from './engine/month';
import { formatEuros } from './engine/money';
import type { AppState } from './state';

/** Nombre d'heures au format français, 2 décimales au plus : 173,33 */
export function formatHoursNumber(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  return rounded.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

export interface RecapRow {
  label: string;
  value: string;
}

/** Les montants à recopier, dans l'ordre de la déclaration Pajemploi. */
export function recapRows(m: MonthResult): RecapRow[] {
  const r = m.recap;
  const rows: RecapRow[] = [
    { label: 'Heures normales', value: formatHoursNumber(r.normalHours) },
    { label: 'Jours d’activité', value: String(r.activityDays) },
  ];
  if (r.paidLeaveDays > 0) rows.push({ label: 'Jours de congés payés', value: String(r.paidLeaveDays) });
  if (r.complementaryHours > 0) rows.push({ label: 'Heures complémentaires', value: formatHoursNumber(r.complementaryHours) });
  if (r.majoredHours > 0) rows.push({ label: 'Heures majorées', value: formatHoursNumber(r.majoredHours) });
  rows.push({ label: 'Salaire net', value: formatEuros(r.netSalaryCents) });
  rows.push({ label: 'Indemnités d’entretien', value: formatEuros(r.entretienCents) });
  if (r.mealsCents > 0) rows.push({ label: 'Indemnités de repas', value: formatEuros(r.mealsCents) });
  if (r.kmCents > 0) rows.push({ label: 'Indemnités kilométriques', value: formatEuros(r.kmCents) });
  if (r.days24h > 0) rows.push({ label: 'Jours d’accueil de 24 h', value: String(r.days24h) });
  if (r.childMajoration) rows.push({ label: 'Enfant en situation de handicap ou longue maladie', value: 'Oui' });
  return rows;
}

/** Texte envoyé au parent par SMS, WhatsApp ou courriel. */
export function recapText(state: AppState, m: MonthResult): string {
  const contract = state.contracts.find((c) => c.id === m.contractId);
  const child = state.children.find((c) => c.id === contract?.childId);
  const am = state.profile?.firstName ?? '';
  const lines = [
    `Pajemploi de ${child?.firstName ?? 'votre enfant'}, ${formatYearMonth(m.month)}`,
    ...(m.provisional ? ['Estimation : le mois n’est pas terminé, le montant final suivra.'] : []),
    '',
    'À recopier dans la déclaration, case par case :',
    ...recapRows(m).map((row) => `${row.label} : ${row.value}`),
    '',
    `Total versé : ${formatEuros(m.totalCents)}`,
  ];
  if (am) lines.push('', am);
  return lines.join('\n');
}

/** Un seul message pour une famille, avec un bloc par enfant (une déclaration par enfant). */
export function familyRecapText(state: AppState, results: readonly MonthResult[]): string {
  if (results.length === 1 && results[0]) return recapText(state, results[0]);
  const am = state.profile?.firstName ?? '';
  const blocks = results.map((m) => {
    const contract = state.contracts.find((c) => c.id === m.contractId);
    const child = state.children.find((c) => c.id === contract?.childId);
    return [
      `Pajemploi de ${child?.firstName ?? 'votre enfant'}, ${formatYearMonth(m.month)}${m.provisional ? ' (estimation, mois en cours)' : ''}`,
      ...recapRows(m).map((row) => `${row.label} : ${row.value}`),
      `Total versé : ${formatEuros(m.totalCents)}`,
    ].join('\n');
  });
  const lines = ['Une déclaration par enfant, à recopier case par case :', '', blocks.join('\n\n')];
  if (am) lines.push('', am);
  return lines.join('\n');
}
