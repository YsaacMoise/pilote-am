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
  /** Valeur d'un repas fourni par les parents, avantage en nature imposable (barème Urssaf) */
  repasAvantage: number;
  source: string;
}

export const RATES: Rates[] = [
  {
    from: '2025-01-01', smic: 1188, mg: 422, minConvBrut: 364, minConvNet: 284, entretienPlancherJour: 265, netSurBrut: 7810, repasAvantage: 545,
    source: 'Décret SMIC 1er nov. 2024 (11,88 €) ; MG 4,22 € ; minimum conventionnel 3,64 € brut',
  },
  {
    from: '2026-01-01', smic: 1202, mg: 425, minConvBrut: 364, minConvNet: 284, entretienPlancherJour: 265, netSurBrut: 7810, repasAvantage: 550,
    source: 'SMIC 12,02 € et MG 4,25 € au 1er janvier 2026',
  },
  {
    from: '2026-06-01', smic: 1231, mg: 435, minConvBrut: 420, minConvNet: 328, entretienPlancherJour: 265, netSurBrut: 7810, repasAvantage: 550,
    source: 'Arrêté du 22 mai 2026 : SMIC 12,31 €, MG 4,35 € ; minimum conventionnel AM 4,20 € brut / 3,28 € net (fiche DREETS du 12/06/2026)',
  },
];

/**
 * Réduction de cotisations salariales des heures complémentaires et majorées (CSS art. L241-17, décret 2019-40 :
 * 11,31 % de leur rémunération brute, dans la limite des cotisations d'assurance vieillesse).
 * NON VÉRIFIÉ à la source officielle (Légifrance et pages Pajemploi illisibles par un robot le 04/11/2026) : la
 * mécanique retenue (net déclaré et brut inchangés, réduction ajoutée à la somme versée) vient de sites spécialisés
 * et doit être confirmée sur un vrai bulletin Pajemploi avec des heures majorées (constat C-010).
 */
export const REDUCTION_HS = 0.1131;

/**
 * Plafond annuel de l'exonération d'impôt de ces heures (CGI art. 81 quater), en rémunération nette imposable,
 * par année de revenus. 7 500 € depuis 2022 (brochure IR 2026, p. 105 ; inchangé par la loi de finances 2026).
 * Une hausse est discutée pour 2027 : ajouter une ligne quand la loi de finances 2027 sera publiée.
 */
const PLAFONDS_HS: { from: number; montant: number }[] = [{ from: 2022, montant: 750000 }];
export const PLAFOND_HS_EXONEREES = 750000;
export function plafondHS(annee: number): number {
  let p = PLAFONDS_HS[0].montant;
  for (const x of PLAFONDS_HS) if (x.from <= annee) p = x.montant;
  return p;
}

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
