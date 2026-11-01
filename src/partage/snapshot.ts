// Ce que voient les parents par le lien privé : un instantané préparé sur le téléphone de l'AM,
// chiffré avant de partir (voir crypto.ts). Fonction pure, testée.
// Rien sur la famille elle-même (ni nom, ni revenus) : le prénom de l'enfant, celui de l'AM,
// les présences, le carnet et les montants du mois.
import { addDays, monthOf, addMonths, type ISODate, type Month } from '../engine/dates';
import { dayInfo, inContract, type Ctx } from '../engine/payroll';
import { computeMonth, declarationLines } from '../engine/month';
import { CHILD_ABS_LABEL, type Journal, type Plage, type Presence } from '../engine/model';

export const SNAPSHOT_VERSION = 1;
/** Jours de carnet et de présences envoyés (aujourd'hui compris) */
export const JOURS_VISIBLES = 7;

export type StatutJour = 'hors' | 'attendu' | 'present' | 'parti' | 'absent' | 'am' | 'ferie' | 'prevu';

export interface JourParent {
  date: ISODate;
  statut: StatutJour;
  /** Arrivées et départs pointés */
  pres: Presence[];
  /** Plages prévues au planning */
  prevu: Plage[];
  /** Minutes de présence (pointées, ou prévues si rien n'est pointé) */
  minutes: number;
  /** Absence de l'enfant, congé de l'AM, jour férié : libellé pour les parents */
  motif?: string;
}

export interface EntreeCarnet { date: ISODate; time: string; kind: Journal['kind']; detail: string }

export interface LigneDecl { label: string; value: string; hint?: string }

export interface MoisParent {
  month: Month;
  /** Mois terminé (sinon : en cours, provisoire) */
  termine: boolean;
  total: number;
  net: number;
  entretien: number;
  repas: number;
  km: number;
  lignes: LigneDecl[];
  joursAccueil: number;
  absences: number;
}

export interface ParentSnapshot {
  v: number;
  child: string;
  color: number;
  am: string;
  /** Heure de préparation (ms) */
  maj: number;
  /** Date du téléphone de l'AM à la préparation */
  today: ISODate;
  /** Du plus récent au plus ancien, aujourd'hui en premier */
  jours: JourParent[];
  carnet: EntreeCarnet[];
  /** Mois précédent puis mois en cours, s'ils sont suivis par l'app */
  mois: MoisParent[];
}

function motifAm(type: string, am: string): string {
  return type === 'cp' ? `Congés de ${am}` : `${am} absente`;
}

function jourParent(ctx: Ctx, d: ISODate, am: string): JourParent | null {
  if (!inContract(ctx.c, d)) return null;
  const di = dayInfo(ctx, d);
  const pres = (di.rec?.pres ?? []).filter((p) => p.a).map((p) => (p.d ? { a: p.a, d: p.d } : { a: p.a }));
  const base = { date: d, pres, prevu: di.planned, minutes: di.presentMin };
  switch (di.kind) {
    case 'hors': return pres.length ? { ...base, statut: 'parti' } : null;
    case 'am': return di.plannedMin ? { ...base, minutes: 0, statut: 'am', motif: motifAm(di.amLeave!, am) } : null;
    case 'ferie': return { ...base, minutes: 0, statut: 'ferie', motif: `Jour férié (${di.ferie})` };
    case 'absent': return { ...base, minutes: 0, statut: 'absent', motif: CHILD_ABS_LABEL[di.rec!.abs!] };
    case 'present': return { ...base, statut: di.enCours ? 'present' : 'parti' };
    case 'prevu': return { ...base, statut: d < ctx.today ? 'prevu' : 'attendu', minutes: d < ctx.today ? di.plannedMin : 0 };
  }
  return null;
}

function moisParent(ctx: Ctx, m: Month, enfants: number): MoisParent | null {
  const r = computeMonth(ctx, m, enfants);
  if (!r.active || r.fromHistory) return null;
  const absences = [...ctx.days.values()].filter((x) => monthOf(x.date) === m && x.abs && inContract(ctx.c, x.date)).length;
  return {
    month: m,
    termine: m < monthOf(ctx.today),
    total: r.netTotal + r.entretien + r.repas + r.km,
    net: r.netTotal,
    entretien: r.entretien,
    repas: r.repas,
    km: r.km,
    lignes: declarationLines(ctx, r).map((l) => (l.hint ? { label: l.label, value: l.value, hint: l.hint } : { label: l.label, value: l.value })),
    joursAccueil: r.presenceDays,
    absences,
  };
}

export function buildSnapshot(o: { ctx: Ctx; journal: Journal[]; amName: string; enfants: number; now: number }): ParentSnapshot {
  const { ctx } = o;
  const c = ctx.c;
  const am = o.amName.trim() || 'votre assistante maternelle';
  const t = ctx.today;
  const from = addDays(t, -(JOURS_VISIBLES - 1));
  const jours: JourParent[] = [];
  for (let i = 0; i < JOURS_VISIBLES; i++) {
    const j = jourParent(ctx, addDays(t, -i), am);
    if (j) jours.push(j);
  }
  const carnet = o.journal
    .filter((j) => j.cid === c.id && j.date >= from && j.date <= t)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .map((j) => ({ date: j.date, time: j.time, kind: j.kind, detail: j.detail }));
  const cur = monthOf(t);
  const mois = [addMonths(cur, -1), cur].map((m) => moisParent(ctx, m, o.enfants)).filter((x): x is MoisParent => !!x);
  return { v: SNAPSHOT_VERSION, child: c.child, color: c.color, am, maj: o.now, today: t, jours, carnet, mois };
}
