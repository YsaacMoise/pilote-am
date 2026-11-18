// Fin de contrat : préavis (art. 120), indemnité de rupture (art. 121), régularisation (art. 109.2),
// indemnité de congés non pris. Aucun document officiel n'est produit.
import {
  addDays, addMonthsToDate, cpPeriod, cpPeriodStartYear, fullMonthsBetween, lastDay, monthOf, monthsBetween, shortDate,
  type ISODate, type Month,
} from './dates';
import { acquisition, compteur, cpForMonth, indemnite, maintien } from './conges';
import { makeCtx, monthBase, monthBrut, regularisation, regulStart, semainesSansAccueilAnnee, semainesSansAccueilManquantes, termsAt, type Ctx } from './payroll';
import { netToBrut } from './rates';

/** Entrée en vigueur de l'avenant n° 10 du 9 septembre 2025 (inaptitude) */
const AVENANT_10 = '2026-05-01';

export type Motif = 'retrait' | 'demission' | 'deces' | 'inaptitude' | 'inaptitude_pro' | 'faute_grave' | 'essai';

export const MOTIF_LABEL: Record<Motif, string> = {
  retrait: 'Les parents retirent l’enfant',
  demission: 'Je démissionne',
  deces: 'Décès de l’enfant',
  inaptitude: 'Inaptitude sans lien avec le travail',
  inaptitude_pro: 'Inaptitude après un accident du travail ou une maladie professionnelle',
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
  /** L'assiette de l'indemnité de rupture ne contient pas des congés payés encore à confirmer (T-019) */
  ruptureAConfirmer?: boolean;
  /** Décès de l'enfant : indemnité égale au préavis (R-FIN-07, CCN art. 119.4.2), 0 pour les autres motifs */
  indemnitePreavis: number;
  indemnitePreavisExplication?: string;
  totalBrut: number;
  regularisation: number;
  regulMinutes: number;
  cpJoursRestants: number;
  cpIndemnite: number;
  cpExplication: string;
  /** Congés non pris à confirmer : `cpIndemnite` vaut 0 et n'est pas compté (T-019) */
  cpAConfirmer?: string;
  manquants: Month[];
  alertes: string[];
}

/** Durée du préavis selon l'ancienneté, rupture par l'employeur (R-FIN-02, CCN art. 120) */
function preavisEmployeur(anc: number): { label: string; jours?: number } {
  if (anc < 3) return { label: '8 jours calendaires', jours: 8 };
  if (anc < 12) return { label: '15 jours calendaires', jours: 15 };
  return { label: '1 mois' };
}

/** Dernier jour d'un préavis qui commence le jour `depart` (méthode de l'app, voir PREAVIS-DATE-FIN) */
function finPreavis(depart: ISODate, p: { jours?: number }): ISODate {
  if (p.jours) return addDays(depart, p.jours - 1);
  // Un mois de date à date : du 15/10 au 14/11 ; du 31/10 au 30/11 (pas de 31 novembre).
  const cible = addMonthsToDate(depart, 1);
  return cible.slice(8) < depart.slice(8) ? cible : addDays(cible, -1);
}

/**
 * Indemnité compensatrice de préavis (R-FIN-05, CCN art. 64.2, 66, 122) : salaire mensualisé de chaque mois couvert,
 * réduit au prorata des heures (année complète) ou des jours (année incomplète) prévus quand le préavis ne couvre qu'une
 * partie du mois (art. 111, comme un mois d'entrée ou de sortie).
 */
function indemniteCompensatricePreavis(c: Ctx['c'], from: ISODate, to: ISODate): number {
  const h = makeCtx({ ...c, start: from, end: to, trackedFrom: from, history: [] }, [], [], to);
  let total = 0;
  for (const m of monthsBetween(monthOf(from), monthOf(to))) total += monthBase(h, m).base;
  return total;
}

/**
 * `notif` : date d'envoi de la lettre recommandée ou de remise en main propre contre décharge (date du décès pour
 * un décès). L'ancienneté s'apprécie à cette date.
 * `presentation` : date de première présentation de la lettre recommandée (avis de passage). Le préavis part de
 * cette date ; en remise en main propre, c'est la date de remise (= `notif`). Jamais de l'annonce orale (C-017,
 * CCN art. 120 ; fiches DREETS Auvergne-Rhône-Alpes du 18/03/2024 ; code.travail.gouv.fr, IDCC 3239).
 */
export function finDeContrat(ctx: Ctx, notif: ISODate, motif: Motif, enfants = 0, presentation?: ISODate): FinResult {
  const c = ctx.c;
  const alertes: string[] = [];
  const anc = fullMonthsBetween(c.start, notif);
  const depart = presentation && presentation > notif ? presentation : notif;

  // Préavis (art. 120) : « un préavis est à effectuer en cas de rupture à l'initiative du particulier employeur ou du
  // salarié. Sa durée est au minimum de : – 8 jours calendaires lorsque l'enfant est accueilli depuis moins de 3 mois »
  // (T-023 : la démission avant 3 mois a aussi 8 jours ; le conflit CASF L423-26 / CCN 120 de 3 mois à 1 an relève de T-024).
  // Inaptitude (avenant n° 10 du 9 septembre 2025, art. 119-5 et 64-4) : rupture sans préavis, à la date d'envoi.
  let preavisFin = notif;
  let preavisLabel = 'Pas de préavis';
  if (motif === 'inaptitude' || motif === 'inaptitude_pro') {
    preavisLabel = 'Pas de préavis en cas d’inaptitude : le contrat s’arrête à l’envoi de la lettre';
  } else if (motif === 'retrait' || motif === 'demission') {
    const p = preavisEmployeur(anc);
    preavisLabel = p.label;
    preavisFin = finPreavis(depart, p);
  }
  // Décès de l'enfant (R-FIN-07, CCN art. 119.4.2 ; Urssaf « motifs de fin de contrat » ; service-public.fr F16842) :
  // le contrat s'arrête le jour du décès, sans préavis à faire ; l'employeur verse une indemnité égale à l'indemnité
  // compensatrice de préavis (R-FIN-05), de la durée d'un retrait de l'enfant à la date du décès (R-FIN-02).
  // Choix de l'app, à valider (aucun texte ne fixe le premier jour) : la période part du lendemain du décès, car le jour
  // du décès est payé avec le dernier salaire.
  let indemnitePreavis = 0;
  let indemnitePreavisExplication: string | undefined;
  if (motif === 'deces') {
    const p = preavisEmployeur(anc);
    const debut = addDays(notif, 1);
    const fin = finPreavis(debut, p);
    indemnitePreavis = indemniteCompensatricePreavis(c, debut, fin);
    preavisLabel = `${p.label} : pas de préavis à faire, les parents te versent une indemnité égale au préavis`;
    indemnitePreavisExplication = `Égale au salaire que tu aurais touché pendant ${p.jours ? `${p.jours} jours` : 'un mois'}, du ${shortDate(debut)} au ${shortDate(fin)}.`;
    alertes.push(`Décès de l’enfant : l’indemnité égale au préavis est calculée du ${shortDate(debut)} au ${shortDate(fin)}. Aucun texte ne fixe le premier jour : fais-la vérifier.`);
  }
  const dernierJour = preavisFin;
  const endCtx: Ctx = { ...ctx, c: { ...c, end: dernierJour }, cache: new Map() };

  // Salaires bruts depuis le début du contrat
  let totalBrut = 0;
  let cpManquants = false;
  let evenementManquant = false;
  let cpAuDelaManquant = false;
  const manquants: Month[] = [];
  for (const m of monthsBetween(monthOf(c.start), monthOf(dernierJour))) {
    const b = monthBase(endCtx, m);
    if (!b.active) continue;
    if (b.missing) { manquants.push(m); continue; }
    totalBrut += monthBrut(endCtx, m);
    const cp = cpForMonth(endCtx, m, enfants);
    totalBrut += netToBrut(cp.indemnite + cp.complement, lastDay(m));
    if (cp.aConfirmer) cpManquants = true;
    // T-025 C-5 : salaire d'un événement familial à confirmer, absent de ce total (CCN 48.1.3.1.1 : pas de réduction de la rémunération).
    if (b.evenementAConfirmer) evenementManquant = true;
    if (b.joursCpAConfirmer) cpAuDelaManquant = true;
  }
  if (manquants.length) {
    alertes.push(`Historique incomplet : ${manquants.length} mois sans bulletin. Ajoute les bulletins manquants dans l’historique pour un calcul juste.`);
  }

  // Avenant n° 10 (inaptitude) en vigueur le 1er mai 2026 : avant, ses règles ne s'appliquaient pas.
  if ((motif === 'inaptitude' || motif === 'inaptitude_pro') && notif < AVENANT_10) {
    alertes.push('Inaptitude notifiée avant le 1er mai 2026 : les règles de l’avenant n° 10 appliquées ici n’étaient pas encore en vigueur. Fais vérifier le calcul (relais petite enfance, DREETS).');
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
    // Avenant n° 10 du 9 septembre 2025 (étendu, JO du 4 avril 2026, en vigueur le 1er mai 2026), art. 119-5 :
    // indemnité spécifique de 2/80e, « selon les conditions d'ancienneté définies à l'article 121-1 » (9 mois).
    if (anc >= 9) {
      indemniteRupture = Math.round((totalBrut * 2) / 80);
      ruptureExplication = 'Inaptitude après un accident du travail ou une maladie professionnelle : indemnité spécifique de 2/80e des salaires bruts (avenant n° 10, 9 mois d’ancienneté atteints).';
    } else {
      ruptureExplication = `Inaptitude d’origine professionnelle : pas d’indemnité, moins de 9 mois d’ancienneté (${anc} mois).`;
    }
  } else if (motif === 'inaptitude') {
    if (anc >= 9) {
      indemniteRupture = Math.round(totalBrut / 80);
      ruptureExplication = 'Inaptitude sans lien avec le travail : 1/80e des salaires bruts (avenant n° 10, 9 mois d’ancienneté atteints).';
    } else {
      ruptureExplication = `Inaptitude : pas d’indemnité, moins de 9 mois d’ancienneté (${anc} mois).`;
    }
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

  const ruptureAConfirmer = (cpManquants || evenementManquant) && indemniteRupture > 0;
  if (ruptureAConfirmer) {
    const evenement = evenementManquant ? (cpAuDelaManquant ? 'le salaire d’événement familial ou de congés pris au-delà des droits' : 'le salaire d’événement familial') : '';
    const manque = [cpManquants ? 'les congés payés' : '', evenement].filter(Boolean).join(' ni ');
    alertes.push(`Indemnité de rupture à confirmer : elle ne compte pas encore ${manque} à confirmer.`);
  }

  // Régularisation : heures réellement dues (planning, hors absences retenues) contre heures payées,
  // depuis l'embauche, le début du suivi ou le dernier passage d'une année à l'autre (C-001 : les autres avenants ne coupent pas).
  const finTerms = termsAt(c, dernierJour);
  const regStart = regulStart(c, addDays(dernierJour, 1));
  const reg = regularisation(endCtx, regStart, dernierJour);
  const regulMinutes = reg.minutes;
  // C-002 : sans toutes les semaines sans accueil, les semaines non saisies compteraient comme accueillies.
  let manque = finTerms.yearType === 'incomplete' ? semainesSansAccueilManquantes(c, regStart, dernierJour) : 0;
  // Dernière année de contrat non terminée : aucune semaine sans accueil saisie alors qu'il en faut = blocage
  // (seconde relecture, point 5b : sinon les vacances déjà passées compteraient comme accueillies).
  if (finTerms.yearType === 'incomplete') {
    let debut = c.start;
    while (addMonthsToDate(debut, 12) <= dernierJour) debut = addMonthsToDate(debut, 12);
    const { attendu, saisies } = semainesSansAccueilAnnee(c, debut);
    if (debut >= regStart && attendu > 0 && saisies === 0) manque += attendu;
  }
  if (manque > 0) {
    alertes.push(`Régularisation non calculée : il manque ${manque} semaine${manque > 1 ? 's' : ''} sans accueil dans le contrat. Saisis-les d’abord, sinon les vacances compteraient comme des semaines accueillies.`);
  } else if (finTerms.yearType === 'incomplete') {
    alertes.push('Vérifie que toutes les semaines sans accueil de la dernière année sont saisies : une semaine non saisie compte comme accueillie dans la régularisation.');
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
  // T-019 : jours acquis (année incomplète, SUS-11) ou jours pris (R-CP-09) à confirmer : aucun montant n'est donné.
  let cpAConfirmer: string | undefined;
  const indPrecAC = restantsPrec > 0 && finTerms.yearType !== 'complete' && y - 1 >= cpPeriodStartYear(c.trackedFrom)
    ? indemnite(endCtx, y - 1, enfants).aConfirmer : undefined;
  const motifsAC = [
    acq.aConfirmer?.message ?? indCur.aConfirmer?.message,
    cpt.aPrendreAConfirmer?.message ?? indPrecAC?.message,
    ...cpt.decompteAConfirmer,
  ].filter((x): x is string => !!x);
  if (motifsAC.length) {
    cpAConfirmer = [...new Set(motifsAC)].join(' ');
    cpIndemnite = 0;
    cpExplication = 'À confirmer : le nombre de jours de congés n’est pas tranché. L’app ne donne pas de montant.';
  }

  return {
    ancienneteMois: anc, preavisLabel, preavisFin, dernierJour, indemniteRupture, ruptureExplication, ruptureAConfirmer, totalBrut,
    indemnitePreavis, indemnitePreavisExplication,
    regularisation: regularisation_, regulMinutes, cpJoursRestants: joursCur + restantsPrec, cpIndemnite, cpExplication, cpAConfirmer, manquants, alertes,
  };
}
