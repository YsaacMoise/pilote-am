// Affichage et saisie des montants (centimes entiers) et des durées (minutes).

const nf = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function euros(c: number): string {
  return `${nf.format(c / 100)}\u00a0€`.replace(/ /g, ' ');
}

/**
 * T-041 (R-2) : montant de barème cité dans un texte, sans « ,00 » pour un montant rond (« 875 € »), avec jusqu'à
 * 3 décimales pour un taux horaire (« 0,435 € »). Centimes, éventuellement non entiers.
 */
export function eurosTexte(c: number): string {
  const e = c / 100;
  const f = Number.isInteger(Math.round(e * 1000) / 1000) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 3 };
  return `${new Intl.NumberFormat('fr-FR', f).format(e)}\u00a0€`.replace(/\u202f/g, '\u00a0');
}

/** "3,28" / "3.28" / "3 €" → 328 ; null si illisible */
export function parseEuros(s: string): number | null {
  const t = s.replace(/[€\s  ]/g, '').replace(',', '.');
  if (!t) return null;
  if (!/^-?\d+(\.\d{0,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

export function centsToInput(c: number): string {
  return (c / 100).toFixed(2).replace('.', ',');
}

export function hoursLabel(min: number): string {
  if (!min) return '0 h';
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

export function hoursDecimal(min: number): string {
  return (Math.round((min / 60) * 100) / 100).toString().replace('.', ',');
}
