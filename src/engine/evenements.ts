// Congés pour événements familiaux (R-ABS-06, T-023).
// Durées : CCN IDCC 3239, socle commun, art. 48.1.3.1.1 (version de l'avenant n° 4 du 16/10/2023) et Code du travail
// L3142-4 (plancher : la durée conventionnelle « ne peut être inférieure à »), rendu applicable aux AM par CASF L423-2, 12°.
// On retient la plus favorable à l'AM. Les jours sont des jours ouvrables (CCN 48.1.3.1.1 ; L3142-4, dernier alinéa).
// Textes relus le 18/11/2026 : projet/moteur/correctifs-t023.md, section 1.3.
import { addDays, daysBetween, eachDay, weekday, type ISODate } from './dates';
import { holidayName } from './holidays';
import type { AmLeave, NatureEvenement } from './model';

/** Libellés proposés à l'AM, dans l'ordre de l'article 48.1.3.1.1 */
export const NATURE_EVENEMENT_LABEL: Record<NatureEvenement, string> = {
  mariage: 'Mon mariage ou mon PACS',
  mariage_enfant: 'Mariage ou PACS de mon enfant',
  naissance: 'Naissance ou arrivée d’un enfant placé en vue d’adoption',
  deces_enfant: 'Décès de mon enfant (25 ans ou plus, sans enfant)',
  deces_enfant_14: 'Décès de mon enfant de moins de 25 ans, ou qui était lui-même parent, ou d’une personne de moins de 25 ans à ma charge',
  deces_proche: 'Décès du conjoint, partenaire de PACS, concubin, père, mère, beau-père, belle-mère, frère ou sœur',
  handicap_enfant: 'Annonce d’un handicap, d’une pathologie chronique ou d’un cancer chez un enfant',
  deces_descendant: 'Décès d’un petit-enfant ou arrière-petit-enfant',
  deces_ascendant: 'Décès d’un grand-parent ou arrière-grand-parent',
  deuil: 'Congé de deuil (8 jours, décès d’un enfant de moins de 25 ans)',
};

/**
 * Premier jour géré : les deux lectures de l'entrée en vigueur de l'avenant n° 4 (16/10/2023 selon Légifrance,
 * 01/05/2024 selon son article 4 et le JORF du 03/04/2024) donnent la nouvelle version de 48.1.3.1.1 à partir
 * du 01/05/2024 (t021-convention.md 2.8). Avant : version applicable non tranchée.
 */
export const EVENEMENTS_GERES_DEPUIS: ISODate = '2024-05-01';
/** Dernier jour avant la nouvelle rédaction de L3142-4, 6° (loi n° 2026-492 du 12 juin 2026, art. 6) */
const L3142_4_AVANT_2026 = '2026-06-13';

/** Durée en jours ouvrables à la date `d` : max(CCN 48.1.3.1.1, C. trav. L3142-4). `undefined` : non géré. */
export function dureeEvenement(nature: NatureEvenement, d: ISODate): number | undefined {
  switch (nature) {
    case 'mariage': return 4; // CCN 4 ; L3142-4, 1° : 4
    case 'mariage_enfant': return 1; // CCN 1 (mariage ou PACS) ; L3142-4, 2° : 1 (mariage)
    case 'naissance': return 3; // CCN 3 ; L3142-4, 3° et 3° bis : 3
    case 'deces_enfant': return 12; // CCN 12 ; L3142-4, 4° : 12
    case 'deces_enfant_14': return 14; // CCN 14 ; L3142-4, 4° : 14
    case 'deces_proche': return 3; // CCN 3 ; L3142-4, 5° : 3
    case 'handicap_enfant': return d <= L3142_4_AVANT_2026 ? 5 : 10; // CCN 5 ; L3142-4, 6° : 5 puis 10 dès le 14/06/2026
    case 'deces_descendant': return 1; // CCN 1 ; rien dans L3142-4
    case 'deces_ascendant': return 1; // CCN 1 ; rien dans L3142-4
    // Art. 48.1.3.1.2 : 8 jours ouvrables, indemnisés par la sécurité sociale (C. trav. L3142-2 renvoie à CSS L331-9).
    // Art. 48.1.3.1.3 (maintien sous déduction des indemnités journalières) : non géré par l'app.
    case 'deuil': return undefined;
  }
}

/** Jour ouvrable : lundi → samedi, hors jours fériés (même règle que le décompte des congés payés, conges.ts) */
const ouvrable = (d: ISODate) => weekday(d) <= 6 && !holidayName(d);
const lundiSamedi = (d: ISODate) => weekday(d) <= 6;

/**
 * T-025 C-1 : la durée se compte par événement, pas par absence saisie (CCN 48.1.3.1.1 : « 4 jours ouvrables pour son
 * mariage » ; « Ces congés sont pris au moment de l'événement ou […] dans les jours qui entourent l'événement » ;
 * naissance : « dans les 15 jours entourant l'événement »). L'app ne sait pas si deux absences de même nature sont le
 * même événement. Choix sans texte (signalé) : deux absences « événement » de même nature séparées de 15 jours
 * calendaires au plus sont reliées ; leurs jours se cumulent. Ce qui dépasse la durée est « à confirmer », jamais payé
 * ni retenu en silence.
 */
export const LIEN_EVENEMENT_JOURS = 15;

/** Absences de même nature reliées à `l` (elle comprise), de la plus ancienne à `l` */
export function chaineEvenement(l: AmLeave, leaves: AmLeave[]): AmLeave[] {
  const chaine = [l];
  let cur = l;
  for (;;) {
    let prev: AmLeave | undefined;
    for (const p of leaves) {
      if (p === cur || p.id === cur.id || p.type !== 'evenement' || p.nature !== l.nature || p.from >= cur.from) continue;
      if (daysBetween(p.to, cur.from) > LIEN_EVENEMENT_JOURS) continue;
      if (!prev || p.to > prev.to) prev = p;
    }
    if (!prev || chaine.includes(prev)) return chaine;
    chaine.unshift(prev);
    cur = prev;
  }
}

/**
 * Jours comptés pour la durée, jusqu'à `d` compris : les jours des absences reliées, plus les jours entre deux absences
 * qui se suivent sans jour ouvré entre elles (un week-end ou un férié : même compte que si une seule absence avait été
 * saisie). Le jour `d` doit être dans la dernière absence de la chaîne.
 */
function joursCouverts(chaine: AmLeave[], d: ISODate): ISODate[] {
  const set = new Set<ISODate>();
  chaine.forEach((x, i) => {
    for (const j of eachDay(x.from, x.to < d ? x.to : d)) set.add(j);
    const suiv = chaine[i + 1];
    if (suiv && x.to < suiv.from) {
      const entre = eachDay(addDays(x.to, 1), addDays(suiv.from, -1));
      if (entre.every((j) => weekday(j) === 7 || weekday(j) === 6 || holidayName(j))) for (const j of entre) set.add(j);
    }
  });
  return [...set].filter((j) => j <= d).sort();
}

/**
 * Statut d'un jour d'événement familial : payé comme événement, ou à confirmer avec la raison et ce qu'il faut faire.
 * `leaves` : toutes les absences de l'AM, pour relier les saisies d'un même événement (T-025 C-1).
 */
export function statutJourEvenement(l: AmLeave, d: ISODate, leaves: AmLeave[] = [l]): { paye: true } | { paye: false; raison: string } {
  const qui = `Événement familial du ${jjmm(l.from)} au ${jjmm(l.to)}`;
  if (!l.nature) {
    return { paye: false, raison: `${qui} : la nature de l’événement n’est pas renseignée : la durée payée en dépend. Dans Congés, supprime cette absence et saisis-la à nouveau avec sa nature (mariage, naissance, décès…).` };
  }
  const chaine = chaineEvenement(l, leaves);
  const debut = chaine[0];
  if (debut.from < EVENEMENTS_GERES_DEPUIS) {
    return { paye: false, raison: `${qui} : période non gérée (avant le 01/05/2024, la version applicable de l’article 48.1.3.1.1 n’est pas tranchée). Vérifie la durée avec les parents.` };
  }
  const duree = dureeEvenement(l.nature, debut.from);
  if (duree === undefined) {
    return { paye: false, raison: `${qui} : congé de deuil non géré par l’app. La sécurité sociale verse des indemnités journalières ; l’employeur maintient le salaire en les déduisant (article 48.1.3.1.3). Calcule-le avec les parents.` };
  }
  // T-025 C-4 : le texte ne dit pas si un férié tombant du lundi au samedi compte dans les jours ouvrables du congé.
  // Lecture 1 (férié compté) : `nAvec` ; lecture 2 (férié non compté, payé comme férié chômé : art. 47.2 « sauf
  // autorisation d'absence préalablement accordée », 47.1 pour le 1er Mai) : `nSans`. Un jour est payé s'il l'est dans
  // les deux lectures (nAvec ≤ durée). Le férié pendant le congé est dû dans les deux. Le jour couvert dans la seule
  // lecture 2 est « à confirmer ».
  const couverts = joursCouverts(chaine, d);
  const nAvec = couverts.filter(lundiSamedi).length;
  const nSans = couverts.filter(ouvrable).length;
  if (lundiSamedi(d) && nAvec <= duree) return { paye: true };
  if (lundiSamedi(d) && nSans <= duree && (ouvrable(d) || nSans < duree)) {
    return {
      paye: false,
      raison: `${qui} : un jour férié tombe pendant le congé. Le texte ne dit pas s’il compte dans les ${dureeLabel(duree)}. S’il compte, ce jour dépasse la durée ; sinon, il est dû. Vérifie avec les parents.`,
    };
  }
  if (!lundiSamedi(d) && nSans < duree) {
    return { paye: false, raison: `${qui} : un jour prévu au planning tombe un dimanche pendant le congé ; l’app ne sait pas s’il est couvert. Vérifie-le avec les parents.` };
  }
  const autres = chaine.slice(0, -1);
  if (autres.length) {
    // Lecture « autre événement » : la durée se compte depuis cette seule absence.
    const dureeSeule = dureeEvenement(l.nature, l.from) ?? 0;
    const nSeule = eachDay(l.from, d).filter(ouvrable).length;
    const dates = autres.map((x) => `du ${jjmm(x.from)} au ${jjmm(x.to)}`).join(', ');
    if (ouvrable(d) && nSeule <= dureeSeule) {
      return {
        paye: false,
        raison: `${qui} : une autre absence pour le même type d’événement est saisie ${dates}. Si c’est le même événement, ce jour dépasse les ${dureeLabel(duree)} prévus (convention, article 48.1.3.1.1) ; si c’est un autre événement, il est dû. Vérifie avec les parents. Si c’est le même, saisis ce jour en congé payé ou sans solde, selon votre accord.`,
      };
    }
    return {
      paye: false,
      raison: `${qui} : ${dureeLabel(duree)} au plus pour cet événement (convention, article 48.1.3.1.1, et Code du travail L3142-4), en comptant l’absence saisie ${dates}. Les jours en plus ne sont pas payés comme événement : saisis-les en congé payé ou sans solde, selon votre accord.`,
    };
  }
  return {
    paye: false,
    raison: `${qui} : ${dureeLabel(duree)} au plus pour cet événement (convention, article 48.1.3.1.1, et Code du travail L3142-4). Les jours en plus ne sont pas payés comme événement : saisis-les en congé payé ou sans solde, selon votre accord. Le jour en plus pour un déplacement de plus de 600 km aller-retour est non rémunéré : saisis-le en congé sans solde.`,
  };
}

function dureeLabel(n: number): string {
  return `${n} jour${n > 1 ? 's' : ''} ouvrable${n > 1 ? 's' : ''}`;
}
function jjmm(d: ISODate): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}
