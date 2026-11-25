// Étape 5 : 20 cas passés au simulateur officiel Urssaf/Pajemploi le 1er novembre 2026 (calculerResteACharge),
// avec les montants mensuels déclarés que produit notre moteur (salaire net, entretien, repas, heures du mois).
// Références par enfant gardé, en centimes : [CMG, cotisations prises en charge, cotisations totales].
//
// Écarts admis, tous expliqués :
// - CMG à 2 centimes : le décret (CSS D531-18) arrondit les ressources mensuelles à l'euro ; le simulateur Urssaf ne les arrondit pas.
// - Cotisations à 5 centimes : l'Urssaf arrondit chaque cotisation au centime.
// - Heures au-delà de 45 h : notre moteur retire la réduction de cotisations salariales (11,31 %, CSS L241-17),
//   que Pajemploi applique aux déclarations mais que ce simulateur ne connaît pas (il ne demande pas les heures majorées).
// - T-103 (R1) : c04 (Alsace-Moselle). La référence a été obtenue avec les heures du mois de l'ancien moteur, qui comptait le
//   Vendredi saint et le 26 décembre comme fériés. Ils ne le sont plus pour l'AM (C. trav. L3134-1, al. 2) : les heures du mois
//   changent, donc le CMG (420,12 € au lieu de 419,96 €). Référence à refaire au simulateur Urssaf avec les nouvelles heures ;
//   valeur de l'app gardée ici, non revérifiée.
// - T-103 (S7) : c16 (année incomplète). Les congés payés du mois moyen suivent la CCN 48.1.1.5 (plus haut du dixième et du
//   maintien) au lieu du seul dixième : 72,27 € par mois au lieu de 66,59 €, donc le CMG (415,25 € au lieu de 412,56 €) et les cotisations (623,26 € au lieu de 618,50 €) changent.
//   Référence à refaire au simulateur Urssaf avec ces montants (liste rapports/T-103-a-relever.md de calculateur-arvela).
import { describe, expect, it } from 'vitest';
import { CAS, D } from './cas-urssaf';
import { simuler } from '../src/engine/simulation';

const URSSAF: Record<string, [number, number, number][]> = {
  c01: [[42593, 58275, 58275]],
  c02: [[0, 0, 58275]],
  c03: [[88147, 127075, 139643]],
  c04: [[42012, 59520, 59520]], // T-103 (R1) : référence Urssaf d'avant (419,96 €) périmée, voir l'en-tête
  c05: [[88147, 133167, 156667]],
  c06: [[70632, 58275, 58275]],
  c07: [[48190, 58275, 58275], [48190, 58275, 58275]],
  c08: [[48190, 58275, 58275], [0, 0, 58275]],
  c09: [[44169, 58275, 58275], [44169, 58275, 58275], [44169, 58275, 58275]],
  c10: [[68338, 58275, 58275]],
  c11: [[0, 58275, 58275]],
  c12: [[49512, 58275, 58275]],
  c13: [[68233, 58275, 58275]],
  c14: [[53787, 58275, 58275]],
  c15: [[65034, 58275, 58275]],
  c16: [[41525, 62326, 62326]], // T-103 (S7) : congés au plus haut du dixième et du maintien ; référence Urssaf d'avant (412,56 €) périmée, voir l'en-tête
  c17: [[34086, 42390, 42390]],
  c18: [[28244, 29389, 29389]],
  c19: [[46560, 56687, 56687]],
  c20: [[42593, 58275, 58275]],
};

describe('20 cas comparés au simulateur officiel Urssaf (étape 5)', () => {
  for (const c of CAS) {
    it(`${c.id} : ${c.libelle}`, () => {
      const r = simuler(c.input, D);
      const ref = URSSAF[c.id];
      expect(r.enfants).toHaveLength(ref.length);
      const reduction = Math.round(r.reductionHeuresMaj / r.nbEnfants);
      r.enfants.forEach((e, k) => {
        const [cmg, pec, cot] = ref[k];
        expect(Math.abs(e.cmg - cmg), 'CMG').toBeLessThanOrEqual(2);
        const total = e.cotisationsPrisesEnCharge + e.cotisationsReste;
        expect(Math.abs(total + reduction - cot), 'cotisations').toBeLessThanOrEqual(5);
        const pecAttendue = cot > 0 ? Math.round((pec * (cot - reduction)) / cot) : 0;
        expect(Math.abs(e.cotisationsPrisesEnCharge - pecAttendue), 'prise en charge').toBeLessThanOrEqual(5);
      });
    });
  }

  it('bilan : 18 CMG identiques au centime sur 20 (dont c04 et c16, valeurs de l’app depuis la T-103)', () => {
    let exacts = 0;
    for (const c of CAS) simuler(c.input, D).enfants.forEach((e, k) => { if (k === 0 && e.cmg === URSSAF[c.id][k][0]) exacts++; });
    expect(exacts).toBe(18);
  });
});
