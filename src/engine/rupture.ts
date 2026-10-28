import { addDays, formatLongDate, fullMonthsBetween, parts, make, daysInMonth, type ISODate } from './dates';
import { cpIndemnity, weeklyNetCents, type ReferencePeriod } from './conges';
import { formatEuros, mulMulDiv, roundDiv, type Cents } from './money';
import type { Ledger } from './ledger';

/**
 * Fin de contrat (CCN art. 119 à 124, socle commun art. 63 à 67).
 *
 * Le site calcule les sommes ; il ne produit pas les documents officiels.
 */

export type EndKind =
  /** Retrait de l'enfant par le parent employeur */
  | 'retrait'
  /** Démission de l'assistante maternelle */
  | 'demission'
  /** Rupture pendant la période d'essai */
  | 'essai'
  /** Faute grave ou lourde */
  | 'faute_grave'
  /** Suspension, modification ou retrait d'agrément */
  | 'agrement'
  /** Décès de l'enfant */
  | 'deces_enfant'
  /** Inaptitude d'origine non professionnelle */
  | 'inaptitude'
  /** Inaptitude d'origine professionnelle */
  | 'inaptitude_pro';

export const END_KIND_LABELS: Record<EndKind, string> = {
  retrait: 'Retrait de l’enfant par la famille',
  demission: 'Démission',
  essai: 'Fin pendant la période d’essai',
  faute_grave: 'Faute grave ou lourde',
  agrement: 'Suspension ou retrait d’agrément',
  deces_enfant: 'Décès de l’enfant',
  inaptitude: 'Inaptitude (origine non professionnelle)',
  inaptitude_pro: 'Inaptitude (origine professionnelle)',
};

export interface NoticeResult {
  /** Ancienneté de l'accueil à la notification, en mois révolus */
  seniorityMonths: number;
  /** Durée du préavis en jours calendaires, ou en mois pour 1 mois */
  label: string;
  /** Dernier jour du préavis */
  endDate: ISODate | null;
  applies: boolean;
  note?: string;
}

/**
 * Préavis (art. 120) : 8 jours si l'enfant est accueilli depuis moins de 3 mois,
 * 15 jours de 3 mois à moins d'un an, 1 mois à partir d'un an. Aucun préavis
 * pendant l'essai, pour faute grave, retrait d'agrément ou inaptitude.
 */
export function notice(startDate: ISODate, notificationDate: ISODate, kind: EndKind): NoticeResult {
  const seniorityMonths = fullMonthsBetween(startDate, notificationDate);
  if (kind === 'essai' || kind === 'faute_grave' || kind === 'agrement' || kind === 'inaptitude' || kind === 'inaptitude_pro') {
    return { seniorityMonths, label: 'Aucun préavis', endDate: null, applies: false };
  }
  if (kind === 'deces_enfant') {
    return {
      seniorityMonths, label: 'Aucun préavis', endDate: null, applies: false,
      note: 'Le contrat est rompu de plein droit. Une somme égale à l’indemnité de préavis reste due.',
    };
  }
  let endDate: ISODate;
  let label: string;
  if (seniorityMonths < 3) {
    endDate = addDays(notificationDate, 7);
    label = '8 jours calendaires';
  } else if (seniorityMonths < 12) {
    endDate = addDays(notificationDate, 14);
    label = '15 jours calendaires';
  } else {
    const p = parts(notificationDate);
    const nm = p.m === 12 ? 1 : p.m + 1;
    const ny = p.m === 12 ? p.y + 1 : p.y;
    endDate = addDays(make(ny, nm, Math.min(p.d, daysInMonth(ny, nm))), -1);
    label = '1 mois';
  }
  const result: NoticeResult = { seniorityMonths, label, endDate, applies: true };
  if (kind === 'demission' && seniorityMonths < 3) {
    result.note = 'Les sources divergent : 8 jours selon les DREETS, aucun préavis selon d’autres lectures.';
  }
  return result;
}

export interface EndOfContract {
  kind: EndKind;
  notice: NoticeResult;
  /** Total des salaires bruts du contrat, base de l'indemnité de rupture */
  grossTotal: Cents;
  grossEstimated: boolean;
  ruptureIndemnity: Cents;
  ruptureRule: string;
  regularisation: Cents;
  regularisationPartial: boolean;
  paidLeaveIndemnity: Cents;
  paidLeaveDetail: string;
  total: Cents;
  warnings: string[];
}

/**
 * Sommes de fin de contrat, à partir du registre calculé jusqu'à la date de fin.
 * La notification sert à l'ancienneté (préavis, seuil de 9 mois).
 */
export function endOfContract(ledger: Ledger, kind: EndKind, notificationDate: ISODate, endDate: ISODate): EndOfContract {
  const c = ledger.contract;
  const warnings: string[] = [];
  const n = notice(c.startDate, notificationDate, kind);

  // 1. Régularisation (année incomplète, art. 109.2 et 124) : salaire dû − salaire versé, si positif
  let regularisation = 0;
  let regularisationPartial = false;
  if (c.yearType === 'incomplete') {
    let balance = 0;
    for (const m of ledger.months.values()) {
      const paidBase = m.mensualisedCents - m.deductionCents;
      let workedMinutes = 0;
      for (const d of m.days) {
        if (d.status === 'accueil') workedMinutes += d.actual;
        else if (d.status === 'ferie_chome' || (d.status === 'absence' && d.absence === 'famille') || (d.status === 'absence' && d.absence === 'am_evenement_familial')) workedMinutes += d.theoretical;
        else if (d.status === 'absence' && d.absence === 'enfant_malade' && !ledger.sickness.deductible.has(d.date)) workedMinutes += d.theoretical;
      }
      const baseMinutes = Math.max(0, workedMinutes - m.complementaryMinutes - m.majoredMinutes);
      const dueBase = mulMulDiv(c.hourlyNetMilli, baseMinutes, 1, 600);
      balance += dueBase - paidBase;
    }
    if (ledger.historyGaps.length > 0 || ledger.trackingStart > c.startDate.slice(0, 7)) regularisationPartial = true;
    regularisation = Math.max(0, balance);
    if (regularisationPartial) {
      warnings.push('Régularisation calculée sur les seuls mois suivis par le site : les mois antérieurs ne sont pas connus jour par jour.');
    }
  }

  // 2. Indemnité compensatrice de congés payés (art. 123) : congés acquis non rémunérés
  let paidLeaveIndemnity = 0;
  const details: string[] = [];
  const perDay = mulMulDiv(weeklyNetCents(c), 1, 1, 6);
  for (const p of ledger.cpPeriods) {
    if (p.indemnity) {
      // Période close : ce qui n'a pas encore été versé
      if (c.yearType === 'incomplete') {
        let paidSoFar = 0;
        for (const m of ledger.months.values()) {
          if (m.month > `${p.period.closingYear}-05`) paidSoFar += m.cpIndemnityCents;
        }
        const left = Math.max(0, p.indemnity.dueCents - paidSoFar);
        if (left > 0) {
          paidLeaveIndemnity += left;
          details.push(`${formatEuros(left)} restant dus pour la période close au 31 mai ${p.period.closingYear}`);
        }
      } else if (p.remaining > 0) {
        const amount = perDay * p.remaining;
        paidLeaveIndemnity += amount;
        details.push(`${p.remaining} jours non pris de la période close au 31 mai ${p.period.closingYear}`);
      }
    } else if (p.period.start <= endDate) {
      // Période en cours, close à la date de fin
      const period: ReferencePeriod = { ...p.period, end: endDate < p.period.end ? endDate : p.period.end };
      const ind = cpIndemnity(c, period, p.acquisition, ledger.netByMonth);
      const best = Math.max(ind.tenth, ind.maintain);
      paidLeaveIndemnity += best;
      details.push(`${p.acquisition.totalDays} jours acquis depuis le ${formatLongDate(p.period.start)}`);
      if (!ind.baseComplete) warnings.push('Des paies de la période en cours manquent : le dixième est sous-estimé.');
    }
  }

  // 3. Indemnité de rupture (art. 121.1, 119.4.2, 119.5) : 1/80e des salaires bruts du contrat
  let grossTotal = 0;
  let grossEstimated = false;
  for (const g of ledger.grossByMonth.values()) {
    grossTotal += g.cents;
    if (g.source === 'estimation') grossEstimated = true;
  }
  // La régularisation et l'indemnité de congés sont des salaires : elles entrent dans la base
  const extraGross = roundDiv(BigInt(Math.round((regularisation + paidLeaveIndemnity) * 1000)), BigInt(Math.round(ledger.netToGross.ratio * 1000)));
  grossTotal += extraGross;
  if (ledger.historyGaps.length > 0) {
    warnings.push(`Bulletins manquants pour ${ledger.historyGaps.length} mois : l’indemnité de rupture est sous-estimée.`);
  }

  const nine = n.seniorityMonths >= 9;
  let ruptureIndemnity = 0;
  let ruptureRule = 'Non due';
  switch (kind) {
    case 'retrait':
      if (nine) {
        ruptureIndemnity = roundDiv(BigInt(grossTotal), 80n);
        ruptureRule = '1/80e des salaires bruts du contrat (accueil depuis au moins 9 mois)';
      } else ruptureRule = 'Non due : accueil depuis moins de 9 mois à la notification';
      break;
    case 'deces_enfant':
      ruptureIndemnity = roundDiv(BigInt(grossTotal), 80n);
      ruptureRule = '1/80e des salaires bruts du contrat (sans condition d’ancienneté)';
      break;
    case 'inaptitude':
      if (nine) {
        ruptureIndemnity = roundDiv(BigInt(grossTotal), 80n);
        ruptureRule = '1/80e des salaires bruts du contrat';
      } else ruptureRule = 'Non due : accueil depuis moins de 9 mois';
      break;
    case 'inaptitude_pro':
      if (nine) {
        ruptureIndemnity = roundDiv(BigInt(grossTotal) * 2n, 80n);
        ruptureRule = '2/80e des salaires bruts du contrat';
      } else ruptureRule = 'Non due : accueil depuis moins de 9 mois';
      break;
    default:
      ruptureRule = 'Non due pour ce motif de fin';
  }
  if (grossEstimated && ruptureIndemnity > 0) {
    warnings.push(
      ledger.netToGross.source === 'bulletin'
        ? 'Une partie des salaires bruts est estimée à partir du dernier bulletin saisi.'
        : 'Les salaires bruts sont estimés : saisis au moins un bulletin pour un montant exact.',
    );
  }

  return {
    kind,
    notice: n,
    grossTotal,
    grossEstimated,
    ruptureIndemnity,
    ruptureRule,
    regularisation,
    regularisationPartial,
    paidLeaveIndemnity,
    paidLeaveDetail: details.join(' ; '),
    total: regularisation + paidLeaveIndemnity + ruptureIndemnity,
    warnings,
  };
}
