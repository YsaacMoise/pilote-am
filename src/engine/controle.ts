// Contrôle du bulletin déclaré par la famille, brut compris.
import { lastDay } from './dates';
import type { Bulletin } from './model';
import type { MonthResult } from './month';
import { libelleMinimumBrut, MESSAGE_PERIODE_NON_GEREE, minimumBrut, minimumSansTitre, ratesAtRegion, valeurDepuis } from './rates';
import type { Region } from './regions';
import { euros } from './money';

export type Level = 'ok' | 'info' | 'warn';
export interface Check { level: Level; title: string; detail: string }

export function controle(b: Bulletin, r: MonthResult, rateNet: number, region: Region = 'metropole', rateBrut?: number): Check[] {
  const out: Check[] = [];
  // T-077 (R1, R2) : repère net, part du net dans le brut et minimum légal de la région.
  const rates = ratesAtRegion(lastDay(b.month), region);
  const minB = minimumBrut(lastDay(b.month), region);
  const MINIMUM_SANS_TITRE = minimumSansTitre(region);
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

  // T-103 (D1, D6) : avec le taux horaire brut du contrat, le brut attendu est exact : brut calculé par l'app (r.brutEstime,
  // net × brut ÷ net du contrat). Sans lui, le brut n'est pas contrôlé et l'app demande le taux.
  if (b.brut != null && b.brut > 0) {
    // T-115 (R3) : sans brut écrit par l'AM, le brut du mois est calculé depuis le net (brut.ts, F1) : il se contrôle aussi.
    if (!r.brutConnu) {
      out.push({ level: 'info', title: 'Brut non contrôlé', detail: 'Indique ton salaire horaire brut dans le contrat (il est écrit à côté du net) : l’app contrôlera le brut du bulletin.' });
    } else {
      const diff = b.brut - r.brutEstime;
      if (Math.abs(diff) <= tol) out.push({ level: 'ok', title: 'Salaire brut conforme', detail: `${euros(b.brut)} sur le bulletin, ${euros(r.brutEstime)} calculé par l’app.` });
      else out.push({ level: diff < 0 ? 'warn' : 'info', title: 'Salaire brut différent', detail: `${euros(b.brut)} sur le bulletin, ${euros(r.brutEstime)} calculé par l’app${rateBrut ? ` (${euros(rateBrut)} brut de l’heure)` : ''}. Vérifie le taux déclaré à Pajemploi.` });
    }
  }
  // T-025 C-3 : minimum = le plus haut de la grille et de 0,281 × SMIC (CASF D423-9), comparé au taux brut du contrat.
  if (rateBrut && minB && rateBrut < minB.certain) {
    out.push({ level: 'warn', title: 'Brut horaire sous le minimum', detail: `${euros(rateBrut)} brut de l’heure au contrat, le minimum est ${libelleMinimumBrut(minB)}. ${MINIMUM_SANS_TITRE}` });
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
