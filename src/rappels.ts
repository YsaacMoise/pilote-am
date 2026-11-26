// T-121 (option b), ajout du DG du 26/11/2026 : rappel de sauvegarde de l'écran Aujourd'hui. Fonction pure, testée
// (tests/t121-coffre.test.ts).
// - Sans compte, ou compte dont la copie n'est pas à jour : rappel de la sauvegarde de la semaine (comme avant).
// - Avec un compte et une copie à jour : plus de rappel chaque semaine. À la place, tant qu'aucun filet ne protège la clé de
//   secours (T-125 : clé d'accès Face ID, clé envoyée par e-mail, imprimée, enregistrée en fichier ou notée), une carte
//   discrète, qui ne s'écarte pas (consignes/t125-cle-sans-perte.md, point 3).
// - Compte dont ce téléphone n'a pas la clé : invite à l'entrer.

export type Rappel = 'sauvegarde' | 'cle' | 'cle-manquante' | null;

const JOUR = 86400000;

export function rappelDuJour(o: {
  contrats: number; maintenant: number; derniereSauvegarde?: number;
  compte: boolean; copieAJour: boolean; cleOk: boolean; cleManquante: boolean; filet: boolean;
}): Rappel {
  if (!o.contrats) return null;
  if (o.compte && o.cleManquante) return 'cle-manquante';
  if (o.compte && o.copieAJour) {
    if (o.cleOk && !o.filet) return 'cle';
    return null;
  }
  return !o.derniereSauvegarde || o.maintenant - o.derniereSauvegarde > 7 * JOUR ? 'sauvegarde' : null;
}

/** Copie à jour : compte branché, sans envoi refusé ni erreur (statuts du service en ligne, cloud-state.ts) */
export function copieAJour(c: { status: string; refus?: string }): boolean {
  return !c.refus && ['synced', 'pending', 'starting', 'merging'].includes(c.status);
}

/** T-125 : au moins un filet protège la clé de secours (clé d'accès, e-mail, impression, fichier, ou clé notée à la main). */
export function aUnFilet(o: { paquets?: number; cleGardee?: string; filets?: { email?: string; impression?: string; fichier?: string } }): boolean {
  return (o.paquets ?? 0) > 0 || !!o.cleGardee || !!o.filets?.email || !!o.filets?.impression || !!o.filets?.fichier;
}
