// Récapitulatif mensuel par enfant, dans l'ordre de la déclaration Pajemploi.
import { lastDay, monthLabel, type Month } from './dates';
import { cpForMonth } from './conges';
import { monthBase, termsAt, type Ctx, type MonthBase } from './payroll';
import { netToBrut, REDUCTION_HS } from './rates';
import { regionDe } from './regions';

export const MESSAGE_REDUCTION_HS_MAYOTTE = 'Mayotte : la réduction de cotisations de tes heures complémentaires et majorées n’est pas estimée par l’app (les cotisations y sont différentes). Pajemploi la calcule : regarde ton relevé.';
import { euros, hoursLabel } from './money';

export interface MonthResult extends MonthBase {
  cpJours: number;
  cpIndemnite: number;
  cpComplement: number;
  cpNote?: string;
  /** Salaire net à déclarer, congés compris */
  netTotal: number;
  brutEstime: number;
  /**
   * Heures complémentaires et majorées (CGI art. 81 quater, CSS art. L241-17 : pour une assistante maternelle, heures
   * au-delà du contrat jusqu'à 45 h et heures au-delà de 45 h, prévues au contrat ou en plus) : valeur nette déclarée.
   */
  hsNet: number;
  /** Brut estimé de ces heures */
  hsBrut: number;
  /** Réduction de cotisations salariales de ces heures, versée en plus du net déclaré (estimation) */
  reductionHS: number;
}

/** Mois calculé (T-103 : une seule lecture, aussi pour un CDD : F11, F12) */
export function computeMonth(ctx: Ctx, m: Month, enfants = 0): MonthResult {
  return computeMonthLecture(ctx, m, enfants);
}

function computeMonthLecture(ctx: Ctx, m: Month, enfants = 0): MonthResult {
  const b = monthBase(ctx, m);
  const cp = cpForMonth(ctx, m, enfants);
  const netTotal = b.net + cp.indemnite + cp.complement;
  const alerts = [...b.alerts];
  // T-103 : indemnité de congés non calculée (donnée à saisir) : le mois attend la donnée, comme un cas non géré.
  const nonGere = cp.aConfirmer && !b.nonGere.includes(cp.aConfirmer) ? [...b.nonGere, cp.aConfirmer] : b.nonGere;
  // T-077 : à Mayotte, la réduction de cotisations des heures complémentaires et majorées (CSS L241-17) n'est pas estimée :
  // en métropole, ses 11,31 % sont les cotisations vieillesse de l'AM, qui sont différentes à Mayotte (Urssaf : 5,54 %).
  const mayotte = regionDe(ctx.c) === 'mayotte';
  if (mayotte && b.complAmount + b.majAmount + b.majContratAmount > 0) alerts.push(MESSAGE_REDUCTION_HS_MAYOTTE);
  const hsNet = b.complAmount + b.majAmount + b.majContratAmount;
  const hsBrut = netToBrut(hsNet, lastDay(m), regionDe(ctx.c));
  return {
    ...b,
    alerts,
    nonGere,
    cpJours: cp.jours,
    cpIndemnite: cp.indemnite,
    cpComplement: cp.complement,
    cpNote: cp.note,
    netTotal,
    brutEstime: b.brut ?? netToBrut(netTotal, lastDay(m), regionDe(ctx.c)),
    hsNet,
    hsBrut,
    reductionHS: mayotte ? 0 : Math.round(hsBrut * REDUCTION_HS),
  };
}

/** Total à verser par la famille : salaire net, entretien, repas et kilomètres (écran Mois, message au parent, relevé) */
/**
 * T-103 (M7) : mois en cours. Le salaire mensualisé couvre tout le mois (CCN 109) ; l'entretien et les repas suivent les
 * jours de travail effectif (114.1, 114.2) et ne sont connus que jusqu'à aujourd'hui. Renvoie « JJ/MM » (aujourd'hui) pour
 * un mois en cours, sinon undefined. Remplace « Provisoire jusqu'à la fin du mois ».
 */
export function moisEnCoursAu(today: string, m: Month): string | undefined {
  return today.slice(0, 7) === m && today < lastDay(m) ? `${today.slice(8, 10)}/${today.slice(5, 7)}` : undefined;
}

export function totalAVerser(r: MonthResult): number {
  return r.netTotal + r.entretien + r.repas + r.km;
}

export interface DeclLine { label: string; value: string; hint?: string }

/**
 * Les cases de la déclaration Pajemploi, dans l'ordre. `pourParents` (lien des parents) : le salaire à confirmer ne nomme
 * pas sa raison (décision du DG du 21/11/2026 : aucun motif d'absence de l'AM sur le lien des parents).
 */
export function declarationLines(ctx: Ctx, r: MonthResult, pourParents = false): DeclLine[] {
  // T-031 : mois refusé (cas non géré) : aucune case à déclarer n'est proposée.
  if (r.nonGere.length) return [];
  const t = termsAt(ctx.c, `${r.month}-01`);
  const complete = t.yearType === 'complete';
  const majCompl = t.majorationCompl ?? 0;
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
      hint: majCompl ? `Jusqu’à 45 h dans la semaine, au taux du contrat majoré de ${majCompl}\u00a0%` : 'Jusqu’à 45 h dans la semaine, au taux du contrat',
    },
    {
      label: 'Heures majorées',
      value: hoursLabel(r.majContratMin + r.majMin),
      hint: `Au-delà de 45 h dans la semaine, prévues au contrat ou en plus, +${termsAt(ctx.c, `${r.month}-01`).majoration}\u00a0%`,
    },
    { label: 'Salaire net', value: euros(r.netTotal) },
    { label: 'Indemnités d’entretien', value: euros(r.entretien), hint: `${r.presenceDays} jour${r.presenceDays > 1 ? 's' : ''} d’accueil${moisEnCoursAu(ctx.today, r.month) ? ` au ${moisEnCoursAu(ctx.today, r.month)}` : ''}` },
    { label: 'Frais de repas', value: euros(r.repas) },
    { label: 'Frais kilométriques', value: euros(r.km) },
  ];
}

/** Texte envoyé au parent : clair, sans jargon, avec le détail du salaire */
export function declarationText(ctx: Ctx, r: MonthResult, amName: string): string {
  const c = ctx.c;
  if (r.nonGere.length) {
    return [
      `Bonjour, l’application Arvela ne calcule pas ${monthLabel(r.month)} pour ${c.child} : c’est un cas qu’elle ne gère pas.`,
      '',
      'Faisons ensemble la déclaration Pajemploi de ce mois, sans l’application.',
      '',
      `Merci ! ${amName}`.trim(),
    ].join('\n');
  }
  const lines = declarationLines(ctx, r, true);
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
  out.push(`Total à me verser : ${euros(totalAVerser(r))}`);
  out.push('');
  out.push('Calcul fait avec l’application Arvela, outil d’aide indépendant de l’Urssaf : la déclaration Pajemploi fait foi.');
  out.push('');
  out.push(`Merci ! ${amName}`.trim());
  return out.join('\n');
}

