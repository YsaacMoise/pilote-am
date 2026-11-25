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
 * T-033 (relu sur Légifrance le 18/11/2026) : l'art. 1er (« EN VIGUEUR DEPUIS LE 01 JANV. 2022 », arrêté du 14 mars 2022)
 * n'a pas de date de fin ; l'arrêté du 29 mai 2026 n'y déroge que « Pour les déplacements effectués entre le 1er juin
 * 2026 et le 31 décembre 2026 ». Après le 31/12/2026, le barème de base s'applique tant qu'un nouvel arrêté ne le
 * remplace pas (avertissement `SUIVI_ARRETES`). Ordre : la dérogation d'abord, `find` prend la première qui couvre la date.
 */
const ADMIN: { from: ISODate; to: ISODate; taux: number[][]; source: string }[] = [
  { from: '2026-06-01', to: '2026-12-31', taux: [[330, 410, 240], [420, 530, 310], [460, 570, 330]],
    source: 'arrêté du 29 mai 2026 (déplacements du 1er juin au 31 décembre 2026)' },
  { from: '2022-01-01', to: '9999-12-31', taux: [[320, 400, 230], [410, 510, 300], [450, 550, 320]],
    source: 'arrêté du 3 juillet 2006 modifié par l’arrêté du 14 mars 2022 (en vigueur le 1er janvier 2022)' },
];
/** Dernier jour couvert par un barème dont la fin est connue ; au-delà, barèmes en vigueur sans date de fin */
const BAREMES_CONNUS_AU: ISODate = '2026-12-31';
export const SUIVI_ARRETES = 'Indemnité kilométrique : l’app applique les barèmes en vigueur, qui n’ont pas de date de fin (barème de l’administration de l’arrêté du 3 juillet 2006, barème fiscal de l’article 6 B de l’annexe IV du code général des impôts). Si un nouvel arrêté paraît, l’app sera mise à jour.';

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
/** T-033 : art. 6 B « EN VIGUEUR DEPUIS LE 08 AVR. 2023 », sans date de fin (relu sur Légifrance le 18/11/2026) */
const FISCAL_AU: ISODate = '9999-12-31';
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
 * celui de ce seul accueil). `null` : barème non connu à cette date (avant 2022).
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
  /** `a_completer` : le résultat dépend d'une donnée à saisir (kilomètres de l'année, moteur électrique), demandée par le message */
  niveau: 'ok' | 'a_completer' | 'alerte' | 'impossible';
  messages: string[];
}

/** T-103 (K2) : données de l'AM pour le contrôle du tarif. `kmAn` : km faits pour le travail dans l'année civile, tous parents. */
export interface DonneesKm { kmAn?: number; electrique?: boolean }

/** T-103 (K2) : question posée quand le résultat dépend des kilomètres de l'année */
export const demandeKmAnnee = (annee: string) => `Indique dans « Réglages » les kilomètres faits pour le travail en ${annee} avec ta voiture, tous parents confondus (une prévision suffit en cours d’année) : l’app saura alors si ton tarif est conforme.`;
/** T-103 (K2) : question posée quand le résultat dépend du moteur électrique (barème fiscal majoré de 20 %) */
export const DEMANDE_ELECTRIQUE = 'Indique dans le contrat si ta voiture est électrique : le barème fiscal est majoré de 20 % pour une voiture électrique (code général des impôts, annexe IV, article 6 B, II).';

/**
 * Contrôle du tarif du contrat (centimes par km) contre les deux barèmes (CCN art. 57). T-103 (K2) : les deux barèmes se
 * lisent sur les kilomètres de l'année civile (arrêté du 3 juillet 2006 : « décomptés du 1er janvier au 31 décembre » ;
 * barème fiscal : kilomètres parcourus dans l'année), tous employeurs confondus. Avec `kmAn`, une seule tranche : conforme
 * ou alerte. Sans `kmAn`, alerte si le tarif est hors bornes pour toutes les tranches ; si le résultat dépend de la tranche,
 * l'app demande les kilomètres de l'année (jamais « à vérifier »).
 */
export function controleKm(cv: number | undefined, tarif: number, d: ISODate, donnees: DonneesKm = {}): ControleKm {
  if (!cv) return { niveau: 'impossible', messages: ['Indemnité kilométrique : contrôle impossible, renseigne la puissance fiscale de la voiture dans le contrat (elle figure sur la carte grise).'] };
  const T = tarif * 10;
  const annee = d.slice(0, 4);
  const kmAn = donnees.kmAn !== undefined && donnees.kmAn > 0 ? donnees.kmAn : undefined;
  const certain: string[] = [];
  const questions: string[] = [];
  // Plancher : barème de l'administration
  const a = baremeAdministration(d);
  if (!a) {
    certain.push('Indemnité kilométrique : l’app ne connaît pas le barème de l’administration avant 2022 ; le plancher n’est pas contrôlé pour cette date.');
  } else {
    const taux = a.taux[ligneAdmin(cv)];
    if (kmAn !== undefined) {
      const t = kmAn <= 2000 ? 0 : kmAn <= 10000 ? 1 : 2;
      if (T < taux[t]) certain.push(`Indemnité kilométrique : ${prix(T)} par km, c’est sous le barème de l’administration pour ${kmAn.toLocaleString('fr-FR')} km en ${annee} (${TRANCHES_ADMIN[t]} : au moins ${prix(taux[t])} ; ${a.source}). La convention l’interdit (article 57).`);
    } else {
      const sous = taux.map((x, i) => ({ x, i })).filter((o) => T < o.x);
      if (sous.length === taux.length) {
        certain.push(`Indemnité kilométrique : ${prix(T)} par km, c’est sous le barème de l’administration pour toutes les tranches (au moins ${prix(Math.min(...taux))} ; ${a.source}). La convention l’interdit (article 57).`);
      } else if (sous.length) {
        questions.push(`Indemnité kilométrique : ${prix(T)} par km est sous le barème de l’administration si tu fais ${sous.map((o) => `${TRANCHES_ADMIN[o.i]} (${prix(o.x)})`).join(' ou ')} dans l’année (${a.source}). ${demandeKmAnnee(annee)}`);
      }
    }
  }
  // Plafond : barème fiscal (sans date de fin depuis le 08/04/2023, FISCAL_AU)
  if (d >= FISCAL_DU && d <= FISCAL_AU) {
    const f = ligneFiscale(cv);
    const plafond = (elec: boolean) => (kmAn !== undefined ? fiscalTotal(cv, kmAn) / kmAn : f.t1) * (elec ? MAJORATION_ELECTRIQUE : 1);
    const pour = kmAn !== undefined ? ` pour ${kmAn.toLocaleString('fr-FR')} km en ${annee}` : '';
    if (T > plafond(true)) {
      certain.push(`Indemnité kilométrique : ${prix(T)} par km, c’est au-dessus du barème fiscal${pour || ' pour toutes les tranches'}, même pour une voiture électrique (au plus ${prix(Math.floor(plafond(true)))}). La convention l’interdit (article 57).`);
    } else if (T > plafond(false)) {
      if (donnees.electrique === false) certain.push(`Indemnité kilométrique : ${prix(T)} par km, c’est au-dessus du barème fiscal${pour} (au plus ${prix(Math.floor(plafond(false)))}, voiture non électrique). La convention l’interdit (article 57).`);
      else if (donnees.electrique === undefined) questions.push(`Indemnité kilométrique : ${prix(T)} par km est au-dessus du barème fiscal${pour} (au plus ${prix(Math.floor(plafond(false)))}), sauf pour une voiture électrique. ${DEMANDE_ELECTRIQUE}`);
    } else if (kmAn === undefined) {
      let des = 0;
      for (let km = 5001; km <= 20001 && !des; km++) if (T * km > fiscalTotal(cv, km) * (donnees.electrique ? MAJORATION_ELECTRIQUE : 1)) des = km;
      if (des) questions.push(`Indemnité kilométrique : ${prix(T)} par km est au-dessus du barème fiscal si tu fais ${des.toLocaleString('fr-FR')} km ou plus dans l’année${donnees.electrique ? '' : ' (voiture non électrique)'}. ${demandeKmAnnee(annee)}`);
    }
  }
  const suivi = d > BAREMES_CONNUS_AU ? [SUIVI_ARRETES] : [];
  if (certain.length) return { niveau: 'alerte', messages: [...certain, ...questions, ...suivi] };
  if (questions.length) return { niveau: 'a_completer', messages: [...questions, ...suivi] };
  return { niveau: 'ok', messages: suivi };
}

/**
 * Indemnité kilométrique d'un jour pour cet accueil, en centimes (T-025 C-2, CCN art. 113 lu en entier le 18/11/2026).
 * - Un seul particulier employeur demandeur : indemnité entière (al. 2, renvoi à l'art. 57), pas de partage.
 * - Plusieurs employeurs demandeurs : km × tarif ÷ enfants présents dans le véhicule (al. 3), au moins 2 enfants.
 * - Donnée manquante ou incohérente : `undefined`, les km restent « à confirmer », rien n'est payé en silence.
 * Saisies d'avant T-025 (`partage` absent) : un seul enfant dans la voiture ne peut venir que d'une famille demandeuse
 * (al. 2 : « afin de transporter l'enfant accueilli ») ; plus d'un enfant : à confirmer.
 */
export function indemniteKmJour(km: number, taux: number, partage: boolean | undefined, enfants: number | undefined): number | undefined {
  if (partage === false) return Math.round(km * taux);
  if (partage === true) return enfants !== undefined && enfants >= 2 ? Math.round((km * taux) / enfants) : undefined;
  return enfants === 1 ? Math.round(km * taux) : undefined;
}
