// Indemnité kilométrique (T-017). CCN IDCC 3239, socle commun, art. 57 : « Il ne peut être ni inférieur au barème de
// l'administration ni supérieur au barème fiscal. » Socle AM, art. 113 : prorata du nombre d'enfants transportés.
// Textes relus le 18/11/2026, valeurs recopiées : projet/moteur/correctifs-t023.md, sections 1.1 et 1.2.
// Montants en millièmes d'euro par km. Le moteur ne traite que la voiture (tableau « automobiles »).
import type { ISODate } from './dates';

/** Tranches du barème de l'administration : jusqu'à 2 000 km, de 2 001 à 10 000 km, après 10 000 km */
const TRANCHES_ADMIN = ['jusqu’à 2 000 km', 'de 2 001 à 10 000 km', 'après 10 000 km'];

/**
 * Barème de l'administration (arrêté du 3 juillet 2006, art. 1er, a), métropole et DOM, « les kilomètres étant décomptés
 * du 1er janvier au 31 décembre de chaque année ». Lignes : 5 CV et moins ; 6 et 7 CV ; 8 CV et plus.
 */
const ADMIN: { from: ISODate; to: ISODate; taux: number[][]; source: string }[] = [
  { from: '2022-01-01', to: '2026-05-31', taux: [[320, 400, 230], [410, 510, 300], [450, 550, 320]],
    source: 'arrêté du 14 mars 2022 (en vigueur le 1er janvier 2022)' },
  { from: '2026-06-01', to: '2026-12-31', taux: [[330, 410, 240], [420, 530, 310], [460, 570, 330]],
    source: 'arrêté du 29 mai 2026 (déplacements du 1er juin au 31 décembre 2026)' },
];

/**
 * Barème fiscal (CGI, annexe IV, art. 6 B, I, tableau « automobiles », version du 08/04/2023 écrite par l'arrêté du
 * 27 mars 2023, applicable « à compter de l'imposition des revenus de l'année 2022 »). Par puissance 3 (et moins) à 7
 * (et plus) : d × t1 jusqu'à 5 000 km ; (d × t2) + fixe (en euros) de 5 001 à 20 000 km ; d × t3 au-delà.
 */
const FISCAL: Record<number, { t1: number; t2: number; fixe: number; t3: number }> = {
  3: { t1: 529, t2: 316, fixe: 1065, t3: 370 },
  4: { t1: 606, t2: 340, fixe: 1330, t3: 407 },
  5: { t1: 636, t2: 357, fixe: 1395, t3: 427 },
  6: { t1: 665, t2: 374, fixe: 1457, t3: 447 },
  7: { t1: 697, t2: 394, fixe: 1515, t3: 470 },
};
const FISCAL_DU: ISODate = '2022-01-01';
const FISCAL_AU: ISODate = '2026-12-31';
/** CGI, annexe IV, art. 6 B, II : « Pour les véhicules électriques, le montant [...] est majoré de 20 % » */
const MAJORATION_ELECTRIQUE = 1.2;

export function baremeAdministration(d: ISODate): { taux: number[][]; source: string } | undefined {
  return ADMIN.find((b) => d >= b.from && d <= b.to);
}

const ligneAdmin = (cv: number) => (cv <= 5 ? 0 : cv <= 7 ? 1 : 2);
const ligneFiscale = (cv: number) => FISCAL[Math.max(3, Math.min(7, Math.round(cv)))];

/** Barème fiscal total (millièmes d'euro) pour `km` kilomètres dans l'année, voiture non électrique */
function fiscalTotal(cv: number, km: number): number {
  const f = ligneFiscale(cv);
  if (km <= 5000) return km * f.t1;
  if (km <= 20000) return km * f.t2 + f.fixe * 1000;
  return km * f.t3;
}

/**
 * Fourchette du tarif par km pour un kilométrage annuel donné (simulateur d'avant contrat, qui suppose que le cumul est
 * celui de ce seul accueil). `null` : barème non connu à cette date, à vérifier.
 */
export function bornesKm(cv: number, kmAn: number, d: ISODate): { min: number | null; max: number | null } {
  const a = baremeAdministration(d);
  const t = kmAn <= 2000 ? 0 : kmAn <= 10000 ? 1 : 2;
  const fiscalOk = d >= FISCAL_DU && d <= FISCAL_AU;
  return {
    min: a ? a.taux[ligneAdmin(cv)][t] : null,
    max: fiscalOk ? Math.floor(fiscalTotal(cv, Math.max(1, kmAn)) / Math.max(1, kmAn)) : null,
  };
}

const prix = (m: number) => `${(m / 1000).toFixed(3).replace('.', ',').replace(/0$/, '')} €`;

export interface ControleKm {
  niveau: 'ok' | 'a_verifier' | 'alerte' | 'impossible';
  messages: string[];
}

/**
 * Contrôle du tarif du contrat (centimes par km) contre les deux barèmes (CCN art. 57). La tranche dépend d'un cumul
 * annuel dont la base n'est pas tranchée (A-38 : année civile, contrat, employeur) : alerte certaine seulement si le
 * tarif est hors bornes pour toutes les tranches possibles ; sinon « à vérifier » avec la condition de tranche.
 */
export function controleKm(cv: number | undefined, tarif: number, d: ISODate): ControleKm {
  if (!cv) return { niveau: 'impossible', messages: ['Indemnité kilométrique : contrôle impossible, renseigne la puissance fiscale de la voiture dans le contrat (elle figure sur la carte grise).'] };
  const T = tarif * 10;
  const certain: string[] = [];
  const conditionnel: string[] = [];
  // Plancher : barème de l'administration
  const a = baremeAdministration(d);
  if (!a) {
    conditionnel.push('Indemnité kilométrique : barème de l’administration à vérifier pour cette date (l’app ne le connaît pas), plancher non contrôlé.');
  } else {
    const taux = a.taux[ligneAdmin(cv)];
    const sous = taux.map((x, i) => ({ x, i })).filter((o) => T < o.x);
    if (sous.length === taux.length) {
      certain.push(`Indemnité kilométrique : ${prix(T)} par km, c’est sous le barème de l’administration pour toutes les tranches (au moins ${prix(Math.min(...taux))} ; ${a.source}). La convention l’interdit (article 57).`);
    } else if (sous.length) {
      conditionnel.push(`Indemnité kilométrique : ${prix(T)} par km est sous le barème de l’administration si le cumul annuel des kilomètres est ${sous.map((o) => `${TRANCHES_ADMIN[o.i]} (${prix(o.x)})`).join(' ou ')} (${a.source}). Vérifie le cumul avec les parents.`);
    }
  }
  // Plafond : barème fiscal
  if (d < FISCAL_DU || d > FISCAL_AU) {
    conditionnel.push('Indemnité kilométrique : barème fiscal à vérifier pour cette date, plafond non contrôlé.');
  } else {
    const f = ligneFiscale(cv);
    if (T > f.t1 * MAJORATION_ELECTRIQUE) {
      certain.push(`Indemnité kilométrique : ${prix(T)} par km, c’est au-dessus du barème fiscal pour toutes les tranches, même pour une voiture électrique (au plus ${prix(Math.floor(f.t1 * MAJORATION_ELECTRIQUE))}). La convention l’interdit (article 57).`);
    } else if (T > f.t1) {
      conditionnel.push(`Indemnité kilométrique : ${prix(T)} par km est au-dessus du barème fiscal (au plus ${prix(f.t1)}), sauf pour une voiture électrique (barème majoré de 20 %). Vérifie avec les parents.`);
    } else {
      let des = 0;
      for (let km = 5001; km <= 20001 && !des; km++) if (T * km > fiscalTotal(cv, km)) des = km;
      if (des) {
        conditionnel.push(`Indemnité kilométrique : ${prix(T)} par km est au-dessus du barème fiscal si le cumul annuel des kilomètres atteint ${des.toLocaleString('fr-FR')} km (voiture non électrique). Vérifie le cumul avec les parents.`);
      }
    }
  }
  if (certain.length) return { niveau: 'alerte', messages: [...certain, ...conditionnel] };
  if (conditionnel.length) return { niveau: 'a_verifier', messages: conditionnel };
  return { niveau: 'ok', messages: [] };
}
