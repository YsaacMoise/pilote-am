// Textes de lignes de l'écran Fin, sortis du composant pour être testés (T-072 / T-055).
import type { FinResult } from '../engine/fin';
import { shortDate } from '../engine/dates';
import { euros, hoursLabel } from '../engine/money';

/**
 * Ligne « Régularisation » de l'écran Fin. `incomplete` : année incomplète à la date de fin.
 * T-055 : une régularisation non calculée (semaines sans accueil manquantes) n'est jamais montrée « 0,00 € ».
 */
export function ligneRegularisation(f: Pick<FinResult, 'regularisation' | 'regulMinutes' | 'regularisationAConfirmer' | 'regularisationNonCalculee'>, incomplete: boolean): { hint: string; valeur: string } {
  if (f.regularisationNonCalculee) return { hint: 'Non calculée : il manque des semaines sans accueil, voir l’encadré plus haut', valeur: 'non calculée' };
  if (f.regularisationAConfirmer) return { hint: 'Non calculée : voir l’encadré plus haut', valeur: 'non calculée' };
  const hint = f.regularisation > 0 || incomplete
    ? (f.regulMinutes ? `${hoursLabel(f.regulMinutes)} accueillies mais non payées par la mensualisation` : 'Pas d’heures accueillies au-delà de ce qui a été payé')
    : 'Année complète : pas de régularisation';
  return { hint, valeur: euros(f.regularisation) };
}

/**
 * T-074 / T-078 (D1), revu par la T-103 (F5) : ligne « Indemnité de préavis » de l'écran Fin (jours dispensés par les parents).
 * Une seule date de fin et une seule méthode (CCN 122 : proportion de l'art. 111).
 */
export function ligneIndemnitePreavis(d: NonNullable<FinResult['dispense']>): { hint: string; valeur: string } {
  const jours = d.du > d.au ? 'Aucun jour dispensé. '
    : `Jours dispensés ${d.du === d.au ? `le ${shortDate(d.du)}` : `du ${shortDate(d.du)} au ${shortDate(d.au)}`}. `;
  return {
    hint: `${jours}Soit ${euros(d.brut)} brut. Comprise dans tes salaires des mois du préavis : elle n’est pas ajoutée au total ci-dessous.`,
    valeur: euros(d.net),
  };
}
