// Cotisations sociales de l'assistante maternelle, datées. Déplacées de simulation.ts par la T-115 (R3), sans changement
// de valeur : elles servent au simulateur et au brut calculé depuis le net (brut.ts).
import type { ISODate } from './dates';

/**
 * Cotisations sociales d'une assistante maternelle, datées.
 * Mesurées le 1er novembre 2026 sur le simulateur officiel Urssaf/Pajemploi (calculerResteACharge) :
 * total = 83,75 % du net + 5,00 € par mois (86,86 % en Alsace-Moselle), soit sur le brut
 * 21,88 % salariales (23,18 % en Alsace-Moselle) + 43,547 % patronales + 5 € fixes.
 */
export interface CotisParams {
  from: ISODate;
  /** Cotisations salariales, en fraction du brut */
  salariale: number;
  /** Idem en Alsace-Moselle (régime local d'assurance maladie, +1,30 %) */
  salarialeAlsaceMoselle: number;
  /** Cotisations patronales, en fraction du brut */
  patronale: number;
  /** Part fixe mensuelle (centimes) */
  fixeMois: number;
  /** Réduction de cotisations salariales sur les heures majorées (CSS L241-17, décret 2019-40) */
  reductionHeuresMajorees: number;
}

const COTIS: CotisParams[] = [
  { from: '2025-01-01', salariale: 0.2188025, salarialeAlsaceMoselle: 0.2318025, patronale: 0.43547, fixeMois: 500, reductionHeuresMajorees: 0.1131 },
];

export function cotisParams(d: ISODate): CotisParams {
  let p = COTIS[0];
  for (const x of COTIS) if (x.from <= d) p = x;
  return p;
}
