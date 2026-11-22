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

/** Le CDD a-t-il deux lectures de salaire (P1 ou P2) ? */
export function cddDeuxLectures(c: CddChamps): boolean {
  return estCddMoinsUnMois(c) || estCddSemainesSansAccueil(c);
}

export const CDD_A_COMPLETER =
  'CDD à compléter : ouvre le contrat et indique la date de fin prévue du CDD (ou, pour un remplacement sans date précise, la fin de la durée minimale). L’app ne calcule pas ce mois avant.';
export const NON_GERE_CDD_P1_P2 =
  'CDD de moins d’un mois avec des semaines sans accueil : non géré. Chacun de ces deux cas a deux façons de calculer le salaire, et l’app ne sait pas les combiner. Fais la paie sans l’app.';

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
export function messageApresTerme(terme: string): string {
  return `Tu travailles après la date de fin prévue de ton CDD (${shortDate(terme)}), sans fin enregistrée à cette date. Sans nouveau contrat, ton CDD est devenu un CDI (code du travail, article L1243-11). Si la date a été reportée par écrit, mets la nouvelle date de fin prévue dans le contrat ; si le CDD a fini, enregistre la fin dans l’écran « Fin de contrat » ; sinon passe le contrat en CDI. L’app ne calcule pas ces jours avant.`;
}

/** Cas du contrat CDD que l'app refuse (tous ses mois) */
export function nonGeresCdd(c: CddChamps): string[] {
  if (!c.cdd) return [];
  if (!c.cddTerme) return [CDD_A_COMPLETER];
  if (estCddMoinsUnMois(c) && estCddSemainesSansAccueil(c)) return [NON_GERE_CDD_P1_P2];
  if (c.planningVariable) return [NON_GERE_CDD_PV];
  return [];
}

/** Texte des deux lectures du salaire d'un mois (écran Mois), sans montant */
export function libelleLecturesCdd(c: CddChamps): { l1: string; l2: string; pourquoi: string } {
  if (estCddMoinsUnMois(c)) {
    return {
      l1: 'salaire mensualisé sur 12 mois, réduit pour les jours hors du CDD (convention, articles 108.1 et 111)',
      l2: 'taux horaire × heures réellement faites (DREETS Occitanie, pour un CDD de moins d’un mois)',
      pourquoi: 'Ton CDD dure moins d’un mois. Aucun texte ne dit quelle façon de calculer s’applique. La question est posée à la DDETS.',
    };
  }
  return {
    l1: 'semaines d’accueil du contrat sur 12 mois, avec une régularisation à la fin (convention, articles 109.2 et 124)',
    l2: '52 semaines sur 12 mois, moins les semaines sans accueil (convention, article 111)',
    pourquoi: 'Ton CDD a des semaines sans accueil. Aucun texte ne dit quelle façon de calculer s’applique. La question est posée à la DDETS.',
  };
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

