// T-109 (comparateur, corrections 9 et 11) : durées maximales du travail de l'AM (CASF L423-21, L423-22 ; CCN 96.1).
import type { Contract } from './model';
import { dayInfo, weeklyMinutes, type Ctx } from './payroll';
import { addDays, addMonthsToDate, daysBetween, type ISODate } from './dates';

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

// ---------------------------------------------------------------------------------------------------------------------
// T-109 (correction 11) : contrôles à la saisie, alertes sans blocage. Tous les contrats notés dans l'app (CCN 96.1 :
// « tous contrats de travail confondus »).
// ---------------------------------------------------------------------------------------------------------------------
const hm = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

/**
 * Plages de travail d'un jour (minutes depuis minuit), CCN 99 : le travail commence à l'heure prévue ou à l'arrivée de l'enfant
 * si elle est avant, et finit à l'heure prévue ou au départ s'il est après. Jour d'absence, de congé ou férié chômé : aucune.
 */
export function plagesTravail(ctx: Ctx, d: ISODate): [number, number][] {
  const di = dayInfo(ctx, d);
  if (di.kind !== 'present' && di.kind !== 'prevu' && di.kind !== 'hors') return [];
  const out: [number, number][] = di.planned.map((p) => [hm(p.start), hm(p.end)]);
  for (const p of di.rec?.pres ?? []) {
    if (!p.a) continue;
    const a = hm(p.a), e = p.d ? hm(p.d) : a;
    const k = out.findIndex(([s, f]) => a <= f && e >= s);
    if (k >= 0) out[k] = [Math.min(out[k][0], a), Math.max(out[k][1], e)];
    else out.push([a, e]);
  }
  return di.kind === 'hors' && !(di.rec?.pres ?? []).some((p) => p.a) ? [] : out;
}

const debutJour = (ctxs: Ctx[], d: ISODate) => Math.min(...ctxs.flatMap((x) => plagesTravail(x, d).map((p) => p[0])), Infinity);
const finJour = (ctxs: Ctx[], d: ISODate) => Math.max(...ctxs.flatMap((x) => plagesTravail(x, d).map((p) => p[1])), -Infinity);

/** CASF L423-21 et CCN 96.1 : repos quotidien d'au moins 11 heures consécutives */
export const REPOS_QUOTIDIEN_MIN = 11 * 60;

/** Repos (minutes) entre la fin du travail de `d` et le début du travail du lendemain ; undefined sans travail l'un des jours */
export function reposApres(ctxs: Ctx[], d: ISODate): number | undefined {
  const f = finJour(ctxs, d), s = debutJour(ctxs, addDays(d, 1));
  if (!Number.isFinite(f) || !Number.isFinite(s)) return undefined;
  return 24 * 60 - f + s;
}

/**
 * T-116 (A3) : temps de travail de l'AM entre `a` et `b` inclus, tous contrats notés dans l'app. Le temps où elle accueille
 * plusieurs enfants en même temps ne compte qu'une fois : réunion des plages de travail de chaque jour (calculateur-arvela,
 * regles/t116-48h.md). Avant la T-116, les plages de chaque contrat s'additionnaient (trois enfants accueillis de 8 h à
 * 17 h comptaient 27 h pour une journée de 9 h).
 */
export function travailEntre(ctxs: Ctx[], a: ISODate, b: ISODate): number {
  let t = 0;
  for (let d = a; d <= b; d = addDays(d, 1)) t += dureeReunion(ctxs.flatMap((x) => plagesTravail(x, d)));
  return t;
}

/** Durée (minutes) de la réunion de plages [début, fin] : un temps couvert par plusieurs plages compte une fois. */
export function dureeReunion(plages: [number, number][]): number {
  const p = plages.filter(([s, f]) => f > s).sort((x, y) => x[0] - y[0]);
  let t = 0, cs = -Infinity, cf = -Infinity;
  for (const [s, f] of p) {
    if (s > cf) { if (cf > cs) t += cf - cs; cs = s; cf = f; } else if (f > cf) cf = f;
  }
  if (cf > cs) t += cf - cs;
  return t;
}

/**
 * Alertes du jour `d`, sans blocage : repos de moins de 11 h la veille ou le lendemain (CASF L423-21, CCN 96.1) ; plus de 48 h
 * par semaine en moyenne sur les quatre mois qui finissent ce jour-là (CASF L423-22, CCN 96.3), ou, avec l'accord écrit de
 * l'AM sur un contrat, plus de 2 250 h sur les douze mois (L423-22).
 */
export function alertesDurees(ctxs: Ctx[], d: ISODate): string[] {
  const out: string[] = [];
  const h = (m: number) => `${Math.floor(m / 60)} h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`;
  for (const [x, y] of [[addDays(d, -1), d], [d, addDays(d, 1)]] as const) {
    const r = reposApres(ctxs, x);
    if (r !== undefined && r < REPOS_QUOTIDIEN_MIN) out.push(`Repos de ${h(r)} seulement entre la fin du travail du ${x.slice(8, 10)}/${x.slice(5, 7)} et la reprise du ${y.slice(8, 10)}/${y.slice(5, 7)}, tous contrats notés dans l’app : la loi demande au moins 11 heures de suite (code de l’action sociale et des familles, article L423-21 ; convention, article 96.1).`);
  }
  const accord = ctxs.some((x) => x.c.accord48h);
  if (!accord) {
    const a = addDays(addMonthsToDate(d, -4), 1);
    const moy = (travailEntre(ctxs, a, d) * 7) / (daysBetween(a, d) + 1);
    if (moy > SEUIL_ACCORD_MIN) out.push(`En moyenne ${h(Math.round(moy))} de travail par semaine sur les quatre derniers mois, tous contrats notés dans l’app : sans ton accord écrit, la limite est 48 h (code de l’action sociale et des familles, article L423-22 ; convention, article 96.3).`);
  } else {
    const an = travailEntre(ctxs, addDays(addMonthsToDate(d, -12), 1), d) / 60;
    if (an > PLAFOND_ANNUEL_H) out.push(`${Math.round(an)} h de travail sur les douze derniers mois, tous contrats notés dans l’app : même avec ton accord écrit, la limite est ${PLAFOND_ANNUEL_H} h par an (code de l’action sociale et des familles, article L423-22).`);
  }
  return out;
}
