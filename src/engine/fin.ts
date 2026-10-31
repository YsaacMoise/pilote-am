// Fin de contrat : préavis (art. 120), indemnité de rupture (art. 121), régularisation (art. 124),
// indemnité de congés non pris. Aucun document officiel n'est produit.
import {
  addDays, addMonthsToDate, cpPeriod, cpPeriodStartYear, fullMonthsBetween, lastDay, monthOf, monthsBetween,
  type ISODate, type Month,
} from './dates';
import { acquisition, compteur, cpForMonth, indemnite, maintien } from './conges';
import { monthBase, monthBrut, regularisation, regulStart, semainesSansAccueilManquantes, termsAt, type Ctx } from './payroll';
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
      preavisFin = addDays(notif, 7);
    } else if (anc < 12) {
      preavisLabel = '15 jours calendaires';
      preavisFin = addDays(notif, 14);
    } else {
      preavisLabel = '1 mois';
      preavisFin = addDays(addMonthsToDate(notif, 1), -1);
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

  // Indemnité de rupture. Ancienneté appréciée à la date d'envoi de la lettre (ou au décès), comme pour le préavis.
  let indemniteRupture = 0;
  let ruptureExplication = '';
  if (motif === 'deces') {
    if (anc >= 9) {
      indemniteRupture = Math.round(totalBrut / 80);
      ruptureExplication = 'Décès de l’enfant : 1/80e des salaires bruts (9 mois d’ancienneté atteints).';
    } else {
      ruptureExplication = `Décès de l’enfant : pas d’indemnité de rupture, moins de 9 mois d’ancienneté (${anc} mois).`;
    }
  } else if (motif === 'inaptitude_pro') {
    indemniteRupture = Math.round((totalBrut * 2) / 80);
    ruptureExplication = 'Inaptitude d’origine professionnelle : 2/80e des salaires bruts.';
  } else if (motif === 'retrait') {
    if (anc >= 9) {
      indemniteRupture = Math.round(totalBrut / 80);
      ruptureExplication = '1/80e des salaires bruts perçus depuis le début du contrat (9 mois d’ancienneté atteints à l’envoi de la lettre).';
    } else {
      ruptureExplication = `Pas d’indemnité : moins de 9 mois d’ancienneté à l’envoi de la lettre (${anc} mois).`;
    }
  } else if (motif === 'demission') {
    ruptureExplication = 'Pas d’indemnité de rupture en cas de démission.';
  } else if (motif === 'faute_grave') {
    ruptureExplication = 'Pas d’indemnité de rupture en cas de faute grave (à contester si elle est injustifiée).';
  } else {
    ruptureExplication = 'Pas d’indemnité pendant la période d’essai.';
  }

  // Régularisation : heures réellement dues (planning, hors absences retenues) contre heures payées,
  // depuis l'embauche, le début du suivi ou le dernier passage d'une année à l'autre (C-001 : les autres avenants ne coupent pas).
  const finTerms = termsAt(c, dernierJour);
  const regStart = regulStart(c, addDays(dernierJour, 1));
  const reg = regularisation(endCtx, regStart, dernierJour);
  const regulMinutes = reg.minutes;
  // C-002 : sans toutes les semaines sans accueil, les semaines non saisies compteraient comme accueillies.
  const manque = finTerms.yearType === 'incomplete' ? semainesSansAccueilManquantes(c, dernierJour) : 0;
  if (manque > 0) {
    alertes.push(`Régularisation non calculée : il manque ${manque} semaine${manque > 1 ? 's' : ''} sans accueil dans le contrat. Saisis-les d’abord, sinon les vacances compteraient comme des semaines accueillies.`);
  }
  const regularisation_ = finTerms.yearType === 'incomplete' && manque === 0 ? reg.montant : 0;
  if (finTerms.yearType === 'complete' && regulMinutes > 60) {
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
  const curMontant = Math.max(Math.round(indCur.dixieme), maintien(endCtx, joursCur, dernierJour));
  // Période précédente : jours restants, moins ce qui a déjà été versé.
  let precMontant = 0;
  if (restantsPrec > 0) {
    if (finTerms.yearType === 'complete') {
      // Les jours pris ont été payés dans le salaire, le complément du dixième en juin : reste le maintien.
      precMontant = maintien(endCtx, restantsPrec, dernierJour);
    } else {
      const indPrev = y - 1 >= cpPeriodStartYear(c.trackedFrom) ? indemnite(endCtx, y - 1, enfants) : null;
      if (indPrev && indPrev.jours) {
        let deja = 0;
        for (const m of monthsBetween(`${y}-06`, monthOf(dernierJour))) deja += cpForMonth(endCtx, m, enfants).indemnite;
        precMontant = Math.max(0, indPrev.montant - deja);
      } else {
        precMontant = maintien(endCtx, restantsPrec, dernierJour);
      }
    }
  }
  cpIndemnite = curMontant + precMontant;
  cpExplication = `${joursCur} jour${joursCur > 1 ? 's' : ''} acquis depuis le 1er juin (${cpPeriod(y).from.slice(0, 4)})` +
    (restantsPrec ? ` et ${restantsPrec} jour${restantsPrec > 1 ? 's' : ''} de la période précédente non pris` : '') +
    ' : on retient le plus favorable entre le dixième et le maintien de salaire.';

  return {
    ancienneteMois: anc, preavisLabel, preavisFin, dernierJour, indemniteRupture, ruptureExplication, totalBrut,
    regularisation: regularisation_, regulMinutes, cpJoursRestants: joursCur + restantsPrec, cpIndemnite, cpExplication, manquants, alertes,
  };
}
