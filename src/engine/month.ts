// Récapitulatif mensuel par enfant, dans l'ordre de la déclaration Pajemploi.
import { lastDay, monthLabel, type Month } from './dates';
import { cpForMonth } from './conges';
import { brutConnu, brutDuNetMois, monthBase, termsAt, type Ctx, type MonthBase } from './payroll';
import { REDUCTION_HS } from './rates';
import { regionDe } from './regions';

export const MESSAGE_REDUCTION_HS_MAYOTTE = 'Mayotte : l’app ne calcule pas la réduction de cotisations de tes heures complémentaires et majorées. Ses règles à Mayotte (ordonnance n° 96-1122 et ses textes) ne sont pas encore lues dans l’app. Pajemploi la calcule : regarde ton relevé.';
import { euros, hoursLabel } from './money';

export interface MonthResult extends MonthBase {
  cpJours: number;
  cpIndemnite: number;
  cpComplement: number;
  cpNote?: string;
  /** Salaire net à déclarer, congés compris */
  netTotal: number;
  /** Brut du mois : celui du bulletin, ou net × brut ÷ net du contrat (T-103, D1) ; estimation interne si `brutConnu` est faux */
  brutEstime: number;
  /** T-103 (D1) : le brut est exact (bulletin ou taux horaire brut du contrat) ; sinon l'écran le demande */
  brutConnu: boolean;
  /**
   * Heures complémentaires et majorées (CGI art. 81 quater, CSS art. L241-17 : pour une assistante maternelle, heures
   * au-delà du contrat jusqu'à 45 h et heures au-delà de 45 h, prévues au contrat ou en plus) : valeur nette déclarée.
   */
  hsNet: number;
  /** Brut estimé de ces heures */
  hsBrut: number;
  /**
   * Réduction de cotisations salariales de ces heures (CSS L241-17, I, 7° ; D241-21 : 11,31 % de leur brut). T-109 : elle
   * s'ajoute au net déclaré dans la somme versée à l'AM (totalAVerser, `reductionVersee`). Comptée dans le total seulement
   * sur le brut exact (`brutConnu`) ; sans le taux horaire brut du contrat, l'écran le demande (`reductionHSManquante`).
   */
  reductionHS: number;
  /** T-109 : heures complémentaires ou majorées ce mois, mais brut inconnu : la réduction attend le taux horaire brut */
  reductionHSManquante: boolean;
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
  // T-118 (D-24) : mois d'avenant, période par période (brutDuNetMois).
  const hsBrut = brutDuNetMois(ctx.c, b, hsNet, (x) => x.hsNet);
  const exact = !!b.brut || brutConnu(ctx.c, lastDay(m));
  return {
    ...b,
    alerts,
    nonGere,
    cpJours: cp.jours,
    cpIndemnite: cp.indemnite,
    cpComplement: cp.complement,
    cpNote: cp.note,
    netTotal,
    brutEstime: b.brut ?? brutDuNetMois(ctx.c, b, netTotal, (x) => x.net),
    brutConnu: !!b.brut || brutConnu(ctx.c, lastDay(m)),
    hsNet,
    hsBrut,
    reductionHS: mayotte ? 0 : Math.round(hsBrut * REDUCTION_HS),
    reductionHSManquante: !mayotte && !exact && hsNet > 0,
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

/**
 * T-109 (comparateur, correction 1) : la réduction de cotisations des heures complémentaires et majorées (CSS L241-17, I, 7° ;
 * D241-21) est versée à l'AM en plus du net déclaré : elle entre dans le total.
 */
export function totalAVerser(r: MonthResult): number {
  return r.netTotal + reductionVersee(r) + r.entretien + r.repas + r.km;
}

/** T-109 : réduction comptée dans le total (brut exact seulement : jamais un montant estimé) */
export function reductionVersee(r: MonthResult): number {
  return r.brutConnu ? (r.reductionHS ?? 0) : 0;
}

export const MESSAGE_REDUCTION_HS_BRUT = 'Heures complémentaires ou majorées ce mois : leur réduction de cotisations (11,31 % de leur brut) s’ajoute à la somme à verser. Indique ton taux horaire brut dans le contrat pour qu’elle soit comptée dans le total.';

export interface DeclLine { label: string; value: string; hint?: string }

/**
 * Les cases de la déclaration Pajemploi, dans l'ordre. `pourParents` (lien des parents) : le salaire à confirmer ne nomme
 * pas sa raison (décision du DG du 21/11/2026 : aucun motif d'absence de l'AM sur le lien des parents).
 */
export function declarationLines(ctx: Ctx, r: MonthResult, pourParents = false): DeclLine[] {
  // T-031 : mois refusé (cas non géré) : aucune case à déclarer n'est proposée.
  if (r.nonGere.length) return [];
  const t = termsAt(ctx.c, `${r.month}-01`);
  // T-104 (cas 2) : accueil occasionnel, jours de congés déclarés le mois où ils sont versés (Urssaf : « cette case concerne
  // uniquement les gardes de 46 semaines ou moins, ou les gardes occasionnelles »).
  const complete = t.yearType === 'complete' && !t.accueilOccasionnel;
  const majCompl = t.majorationCompl ?? 0;
  return [
    { label: 'Heures normales', value: `${r.heuresNormales} h`, hint: t.accueilOccasionnel ? 'Les heures d’accueil payées ce mois, jusqu’à 45 h par semaine, arrondies à l’heure' : 'Les heures payées chaque mois, jusqu’à 45 h par semaine, arrondies à l’heure' },
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
  if (c.accueilOccasionnel) out.push(`• Salaire des heures d’accueil du mois : ${euros(r.base)}`);
  else out.push(`• Salaire mensualisé : ${euros(r.salaireMens)}`);
  if (r.retenue) out.push(`• Retenue pour absence : −${euros(r.retenue)}`);
  if (r.normalesPlusAmount) out.push(`• Heures faites en plus la semaine d’une absence, au taux du contrat : ${euros(r.normalesPlusAmount)}`);
  if (r.complAmount) out.push(`• Heures complémentaires : ${euros(r.complAmount)}`);
  if (r.majAmount) out.push(`• Heures majorées en plus du contrat : ${euros(r.majAmount)}`);
  if (r.regulAvenant) out.push(`• Régularisation à l’avenant : ${euros(r.regulAvenant)}`);
  if (r.ferieAmount) out.push(`• Majoration jours fériés travaillés : ${euros(r.ferieAmount)}`);
  if (r.cpIndemnite) out.push(`• Indemnité de congés payés : ${euros(r.cpIndemnite)}`);
  if (r.cpComplement) out.push(`• Complément de congés payés : ${euros(r.cpComplement)}`);
  if (reductionVersee(r)) out.push(`• Réduction de cotisations des heures complémentaires et majorées, versée en plus du salaire net : ${euros(reductionVersee(r))}`);
  out.push('');
  out.push(`Total à me verser : ${euros(totalAVerser(r))}`);
  out.push('');
  out.push('Calcul fait avec l’application Arvela, outil d’aide indépendant de l’Urssaf : la déclaration Pajemploi fait foi.');
  out.push('');
  out.push(`Merci ! ${amName}`.trim());
  return out.join('\n');
}

