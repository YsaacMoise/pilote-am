// T-109 (comparateur, corrections 9 et 11) : durées maximales du travail de l'AM (CASF L423-21, L423-22 ; CCN 96.1).
import type { Contract } from './model';
import { weeklyMinutes } from './payroll';

/** CASF L423-22 : 48 h par semaine « en moyenne sur une période de quatre mois », sans l'accord de l'AM */
export const SEUIL_ACCORD_MIN = 48 * 60;
/** CASF L423-22 : avec l'accord, « dans la limite d'un plafond annuel de 2 250 heures » */
export const PLAFOND_ANNUEL_H = 2250;

/**
 * Durée hebdomadaire moyenne prévue au contrat (minutes) : planning type ; horaires variables : moyenne des semaines du cycle,
 * ou base du contrat (heures payées chaque mois × 12 ÷ 52) pour un planning remis chaque semaine. Accueil occasionnel :
 * `undefined` (pas de durée hebdomadaire au contrat).
 */
export function dureeMoyenneContrat(c: Contract): number | undefined {
  if (c.accueilOccasionnel) return undefined;
  if (c.planningVariable) {
    if (c.cycle?.length) return c.cycle.reduce((a, p) => a + weeklyMinutes(p), 0) / c.cycle.length;
    return c.heuresMensualisees ? (c.heuresMensualisees * 60 * 12) / 52 : undefined;
  }
  return weeklyMinutes(c.planning);
}

/** Semaines travaillées par an : 47 en année complète (5 semaines de congés), N en année incomplète */
export const semainesTravailleesAn = (c: Pick<Contract, 'yearType' | 'weeks'>): number => (c.yearType === 'complete' ? 47 : c.weeks);

export const MESSAGE_ACCORD_48H = 'Plus de 48 h par semaine en moyenne : il faut ton accord écrit (code de l’action sociale et des familles, article L423-22). Coche la case une fois cet accord signé.';

/** Erreurs du contrat sur les durées maximales (écran Contrat) */
export function erreursDureeContrat(c: Contract): string[] {
  const moy = dureeMoyenneContrat(c);
  if (moy === undefined) return [];
  const out: string[] = [];
  if (moy > SEUIL_ACCORD_MIN && !c.accord48h) out.push(MESSAGE_ACCORD_48H);
  // L423-22 : le plafond de 2 250 h encadre la moyenne sur douze mois permise par l'accord, au-delà de 48 h.
  const an = (moy * semainesTravailleesAn(c)) / 60;
  if (moy > SEUIL_ACCORD_MIN && an > PLAFOND_ANNUEL_H) out.push(`Ce planning fait ${Math.round(an)} h par an sur ${semainesTravailleesAn(c)} semaines travaillées : c’est plus que le plafond de ${PLAFOND_ANNUEL_H} h par an, même avec ton accord (code de l’action sociale et des familles, article L423-22).`);
  return out;
}
