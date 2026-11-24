// Récapitulatif mensuel par enfant, dans l'ordre de la déclaration Pajemploi.
import { lastDay, monthLabel, type Month } from './dates';
import { cpForMonth } from './conges';
import { MESSAGE_MOIS_DEJA_DECLARE, ctxLectureCdd2, libelleSalaireAConfirmer, monthBase, naturesAConfirmer, termsAt, type Ctx, type MonthBase } from './payroll';
import { libelleLecturesCdd } from './cdd';
import { netToBrut, REDUCTION_HS } from './rates';
import { regionDe } from './regions';

export const MESSAGE_REDUCTION_HS_MAYOTTE = 'Mayotte : la réduction de cotisations de tes heures complémentaires et majorées n’est pas estimée par l’app (les cotisations y sont différentes). Pajemploi la calcule : regarde ton relevé.';
import { euros, hoursLabel } from './money';

export interface MonthResult extends MonthBase {
  cpJours: number;
  cpIndemnite: number;
  cpComplement: number;
  cpNote?: string;
  /** Congés payés dus ce mois mais à confirmer : non comptés dans le total (T-019) */
  cpAConfirmer?: string;
  /** T-076 (P-PV-5) : part des congés payés à confirmer (méthode du maintien, horaires variables), hors du total */
  cpMaintienAConfirmer?: number;
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
  /**
   * T-076 (P1, P2) : CDD dont le salaire a deux lectures. Le mois affiché est la lecture la plus basse (part sûre, dans
   * `netTotal`) ; `cddAConfirmer` est l'écart, hors du total. `cddLectures` : salaire net du mois, congés compris, lecture 1
   * puis lecture 2. Absent : une seule lecture, ou les deux donnent le même montant.
   */
  cddAConfirmer?: number;
  cddLectures?: [number, number];
}

/** T-076 : mois d'un CDD à deux lectures (P1, P2) : part sûre = la plus basse, écart à confirmer (decisions-direction, section 2) */
export function computeMonth(ctx: Ctx, m: Month, enfants = 0): MonthResult {
  const r1 = computeMonthLecture(ctx, m, enfants);
  const ctx2 = ctxLectureCdd2(ctx);
  if (!ctx2 || r1.nonGere.length || !r1.active || r1.fromHistory) return r1;
  const r2 = computeMonthLecture(ctx2, m, enfants);
  if (r2.nonGere.length || r2.netTotal === r1.netTotal) return r1;
  const bas = r2.netTotal < r1.netTotal ? r2 : r1;
  const ecart = Math.abs(r1.netTotal - r2.netTotal);
  const l = libelleLecturesCdd(ctx.c);
  const message = `Salaire du CDD : ${euros(ecart)} à confirmer, non compris dans le total. ${l.pourquoi} Lecture 1 (${l.l1}) : ${euros(r1.netTotal)} ; lecture 2 (${l.l2}) : ${euros(r2.netTotal)}. L’app verse le plus bas. Mets-toi d’accord avec les parents, par écrit.`;
  return { ...bas, alerts: [...bas.alerts, message], cddAConfirmer: ecart, cddLectures: [r1.netTotal, r2.netTotal] };
}

function computeMonthLecture(ctx: Ctx, m: Month, enfants = 0): MonthResult {
  const b = monthBase(ctx, m);
  const cp = cpForMonth(ctx, m, enfants);
  const netTotal = b.net + cp.indemnite + cp.complement;
  const alerts = cp.aConfirmer ? [...b.alerts, cp.aConfirmer] : [...b.alerts];
  // T-077 : à Mayotte, la réduction de cotisations des heures complémentaires et majorées (CSS L241-17) n'est pas estimée :
  // en métropole, ses 11,31 % sont les cotisations vieillesse de l'AM, qui sont différentes à Mayotte (Urssaf : 5,54 %).
  const mayotte = regionDe(ctx.c) === 'mayotte';
  if (mayotte && b.complAmount + b.majAmount + b.majContratAmount > 0) alerts.push(MESSAGE_REDUCTION_HS_MAYOTTE);
  if (cp.maintienAConfirmer && cp.maintienMessage) {
    alerts.push(cp.maintienMessage);
    // T-076, D5 : un mois déclaré ne change pas après coup ; une saisie tardive suit le mécanisme existant des mois déclarés.
    if (lastDay(m) < ctx.today && !alerts.includes(MESSAGE_MOIS_DEJA_DECLARE)) alerts.push(MESSAGE_MOIS_DEJA_DECLARE);
  }
  const hsNet = b.complAmount + b.majAmount + b.majContratAmount;
  const hsBrut = netToBrut(hsNet, lastDay(m), regionDe(ctx.c));
  return {
    ...b,
    alerts,
    cpAConfirmer: cp.aConfirmer,
    ...(cp.maintienAConfirmer ? { cpMaintienAConfirmer: cp.maintienAConfirmer } : {}),
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
      value: complete ? '0' : r.cpAConfirmer ? 'à confirmer' : `${r.cpJours}`,
      hint: complete ? 'Année complète : les congés sont compris dans le salaire' : r.cpAConfirmer ? 'Le nombre de jours acquis n’est pas encore tranché' : undefined,
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
    { label: 'Salaire net', value: `${euros(r.netTotal)}${r.cpAConfirmer ? ' + congés à confirmer' : ''}${r.cpMaintienAConfirmer ? ` + ${euros(r.cpMaintienAConfirmer)} de congés à confirmer` : ''}${r.complAConfirmerAmount ? ` + ${euros(r.complAConfirmerAmount)} d’heures complémentaires à confirmer` : ''}${r.evenementAConfirmer ? ` + ${euros(r.evenementAConfirmer)} ${pourParents ? 'de salaire' : libelleSalaireAConfirmer(r)} à confirmer` : ''}${r.cddAConfirmer ? ` + ${euros(r.cddAConfirmer)} de salaire du CDD à confirmer` : ''}` },
    { label: 'Indemnités d’entretien', value: euros(r.entretien), hint: `${r.presenceDays} jour${r.presenceDays > 1 ? 's' : ''} d’accueil${moisEnCoursAu(ctx.today, r.month) ? ` au ${moisEnCoursAu(ctx.today, r.month)}` : ''}` },
    { label: 'Frais de repas', value: euros(r.repas) },
    { label: 'Frais kilométriques', value: r.kmAConfirmer ? `${euros(r.km)} + ${r.kmAConfirmer} km à confirmer` : euros(r.km) },
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
  if (r.cpAConfirmer) out.push('• Indemnité de congés payés : à confirmer ensemble');
  if (r.cpMaintienAConfirmer) out.push(`• Congés payés : + ${euros(r.cpMaintienAConfirmer)} à confirmer ensemble`);
  if (r.complAConfirmerAmount) out.push(`• Heures complémentaires : + ${euros(r.complAConfirmerAmount)} à confirmer ensemble`);
  // Décision du DG du 21/11/2026 : comme le lien des parents, le texte envoyé aux parents ne nomme pas la raison.
  if (r.evenementAConfirmer) out.push(`• Salaire : + ${euros(r.evenementAConfirmer)} de salaire à confirmer ensemble`);
  // T-076 (P1, P2) : salaire d'un CDD qui dépend de la façon de le calculer.
  if (r.cddAConfirmer) out.push(`• Salaire du CDD : + ${euros(r.cddAConfirmer)} à confirmer ensemble (deux façons de calculer, question posée à la DDETS)`);
  out.push('');
  if (r.kmAConfirmer) out.push(`• Frais kilométriques : ${r.kmAConfirmer} km à confirmer ensemble (familles qui ont demandé le trajet, enfants dans la voiture)`);
  const aConfirmer = partsAConfirmer(r, true);
  out.push(`Total à me verser : ${euros(totalAVerser(r))}${aConfirmer.length ? `, sans ${aConfirmer.join(' ni ')} à confirmer` : ''}`);
  out.push('');
  out.push('Calcul fait avec l’application Arvela, outil d’aide indépendant de l’Urssaf : la déclaration Pajemploi fait foi.');
  out.push('');
  out.push(`Merci ! ${amName}`.trim());
  return out.join('\n');
}

/**
 * Parts du mois sorties du total parce qu'elles sont à confirmer (T-025 C-5 : à dire partout où le total s'affiche).
 * `pourParents` : l'événement familial devient « une part du salaire » (DG, 21/11/2026 : aucun motif d'absence de l'AM
 * sur le lien des parents).
 */
export function partsAConfirmer(r: Pick<MonthResult, 'cpAConfirmer' | 'evenementAConfirmer' | 'kmAConfirmer'> & Partial<Pick<MonthResult, 'joursCpAConfirmer' | 'joursEvenementAConfirmer' | 'joursMaladieAConfirmer' | 'joursFerieLocalAConfirmer' | 'joursMaintienAConfirmer' | 'ferieLocalAConfirmer' | 'cpMaintienAConfirmer' | 'complAConfirmerAmount' | 'cddAConfirmer'>>, pourParents = false): string[] {
  // T-030 : un salaire à confirmer peut venir de congés pris peut-être au-delà des droits (année complète, A-23).
  // T-033 : ou de jours d'enfant malade (art. 105, lectures divergentes).
  const salaire = !r.evenementAConfirmer ? [] : naturesAConfirmer(r).map((n) => ({
    evenement: pourParents ? 'une part du salaire' : 'l’événement familial', cp: 'les congés pris au-delà des droits', maladie: 'les jours d’enfant malade', ferieLocal: 'les jours fériés locaux',
    // Lien des parents (décision du DG du 21/11/2026) : aucun motif d'absence de l'AM, et pas de donnée de santé.
    maintien: pourParents ? 'une part du salaire' : 'les jours d’absence pour maladie' })[n]).filter((x, i, a) => a.indexOf(x) === i);
  return [r.cpAConfirmer || r.cpMaintienAConfirmer ? 'les congés payés' : '', r.complAConfirmerAmount ? 'une part des heures complémentaires' : '', ...salaire, r.cddAConfirmer ? 'une part du salaire du CDD' : '', r.ferieLocalAConfirmer ? 'la majoration d’un férié local' : '', r.kmAConfirmer ? 'les kilomètres' : ''].filter(Boolean);
}
