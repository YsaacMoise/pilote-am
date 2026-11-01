// Règle des mots de passe (recommandation CNIL n° 2022-100, cas avec restriction d'accès au compte) :
// 8 caractères au moins et 3 types sur 4 (minuscules, majuscules, chiffres, caractères spéciaux).
// La restriction d'accès est assurée par le service de comptes (essais bloqués après trop d'échecs).

export const MIN_PASSWORD = 8;
export const MIN_TYPES = 3;

export interface PasswordChecks {
  longueur: boolean;
  minuscule: boolean;
  majuscule: boolean;
  chiffre: boolean;
  special: boolean;
  /** Nombre de types présents, sur 4 */
  types: number;
  ok: boolean;
}

export function passwordChecks(pw: string): PasswordChecks {
  const minuscule = /\p{Ll}/u.test(pw);
  const majuscule = /\p{Lu}/u.test(pw);
  const chiffre = /\p{Nd}/u.test(pw);
  // Tout ce qui n'est ni une lettre ni un chiffre : ponctuation, symboles, espace…
  const special = /[^\p{L}\p{Nd}]/u.test(pw);
  const types = [minuscule, majuscule, chiffre, special].filter(Boolean).length;
  const longueur = [...pw].length >= MIN_PASSWORD;
  return { longueur, minuscule, majuscule, chiffre, special, types, ok: longueur && types >= MIN_TYPES };
}

export const PASSWORD_RULE = 'Le mot de passe doit faire au moins 8 caractères et mélanger 3 types sur 4 : minuscules, majuscules, chiffres, caractères spéciaux.';
