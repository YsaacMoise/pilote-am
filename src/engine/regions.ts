// T-077 : règles propres à l'Alsace-Moselle (Bas-Rhin, Haut-Rhin, Moselle) et à Mayotte.
// Rapports : calculateur-arvela, regles/t077-alsace-moselle.md, regles/t077-mayotte.md ; règles retenues :
// regles/t077-decisions.md (R0 à R7), revues par la T-103 (calculateur-arvela, rapports/T-103-inventaire.md, R1 à R7).
import type { ISODate } from './dates';
import { holidayName } from './holidays';
import type { Contract } from './model';

export type Region = 'metropole' | 'alsaceMoselle' | 'mayotte';

/** R0 : région du contrat, d'après le lieu d'accueil (CSS L325-1 II 1° pour le régime local d'Alsace-Moselle). */
export function regionDe(c: Partial<Pick<Contract, 'alsaceMoselle' | 'mayotte'>>): Region {
  if (c.mayotte) return 'mayotte';
  if (c.alsaceMoselle) return 'alsaceMoselle';
  return 'metropole';
}

/**
 * R1 : part du net dans le brut, en pour-dix-mille, pour estimer le brut depuis le net.
 * - Métropole : 7 810 (inchangé, rates.ts).
 * - Alsace-Moselle : cotisation salariale maladie du régime local (CSS L242-13 ; taux fixé par le conseil d'administration du
 *   régime local, D325-4 5°) en plus : 1,50 % jusqu'en mars 2022, 1,30 % « à compter d'avril 2022 » (délibération du
 *   16/12/2021 ; Urssaf, taux salariaux des AM au 01/01/2026 : « Cotisation salariale maladie supplémentaire pour les
 *   départements du Haut-Rhin, Bas-Rhin et de la Moselle 1,30 % »). 7 810 − 150 = 7 660, puis 7 810 − 130 = 7 680.
 *   Le mois du salaire compte (périodes d'emploi) ; l'autre lecture (salaires versés) ne change que mars 2022.
 * - Mayotte : Urssaf, « Taux salariaux applicables aux assistants maternels à Mayotte », au 01/01/2026 : 0,75 + 5,54 + 4,47
 *   + 1,04 = 11,80 % ; part 8 820 (concorde avec les nets publiés 3,21 € pour 3,64 € et 3,70 € pour 4,20 €). Comme en
 *   métropole, une seule part pour toutes les périodes : estimation, les taux de 2022 à 2025 ne sont pas publiés.
 */
export function netSurBrutRegion(region: Region, d: ISODate, metropole: number): number {
  if (region === 'alsaceMoselle') return metropole - (d < '2022-04-01' ? 150 : 130);
  if (region === 'mayotte') return 8820;
  return metropole;
}

/**
 * R2 : repère net du minimum horaire de l'AM, publié par l'Urssaf (« Rémunérer un salarié à domicile ou un assistant
 * maternel », mise à jour du 01/06/2026, colonnes « Bas-Rhin, Haut-Rhin et Moselle » et « Mayotte », lues le 22/11/2026).
 * Le minimum brut est le même dans les trois colonnes.
 */
const REPERES_NET: { from: ISODate; alsaceMoselle: number; mayotte: number }[] = [
  { from: '2025-01-01', alsaceMoselle: 269, mayotte: 308 },
  { from: '2025-04-01', alsaceMoselle: 281, mayotte: 321 },
  { from: '2026-06-01', alsaceMoselle: 323, mayotte: 370 },
];
export function minConvNetRegion(region: Region, d: ISODate, metropole: number | undefined): number | undefined {
  if (region === 'metropole' || metropole === undefined) return metropole;
  let v: number | undefined;
  for (const x of REPERES_NET) if (x.from <= d) v = x[region];
  return v;
}

/**
 * R2 : SMIC horaire brut de Mayotte (CT L3423-1 à L3423-4 ; décrets et arrêtés de relèvement, art. 1, lus au JORF le
 * 22/11/2026). Sert au minimum légal (CASF R544-2 XV : à l'article D423-9, « salaire minimum interprofessionnel en vigueur
 * à Mayotte ») et à une lecture de l'abattement fiscal. Le minimum garanti est le même qu'en métropole.
 */
export const SMIC_MAYOTTE: { from: ISODate; smic: number; source: string }[] = [
  { from: '2022-01-01', smic: 798, source: 'Décret n° 2021-1741 du 22/12/2021' },
  { from: '2022-05-01', smic: 819, source: 'Arrêté du 19/04/2022' },
  { from: '2022-08-01', smic: 835, source: 'Arrêté du 29/07/2022' },
  { from: '2023-01-01', smic: 851, source: 'Décret n° 2022-1608 du 22/12/2022' },
  { from: '2023-05-01', smic: 870, source: 'Arrêté du 26/04/2023' },
  { from: '2024-01-01', smic: 880, source: 'Décret n° 2023-1216 du 20/12/2023' },
  { from: '2024-11-01', smic: 898, source: 'Décret n° 2024-951 du 23/10/2024' },
  { from: '2026-01-01', smic: 933, source: 'Décret n° 2025-1228 du 17/12/2025' },
  { from: '2026-06-01', smic: 956, source: 'Arrêté du 22/05/2026' },
];
export function smicMayotte(d: ISODate): number | undefined {
  let v: number | undefined;
  for (const x of SMIC_MAYOTTE) if (x.from <= d) v = x.smic;
  return v;
}

/**
 * T-103 (R1, R4) : jours fériés de l'assistante maternelle selon la région.
 * - Alsace-Moselle : le Vendredi saint et le 26 décembre (C. trav. L3134-13) ne sont pas fériés pour l'AM. L3134-1, al. 2 :
 *   les règles locales du chapitre « ne s'appliquent pas […] à l'éducation des enfants […], aux emplois à domicile par une
 *   personne physique » ; CASF L423-2 ne rend pas ce chapitre applicable à l'AM ; CCN 47.2 renvoie aux fériés « de droit
 *   commun » (L3133-1).
 * - Mayotte : le 27 avril (abolition de l'esclavage, C. trav. L3422-2, 1°) est férié. L3422-3 : à Mayotte, les listes de
 *   L3133-1 et L3422-2 forment ensemble la liste légale ; CCN 47.2 renvoie aux fériés légaux.
 */
export function ferieDe(region: Region, d: ISODate): string | undefined {
  return holidayName(d) ?? (region === 'mayotte' && d.slice(5) === '04-27' ? '27 avril (abolition de l’esclavage)' : undefined);
}

/**
 * T-103 (R3, décision du DG du 24/11/2026) : en Alsace-Moselle, absence pour la maladie de l'AM ou de son enfant : salaire
 * maintenu, moins les indemnités journalières saisies (C. trav. L1226-23 ; Cass. soc. 13/04/2005, n° 03-41.877 ;
 * 04/12/2024, n° 23-11.485 ; 27/05/2025, n° 24-11.388).
 */
export const MESSAGE_MAINTIEN_LOCAL =
  'Absence pour ta maladie ou celle de ton enfant, en Alsace-Moselle : les parents maintiennent ton salaire, moins les indemnités journalières de la Sécurité sociale (code du travail, article L1226-23 ; Cour de cassation, 13/04/2005 et 04/12/2024).';
export const MESSAGE_IJ_MAINTIEN_LOCAL =
  'Absence pour ta maladie ou celle de ton enfant, en Alsace-Moselle : indique le montant des indemnités journalières de la Sécurité sociale reçues pour cette absence (0 si tu n’en as pas reçu). Les parents maintiennent ton salaire moins ce montant (code du travail, article L1226-23). L’app ne calcule pas ce mois sans lui.';

/** R6 : CSG et CRDS. Aucune ligne CSG ou CRDS dans les taux de l'AM à Mayotte (Urssaf, au 01/01/2026). */
export function partNonDeductibleRegion(region: Region, metropole: number): number {
  return region === 'mayotte' ? 0 : metropole;
}

/** R2 : majoration de 4 % du titre AM-GE à Mayotte. */
export const MINIMUM_SANS_TITRE_MAYOTTE =
  'Ce minimum ne compte pas la majoration de l’annexe 5 de la convention pour le titre « Assistant maternel - garde d’enfants ». Elle vaut aussi à Mayotte (convention, article 2 : la convention « est également applicable à Mayotte » pour les assistants maternels). Si tu as ce titre, ton minimum est plus haut : vérifie ton taux.';
