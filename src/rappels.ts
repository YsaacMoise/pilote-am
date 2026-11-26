// T-121 (option b), ajout du DG du 26/11/2026 : rappel de sauvegarde de l'écran Aujourd'hui. Fonction pure, testée
// (tests/t121-coffre.test.ts).
// - Sans compte, ou compte dont la copie n'est pas à jour : rappel de la sauvegarde de la semaine (comme avant).
// - Avec un compte et une copie à jour : plus de rappel chaque semaine. À la place, tant que la clé de secours n'a pas été
//   gardée, une invite (au plus une fois par mois si elle est écartée).
// - Compte dont ce téléphone n'a pas la clé : invite à l'entrer.

export type Rappel = 'sauvegarde' | 'cle' | 'cle-manquante' | null;

const JOUR = 86400000;

export function rappelDuJour(o: {
  contrats: number; maintenant: number; derniereSauvegarde?: number;
  compte: boolean; copieAJour: boolean; cleOk: boolean; cleManquante: boolean; cleGardee?: string; inviteEcartee?: number;
}): Rappel {
  if (!o.contrats) return null;
  if (o.compte && o.cleManquante) return 'cle-manquante';
  if (o.compte && o.copieAJour) {
    if (o.cleOk && !o.cleGardee && (!o.inviteEcartee || o.maintenant - o.inviteEcartee > 30 * JOUR)) return 'cle';
    return null;
  }
  return !o.derniereSauvegarde || o.maintenant - o.derniereSauvegarde > 7 * JOUR ? 'sauvegarde' : null;
}

/** Copie à jour : compte branché, sans envoi refusé ni erreur (statuts du service en ligne, cloud-state.ts) */
export function copieAJour(c: { status: string; refus?: string }): boolean {
  return !c.refus && ['synced', 'pending', 'starting', 'merging'].includes(c.status);
}
