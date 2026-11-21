// Décision du DG du 21/11/2026 (« sans la raison ») : forme enregistrée d'une absence de l'AM.
// - Événement familial : « événement familial » et le nombre de jours payés prévus, jamais sa nature.
// - Absence que l'app ne gère pas (maternité, paternité, naissance, accident du travail ou maladie professionnelle) :
//   « absence non gérée par l'app » et ses dates, jamais le cas précis.
// Les saisies d'avant (téléphones qui ont essayé la demande n° 52) portent encore la nature ou le cas : la lecture les
// ramène à cette forme (migration douce), sans perte de jours ni de dates.
import { daysBetween } from './dates';
import { dureeEvenement, evenementPrecedentProche, evenementSuivantProche, LIEN_EVENEMENT_JOURS } from './evenements';
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

/**
 * Forme enregistrée d'une liste d'absences lue (chargement). Avant de retirer la nature, pose le lien `suiteDe` exactement
 * comme le calcul de 9a078a7 reliait les absences : même nature, la précédente commencée avant, 15 jours calendaires au
 * plus entre sa fin et le début, la plus tardive si plusieurs (decision du DG du 21/11/2026). La paie des données
 * existantes reste donc la même. Rend la même liste (mêmes objets) si rien n'est à ramener.
 */
export function normaliserAbsences(ls: AbsenceLue[]): AmLeave[] {
  const liens = new Map<AbsenceLue, string>();
  for (const cur of ls) {
    if (cur.type !== 'evenement' || cur.nature === undefined || cur.suiteDe) continue;
    let prev: AbsenceLue | undefined;
    for (const p of ls) {
      if (p === cur || p.id === cur.id || p.type !== 'evenement' || p.nature !== cur.nature || p.from >= cur.from) continue;
      if (daysBetween(p.to, cur.from) > LIEN_EVENEMENT_JOURS) continue;
      if (!prev || p.to > prev.to) prev = p;
    }
    if (prev) liens.set(cur, prev.id);
  }
  return ls.map((l) => {
    const n = normaliserAbsence(l);
    const suite = liens.get(l);
    return suite ? { ...n, suiteDe: suite } : n;
  });
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

/**
 * Décision du DG du 21/11/2026 (« Demander à l'AM ») : question à poser à la saisie d'un événement familial [from, to].
 * `avant` : « C'est la suite de l'absence du … ? » (absence la plus proche avant, 15 jours au plus).
 * `apres` (saisie dans le désordre, aucune avant) : « L'absence du … est-elle la suite de celle-ci ? ».
 */
export type QuestionSuite = { sens: 'avant' | 'apres'; autre: AmLeave };
export function questionSuite(from: string, to: string, leaves: AmLeave[]): QuestionSuite | undefined {
  const avant = evenementPrecedentProche(from, leaves);
  if (avant) return { sens: 'avant', autre: avant };
  const apres = evenementSuivantProche(from, to, leaves);
  return apres ? { sens: 'apres', autre: apres } : undefined;
}

/** Texte de la question, avec la date de l'autre absence (JJ/MM) */
export function texteQuestionSuite(q: QuestionSuite): string {
  const jjmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  return q.sens === 'avant' ? `C’est la suite de l’absence du ${jjmm(q.autre.from)} ?` : `L’absence du ${jjmm(q.autre.from)} est-elle la suite de celle-ci ?`;
}

/**
 * Absences à enregistrer selon la réponse. « Oui » pose `suiteDe` (sur la nouvelle absence, ou sur l'autre quand elle est
 * après) ; « non » ne pose aucun lien. Seul un identifiant interne est enregistré, jamais la raison.
 */
export function appliquerReponseSuite(nouvelle: AmLeave, q: QuestionSuite | undefined, oui: boolean): AmLeave[] {
  if (!q || !oui) return [nouvelle];
  if (q.sens === 'avant') return [{ ...nouvelle, suiteDe: q.autre.id }];
  return [nouvelle, { ...q.autre, suiteDe: nouvelle.id }];
}
