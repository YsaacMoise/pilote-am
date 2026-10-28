// Fin de contrat : préavis (art. 120), indemnité de rupture (art. 121), régularisation (art. 124),
// indemnité de congés non pris. Aucun document officiel n'est produit.
import {
  addDays, addMonthsToDate, cpPeriod, cpPeriodStartYear, eachDay, fullMonthsBetween, lastDay, monthOf, monthsBetween,
  type ISODate, type Month,
} from './dates';
import { acquisition, compteur, cpForMonth, indemnite, maintien } from './conges';
import { dayInfo, monthBase, monthBrut, type Ctx } from './payroll';
import { netToBrut } from './rates';

export type Motif = 'retrait' | 'demission' | 'deces' | 'inaptitude_pro' | 'faute_grave' | 'essai';

export const MOTIF_LABEL: Record<Motif, string> = {
  retrait: 'Les parents retirent l’enfant',
  demission: 'Je démissionne',
  deces: 'Décès de l’enfant',
  inaptitude_pro: 'Inaptitude d’origine professionnelle',
  faute_grave: 'Faute grave reprochée',
  essai: 'Rupture pendant la période d’essai',
};

export interface FinResult {
  ancienneteMois: number;
  preavisLabel: string;
  preavisFin: ISODate;
  dernierJour: ISODate;
  indemniteRupture: number;
  ruptureExplication: string;
  totalBrut: number;
  regularisation: number;
  regulMinutes: number;
  cpJoursRestants: number;
  cpIndemnite: number;
  cpExplication: string;
  manquants: Month[];
  alertes: string[];
}

export function finDeContrat(ctx: Ctx, notif: ISODate, motif: Motif, enfants = 0): FinResult {
  const c = ctx.c;
  const alertes: string[] = [];
  const anc = fullMonthsBetween(c.start, notif);

  // Préavis
  let preavisFin = notif;
  let preavisLabel = 'Pas de préavis';
  if (motif === 'retrait' || motif === 'demission' || motif === 'inaptitude_pro') {
    if (motif === 'inaptitude_pro') {
      preavisLabel = 'Pas de préavis travaillé en cas d’inaptitude';
    } else if (anc < 3) {
      preavisLabel = '8 jours calendaires';
      preavisFin = addDays(notif, 8);
    } else if (anc < 12) {
      preavisLabel = '15 jours calendaires';
      preavisFin = addDays(notif, 15);
    } else {
      preavisLabel = '1 mois';
      preavisFin = addMonthsToDate(notif, 1);
    }
  }
  const dernierJour = preavisFin;
  const endCtx: Ctx = { ...ctx, c: { ...c, end: dernierJour }, cache: new Map() };

  // Salaires bruts depuis le début du contrat
  let totalBrut = 0;
  const manquants: Month[] = [];
  for (const m of monthsBetween(monthOf(c.start), monthOf(dernierJour))) {
    const b = monthBase(endCtx, m);
    if (!b.active) continue;
    if (b.missing) { manquants.push(m); continue; }
    totalBrut += monthBrut(endCtx, m);
    const cp = cpForMonth(endCtx, m, enfants);
    totalBrut += netToBrut(cp.indemnite + cp.complement, lastDay(m));
  }
  if (manquants.length) {
    alertes.push(`Historique incomplet : ${manquants.length} mois sans bulletin. Ajoute les bulletins manquants dans l’historique pour un calcul juste.`);
  }

  // Indemnité de rupture
  const ancFin = fullMonthsBetween(c.start, dernierJour);
  let indemniteRupture = 0;
  let ruptureExplication = '';
  if (motif === 'deces') {
    indemniteRupture = Math.round(totalBrut / 80);
    ruptureExplication = 'Décès de l’enfant : 1/80e des salaires bruts, sans condition d’ancienneté.';
  } else if (motif === 'inaptitude_pro') {
    indemniteRupture = Math.round((totalBrut * 2) / 80);
    ruptureExplication = 'Inaptitude d’origine professionnelle : 2/80e des salaires bruts.';
  } else if (motif === 'retrait') {
    if (ancFin >= 9) {
      indemniteRupture = Math.round(totalBrut / 80);
      ruptureExplication = '1/80e des salaires bruts perçus depuis le début du contrat (9 mois d’ancienneté atteints).';
    } else {
      ruptureExplication = `Pas d’indemnité : moins de 9 mois d’ancienneté (${ancFin} mois).`;
    }
  } else if (motif === 'demission') {
    ruptureExplication = 'Pas d’indemnité de rupture en cas de démission.';
  } else if (motif === 'faute_grave') {
    ruptureExplication = 'Pas d’indemnité de rupture en cas de faute grave (à contester si elle est injustifiée).';
  } else {
    ruptureExplication = 'Pas d’indemnité pendant la période d’essai.';
  }

  // Régularisation : heures réellement dues (planning, hors absences retenues) contre heures payées.
  let dues = 0, payees = 0;
  const from = c.trackedFrom > c.start ? c.trackedFrom : c.start;
  // Depuis l'embauche (ou le début du suivi par l'app) : art. 124.
  const regStart = from;
  for (const d of eachDay(regStart, dernierJour)) {
    const di = dayInfo(endCtx, d);
    if (di.inDivisor && !di.deducted) dues += di.plannedMin;
  }
  for (const m of monthsBetween(monthOf(regStart), monthOf(dernierJour))) {
    const b = monthBase(endCtx, m);
    if (!b.active || b.fromHistory) continue;
    if (m === monthOf(regStart) && regStart.slice(8) !== '01') {
      // mois entamé : seule la part postérieure au début de la régularisation compte
      const part = eachDay(regStart, lastDay(m)).reduce((s, d) => s + (dayInfo(endCtx, d).inDivisor ? dayInfo(endCtx, d).plannedMin : 0), 0);
      const tot = b.divisorMin || 1;
      payees += (b.mensuelMin * b.paidFraction * part) / tot;
    } else {
      payees += b.mensuelMin * b.paidFraction;
    }
  }
  const regulMinutes = Math.max(0, Math.round(dues - payees));
  const regularisation = c.yearType === 'incomplete' ? Math.round((regulMinutes * c.rateNet) / 60) : 0;
  if (c.yearType === 'complete' && regulMinutes > 60) {
    alertes.push('Année complète : la régularisation ne s’applique pas en principe, vérifie le planning du contrat.');
  }

  // Congés non pris
  const cpt = compteur(endCtx, dernierJour, enfants);
  const y = cpPeriodStartYear(dernierJour);
  const acq = acquisition(endCtx, y, enfants);
  const restantsPrec = Math.max(0, cpt.reste);
  let cpIndemnite = 0;
  let cpExplication = '';
  // Période en cours : dixième de la base à date, ou maintien, le plus favorable
  const indCur = indemnite(endCtx, y, enfants);
  const joursCur = acq.joursADate;
  const curMontant = Math.max(Math.round(indCur.dixieme), maintien(endCtx, joursCur));
  // Période précédente : jours restants
  let precMontant = 0;
  if (restantsPrec > 0) {
    if (c.yearType === 'incomplete' && c.cpMode === 'juin' && dernierJour >= `${y}-06-30`) {
      precMontant = 0; // déjà payée en juin
    } else {
      const indPrev = y - 1 >= cpPeriodStartYear(c.trackedFrom) ? indemnite(endCtx, y - 1, enfants) : null;
      precMontant = indPrev && indPrev.jours ? Math.round((indPrev.montant * restantsPrec) / indPrev.jours) : maintien(endCtx, restantsPrec);
      if (c.yearType === 'incomplete' && c.cpMode === 'juin') precMontant = 0;
    }
  }
  cpIndemnite = curMontant + precMontant;
  cpExplication = `${joursCur} jour${joursCur > 1 ? 's' : ''} acquis depuis le 1er juin (${cpPeriod(y).from.slice(0, 4)})` +
    (restantsPrec ? ` et ${restantsPrec} jour${restantsPrec > 1 ? 's' : ''} de la période précédente non pris` : '') +
    ' : on retient le plus favorable entre le dixième et le maintien de salaire.';

  return {
    ancienneteMois: anc, preavisLabel, preavisFin, dernierJour, indemniteRupture, ruptureExplication, totalBrut,
    regularisation, regulMinutes, cpJoursRestants: joursCur + restantsPrec, cpIndemnite, cpExplication, manquants, alertes,
  };
}
