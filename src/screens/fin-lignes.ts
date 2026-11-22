// Textes de lignes de l'écran Fin, sortis du composant pour être testés (T-072 / T-055).
import type { FinResult } from '../engine/fin';
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
