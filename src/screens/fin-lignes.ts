// Textes de lignes de l'écran Fin, sortis du composant pour être testés (T-072 / T-055).
import type { FinResult } from '../engine/fin';
import { shortDate } from '../engine/dates';
import { euros, hoursLabel } from '../engine/money';

/**
 * Ligne « Régularisation » de l'écran Fin. `incomplete` : année incomplète à la date de fin.
 * T-055 : une régularisation non calculée (semaines sans accueil manquantes) n'est jamais montrée « 0,00 € ».
 */
export function ligneRegularisation(f: Pick<FinResult, 'regularisation' | 'regulMinutes' | 'regularisationAConfirmer' | 'regularisationNonCalculee'>, incomplete: boolean): { hint: string; valeur: string } {
  if (f.regularisationNonCalculee) return { hint: 'Non calculée : il manque des semaines sans accueil, voir l’encadré plus haut', valeur: 'à confirmer' };
  if (f.regularisationAConfirmer) return { hint: 'Montant à confirmer : voir l’encadré plus haut', valeur: 'à confirmer' };
  const hint = f.regularisation > 0 || incomplete
    ? (f.regulMinutes ? `${hoursLabel(f.regulMinutes)} accueillies mais non payées par la mensualisation` : 'Pas d’heures accueillies au-delà de ce qui a été payé')
    : 'Année complète : pas de régularisation';
  return { hint, valeur: euros(f.regularisation) };
}

/**
 * T-074 / T-078 (D1) : ligne « Indemnité de préavis » de l'écran Fin (jours dispensés par les parents). Jamais un montant
 * sûr quand il change selon la date de fin du préavis, à confirmer (`aConfirmer`), ou selon la part du salaire qui est
 * l'indemnité (P-1, `autre`).
 */
export function ligneIndemnitePreavis(d: NonNullable<FinResult['dispense']>): { hint: string; valeur: string } {
  const jours = d.du > d.au ? 'Aucun jour dispensé à la date de fin retenue par l’app. '
    : `Jours dispensés ${d.du === d.au ? `le ${shortDate(d.du)}` : `du ${shortDate(d.du)} au ${shortDate(d.au)}`}. `;
  const detail = d.aConfirmer
    ? `Montant à confirmer : il dépend de la date de fin du préavis (${(d.variantes ?? []).map((v) => `${v.libelle} : ${euros(v.net)}${v.autre != null ? ` ou ${euros(v.autre)}` : ''}`).join(' ; ')}). `
    : d.autre != null
      ? `${euros(d.net)} en proportion du salaire du mois, ou ${euros(d.autre)} en comptant les heures dispensées au taux horaire : la part du salaire qui est l’indemnité est à confirmer. `
      : `Environ ${euros(d.brut)} brut. `;
  return {
    hint: `${jours}${detail}Comprise dans tes salaires des mois du préavis : elle n’est pas ajoutée au total ci-dessous.`,
    valeur: d.aConfirmer || d.autre != null ? 'à confirmer' : euros(d.net),
  };
}
