// Contrôle du bulletin déclaré par la famille, brut compris.
import { lastDay } from './dates';
import type { Bulletin } from './model';
import type { MonthResult } from './month';
import { libelleMinimumBrut, MESSAGE_PERIODE_NON_GEREE, minimumBrut, minimumSansTitre, partNetBrut, ratesAtRegion, valeurDepuis } from './rates';
import type { Region } from './regions';
import { euros } from './money';

export type Level = 'ok' | 'info' | 'warn';
export interface Check { level: Level; title: string; detail: string }

export function controle(b: Bulletin, r: MonthResult, rateNet: number, region: Region = 'metropole'): Check[] {
  const out: Check[] = [];
  // T-077 (R1, R2) : repère net, part du net dans le brut et minimum légal de la région.
  const rates = ratesAtRegion(lastDay(b.month), region);
  const minB = minimumBrut(lastDay(b.month), region);
  const MINIMUM_SANS_TITRE = minimumSansTitre(region);
  const part = partNetBrut(lastDay(b.month), region);
  const attendu = `${Math.round(part * 100)} %`;
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
    // T-044 : une part de l'entretien peut être à confirmer (tarif par jour) : tout montant entre les deux lectures est admis.
    const haut = r.entretien + (r.entretienAConfirmer ?? 0);
    if (r.entretienAConfirmer && b.entretien >= r.entretien - tol && b.entretien <= haut + tol) out.push({ level: 'info', title: 'Entretien dans la fourchette à confirmer', detail: `${euros(b.entretien)} déclarés, entre ${euros(r.entretien)} et ${euros(haut)} selon la lecture du tarif par jour.` });
    else if (Math.abs(diff) <= tol) out.push({ level: 'ok', title: 'Entretien conforme', detail: euros(b.entretien) });
    else out.push({ level: diff < 0 ? 'warn' : 'info', title: 'Indemnités d’entretien différentes', detail: `${euros(b.entretien)} déclarés, ${euros(r.entretien)} calculés.` });
  }

  if (b.brut != null && b.net != null && b.brut > 0) {
    const ratio = b.net / b.brut;
    const pct = (ratio * 100).toFixed(1).replace('.', ',');
    // Avec la réduction de cotisations des heures complémentaires et majorées, le net versé peut dépasser 82 % du brut.
    // Métropole : bornes d'avant T-077 (74 % et 82 %) ; ailleurs, 4 points autour de la part de la région.
    const bas = region === 'metropole' ? 0.74 : part - 0.04;
    const haut = (region === 'metropole' ? 0.82 : part + 0.04) + red / b.brut;
    const avecHS = red > 0 ? ` ; jusqu’à ${(haut * 100).toFixed(1).replace('.', ',')} % si le net comprend les ${euros(red)} de réduction de cotisations des heures complémentaires et majorées` : '';
    if (ratio < bas || ratio > haut) {
      out.push({ level: 'warn', title: 'Net et brut incohérents', detail: `Le net représente ${pct} % du brut. Pour une assistante maternelle on attend environ ${attendu} (cotisations salariales d’environ ${100 - Math.round(part * 100)} %)${avecHS}.` });
    } else {
      out.push({ level: 'ok', title: 'Net et brut cohérents', detail: `Le net représente ${pct} % du brut (attendu : environ ${attendu}${avecHS}).` });
    }
    if (b.heures && b.heures > 0 && minB) {
      const brutHoraire = Math.round((b.brut - r.cpIndemnite / part - r.cpComplement / part) / (b.heures + r.complMin / 60 + (r.majContratMin + r.majMin) / 60));
      // T-025 C-3 : minimum = le plus haut de la grille et de 0,281 × SMIC (CASF D423-9).
      if (brutHoraire + 1 < minB.certain) {
        out.push({ level: 'warn', title: 'Brut horaire sous le minimum', detail: `Environ ${euros(brutHoraire)} brut de l’heure, le minimum est ${libelleMinimumBrut(minB)}. ${MINIMUM_SANS_TITRE}` });
      } else if (minB.doute && brutHoraire + 1 < minB.doute) {
        out.push({ level: 'info', title: 'Minimum à confirmer', detail: `Environ ${euros(brutHoraire)} brut de l’heure. Minimum : ${libelleMinimumBrut(minB)}. L’arrondi n’est pas fixé par le texte : vérifie avec les parents. ${MINIMUM_SANS_TITRE}` });
      }
    }
  }
  // T-023 : avant les barèmes vérifiés, aucun minimum n'est connu ; sans repère net lu à la source, contrôle sur le brut seulement.
  if (!rates) {
    out.push({ level: 'info', title: 'Minimum conventionnel non contrôlé', detail: MESSAGE_PERIODE_NON_GEREE });
  } else if (rates.minConvNet === undefined) {
    out.push({ level: 'info', title: 'Minimum net non contrôlé', detail: `Aucun repère net officiel n’est dans l’app pour cette période. Compare le brut horaire du contrat au minimum brut : ${minB ? libelleMinimumBrut(minB) : euros(rates.minConvBrut)}. ${MINIMUM_SANS_TITRE}` });
  } else if (rateNet < rates.minConvNet) {
    out.push({ level: 'warn', title: 'Taux du contrat sous le minimum', detail: `Ton taux net (${euros(rateNet)}) est inférieur au minimum conventionnel net (${euros(rates.minConvNet)}) depuis le ${valeurDepuis(lastDay(b.month), 'minConvNet')!.split('-').reverse().join('/')}. ${MINIMUM_SANS_TITRE}` });
  } else {
    out.push({ level: 'info', title: 'Minimum vérifié sans le titre', detail: `Ton taux net n’est pas sous le minimum conventionnel net (${euros(rates.minConvNet)}). ${MINIMUM_SANS_TITRE}` });
  }
  return out;
}
