// T-104, cas 2 : accueil occasionnel (CCN 97.2). Règles : regles/t104-accueil-occasionnel.md (calculateur-arvela), qui reprend
// regles/t076-occasionnel.md (juriste T-076) et tranche ses points ouverts. Module sans dépendance au moteur de paie.
import { addDays, daysBetween, eachDay, shortDate, weekday, type ISODate } from './dates';
import type { AccueilOcc, Contract, Plage } from './model';

export const estOccasionnel = (c: Pick<Contract, 'accueilOccasionnel'>): boolean => c.accueilOccasionnel === true;

/** Période d'accueil qui contient le jour `d` */
export function accueilDu(c: Pick<Contract, 'accueils'>, d: ISODate): AccueilOcc | undefined {
  return (c.accueils ?? []).find((a) => d >= a.du && d <= a.au);
}

/**
 * Plages prévues du jour `d` : celles de la période d'accueil qui le contient (CCN 98.2 : conditions fixées au contrat ;
 * 90.1 : le contrat n'a pas à fixer semaines, jours et horaires). Hors période : aucun accueil prévu.
 */
export function plagesOccasionnel(c: Pick<Contract, 'accueils'>, d: ISODate): Plage[] {
  return accueilDu(c, d)?.planning[weekday(d)] ?? [];
}

/** Fin réelle d'une période d'accueil (la fin du contrat l'arrête) */
export function termeAccueil(c: Pick<Contract, 'end'>, a: AccueilOcc): ISODate {
  return c.end && c.end < a.au ? c.end : a.au;
}

/** Données du contrat qui manquent pour calculer (liste lisible ; vide = complet) */
export function manquesOccasionnel(c: Pick<Contract, 'accueilOccasionnel' | 'accueils' | 'start' | 'end'>): string[] {
  if (!estOccasionnel(c)) return [];
  const out: string[] = [];
  const ls = c.accueils ?? [];
  if (!ls.length) out.push('tes périodes d’accueil (dates et horaires prévus au contrat)');
  for (const a of ls) {
    if (!a.du || !a.au || a.au < a.du) out.push(`des dates justes pour l’accueil du ${a.du ? shortDate(a.du) : '…'}`);
    else if (a.du < c.start || (c.end && a.au > c.end)) out.push(`un accueil du ${shortDate(a.du)} au ${shortDate(a.au)} compris dans les dates du contrat`);
  }
  const tri = [...ls].filter((a) => a.du && a.au).sort((x, y) => (x.du < y.du ? -1 : 1));
  for (let i = 1; i < tri.length; i++) if (tri[i].du <= tri[i - 1].au) out.push(`des accueils qui ne se chevauchent pas (${shortDate(tri[i - 1].du)} et ${shortDate(tri[i].du)})`);
  return out;
}

export function messageOccasionnelACompleter(c: Pick<Contract, 'accueilOccasionnel' | 'accueils' | 'start' | 'end'>): string | undefined {
  const m = manquesOccasionnel(c);
  return m.length ? `Accueil occasionnel : contrat à compléter. Il manque ${m.join(' ; ')}. Ouvre le contrat pour les ajouter. L’app calcule ces mois dès que c’est fait.` : undefined;
}

/** Jour d'accueil noté hors de toute période d'accueil : l'app demande d'ajouter la période (donnée à saisir) */
export function messageHorsAccueil(d: ISODate): string {
  return `Accueil occasionnel : tu as noté un accueil le ${shortDate(d)}, en dehors des périodes d’accueil du contrat. Ajoute cette période dans le contrat (dates et horaires prévus) : l’app calcule ce mois dès que c’est fait.`;
}

/**
 * R-OCC-09 (nombre de jours de congés à déclarer) : Urssaf, « La gestion des congés payés » (15/09/2026), période partielle :
 * « Nombre de semaines de travail effectif × 2,5 jours de congés payés ÷ 4 semaines », arrondi au jour supérieur (CCN 48.1.1.2,
 * C. trav. L3141-7), 30 au plus (L3141-3). Semaines de la période d'accueil : jours calendaires ÷ 7.
 */
export function joursCPAccueil(du: ISODate, au: ISODate): number {
  const jours = daysBetween(du, au) + 1;
  return Math.min(30, Math.ceil((jours / 7) * 2.5 / 4 - 1e-9));
}

/** Périodes d'accueil qui finissent dans [from, to] (leur terme : fin de la période ou du contrat) */
export function accueilsFinissantEntre(c: Pick<Contract, 'accueils' | 'end'>, from: ISODate, to: ISODate): AccueilOcc[] {
  return (c.accueils ?? []).filter((a) => { const t = termeAccueil(c, a); return t >= from && t <= to && (!c.end || a.du <= c.end); });
}

/** Tous les jours d'une période d'accueil jusqu'à son terme */
export const joursAccueil = (c: Pick<Contract, 'end'>, a: AccueilOcc): ISODate[] => eachDay(a.du, termeAccueil(c, a));

export const MESSAGE_OCCASIONNEL_SALAIRE =
  'Accueil occasionnel : ton salaire n’est pas lissé. Tu es payée chaque mois pour tes heures d’accueil du mois (convention, articles 108.2 et 109.3 ; versement au moins une fois par mois : code de l’action sociale et des familles, article L423-19). Tes congés payés : 10 % des salaires de l’accueil, versés à la fin de chaque accueil (article 102.1.2.3).';

/** Lendemain du terme : date de début du mois suivant le versement (utile aux écrans) */
export const apresTerme = (c: Pick<Contract, 'end'>, a: AccueilOcc): ISODate => addDays(termeAccueil(c, a), 1);
