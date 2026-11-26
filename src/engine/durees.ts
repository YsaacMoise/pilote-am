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

/** Employeur d'un contrat : la famille (des frères et sœurs accueillis ensemble ont le même employeur). */
const employeur = (x: Ctx) => x.c.family.trim().toLocaleLowerCase('fr');

/**
 * T-116 (A3) : limite de 48 h en moyenne sur quatre mois (CASF L423-22, CCN 96.3) et plafond de 2 250 h avec l'accord.
 * Règle : calculateur-arvela, regles/t116-48h.md. Le temps qui se chevauche compte une fois (QE AN n° 4964, JO 25/07/2023 ;
 * QE Sénat n° 8851, JO 16/05/2024 : « elle ne compte qu'une seule fois »). Aucun texte ne dit si la limite s'apprécie tous
 * employeurs ensemble ou employeur par employeur : un dépassement chez un même employeur est certain (alerte) ; un dépassement
 * qui n'existe qu'en réunissant tous les employeurs est dit comme une information, sans le présenter comme une infraction.
 */
function depassementsDurees(ctxs: Ctx[], d: ISODate): { certains: string[]; possibles: string[] } {
  const h = (m: number) => `${Math.floor(m / 60)} h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`;
  const certains: string[] = [], possibles: string[] = [];
  const familles = [...new Set(ctxs.map(employeur))];
  const a4 = addDays(addMonthsToDate(d, -4), 1), a12 = addDays(addMonthsToDate(d, -12), 1);
  const moy4 = (xs: Ctx[]) => (travailEntre(xs, a4, d) * 7) / (daysBetween(a4, d) + 1);
  const an = (xs: Ctx[]) => travailEntre(xs, a12, d) / 60;
  const parFamille = familles.map((f) => ctxs.filter((x) => employeur(x) === f));
  // L'accord écrit est donné à l'employeur qui le demande (CASF D423-12) : contrôle de chaque famille selon son accord.
  const aAccord = (xs: Ctx[]) => xs.some((x) => x.c.accord48h);
  for (const xs of parFamille) {
    if (!aAccord(xs) && moy4(xs) > SEUIL_ACCORD_MIN) certains.push(`En moyenne ${h(Math.round(moy4(xs)))} de travail par semaine sur les quatre derniers mois chez la famille ${xs[0].c.family.trim()} : sans ton accord écrit, la limite est 48 h (code de l’action sociale et des familles, article L423-22 ; convention, article 96.3).`);
    if (aAccord(xs) && an(xs) > PLAFOND_ANNUEL_H) certains.push(`${Math.round(an(xs))} h de travail sur les douze derniers mois chez la famille ${xs[0].c.family.trim()} : même avec ton accord écrit, la limite est ${PLAFOND_ANNUEL_H} h par an (code de l’action sociale et des familles, article L423-22).`);
  }
  if (!certains.length && familles.length > 1) {
    const accord = ctxs.some((x) => x.c.accord48h);
    const tous4 = moy4(ctxs), tousAn = an(ctxs);
    if (!accord && tous4 > SEUIL_ACCORD_MIN) possibles.push(`Tous parents réunis, ${h(Math.round(tous4))} de travail par semaine en moyenne sur les quatre derniers mois (le temps où plusieurs enfants sont là ensemble compte une fois). Aucune famille seule ne dépasse 48 h. Les textes ne disent pas si la limite se compte tous parents réunis : si tu dépasses, un accord écrit (article L423-22) te protège.`);
    if (accord && tousAn > PLAFOND_ANNUEL_H) possibles.push(`Tous parents réunis, ${Math.round(tousAn)} h de travail sur les douze derniers mois (le temps où plusieurs enfants sont là ensemble compte une fois). Aucune famille seule ne dépasse ${PLAFOND_ANNUEL_H} h. Les textes ne disent pas si ce plafond se compte tous parents réunis.`);
  }
  return { certains, possibles };
}

/** T-116 (A3) : informations sur la durée du travail (dépassement seulement tous parents réunis, sans texte qui tranche) */
export const informationsDurees = (ctxs: Ctx[], d: ISODate): string[] => depassementsDurees(ctxs, d).possibles;

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
  out.push(...depassementsDurees(ctxs, d).certains);
  return out;
}
