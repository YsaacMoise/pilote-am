// T-122 (phase C) : validation et préparation de l'enregistrement d'un contrat, partagées par l'écran Contrat (correction
// d'un contrat existant) et l'assistant d'ajout d'un enfant. Fonctions pures : mêmes messages et même contrat enregistré
// qu'avant l'extraction (Contrat.tsx, save(), lignes 106-152 de main cf3126a).
import { JOUR_NOMS, shortDate } from '../engine/dates';
import { erreursDureeContrat } from '../engine/durees';
import { weeklyMinutes } from '../engine/payroll';
import { manquesOccasionnel } from '../engine/occasionnel';
import { NON_GERE_47_51, semaines4751 } from '../engine/nonGeres';
import { manquesPV } from '../engine/planningVariable';
import type { Contract, Plage, Planning, StartBalances } from '../engine/model';

/** T-122 (relecture D2) : plages dont l'arrivée et le départ sont saisis (les autres ne sont jamais lues ni enregistrées). */
export function planningComplet(pl: Planning): Planning {
  const out: Planning = {};
  for (let d = 1; d <= 7; d++) if (pl[d]) out[d] = pl[d].filter((p) => p.start && p.end && p.end > p.start);
  return out;
}

const Jour = (d: number) => JOUR_NOMS[d - 1].replace(/^./, (x) => x.toUpperCase());
/** Message d'une plage vide ou inversée (undefined : plage juste) */
function erreurPlage(d: number, p: Plage, ou = ''): string | undefined {
  if (!p.start || !p.end) return `${Jour(d)}${ou} : indique l’heure d’arrivée et de départ.`;
  if (p.end <= p.start) return `${JOUR_NOMS[d - 1]}${ou} : l’heure de fin doit être après le début.`;
  return undefined;
}

/** Erreurs qui empêchent d'enregistrer le contrat (liste vide : il peut l'être). */
export function erreursContrat(c: Contract, isNew: boolean): string[] {
  const errs: string[] = [];
  const wk = weeklyMinutes(planningComplet(c.planning));
  if (!c.child.trim()) errs.push('Indique le prénom de l’enfant.');
  if (!c.start) errs.push('Indique la date de début du contrat.');
  if (!c.planningVariable && !c.accueilOccasionnel && wk <= 0) errs.push('Le planning est vide : ajoute au moins un jour d’accueil.');
  // T-104 (cas 2) : accueil occasionnel, périodes d'accueil (dates et horaires prévus au contrat, CCN 98.2).
  for (const m of manquesOccasionnel(c)) errs.push(`Accueil occasionnel : indique ${m}.`);
  if (c.accueilOccasionnel) for (const a of c.accueils ?? []) for (let d = 1; d <= 7; d++) for (const p of a.planning[d] ?? []) { const e = erreurPlage(d, p, ` (accueil du ${shortDate(a.du)})`); if (e) errs.push(e); }
  for (let d = 1; d <= 7; d++) for (const p of c.planning[d] ?? []) { const e = erreurPlage(d, p); if (e) errs.push(e); }
  if (semaines4751(c.yearType, c.weeks)) errs.push(NON_GERE_47_51);
  else if (c.yearType === 'incomplete' && (c.weeks < 1 || c.weeks > 46)) errs.push('En année incomplète, le nombre de semaines va de 1 à 46.');
  // Audit C-002 : les semaines sans accueil manquantes sont signalées dans le formulaire (bandeau) sans bloquer,
  // car elles peuvent être communiquées plus tard, par écrit, deux mois à l'avance (art. 98.1.2) ;
  // la régularisation n'est pas calculée tant qu'une année terminée en manque.
  if (c.end && c.end < c.start) errs.push('La date de fin est avant le début.');
  if (c.repasParents === undefined) errs.push('Indique qui fournit les repas de l’enfant.');
  if (c.alsaceMoselle === undefined) errs.push('Indique le département où tu accueilles l’enfant.');
  if (c.planningVariable === undefined) errs.push('Indique si le planning est le même chaque semaine.');
  // T-076 : horaires qui changent, données à compléter (cycle, semaine de départ, heures payées chaque mois).
  for (const m of manquesPV(c)) errs.push(`Horaires qui changent : indique ${m}.`);
  if (c.planningVariable) for (const pl of [...(c.cycle ?? []), ...Object.values(c.planningsSemaines ?? {})]) for (let d = 1; d <= 7; d++) for (const p of pl[d] ?? []) { const e = erreurPlage(d, p); if (e) errs.push(e); }
  if (c.accueilOccasionnel === undefined) errs.push('Indique si l’accueil est régulier ou occasionnel.');
  if (c.cdd === undefined) errs.push('Indique si le contrat est un CDI ou un CDD.');
  // T-076 : le CDD est calculé ; sa date de fin prévue (ou de durée minimale) et son motif sont demandés.
  if (c.cdd && !c.cddTerme) errs.push(c.cddTermeImprecis ? 'Indique la date de fin de la durée minimale du CDD.' : 'Indique la date de fin prévue du CDD.');
  if (c.cdd && c.cddTerme && c.cddTerme < c.start) errs.push('La date de fin prévue du CDD est avant le début.');
  if (c.cdd && !c.cddMotif) errs.push('Indique pourquoi le CDD a été signé.');
  // T-109 (correction 9) : CASF L423-22, plus de 48 h par semaine en moyenne sans l'accord de l'AM, ou plus de 2 250 h par an.
  errs.push(...erreursDureeContrat(c));
  // T-044b : choix explicite du mode de l'indemnité d'entretien sur un nouveau contrat.
  if (isNew && !c.entretienMode) errs.push('Indique si l’indemnité d’entretien est fixée par heure ou par jour.');
  return errs;
}

export interface OptionsEnregistrement {
  isNew: boolean;
  /** Premier jour du mois en cours (le suivi d'un contrat repris commence ce jour-là) */
  curMonthStart: string;
  /** Soldes de départ calculés par Arvela et retenus (carte affichée, réponses de l'AM), sinon undefined */
  soldesDepart?: Pick<StartBalances, 'cpRestants' | 'cpEnCours'>;
  /** Lien parent enregistré pour ce contrat (il a pu changer pendant la saisie) */
  partage?: Contract['partage'];
}

/** Contrat tel qu'il est enregistré (même transformation que l'écran Contrat avant T-122). */
export function contratAEnregistrer(c: Contract, o: OptionsEnregistrement): Contract {
  const reprise = c.start < o.curMonthStart;
  const toSave: Contract = {
    ...c,
    // T-119 : soldes calculés par l'app (carte affichée, réponses de l'AM) : écrits à l'enregistrement, case cochée.
    balances: o.soldesDepart ? { ...c.balances, ...o.soldesDepart, cpSaisi: true } : c.balances,
    child: c.child.trim(),
    family: c.family.trim(),
    weeks: c.yearType === 'complete' ? 52 : c.weeks,
    trackedFrom: o.isNew ? (reprise ? o.curMonthStart : c.start) : c.trackedFrom < c.start ? c.start : c.trackedFrom,
    // Le lien parent a pu être créé ou coupé pendant que le formulaire était ouvert : on garde l'état enregistré.
    partage: o.partage,
  };
  if (!toSave.partage) delete toSave.partage;
  return toSave;
}
