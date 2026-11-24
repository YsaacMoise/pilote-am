// T-076 : contrat à durée déterminée (CDD). Cas et messages, sans calcul de paie (regles/t076-cdd.md ;
// regles/t076-decisions-direction.md, section 2). Module sans dépendance au moteur de paie, pour que nonGeres.ts et
// payroll.ts s'en servent sans boucle d'import.
import { addDays, addMonthsToDate, shortDate } from './dates';
import type { Contract } from './model';

type CddChamps = Partial<Pick<Contract, 'cdd' | 'start' | 'cddTerme' | 'cddTermeImprecis' | 'yearType' | 'avenants' | 'planningVariable'>>;

/**
 * P1 (regles/t076-cdd.md, partie 3) : CDD « conclu à terme précis pour une durée inférieure à un mois » (DREETS Occitanie,
 * guide CDD p. 7). Durée comptée du premier jour au terme compris : moins d'un mois quand le lendemain du terme tombe avant
 * la même date du mois suivant (du 10/03 au 08/04 : moins d'un mois ; du 10/03 au 09/04 : un mois). Aucun texte ne fixe ce
 * décompte ; choix noté dans le rapport du correcteur.
 */
export function estCddMoinsUnMois(c: CddChamps): boolean {
  if (!c.cdd || !c.start || !c.cddTerme || c.cddTermeImprecis) return false;
  return addDays(c.cddTerme, 1) < addMonthsToDate(c.start, 1);
}

/** P2 : CDD avec des semaines sans accueil prévues au contrat (année incomplète, au départ ou par avenant) */
export function estCddSemainesSansAccueil(c: CddChamps): boolean {
  if (!c.cdd) return false;
  return c.yearType === 'incomplete' || (c.avenants ?? []).some((a) => a.changes.yearType === 'incomplete');
}

export const CDD_A_COMPLETER =
  'CDD à compléter : ouvre le contrat et indique la date de fin prévue du CDD (ou, pour un remplacement sans date précise, la fin de la durée minimale). L’app ne calcule pas ce mois avant.';
/**
 * T-076, décision D15 de la direction (regles/t076-decisions-direction.md, section 5 ; remplace D3) : CDD à horaires
 * variables refusé en entier au passage 1. Les deux lectures du CDD (P1, P2) ne sont pas définies avec un planning variable
 * (relecture R1 : heures prévues au-delà de la base payées deux fois en P1 ; R3 : congés de la période précédente).
 */
export const NON_GERE_CDD_PV =
  'CDD avec des horaires qui changent d’une semaine à l’autre : non géré pour l’instant. Le salaire d’un CDD court ou avec des semaines sans accueil se calcule de deux façons, et l’app ne sait pas encore les combiner avec des horaires variables, ni la fin de ce CDD. Fais la paie sans l’app.';
/** D3 (section 4), gardé pour les écrans et tests qui le citent : même refus que D15 */
export const NON_GERE_CDD_PV_P2 = NON_GERE_CDD_PV;

/**
 * Décision D18 (section 5) : mois travaillés après le terme précis d'un CDD sans fin enregistrée à cette date : le CDD est
 * devenu un CDI (C. trav. L1243-11). Les jours après le terme sont refusés.
 */
/**
 * N2 (relecture 2) : seuls les jours après le terme sont refusés, et seulement une fois le terme passé (aujourd'hui après
 * le terme). Avant, le mois du terme est calculé et une alerte dit d'enregistrer la fin (`messageTermeAVenir`).
 */
export function joursApresTermeRefuses(c: CddChamps & Partial<Pick<Contract, 'end'>>, jusqua: string, today: string): boolean {
  return !!c.cdd && !!c.cddTerme && !c.cddTermeImprecis && (!c.end || c.end > c.cddTerme) && jusqua > c.cddTerme && today > c.cddTerme;
}
export function messageTermeAVenir(terme: string): string {
  return `Ton CDD finit le ${shortDate(terme)}. Ce mois est calculé jusqu’au bout pour l’instant. Le jour venu, enregistre la fin dans l’écran « Fin de contrat » : le mois s’arrêtera à cette date.`;
}
export function messageMoisApresTerme(terme: string): string {
  return `Ce mois est après la date de fin prévue de ton CDD (${shortDate(terme)}) : l’app ne le calcule pas. Si la date a été reportée (renouvellement, ou retour de la personne remplacée : code du travail, article L1243-7), mets la nouvelle date de fin prévue dans le contrat.`;
}
export function messageApresTerme(terme: string): string {
  return `La date de fin prévue de ton CDD (${shortDate(terme)}) est passée, et aucune fin n’est enregistrée à cette date. Si tu as continué à travailler après sans nouveau contrat, ton CDD est devenu un CDI (code du travail, article L1243-11). Si la date a été reportée (renouvellement, ou retour de la personne remplacée : article L1243-7), mets la nouvelle date de fin prévue dans le contrat ; si le CDD a fini, enregistre la fin dans l’écran « Fin de contrat » ; sinon passe le contrat en CDI. L’app ne calcule pas ces jours avant.`;
}

/** Cas du contrat CDD que l'app refuse (tous ses mois) */
export function nonGeresCdd(c: CddChamps): string[] {
  if (!c.cdd) return [];
  if (!c.cddTerme) return [CDD_A_COMPLETER];
  if (c.planningVariable) return [NON_GERE_CDD_PV];
  return [];
}

/**
 * N1 (relecture 2), D19 : dernier jour possible de la période d'essai d'un CDD. C. trav. L1242-10 : « une durée calculée à
 * raison d'un jour par semaine, dans la limite de deux semaines lorsque la durée initialement prévue au contrat est au plus
 * égale à six mois et d'un mois dans les autres cas. Lorsque le contrat ne comporte pas de terme précis, la période d'essai
 * est calculée par rapport à la durée minimale du contrat. » Durée : du début à `cddTerme` (terme ou fin de la durée
 * minimale) ; un renouvellement ne fait qu'allonger le terme, donc un terme à six mois ou moins prouve une durée initiale à
 * six mois ou moins. Aucun texte ne dit comment compter les semaines (R-CDD-12) : deux lectures, semaines entières
 * (`court`) ou semaines commencées (`long`). Jours comptés de date à date.
 */
export function finEssaiCdd(c: CddChamps): { court: string; long: string } | undefined {
  if (!c.cdd || !c.start || !c.cddTerme) return undefined;
  const jours = Math.round((Date.parse(c.cddTerme) - Date.parse(c.start)) / 86400000) + 1;
  const sixMois = addDays(c.cddTerme, 1) <= addMonthsToDate(c.start, 6);
  const fin = (semaines: number): string => {
    if (sixMois) return addDays(c.start!, Math.min(semaines, 14) - 1);
    const unMois = addDays(addMonthsToDate(c.start!, 1), -1);
    const parSemaine = addDays(c.start!, semaines - 1);
    return parSemaine < unMois ? parSemaine : unMois;
  };
  return { court: fin(Math.floor(jours / 7)), long: fin(Math.ceil(jours / 7)) };
}

/** Messages du contrat CDD (écran Contrat et fin), tirés de regles/t076-cdd.md, partie 5.2 */
export const MESSAGE_CDD_12_MOIS = 'Ton salaire est calculé sur 12 mois, même si ton CDD est plus court.';
export const MESSAGE_CDD_DEVIENT_CDI = 'Si tu continues à garder l’enfant après la date de fin sans nouveau contrat, ton CDD devient un CDI.';
export const MESSAGE_CDD_MOTIF_AUTRE = 'Pour une assistante maternelle, un CDD sert en principe à remplacer une collègue absente. Vérifie ton contrat.';
export const MESSAGE_CDD_18_MOIS = 'Ton CDD dépasse les limites de la loi. Le juge pourrait le transformer en CDI. Renseigne-toi.';

/** R-CDD-14 : plus de 18 mois en terme précis (L1242-8-1) ; les renouvellements ne sont pas suivis par l'app */
export function cddPlusDe18Mois(c: CddChamps): boolean {
  return !!c.cdd && !!c.start && !!c.cddTerme && !c.cddTermeImprecis && c.cddTerme >= addMonthsToDate(c.start, 18);
}

/** Messages à afficher avec un CDD (contrôles sans montant) */
export function messagesCdd(c: CddChamps & Partial<Pick<Contract, 'cddMotif'>>): string[] {
  if (!c.cdd) return [];
  const out = [MESSAGE_CDD_12_MOIS, MESSAGE_CDD_DEVIENT_CDI];
  if (c.cddMotif === 'autre') out.push(MESSAGE_CDD_MOTIF_AUTRE);
  if (cddPlusDe18Mois(c)) out.push(MESSAGE_CDD_18_MOIS);
  return out;
}

export const libelleTerme = (c: CddChamps): string =>
  c.cddTerme ? `${c.cddTermeImprecis ? 'fin de la durée minimale' : 'date de fin prévue'} le ${shortDate(c.cddTerme)}` : 'date de fin prévue non saisie';

