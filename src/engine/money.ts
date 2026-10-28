/**
 * Arithmétique monétaire exacte.
 *
 * - Les montants sont des centimes entiers (type Cents).
 * - Les taux (par heure, par jour) sont des millièmes d'euro entiers (type Milli),
 *   pour représenter exactement 0,435 € ou 12,31 €.
 * - Tous les arrondis passent par roundDiv : arrondi au plus proche, demi vers le haut
 *   (en valeur absolue), calculé en entiers exacts (BigInt).
 */

export type Cents = number;
export type Milli = number;

function assertInt(n: number, label: string): void {
  if (!Number.isInteger(n)) {
    throw new Error(`${label} doit être un entier, reçu ${n}`);
  }
}

/** Arrondit numerator / denominator à l'entier le plus proche (demi vers l'extérieur). */
export function roundDiv(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) throw new Error('Division par zéro');
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const q = (2n * abs + denominator) / (2n * denominator);
  const result = Number(negative ? -q : q);
  return result;
}

/** a × b ÷ c arrondi, en entiers exacts. */
export function mulDiv(a: number, b: number, c: number): number {
  assertInt(a, 'a');
  assertInt(b, 'b');
  assertInt(c, 'c');
  return roundDiv(BigInt(a) * BigInt(b), BigInt(c));
}

/** a × b × c ÷ (d × e) arrondi, en entiers exacts. */
export function mulMulDiv(a: number, b: number, c: number, d: number, e = 1): number {
  [a, b, c, d, e].forEach((v, i) => assertInt(v, `arg${i}`));
  return roundDiv(BigInt(a) * BigInt(b) * BigInt(c), BigInt(d) * BigInt(e));
}

/** Convertit un taux en millièmes en centimes (arrondi). */
export function milliToCents(m: Milli): Cents {
  assertInt(m, 'milli');
  return roundDiv(BigInt(m), 10n);
}

/**
 * Montant en centimes d'un taux horaire (millièmes) appliqué à une durée en minutes.
 * centimes = taux_milli × minutes ÷ 60 ÷ 10
 */
export function hourlyAmount(rateMilli: Milli, minutes: number): Cents {
  assertInt(rateMilli, 'rateMilli');
  assertInt(minutes, 'minutes');
  return roundDiv(BigInt(rateMilli) * BigInt(minutes), 600n);
}

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/**
 * Lit un montant saisi en français : « 3,80 », « 3.8 », « 1 234,5 », « 12 € ».
 * Retourne des centimes, ou null si la saisie n'est pas un montant.
 */
export function parseEuros(input: string): Cents | null {
  return parseDecimal(input, 2);
}

/** Lit un taux saisi en euros avec jusqu'à 3 décimales, retourne des millièmes. */
export function parseRateMilli(input: string): Milli | null {
  return parseDecimal(input, 3);
}

function parseDecimal(input: string, decimals: number): number | null {
  const cleaned = input
    .replace(/€/g, '')
    .replace(/[\s  ]/g, '')
    .replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith('-');
  const unsigned = negative ? cleaned.slice(1) : cleaned;
  const [intPart, fracPart = ''] = unsigned.split('.');
  if (fracPart.length > decimals) return null;
  const padded = (fracPart + '0'.repeat(decimals)).slice(0, decimals);
  const value = Number(intPart) * 10 ** decimals + Number(padded || '0');
  if (!Number.isSafeInteger(value)) return null;
  return negative ? -value : value;
}

const NBSP = ' ';

/** 65867 → « 658,67 € » (espace fine insécable avant l'euro et pour les milliers). */
export function formatEuros(cents: Cents): string {
  assertInt(cents, 'cents');
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;
  const grouped = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${negative ? '−' : ''}${grouped},${String(rest).padStart(2, '0')}${NBSP}€`;
}

/** Taux en millièmes → « 0,435 € » ou « 3,28 € » (2 ou 3 décimales selon besoin). */
export function formatRate(milli: Milli): string {
  assertInt(milli, 'milli');
  const negative = milli < 0;
  const abs = Math.abs(milli);
  const euros = Math.floor(abs / 1000);
  const frac = abs % 1000;
  const fracStr = frac % 10 === 0 ? String(frac / 10).padStart(2, '0') : String(frac).padStart(3, '0');
  return `${negative ? '−' : ''}${euros},${fracStr}${NBSP}€`;
}
