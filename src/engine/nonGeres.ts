// T-031 : cas que l'app ne gère pas (charte, verrou 6 : « tout ce qui n'a pas passé les verrous 1 à 5 affiche non géré »).
// Le moteur ne calcule pas ces cas : il les nomme et dit quoi faire. Aucune règle de paie n'est écrite ici.
import { shortDate, type ISODate } from './dates';
import { AM_ABS_LABEL, AM_ABS_NON_GEREES, type AmAbsNonGeree, type AmLeave, type Contract } from './model';

export const NON_GERE_ALSACE =
  'Alsace-Moselle (Bas-Rhin, Haut-Rhin, Moselle) : non géré. La paie y suit des règles locales que l’app ne calcule pas. Fais la paie sans l’app.';
/** T-038 suite 2 : Urssaf, « Rémunérer un salarié à domicile ou un assistant maternel » (mise à jour du 01/06/2026), tableau
 * « Au 1er juin 2026 », Mayotte : « Salaire horaire net 3,70 € » (métropole et Drom : 3,28 €) ; majoration de 4 % « Non concerné ». */
export const NON_GERE_MAYOTTE =
  'Mayotte : non géré. Le SMIC, le salaire minimum et les cotisations y sont différents, l’app ne les a pas. Fais la paie sans l’app.';
export const NON_GERE_PLANNING_VARIABLE =
  'Horaires qui changent d’une semaine à l’autre (semaines A et B, planning remis chaque mois) : non géré. L’app ne sait calculer qu’une semaine type qui se répète. Fais la paie sans l’app.';
export const NON_GERE_OCCASIONNEL =
  'Accueil occasionnel : non géré. L’app ne calcule que l’accueil régulier, sur 52 semaines ou sur 46 semaines ou moins (article 97.1 de la convention). Fais la paie sans l’app.';
/** Décision du DG du 18/11/2026 (T-033, cas officiel C-FIN-11) : le CDD n'a passé aucun verrou */
export const NON_GERE_CDD =
  'Contrat à durée déterminée (CDD) : non géré. L’app ne calcule que les contrats à durée indéterminée (CDI). Un CDD a ses propres règles, dont l’indemnité de fin de contrat (dite « de précarité ») que l’Urssaf demande de verser. Fais la paie sans l’app.';
/** A-01 : CCN art. 97.1 ne connaît que 52 semaines ou 46 semaines et moins ; question 2 posée à la DDETS le 18/11/2026 */
export const NON_GERE_47_51 =
  'Accueil de 47 à 51 semaines par an : non géré. La convention ne prévoit que 52 semaines, ou 46 semaines et moins (article 97.1). Ne choisis ni 46 semaines ni toute l’année à la place : la paie serait fausse. La question est posée à la DDETS. En attendant, fais la paie sans l’app.';
/** Décision du DG du 18/11/2026 : contrat sans réponse aux 4 questions (3 de T-031, CDD de T-033), mois non calculé */
export const CONTRAT_A_COMPLETER =
  'Contrat à compléter : ouvre le contrat et réponds aux 4 questions (lieu de travail, horaires, accueil régulier, CDI ou CDD). L’app ne calcule pas ce mois avant.';

/** Message d'une absence non gérée */
export function messageAbsenceNonGeree(l: AmLeave): string {
  const t = l.type as AmAbsNonGeree;
  const quand = l.from === l.to ? `le ${shortDate(l.from)}` : `du ${shortDate(l.from)} au ${shortDate(l.to)}`;
  return `${AM_ABS_LABEL[t]} ${quand} : non géré. Le salaire de ces jours, tes congés payés et la fin de contrat en dépendent. Fais ces mois sans l’app et vérifie avec les parents.`;
}

export function estAbsenceNonGeree(l: AmLeave): boolean {
  return (AM_ABS_NON_GEREES as string[]).includes(l.type);
}

/** Cas du contrat lui-même (tous ses mois) */
export function nonGeresContrat(c: Pick<Contract, 'alsaceMoselle' | 'planningVariable' | 'accueilOccasionnel' | 'cdd'> & Partial<Pick<Contract, 'yearType' | 'weeks' | 'avenants' | 'mayotte'>>): string[] {
  const out: string[] = [];
  // A-01 : conditions de départ ou d'un avenant entre 47 et 51 semaines (saisies anciennes ou importées).
  const conditions = [c, ...(c.avenants ?? []).map((a) => ({ ...c, ...a.changes }))];
  if (conditions.some((t) => semaines4751(t.yearType, t.weeks))) out.push(NON_GERE_47_51);
  if (c.alsaceMoselle) out.push(NON_GERE_ALSACE);
  if (c.mayotte) out.push(NON_GERE_MAYOTTE);
  if (c.planningVariable) out.push(NON_GERE_PLANNING_VARIABLE);
  if (c.accueilOccasionnel) out.push(NON_GERE_OCCASIONNEL);
  if (c.cdd) out.push(NON_GERE_CDD);
  return out;
}

/** Le contrat n'a pas encore répondu aux questions T-031 (contrats créés avant) */
export function contratACompleter(c: Pick<Contract, 'alsaceMoselle' | 'planningVariable' | 'accueilOccasionnel' | 'cdd'>): boolean {
  return c.alsaceMoselle === undefined || c.planningVariable === undefined || c.accueilOccasionnel === undefined || c.cdd === undefined;
}

/** Cas non gérés qui touchent la période [from, to] du contrat : contrat à compléter, cas du contrat, puis absences non gérées */
export function nonGeresPeriode(c: Contract, leaves: AmLeave[], from: ISODate, to: ISODate): string[] {
  const out = nonGeresContrat(c);
  // Décision du DG du 18/11/2026 : sans réponse aux 4 questions, l'app ne sait pas si le cas est géré : rien n'est calculé.
  if (contratACompleter(c)) out.unshift(CONTRAT_A_COMPLETER);
  const a = from > c.start ? from : c.start;
  const b = c.end && c.end < to ? c.end : to;
  if (b < a) return out;
  for (const l of [...leaves].sort((x, y) => (x.from < y.from ? -1 : 1))) {
    if (!estAbsenceNonGeree(l) || l.to < a || l.from > b) continue;
    const m = messageAbsenceNonGeree(l);
    if (!out.includes(m)) out.push(m);
  }
  return out;
}

/** A-01 : 47 à 51 semaines d'accueil par an (année incomplète au-delà de 46 semaines) */
export function semaines4751(yearType: Contract['yearType'] | undefined, weeks: number | undefined): boolean {
  return yearType === 'incomplete' && weeks !== undefined && weeks >= 47 && weeks <= 51;
}
