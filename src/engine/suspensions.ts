// T-104 : absences de l'AM qui suspendent le contrat et que l'app calcule désormais (regles/t104-absences-protegees.md).
// Congé de maternité, congé de paternité et d'accueil de l'enfant, congé supplémentaire de naissance, accident du travail,
// accident de trajet ou maladie professionnelle. Module sans dépendance au moteur de paie (payroll.ts, conges.ts,
// nonGeres.ts, preavis.ts et fin.ts s'en servent).
import { addDays, addMonthsToDate, shortDate, type ISODate } from './dates';
import { AM_SUSPENSIONS, type AmAbs, type AmLeave, type AmSuspension } from './model';

export const estSuspension = (t: AmAbs | undefined): t is AmSuspension => !!t && (AM_SUSPENSIONS as string[]).includes(t);

/**
 * R-ABS-01 (salaire) : aucune de ces absences n'est payée par le parent ; elle est retenue par la déduction de l'art. 111.
 * Seule exception : le jour de l'accident (du travail ou de trajet), « intégralement à la charge de l'employeur » (CSS L433-1,
 * al. 1). Une maladie professionnelle n'a pas de « journée […] au cours de laquelle l'accident s'est produit ».
 */
export function jourAccidentPaye(l: AmLeave, d: ISODate): boolean {
  return l.type === 'at_mp' && (l.atmp === 'accident' || l.atmp === 'trajet') && l.jourAccident === true && d === l.from;
}

/** Donnée qui manque pour calculer une absence de ce type (demandée une fois, à la saisie ou dans « Congés ») */
export function donneeSuspensionManquante(l: AmLeave): string | undefined {
  const quand = l.from === l.to ? `du ${shortDate(l.from)}` : `du ${shortDate(l.from)} au ${shortDate(l.to)}`;
  if (l.type === 'non_gere') {
    return `Absence ${quand} enregistrée avant la mise à jour sans sa raison : ouvre « Congés » et dis ce que c’était (congé maternité, paternité, de naissance, accident du travail ou maladie professionnelle). L’app calcule ce mois dès que c’est fait.`;
  }
  if (l.type !== 'at_mp') return undefined;
  if (!l.atmp) return `Arrêt ${quand} : ouvre « Congés » et dis si c’est un accident du travail, un accident de trajet ou une maladie professionnelle. Les règles ne sont pas les mêmes (convention, articles 49 et 64.1). L’app calcule ce mois dès que c’est fait.`;
  if (l.atmp !== 'maladie_pro' && l.jourAccident === undefined) return `Arrêt ${quand} : ouvre « Congés » et dis si le premier jour de l’arrêt est le jour de l’accident. Ce jour-là est payé en entier par les parents (code de la sécurité sociale, article L433-1). L’app calcule ce mois dès que c’est fait.`;
  return undefined;
}

/**
 * Début de l'arrêt ininterrompu dont fait partie `l` : arrêts `at_mp` de même nature qui se suivent sans un jour d'écart
 * (prolongations). Sert à la limite d'un an de l'art. 49 de la convention (accident de trajet).
 */
export function debutArretIninterrompu(l: AmLeave, leaves: AmLeave[]): ISODate {
  let debut = l.from;
  for (let changed = true; changed;) {
    changed = false;
    for (const x of leaves) {
      if (x.type !== 'at_mp' || x.atmp !== l.atmp || x.from >= debut) continue;
      if (addDays(x.to, 1) >= debut) { debut = x.from; changed = true; }
    }
  }
  return debut;
}

/**
 * R-ABS-03 (acquisition des congés payés) : sorte du jour `d` d'une suspension pour le décompte des jours acquis.
 * - Maternité, paternité : travail effectif (C. trav. L3141-5, 2° ; CCN 48.1.2.2.2 et 48.1.2.3).
 * - Accident du travail, maladie professionnelle : travail effectif, sans limite de durée (L3141-5, 5°, version de la loi
 *   n° 2024-364 ; la limite d'un an de l'art. 49 de la convention, moins favorable, est écartée : L3141-9, L2251-1 ; avant le
 *   24/04/2024, Cass. soc. 13/09/2023, n° 22-17.638, publié, écarte déjà la limite au nom de l'art. 31 § 2 de la Charte).
 * - Accident de trajet : travail effectif pendant un an d'arrêt ininterrompu (CCN 49) ; au-delà, arrêt non professionnel au
 *   sens du code du travail (L1226-7 exclut le trajet du régime de l'accident du travail) : 2 jours par mois, 24 au plus
 *   (L3141-5, 7° et L3141-5-1).
 * - Congé supplémentaire de naissance : hors travail effectif (L3141-5 ne le cite pas ; CCN 48.1.1.2, prorata).
 */
export function sorteCongesSuspension(l: AmLeave, d: ISODate, leaves: AmLeave[]): 'travail' | 'maladie' | 'hors' {
  if (l.type === 'naissance_supp') return 'hors';
  if (l.type === 'at_mp' && l.atmp === 'trajet') {
    const debut = debutArretIninterrompu(l, leaves);
    return d < addMonthsToDate(debut, 12) ? 'travail' : 'maladie';
  }
  return 'travail';
}

/**
 * R-ABS-07 (préavis) : CCN 64.1, version en vigueur depuis le 01/12/2024 : le préavis « ne peut pas non plus être suspendu
 * sauf en cas : – d'arrêt de travail consécutif à un accident du travail ou à une maladie professionnelle survenant en cours
 * de période de préavis ; – de suspension du contrat de travail consécutive à un congé de maternité ou d'adoption ; – de prise
 * de congés payés » ; « En cas d'exécution totale du préavis par le salarié, la date de fin du contrat de travail correspond à
 * la date de fin du préavis prorogé, le cas échéant, de la durée correspondant aux trois cas de suspension […] intervenus durant
 * la période de préavis ». Version du 01/01/2022 au 30/11/2024 : « arrêt de travail consécutif à un accident du travail ou à
 * une maladie professionnelle », sans la condition « survenant en cours de période de préavis ». L'accident de trajet, la
 * paternité et le congé supplémentaire de naissance ne sont pas cités : pas de suspension.
 * T-107 (cas 1) : congés payés, troisième cas de l'art. 64.1, dans ses deux versions (« de prise de congés payés. Néanmoins, et
 * par exception, les périodes de préavis et de congés payés peuvent se cumuler en cas d'accord écrit et signé des parties »).
 * `cumulCp` : réponse de l'AM à la question de l'écran Fin. Vrai : accord écrit et signé de cumul, les congés ne suspendent pas
 * le préavis. Faux : ils le suspendent. Absent : comme faux pour le calcul de la date, mais la réponse est demandée avant tout
 * montant (`cpPendantPreavis`, fin.ts et preavis.ts).
 * Rend la fin prorogée : chaque jour calendaire de suspension entre le début du préavis et sa fin (prorogée) la recule d'un jour.
 */
export function finPreavisProrogee(depart: ISODate, fin: ISODate, leaves: AmLeave[], cumulCp?: boolean): ISODate {
  const avant2024 = depart < '2024-12-01';
  const suspend = (d: ISODate): boolean => leaves.some((l) => d >= l.from && d <= l.to && (
    l.type === 'maternite'
    || (l.type === 'at_mp' && (l.atmp === 'accident' || l.atmp === 'maladie_pro') && (avant2024 || l.from >= depart))
    || (l.type === 'cp' && cumulCp !== true)));
  let f = fin;
  for (let d = depart; d <= f; d = addDays(d, 1)) if (suspend(d)) f = addDays(f, 1);
  return f;
}

/**
 * T-107 (cas 1) : des congés payés tombent-ils dans le préavis (prorogé par les autres suspensions, et par les congés eux-mêmes
 * s'il n'y a pas d'accord de cumul) ? Vrai : la réponse sur l'accord écrit de cumul (CCN 64.1) change la date de fin.
 */
export function cpPendantPreavis(depart: ISODate, fin: ISODate, leaves: AmLeave[]): boolean {
  const f = finPreavisProrogee(depart, fin, leaves, false);
  return leaves.some((l) => l.type === 'cp' && l.from <= f && l.to >= depart);
}

/** T-107 (cas 1) : question posée une fois, dans l'écran Fin, quand des congés payés tombent dans le préavis */
export const QUESTION_CUMUL_CP = 'Tu prends des congés payés pendant ton préavis. As-tu, avec les parents, un accord écrit et signé pour que les congés et le préavis se déroulent en même temps ?';
export const MESSAGE_CUMUL_CP_A_REPONDRE = `${QUESTION_CUMUL_CP} Sans cet accord, les congés suspendent le préavis et le contrat finit plus tard (convention, article 64.1). Réponds à la question dans l’écran « Fin de contrat » et enregistre : l’app calcule les derniers mois ensuite.`;

/** Message à l'AM quand le préavis est prorogé (CCN 64.1) */
export function messageProrogation(fin: ISODate, prorogee: ISODate): string {
  let n = 0;
  for (let d = fin; d < prorogee; d = addDays(d, 1)) n++;
  return `Ton préavis est suspendu pendant ton congé maternité, ton arrêt pour accident du travail ou maladie professionnelle, ou tes congés payés pris sans accord écrit de cumul (convention, article 64.1) : il finit ${n} jour${n > 1 ? 's' : ''} plus tard, le ${shortDate(prorogee)}, au lieu du ${shortDate(fin)}.`;
}

/**
 * R-ABS-06 (protection contre la rupture) : textes du chapitre V applicables à l'AM par CASF L423-2, 3°.
 * - L1225-4 : aucune rupture « pendant l'intégralité des périodes de suspension du contrat de travail auxquelles elle a droit au
 *   titre du congé de maternité […] et au titre des congés payés pris immédiatement après le congé de maternité ainsi que
 *   pendant les dix semaines suivant l'expiration de ces périodes » ; exception (faute grave non liée à la grossesse,
 *   impossibilité de maintenir le contrat pour un motif étranger), mais « la rupture du contrat de travail ne peut prendre effet
 *   ou être notifiée pendant les périodes de suspension ». Cass. soc. 31/01/2018, n° 16-17.886, publié : retrait d'enfant d'une
 *   AM annulé (L1225-5).
 * - L1225-4-1 : aucune rupture « pendant les dix semaines suivant la naissance de son enfant » (même exception).
 * - L1225-4-5 : aucune rupture « pendant un congé supplémentaire de naissance » (même exception).
 * Accident du travail ou maladie professionnelle : L1226-9 est au chapitre VI, que CASF L423-2 ne cite pas ; Cass. soc.
 * 14/05/2025, n° 23-22.583, publié : le retrait de l'enfant reste possible pendant un arrêt de travail. Aucun message.
 * Les montants de la fin enregistrée sont calculés ; ces messages disent la règle.
 */
export function alertesProtection(leaves: AmLeave[], notif: ISODate, finContrat: ISODate): string[] {
  const out: string[] = [];
  const dans = (d: ISODate, a: ISODate, b: ISODate) => d >= a && d <= b;
  for (const l of leaves) {
    if (l.type === 'maternite') {
      // Congés payés pris juste après le congé : prolongent la période protégée (L1225-4).
      let fin = l.to;
      for (let changed = true; changed;) {
        changed = false;
        for (const x of leaves) if (x.type === 'cp' && x.from <= addDays(fin, 1) && x.from > l.from && x.to > fin) { fin = x.to; changed = true; }
      }
      if (dans(notif, l.from, fin) || dans(finContrat, l.from, fin)) {
        out.push(`Retrait de l’enfant pendant ton congé maternité ou les congés payés pris juste après (du ${shortDate(l.from)} au ${shortDate(fin)}) : la loi interdit qu’il te soit notifié ou qu’il prenne effet pendant cette période, quel que soit le motif (code du travail, article L1225-4). Un retrait fait quand même est nul (Cour de cassation, 31/01/2018, pour une assistante maternelle). Les montants ci-dessous sont ceux de la fin enregistrée. Renseigne-toi avant de l’accepter (relais petite enfance, DREETS).`);
      } else if (dans(notif, addDays(fin, 1), addDays(fin, 70))) {
        out.push(`Retrait de l’enfant moins de 10 semaines après ton congé maternité (fini le ${shortDate(fin)}) : la loi l’interdit, sauf faute grave sans lien avec ta grossesse ou impossibilité de garder le contrat pour un motif sans lien avec elle (code du travail, article L1225-4). Sinon, il est nul. Les montants ci-dessous sont ceux de la fin enregistrée. Renseigne-toi avant de l’accepter (relais petite enfance, DREETS).`);
      }
    }
    if (l.type === 'naissance_supp' && dans(notif, l.from, l.to)) {
      out.push(`Retrait de l’enfant pendant ton congé supplémentaire de naissance : la loi l’interdit, sauf faute grave ou impossibilité de garder le contrat pour un motif sans lien avec la naissance (code du travail, article L1225-4-5). Sinon, il est nul. Les montants ci-dessous sont ceux de la fin enregistrée. Renseigne-toi avant de l’accepter (relais petite enfance, DREETS).`);
    }
    if (l.type === 'paternite' && notif >= l.from && notif <= addDays(l.to, 70)) {
      out.push('Si ton enfant est né il y a moins de 10 semaines : la loi interdit le retrait pendant ces 10 semaines, sauf faute grave ou impossibilité de garder le contrat pour un motif sans lien avec la naissance (code du travail, article L1225-4-1). Sinon, il est nul. Les montants ci-dessous sont ceux de la fin enregistrée.');
    }
  }
  return [...new Set(out)];
}
