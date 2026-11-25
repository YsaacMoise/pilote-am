// T-109 : corrections du comparateur des deux vérifications (calculateur-arvela, rapports/comparaison-verifs.md, section 5 ;
// règles et sources : regles/t109-corrections.md). Attendus calculés à la main à partir des textes.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Contract, DayRec, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { computeMonth, declarationText, totalAVerser } from '../src/engine/month';
import { entretienPlancher } from '../src/engine/rates';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}
export const ct = (o: Partial<Contract> = {}): Contract => ({
  id: 'c1', child: 'L', family: 'M', color: 0, start: '2026-01-05', yearType: 'complete', weeks: 52, weeksOff: [],
  planning: week('08:00', '16:00'), rateNet: 500, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0, kmTaux: 0,
  cpMode: 'juin', majoreFiscal: false, trackedFrom: '2026-01-05', balances: { cpRestants: 30, cpEnCours: 0, maladieDeduits: 0 },
  history: [], createdAt: 0, alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false, ...o,
} as Contract);
export const rec = (date: string, r: Partial<DayRec>): DayRec => ({ key: `c1|${date}`, cid: 'c1', date, ...r });
const pres = (d: string, fin: string) => rec(d, { pres: [{ a: '08:00', d: fin }] });
const MAR_VEN = ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'];
const mois = (c: Contract, recs: DayRec[], leaves: AmLeave[] = [], m = '2026-10') => computeMonth(makeCtx(c, recs, leaves, '2026-12-31'), m);

describe('C1 : réduction de cotisations des heures complémentaires dans le total à verser (CSS L241-17, I, 7° ; D241-21)', () => {
  // 40 h, 5,00 € net, 6,40 € brut. Semaine du 12/10/2026 : 4 HC (voir C2) = 20,00 € net ; brut 20,00 × 6,40 ÷ 5,00 = 25,60 € ;
  // réduction 11,31 % × 25,60 = 2,895 → 2,90 €.
  const recs = [rec('2026-10-12', { abs: 'parents' }), ...MAR_VEN.map((d) => pres(d, '19:00'))];
  it('brut connu : la réduction entre dans le total, le message aux parents la détaille', () => {
    const r = mois(ct({ rateBrut: 640 } as Partial<Contract>), recs);
    expect(r.complAmount).toBe(2000);
    expect(r.reductionHS).toBe(290);
    expect(totalAVerser(r)).toBe(r.netTotal + 290 + r.entretien + r.repas + r.km);
    const t = declarationText(makeCtx(ct({ rateBrut: 640 } as Partial<Contract>), recs, [], '2026-12-31'), r, 'Ana');
    expect(t).toMatch(/Réduction de cotisations des heures complémentaires et majorées, versée en plus du salaire net : 2,90\s€/);
  });
  it('brut inconnu : rien d’estimé dans le total, le taux horaire brut est demandé', () => {
    const r = mois(ct(), recs);
    expect(totalAVerser(r)).toBe(r.netTotal + r.entretien + r.repas + r.km);
    expect(r.reductionHSManquante).toBe(true);
  });
});

describe('C2 : heures en plus la semaine d’une absence payée (CCN 96.4 ; comparateur 2.1)', () => {
  it('contrat 40 h, lundi absent payé, 11 h du mardi au vendredi : 44 h effectuées, 4 HC et 8 h normales, 12 h payées', () => {
    const r = mois(ct(), [rec('2026-10-12', { abs: 'parents' }), ...MAR_VEN.map((d) => pres(d, '19:00'))]);
    expect(r.complMin).toBe(240);
    expect(r.normalesPlusMin).toBe(480);
    expect(r.complAmount + (r.normalesPlusAmount ?? 0)).toBe(6000);
  });
  it('HC majorées de 25 % : 4 × 6,25 € + 8 × 5,00 € = 65,00 € (et non 12 × 6,25 € = 75,00 €)', () => {
    const r = mois(ct({ majorationCompl: 25 }), [rec('2026-10-12', { abs: 'parents' }), ...MAR_VEN.map((d) => pres(d, '19:00'))]);
    expect(r.complAmount + (r.normalesPlusAmount ?? 0)).toBe(6500);
  });
});

describe('C3 : entretien, plancher au centime supérieur (CCN 114.1, « sans pouvoir être inférieur »)', () => {
  it('MG 4,35 € (01/06/2026) : 7 h 30 → 3,27 € ; 9 h 15 → 4,03 € ; 9 h 45 → 4,25 € ; 9 h → 3,92 €', () => {
    expect(entretienPlancher('2026-06-10', 450)).toBe(327); // 3,2625
    expect(entretienPlancher('2026-06-10', 555)).toBe(403); // 4,02375
    expect(entretienPlancher('2026-06-10', 585)).toBe(425); // 4,24125
    expect(entretienPlancher('2026-06-10', 540)).toBe(392); // 3,915
    expect(entretienPlancher('2026-06-10', 300)).toBe(265); // 2,175 < 2,65
  });
});
