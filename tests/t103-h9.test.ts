// T-103 (H9, H2) : heures faites en plus une semaine qui compte une absence. Attendus calculés à la main.
// Règle : une absence payée (enfant absent, férié chômé, événement familial) ne se compense pas avec les heures en plus
// (CCN 105 : absence « rémunérée » ; 47.2 : « maintien de la rémunération brute habituelle » ; DREETS Bourgogne-Franche-Comté,
// guide des assistants maternels, juin 2026 : absences payées comptées dans les heures réellement effectuées, pour éviter une
// compensation) ; elle ne compte pas pour le seuil des 45 h (H2 : heures supplémentaires = « heures de travail effectif »
// au-delà de 45 h, Code du travail numérique, fiche 3239 « Heures supplémentaires », 08/01/2026 ; Cass. soc. 04/04/2012,
// n° 10-10.701, jours fériés). T-109 (comparateur des vérifications, 2.1) : seules les heures « de travail effectuées » au-delà
// de la durée du contrat sont des heures complémentaires (CCN 96.4) ; les heures en plus dans la limite des heures prévues non
// travaillées (absence payée ou retenue) sont des heures normales payées en plus, au taux du contrat. Une absence retenue (art. 111) est compensée d'abord par les heures en plus de la semaine :
// heures normales au taux du contrat (CCN 96.4 : rien au-delà de la durée prévue au contrat) ; aucune heure travaillée sans paie.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Contract, DayRec, Planning } from '../src/engine/model';
import { makeCtx, monthBase } from '../src/engine/payroll';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}
const ct = (o: Partial<Contract> = {}): Contract => ({
  id: 'c1', child: 'L', family: 'M', color: 0, start: '2026-01-05', yearType: 'complete', weeks: 52, weeksOff: [],
  planning: week('08:00', '16:00'), rateNet: 500, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0, kmTaux: 0,
  cpMode: 'juin', majoreFiscal: false, trackedFrom: '2026-01-05', balances: { cpRestants: 30, cpEnCours: 0, maladieDeduits: 0 },
  history: [], createdAt: 0, alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false, ...o,
} as Contract);
const rec = (date: string, r: Partial<DayRec>): DayRec => ({ key: `c1|${date}`, cid: 'c1', date, ...r });
const pres = (d: string, fin: string) => rec(d, { pres: [{ a: '08:00', d: fin }] });
const MAR_VEN = ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'];
const mois = (c: Contract, recs: DayRec[], leaves: AmLeave[], m = '2026-10') => monthBase(makeCtx(c, recs, leaves, '2026-12-31'), m);
// 40 h (8 h × 5), 5,00 € net : 866,67 € mensualisés ; octobre 2026 : 22 jours × 8 h = 176 h.

describe('T-103 (H9) : absence payée, pas de compensation', () => {
  it('lundi 12/10 enfant absent (payé), mardi-vendredi 11 h : 44 h effectuées : 4 HC et 8 h normales payées en plus (T-109)', () => {
    const b = mois(ct(), [rec('2026-10-12', { abs: 'parents' }), ...MAR_VEN.map((d) => pres(d, '19:00'))], []);
    expect(b.retenue).toBe(0);
    expect(b.complMin).toBe(4 * 60);
    expect(b.complAmount).toBe(2000);
    expect(b.normalesPlusMin).toBe(8 * 60);
    expect(b.normalesPlusAmount).toBe(4000);
    expect(b.majMin).toBe(0);
    expect(b.net).toBe(86667 + 2000 + 4000); // les 12 h sont toutes payées
  });
  it('même semaine sans absence (lundi 8 h) : 52 h effectuées, 5 HC et 7 heures majorées', () => {
    const b = mois(ct(), MAR_VEN.map((d) => pres(d, '19:00')), []);
    expect(b.complMin).toBe(5 * 60);
    expect(b.majMin).toBe(7 * 60);
    expect(b.majAmount).toBe(3850); // 7 × 5,00 × 1,10
  });
  it('heures complémentaires majorées au contrat (25 %) : 35 h effectuées, les 3 h en plus sont des heures normales (T-109)', () => {
    const b = mois(ct({ majorationCompl: 25 }), [rec('2026-10-12', { abs: 'parents' }), pres('2026-10-13', '19:00')], []);
    expect(b.complAmount).toBe(0);
    expect(b.normalesPlusAmount).toBe(1500); // 3 × 5,00, sans majoration
  });
  it("comparateur, 2.1 : HC majorées de 25 %, lundi absent payé, 11 h du mardi au vendredi : 4 HC majorées et 8 h normales", () => {
    // Montants du comparateur à 4,20 € : 4 HC × 5,25 = 21,00 € et 8 h × 4,20 = 33,60 € ; ici à 5,00 € net.
    const b = mois(ct({ majorationCompl: 25 }), [rec('2026-10-12', { abs: 'parents' }), ...MAR_VEN.map((d) => pres(d, '19:00'))], []);
    expect(b.complAmount).toBe(2500); // 4 × 5,00 × 1,25
    expect(b.normalesPlusAmount).toBe(4000); // 8 × 5,00
  });
});

describe('T-103 (H9) : absence retenue, compensée par les heures en plus de la semaine', () => {
  const malade: AmLeave[] = [{ id: 'm', type: 'am_malade', from: '2026-10-12', to: '2026-10-12' }];
  it('lundi AM malade (retenue de 8 h), mardi 11 h : 3 h normales au taux du contrat, aucune HC', () => {
    const b = mois(ct(), [pres('2026-10-13', '19:00')], malade);
    expect(b.retenue).toBe(3939); // 866,67 × 8 ÷ 176
    expect(b.complMin).toBe(0);
    expect(b.normalesPlusMin).toBe(3 * 60);
    expect(b.normalesPlusAmount).toBe(1500);
    expect(b.net).toBe(86667 - 3939 + 1500);
  });
  it('lundi AM malade, mardi-vendredi 11 h : 8 h normales (jusqu’aux 8 h retenues) puis 4 HC (44 h effectuées)', () => {
    const b = mois(ct(), MAR_VEN.map((d) => pres(d, '19:00')), malade);
    expect(b.normalesPlusMin).toBe(8 * 60);
    expect(b.complMin).toBe(4 * 60);
    expect(b.majMin).toBe(0);
  });
  it('enfant malade avec certificat, jour retenu : même règle', () => {
    const b = mois(ct(), [rec('2026-10-12', { abs: 'malade_certif', certifDu: '2026-10-12', certifAu: '2026-10-12' }), ...MAR_VEN.map((d) => pres(d, '19:00'))], []);
    expect(b.retenue).toBe(3939);
    expect(b.normalesPlusMin).toBe(8 * 60);
    expect(b.complMin).toBe(4 * 60);
  });
  it('45 h : lundi absent payé, mardi sans solde (9 h retenues), mercredi-vendredi 12 h : 9 h normales, aucune HC', () => {
    const c = ct({ planning: week('08:00', '17:00') });
    const b = mois(c, [rec('2026-10-12', { abs: 'parents' }), ...['2026-10-14', '2026-10-15', '2026-10-16'].map((d) => pres(d, '20:00'))], [{ id: 's', type: 'sans_solde', from: '2026-10-13', to: '2026-10-13' }]);
    expect(b.retenue).toBe(4432); // 975,00 × 9 ÷ 198
    expect(b.normalesPlusMin).toBe(9 * 60);
    expect(b.complMin).toBe(0);
    expect(b.majMin).toBe(0);
  });
  it('semaine à cheval sur deux mois : retenue en septembre, heures en plus payées en octobre (mois où elles sont faites)', () => {
    const l: AmLeave[] = [{ id: 'm', type: 'am_malade', from: '2026-09-28', to: '2026-09-28' }];
    const oct = mois(ct(), [pres('2026-10-01', '19:00')], l, '2026-10');
    expect(oct.normalesPlusAmount).toBe(1500);
    expect(oct.complMin).toBe(0);
    expect(mois(ct(), [pres('2026-10-01', '19:00')], l, '2026-09').retenue).toBeGreaterThan(0);
  });
});
