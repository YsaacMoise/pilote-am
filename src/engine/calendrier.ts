// Calendrier de l'accueil, mois par mois : ce que la famille paie réellement, et quand l'argent des aides arrive.
// Règles et sources : docs/simulateur-regles.md (étape 4). Montants en centimes, aux barèmes en vigueur le jour de la simulation.
import { weekday, type ISODate } from './dates';
import { holidaysOf } from './holidays';
import {
  CREDIT_FORFAIT_ENTRETIEN_JOUR, CREDIT_PLAFOND_DEPENSES, CREDIT_TAUX, ageMois, cmgParams, congesPeriodeSimulee, joursCongesSimules, semainesAccueil, cotisationsDuMois, derniereAnneeCredit, simuler,
  type SimInput, type SimResult,
} from './simulation';

export type Evenement = 'adaptation' | 'conges' | 'credit' | 'avance' | 'regularisation' | 'finCmg';

export interface MoisCalendrier {
  /** « AAAA-MM » */
  mois: string;
  /** Versé à l'assistante maternelle : salaire, congés payés, entretien, repas, kilomètres (tous les enfants) */
  verse: number;
  /** Dont congés payés versés ce mois (année incomplète) */
  conges: number;
  /** Cotisations restées à la charge de la famille */
  cotisationsReste: number;
  /** Aide de la CAF du mois */
  cmg: number;
  autresAides: number;
  /** Payé par la famille ce mois, après l'aide de la CAF */
  reste: number;
  /** Crédit d'impôt reçu ce mois (solde de l'été ou avance de janvier ; négatif = trop-perçu à rembourser) */
  credit: number;
  /** Coût réel du mois : reste − crédit reçu */
  net: number;
  evenements: Evenement[];
  /** T-103 (S1 à S5) : mois d'adaptation, ce que le calcul a retenu (dit à l'écran, sans réserve) */
  note?: string;
}

export interface Calendrier {
  mois: MoisCalendrier[];
  /** Crédit d'impôt calculé par année de dépenses */
  creditParAnnee: Record<number, number>;
  /** Total payé sur la période affichée, après aides et crédit reçus */
  total: number;
}

/** Durée du calendrier affiché : 24 mois, pour voir le premier crédit d'impôt et la première avance de janvier. */
export const MOIS_CALENDRIER = 24;

export const moisSuivant = (m: string, n = 1): string => {
  const [y, mo] = m.split('-').map(Number);
  const t = y * 12 + (mo - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

/** Jours fériés d'un mois « AAAA-MM ». T-103 (R1) : en Alsace-Moselle, ni Vendredi saint ni 26 décembre pour l'AM (L3134-1). */
function feriesDuMois(m: string, _alsaceMoselle: boolean): ISODate[] {
  const y = Number(m.slice(0, 4));
  return [...holidaysOf(y).keys()].filter((j) => j.startsWith(`${m}-`));
}

const heuresLabel = (h: number) => `${h.toFixed(2).replace('.', ',').replace(/,00$/, '')} h`;

/**
 * Mois d'adaptation (T-035b ; T-103, S1 à S5 : mêmes règles que la paie, aucune réserve). CCN IDCC 3239, socle AM,
 * art. 108.1 al. 3 : « Pendant la période d'adaptation, le particulier employeur déduit du salaire mensualisé les heures de
 * travail non effectuées par l'assistant maternel en procédant à un calcul de déduction d'absence conformément aux
 * dispositions de l'article 111 ». Urssaf, « Préparer le contrat de travail » (12/03/2026) : formule en heures « quel que
 * soit le type de contrat » ; dénominateur = « nombre exact d'heures de travail que le salarié aurait dû effectuer dans le
 * mois considéré ».
 * - S1 : heures déclarées = heures du mois × part payée du salaire (comme la paie, payroll.ts : heures mensualisées × part
 *   payée), soit la rémunération due ÷ taux horaire net ; plus les heures faites au-delà du prévu.
 * - S2 : 52 semaines ou moins, même méthode en heures : l'article 108.1 vise « les heures de travail non effectuées » ; la
 *   page Urssaf le dit pour tout type de contrat.
 * - S3 : jour férié chômé sur un jour d'accueil : payé (CCN 47.1 pour le 1er mai ; 47.2, maintien si l'AM a travaillé le
 *   jour d'accueil d'avant et celui d'après, ce que le simulateur suppose) : ses heures ne sont pas retenues.
 * - S4 : heures faites au-delà des heures prévues du mois : heures complémentaires (CCN 96.4), au taux du contrat
 *   (110.2 : majoration seulement si le contrat la prévoit) ; heures majorées si le contrat atteint déjà 45 h (110.1).
 * - S5 : contrat au-delà de 45 h : la déduction porte sur le salaire mensualisé, majoration comprise (CCN 111).
 */
export function moisAdaptation(i: SimInput, r: SimResult, m: string, salaireMensualise: number, _rang: 1 | 2 = 1): { salaire: number; heures: number; heuresFaites: number; heuresPrevues: number; heuresEnPlus: number; note: string } {
  const [y, mo] = m.split('-').map(Number);
  const nbJours = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const minutesJour = new Map(r.parJour.map((p) => [p.jour, p.minutes]));
  const feries = new Set(feriesDuMois(m, i.alsaceMoselle));
  let prevuesMin = 0;
  let ferieMin = 0;
  for (let k = 1; k <= nbJours; k++) {
    const jour = `${m}-${String(k).padStart(2, '0')}`;
    const min = minutesJour.get(weekday(jour)) ?? 0;
    prevuesMin += min;
    if (min > 0 && feries.has(jour)) ferieMin += min;
  }
  const faitesMin = Math.max(0, Math.round(i.adaptationHeures * 60));
  const aTravaillerMin = prevuesMin - ferieMin;
  const nonFaitesMin = Math.max(0, aTravaillerMin - faitesMin);
  const enPlusMin = Math.max(0, faitesMin - aTravaillerMin);
  const base = prevuesMin > 0 ? Math.round(salaireMensualise - (salaireMensualise * nonFaitesMin) / prevuesMin) : 0;
  const majorees = r.minutesSemaine >= 45 * 60;
  const enPlus = Math.round((enPlusMin * r.tauxNet * (majorees ? 1 + i.majoration / 100 : 1)) / 60);
  const salaire = base + enPlus;
  const part = salaireMensualise > 0 ? base / salaireMensualise : 0;
  const heures = (r.heuresMoisMin / 60) * part + enPlusMin / 60;
  const morceaux = [`Adaptation : ${heuresLabel(faitesMin / 60)} faites sur ${heuresLabel(aTravaillerMin / 60)} prévues${ferieMin ? ` (jour férié payé : ${heuresLabel(ferieMin / 60)})` : ''} ; salaire mensualisé moins les heures non faites (convention, articles 108.1 et 111).`];
  if (enPlusMin) morceaux.push(`${heuresLabel(enPlusMin / 60)} faites au-delà du prévu, payées en heures ${majorees ? 'majorées (article 110.1)' : 'complémentaires (article 96.4)'}.`);
  return { salaire, heures, heuresFaites: faitesMin / 60, heuresPrevues: prevuesMin / 60, heuresEnPlus: enPlusMin / 60, note: morceaux.join(' ') };
}

/**
 * Le calendrier suit le contrat depuis `i.debut`. Hypothèses (affichées à l'écran) :
 * - salaire mensualisé chaque mois ; le premier mois, s'il y a adaptation, salaire mensualisé moins les heures non faites
 *   (déduction d'absence, CCN art. 108.1 et 111 ; Urssaf « Préparer le contrat », formule en heures) : voir `moisAdaptation` ;
 * - entretien, repas et kilomètres à leur moyenne mensuelle (jours fériés répartis) ;
 * - année incomplète : congés payés = le plus haut du dixième des salaires nets de la période du 1er juin au 31 mai et du
 *   maintien (CCN 48.1.1.5, congesPeriodeSimulee), versés en juin ou au mois du congé principal (CCN art. 102) ; année
 *   complète : compris dans le salaire ;
 * - CMG du mois sur salaire + entretien + repas, dans la limite du plafond horaire ; les congés payés s'ajoutent au coût
 *   sans entrer dans la vérification du plafond (LFSS 2026, art. 100) ; aide arrêtée après le mois des 6 ans (12 ans parent seul) ;
 * - crédit d'impôt d'une année versé l'été suivant ; à partir de la 2e année, avance de 60 % en janvier sur le crédit
 *   de l'année d'avant-dernière, le solde l'été (Service-public F35936).
 */
export function calendrier(i: SimInput, d: ISODate, r: SimResult = simuler(i, d)): Calendrier {
  const n = r.nbEnfants;
  const out: MoisCalendrier[] = [];
  const creditParAnnee: Record<number, number> = {};
  if (!n || r.minutesSemaine <= 0) return { mois: out, creditParAnnee, total: 0 };

  const debut = /^\d{4}-\d{2}$/.test(i.debut) ? i.debut : d.slice(0, 7);
  const params = cmgParams(d);
  const salaire1 = r.parEnfant.salaire;
  const reduc1 = Math.round(r.reductionHeuresMaj / n);
  const entretien1 = Math.round(r.entretien / n);
  const repas1 = Math.round(r.repas / n);
  const heures = r.heuresMoisMin / 60;
  const partFamille = (r.cmg.ressources * 100 * r.cmg.taux) / params.coutReference;
  const seul = i.foyer === 'seul';
  const plafondCredit = i.residenceAlternee ? CREDIT_PLAFOND_DEPENSES / 2 : CREDIT_PLAFOND_DEPENSES;
  const autresParEnfant = Math.round((i.autresAides || 0) / n);
  const incomplete = i.yearType === 'incomplete';
  const moisCp = i.cpMode === 'principale' ? Math.min(10, Math.max(6, Math.round(i.moisCongePrincipal) || 8)) : 6;

  // Calcul jusqu'à la fin de l'année qui contient le dernier mois affiché, pour connaître chaque crédit d'impôt utile.
  const fin = moisSuivant(debut, MOIS_CALENDRIER - 1);
  const finCalcul = `${fin.slice(0, 4)}-12`;
  type Ligne = MoisCalendrier & { depenses: number[] };
  const lignes: Ligne[] = [];
  let baseCp = 0; // salaires nets de la période de référence en cours (1er juin → 31 mai)
  let cpAPayer = 0; // congés acquis au 31 mai, en attente du mois de versement
  let moisBase = 0; // mois de la période
  let droitsPrec = 0; // T-109 : jours acquis la période précédente (0 la première) de référence en cours

  for (let m = debut; m <= finCalcul; m = moisSuivant(m)) {
    const mo = Number(m.slice(5, 7));
    // T-038 (G-2) : l'adaptation dure 30 jours calendaires au plus depuis le premier jour de travail effectif (CCN art. 94 ;
    // Urssaf « Préparer le contrat ») ; si elle déborde sur le mois suivant, ce mois suit la même règle (déduction des heures
    // non faites, art. 108.1 al. 3 et 111), avec ses propres heures.
    const deuxieme = m === moisSuivant(debut) && i.adaptationHeures > 0 && (i.adaptationHeures2 ?? 0) > 0;
    const adaptation = (m === debut && i.adaptationHeures > 0) || deuxieme;
    const adapt = !adaptation ? undefined
      : deuxieme ? moisAdaptation({ ...i, adaptationHeures: i.adaptationHeures2 ?? 0 }, r, m, salaire1, 2) : moisAdaptation(i, r, m, salaire1);
    const joursAdapt = deuxieme ? i.adaptationJours2 ?? 0 : i.adaptationJours;
    const ratioJours = adaptation ? Math.min(1, (joursAdapt || 0) / Math.max(1, r.joursMois)) : 1;
    const salaire = adapt ? adapt.salaire : salaire1;
    const reduc = adaptation ? 0 : reduc1;
    const entretien = Math.round(entretien1 * ratioJours);
    const repas = Math.round(repas1 * ratioJours);
    // Heures déclarées du mois d'adaptation : rémunération due ÷ taux horaire net (Urssaf, « Préparer le contrat »).
    const heuresMois = adapt ? adapt.heures : heures;
    const evenements: Evenement[] = adaptation ? ['adaptation'] : [];

    // Congés payés (année incomplète) : la période se clôt le 31 mai ; versement en juin ou au congé principal.
    let conges = 0;
    if (incomplete) {
      // T-103 (S7) : CCN 48.1.1.5, le plus haut du dixième et du maintien ; jours acquis sur les mois de la période.
      // T-109 (correction 8) : les congés de la période comptent dans la limite des jours acquis la période précédente.
      if (mo === 6) {
        cpAPayer = moisBase ? congesPeriodeSimulee(i, salaire1, baseCp, moisBase, droitsPrec) : 0;
        if (moisBase) droitsPrec = joursCongesSimules(semainesAccueil(i), moisBase, droitsPrec);
        baseCp = 0; moisBase = 0;
      }
      if (mo === moisCp && cpAPayer > 0) { conges = cpAPayer; cpAPayer = 0; evenements.push('conges'); }
      baseCp += salaire + reduc;
      moisBase++;
    }

    let verse = r.km * ratioJours, cot = 0, cmg = 0, autres = 0;
    const depenses: number[] = [];
    for (const naissance of r.enfants.map((e) => e.naissance)) {
      const age = ageMois(naissance, `${m}-01`);
      const eligible = r.activiteOk && age <= (seul ? 144 : 72);
      if (r.activiteOk && age === (seul ? 145 : 73)) evenements.push('finCmg');
      const base = salaire + entretien + repas;
      const plafondMois = params.plafondHoraire * heuresMois;
      const cmgEnfant = eligible ? Math.max(0, Math.round((Math.min(base, Math.round(plafondMois)) + conges) * (1 - partFamille))) : 0;
      const partCot = base > plafondMois && base > 0 ? Math.ceil((plafondMois / base) * 100 - 1e-9) / 100 : 1;
      const cotEnfant = cotisationsDuMois(salaire + conges, d, i.alsaceMoselle, reduc);
      const resteCot = cotEnfant - (eligible ? Math.round(cotEnfant * partCot) : 0);
      verse += salaire + conges + reduc + entretien + repas;
      cot += resteCot;
      cmg += cmgEnfant;
      autres += autresParEnfant;
      // Dépenses retenues pour le crédit d'impôt, par enfant (salaire net, forfait de 2,65 € par jour, cotisations restées, − aides)
      const jours = r.joursMois * ratioJours;
      depenses.push(salaire + conges + reduc + Math.round(jours * CREDIT_FORFAIT_ENTRETIEN_JOUR) + resteCot - cmgEnfant - autresParEnfant);
    }
    verse = Math.round(verse);
    autres = Math.min(autres, Math.max(0, verse + cot - cmg));
    const reste = verse + cot - cmg - autres;
    lignes.push({ mois: m, verse, conges: conges * n, cotisationsReste: cot, cmg, autresAides: autres, reste, credit: 0, net: reste, evenements: [...new Set(evenements)], depenses, ...(adapt ? { note: adapt.note } : {}) });
  }

  // Crédit d'impôt par année civile de dépenses, par enfant (moins de 6 ans au 1er janvier).
  const annees = [...new Set(lignes.map((l) => Number(l.mois.slice(0, 4))))];
  for (const y of annees) {
    let total = 0;
    r.enfants.forEach((e, k) => {
      if (y > derniereAnneeCredit(e.naissance)) return;
      const dep = Math.max(0, lignes.filter((l) => l.mois.startsWith(`${y}-`)).reduce((t, l) => t + l.depenses[k], 0));
      total += Math.round(Math.min(dep, plafondCredit) * CREDIT_TAUX);
    });
    creditParAnnee[y] = total;
  }
  // Versements : crédit de l'année Y l'été Y+1 (juillet), moins l'avance de janvier Y+1 = 60 % du crédit de Y−1.
  const premiere = annees[0];
  const ajoute = (m: string, montant: number, ev: Evenement) => {
    const l = lignes.find((x) => x.mois === m);
    if (!l || !montant) return;
    l.credit += montant;
    l.evenements.push(ev);
  };
  for (const y of annees) {
    const avance = y > premiere ? Math.round((creditParAnnee[y - 1] ?? 0) * 0.6) : 0;
    ajoute(`${y + 1}-01`, avance, 'avance');
    const solde = (creditParAnnee[y] ?? 0) - avance;
    ajoute(`${y + 1}-07`, solde, solde < 0 ? 'regularisation' : 'credit');
  }

  const mois = lignes.filter((l) => l.mois <= fin).map(({ depenses: _, ...l }) => ({ ...l, net: l.reste - l.credit }));
  return { mois, creditParAnnee, total: mois.reduce((t, l) => t + l.net, 0) };
}

/** Reste à payer et coût réel selon le revenu fiscal de la famille (pour le lien envoyé avant de connaître ses revenus). */
export const NIVEAUX_REVENUS = [15000, 25000, 35000, 45000, 60000, 80000, 102000];
export function selonRevenus(i: SimInput, d: ISODate): { revenusAn: number; reste: number; reel: number; cmg: number }[] {
  return NIVEAUX_REVENUS.map((revenusAn) => {
    const r = simuler({ ...i, revenusAn, situationRevenus: 'aucune' }, d);
    return { revenusAn, reste: r.reste, reel: r.reel, cmg: r.cmgTotal };
  });
}

/** Effet d'une hausse du tarif brut : ce que gagne l'assistante maternelle (net par mois) et ce que paie la famille en plus. */
export function levierTarif(i: SimInput, d: ISODate, hausses = [10, 20, 50]): { hausse: number; gainNet: number; coutFamille: number; part: number }[] {
  const r0 = simuler(i, d);
  return hausses.map((hausse) => {
    const r = simuler({ ...i, tauxBrut: i.tauxBrut + hausse }, d);
    const gainNet = r.salaire + r.congesMois + r.reductionHeuresMaj - (r0.salaire + r0.congesMois + r0.reductionHeuresMaj);
    const coutFamille = r.reel - r0.reel;
    return { hausse, gainNet, coutFamille, part: gainNet > 0 ? coutFamille / gainNet : 0 };
  });
}

/** Tarif brut le plus haut (au centime) pour lequel la CAF prend encore en charge toutes les cotisations. */
export function tarifMaxSansDepassement(i: SimInput, d: ISODate): number {
  let lo = 0, hi = 3000;
  if (simuler({ ...i, tauxBrut: hi }, d).cmg.partCotisations >= 1) return hi;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (simuler({ ...i, tauxBrut: mid }, d).cmg.partCotisations >= 1) lo = mid; else hi = mid;
  }
  return lo;
}
