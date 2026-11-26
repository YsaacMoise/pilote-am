// T-118 : calendrier de suivi des congés payés (écran Congés), par contrat et tous contrats réunis, sur la période de
// référence (1er juin au 31 mai). Aucun calcul nouveau : les compteurs viennent de `compteur`, `acquisition`,
// `acquisFinDeMois` et `cpPrisEntre`, les mêmes fonctions que la paie (conges.ts).
import { addDays, cpPeriod, cpPeriodStartYear, eachDay, firstDay, lastDay, weekday, type ISODate, type Month } from './dates';
import { acquisFinDeMois, compteur, cpDemandesEntre, cpPrisEntre, type AcquisMois, type Compteur } from './conges';
import { ferieDe, regionDe } from './regions';
import type { AmLeave } from './model';
import type { Ctx } from './payroll';

export interface CompteursCP {
  /** Période d'acquisition en cours : du 1er juin `y` au 31 mai `y + 1` ; les droits de la précédente se prennent pendant elle */
  y: number;
  k: Compteur;
  /** Droits à prendre (période précédente, ou solde de départ) ; undefined s'ils ne sont pas calculés */
  droits?: number;
  /** Jours ouvrables de congés pris du début du décompte à aujourd'hui ; undefined si un décompte est à confirmer */
  pris?: number;
  /** Jours ouvrables de congés posés après aujourd'hui, jusqu'au 31 mai ; undefined si un décompte est à confirmer */
  poses?: number;
  /** Reste à poser : droits − pris − posés (peut être négatif : prise au-delà des droits) */
  reste?: number;
  /** Dernier jour de la période de prise suivie par l'app */
  dateLimite: ISODate;
  /** Acquis de la période en cours, mois par mois ; vide si les jours acquis ne sont pas calculés */
  mois: AcquisMois[];
}

export function compteursCP(ctx: Ctx, t: ISODate, enfants = 0): CompteursCP {
  const y = cpPeriodStartYear(t);
  const p = cpPeriod(y);
  const k = compteur(ctx, t, enfants);
  const droits = k.aPrendreAConfirmer ? undefined : k.aPrendre;
  const apres = addDays(t, 1);
  const posesAConfirmer = apres <= p.to && cpDemandesEntre(ctx, apres, p.to).length > 0;
  const pris = k.decompteAConfirmer.length ? undefined : k.pris;
  const poses = posesAConfirmer || apres > p.to ? (apres > p.to ? 0 : undefined) : cpPrisEntre(ctx, apres, p.to).length;
  const reste = droits !== undefined && pris !== undefined && poses !== undefined ? droits - pris - poses : undefined;
  return { y, k, droits, pris, poses, reste, dateLimite: p.to, mois: k.enCours.aConfirmer ? [] : acquisFinDeMois(ctx, y) };
}

export type JourCalendrier = 'pris' | 'pose' | 'ferie' | 'dimanche' | 'normal';

/**
 * Jours du mois `m` pour le calendrier « tous contrats » : un jour de congé payé décompté (jours ouvrables du premier jour
 * qui aurait été travaillé à la veille de la reprise, CCN 48.1.1.3 : le samedi compris) est « pris » s'il est passé ou
 * aujourd'hui, « posé » s'il est à venir. Relecture T-118 (M4) : les jours décomptés viennent du décompte de la paie
 * (`cpPrisEntre`, réunion des contrats), comme les compteurs ; sans contrat, les dates saisies du congé.
 */
export function joursCalendrier(m: Month, leaves: AmLeave[], t: ISODate, ctxRegion?: Parameters<typeof ferieDe>[0], ctxs: Ctx[] = []): { d: ISODate; type: JourCalendrier; ferie?: string }[] {
  const region = ctxRegion ?? 'metropole';
  const decomptes = new Set(ctxs.flatMap((x) => cpPrisEntre(x, firstDay(m), lastDay(m))));
  return eachDay(firstDay(m), lastDay(m)).map((d) => {
    const ferie = ferieDe(region, d);
    const cp = ctxs.length ? decomptes.has(d) : leaves.some((l) => l.type === 'cp' && l.from <= d && l.to >= d);
    if (weekday(d) === 7) return { d, type: 'dimanche' as const };
    if (ferie) return { d, type: 'ferie' as const, ferie };
    if (cp) return { d, type: d <= t ? ('pris' as const) : ('pose' as const) };
    return { d, type: 'normal' as const };
  });
}

export { regionDe };
