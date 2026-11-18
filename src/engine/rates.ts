// Taux réglementaires datés. Une revalorisation = une ligne ajoutée en bas.
// Montants en centimes entiers. Sources dans le README.
import type { ISODate } from './dates';

export interface Rates {
  from: ISODate;
  /** SMIC horaire brut */
  smic: number;
  /** Minimum garanti */
  mg: number;
  /** Salaire horaire minimum conventionnel brut d'un assistant maternel (par enfant), sans la majoration du titre AM-GE/AM-AP */
  minConvBrut: number;
  /**
   * Salaire horaire minimum conventionnel net (repère officiel publié avec le brut). Absent quand aucun repère net
   * n'a été lu à la source pour la période (avant le 01/04/2025) : le contrôle se fait alors sur le brut seulement.
   */
  minConvNet?: number;
  /** Plancher d'indemnité d'entretien par journée d'accueil (art. 114.1 : « ne peut pas être inférieur à 2,65 € ») */
  entretienPlancherJour: number;
  /** Part du net dans le brut (cotisations salariales estimées), en pour-dix-mille */
  netSurBrut: number;
  /**
   * Valeur d'un repas fourni par les parents, avantage en nature imposable (barème Urssaf). Absente quand la valeur
   * de l'année n'a pas été lue à la source : le compteur fiscal le signale. T-025 C-6 : 5,50 € en 2026 lu sur urssaf.fr
   * (« Montant de l'avantage en 2026 : 1 repas 5,50 € ») ; la valeur 2025 (5,45 €) n'a été trouvée sur aucune source
   * admise le 18/11/2026 : retirée, 2025 et avant sont traités comme absents.
   */
  repasAvantage?: number;
  source: string;
}

/*
 * T-023 (BAREME-ABSENT). SMIC et MG : décrets et arrêtés de relèvement, art. 1 à 3, relus au JORF le 18/11/2026.
 * Minimum conventionnel : annexe 5 de la CCN IDCC 3239 et ses avenants n° 1 à 9 (tableau, art. 2 : « applicable à
 * compter du premier jour calendaire du mois suivant la date de parution de l'arrêté d'extension au Journal officiel »),
 * relus sur Légifrance le 18/11/2026. Détail et URL : projet/moteur/correctifs-t023.md, sections 1.4 et 1.5.
 * Avant le 01/01/2022 (entrée en vigueur de la CCN du 15 mars 2021) : période non gérée, aucune valeur.
 */
const ENTRETIEN = 265, NET_BRUT = 7810;
export const RATES: Rates[] = [
  { from: '2022-01-01', smic: 1057, mg: 376, minConvBrut: 297, entretienPlancherJour: ENTRETIEN, netSurBrut: NET_BRUT,
    source: 'Décret n° 2021-1741 du 22/12/2021 (SMIC 10,57 €, MG 3,76 €) ; annexe 5 de la CCN, texte de base (2,97 €)' },
  { from: '2022-05-01', smic: 1085, mg: 386, minConvBrut: 297, entretienPlancherJour: ENTRETIEN, netSurBrut: NET_BRUT,
    source: 'Arrêté du 19/04/2022 (SMIC 10,85 €, MG 3,86 €)' },
  { from: '2022-07-01', smic: 1085, mg: 386, minConvBrut: 306, entretienPlancherJour: ENTRETIEN, netSurBrut: NET_BRUT,
    source: 'Avenant n° 1 du 18/02/2022 à l’annexe 5 (3,06 €), arrêté d’extension publié au JORF du 14/06/2022' },
  { from: '2022-08-01', smic: 1107, mg: 394, minConvBrut: 306, entretienPlancherJour: ENTRETIEN, netSurBrut: NET_BRUT,
    source: 'Arrêté du 29/07/2022 (SMIC 11,07 €, MG 3,94 €)' },
  { from: '2022-09-01', smic: 1107, mg: 394, minConvBrut: 317, entretienPlancherJour: ENTRETIEN, netSurBrut: NET_BRUT,
    source: 'Avenant n° 2 du 13/05/2022 (3,17 €), JORF du 23/08/2022' },
  { from: '2022-12-01', smic: 1107, mg: 394, minConvBrut: 320, entretienPlancherJour: ENTRETIEN, netSurBrut: NET_BRUT,
    source: 'Avenant n° 3 du 15/09/2022 (3,20 €), JORF du 23/11/2022' },
  { from: '2023-01-01', smic: 1127, mg: 401, minConvBrut: 320, entretienPlancherJour: ENTRETIEN, netSurBrut: NET_BRUT,
    source: 'Décret n° 2022-1608 du 22/12/2022 (SMIC 11,27 €, MG 4,01 €)' },
  { from: '2023-04-01', smic: 1127, mg: 401, minConvBrut: 326, entretienPlancherJour: ENTRETIEN, netSurBrut: NET_BRUT,
    source: 'Avenant n° 4 du 08/12/2022 (3,26 €), JORF du 01/03/2023' },
  { from: '2023-05-01', smic: 1152, mg: 410, minConvBrut: 336, entretienPlancherJour: ENTRETIEN, netSurBrut: NET_BRUT,
    source: 'Arrêté du 26/04/2023 (SMIC 11,52 €, MG 4,10 €) ; avenant n° 5 du 27/01/2023 (3,36 €), JORF du 18/04/2023' },
  { from: '2023-09-01', smic: 1152, mg: 410, minConvBrut: 343, entretienPlancherJour: ENTRETIEN, netSurBrut: NET_BRUT,
    source: 'Avenant n° 6 du 17/05/2023 (3,43 €), JORF du 02/08/2023' },
  { from: '2024-01-01', smic: 1165, mg: 415, minConvBrut: 343, entretienPlancherJour: ENTRETIEN, netSurBrut: NET_BRUT,
    source: 'Décret n° 2023-1216 du 20/12/2023 (SMIC 11,65 €, MG 4,15 €)' },
  { from: '2024-02-01', smic: 1165, mg: 415, minConvBrut: 345, entretienPlancherJour: ENTRETIEN, netSurBrut: NET_BRUT,
    source: 'Avenant n° 7 du 16/10/2023 (3,45 €), JORF du 24/01/2024' },
  { from: '2024-05-01', smic: 1165, mg: 415, minConvBrut: 350, entretienPlancherJour: ENTRETIEN, netSurBrut: NET_BRUT,
    source: 'Avenant n° 8 du 15/01/2024 (3,50 €), JORF du 26/04/2024' },
  { from: '2024-11-01', smic: 1188, mg: 422, minConvBrut: 350, entretienPlancherJour: ENTRETIEN, netSurBrut: NET_BRUT,
    source: 'Décret n° 2024-951 du 23/10/2024 (SMIC 11,88 €, MG 4,22 €)' },
  {
    from: '2025-01-01', smic: 1188, mg: 422, minConvBrut: 350, minConvNet: 274, entretienPlancherJour: ENTRETIEN, netSurBrut: NET_BRUT,
    source: 'SMIC 11,88 € et MG 4,22 € (décret du 23/10/2024) ; minimum conventionnel 3,50 € brut (avenant n° 8, jusqu’au 31/03/2025) ; net 2,74 € (Urssaf, « Rémunérer un salarié à domicile ou un assistant maternel », mise à jour du 01/06/2026, historique « Du 1er janvier 2025 au 31 mars 2025 », métropole et Drom, lu le 18/11/2026, T-038)',
  },
  {
    from: '2025-04-01', smic: 1188, mg: 422, minConvBrut: 364, minConvNet: 286, entretienPlancherJour: ENTRETIEN, netSurBrut: NET_BRUT,
    source: 'Avenant n° 9 du 25/11/2024 à l’annexe 5 (3,64 € brut), arrêté d’extension publié au JORF du 18/03/2025 ; net 2,86 € (Urssaf, « Rémunérer un salarié à domicile ou un assistant maternel », historique « Du 1er avril 2025 au 31 décembre 2025 », lu le 18/11/2026, T-030)',
  },
  {
    from: '2026-01-01', smic: 1202, mg: 425, minConvBrut: 364, minConvNet: 286, entretienPlancherJour: ENTRETIEN, netSurBrut: NET_BRUT, repasAvantage: 550,
    source: 'SMIC 12,02 € et MG 4,25 € au 1er janvier 2026 ; minimum AM 3,64 € brut / 2,86 € net (Urssaf, « Rémunérer un salarié à domicile ou un assistant maternel », tableau « Du 1er janvier 2026 au 31 mai 2026 », lu le 18/11/2026, T-030 ; C-NET-02)',
  },
  {
    from: '2026-06-01', smic: 1231, mg: 435, minConvBrut: 420, minConvNet: 328, entretienPlancherJour: ENTRETIEN, netSurBrut: NET_BRUT, repasAvantage: 550,
    source: 'Arrêté du 22 mai 2026 : SMIC 12,31 €, MG 4,35 € ; minimum conventionnel AM 4,20 € brut / 3,28 € net (Urssaf, « Rémunérer un salarié à domicile ou un assistant maternel », mise à jour du 01/06/2026, tableau « Au 1er juin 2026 », métropole et Drom, lu le 18/11/2026, T-038 ; même valeur dans la fiche DREETS du 12/06/2026)',
  },
];

/** Premier jour couvert par des barèmes vérifiés à la source (T-023). Avant : « période non gérée ». */
export const PREMIERE_DATE_GEREE: ISODate = RATES[0].from;

export const MESSAGE_PERIODE_NON_GEREE =
  'Période non gérée : avant le 01/01/2022, les barèmes (SMIC, minimum garanti, minimum conventionnel) ne sont pas dans l’app.';

/** Barèmes en vigueur le jour `d`. `undefined` avant la première date vérifiée : jamais les barèmes d'une autre période. */
export function ratesAt(d: ISODate): Rates | undefined {
  let r: Rates | undefined;
  for (const x of RATES) if (x.from <= d) r = x;
  return r;
}

/** Barèmes d'une date qui ne peut pas être antérieure à 2022 (aujourd'hui, simulation d'un futur accueil). */
export function ratesConnus(d: ISODate): Rates {
  const r = ratesAt(d);
  if (!r) throw new Error(MESSAGE_PERIODE_NON_GEREE);
  return r;
}

/**
 * T-025 C-3. Minimum horaire brut à la date `d` : le plus haut de la grille de l'annexe 5 et du minimum légal.
 * CASF D423-9 (en vigueur depuis le 01/05/2008, lu le 18/11/2026) : « la rémunération des assistants maternels ne peut
 * être inférieure à 0,281 fois le montant du salaire minimum de croissance par enfant et par heure d'accueil ».
 * Annexe 5, art. 2 : la grille reste applicable « dès lors qu'elles sont au moins aussi favorables que les dispositions
 * légales et réglementaires relatives au salaire minimum statutaire ».
 * Aucun texte lu ne dit comment arrondir 0,281 × SMIC au centime. `certain` : le minimum arrondi au centime le plus
 * proche (un taux plus bas est sous le minimum dans toute lecture). `doute` : le centime supérieur, quand il dépasse
 * `certain` ; un taux entre les deux est « à confirmer ». `legal` : valeur exacte, en centimes non arrondis.
 */
export interface MinimumBrut { certain: number; doute?: number; legal: number; conv: number; source: 'grille' | 'legal' }
export function minimumBrut(d: ISODate): MinimumBrut | undefined {
  const r = ratesAt(d);
  if (!r) return undefined;
  const legal = (281 * r.smic) / 1000;
  const certain = Math.max(r.minConvBrut, Math.round(legal));
  const haut = Math.ceil(legal - 1e-9);
  return { certain, doute: haut > certain ? haut : undefined, legal, conv: r.minConvBrut, source: Math.round(legal) > r.minConvBrut ? 'legal' : 'grille' };
}

/** Libellé court du minimum brut, pour les écrans et les contrôles */
/**
 * T-033 (NET-01 à NET-03) : Urssaf, « Rémunérer un salarié à domicile ou un assistant maternel », tableau des minimums
 * des assistants maternels, renvoi * : « Le montant horaire minimum peut être majoré de 4 % (sauf à Mayotte) si
 * l'assistant maternel est titulaire du titre « Assistant maternel - garde d'enfants ». » L'app ne demande pas si l'AM a
 * ce titre : ses contrôles du minimum ne comptent pas cette majoration, et le disent. Aucun montant n'en dépend.
 */
export const MINIMUM_SANS_TITRE = 'Ce minimum ne compte pas la majoration de 4 % prévue quand l’assistante maternelle a le titre « Assistant maternel - garde d’enfants » (Urssaf). Si tu as ce titre, ton minimum est plus haut : vérifie ton taux.';

export function libelleMinimumBrut(m: MinimumBrut): string {
  const exact = (m.legal / 100).toFixed(3).replace('.', ',');
  if (m.source === 'legal') {
    return `${eurosCts(m.certain)} brut (minimum légal : 0,281 × SMIC = ${exact} €, au-dessus de la grille de la convention à ${eurosCts(m.conv)})${m.doute ? `, ${eurosCts(m.doute)} si l’on arrondit au centime supérieur` : ''}`;
  }
  return `${eurosCts(m.certain)} brut${m.doute ? ` (0,281 × SMIC = ${exact} € : ${eurosCts(m.doute)} si l’on arrondit au centime supérieur)` : ''}`;
}
function eurosCts(c: number): string {
  return `${(c / 100).toFixed(2).replace('.', ',')} €`;
}

/** Plancher d'entretien pour une journée de `min` minutes d'accueil : max(2,65 €, MG/10 par heure). `undefined` : période non gérée. */
export function entretienPlancher(d: ISODate, min: number): number | undefined {
  const r = ratesAt(d);
  if (!r) return undefined;
  return Math.max(r.entretienPlancherJour, Math.round((r.mg * min) / 600));
}

/** Brut estimé à partir du net */
export function netToBrut(net: number, d: ISODate): number {
  // Estimation, pas un barème : même part net/brut pour toutes les périodes (choix signalé dans correctifs-t023.md).
  return Math.round((net * 10000) / (ratesAt(d)?.netSurBrut ?? NET_BRUT));
}

/**
 * Dernier jour couvert par des barèmes vérifiés. Le SMIC, le minimum garanti et les cotisations sont revalorisés
 * au moins chaque 1er janvier, le CMG chaque 1er avril : au-delà de cette date, l'app reprend les derniers barèmes
 * connus et doit le dire. À avancer à chaque revalorisation ajoutée (ici, dans simulation.ts et dans conges.ts).
 * 30/11/2026 : hausse du SMIC de 1,6 % annoncée au 1er décembre 2026, décret non publié (Calculateur Arvela, T-014).
 */
export const BAREMES_VERIFIES_JUSQU_AU: ISODate = '2026-11-30';

/** Vrai si un calcul à cette date repose sur des barèmes pas encore publiés */
export function baremesProvisoires(d: ISODate): boolean {
  return d > BAREMES_VERIFIES_JUSQU_AU;
}

export const MESSAGE_BAREMES_PROVISOIRES =
  'Les barèmes officiels de cette période (SMIC, minimum garanti, cotisations, aide de la CAF) ne sont pas encore tous publiés. Ce calcul reprend les derniers barèmes connus : les montants pourront changer.';
