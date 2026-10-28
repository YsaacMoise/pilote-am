// Taux réglementaires datés. Une revalorisation = une ligne ajoutée en bas.
// Montants en centimes entiers. Sources dans le README.
import type { ISODate } from './dates';

export interface Rates {
  from: ISODate;
  /** SMIC horaire brut */
  smic: number;
  /** Minimum garanti */
  mg: number;
  /** Salaire horaire minimum conventionnel brut d'un assistant maternel (par enfant) */
  minConvBrut: number;
  /** Salaire horaire minimum conventionnel net (repère officiel publié avec le brut) */
  minConvNet: number;
  /** Plancher d'indemnité d'entretien par journée d'accueil (art. 114.1) */
  entretienPlancherJour: number;
  /** Part du net dans le brut (cotisations salariales estimées), en pour-dix-mille */
  netSurBrut: number;
  source: string;
}

export const RATES: Rates[] = [
  {
    from: '2025-01-01', smic: 1188, mg: 422, minConvBrut: 364, minConvNet: 284, entretienPlancherJour: 265, netSurBrut: 7810,
    source: 'Décret SMIC 1er nov. 2024 (11,88 €) ; MG 4,22 € ; minimum conventionnel 3,64 € brut',
  },
  {
    from: '2026-01-01', smic: 1202, mg: 425, minConvBrut: 364, minConvNet: 284, entretienPlancherJour: 265, netSurBrut: 7810,
    source: 'SMIC 12,02 € et MG 4,25 € au 1er janvier 2026',
  },
  {
    from: '2026-06-01', smic: 1231, mg: 435, minConvBrut: 420, minConvNet: 328, entretienPlancherJour: 265, netSurBrut: 7810,
    source: 'Arrêté du 22 mai 2026 : SMIC 12,31 €, MG 4,35 € ; minimum conventionnel AM 4,20 € brut / 3,28 € net (fiche DREETS du 12/06/2026)',
  },
];

export function ratesAt(d: ISODate): Rates {
  let r = RATES[0];
  for (const x of RATES) if (x.from <= d) r = x;
  return r;
}

/** Plancher d'entretien pour une journée de `min` minutes d'accueil : max(2,65 €, MG/10 par heure) */
export function entretienPlancher(d: ISODate, min: number): number {
  const r = ratesAt(d);
  return Math.max(r.entretienPlancherJour, Math.round((r.mg * min) / 600));
}

/** Brut estimé à partir du net */
export function netToBrut(net: number, d: ISODate): number {
  return Math.round((net * 10000) / ratesAt(d).netSurBrut);
}
