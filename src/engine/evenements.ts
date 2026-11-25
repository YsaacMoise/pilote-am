// Congés pour événements familiaux (R-ABS-06, T-023).
// Durées : CCN IDCC 3239, socle commun, art. 48.1.3.1.1 (version de l'avenant n° 4 du 16/10/2023) et Code du travail
// L3142-4 (plancher : la durée conventionnelle « ne peut être inférieure à »), rendu applicable aux AM par CASF L423-2, 12°.
// On retient la plus favorable à l'AM. Les jours sont des jours ouvrables (CCN 48.1.3.1.1 ; L3142-4, dernier alinéa).
// Textes relus le 18/11/2026 : projet/moteur/correctifs-t023.md, section 1.3.
import { addDays, daysBetween, eachDay, weekday, type ISODate } from './dates';
import { holidayName } from './holidays';
import type { AmLeave, NatureEvenement } from './model';

// Décision du DG du 21/11/2026 (« sans la raison ») : la nature sert à l'écran pour proposer la durée (dureeEvenement,
// libelleDureeSaisie) ; seule la durée est enregistrée (AmLeave.joursEvenement). Le calcul ci-dessous ne lit que la durée.

/** Libellés proposés à l'AM, dans l'ordre de l'article 48.1.3.1.1 (écran de saisie seulement, jamais enregistrés) */
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
 * Premier jour géré. T-103 (C6) : l'avenant n° 4 du 16/10/2023 (art. 4, KALIARTI000048805330) « entre en vigueur au premier
 * jour du mois qui suit celui au cours duquel l'avis d'extension le concernant est publié au Journal officiel » : le
 * 01/05/2024. Avant : version de 2022 de l'art. 48.1.3.1.1 (KALIARTI000043942139), avec le minimum de L3142-4 à la date.
 * Les durées de `dureeEvenement` suivent déjà les deux versions : la seule borne est la CCN 3239 (01/01/2022).
 */
export const EVENEMENTS_GERES_DEPUIS: ISODate = '2016-08-10';
/**
 * T-107 (cas 6, regles/t107-evenements-avant-2022.md) : avant le 01/01/2022, ancienne convention des assistants maternels
 * (IDCC 2395, art. 13, base KALI, KALIARTI000005825497, en vigueur du 01/07/2004 au 01/01/2022) et C. trav. L3142-4 dans sa
 * version à la date (base LEGI ; versions du 10/08/2016 au 01/07/2020, au 01/07/2021, au 19/12/2021, au 21/07/2023),
 * applicable par CASF L423-2 ; la plus favorable (L2251-1). Avant le 10/08/2016, L3142-4 n'avait pas cette rédaction ; aucun
 * jour d'une absence commencée avant ne tombe dans un mois que l'app calcule (barèmes depuis le 01/01/2022, rates.ts).
 */
const ANCIENNE_CCN_JUSQUA: ISODate = '2022-01-01';
/** Dernier jour avant la nouvelle rédaction de L3142-4, 6° (loi n° 2026-492 du 12 juin 2026, art. 6) */
const L3142_4_AVANT_2026 = '2026-06-13';

/**
 * T-033 : L3142-4 version « EN VIGUEUR DU 19 DÉC. 2021 AU 21 JUIL. 2023 » (loi n° 2021-1678), relue le 18/11/2026 :
 * 4° « Cinq jours pour le décès d'un enfant ou sept jours ouvrés lorsque l'enfant est âgé de moins de vingt-cinq ans
 * [...] » ; 6° « Deux jours pour l'annonce [...] ». CCN 48.1.3.1.1, version remplacée : « 5 jours ouvrables pour le
 * décès d'un enfant. La durée du congé est portée à 9 jours ouvrables » ; « 2 jours ouvrables pour l'annonce de la
 * survenue d'un handicap chez un enfant ». La version suivante de L3142-4 (loi n° 2023-622 : 12, 14 et 5 jours) vaut à
 * partir du 21/07/2023 ; elle égale ou dépasse les deux versions de la CCN, quelle que soit la date de bascule de la CCN.
 */
const L3142_4_DEPUIS_2023: ISODate = '2023-07-21';
/** Premier jour de la CCN IDCC 3239 lue (étendue par arrêté du 6 octobre 2021, appliquée au 01/01/2022) ; avant : non lu */
const CCN_3239_DEPUIS: ISODate = '2022-01-01';

/**
 * T-107 (cas 6) : avant 2022, max(ancienne CCN, art. 13 ; L3142-4 à la date). Ancienne CCN, art. 13 : mariage du salarié 4,
 * mariage d'un enfant 1, « décès d'un enfant ou du conjoint ou du partenaire d'un Pacs » 2, « décès du père, de la mère, d'un
 * grand-père ou d'une grand-mère » 1, naissance ou adoption 3, beau-père, belle-mère, frère, sœur 1 (3 mois d'ancienneté) ;
 * jours ouvrables. L3142-4 (10/08/2016 au 30/06/2020) : 4, 1, 3, décès d'un enfant 5, proches 3, handicap 2 ; du 01/07/2020 :
 * enfant de moins de 25 ans (ou parent, ou personne à charge) « sept jours ouvrés » ; du 19/12/2021 : handicap, pathologie
 * chronique ou cancer 2. L3142-1-1 (depuis le 01/07/2020) : congé de deuil de huit jours. `undefined` : aucun congé pour cet
 * événement à cette date (petit-enfant, et événements d'avant le 10/08/2016).
 */
function dureeAvant2022(nature: NatureEvenement, d: ISODate): number | undefined {
  if (d < EVENEMENTS_GERES_DEPUIS) return undefined;
  const depuis2020 = d >= '2020-07-01';
  switch (nature) {
    case 'mariage': return 4;
    case 'mariage_enfant': return 1;
    case 'naissance': return 3;
    case 'deces_enfant': return 5; // L3142-4, 4° : 5 (CCN : 2)
    case 'deces_enfant_14': return depuis2020 ? 7 : 5; // depuis le 01/07/2020 : 7 jours ouvrés (joursOuvres)
    case 'deces_proche': return 3; // L3142-4, 5° (CCN : 1 ou 2)
    case 'handicap_enfant': return 2; // L3142-4, 6° (pathologie chronique ou cancer : depuis le 19/12/2021 seulement)
    case 'deces_descendant': return undefined; // ni l'ancienne CCN ni L3142-4
    case 'deces_ascendant': return 1; // ancienne CCN : grand-père ou grand-mère seulement
    case 'deuil': return depuis2020 ? 8 : undefined;
  }
}

/** T-107 (cas 6) : la durée se compte en jours ouvrés (L3142-4, 4°, « sept jours ouvrés », avant 2022 dans l'app) */
export function evenementEnJoursOuvres(nature: NatureEvenement, d: ISODate): boolean {
  return nature === 'deces_enfant_14' && d >= '2020-07-01' && d < ANCIENNE_CCN_JUSQUA;
}

/** Durée en jours ouvrables à la date `d` : max(CCN 48.1.3.1.1, C. trav. L3142-4). `undefined` : aucun congé à cette date. */
export function dureeEvenement(nature: NatureEvenement, d: ISODate): number | undefined {
  if (d < CCN_3239_DEPUIS) return dureeAvant2022(nature, d);
  const avant2023 = d < L3142_4_DEPUIS_2023;
  switch (nature) {
    case 'mariage': return 4; // CCN 4 ; L3142-4, 1° : 4 (toutes versions)
    case 'mariage_enfant': return 1; // CCN 1 (mariage ou PACS) ; L3142-4, 2° : 1 (mariage)
    case 'naissance': return 3; // CCN 3 ; L3142-4, 3° et 3° bis : 3
    case 'deces_enfant': return avant2023 ? 5 : 12; // CCN remplacée 5, L3142-4 (2021) 5 ; puis L3142-4 (2023) 12
    // Avant le 21/07/2023 : CCN remplacée 9 jours ouvrables, loi « sept jours ouvrés ». T-103 : 9 jours ouvrables (lundi au
    // samedi) contiennent toujours au moins 7 jours ouvrés (lundi au vendredi), quel que soit le premier jour : la CCN est
    // la plus favorable (C. trav. L2251-1, applicable par CASF L423-2, 6°).
    case 'deces_enfant_14': return avant2023 ? 9 : 14; // CCN et L3142-4, 4° : 14
    case 'deces_proche': return 3; // CCN et L3142-4, 5° : 3 (toutes versions)
    // CCN remplacée 2 (handicap seul) ; L3142-4 (2021) 2 (handicap, pathologie chronique, cancer) ; puis 5 ; puis 10
    case 'handicap_enfant': return avant2023 ? 2 : d <= L3142_4_AVANT_2026 ? 5 : 10;
    case 'deces_descendant': return 1; // CCN 1 (deux versions) ; rien dans L3142-4
    case 'deces_ascendant': return 1; // CCN 1 (deux versions) ; rien dans L3142-4
    // Art. 48.1.3.1.2 : 8 jours ouvrables. T-103 (C9) : art. 48.1.3.1.3, salaire maintenu « sous déduction des indemnités
    // journalières versées » : montant des indemnités demandé à la saisie (AmLeave.ijSecu).
    case 'deuil': return 8;
  }
}

/**
 * T-038 (AC-3, relecture V4) : texte de l'écran de saisie pour une nature d'événement commencé le `from`. Il suit
 * `statutJourEvenement` : rien n'est annoncé comme payé quand le moteur met les jours « non géré ».
 */
export function libelleDureeSaisie(nature: NatureEvenement, from: ISODate): string {
  if (from < EVENEMENTS_GERES_DEPUIS) return 'Avant le 10/08/2016 : l’app ne calcule aucun mois de cette période (ses barèmes commencent en 2022)';
  const n = dureeEvenement(nature, from);
  if (n === undefined) return from < CCN_3239_DEPUIS
    ? 'Pas de congé pour cet événement avant 2022 (ancienne convention, article 13 ; code du travail, article L3142-4) : saisis l’absence en congé payé ou sans solde'
    : 'Pas de congé pour cet événement à cette date';
  if (nature === 'deuil') return '8 jours ouvrables, salaire maintenu moins les indemnités journalières de la CPAM (indique leur montant)';
  if (evenementEnJoursOuvres(nature, from)) return '7 jours ouvrés payés (tes jours de travail prévus ; code du travail, article L3142-4)';
  const avant = from < CCN_3239_DEPUIS && nature === 'deces_ascendant' ? ' (grand-parent ; arrière-grand-parent : pas de congé avant 2022)'
    : from < '2021-12-19' && nature === 'handicap_enfant' ? ' (annonce d’un handicap ; pathologie chronique ou cancer : pas de congé avant le 19/12/2021)' : '';
  return `${n} jour${n > 1 ? 's' : ''} ouvrable${n > 1 ? 's' : ''} payé${n > 1 ? 's' : ''}${avant}`;
}


/**
 * T-025 C-1 : la durée se compte par événement, pas par absence saisie (CCN 48.1.3.1.1 : « 4 jours ouvrables pour son
 * mariage » ; « Ces congés sont pris au moment de l'événement ou […] dans les jours qui entourent l'événement » ;
 * naissance : « dans les 15 jours entourant l'événement »). L'app ne sait pas seule si deux absences sont le même
 * événement. Décision du DG du 21/11/2026 (« Demander à l'AM ») : à la saisie, si une autre absence « événement
 * familial » est à 15 jours calendaires au plus, l'app demande si c'est la suite ; « oui » enregistre `suiteDe`. Le calcul
 * relie les absences seulement par ce lien, en groupe (groupeEvenement) ; leurs jours se cumulent et la durée est celle
 * de la première absence du groupe. Ce qui
 * dépasse la durée est « à confirmer », jamais payé ni retenu en silence. Les saisies d'avant (avec nature) reçoivent le
 * lien au chargement, selon l'ancienne règle (même nature, 15 jours au plus : absences.ts).
 */
export const LIEN_EVENEMENT_JOURS = 15;

/**
 * Groupe d'un même événement : toutes les absences « événement familial » reliées à `l` par des liens `suiteDe`, dans
 * les deux sens (un lien vers une absence qui n'existe plus est ignoré), triées par date. La première du groupe donne
 * la durée de référence (relecture de la n° 52, cas N1 et N2 : une saisie au milieu ou une ressaisie rejoint le groupe).
 */
export function groupeEvenement(l: AmLeave, leaves: AmLeave[]): AmLeave[] {
  // Une absence sans durée (forme de main) n'entre dans aucun groupe : elle est payée comme sur main.
  const ev = leaves.filter((x) => x.type === 'evenement' && x.joursEvenement !== undefined && x !== l && x.id !== l.id);
  const groupe = [l];
  for (let k = 0; k < groupe.length; k++) {
    const cur = groupe[k];
    for (const x of ev) {
      if (groupe.includes(x)) continue;
      if (x.id === cur.suiteDe || x.suiteDe === cur.id) groupe.push(x);
    }
  }
  return groupe.sort((a, b) => (a.from !== b.from ? (a.from < b.from ? -1 : 1) : a.to !== b.to ? (a.to < b.to ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Absences du groupe de `l` jusqu'à `l` comprise, de la plus ancienne à `l` (ordre de date) */
export function chaineEvenement(l: AmLeave, leaves: AmLeave[]): AmLeave[] {
  const g = groupeEvenement(l, leaves);
  return g.slice(0, g.indexOf(l) + 1);
}

/**
 * Absence « événement familial » la plus proche avant [from], à 15 jours au plus (même règle d'écart que l'ancien lien),
 * à proposer comme « suite de » à la saisie. `undefined` : aucune.
 */
export function evenementPrecedentProche(from: ISODate, leaves: AmLeave[]): AmLeave | undefined {
  let prev: AmLeave | undefined;
  for (const p of leaves) {
    if (p.type !== 'evenement' || p.joursEvenement === undefined || p.from >= from || daysBetween(p.to, from) > LIEN_EVENEMENT_JOURS) continue;
    if (!prev || p.to > prev.to) prev = p;
  }
  return prev;
}

/**
 * Absence « événement familial » la plus proche après une saisie [from, to], à 15 jours au plus, même si elle fait déjà
 * partie d'un groupe : à la saisie, l'app demande si elle est la suite de la nouvelle absence (saisie dans le désordre).
 */
export function evenementSuivantProche(from: ISODate, to: ISODate, leaves: AmLeave[]): AmLeave | undefined {
  let suiv: AmLeave | undefined;
  for (const q of leaves) {
    if (q.type !== 'evenement' || q.joursEvenement === undefined || q.from <= from || daysBetween(to, q.from) > LIEN_EVENEMENT_JOURS) continue;
    if (!suiv || q.from < suiv.from) suiv = q;
  }
  return suiv;
}

/**
 * Jours comptés pour la durée, jusqu'à `d` compris : les jours des absences reliées, plus les jours entre deux absences
 * qui se suivent sans jour ouvré entre elles (un week-end ou un férié : même compte que si une seule absence avait été
 * saisie). Le jour `d` doit être dans la dernière absence de la chaîne (triée par date).
 */
function joursCouverts(chaine: AmLeave[], d: ISODate): ISODate[] {
  const set = new Set<ISODate>();
  // `fin` : dernier jour déjà couvert par les absences précédentes (elles peuvent se chevaucher dans un groupe).
  let fin: ISODate | undefined;
  for (const x of chaine) {
    if (fin && fin < x.from) {
      const entre = eachDay(addDays(fin, 1), addDays(x.from, -1));
      if (entre.every((j) => weekday(j) === 7 || weekday(j) === 6 || holidayName(j))) for (const j of entre) set.add(j);
    }
    for (const j of eachDay(x.from, x.to < d ? x.to : d)) set.add(j);
    if (!fin || x.to > fin) fin = x.to;
  }
  return [...set].filter((j) => j <= d).sort();
}

/**
 * Statut d'un jour d'événement familial (T-103, C6 à C8 ; décision du DG du 24/11/2026 : plus aucun « à confirmer »).
 * - Jours ouvrables (CCN 48, liminaire) : tous les jours sauf le repos hebdomadaire (CCN 46 : prévu au contrat, le dimanche
 *   par défaut) et les fériés chômés. C. trav. L3142-4 (version du 14/06/2026) : « Les jours de congés mentionnés au présent
 *   article sont des jours ouvrables. » Un férié pendant le congé ne compte pas : il est payé comme férié chômé (art. 47) et
 *   le congé dure un jour de plus.
 * - La suite d'un même événement (`suiteDe`) est dite par l'AM à la saisie (décision du DG du 21/11/2026) : la durée se
 *   compte sur tout le groupe.
 * - Au-delà de la durée : ce n'est plus un congé pour événement familial. L'absence n'est couverte par aucun congé payé
 *   saisi : elle est retenue (CCN 111), avec la raison, jamais « ni payée ni retenue ».
 * `nonGere` : saisie que l'app ne sait pas lire (avant 2022 ; ancienne saisie sans durée connue).
 */
export function statutJourEvenement(l: AmLeave, d: ISODate, leaves: AmLeave[] = [l], reposHebdo = 7, _jourTravaille?: (x: ISODate) => boolean, cid?: string): { paye: true } | { paye: false; raison: string; nonGere?: boolean } {
  const qui = `Événement familial du ${jjmm(l.from)} au ${jjmm(l.to)}`;
  // Décision du DG du 21/11/2026 (« Payer comme avant ») : absence saisie sans nature ni durée : payée.
  if (l.joursEvenement === undefined) return { paye: true };
  const chaine = chaineEvenement(l, leaves);
  const debut = chaine[0];
  // T-109 : jours accordés pour ce contrat (jours ouvrés convertis en jours ouvrables à la saisie), sinon la durée commune.
  const duree = (cid !== undefined ? debut.joursEvenementContrat?.[cid] : undefined) ?? debut.joursEvenement ?? 0;
  if (duree === 0) {
    // T-107 (cas 6) : saisie d'avant la T-107 (événement d'avant 2022, durée alors inconnue) : la durée dépend de l'événement,
    // que l'app n'enregistre pas (décision du DG du 21/11/2026) : il est demandé une fois, en saisissant l'absence de nouveau.
    return { paye: false, nonGere: true, raison: `${qui} : l’app ne connaît pas encore sa durée. Supprime cette absence et saisis-la de nouveau en choisissant l’événement : l’app donne alors la durée et calcule le mois.` };
  }
  // T-109 : toujours en jours ouvrables ; les « sept jours ouvrés » (T-107, cas 6) sont convertis à la saisie (absences.ts).
  const ouvrableC = (x: ISODate) => weekday(x) !== reposHebdo && !holidayName(x);
  if (!ouvrableC(d)) return { paye: true }; // férié chômé (payé, art. 47) ou jour de repos : ne compte pas dans la durée
  const n = joursCouverts(chaine, d).filter(ouvrableC).length;
  if (n <= duree) return { paye: true };
  const suite = chaine.length > 1 ? `, en comptant l’absence saisie ${chaine.slice(0, -1).map((x) => `du ${jjmm(x.from)} au ${jjmm(x.to)}`).join(', ')}` : '';
  return {
    paye: false,
    raison: `${qui} : ${dureeLabel(duree)} au plus pour cet événement (${debut.from < CCN_3239_DEPUIS ? 'ancienne convention, article 13' : 'convention, article 48.1.3.1.1'}, et code du travail, article L3142-4)${suite}. Le ${jjmm(d)} n’est plus un congé pour événement familial : il est retenu comme une absence non payée. Si c’était un congé payé, saisis-le en congé payé.`,
  };
}

function dureeLabel(n: number): string {
  return `${n} jour${n > 1 ? 's' : ''} ouvrable${n > 1 ? 's' : ''}`;
}
function jjmm(d: ISODate): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}
