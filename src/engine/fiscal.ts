// Compteur fiscal (CGI art. 80 sexies) : abattement spécifique et revenu imposable estimé.
import { eachDay, lastDay, monthsBetween, type Month } from './dates';
import { computeMonth } from './month';
import { dayInfo, termsAt, type Ctx } from './payroll';
import { ratesAt } from './rates';

export interface FiscalChild {
  cid: string;
  /** Sommes reçues : salaire net imposable estimé + entretien + repas */
  recu: number;
  netImposable: number;
  entretienRepas: number;
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
  let net = 0, er = 0, rp = 0, jours = 0, courts = 0, abat = 0;
  let partiel = false;
  const last = upTo && upTo < `${year}-12` ? upTo : (`${year}-12` as Month);
  for (const m of monthsBetween(`${year}-01`, last)) {
    const r = computeMonth(ctx, m, enfants);
    if (!r.active) continue;
    if (r.missing) { partiel = true; continue; }
    net += r.netTotal + Math.round(r.brutEstime * PART_NON_DEDUCTIBLE);
    er += r.entretien + r.repas;
    if (r.fromHistory) {
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
  const recu = net + er + rp;
  const abattementBrut = Math.round(abat);
  const abattement = Math.min(abattementBrut, recu);
  return {
    cid: c.id, recu, netImposable: net, entretienRepas: er, repasParents: rp, jours, joursCourts: courts, abattementBrut, abattement,
    imposable: recu - abattement, smic: smics[smics.length - 1] ?? ratesAt(`${year}-01-01`).smic, smics, facteur, partiel,
  };
}
