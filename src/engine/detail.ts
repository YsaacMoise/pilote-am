// T-118 (D-23) : lignes de « Comment c'est calculé » de l'écran Mois. Leur somme fait toujours le salaire net du mois :
// le prorata d'une entrée, d'une sortie ou d'un avenant en cours de mois a sa ligne (relevé T-111, défaut D-23).
import { firstDay, lastDay, type ISODate, type Month } from './dates';
import type { Contract } from './model';
import { euros, hoursLabel } from './money';
import { termsAt } from './payroll';
import type { MonthResult } from './month';

export interface LigneDetail {
  label: string;
  /** Montant en centimes (négatif pour une retenue) */
  montant: number;
  /** Ligne de résultat (salaire net) : pas comptée dans la somme */
  total?: boolean;
}

const jjmm = (d: ISODate) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Lignes du détail du salaire net, dans l'ordre de l'écran ; la dernière est le salaire net (somme des autres). */
export function lignesDetail(c: Contract, month: Month, r: MonthResult): LigneDetail[] {
  const out: LigneDetail[] = [];
  const t = termsAt(c, `${month}-01`);
  const complete = t.yearType === 'complete';
  if (c.accueilOccasionnel) {
    out.push({ label: `Heures d’accueil payées (${hoursLabel(r.normalesMin ?? 0)} au taux du contrat)`, montant: r.base });
  } else if (r.segments && r.segments.length > 1) {
    // Avenant en cours de mois : une ligne par période, au prorata (CCN 111, fiches DDETS 31 du 19/01/2023).
    for (const s of r.segments) {
      const prorata = s.base + s.retenue + s.ij;
      out.push({ label: `Salaire du ${jjmm(s.from)} au ${jjmm(s.to)} : ${euros(s.salaireMens)} par mois, au prorata de la période`, montant: prorata });
    }
  } else {
    out.push({ label: 'Salaire de base (le même chaque mois)', montant: r.salaireMens });
    const prorata = r.base + r.retenue + (r.ijDeduites ?? 0);
    if (prorata !== r.salaireMens) {
      const debut = c.start > firstDay(month) ? c.start : undefined;
      const fin = c.end && c.end < lastDay(month) ? c.end : undefined;
      const quoi = debut && fin ? `contrat du ${jjmm(debut)} au ${jjmm(fin)}` : debut ? `contrat commencé le ${jjmm(debut)}` : fin ? `contrat terminé le ${jjmm(fin)}` : 'mois incomplet';
      out.push({ label: `Prorata : ${quoi} (${complete ? 'heures' : 'jours'} du mois hors contrat, art. 111)`, montant: prorata - r.salaireMens });
    }
  }
  if (r.retenue > 0) out.push({ label: `Retenue (${complete ? hoursLabel(r.deductedMin) : `${r.deductedDays} j`} non payés)`, montant: -r.retenue });
  if ((r.ijDeduites ?? 0) > 0) out.push({ label: 'Indemnités journalières de la Sécurité sociale déduites', montant: -(r.ijDeduites ?? 0) });
  if (r.regulAvenant) out.push({ label: 'Régularisation à l’avenant', montant: r.regulAvenant });
  if ((r.normalesPlusAmount ?? 0) > 0) out.push({ label: `Heures en plus la semaine d’une absence (${hoursLabel(r.normalesPlusMin ?? 0)}, taux du contrat)`, montant: r.normalesPlusAmount ?? 0 });
  if (r.complAmount > 0) out.push({ label: `Heures complémentaires (${hoursLabel(r.complMin)})`, montant: r.complAmount });
  if (r.majAmount > 0) out.push({ label: `Heures majorées en plus (${hoursLabel(r.majMin)})`, montant: r.majAmount });
  if (r.ferieAmount > 0) out.push({ label: 'Fériés travaillés', montant: r.ferieAmount });
  if (r.cpIndemnite > 0) out.push({ label: 'Congés payés', montant: r.cpIndemnite });
  if (r.cpComplement > 0) out.push({ label: 'Complément congés', montant: r.cpComplement });
  out.push({ label: 'Salaire net', montant: r.netTotal, total: true });
  return out;
}

/** Somme des lignes (hors total) : doit valoir le salaire net */
export const sommeLignes = (l: LigneDetail[]): number => l.filter((x) => !x.total).reduce((a, x) => a + x.montant, 0);
