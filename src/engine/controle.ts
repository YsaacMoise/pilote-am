// Contrôle du bulletin déclaré par la famille, brut compris.
import { lastDay } from './dates';
import type { Bulletin } from './model';
import type { MonthResult } from './month';
import { ratesAt } from './rates';
import { euros } from './money';

export type Level = 'ok' | 'info' | 'warn';
export interface Check { level: Level; title: string; detail: string }

export function controle(b: Bulletin, r: MonthResult, rateNet: number): Check[] {
  const out: Check[] = [];
  const rates = ratesAt(lastDay(b.month));
  const tol = 100; // 1 € d'écart toléré (arrondis)

  // C-019 : Pajemploi garde le net déclaré et le brut, et ajoute la réduction de cotisations des heures complémentaires
  // et majorées à la somme versée. Un bulletin peut donc montrer le net déclaré ou le net réduction comprise.
  const red = r.reductionHS ?? 0;
  if (b.net != null) {
    const diff = b.net - r.netTotal;
    if (red > 0 && Math.abs(b.net - r.netTotal - red) <= tol) out.push({ level: 'ok', title: 'Salaire net conforme', detail: `${euros(b.net)} sur le bulletin : ${euros(r.netTotal)} déclarés et ${euros(red)} de réduction de cotisations sur les heures complémentaires et majorées.` });
    else if (Math.abs(diff) <= tol) out.push({ level: 'ok', title: 'Salaire net conforme', detail: `${euros(b.net)} déclaré, ${euros(r.netTotal)} calculé.` });
    else if (diff < 0) out.push({ level: 'warn', title: `Il manque ${euros(-diff)} de salaire net`, detail: `${euros(b.net)} déclaré, ${euros(r.netTotal)} calculé par l’app.` });
    else out.push({ level: 'info', title: `${euros(diff)} de plus que le calcul`, detail: `${euros(b.net)} déclaré, ${euros(r.netTotal)} calculé. Vérifie qu’il ne s’agit pas d’une erreur que tu devrais rembourser.` });
  }

  if (b.heures != null) {
    if (b.heures === r.heuresNormales) out.push({ level: 'ok', title: 'Heures normales conformes', detail: `${b.heures} h.` });
    else out.push({ level: 'warn', title: 'Heures normales différentes', detail: `${b.heures} h déclarées, ${r.heuresNormales} h attendues.` });
  }
  if (b.jours != null) {
    if (b.jours === r.joursActivite) out.push({ level: 'ok', title: 'Jours d’activité conformes', detail: `${b.jours} jours.` });
    else out.push({ level: 'warn', title: 'Jours d’activité différents', detail: `${b.jours} déclarés, ${r.joursActivite} attendus.` });
  }
  if (b.entretien != null) {
    const diff = b.entretien - r.entretien;
    if (Math.abs(diff) <= tol) out.push({ level: 'ok', title: 'Entretien conforme', detail: euros(b.entretien) });
    else out.push({ level: diff < 0 ? 'warn' : 'info', title: 'Indemnités d’entretien différentes', detail: `${euros(b.entretien)} déclarés, ${euros(r.entretien)} calculés.` });
  }

  if (b.brut != null && b.net != null && b.brut > 0) {
    const ratio = b.net / b.brut;
    const pct = (ratio * 100).toFixed(1).replace('.', ',');
    // Avec la réduction de cotisations des heures complémentaires et majorées, le net versé peut dépasser 82 % du brut.
    const haut = 0.82 + red / b.brut;
    const avecHS = red > 0 ? ` ; jusqu’à ${(haut * 100).toFixed(1).replace('.', ',')} % si le net comprend les ${euros(red)} de réduction de cotisations des heures complémentaires et majorées` : '';
    if (ratio < 0.74 || ratio > haut) {
      out.push({ level: 'warn', title: 'Net et brut incohérents', detail: `Le net représente ${pct} % du brut. Pour une assistante maternelle on attend environ 78 % (cotisations salariales d’environ 22 %)${avecHS}.` });
    } else {
      out.push({ level: 'ok', title: 'Net et brut cohérents', detail: `Le net représente ${pct} % du brut (attendu : environ 78 %${avecHS}).` });
    }
    if (b.heures && b.heures > 0) {
      const brutHoraire = Math.round((b.brut - r.cpIndemnite / 0.781 - r.cpComplement / 0.781) / (b.heures + r.complMin / 60 + (r.majContratMin + r.majMin) / 60));
      if (brutHoraire + 1 < rates.minConvBrut) {
        out.push({ level: 'warn', title: 'Brut horaire sous le minimum', detail: `Environ ${euros(brutHoraire)} brut de l’heure, le minimum conventionnel est ${euros(rates.minConvBrut)}.` });
      }
    }
  }
  if (rateNet < rates.minConvNet) {
    out.push({ level: 'warn', title: 'Taux du contrat sous le minimum', detail: `Ton taux net (${euros(rateNet)}) est inférieur au minimum conventionnel net (${euros(rates.minConvNet)}) depuis le ${rates.from.split('-').reverse().join('/')}.` });
  }
  return out;
}
