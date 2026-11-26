// T-125 : règles de la demande d'ouverture de la copie scellée (fonctions pures, testées par tests/t125-cle-acces.test.ts).

/** Délai de sécurité entre la demande et l'ouverture : 72 heures. */
export const DELAI_MS = 72 * 3600 * 1000;
/** Une demande prête reste ouvrable 7 jours, puis il faut en refaire une. */
export const VALIDITE_MS = 7 * 24 * 3600 * 1000;

/** État d'une demande : aucune, en attente du délai, prête à ouvrir, expirée, déjà ouverte. */
export function etatDemande(d, maintenant, delai = DELAI_MS, validite = VALIDITE_MS) {
  if (!d || d.annulee) return 'aucune';
  if (d.ouverte) return 'ouverte';
  if (maintenant < d.pret) return 'attente';
  if (maintenant > d.pret + validite) return 'expiree';
  return 'prete';
}

/** Le contenu déchiffré par KMS appartient-il bien à ce compte et à ce coffre ? */
export function contenuValide(contenu, uid, coffre) {
  return !!contenu && contenu.u === uid && contenu.c === coffre && typeof contenu.s === 'string';
}
