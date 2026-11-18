// Compteur fiscal (CGI art. 80 sexies) : abattement spécifique et revenu imposable estimé.
import { eachDay, lastDay, monthLabel, monthsBetween, type Month } from './dates';
import { computeMonth } from './month';
import { dayInfo, termsAt, type Ctx } from './payroll';
import { MESSAGE_PERIODE_NON_GEREE, ratesAt } from './rates';
import { euros } from './money';

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
  /** T-023 : barème absent pour une partie de l'année (SMIC ou avantage repas) : estimation incomplète, à confirmer */
  nonGere?: string;
}

/** CSG non déductible (2,4 %) + CRDS (0,5 %) sur 98,25 % du brut : à réintégrer dans le net imposable */
export const PART_NON_DEDUCTIBLE = 0.029 * 0.9825;

export function fiscalYear(ctx: Ctx, year: number, enfants = 0, upTo?: Month): FiscalChild {
  const c = ctx.c;
  // SMIC horaire en vigueur le jour de la garde (BOI-RSA-CHAMP-10-20-10 § 490)
  const smics: number[] = [];
  const nonGere = new Set<string>();
  // T-023 : jamais le SMIC d'une autre période. Avant les barèmes vérifiés, pas d'abattement calculé pour ce jour.
  const smicAt = (d: string): number => {
    const v = ratesAt(d)?.smic;
    if (v === undefined) { nonGere.add(`${MESSAGE_PERIODE_NON_GEREE} L’abattement de ces jours n’est pas calculé.`); return 0; }
    if (smics[smics.length - 1] !== v) smics.push(v);
    return v;
  };
  const repasAt = (d: string): number => {
    const v = ratesAt(d)?.repasAvantage;
    if (v === undefined) { nonGere.add('Repas fournis par les parents : la valeur officielle du repas pour cette année n’est pas dans l’app. Ils ne sont pas comptés ; ajoute-les toi-même.'); return 0; }
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
    // T-031 : mois refusé (cas non géré) : ni ses sommes ni ses jours ne sont comptés, et c'est dit.
    if (r.nonGere.length) {
      nonGere.add(`${monthLabel(m).replace(/^./, (x) => x.toUpperCase())} n’est pas calculé (cas non géré) : ses sommes et ses jours d’accueil ne sont pas comptés. Ajoute-les à partir du bulletin de salaire.`);
      continue;
    }
    net += r.netTotal + Math.round(r.brutEstime * PART_NON_DEDUCTIBLE);
    // T-025 C-5 : un salaire d'événement familial à confirmer n'est pas dans ce net : le dire, ne pas le compter en silence.
    // T-028 : des congés payés à confirmer ne sont pas dans ce net (comme l'événement familial) : le dire.
    if (r.cpAConfirmer) nonGere.add(`Congés payés à confirmer en ${monthLabel(m)} : ils ne sont pas comptés. Ajoute-les une fois confirmés avec les parents.`);
    if (r.evenementAConfirmer) nonGere.add(`Événement familial à confirmer : ${euros(r.evenementAConfirmer)} de salaire en ${monthLabel(m)} ne sont pas comptés. Ajoute-les une fois confirmés avec les parents.`);
    er += r.entretien + r.repas;
    if (r.fromHistory) {
      // Sans détail des jours : jours d'activité du bulletin, journées supposées de 8 h ou plus.
      jours += r.joursActivite;
      abat += r.joursActivite * facteur * smicAt(lastDay(m));
      if (termsAt(c, `${m}-01`).repasParents) rp += r.joursActivite * repasAt(lastDay(m));
      continue;
    }
    for (const d of eachDay(`${m}-01`, lastDay(m))) {
      const di = dayInfo(ctx, d);
      if (di.presentMin <= 0 || (di.kind !== 'present' && di.kind !== 'prevu')) continue;
      jours++;
      if (termsAt(c, d).repasParents) rp += repasAt(d);
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
    imposable: recu - abattement, smic: smics[smics.length - 1] ?? ratesAt(`${year}-01-01`)?.smic ?? 0, smics, facteur, partiel,
    nonGere: nonGere.size ? [...nonGere].join(' ') : undefined,
  };
}
