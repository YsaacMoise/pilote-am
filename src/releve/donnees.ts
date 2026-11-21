// Relevé du mois : données du document de travail que l'assistante maternelle garde ou envoie au parent.
// Aucun nouveau calcul : tout vient de computeMonth, declarationLines et dayInfo, comme l'écran Mois.
// Ce n'est pas un bulletin de salaire : ni brut, ni cotisations, ni net imposable.
import { eachDay, firstDay, lastDay, monthLabel, monthOf, shortDate, type ISODate, type Month } from '../engine/dates';
import { computeMonth, declarationLines, totalAVerser, type DeclLine } from '../engine/month';
import { dayInfo, inContract, type Ctx } from '../engine/payroll';
import { euros, hoursLabel } from '../engine/money';
import { AM_ABS_LABEL, CHILD_ABS_LABEL } from '../engine/model';

export const MENTION_RELEVE =
  'Document de travail établi avec Arvela, outil d’aide indépendant de l’Urssaf et de Pajemploi. Il ne remplace pas le bulletin de salaire Pajemploi, qui fait foi.';

export interface ReleveLigne {
  date: ISODate;
  /** « lun. 2 » */
  jour: string;
  /** Horaires prévus au planning, « 08:00–17:00 » (deux plages séparées par « · ») ; « — » si aucun */
  prevu: string;
  /** Horaires réels pointés, « comme prévu », ou vide (jour à venir, absence) */
  reel: string;
  /** Absence et son motif, tel que l'écran Mois l'affiche ; vide sinon */
  absence: string;
}

export interface ReleveDonnees {
  mois: Month;
  /** « novembre 2026 » */
  moisLabel: string;
  provisoire: boolean;
  titre: string;
  enfant: string;
  famille: string;
  am: string;
  lignes: ReleveLigne[];
  totaux: { label: string; value: string }[];
  montants: { label: string; value: string; total?: boolean }[];
  declaration: DeclLine[];
  fabrique: string;
  version: string;
  mention: string;
  nomFichier: string;
}

const JOURS_COURTS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

function jourCourt(d: ISODate): string {
  const dt = new Date(`${d}T12:00:00Z`);
  return `${JOURS_COURTS[(dt.getUTCDay() + 6) % 7]} ${dt.getUTCDate()}`;
}

const plages = (ps: { start?: string; end?: string; a?: string; d?: string }[]): string =>
  ps.map((p) => `${p.start ?? p.a ?? '?'}–${p.end ?? p.d ?? '?'}`).join(' · ');

/** Prénom utilisable dans un nom de fichier (accents gardés, séparateurs et caractères interdits retirés) */
export function prenomFichier(p: string): string {
  const t = p.normalize('NFC').trim().replace(/[\\/:*?"<>|.\u0000-\u001f]+/g, '').replace(/\s+/g, '-');
  return t || 'enfant';
}

export function nomFichierReleve(prenom: string, m: Month): string {
  return `Arvela-releve-${prenomFichier(prenom)}-${m}.pdf`;
}

function heureFr(dt: Date): string {
  return `${String(dt.getHours()).padStart(2, '0')} h ${String(dt.getMinutes()).padStart(2, '0')}`;
}

function isoLocal(dt: Date): ISODate {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}` as ISODate;
}

export function releveDonnees(
  ctx: Ctx,
  m: Month,
  o: { amName: string; enfants?: number; now: Date; version: string },
): ReleveDonnees {
  const c = ctx.c;
  const r = computeMonth(ctx, m, o.enfants ?? 0);
  const aujourdhui = ctx.today;
  // Mois en cours, sauf si le contrat s'est déjà terminé avant aujourd'hui.
  const provisoire = m >= monthOf(aujourdhui) && !(c.end && c.end < aujourdhui);
  const lignes: ReleveLigne[] = [];
  let prevuMin = 0, reelMin = 0, absEnfant = 0, absAm = 0, feries = 0;
  for (const d of eachDay(firstDay(m), lastDay(m))) {
    if (!inContract(c, d)) continue;
    const di = dayInfo(ctx, d);
    if (di.kind === 'hors' && !di.rec) continue;
    // Absence de l'AM un jour sans accueil prévu (week-end pendant un arrêt) : rien à relever.
    if (di.kind === 'am' && di.plannedMin === 0 && !di.rec) continue;
    prevuMin += di.plannedMin;
    reelMin += di.presentMin;
    let reel = '';
    let absence = '';
    if (di.kind === 'am' && di.amLeave) { absence = AM_ABS_LABEL[di.amLeave]; if (di.plannedMin > 0) absAm++; }
    else if (di.kind === 'ferie') { absence = `Férié : ${di.ferie}`; feries++; }
    else if (di.kind === 'absent' && di.rec?.abs) {
      absence = CHILD_ABS_LABEL[di.rec.abs] + (di.deducted ? ', retenu' : ', payé');
      if (di.plannedMin > 0) absEnfant++;
    } else if (di.kind === 'present') {
      const pres = (di.rec?.pres ?? []).filter((p) => p.a);
      reel = pres.map((p) => `${p.a}–${p.d ?? (di.enCours ? 'en cours' : 'départ non pointé, heure prévue retenue')}`).join(' · ');
    } else if (di.kind === 'prevu') {
      reel = d <= aujourdhui ? 'comme prévu' : '';
    }
    lignes.push({ date: d, jour: jourCourt(d), prevu: di.planned.length ? plages(di.planned) : '—', reel, absence });
  }
  const totaux = [
    { label: 'Heures prévues au planning', value: hoursLabel(prevuMin) },
    { label: provisoire ? 'Heures d’accueil à ce jour' : 'Heures d’accueil', value: hoursLabel(reelMin) },
    { label: 'Jours d’accueil', value: `${r.presenceDays}` },
  ];
  if (absEnfant) totaux.push({ label: 'Jours d’absence de l’enfant', value: `${absEnfant}` });
  if (absAm) totaux.push({ label: 'Jours d’absence de l’assistante maternelle', value: `${absAm}` });
  if (feries) totaux.push({ label: 'Jours fériés chômés', value: `${feries}` });
  const montants: ReleveDonnees['montants'] = [
    { label: 'Salaire net', value: euros(r.netTotal) },
    { label: 'Indemnités d’entretien', value: euros(r.entretien) },
    { label: 'Repas', value: euros(r.repas) },
    { label: 'Kilomètres', value: euros(r.km) },
    { label: 'Total à verser', value: euros(totalAVerser(r)), total: true },
  ];
  const moisL = monthLabel(m);
  return {
    mois: m,
    moisLabel: moisL,
    provisoire,
    titre: provisoire ? 'Relevé du mois, provisoire' : 'Relevé du mois',
    enfant: c.child,
    famille: c.family,
    am: o.amName.trim(),
    lignes,
    totaux,
    montants,
    declaration: declarationLines(ctx, r),
    fabrique: `Fabriqué le ${shortDate(isoLocal(o.now))} à ${heureFr(o.now)}`,
    version: o.version,
    mention: MENTION_RELEVE,
    nomFichier: nomFichierReleve(c.child, m),
  };
}
