// Décision du DG du 21/11/2026 (« sans la raison ») : forme enregistrée d'une absence de l'AM.
// - Événement familial : « événement familial » et le nombre de jours payés prévus, jamais sa nature.
// T-104 (décision du DG du 22/11/2026, regles/t104-absences-protegees.md, partie D) : congé maternité, paternité, congé
// supplémentaire de naissance, accident du travail ou maladie professionnelle sont calculés ; leur raison est enregistrée
// (dates, raison, et pour l'accident sa nature), sans pièce ni détail médical. Les saisies d'avant :
// - « absence non gérée par l'app » (`non_gere`, sans raison) : gardée ; le mois attend que l'AM précise la raison ;
// - type d'avant « accident_travail » : ramené à `at_mp`, nature à préciser ; « maternite », « paternite »,
//   « naissance_supp » : gardés tels quels (ce sont les types actuels).
import { daysBetween } from './dates';
import { dureeEvenement, evenementPrecedentProche, evenementSuivantProche, LIEN_EVENEMENT_JOURS } from './evenements';
import { AM_ABS_ANCIENNES, type AmAbs, type AmLeave, type NatureEvenement } from './model';

/** Absence telle qu'elle peut être lue : forme actuelle, ou saisie d'avant (nature, cas non géré dans `type`) */
export type AbsenceLue = Omit<AmLeave, 'type'> & { type: AmAbs | 'accident_travail'; nature?: NatureEvenement };

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
  if (AM_ABS_ANCIENNES.includes(l.type)) {
    const { joursEvenement: _j, ...sansJours } = reste;
    return { ...sansJours, type: 'at_mp' };
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

/** Choix de l'écran de saisie (T-104 : plus aucun cas « non géré ») */
export type ChoixAbsence = Exclude<AmAbs, 'non_gere'>;

/**
 * Absence enregistrée à partir du choix de l'écran : événement familial avec son nombre de jours, jamais sa nature.
 * `undefined` : événement sans nature choisie (le bouton reste grisé).
 */
export function absenceSaisie(choix: ChoixAbsence, nature: NatureEvenement | undefined, id: string, from: string, to: string): AmLeave | undefined {
  // T-103 (C9) : congé de deuil : l'écran de saisie demande le montant des indemnités journalières (AmLeave.ijSecu).
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

/**
 * Relecture 3 de la n° 52 (R1) : questions à poser, dans l'ordre. D'abord l'absence la plus proche avant ; après un
 * « non », l'absence la plus proche après (une absence voisine des deux côtés peut être le même événement).
 */
export type Reponse = 'oui' | 'non' | undefined;
export function questionsSuite(from: string, to: string, leaves: AmLeave[]): QuestionSuite[] {
  const avant = evenementPrecedentProche(from, leaves);
  const apres = evenementSuivantProche(from, to, leaves);
  return [...(avant ? [{ sens: 'avant' as const, autre: avant }] : []), ...(apres ? [{ sens: 'apres' as const, autre: apres }] : [])];
}

/** Questions visibles selon les réponses : la seconde seulement après « non » à la première */
export function questionsVisibles(qs: QuestionSuite[], reps: Reponse[]): QuestionSuite[] {
  return qs.filter((_, i) => i === 0 || reps[0] === 'non');
}

/** Toutes les questions visibles ont une réponse (sinon Enregistrer reste grisé) */
export function reponsesCompletes(qs: QuestionSuite[], reps: Reponse[]): boolean {
  return questionsVisibles(qs, reps).every((_, i) => reps[i] !== undefined);
}

/** Absences à enregistrer : la nouvelle désigne l'absence voisine pour laquelle l'AM a répondu « oui » (au plus une) */
export function appliquerReponses(nouvelle: AmLeave, qs: QuestionSuite[], reps: Reponse[]): AmLeave[] {
  const vis = questionsVisibles(qs, reps);
  const k = vis.findIndex((_, i) => reps[i] === 'oui');
  return k >= 0 ? appliquerReponseSuite(nouvelle, vis[k], true) : [nouvelle];
}

/** Texte de la question, avec la date de l'autre absence (JJ/MM) */
export function texteQuestionSuite(q: QuestionSuite): string {
  const jjmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  return q.sens === 'avant' ? `C’est la suite de l’absence du ${jjmm(q.autre.from)} ?` : `L’absence du ${jjmm(q.autre.from)} est-elle la suite de celle-ci ?`;
}

/**
 * Absences à enregistrer selon la réponse. « Oui » pose `suiteDe` sur la nouvelle absence (elle rejoint le groupe de
 * l'autre) ; « non » ne pose aucun lien. Seul un identifiant interne est enregistré, jamais la raison.
 */
export function appliquerReponseSuite(nouvelle: AmLeave, q: QuestionSuite | undefined, oui: boolean): AmLeave[] {
  // Le lien se lit dans les deux sens (groupe) : la nouvelle absence désigne l'autre, l'autre n'est pas modifiée.
  return q && oui ? [{ ...nouvelle, suiteDe: q.autre.id }] : [nouvelle];
}

/**
 * Suppression de l'absence `id` : les absences qui la désignaient sont rattachées à celle qu'elle désignait, pour que le
 * groupe reste entier. Si elle était la première (aucun lien valable), la plus ancienne de celles qui la désignaient
 * devient la première et les autres la désignent. Rend les absences à réécrire.
 */
export function liensApresSuppression(id: string, leaves: AmLeave[]): AmLeave[] {
  const x = leaves.find((l) => l.id === id);
  const suivantes = leaves.filter((l) => l.id !== id && l.suiteDe === id).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  if (!x || !suivantes.length) return [];
  const cible = x.suiteDe && leaves.some((l) => l.id === x.suiteDe && l.id !== id) ? x.suiteDe : undefined;
  if (cible) return suivantes.map((l) => ({ ...l, suiteDe: cible }));
  const [premiere, ...autres] = suivantes;
  const { suiteDe: _s, ...sansLien } = premiere;
  return [sansLien, ...autres.map((l) => ({ ...l, suiteDe: premiere.id }))];
}
