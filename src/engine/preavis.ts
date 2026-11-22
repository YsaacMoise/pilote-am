// Préavis : durée (CCN art. 120), date de fin (méthode de l'app) et contrôle de la date de fin saisie (T-045b).
// Module séparé de fin.ts pour que le calcul des mois (nonGeres.ts) s'en serve sans dépendre de fin.ts.
import { addDays, addMonthsToDate, fullMonthsBetween, shortDate, type ISODate } from './dates';
import type { Contract, Rupture } from './model';

/** Durée du préavis selon l'ancienneté, rupture par l'employeur (R-FIN-02, CCN art. 120) */
export function preavisEmployeur(anc: number): { label: string; jours?: number } {
  if (anc < 3) return { label: '8 jours calendaires', jours: 8 };
  if (anc < 12) return { label: '15 jours calendaires', jours: 15 };
  return { label: '1 mois' };
}

/** Dernier jour d'un préavis qui commence le jour `depart` (méthode de l'app, voir PREAVIS-DATE-FIN) */
export function finPreavis(depart: ISODate, p: { jours?: number }): ISODate {
  if (p.jours) return addDays(depart, p.jours - 1);
  // Un mois de date à date : du 15/10 au 14/11 ; du 31/10 au 30/11 (pas de 31 novembre).
  const cible = addMonthsToDate(depart, 1);
  return cible.slice(8) < depart.slice(8) ? cible : addDays(cible, -1);
}

/**
 * Fin du préavis calculée par l'app et dates de fin admises quand le préavis est fait en entier : la fin calculée, le
 * lendemain (aucun texte ne dit si le jour de présentation compte, MESSAGE_PREAVIS_FIN) et, pour une démission de 3 mois à
 * moins d'un an, la fin d'un préavis d'un mois et son lendemain (CASF L423-26 contre CCN art. 120). Sans préavis (inaptitude,
 * faute grave, essai, décès) : la date d'envoi ou du décès (CCN art. 64.3, 64.4, 119.4.2).
 */
export function finsAdmises(start: ISODate, r: Pick<Rupture, 'motif' | 'notif' | 'presentation'>): { preavisFin: ISODate; admises: ISODate[] } {
  if (r.motif !== 'retrait' && r.motif !== 'demission') return { preavisFin: r.notif, admises: [r.notif] };
  const anc = fullMonthsBetween(start, r.notif);
  const depart = r.presentation && r.presentation > r.notif ? r.presentation : r.notif;
  const preavisFin = finPreavis(depart, preavisEmployeur(anc));
  const admises = [preavisFin, addDays(preavisFin, 1)];
  if (r.motif === 'demission' && anc >= 3 && anc < 12) {
    const finMois = finPreavis(depart, {});
    admises.push(finMois, addDays(finMois, 1));
  }
  return { preavisFin, admises };
}

const lo2 = (a: ISODate, b: ISODate) => (a < b ? a : b);
const hi2 = (a: ISODate, b: ISODate) => (a > b ? a : b);

const REGLE_DISPENSE = 'si les parents t’ont dispensée de tout ou partie du préavis, ils te doivent une indemnité compensatrice égale au salaire jusqu’à la date prévue de fin du préavis (convention, articles 64, 64.2 et 66)';

/**
 * T-045b (P3-B1, C3-1 de V5) : la date de fin saisie avec le contrat concorde-t-elle avec le préavis ? Sinon, la période
 * touchée (`du`, `au`) et le message de refus. Jamais un total silencieux : chaque mois, régularisation ou période de
 * congés qui touche cette période est refusé (nonGeresPeriode).
 */
export function controleFinContrat(c: Pick<Contract, 'start' | 'end' | 'rupture'> & Partial<Pick<Contract, 'cdd'>>): { du: ISODate; au: ISODate; message: string } | undefined {
  const end = c.end;
  if (!end) return undefined;
  const r = c.rupture;
  // T-076 (R-CDD-06) : un CDD « cesse de plein droit à l'échéance du terme » (C. trav. L1243-5), sans préavis. Aucun mois ne
  // dépend d'un préavis : la date de fin saisie n'est pas contrôlée face à un préavis. Seule une fin enregistrée avec les
  // règles d'un CDI (lettre, préavis) est refusée, ou un dernier jour enregistré qui n'est pas la date de fin.
  if (c.cdd) {
    if (r && r.motif !== 'fin_cdd') {
      return { du: lo2(r.notif, end), au: hi2(r.notif, end), message: 'Ce contrat est un CDD, mais la fin enregistrée suit les règles d’un CDI (lettre, préavis). Refais la fin dans l’écran « Fin de contrat » : dis comment finit le CDD.' };
    }
    if (r && r.notif !== end) {
      return { du: lo2(r.notif, end), au: hi2(r.notif, end), message: `La date de fin du contrat (${shortDate(end)}) n’est pas le dernier jour enregistré dans l’écran « Fin de contrat » (${shortDate(r.notif)}). Corrige l’une des deux.` };
    }
    return undefined;
  }
  if (!r) {
    // Le préavis dure au plus un mois (art. 120) : la période où il a pu ne pas être fait commence un mois avant la fin.
    return {
      du: addMonthsToDate(end, -1), au: end,
      message: `Fin du contrat le ${shortDate(end)} : l’app ne sait pas si le préavis a été fait. Or ${REGLE_DISPENSE}, et le dernier mois change selon la réponse. Réponds aux questions de l’écran « Fin de contrat » et enregistre-les : les derniers mois seront calculés ensuite.`,
    };
  }
  const { preavisFin, admises } = finsAdmises(c.start, r);
  const lo = (...d: ISODate[]) => d.reduce((a, b) => (a < b ? a : b));
  const hi = (...d: ISODate[]) => d.reduce((a, b) => (a > b ? a : b));
  const d = r.dernierJourTravaille;
  if (r.preavis === 'employeur') {
    return {
      du: lo(d ?? r.notif, end), au: hi(end, preavisFin),
      message: `Préavis non fait à la demande des parents : le contrat finit le ${shortDate(preavisFin)}, date prévue de fin du préavis, et ${REGLE_DISPENSE.replace('si les parents t’ont dispensée de tout ou partie du préavis, ', '')}. L’app ne calcule pas ce cas : aucun texte ne dit comment cette indemnité entre dans la régularisation, les congés et l’indemnité de rupture. Fais ces mois avec les parents.`,
    };
  }
  if (r.preavis === 'am_sans_accord') {
    return {
      du: lo(d ?? r.notif, end), au: hi(end, preavisFin),
      message: 'Préavis non fait sans l’accord des parents : ils peuvent te demander une indemnité égale au salaire net de la partie du préavis non faite (convention, article 64.2) et des dommages et intérêts (code de l’action sociale et des familles, article L423-26). L’app ne calcule pas ce cas. Fais ces mois avec les parents.',
    };
  }
  if (r.preavis === 'am_acceptee') {
    if (!d || d < r.notif || d > preavisFin || (r.motif !== 'retrait' && r.motif !== 'demission')) {
      return { du: lo(r.notif, end), au: hi(end, preavisFin), message: 'Préavis non fait à ta demande : les dates enregistrées ne concordent pas (dernier jour travaillé manquant, avant la lettre ou après la fin du préavis). Corrige-les dans l’écran « Fin de contrat ».' };
    }
    if (end !== d) {
      return { du: lo(d, end), au: hi(d, end), message: `La date de fin du contrat (${shortDate(end)}) n’est pas le dernier jour travaillé enregistré (${shortDate(d)}). Préavis non fait à ta demande, accepté par les parents : le contrat finit ce jour-là (convention, articles 64 et 64.2). Corrige la date de fin.` };
    }
    return undefined;
  }
  if (!admises.includes(end)) {
    return {
      du: lo(end, preavisFin), au: hi(end, preavisFin),
      message: `La date de fin du contrat (${shortDate(end)}) ne concorde pas avec la fin du préavis calculée (${shortDate(preavisFin)}) pour un préavis fait en entier. Si le préavis n’a pas été fait en entier, dis-le dans l’écran « Fin de contrat » ; sinon corrige la date de fin.`,
    };
  }
  return undefined;
}
