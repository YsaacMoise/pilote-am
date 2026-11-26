// T-115 (R1) : bande des jours de l'écran « Aujourd'hui ». Sept jours visibles, flèches d'une semaine à l'autre.
// Passé : jusqu'au début du plus ancien contrat. Futur : jusqu'à la fin du mois suivant (poser une absence prévue).
// Logique pure, sans écran, pour être testée seule.
import { addDays, addMonths, lastDay, monthOf, MOIS_NOMS, today, type ISODate } from '../engine/dates';

export interface Bornes { debut: ISODate; fin: ISODate }

/** Jours atteignables : du début du plus ancien contrat (ou d'il y a 5 jours, comme avant) à la fin du mois suivant. */
export function bornesBande(debutsContrats: ISODate[], t: ISODate): Bornes {
  const cinqJours = addDays(t, -5);
  const plusAncien = debutsContrats.reduce((m, d) => (d < m ? d : m), cinqJours);
  return { debut: plusAncien, fin: lastDay(addMonths(monthOf(t), 1)) };
}

/** Dernier jour de la bande par défaut : la bande d'avant (de J-5 à J+1). */
export function finParDefaut(t: ISODate): ISODate {
  return addDays(t, 1);
}

/** Dernier jour d'une bande qui montre le jour d. Garde la bande actuelle si d y est déjà. */
export function finPourJour(d: ISODate, finActuelle: ISODate, t: ISODate): ISODate {
  if (d >= addDays(finActuelle, -6) && d <= finActuelle) return finActuelle;
  if (d >= addDays(t, -5) && d <= addDays(t, 1)) return finParDefaut(t);
  return addDays(d, 3);
}

/** Recule (sens = -1) ou avance (sens = 1) d'une semaine. Le jour choisi suit la bande, dans les bornes. */
export function decaler(fin: ISODate, jour: ISODate, sens: 1 | -1, b: Bornes): { fin: ISODate; jour: ISODate } | null {
  if (sens === -1 && !peutReculer(fin, b)) return null;
  if (sens === 1 && !peutAvancer(fin, b)) return null;
  const f = addDays(fin, 7 * sens);
  let j = addDays(jour, 7 * sens);
  if (j < addDays(f, -6)) j = addDays(f, -6);
  if (j > f) j = f;
  if (j < b.debut) j = b.debut;
  if (j > b.fin) j = b.fin;
  return { fin: f, jour: j };
}

export const peutReculer = (fin: ISODate, b: Bornes) => addDays(fin, -6) > b.debut;
export const peutAvancer = (fin: ISODate, b: Bornes) => fin < b.fin;

/** Les sept jours de la bande, du plus ancien au plus récent. */
export const joursBande = (fin: ISODate): ISODate[] => Array.from({ length: 7 }, (_, i) => addDays(fin, i - 6));

/** « du 20 au 26 novembre », « du 30 novembre au 6 décembre », avec l'année si elle n'est pas l'année en cours. */
export function libelleBande(jours: ISODate[], t: ISODate = today()): string {
  const a = jours[0], b = jours[jours.length - 1];
  const j = (d: ISODate) => (Number(d.slice(8)) === 1 ? '1er' : String(Number(d.slice(8))));
  const m = (d: ISODate) => MOIS_NOMS[Number(d.slice(5, 7)) - 1];
  const an = (d: ISODate) => (d.slice(0, 4) !== t.slice(0, 4) ? ' ' + d.slice(0, 4) : '');
  if (a.slice(0, 7) === b.slice(0, 7)) return `du ${j(a)} au ${j(b)} ${m(b)}${an(b)}`;
  if (a.slice(0, 4) === b.slice(0, 4)) return `du ${j(a)} ${m(a)} au ${j(b)} ${m(b)}${an(b)}`;
  return `du ${j(a)} ${m(a)} ${a.slice(0, 4)} au ${j(b)} ${m(b)} ${b.slice(0, 4)}`;
}
