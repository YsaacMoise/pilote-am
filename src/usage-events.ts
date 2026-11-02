// Événements métier qui disent où l'utilisatrice se trompe (audit C-101).
// Seulement des noms d'événements fixes, écrits ici : jamais de texte saisi, d'heure, de nom ni d'identifiant.
// Ils passent par logUsage (journal local + mesure PostHog), qui ne part que si la mesure est acceptée (analytics.ts).
import type { Presence } from './engine/model';

/** Erreurs affichées à l'écran, par famille. Le nom d'événement est `erreur_<code>`. */
export type ErreurCode =
  | 'saisie' // champ refusé (montant, nombre, adresse, mot de passe…)
  | 'depart_avant_arrivee' // fiche de la journée
  | 'dates_absence' // absence de l'AM : fin avant début
  | 'contrat_incomplet' // contrat refusé à l'enregistrement
  | 'avenant_incomplet' // avenant refusé à l'enregistrement
  | 'restauration' // fichier de sauvegarde refusé
  | 'compte' // création de compte ou connexion refusée
  | 'envoi_refuse'; // envoi refusé par le serveur (C-023)

export function evErreur(code: ErreurCode): string {
  return `erreur_${code}`;
}

/** Nom d'écran sans identifiant de contrat ni paramètre (comme ecranCourant dans analytics.ts) */
export function ecranDe(hash: string): string {
  return hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'aujourdhui';
}

/** Annulation (bouton du message) juste après un pointage */
export function evAnnulation(arrivee: boolean): string {
  return arrivee ? 'annulation_arrivee' : 'annulation_depart';
}

/**
 * Vrai si une heure déjà pointée (arrivée ou départ) a été changée ou effacée.
 * Ajouter une heure qui manquait (départ oublié) n'est pas une correction.
 */
export function heureCorrigee(avant: Presence[] | undefined, apres: Presence[] | undefined): boolean {
  for (let i = 0; i < (avant?.length ?? 0); i++) {
    const a = avant![i], b = apres?.[i];
    if (a.a && a.a !== b?.a) return true;
    if (a.d && a.d !== b?.d) return true;
  }
  return false;
}

/** Correction d'heure : le jour même, ou après coup (un jour passé) */
export function evCorrection(jour: string, aujourdhui: string): string {
  return jour < aujourdhui ? 'heure_corrigee_apres_coup' : 'heure_corrigee';
}
