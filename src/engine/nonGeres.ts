// T-031 : cas que l'app ne gère pas (charte, verrou 6 : « tout ce qui n'a pas passé les verrous 1 à 5 affiche non géré »).
// Le moteur ne calcule pas ces cas : il les nomme et dit quoi faire. Aucune règle de paie n'est écrite ici.
import { addDays, shortDate, type ISODate } from './dates';
import { controleFinContrat, jourDispense } from './preavis';
import { nonGeresCdd } from './cdd';
import type { AmLeave, Contract } from './model';
import { messagePVACompleter, nonGeresContratPV, nonGeresPeriodePV } from './planningVariable';

export const NON_GERE_ALSACE =
  'Alsace-Moselle (Bas-Rhin, Haut-Rhin, Moselle) : non géré. La paie y suit des règles locales que l’app ne calcule pas. Fais la paie sans l’app.';
/** T-038 suite 2 : Urssaf, « Rémunérer un salarié à domicile ou un assistant maternel » (mise à jour du 01/06/2026), tableau
 * « Au 1er juin 2026 », Mayotte : « Salaire horaire net 3,70 € » (métropole et Drom : 3,28 €) ; majoration de 4 % « Non concerné ». */
export const NON_GERE_MAYOTTE =
  'Mayotte : non géré. Le SMIC, le salaire minimum et les cotisations y sont différents, l’app ne les a pas. Fais la paie sans l’app.';
/**
 * T-076 : plus utilisé par le calcul (le planning variable est calculé quand ses données sont complètes, sinon « à
 * compléter », planningVariable.ts). Plus lu par aucun écran ni aucun test ; gardé pour mémoire du texte d'avant.
 */
export const NON_GERE_PLANNING_VARIABLE =
  'Horaires qui changent d’une semaine à l’autre (semaines A et B, planning remis chaque mois) : non géré. L’app ne sait calculer qu’une semaine type qui se répète. Fais la paie sans l’app.';
export const NON_GERE_OCCASIONNEL =
  'Accueil occasionnel : non géré. L’app ne calcule que l’accueil régulier, sur 52 semaines ou sur 46 semaines ou moins (article 97.1 de la convention). Fais la paie sans l’app.';
// T-076 (22/11/2026) : le CDD est calculé (regles/t076-cdd.md). L'ancien refus NON_GERE_CDD (T-033) est retiré ; restent
// refusés le CDD sans date de fin prévue et le CDD de moins d'un mois avec semaines sans accueil (cdd.ts), et, à la fin, les
// cas de R-CDD-08 hors périmètre (fin.ts, MESSAGES_FIN_CDD_NON_GEREE).
/**
 * Intégration T-078 (fusion de T-076 et T-077, 22/11/2026) : chaque tâche a calculé son cas seule. T-077 calcule l'Alsace-Moselle
 * et Mayotte pour un CDI à horaires fixes ; T-076 calcule les horaires variables et le CDD en métropole. Les deux ensemble n'ont
 * été vérifiés par aucune des deux (aucune situation du second moteur) : ils restent refusés, comme avant la fusion.
 */
export const NON_GERE_REGION_PV_CDD =
  'Horaires qui changent d’une semaine à l’autre ou CDD, en Alsace-Moselle ou à Mayotte : non géré pour l’instant. L’app calcule ces contrats en métropole, et l’Alsace-Moselle et Mayotte pour un CDI à horaires fixes, pas encore les deux ensemble. Fais la paie sans l’app.';
/**
 * Intégration T-078 (fusion de T-074 et T-076, 22/11/2026) : le préavis dont les parents dispensent l'AM (T-074) a été vérifié
 * avec un planning fixe seulement ; avant la fusion, il était refusé pour un contrat à horaires variables (T-076, qui ne
 * l'avait pas) et les horaires variables l'étaient aussi (integration). Il reste refusé, comme avant la fusion.
 */
export const NON_GERE_PV_DISPENSE =
  'Préavis non fait à la demande des parents, avec des horaires qui changent d’une semaine à l’autre : non géré pour l’instant. L’app calcule chacun des deux cas seul, pas encore les deux ensemble. Fais les derniers mois et la fin du contrat avec les parents.';
/** A-01 : CCN art. 97.1 ne connaît que 52 semaines ou 46 semaines et moins ; question 2 posée à la DDETS le 18/11/2026 */
export const NON_GERE_47_51 =
  'Accueil de 47 à 51 semaines par an : non géré. La convention ne prévoit que 52 semaines, ou 46 semaines et moins (article 97.1). Ne choisis ni 46 semaines ni toute l’année à la place : la paie serait fausse. La question est posée à la DDETS. En attendant, fais la paie sans l’app.';
/** Décision du DG du 18/11/2026 : contrat sans réponse aux 4 questions (3 de T-031, CDD de T-033), mois non calculé */
export const CONTRAT_A_COMPLETER =
  'Contrat à compléter : ouvre le contrat et réponds aux 4 questions (lieu de travail, horaires, accueil régulier, CDI ou CDD). L’app ne calcule pas ce mois avant.';

/** Message d'une absence non gérée (sans le cas précis, qui n'est pas enregistré : décision du DG du 21/11/2026) */
export function messageAbsenceNonGeree(l: AmLeave): string {
  const quand = l.from === l.to ? `le ${shortDate(l.from)}` : `du ${shortDate(l.from)} au ${shortDate(l.to)}`;
  return `Absence non gérée par l’app ${quand} (congé maternité, paternité, de naissance, accident du travail ou maladie professionnelle) : le salaire de ces jours, tes congés payés et la fin de contrat en dépendent. Fais ces mois sans l’app et vérifie avec les parents.`;
}

export function estAbsenceNonGeree(l: AmLeave): boolean {
  return l.type === 'non_gere';
}

/** Cas du contrat lui-même (tous ses mois) */
export function nonGeresContrat(c: Pick<Contract, 'alsaceMoselle' | 'planningVariable' | 'accueilOccasionnel' | 'cdd'> & Partial<Contract>): string[] {
  const out: string[] = [];
  // A-01 : conditions de départ ou d'un avenant entre 47 et 51 semaines (saisies anciennes ou importées).
  const conditions = [c, ...(c.avenants ?? []).map((a) => ({ ...c, ...a.changes }))];
  if (conditions.some((t) => semaines4751(t.yearType, t.weeks))) out.push(NON_GERE_47_51);
  // T-077 : l'Alsace-Moselle et Mayotte sont calculées (regions.ts ; regles/t077-decisions.md). Messages gardés pour les écrans.
  // T-076 : planning variable calculé (spécification regles/t076-decisions-direction.md, section 1). Données incomplètes :
  // contrat à compléter, avec ce qui manque. Données complètes : seuls les cas du passage 2 restent refusés.
  if ((c.planningVariable || c.cdd) && (c.alsaceMoselle || c.mayotte)) out.push(NON_GERE_REGION_PV_CDD);
  if (c.planningVariable) {
    const m = messagePVACompleter(c);
    if (m) out.push(m);
    else out.push(...nonGeresContratPV(c as Contract));
  }
  if (c.accueilOccasionnel) out.push(NON_GERE_OCCASIONNEL);
  out.push(...nonGeresCdd(c));
  return out;
}

/** Le contrat n'a pas encore répondu aux questions T-031 (contrats créés avant) */
export function contratACompleter(c: Pick<Contract, 'alsaceMoselle' | 'planningVariable' | 'accueilOccasionnel' | 'cdd'>): boolean {
  return c.alsaceMoselle === undefined || c.planningVariable === undefined || c.accueilOccasionnel === undefined || c.cdd === undefined;
}

/** Cas non gérés qui touchent la période [from, to] du contrat : contrat à compléter, cas du contrat, puis absences non gérées */
/**
 * `controleFin` (T-045b) : `tout` (défaut), contrôle de la date de fin saisie face au préavis, y compris sans réponse sur le
 * préavis ; `connu`, seulement quand une réponse enregistrée ne concorde pas (jours de congés acquis : aucun montant n'est
 * versé sans passer par le mois ou la fin de contrat, qui font le contrôle complet) ; `non`, contexte de fin.ts déjà contrôlé.
 */
export function nonGeresPeriode(c: Contract, leaves: AmLeave[], from: ISODate, to: ISODate, controleFin: 'tout' | 'connu' | 'non' = 'tout'): string[] {
  const out = nonGeresContrat(c);
  // Décision du DG du 18/11/2026 : sans réponse aux 4 questions, l'app ne sait pas si le cas est géré : rien n'est calculé.
  if (contratACompleter(c)) out.unshift(CONTRAT_A_COMPLETER);
  const a = from > c.start ? from : c.start;
  const b = c.end && c.end < to ? c.end : to;
  if (b < a) return out;
  // T-076 (S2) : semaine sans planning saisi ou prévue au-delà de 45 h, à partir du début du suivi par l'app.
  out.push(...nonGeresPeriodePV(c, a > c.trackedFrom ? a : c.trackedFrom, b));
  // T-076, D18 : jours après le terme précis d'un CDD (contrat non fini à cette date) : contrôlés dans monthBase (payroll.ts),
  // qui connaît la date du jour (N2 : refus seulement une fois le terme passé).
  for (const l of [...leaves].sort((x, y) => (x.from < y.from ? -1 : 1))) {
    if (!estAbsenceNonGeree(l) || l.to < a || l.from > b) continue;
    const m = messageAbsenceNonGeree(l);
    if (!out.includes(m)) out.push(m);
  }
  // T-074 (D1) : absence de l'AM (congés, maladie, événement…) un jour du préavis dont les parents l'ont dispensée. Aucun
  // texte ne dit si ce jour est payé comme préavis (art. 64.2) ou traité comme absence, ni si le préavis est suspendu
  // (art. 64.1 : congés payés, accident du travail). Rien n'est calculé : jamais une retenue en silence.
  if (c.rupture?.preavis === 'employeur') {
    for (const l of leaves) {
      if (l.to < a || l.from > b) continue;
      let jour: ISODate | undefined;
      for (let x = l.from > a ? l.from : a; x <= l.to && x <= b; x = addDays(x, 1)) if (jourDispense(c, x)) { jour = x; break; }
      if (!jour) continue;
      const m = `Absence notée le ${shortDate(jour)}, pendant le préavis dont les parents t’ont dispensée : aucun texte ne dit si ce jour est payé comme préavis ou traité comme une absence (convention, articles 64.1 et 64.2). L’app ne calcule pas ce mois. Si l’enfant n’était de toute façon pas confié, retire l’absence ; sinon, fais le calcul avec les parents.`;
      if (!out.includes(m)) out.push(m);
    }
  }
  // Intégration T-078 : préavis dispensé (T-074) d'un contrat à horaires variables (T-076) : mois qui contiennent un jour
  // dispensé (du lendemain du dernier jour travaillé à la fin du contrat, comme jourDispense), et la fin du contrat.
  if (c.planningVariable && c.rupture?.preavis === 'employeur' && c.end) {
    const du = addDays(c.rupture.dernierJourTravaille ?? c.rupture.notif, 1);
    if (du <= b && c.end >= a && !out.includes(NON_GERE_PV_DISPENSE)) out.push(NON_GERE_PV_DISPENSE);
  }
  // T-045b (P3-B1, C3-1 de V5) : date de fin saisie qui ne concorde pas avec le préavis, ou préavis sans réponse.
  if (controleFin !== 'non' && (controleFin === 'tout' || c.rupture)) {
    const f = controleFinContrat(c);
    if (f && f.du <= to && f.au >= from) out.push(f.message);
  }
  return out;
}

/** A-01 : 47 à 51 semaines d'accueil par an (année incomplète au-delà de 46 semaines) */
export function semaines4751(yearType: Contract['yearType'] | undefined, weeks: number | undefined): boolean {
  return yearType === 'incomplete' && weeks !== undefined && weeks >= 47 && weeks <= 51;
}
