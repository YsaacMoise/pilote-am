import type { ISODate, Minutes } from './dates';
import { roundDiv, type Cents } from './money';
import { rateOn, type RateLine, RATES } from './rates';

/**
 * Abattement fiscal spécifique des assistants maternels (CGI art. 80 sexies,
 * BOFiP BOI-RSA-CHAMP-10-20-10 § 370 à 490).
 *
 * - Par enfant et par jour de garde EFFECTIVE.
 * - 3 × SMIC horaire du jour ; 4 × SMIC pour un enfant ouvrant droit à majoration.
 * - Garde de 24 heures consécutives : + 1 × SMIC.
 * - Moins de 8 heures : au prorata, (3 ou 4) × SMIC × heures ÷ 8.
 * - Le SMIC retenu est celui en vigueur le jour de la garde (§ 490, remarque 1).
 * - L'abattement ne peut pas dépasser les sommes perçues.
 */

export interface CareDay {
  date: ISODate;
  /** Durée de garde effective ce jour-là */
  minutes: Minutes;
  /** Enfant ouvrant droit à la majoration (handicap, maladie, inadaptation) */
  majoration: boolean;
  /** Garde de 24 heures consécutives */
  consecutive24h?: boolean;
}

const EIGHT_HOURS = 480;

/**
 * Abattement d'un jour, exprimé en « millièmes × minutes ÷ 480 » non arrondis :
 * on renvoie le numérateur exact pour que le total annuel soit arrondi une seule fois.
 * Valeur en centimes = numérateur ÷ (480 × 10).
 */
export function dayAbattementNumerator(day: CareDay, table: readonly RateLine[] = RATES): bigint {
  if (day.minutes <= 0) return 0n;
  const smic = BigInt(rateOn('SMIC_HORAIRE', day.date, table));
  const factor = BigInt(day.majoration ? 4 : 3);
  const minutes = BigInt(Math.min(day.minutes, EIGHT_HOURS));
  let numerator = factor * smic * minutes;
  if (day.consecutive24h) numerator += smic * BigInt(EIGHT_HOURS);
  return numerator;
}

const DENOMINATOR = BigInt(EIGHT_HOURS * 10);

export function dayAbattement(day: CareDay, table: readonly RateLine[] = RATES): Cents {
  return roundDiv(dayAbattementNumerator(day, table), DENOMINATOR);
}

/** Total des abattements d'une liste de jours, arrondi une seule fois. */
export function totalAbattement(days: readonly CareDay[], table: readonly RateLine[] = RATES): Cents {
  let numerator = 0n;
  for (const d of days) numerator += dayAbattementNumerator(d, table);
  return roundDiv(numerator, DENOMINATOR);
}

export interface TaxEstimate {
  /** Sommes perçues soumises au régime : salaires nets imposables + indemnités */
  income: Cents;
  /** Abattement calculé avant plafonnement */
  abattementBrut: Cents;
  /** Abattement retenu (plafonné aux sommes perçues) */
  abattement: Cents;
  /** Revenu imposable estimé */
  taxable: Cents;
}

export function taxEstimate(income: Cents, abattementBrut: Cents): TaxEstimate {
  const abattement = Math.min(abattementBrut, Math.max(0, income));
  return { income, abattementBrut, abattement, taxable: Math.max(0, income - abattement) };
}
