import type { ISODate } from './dates';
import type { Milli } from './money';

/**
 * Table des taux réglementaires datés.
 *
 * Chaque ligne vaut de `from` (inclus) à `to` (inclus, absent = toujours en vigueur).
 * Une revalorisation s'ajoute en une ligne : le moteur ne contient aucun montant écrit en dur.
 * Valeurs en millièmes d'euro.
 */

export type RateCode =
  /** SMIC horaire brut */
  | 'SMIC_HORAIRE'
  /** Minimum garanti (sert au calcul de l'indemnité d'entretien) */
  | 'MINIMUM_GARANTI'
  /** Indemnité d'entretien minimale par jour, quelle que soit la durée */
  | 'ENTRETIEN_FORFAIT_JOUR'
  /** Salaire horaire minimum conventionnel net, par enfant */
  | 'SALAIRE_MIN_NET'
  /** Idem, avec le titre professionnel d'assistant maternel */
  | 'SALAIRE_MIN_NET_TITRE'
  /** Salaire horaire minimum conventionnel brut : sert à estimer le rapport net / brut */
  | 'SALAIRE_MIN_BRUT';

export interface RateLine {
  code: RateCode;
  value: Milli;
  from: ISODate;
  to?: ISODate;
  source: string;
}

export const RATES: readonly RateLine[] = [
  { code: 'SMIC_HORAIRE', value: 11_650, from: '2024-01-01', to: '2024-10-31', source: 'Décret n° 2023-1216 du 20 décembre 2023' },
  { code: 'SMIC_HORAIRE', value: 11_880, from: '2024-11-01', to: '2025-12-31', source: 'Décret de revalorisation du SMIC au 1er novembre 2024' },
  { code: 'SMIC_HORAIRE', value: 12_020, from: '2026-01-01', to: '2026-05-31', source: 'Décret n° 2025-1228 du 17 décembre 2025' },
  { code: 'SMIC_HORAIRE', value: 12_310, from: '2026-06-01', source: 'Arrêté du 22 mai 2026 portant relèvement du SMIC' },

  { code: 'MINIMUM_GARANTI', value: 4_150, from: '2024-01-01', to: '2024-10-31', source: 'Décret n° 2023-1216 du 20 décembre 2023' },
  { code: 'MINIMUM_GARANTI', value: 4_220, from: '2024-11-01', to: '2025-12-31', source: 'Décret n° 2024-951 du 23 octobre 2024' },
  { code: 'MINIMUM_GARANTI', value: 4_250, from: '2026-01-01', to: '2026-05-31', source: 'Fiche DREETS Pays de la Loire, janvier 2026' },
  { code: 'MINIMUM_GARANTI', value: 4_350, from: '2026-06-01', source: 'Fiche DREETS Pays de la Loire, juin 2026' },

  { code: 'ENTRETIEN_FORFAIT_JOUR', value: 2_650, from: '2022-01-01', source: 'CCN IDCC 3239, article 114-1' },

  // Brut 3,64 € (avenant n° 9). Le net publié varie selon les sources (2,84 € ou 2,86 €) :
  // la valeur basse est retenue, ce taux ne sert qu'à alerter si le contrat est sous le minimum.
  // Avant 2026 : 0,281 SMIC brut, net estimé. Ces deux lignes ne servent qu'à l'alerte « sous le minimum ».
  { code: 'SALAIRE_MIN_NET', value: 2_550, from: '2024-01-01', to: '2024-10-31', source: 'CCN IDCC 3239 : 0,281 SMIC brut (3,27 €), net estimé' },
  { code: 'SALAIRE_MIN_NET', value: 2_600, from: '2024-11-01', to: '2025-12-31', source: 'CCN IDCC 3239 : 0,281 SMIC brut (3,34 €), net estimé' },
  { code: 'SALAIRE_MIN_NET', value: 2_840, from: '2026-01-01', to: '2026-05-31', source: 'CCN IDCC 3239, annexe 5, avenant n° 9' },
  { code: 'SALAIRE_MIN_NET', value: 3_280, from: '2026-06-01', source: 'Avenant n° 10 du 5 février 2026, étendu le 4 mai 2026' },
  { code: 'SALAIRE_MIN_NET_TITRE', value: 2_550, from: '2024-01-01', to: '2024-10-31', source: 'Pas de minimum distinct avant l’avenant n° 9' },
  { code: 'SALAIRE_MIN_NET_TITRE', value: 2_600, from: '2024-11-01', to: '2025-12-31', source: 'Pas de minimum distinct avant l’avenant n° 9' },
  { code: 'SALAIRE_MIN_NET_TITRE', value: 2_960, from: '2026-01-01', to: '2026-05-31', source: 'CCN IDCC 3239, annexe 5' },
  { code: 'SALAIRE_MIN_NET_TITRE', value: 3_410, from: '2026-06-01', source: 'Avenant n° 10 du 5 février 2026, étendu le 4 mai 2026' },

  { code: 'SALAIRE_MIN_BRUT', value: 3_270, from: '2024-01-01', to: '2024-10-31', source: 'CCN IDCC 3239 : 0,281 SMIC horaire brut' },
  { code: 'SALAIRE_MIN_BRUT', value: 3_340, from: '2024-11-01', to: '2025-03-31', source: 'CCN IDCC 3239 : 0,281 SMIC horaire brut' },
  { code: 'SALAIRE_MIN_BRUT', value: 3_640, from: '2025-04-01', to: '2026-05-31', source: 'Avenant n° 9 du 25 novembre 2024' },
  { code: 'SALAIRE_MIN_BRUT', value: 4_200, from: '2026-06-01', source: 'Avenant n° 10 du 5 février 2026' },
];

export class MissingRateError extends Error {
  constructor(public readonly code: RateCode, public readonly date: ISODate) {
    super(`Aucun taux ${code} connu pour le ${date}`);
  }
}

export function rateLineOn(code: RateCode, date: ISODate, table: readonly RateLine[] = RATES): RateLine {
  const line = table.find((r) => r.code === code && r.from <= date && (r.to === undefined || date <= r.to));
  if (!line) throw new MissingRateError(code, date);
  return line;
}

export function rateOn(code: RateCode, date: ISODate, table: readonly RateLine[] = RATES): Milli {
  return rateLineOn(code, date, table).value;
}

/**
 * Indemnité d'entretien conventionnelle par heure d'accueil :
 * 90 % du minimum garanti pour 9 heures, soit MG × 0,9 ÷ 9 = MG ÷ 10.
 * En millièmes : 4 350 → 435 (0,435 €).
 */
export function entretienHourlyMilli(date: ISODate, table: readonly RateLine[] = RATES): Milli {
  const mg = rateOn('MINIMUM_GARANTI', date, table);
  if (mg % 10 !== 0) {
    throw new Error(`Minimum garanti non divisible exactement par 10 : ${mg}`);
  }
  return mg / 10;
}
