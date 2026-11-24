// T-077 : règles propres à l'Alsace-Moselle (Bas-Rhin, Haut-Rhin, Moselle) et à Mayotte.
// Rapports : calculateur-arvela, regles/t077-alsace-moselle.md, regles/t077-mayotte.md ; règles retenues :
// regles/t077-decisions.md (R0 à R7). Un point qu'aucun texte ne tranche est calculé dans ses deux lectures (décision du DG
// du 22/11/2026) : l'app ne verse que ce qui est dû dans les deux, et chiffre l'écart « à confirmer ».
import { addDays, type ISODate } from './dates';
import { holidaysOf } from './holidays';
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
 * R3 : jours fériés locaux, deux lectures (question DDETS).
 * - Alsace-Moselle : CT L3134-13, « 2° Le Vendredi Saint dans les communes ayant un temple protestant ou une église mixte »
 *   et « 12° Le premier et le second jour de Noël ». Lecture A : fériés ordinaires de l'AM (CCN 47.2, « dispositions légales
 *   et réglementaires de droit commun ») ; lecture B : non applicables (L3134-1 al. 2 exclut « l'éducation des enfants » et
 *   « les emplois à domicile par une personne physique » ; CASF L423-2 n'y renvoie pas).
 * - Mayotte : CT L3422-2, « 1° Le 27 avril à Mayotte ». Lecture A : férié ordinaire (CCN 47.2) ; lecture B : la CCN ne
 *   viserait que la liste nationale (L3133-1).
 */
export function feriesLocaux(region: Region, y: number): Map<ISODate, string> {
  const out = new Map<ISODate, string>();
  if (region === 'alsaceMoselle') {
    const lundiPaques = [...holidaysOf(y).entries()].find(([, n]) => n === 'Lundi de Pâques')?.[0];
    if (lundiPaques) out.set(addDays(lundiPaques, -3), 'Vendredi saint');
    out.set(`${y}-12-26`, '26 décembre');
  } else if (region === 'mayotte') {
    out.set(`${y}-04-27`, '27 avril (abolition de l’esclavage)');
  }
  return out;
}

export function ferieLocal(region: Region, d: ISODate): string | undefined {
  if (region === 'metropole') return undefined;
  return feriesLocaux(region, Number(d.slice(0, 4))).get(d);
}

/** Texte de la question, commun aux messages des jours fériés locaux. */
export function pourquoiFerieLocal(region: Region, nom: string): string {
  if (region === 'alsaceMoselle') {
    return `Le ${nom} est férié en Alsace-Moselle (code du travail, article L3134-13${nom === 'Vendredi saint' ? ', dans les communes qui ont un temple protestant ou une église mixte' : ''}). Aucun texte ne dit s’il l’est pour une assistante maternelle : le même code exclut « l’éducation des enfants » et « les emplois à domicile » de ces règles locales. La question sera posée à la DDETS.`;
  }
  return `Le ${nom} est férié à Mayotte (code du travail, article L3422-2). Aucun texte ne dit si la convention le compte parmi les fériés de l’assistante maternelle (article 47.2). La question sera posée à la DDETS.`;
}

/** R4 : maintien de salaire du droit local (Alsace-Moselle, CT L1226-23), deux lectures (question DDETS). */
export const MESSAGE_MAINTIEN_LOCAL =
  'Absence pour ta maladie ou celle de ton enfant : ces jours ne sont ni payés ni retenus. En Alsace-Moselle, le code du travail (article L1226-23) maintient le salaire d’une courte absence subie, moins les indemnités journalières de la sécurité sociale. Aucun texte ne dit s’il vaut pour l’assistante maternelle d’un particulier : la convention (annexe 3, article 3.1) l’écarte. Selon la lecture, les parents te doivent le salaire de ces jours moins tes indemnités journalières (ton relevé de la CPAM), ou rien. La question sera posée à la DDETS. Mets-toi d’accord avec les parents, par écrit.';

/** R6 : CSG et CRDS. Aucune ligne CSG ou CRDS dans les taux de l'AM à Mayotte (Urssaf, au 01/01/2026). */
export function partNonDeductibleRegion(region: Region, metropole: number): number {
  return region === 'mayotte' ? 0 : metropole;
}

/** R2 : majoration de 4 % du titre AM-GE à Mayotte. */
export const MINIMUM_SANS_TITRE_MAYOTTE =
  'Ce minimum ne compte pas la majoration de l’annexe 5 de la convention pour le titre « Assistant maternel - garde d’enfants ». Elle vaut aussi à Mayotte (convention, article 2 : la convention « est également applicable à Mayotte » pour les assistants maternels). Si tu as ce titre, ton minimum est plus haut : vérifie ton taux.';
