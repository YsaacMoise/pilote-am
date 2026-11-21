// Décision du DG du 21/11/2026 (« sans la raison ») : forme enregistrée d'une absence de l'AM.
// - Événement familial : « événement familial » et le nombre de jours payés prévus, jamais sa nature.
// - Absence que l'app ne gère pas (maternité, paternité, naissance, accident du travail ou maladie professionnelle) :
//   « absence non gérée par l'app » et ses dates, jamais le cas précis.
// Les saisies d'avant (téléphones qui ont essayé la demande n° 52) portent encore la nature ou le cas : la lecture les
// ramène à cette forme (migration douce), sans perte de jours ni de dates.
import { dureeEvenement } from './evenements';
import { AM_ABS_NON_GEREES, type AmAbs, type AmAbsNonGeree, type AmLeave, type NatureEvenement } from './model';

/** Absence telle qu'elle peut être lue : forme actuelle, ou saisie d'avant (nature, cas non géré dans `type`) */
export type AbsenceLue = Omit<AmLeave, 'type'> & { type: AmAbs | (typeof AM_ABS_NON_GEREES)[number]; nature?: NatureEvenement };

/** Nombre de jours enregistré pour un événement de nature `nature` commencé le `from` (0 : durée non gérée) */
export function joursEvenementSaisi(nature: NatureEvenement, from: string): number {
  return dureeEvenement(nature, from) ?? 0;
}

/**
 * Forme enregistrée d'une absence : la nature et le cas non géré sont retirés. Les jours et les dates sont gardés.
 * Une absence déjà à la bonne forme est rendue telle quelle (même objet).
 */
export function normaliserAbsence(l: AbsenceLue): AmLeave {
  const { nature, ...reste } = l;
  if ((AM_ABS_NON_GEREES as string[]).includes(l.type)) {
    const { joursEvenement: _j, ...sansJours } = reste;
    return { ...sansJours, type: 'non_gere' };
  }
  if (l.type === 'evenement' && nature !== undefined) {
    // La durée enregistrée est celle que le calcul lisait avant : dureeEvenement(nature, date de début).
    return { ...reste, type: 'evenement', joursEvenement: reste.joursEvenement ?? joursEvenementSaisi(nature, l.from) };
  }
  if (nature !== undefined || 'nature' in l) return { ...reste, type: l.type as AmAbs };
  return l as AmLeave;
}

/** Choix de l'écran de saisie : les cas non gérés se choisissent un par un, mais seul « non géré » est enregistré */
export type ChoixAbsence = Exclude<AmAbs, 'non_gere'> | AmAbsNonGeree;
export const estNonGere = (t: ChoixAbsence): t is AmAbsNonGeree => (AM_ABS_NON_GEREES as string[]).includes(t);

/**
 * Absence enregistrée à partir du choix de l'écran : événement familial avec son nombre de jours, jamais sa nature ; cas
 * non géré sous `non_gere`, jamais le cas choisi. `undefined` : événement sans nature choisie (le bouton reste grisé).
 */
export function absenceSaisie(choix: ChoixAbsence, nature: NatureEvenement | undefined, id: string, from: string, to: string): AmLeave | undefined {
  if (estNonGere(choix)) return { id, type: 'non_gere', from, to };
  if (choix === 'evenement') return nature ? { id, type: 'evenement', from, to, joursEvenement: joursEvenementSaisi(nature, from) } : undefined;
  return { id, type: choix, from, to };
}
