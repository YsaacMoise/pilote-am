// T-115 (R3) : brut calculé depuis le net. Règle et sources : calculateur-arvela, regles/t115-net-brut.md (sections 3 et 5).
// Aucun texte ne publie de formule ; deux calculs se lisent dans les sorties officielles de l'Urssaf :
// - F1, brut d'une somme du mois : net ÷ part nette (1 − taux salarial global), arrondi au centime, comme le convertisseur
//   « Pajemploi : convertir un salaire brut ou net » (17 sorties sur 17) et la « brutalisation » du net déclaré ;
// - F2, brut HORAIRE affiché au contrat : le brut au centime qui redonne le net quand chaque cotisation est arrondie au
//   centime puis retirée (méthode des tableaux Urssaf brut → net, 19 cas sur 19) ; s'il y en a plusieurs, le plus proche de F1.
// Un net peut venir de plusieurs bruts : le brut écrit par l'AM (celui de son contrat) prime toujours.
// Mayotte : aucun brut sûr au centime (rapport, A4) ; avant 2024 : taux non relus (A5). L'app demande alors le brut.
import { cotisParams } from './cotisations';
import type { ISODate } from './dates';
import type { Region } from './regions';

/** Premier jour où les taux salariaux sont vérifiés (métropole, DROM, Alsace-Moselle) : regles/t115-net-brut.md, 2.5. */
export const BRUT_CALCULE_DEPUIS = '2024-01-01';

/** Part du net dans le brut à la date `d` ; undefined avant les taux vérifiés (le brut est alors demandé à l'AM). */
export function partNette(d: ISODate, region: Region): number | undefined {
  if (region === 'mayotte' || d < BRUT_CALCULE_DEPUIS) return undefined;
  const p = cotisParams(d);
  return 1 - (region === 'alsaceMoselle' ? p.salarialeAlsaceMoselle : p.salariale);
}

/** F1 : brut (centimes) d'une somme nette (centimes), arrondi au centime ; undefined si la période n'a pas de taux vérifiés. */
export function brutDepuisNet(net: number, d: ISODate, region: Region): number | undefined {
  const p = partNette(d, region);
  return p === undefined ? undefined : Math.round(net / p);
}

/**
 * Net d'un brut horaire (centimes), chaque cotisation salariale arrondie au centime le plus proche puis retirée : vieillesse
 * 6,90 % et 0,40 %, retraite complémentaire 3,15 %, CEG 0,86 %, prévoyance 1,04 % sur le brut ; CSG non imposable 6,80 % et
 * CSG imposable + CRDS 2,90 % (une seule ligne, comme le tableau Urssaf) sur 98,25 % du brut ; Alsace-Moselle : maladie 1,30 %
 * (1,50 % avant avril 2022). Rapport, 2.1 et 5.2. Calcul en dix-millièmes de centime entiers (aucun flottant entre deux étapes).
 */
export function netLigneParLigne(brut: number, d: ISODate, region: Region): number {
  // Taux en pour-cent-mille du brut (6,90 % = 6900), assiette CSG 98,25 % = 9825 / 10000.
  const surBrut = [6900, 400, 3150, 860, 1040];
  if (region === 'alsaceMoselle') surBrut.push(d < '2022-04-01' ? 1500 : 1300);
  const a = (num: number, den: number) => Math.floor((2 * num + den) / (2 * den)); // arrondi au plus proche, demi vers le haut
  let retenues = 0;
  for (const t of surBrut) retenues += a(brut * t, 100000);
  for (const t of [6800, 2900]) retenues += a(brut * 9825 * t, 10000 * 100000);
  return brut - retenues;
}

/** F2 : brut horaire (centimes) affiché pour un net horaire ; undefined si la période n'a pas de taux vérifiés. */
export function brutHoraireDepuisNet(net: number, d: ISODate, region: Region): number | undefined {
  const f1 = brutDepuisNet(net, d, region);
  if (f1 === undefined || net <= 0) return f1;
  let meilleur: number | undefined;
  for (let b = f1 - 10; b <= f1 + 10; b++) {
    if (netLigneParLigne(b, d, region) !== net) continue;
    if (meilleur === undefined || Math.abs(b * partNette(d, region)! - net) < Math.abs(meilleur * partNette(d, region)! - net)) meilleur = b;
  }
  return meilleur ?? f1;
}
