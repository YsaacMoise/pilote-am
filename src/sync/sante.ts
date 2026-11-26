// T-121 (consignes/t118-t121.md, partie T-121 ; audit T-110, « Hors listes ») : les données de santé qu'aucun texte du travail
// n'exige pour la paie restent sur le téléphone de l'AM. Elles ne partent ni dans le compte en ligne, ni dans le lien des
// parents (la clé du lien est gardée dans le compte : le lien n'est pas chiffré de bout en bout au sens strict).
// Une donnée qui permet de déduire une donnée de santé est de santé (RGPD art. 4.15 et 9 ; CJUE C-184/20, 1er août 2022).
// Fonctions pures, testées (tests/t121-sante.test.ts).

/**
 * Notes du carnet qui touchent à la santé de l'enfant : tout le genre « Soin » (température, médicament, lavage de nez, crème,
 * plaie, chute, bosse, morsure, vomissement, saignement de nez : Carnet.tsx), toute note avec une température, et le choix
 * « Selles liquides » du change (symptôme digestif).
 */
const DEBUTS_SANTE = ['Selles liquides'];

export function estNoteSante(j: unknown): boolean {
  if (!j || typeof j !== 'object') return false;
  const e = j as { kind?: unknown; temp?: unknown; detail?: unknown };
  if (e.kind === 'soin') return true;
  if (e.temp !== undefined && e.temp !== null) return true;
  return typeof e.detail === 'string' && DEBUTS_SANTE.some((d) => (e.detail as string).startsWith(d));
}

/** Vrai si l'enregistrement entier reste sur le téléphone : il n'est jamais envoyé au compte en ligne. */
export function resteSurTelephone(s: string, value: unknown): boolean {
  return s === 'journal' && estNoteSante(value);
}

/** Champs de santé d'un contrat gardés sur le téléphone : la case « Enfant en situation de handicap ou de maladie ». */
export const CHAMPS_SANTE_CONTRAT = ['majoreFiscal'] as const;

function objet(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Vrai si cette version d'un contrat porte un champ de santé. */
export function contratAvecSante(v: unknown): boolean {
  return objet(v) && CHAMPS_SANTE_CONTRAT.some((f) => f in v);
}

/** Forme en ligne d'un contrat : sans ses champs de santé. Rend le même objet s'il n'en a pas. */
export function contratSansSante<T>(v: T): T {
  if (!contratAvecSante(v)) return v;
  const out = { ...(v as Record<string, unknown>) };
  for (const f of CHAMPS_SANTE_CONTRAT) delete out[f];
  return out as T;
}

/**
 * Version reçue du compte (forme en ligne, sans champ de santé) rangée sur le téléphone : les champs de santé du téléphone
 * sont gardés. Sans copie sur le téléphone, ceux de la version brute reçue (ancienne donnée en ligne) sont repris : ils
 * arrivent ainsi sur le téléphone avant d'être retirés du compte.
 */
export function avecSanteLocale(s: string, recu: unknown, local: unknown, brut?: unknown): unknown {
  if (s !== 'contracts' || !objet(recu)) return recu;
  let out: Record<string, unknown> | null = null;
  for (const f of CHAMPS_SANTE_CONTRAT) {
    const src = objet(local) && f in local ? local : objet(brut) && f in brut ? brut : null;
    if (!src) continue;
    out ??= { ...recu };
    out[f] = src[f];
  }
  return out ?? recu;
}

/** Vrai si un document en ligne contient une donnée de santé à retirer. */
export function santeEnLigne(s: string, v: unknown): boolean {
  if (s === 'journal') return estNoteSante(v);
  if (s === 'contracts') return contratAvecSante(v);
  return false;
}
