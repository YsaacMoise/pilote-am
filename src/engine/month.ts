// Récapitulatif mensuel par enfant, dans l'ordre de la déclaration Pajemploi.
import { lastDay, monthLabel, type Month } from './dates';
import { cpForMonth } from './conges';
import { monthBase, termsAt, type Ctx, type MonthBase } from './payroll';
import { netToBrut } from './rates';
import { euros, hoursLabel } from './money';

export interface MonthResult extends MonthBase {
  cpJours: number;
  cpIndemnite: number;
  cpComplement: number;
  cpNote?: string;
  /** Salaire net à déclarer, congés compris */
  netTotal: number;
  brutEstime: number;
}

export function computeMonth(ctx: Ctx, m: Month, enfants = 0): MonthResult {
  const b = monthBase(ctx, m);
  const cp = cpForMonth(ctx, m, enfants);
  const netTotal = b.net + cp.indemnite + cp.complement;
  return {
    ...b,
    cpJours: cp.jours,
    cpIndemnite: cp.indemnite,
    cpComplement: cp.complement,
    cpNote: cp.note,
    netTotal,
    brutEstime: b.brut ?? netToBrut(netTotal, lastDay(m)),
  };
}

export interface DeclLine { label: string; value: string; hint?: string }

/** Les cases de la déclaration Pajemploi, dans l'ordre */
export function declarationLines(ctx: Ctx, r: MonthResult): DeclLine[] {
  const complete = termsAt(ctx.c, `${r.month}-01`).yearType === 'complete';
  return [
    { label: 'Heures normales', value: `${r.heuresNormales} h`, hint: 'Les heures payées chaque mois, jusqu’à 45 h par semaine, arrondies à l’heure' },
    { label: 'Jours d’activité', value: `${r.joursActivite}` },
    {
      label: 'Jours de congés payés',
      value: complete ? '0' : `${r.cpJours}`,
      hint: complete ? 'Année complète : les congés sont compris dans le salaire' : undefined,
    },
    {
      label: 'Heures complémentaires',
      value: hoursLabel(r.complMin),
      hint: 'Jusqu’à 45 h dans la semaine, au taux du contrat',
    },
    {
      label: 'Heures majorées',
      value: hoursLabel(r.majContratMin + r.majMin),
      hint: `Au-delà de 45 h dans la semaine, prévues au contrat ou en plus, +${termsAt(ctx.c, `${r.month}-01`).majoration}\u00a0%`,
    },
    { label: 'Salaire net', value: euros(r.netTotal) },
    { label: 'Indemnités d’entretien', value: euros(r.entretien), hint: `${r.presenceDays} jour${r.presenceDays > 1 ? 's' : ''} d’accueil` },
    { label: 'Frais de repas', value: euros(r.repas) },
    { label: 'Frais kilométriques', value: euros(r.km) },
  ];
}

/** Texte envoyé au parent : clair, sans jargon, avec le détail du salaire */
export function declarationText(ctx: Ctx, r: MonthResult, amName: string): string {
  const c = ctx.c;
  const lines = declarationLines(ctx, r);
  const out: string[] = [];
  out.push(`Bonjour, voici les éléments à déclarer sur Pajemploi pour ${c.child}, ${monthLabel(r.month)} :`);
  out.push('');
  for (const l of lines) out.push(`• ${l.label} : ${l.value}`);
  out.push('');
  out.push('Détail du salaire net :');
  out.push(`• Salaire mensualisé : ${euros(r.salaireMens)}`);
  if (r.retenue) out.push(`• Retenue pour absence : −${euros(r.retenue)}`);
  if (r.complAmount) out.push(`• Heures complémentaires : ${euros(r.complAmount)}`);
  if (r.majAmount) out.push(`• Heures majorées en plus du contrat : ${euros(r.majAmount)}`);
  if (r.regulAvenant) out.push(`• Régularisation à l’avenant : ${euros(r.regulAvenant)}`);
  if (r.ferieAmount) out.push(`• Majoration jours fériés travaillés : ${euros(r.ferieAmount)}`);
  if (r.cpIndemnite) out.push(`• Indemnité de congés payés : ${euros(r.cpIndemnite)}`);
  if (r.cpComplement) out.push(`• Complément de congés payés : ${euros(r.cpComplement)}`);
  out.push('');
  out.push(`Total à me verser : ${euros(r.netTotal + r.entretien + r.repas + r.km)}`);
  out.push('');
  out.push(`Merci ! ${amName}`.trim());
  return out.join('\n');
}
