// T-076 : contrat régulier dont les horaires changent d'une semaine à l'autre (planning variable).
// Spécification : regles/t076-decisions-direction.md, section 1. Règles : regles/t076-planning-variable.md (R-PV, P-PV).
// Ce module ne dépend que du modèle et des dates (pas de payroll.ts) : payroll.ts, conges.ts et nonGeres.ts s'en servent.
import { daysBetween, eachDay, minutes, mondayOf, shortDate, weekday, type ISODate } from './dates';
import type { Contract, Plage, Planning } from './model';

const H45 = 45 * 60;
const minPlage = (p: Plage) => Math.max(0, minutes(p.end) - minutes(p.start));

/** Minutes d'un planning d'une semaine */
export function minutesPlanning(pl: Planning | undefined): number {
  let t = 0;
  if (!pl) return 0;
  for (let d = 1; d <= 7; d++) for (const p of pl[d] ?? []) t += minPlage(p);
  return t;
}

/** Forme du planning variable : cycle écrit au contrat (S1) ou planning remis (S2) */
export function formePV(c: Pick<Contract, 'pvForme' | 'cycle' | 'planningsSemaines'>): 'cycle' | 'remis' | undefined {
  if (c.pvForme) return c.pvForme;
  if (c.cycle?.length) return 'cycle';
  if (c.planningsSemaines) return 'remis';
  return undefined;
}

type ChampsPV = Pick<Contract, 'planningVariable' | 'pvForme' | 'cycle' | 'cycleAncre' | 'planningsSemaines' | 'heuresMensualisees'>;

/** Données du planning variable qui manquent pour calculer (liste lisible ; vide = données complètes) */
export function manquesPV(c: ChampsPV): string[] {
  if (!c.planningVariable) return [];
  const out: string[] = [];
  const f = formePV(c);
  if (!f) out.push('la façon dont tes horaires changent (cycle écrit au contrat, ou planning remis par les parents)');
  if (f === 'cycle') {
    const n = c.cycle?.length ?? 0;
    if (n < 2 || n > 4) out.push('les semaines de ton cycle (2 à 4 semaines types)');
    else if (!c.cycle!.some((p) => minutesPlanning(p) > 0)) out.push('les horaires des semaines de ton cycle');
    if (!c.cycleAncre || !/^\d{4}-\d{2}-\d{2}$/.test(c.cycleAncre)) out.push('la date d’une semaine qui suit la première semaine du cycle');
  }
  if (!(typeof c.heuresMensualisees === 'number' && c.heuresMensualisees > 0)) out.push('les heures payées chaque mois, écrites dans ton contrat');
  return out;
}

/** Planning variable calculé par le moteur (données complètes) */
export function pvActif(c: ChampsPV): boolean {
  return !!c.planningVariable && manquesPV(c).length === 0;
}

/** Rang (0, 1…) de la semaine type du cycle pour la semaine du lundi donné (P-PV-4, lecture Q1 : le cycle suit le calendrier) */
export function rangCycle(c: Pick<Contract, 'cycle' | 'cycleAncre'>, lundi: ISODate): number {
  const n = c.cycle!.length;
  const k = Math.round(daysBetween(mondayOf(c.cycleAncre!), mondayOf(lundi)) / 7);
  return ((k % n) + n) % n;
}

/** Planning de la semaine qui commence le lundi donné (planning variable seulement). `undefined` : S2, planning non saisi. */
export function planningSemainePV(c: ChampsPV, lundi: ISODate): Planning | undefined {
  const l = mondayOf(lundi);
  if (formePV(c) === 'cycle') return c.cycle![rangCycle(c, l)];
  return c.planningsSemaines?.[l];
}

/**
 * Seule fonction qui donne les plages prévues d'un jour au planning du contrat, sans tenir compte des semaines sans accueil,
 * des absences ni des fériés. Contrat fixe : semaine type (`planning`). Planning variable : semaine type du cycle (S1) ou
 * planning de la semaine (S2) ; le champ `planning` n'est plus lu (spécification, section 1).
 */
export function plagesDuJour(t: Contract, d: ISODate): Plage[] {
  let pl = pvActif(t) ? planningSemainePV(t, mondayOf(d)) : t.planning;
  // D6 : planning remis, année incomplète, semaine sans accueil (du contrat ou saisie « sans accueil ») : traitée comme la
  // semaine sans accueil d'un planning fixe, qui compte au diviseur de l'art. 111 avec la semaine type (règle existante,
  // A-19). La semaine type est ici le planning indicatif du contrat (`planning`). Elle n'est jamais accueillie
  // (plannedPlages la vide, toutesSemainesSansAccueil).
  if (pvActif(t) && formePV(t) === 'remis' && t.yearType === 'incomplete' && minutesPlanning(pl) === 0
    && (t.weeksOff.includes(mondayOf(d)) || pl !== undefined)) pl = t.planning;
  return (pl?.[weekday(d)] ?? []).filter((p) => minPlage(p) > 0);
}

export function semainesParAn(c: Pick<Contract, 'yearType' | 'weeks'>): number {
  return c.yearType === 'complete' ? 52 : Math.min(46, c.weeks);
}

/** Minutes payées chaque mois : heures mensualisées du contrat (R-PV-03, règle commune) */
export function mensuelMinutesPV(c: Contract): number {
  return (c.heuresMensualisees ?? 0) * 60;
}

/**
 * Total prévu ÷ 12, en minutes (spécification, section 1, « Calcul ») : S1, moyenne des semaines du cycle × 52 (ou N) ÷ 12 ;
 * S2, la moyenne écrite au contrat (heures mensualisées × 12 ÷ N, donc le total ÷ 12 vaut les heures mensualisées).
 */
export function totalPrevuMensuelMin(c: Contract): number {
  if (formePV(c) === 'cycle') {
    const cy = c.cycle!;
    return (cy.reduce((s, p) => s + minutesPlanning(p), 0) / cy.length) * semainesParAn(c) / 12;
  }
  return mensuelMinutesPV(c);
}

/** Lecture des heures complémentaires (R-PV-04) : L1 (base = semaine prévue) ou L2 (base hebdomadaire du contrat) */
export function lecturePV(c: Contract): 'L1' | 'L2' {
  return mensuelMinutesPV(c) >= totalPrevuMensuelMin(c) - 1 ? 'L1' : 'L2';
}

/** L2 : base hebdomadaire B = heures mensualisées × 12 ÷ (52 ou N), en minutes */
export function baseHebdoMin(c: Contract): number {
  return (mensuelMinutesPV(c) * 12) / semainesParAn(c);
}

const fmtH = (min: number) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
};

/** Message à l'AM : la base est celle de son contrat (spécification, section 1, R-PV-04) */
export function messageBasePV(c: Contract): string {
  const hm = fmtH(mensuelMinutesPV(c));
  if (lecturePV(c) === 'L1') {
    return `Horaires variables : ton salaire suit les ${hm} payées chaque mois écrites dans ton contrat. Une semaine plus courte ne réduit pas ton salaire. Les heures complémentaires se comptent semaine par semaine, au-delà des heures prévues pour la semaine.`;
  }
  return `Horaires variables : ton salaire suit les ${hm} payées chaque mois écrites dans ton contrat, soit une base de ${fmtH(baseHebdoMin(c))} par semaine. Les heures prévues ou faites au-delà de cette base, jusqu’à 45 h, sont payées en heures complémentaires, avec le mois du jour où elles tombent (convention, article 96.4 : au-delà de la durée de travail hebdomadaire prévue au contrat).`;
}

export const NON_GERE_PV_AVENANT =
  'Avenant qui change les horaires, le type d’année ou le nombre de semaines d’un contrat aux horaires variables : non géré. L’app ne sait pas encore changer un cycle ou les heures payées chaque mois en cours de contrat. Fais la paie sans l’app à partir de cet avenant.';

/** Refus du contrat entier (données complètes) : cas du planning variable que l'app ne calcule pas au passage 1 */
export function nonGeresContratPV(c: Contract): string[] {
  if (!pvActif(c)) return [];
  const out: string[] = [];
  if (formePV(c) === 'cycle') {
    const longues = c.cycle!.map((p, i) => ({ i, m: minutesPlanning(p) })).filter((x) => x.m > H45);
    if (longues.length) out.push(messageSemaine45(longues.map((x) => `semaine ${x.i + 1} du cycle, ${fmtH(x.m)}`), 'Fais la paie sans l’app.'));
  }
  if (mensuelMinutesPV(c) * 12 / semainesParAn(c) > H45 + 1e-9) {
    out.push('Heures payées chaque mois au-delà de 45 h par semaine en moyenne : non géré. La convention ne dit pas comment majorer ces heures dans le salaire mensualisé. Fais la paie sans l’app.');
  }
  if ((c.avenants ?? []).some((a) => a.changes.planning !== undefined || a.changes.yearType !== undefined || a.changes.weeks !== undefined || a.changes.weeksOff !== undefined)) {
    out.push(NON_GERE_PV_AVENANT);
  }
  return out;
}

function messageSemaine45(quoi: string[], fin = 'Fais ces mois sans l’app.'): string {
  return `Semaine prévue au-delà de 45 h (${quoi.join(' ; ')}) : non géré pour l’instant. L’app ne sait pas encore mettre la majoration de ces heures dans le salaire mensualisé quand les horaires changent d’une semaine à l’autre (convention, articles 108.1 et 110.1). ${fin}`;
}

/**
 * Refus d'une période [from, to] (déjà limitée au contrat et au suivi) : S2, semaine sans planning saisi, ou semaine
 * prévue au-delà de 45 h. Le reste du contrat est calculé.
 */
export function nonGeresPeriodePV(c: Contract, from: ISODate, to: ISODate): string[] {
  if (!pvActif(c) || formePV(c) !== 'remis' || to < from) return [];
  const lundis = [...new Set(eachDay(from, to).map(mondayOf))];
  const out: string[] = [];
  // D6 : une semaine sans accueil du contrat (année incomplète) se traite comme pour un planning fixe : pas de planning à saisir.
  const off = new Set<ISODate>(c.yearType === 'incomplete' ? c.weeksOff : []);
  const manquants = lundis.filter((l) => !c.planningsSemaines?.[l] && !off.has(l));
  if (manquants.length) {
    out.push(`Planning ${manquants.length > 1 ? 'des semaines du' : 'de la semaine du'} ${manquants.map(shortDate).join(', du ')} non saisi : l’app ne calcule pas ce mois sans lui. Ouvre le contrat et saisis le planning remis par les parents pour ${manquants.length > 1 ? 'ces semaines' : 'cette semaine'}, ou « sans accueil ». Une semaine de congé ou d’absence a aussi son planning.`);
  }
  const longues = lundis.filter((l) => minutesPlanning(c.planningsSemaines?.[l]) > H45);
  if (longues.length) out.push(messageSemaine45(longues.map((l) => `semaine du ${shortDate(l)}, ${fmtH(minutesPlanning(c.planningsSemaines![l]))}`)));
  return out;
}

/** Message des données manquantes (contrat à compléter) */
export function messagePVACompleter(c: ChampsPV): string | undefined {
  const m = manquesPV(c);
  if (!m.length) return undefined;
  return `Horaires qui changent d’une semaine à l’autre (semaines A et B, planning remis) : contrat à compléter. Il manque ${m.join(' ; ')}. Ouvre le contrat pour les ajouter. L’app ne calcule pas ce contrat avant.`;
}
