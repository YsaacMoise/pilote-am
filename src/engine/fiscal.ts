// Compteur fiscal (CGI art. 80 sexies) : abattement spécifique et revenu imposable estimé.
import { eachDay, lastDay, monthsBetween, type Month } from './dates';
import { computeMonth } from './month';
import { dayInfo, termsAt, type Ctx } from './payroll';
import { plafondHS, ratesAt } from './rates';

export interface FiscalChild {
  cid: string;
  /** Sommes reçues : salaire net imposable estimé + entretien + repas + kilomètres */
  recu: number;
  /** Salaire net imposable estimé, hors heures complémentaires et majorées exonérées */
  netImposable: number;
  /**
   * Heures complémentaires et majorées : rémunération nette imposable qu'elles auraient (net déclaré, réduction de
   * cotisations, CSG non déductible et CRDS), avant le plafond annuel de l'exonération (CGI art. 81 quater).
   */
  hsValeur: number;
  /** Part exonérée (case 1GH de la déclaration de revenus) */
  hsExonere: number;
  /** Part au-delà du plafond annuel, réintégrée dans le net imposable */
  hsImposable: number;
  entretienRepas: number;
  /** Indemnités kilométriques (BOI-RSA-CHAMP-10-20-10 § 460 : indemnités de déplacement comprises) */
  km: number;
  /** Repas fournis par les parents, évalués au barème de l'avantage en nature */
  repasParents: number;
  jours: number;
  /** Jours de moins de 8 h (abattement au prorata) */
  joursCourts: number;
  abattementBrut: number;
  abattement: number;
  imposable: number;
  /** SMIC horaire retenu (le dernier de l'année) */
  smic: number;
  /** SMIC horaires successifs de l'année, dans l'ordre */
  smics: number[];
  facteur: number;
  partiel: boolean;
  /** Mois repris d'un bulletin : heures exonérées et kilomètres inconnus, comptés comme imposables ou absents */
  moisHistorique: number;
}

/** CSG non déductible (2,4 %) + CRDS (0,5 %) sur 98,25 % du brut : à réintégrer dans le net imposable */
export const PART_NON_DEDUCTIBLE = 0.029 * 0.9825;

export function fiscalYear(ctx: Ctx, year: number, enfants = 0, upTo?: Month): FiscalChild {
  const c = ctx.c;
  // SMIC horaire en vigueur le jour de la garde (BOI-RSA-CHAMP-10-20-10 § 490)
  const smics: number[] = [];
  const smicAt = (d: string): number => {
    const v = ratesAt(d).smic;
    if (smics[smics.length - 1] !== v) smics.push(v);
    return v;
  };
  const facteur = c.majoreFiscal ? 4 : 3;
  let net = 0, hs = 0, er = 0, km = 0, rp = 0, jours = 0, courts = 0, abat = 0;
  let partiel = false;
  let moisHistorique = 0;
  const last = upTo && upTo < `${year}-12` ? upTo : (`${year}-12` as Month);
  for (const m of monthsBetween(`${year}-01`, last)) {
    const r = computeMonth(ctx, m, enfants);
    if (!r.active) continue;
    if (r.missing) { partiel = true; continue; }
    // C-019 : les heures complémentaires et majorées sont exonérées d'impôt (CGI art. 81 quater) ; elles sortent du net
    // imposable et des sommes reçues du régime spécial, dans la limite du plafond annuel (fiscalYears).
    const hsPart = r.hsNet + Math.round(r.hsBrut * PART_NON_DEDUCTIBLE);
    net += r.netTotal + Math.round(r.brutEstime * PART_NON_DEDUCTIBLE) - hsPart;
    hs += hsPart + r.reductionHS;
    er += r.entretien + r.repas;
    km += r.km;
    if (r.fromHistory) {
      moisHistorique++;
      // Sans détail des jours : jours d'activité du bulletin, journées supposées de 8 h ou plus.
      jours += r.joursActivite;
      abat += r.joursActivite * facteur * smicAt(lastDay(m));
      if (termsAt(c, `${m}-01`).repasParents) rp += r.joursActivite * ratesAt(lastDay(m)).repasAvantage;
      continue;
    }
    for (const d of eachDay(`${m}-01`, lastDay(m))) {
      const di = dayInfo(ctx, d);
      if (di.presentMin <= 0 || (di.kind !== 'present' && di.kind !== 'prevu')) continue;
      jours++;
      if (termsAt(c, d).repasParents) rp += ratesAt(d).repasAvantage;
      const ratio = Math.min(1, di.presentMin / 480);
      if (ratio < 1) courts++;
      abat += facteur * smicAt(d) * ratio;
    }
  }
  const recu = net + er + km + rp;
  const abattementBrut = Math.round(abat);
  const abattement = Math.min(abattementBrut, recu);
  return {
    cid: c.id, recu, netImposable: net, hsValeur: hs, hsExonere: hs, hsImposable: 0, entretienRepas: er, km, repasParents: rp, jours, joursCourts: courts, abattementBrut, abattement,
    imposable: recu - abattement, smic: smics[smics.length - 1] ?? ratesAt(`${year}-01-01`).smic, smics, facteur, partiel, moisHistorique,
  };
}

/**
 * Applique le plafond annuel de l'exonération des heures complémentaires et majorées (7 500 € de rémunération nette
 * imposable par salariée, tous employeurs réunis : CGI art. 81 quater ; brochure impots.gouv 2026). La part au-delà
 * revient dans le net imposable de chaque enfant, au prorata de ses heures.
 */
export function plafonnerHS(rows: FiscalChild[], plafond: number): FiscalChild[] {
  const total = rows.reduce((a, r) => a + r.hsValeur, 0);
  const exces = Math.max(0, total - plafond);
  if (!exces) return rows;
  let reste = exces;
  // Le reste d'arrondi va au dernier enfant qui a des heures exonérées (jamais une part négative).
  const dernier = rows.map((r) => r.hsValeur > 0).lastIndexOf(true);
  return rows.map((r, i) => {
    const part = i === dernier ? reste : r.hsValeur > 0 ? Math.round((exces * r.hsValeur) / total) : 0;
    reste -= part;
    const recu = r.recu + part;
    const abattement = Math.min(r.abattementBrut, recu);
    return { ...r, hsImposable: part, hsExonere: r.hsValeur - part, netImposable: r.netImposable + part, recu, abattement, imposable: recu - abattement };
  });
}

/**
 * L'abattement est limité au total des sommes perçues de l'ensemble des enfants, pas enfant par enfant (brochure
 * impots.gouv « Assistants maternels », mars 2026, p. 89 ; BOI-RSA-CHAMP-10-20-10 § 490). Chaque enfant garde son
 * abattement entier tant que le total ne dépasse pas ; sinon chacun est réduit au prorata. Le reste d'un enfant
 * peut alors être négatif : seul le total compte.
 */
export function plafonnerAbattement(rows: FiscalChild[]): FiscalChild[] {
  const recu = rows.reduce((a, r) => a + r.recu, 0);
  const abat = rows.reduce((a, r) => a + r.abattementBrut, 0);
  const cible = Math.min(abat, recu);
  let reste = cible;
  return rows.map((r, i) => {
    const a = i === rows.length - 1 ? reste : abat > recu ? Math.round((r.abattementBrut * recu) / abat) : r.abattementBrut;
    reste -= a;
    return { ...r, abattement: a, imposable: r.recu - a };
  });
}

/** Tous les contrats de l'année : plafond des heures exonérées, puis plafond de l'abattement, tous enfants réunis */
export function fiscalYears(ctxs: Ctx[], year: number, enfants = 0, upTo?: Month): FiscalChild[] {
  return plafonnerAbattement(plafonnerHS(ctxs.map((ctx) => fiscalYear(ctx, year, enfants, upTo)), plafondHS(year)));
}
