// Petites règles de français pour les textes de l'app.

/** « de Léo », « d’Adam », « d’Hugo » : élision devant une voyelle ou un h */
export function de(nom: string): string {
  return /^[aeiouyàâäéèêëîïôöùûüœæh]/i.test(nom.trim()) ? `d’${nom}` : `de ${nom}`;
}
