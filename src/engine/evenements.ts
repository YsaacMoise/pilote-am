// Congés pour événements familiaux (R-ABS-06, T-023).
// Durées : CCN IDCC 3239, socle commun, art. 48.1.3.1.1 (version de l'avenant n° 4 du 16/10/2023) et Code du travail
// L3142-4 (plancher : la durée conventionnelle « ne peut être inférieure à »), rendu applicable aux AM par CASF L423-2, 12°.
// On retient la plus favorable à l'AM. Les jours sont des jours ouvrables (CCN 48.1.3.1.1 ; L3142-4, dernier alinéa).
// Textes relus le 18/11/2026 : projet/moteur/correctifs-t023.md, section 1.3.
import { eachDay, weekday, type ISODate } from './dates';
import { holidayName } from './holidays';
import type { AmLeave, NatureEvenement } from './model';

/** Libellés proposés à l'AM, dans l'ordre de l'article 48.1.3.1.1 */
export const NATURE_EVENEMENT_LABEL: Record<NatureEvenement, string> = {
  mariage: 'Mon mariage ou mon PACS',
  mariage_enfant: 'Mariage ou PACS de mon enfant',
  naissance: 'Naissance ou arrivée d’un enfant placé en vue d’adoption',
  deces_enfant: 'Décès de mon enfant (25 ans ou plus, sans enfant)',
  deces_enfant_14: 'Décès de mon enfant de moins de 25 ans, ou qui était lui-même parent, ou d’une personne de moins de 25 ans à ma charge',
  deces_proche: 'Décès du conjoint, partenaire de PACS, concubin, père, mère, beau-père, belle-mère, frère ou sœur',
  handicap_enfant: 'Annonce d’un handicap, d’une pathologie chronique ou d’un cancer chez un enfant',
  deces_descendant: 'Décès d’un petit-enfant ou arrière-petit-enfant',
  deces_ascendant: 'Décès d’un grand-parent ou arrière-grand-parent',
  deuil: 'Congé de deuil (8 jours, décès d’un enfant de moins de 25 ans)',
};

/**
 * Premier jour géré : les deux lectures de l'entrée en vigueur de l'avenant n° 4 (16/10/2023 selon Légifrance,
 * 01/05/2024 selon son article 4 et le JORF du 03/04/2024) donnent la nouvelle version de 48.1.3.1.1 à partir
 * du 01/05/2024 (t021-convention.md 2.8). Avant : version applicable non tranchée.
 */
export const EVENEMENTS_GERES_DEPUIS: ISODate = '2024-05-01';
/** Dernier jour avant la nouvelle rédaction de L3142-4, 6° (loi n° 2026-492 du 12 juin 2026, art. 6) */
const L3142_4_AVANT_2026 = '2026-06-13';

/** Durée en jours ouvrables à la date `d` : max(CCN 48.1.3.1.1, C. trav. L3142-4). `undefined` : non géré. */
export function dureeEvenement(nature: NatureEvenement, d: ISODate): number | undefined {
  switch (nature) {
    case 'mariage': return 4; // CCN 4 ; L3142-4, 1° : 4
    case 'mariage_enfant': return 1; // CCN 1 (mariage ou PACS) ; L3142-4, 2° : 1 (mariage)
    case 'naissance': return 3; // CCN 3 ; L3142-4, 3° et 3° bis : 3
    case 'deces_enfant': return 12; // CCN 12 ; L3142-4, 4° : 12
    case 'deces_enfant_14': return 14; // CCN 14 ; L3142-4, 4° : 14
    case 'deces_proche': return 3; // CCN 3 ; L3142-4, 5° : 3
    case 'handicap_enfant': return d <= L3142_4_AVANT_2026 ? 5 : 10; // CCN 5 ; L3142-4, 6° : 5 puis 10 dès le 14/06/2026
    case 'deces_descendant': return 1; // CCN 1 ; rien dans L3142-4
    case 'deces_ascendant': return 1; // CCN 1 ; rien dans L3142-4
    // Art. 48.1.3.1.2 : 8 jours ouvrables, indemnisés par la sécurité sociale (C. trav. L3142-2 renvoie à CSS L331-9).
    // Art. 48.1.3.1.3 (maintien sous déduction des indemnités journalières) : non géré par l'app.
    case 'deuil': return undefined;
  }
}

/** Jour ouvrable : lundi → samedi, hors jours fériés (même règle que le décompte des congés payés, conges.ts) */
const ouvrable = (d: ISODate) => weekday(d) <= 6 && !holidayName(d);

/** Statut d'un jour d'événement familial : payé comme événement, ou à confirmer avec la raison et ce qu'il faut faire */
export function statutJourEvenement(l: AmLeave, d: ISODate): { paye: true } | { paye: false; raison: string } {
  const qui = `Événement familial du ${jjmm(l.from)} au ${jjmm(l.to)}`;
  if (!l.nature) {
    return { paye: false, raison: `${qui} : la nature de l’événement n’est pas renseignée : la durée payée en dépend. Dans Congés, supprime cette absence et saisis-la à nouveau avec sa nature (mariage, naissance, décès…).` };
  }
  if (l.from < EVENEMENTS_GERES_DEPUIS) {
    return { paye: false, raison: `${qui} : période non gérée (avant le 01/05/2024, la version applicable de l’article 48.1.3.1.1 n’est pas tranchée). Vérifie la durée avec les parents.` };
  }
  const duree = dureeEvenement(l.nature, l.from);
  if (duree === undefined) {
    return { paye: false, raison: `${qui} : congé de deuil non géré par l’app. La sécurité sociale verse des indemnités journalières ; l’employeur maintient le salaire en les déduisant (article 48.1.3.1.3). Calcule-le avec les parents.` };
  }
  const n = eachDay(l.from, d).filter(ouvrable).length;
  if (ouvrable(d) && n <= duree) return { paye: true };
  if (!ouvrable(d) && n < duree) {
    return { paye: false, raison: `${qui} : un jour prévu au planning tombe un dimanche ou un férié pendant le congé ; l’app ne sait pas s’il est couvert. Vérifie-le avec les parents.` };
  }
  return {
    paye: false,
    raison: `${qui} : ${dureeLabel(duree)} au plus pour cet événement (convention, article 48.1.3.1.1, et Code du travail L3142-4). Les jours en plus ne sont pas payés comme événement : saisis-les en congé payé ou sans solde, selon votre accord. Le jour en plus pour un déplacement de plus de 600 km aller-retour est non rémunéré : saisis-le en congé sans solde.`,
  };
}

function dureeLabel(n: number): string {
  return `${n} jour${n > 1 ? 's' : ''} ouvrable${n > 1 ? 's' : ''}`;
}
function jjmm(d: ISODate): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}
