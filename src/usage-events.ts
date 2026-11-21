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

/** T-048 : geste choisi quand le pointage arrive loin de l'heure prévue (trois choix sur la carte). */
export type GestePointage = 'prevue' | 'maintenant' | 'autre';

/** T-048 : nom du choix fait (arrivee_heure_prevue, depart_maintenant_tardif…). Nom fixe : ni heure, ni nom. */
export function evChoixPointage(arrivee: boolean, geste: GestePointage): string {
  if (geste === 'prevue') return arrivee ? 'arrivee_heure_prevue' : 'depart_heure_prevue';
  if (geste === 'maintenant') return arrivee ? 'arrivee_maintenant_tardive' : 'depart_maintenant_tardif';
  return arrivee ? 'arrivee_autre_heure' : 'depart_autre_heure';
}

/**
 * Événements envoyés à chaque pointage : « arrivee » ou « depart » toujours ;
 * en plus, le choix fait quand les trois choix étaient proposés (T-048). Sans choix (avant le seuil) : rien de plus.
 */
export function evPointage(arrivee: boolean, geste: GestePointage | null): string[] {
  const ev = [arrivee ? 'arrivee' : 'depart'];
  if (geste) ev.push(evChoixPointage(arrivee, geste));
  return ev;
}

/**
 * T-048 : dit si une heure déjà pointée a été changée ou effacée, pour l'arrivée et pour le départ.
 * Ajouter une heure qui manquait (départ oublié) n'est pas une correction.
 */
export function heureCorrigeeDetail(avant: Presence[] | undefined, apres: Presence[] | undefined): { arrivee: boolean; depart: boolean } {
  const r = { arrivee: false, depart: false };
  for (let i = 0; i < (avant?.length ?? 0); i++) {
    const a = avant![i], b = apres?.[i];
    if (a.a && a.a !== b?.a) r.arrivee = true;
    if (a.d && a.d !== b?.d) r.depart = true;
  }
  return r;
}

/**
 * Vrai si une heure déjà pointée (arrivée ou départ) a été changée ou effacée.
 * Ajouter une heure qui manquait (départ oublié) n'est pas une correction.
 */
export function heureCorrigee(avant: Presence[] | undefined, apres: Presence[] | undefined): boolean {
  const d = heureCorrigeeDetail(avant, apres);
  return d.arrivee || d.depart;
}

/** Correction d'heure : le jour même, ou après coup (un jour passé) */
export function evCorrection(jour: string, aujourdhui: string): string {
  return jour < aujourdhui ? 'heure_corrigee_apres_coup' : 'heure_corrigee';
}

/**
 * T-048 : événements de correction à envoyer. Le jour même : heure_corrigee, plus heure_corrigee_arrivee et/ou
 * heure_corrigee_depart (heure_corrigee reste envoyé, pour comparer avec les semaines passées).
 * Après coup : heure_corrigee_apres_coup seul, sans détail. Aucune correction : rien.
 */
export function evCorrections(jour: string, aujourdhui: string, avant: Presence[] | undefined, apres: Presence[] | undefined): string[] {
  const d = heureCorrigeeDetail(avant, apres);
  if (!d.arrivee && !d.depart) return [];
  const ev = evCorrection(jour, aujourdhui);
  if (ev !== 'heure_corrigee') return [ev];
  return [ev, ...(d.arrivee ? ['heure_corrigee_arrivee'] : []), ...(d.depart ? ['heure_corrigee_depart'] : [])];
}
