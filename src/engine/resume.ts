// T-118 : carte « Ton mois » de l'écran Mois. D'abord le travail du mois (jours, heures, absences, état de la déclaration) ;
// le montant ne s'affiche qu'au geste de l'AM (« Voir ma paie du mois »). Rien de nouveau n'est calculé ici : les jours
// viennent de dayInfo, comme la liste « Ce qui a changé ce mois-ci ».
import { addMonths, eachDay, firstDay, lastDay, type ISODate, type Month } from './dates';
import { AM_ABS_LABEL, type AmAbs, type ChildAbs } from './model';
import { dayInfo, inContract, type Ctx } from './payroll';
import type { MonthResult } from './month';
import { euros } from './money';

export interface ResumeTravail {
  /** Jours d'accueil faits (présence de l'enfant), jusqu'à aujourd'hui pour le mois en cours */
  jours: number;
  /** Minutes de travail de ces jours : heures prévues plus le temps en plus (CCN 99), présence hors planning */
  minutes: number;
  /** Minutes en plus du planning */
  extraMin: number;
  /** Absences de l'enfant : jours par motif, et jours retenus sur le salaire */
  enfant: { abs: ChildAbs; jours: number; retenus: number }[];
  /** Absences de l'AM qui tombent sur un jour d'accueil prévu, par type */
  am: { type: AmAbs; jours: number }[];
  /** Fériés qui tombent sur un jour d'accueil prévu (nom du férié) */
  feries: string[];
  /** Jours comptés jusqu'à cette date (mois en cours) */
  jusquau: ISODate;
}

export function resumeTravail(ctx: Ctx, m: Month): ResumeTravail {
  const fin = lastDay(m) < ctx.today ? lastDay(m) : ctx.today;
  const out: ResumeTravail = { jours: 0, minutes: 0, extraMin: 0, enfant: [], am: [], feries: [], jusquau: fin };
  const enfant = new Map<ChildAbs, { jours: number; retenus: number }>();
  const am = new Map<AmAbs, number>();
  if (fin < firstDay(m)) return out;
  for (const d of eachDay(firstDay(m), fin)) {
    if (!inContract(ctx.c, d)) continue;
    const di = dayInfo(ctx, d);
    if ((di.kind === 'present' || di.kind === 'prevu') && di.presentMin > 0) {
      out.jours++;
      out.minutes += di.plannedMin > 0 ? di.plannedMin + di.extraMin : di.presentMin;
      out.extraMin += di.extraMin;
    } else if (di.kind === 'absent' && di.rec?.abs) {
      const e = enfant.get(di.rec.abs) ?? { jours: 0, retenus: 0 };
      e.jours++;
      if (di.deducted) e.retenus++;
      enfant.set(di.rec.abs, e);
    } else if (di.kind === 'am' && di.amLeave && di.plannedMin > 0) {
      am.set(di.amLeave, (am.get(di.amLeave) ?? 0) + 1);
    } else if (di.kind === 'ferie' && di.ferie && di.plannedMin > 0) {
      out.feries.push(di.ferie);
    }
  }
  out.enfant = [...enfant].map(([abs, v]) => ({ abs, ...v }));
  out.am = [...am].map(([type, jours]) => ({ type, jours }));
  return out;
}

const s = (n: number) => (n > 1 ? 's' : '');

/** Absence de l'AM, dite comme sur un bulletin (vocabulaire du métier), sans « je » ni « mes » */
const ABSENCE_AM: Partial<Record<AmAbs, string>> = {
  cp: 'congés payés',
  am_malade: 'arrêt maladie',
  am_enfant_malade: 'absence pour enfant malade',
  evenement: 'congé pour événement familial',
  sans_solde: 'congé sans solde',
  formation: 'formation obligatoire',
  remuneree: 'absence payée',
};

/** Absence de l'enfant, dite en une phrase courte */
const ABSENCE_ENFANT: Record<ChildAbs, string> = {
  malade_certif: 'enfant malade avec certificat',
  malade: 'enfant malade sans certificat',
  parents: 'enfant absent à la demande des parents',
  sans_solde_enfant: 'enfant absent, noté « sans solde »',
};

/** Lignes de la carte, en français simple (« 1 jour malade avec certificat, retenu ») */
export function lignesResume(r: ResumeTravail): string[] {
  const out: string[] = [];
  if (r.extraMin > 0) out.push(`+ ${dureeTexte(r.extraMin)} en plus du planning`);
  for (const e of r.enfant) {
    const effet = e.retenus === e.jours ? 'retenu' + s(e.jours) : e.retenus ? `dont ${e.retenus} retenu${s(e.retenus)}` : 'payé' + s(e.jours);
    out.push(`${e.jours} jour${s(e.jours)} : ${ABSENCE_ENFANT[e.abs]}, ${effet}`);
  }
  for (const a of r.am) out.push(`${a.jours} jour${s(a.jours)} : ${ABSENCE_AM[a.type] ?? AM_ABS_LABEL[a.type].replace(/^./, (x) => x.toLowerCase())}`);
  if (r.feries.length) out.push(`${r.feries.length} jour${s(r.feries.length)} férié${s(r.feries.length)} (${r.feries.join(', ')})`);
  return out;
}

/** « 142 h 30 », « 42 min » */
export function dureeTexte(min: number): string {
  const h = Math.floor(min / 60), mm = Math.round(min % 60);
  if (!h) return `${mm} min`;
  return mm ? `${h} h ${String(mm).padStart(2, '0')}` : `${h} h`;
}

/**
 * État de la déclaration Pajemploi du mois `m` au jour `t`, d'après les dates seulement : la déclaration se fait par le
 * parent entre le 25 du mois et le 5 du mois suivant (écran Mois). L'app ne sait pas si elle a été faite.
 */
export function etatDeclaration(m: Month, t: ISODate): string {
  const d25 = `${m}-25`, d5 = `${addMonths(m, 1)}-05`;
  const jj = (d: ISODate) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  if (t < firstDay(m)) return '';
  if (t < lastDay(m)) return `Mois en cours, compté jusqu’au ${jj(t)}. Déclaration par le parent du ${jj(d25)} au ${jj(d5)}`;
  if (t <= d5) return `À déclarer par le parent jusqu’au ${jj(d5)}`;
  return `Période de déclaration terminée le ${jj(d5)}`;
}

/**
 * T-118 (ajout du DG du 26/11) : montant final attendu d'un mois en cours, si les jours restants se passent comme prévu.
 * `fin` : le même mois calculé au dernier jour du mois. Seuls l'entretien et les repas changent (payés par jour d'accueil,
 * CCN 114.1 et 114.2) ; le salaire mensualisé est fixe. Undefined si le mois ne se calcule pas au dernier jour.
 */
export function montantFinDeMois(total: number, r: MonthResult, fin: MonthResult): number | undefined {
  if (fin.nonGere.length) return undefined;
  return total + Math.max(0, fin.entretien - r.entretien) + Math.max(0, fin.repas - r.repas);
}

/** Mention neutre du mois en cours (sans couleur d'alerte) */
export function texteMoisEnCours(m: Month, finAttendue?: number): string {
  const fin = lastDay(m);
  const jj = `${fin.slice(8, 10)}/${fin.slice(5, 7)}`;
  return `Montant provisoire : l’entretien et les repas s’ajoutent jour après jour, jusqu’au ${jj}.${finAttendue !== undefined ? ` Si les jours restants se passent comme prévu : ${euros(finAttendue)} au ${jj}.` : ''}`;
}
