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

describe('C5 : formation obligatoire et examen médical de grossesse, absences payées (CASF L423-5, 1° ; C. trav. L1225-16)', () => {
  // 40 h, 5,00 € net : 866,67 € ; octobre 2026 : 176 h. Un congé sans solde de 8 h est retenu : 866,67 × 8 ÷ 176 = 39,39 €.
  const jour = (type: AmLeave['type']): AmLeave[] => [{ id: 'l', type, from: '2026-10-12', to: '2026-10-12' }];
  it('sans retenue, contrairement au congé sans solde', () => {
    expect(mois(ct(), [], jour('sans_solde')).retenue).toBe(3939);
    for (const t of ['formation', 'examen_grossesse'] as const) {
      const r = mois(ct(), [], jour(t));
      expect(r.retenue, t).toBe(0);
      expect(r.net, t).toBe(86667);
    }
  });
  it('examen de grossesse, 11 h du mardi au vendredi : 44 h effectuées, 4 HC et 8 h normales (L1225-16 : pas du travail effectif)', () => {
    const r = mois(ct(), MAR_VEN.map((d) => pres(d, '19:00')), jour('examen_grossesse'));
    expect(r.complMin).toBe(240);
    expect(r.normalesPlusMin).toBe(480);
  });
  it('formation obligatoire, même semaine : 8 + 44 = 52 h de travail effectif (C. trav. L6321-2) : 5 HC et 7 heures majorées', () => {
    const r = mois(ct(), MAR_VEN.map((d) => pres(d, '19:00')), jour('formation'));
    expect(r.complMin).toBe(300);
    expect(r.majMin).toBe(420);
    expect(r.normalesPlusMin ?? 0).toBe(0);
  });
});

import { finDeContrat } from '../src/engine/fin';

describe('C6 : départ à la retraite, faute lourde, décès de l’AM (CCN 63.2.2, 63.3.2, 64.3, 120, 121.1, 121.2)', () => {
  const ctx = () => makeCtx(ct(), [], [], '2026-12-31');
  it('retraite : préavis de l’art. 120 (9 mois : 15 jours), pas d’indemnité des parents', () => {
    const f = finDeContrat(ctx(), '2026-10-05', 'retraite');
    expect(f.preavisFin).toBe('2026-10-19'); // 15 jours, le jour de la remise compte
    expect(f.indemniteRupture).toBe(0);
    expect(f.ruptureExplication).toMatch(/organisme assureur/);
  });
  it('faute lourde : fin à la date d’envoi, ni préavis ni indemnité, congés non pris payés', () => {
    const f = finDeContrat(ctx(), '2026-10-05', 'faute_lourde');
    expect(f.dernierJour).toBe('2026-10-05');
    expect(f.indemniteRupture).toBe(0);
    expect(f.cpIndemnite).toBeGreaterThan(0);
  });
  it('décès de l’AM : fin à la date du décès, congés non pris aux ayants droit, pas d’indemnité de rupture', () => {
    const f = finDeContrat(ctx(), '2026-10-05', 'deces_am');
    expect(f.dernierJour).toBe('2026-10-05');
    expect(f.indemniteRupture).toBe(0);
    expect(f.indemnitePreavis).toBe(0);
    expect(f.cpIndemnite).toBeGreaterThan(0);
  });
});

describe('C7 : essai d’un CDI (CCN 95.1)', () => {
  // Début lundi 05/01/2026. 5 jours par semaine : 2 mois, dernier jour 04/03/2026. 3 jours : 3 mois, 04/04/2026.
  const ctx = (o: Partial<Contract> = {}) => makeCtx(ct(o), [], [], '2026-12-31');
  it('5 jours par semaine : rupture le 04/03 acceptée, le 05/03 refusée', () => {
    expect(finDeContrat(ctx(), '2026-03-04', 'essai').nonGere).toBeUndefined();
    expect(finDeContrat(ctx(), '2026-03-05', 'essai').nonGere?.[0]).toMatch(/après la fin possible de la période d’essai, le 04\/03\/2026/);
  });
  it('3 jours par semaine : 3 mois', () => {
    const o = { planning: week('08:00', '16:00', [1, 2, 3]) };
    expect(finDeContrat(ctx(o), '2026-04-04', 'essai').nonGere).toBeUndefined();
    expect(finDeContrat(ctx(o), '2026-04-05', 'essai').nonGere).toBeDefined();
  });
  it('autre enfant de la même famille : la réponse est demandée, puis 30 jours calendaires (dernier jour 03/02/2026)', () => {
    expect(finDeContrat(ctx(), '2026-02-10', 'essai', 0, undefined, undefined, undefined, undefined, true).nonGere?.[0]).toMatch(/autre enfant/);
    const oui = { cumulCpPreavis: undefined, grossesse: undefined, essaiAutreEnfant: true };
    expect(finDeContrat(ctx(), '2026-02-03', 'essai', 0, undefined, undefined, undefined, oui, true).nonGere).toBeUndefined();
    expect(finDeContrat(ctx(), '2026-02-04', 'essai', 0, undefined, undefined, undefined, oui, true).nonGere).toBeDefined();
    expect(finDeContrat(ctx(), '2026-02-10', 'essai', 0, undefined, undefined, undefined, { ...oui, essaiAutreEnfant: false }, true).nonGere).toBeUndefined();
  });
});

import { congesPeriodeSimulee, joursCongesSimules } from '../src/engine/simulation';

describe('C8 : simulateur, congés en année incomplète (C. trav. L3141-4, L3141-5, 1° ; comparateur 3.1)', () => {
  it('40 semaines, 180 € par semaine, 25 jours acquis l’an passé : (40 + 25 ÷ 6) ÷ 4 × 2,5 = 27,6 → 28 jours ; 840,00 €', () => {
    expect(joursCongesSimules(40, 12, 25)).toBe(28);
    // Semaines sans accueil des parents : 7 (52 − 5 − 7 = 40). Salaire mensualisé 180 × 40 ÷ 12 = 600,00 €.
    expect(congesPeriodeSimulee({ yearType: 'incomplete', semainesAbsence: 7 }, 60000, 720000, 12, 25)).toBe(84000);
  });
  it('première période : aucune semaine de congés ne compte (40 ÷ 4 × 2,5 = 25 jours)', () => {
    expect(joursCongesSimules(40, 12, 0)).toBe(25);
  });
});

import { dureeMoyenneContrat, erreursDureeContrat, MESSAGE_ACCORD_48H } from '../src/engine/durees';

describe('C9 : contrat de plus de 48 h par semaine en moyenne (CASF L423-22)', () => {
  it('50 h (8 h à 18 h, 5 jours) : accord écrit demandé ; avec l’accord, accepté (50 × 47 = 2 350 h > 2 250 h : refusé)', () => {
    const c = ct({ planning: week('08:00', '18:00') });
    expect(dureeMoyenneContrat(c)).toBe(3000);
    expect(erreursDureeContrat(c)).toContain(MESSAGE_ACCORD_48H);
    expect(erreursDureeContrat({ ...c, accord48h: true }).join(' ')).toMatch(/2350 h par an/);
  });
  it('49 h, 46 semaines, avec accord : 2 254 h > 2 250 h ; 49 h, 45 semaines : 2 205 h, accepté', () => {
    const c = ct({ planning: week('08:00', '17:48'), yearType: 'incomplete', weeks: 46, accord48h: true });
    expect(erreursDureeContrat(c).length).toBe(1);
    expect(erreursDureeContrat({ ...c, weeks: 45 })).toEqual([]);
  });
  it('48 h : rien à demander', () => {
    expect(erreursDureeContrat(ct({ planning: week('08:00', '17:36') }))).toEqual([]);
  });
});

import { alertesDurees, reposApres } from '../src/engine/durees';

describe('C11 : repos de 11 h et 48 h en moyenne (CASF L423-21, L423-22 ; CCN 96.1, 96.3)', () => {
  it('deux contrats : 7 h–19 h puis 5 h 30 le lendemain chez l’autre famille : 10 h 30 de repos, alerte', () => {
    const a = ct({ planning: week('07:00', '19:00', [1]) });
    const b = { ...ct({ planning: week('05:30', '09:00', [2]) }), id: 'c2', family: 'N' } as Contract;
    const ctxs = [makeCtx(a, [], [], '2026-12-31'), makeCtx(b, [], [], '2026-12-31')];
    expect(reposApres(ctxs, '2026-10-12')).toBe(630);
    expect(alertesDurees(ctxs, '2026-10-13').join(' ')).toMatch(/Repos de 10 h30/);
  });
  it('50 h par semaine depuis plus de quatre mois, sans accord : alerte ; 45 h : aucune', () => {
    const c50 = makeCtx(ct({ planning: week('08:00', '18:00') }), [], [], '2026-12-31');
    expect(alertesDurees([c50], '2026-10-15').join(' ')).toMatch(/quatre derniers mois/);
    const c45 = makeCtx(ct({ planning: week('08:00', '17:00') }), [], [], '2026-12-31');
    expect(alertesDurees([c45], '2026-10-15')).toEqual([]);
  });
});

import { departOublieAujourdhui, MSG_HEURE_FUTURE, verifierFiche } from '../src/screens/Today';

describe('C20 : fiche « Modifier la journée », le jour même', () => {
  const plan = [{ start: '08:00', end: '16:00' }];
  it('heure future refusée le jour même, acceptée pour un jour passé', () => {
    expect(verifierFiche([{ a: '08:00', d: '17:00' }], plan, true, '15:00')).toBe(MSG_HEURE_FUTURE);
    expect(verifierFiche([{ a: '08:00', d: '14:00' }], plan, true, '15:00')).toBe('');
    expect(verifierFiche([{ a: '08:00', d: '17:00' }], plan, true)).toBe('');
  });
  it('départ non pointé : signalé après la fin prévue (plus de 15 min), pas avant', () => {
    expect(departOublieAujourdhui(plan, [{ a: '08:00' }], '16:10')).toBe(false);
    expect(departOublieAujourdhui(plan, [{ a: '08:00' }], '16:16')).toBe(true);
    expect(departOublieAujourdhui(plan, [{ a: '08:00', d: '16:00' }], '18:00')).toBe(false);
  });
});

import { netHoraire } from '../src/engine/simulation';
import { dureeMaxCddMois, messagesCdd } from '../src/engine/cdd';

describe('Cas officiels (section 3.2 du comparateur)', () => {
  it('C-NET-04 : 5,00 € brut = 3,91 € net (simulateur Urssaf, chaque cotisation arrondie au centime)', () => {
    expect(netHoraire(500, false)).toBe(391);
    expect(netHoraire(501, false)).toBe(392); // 3,91 € net ne vient que de 5,00 € brut
  });
});

describe('C12 : durée maximale du CDD (C. trav. L1242-8-1)', () => {
  it('18, 9 ou 24 mois selon le remplacement ; message au-delà', () => {
    expect(dureeMaxCddMois({ cddMotif: 'remplacement', cddCasRemplacement: 'absence' })).toBe(18);
    expect(dureeMaxCddMois({ cddMotif: 'remplacement', cddCasRemplacement: 'attente_cdi' })).toBe(9);
    expect(dureeMaxCddMois({ cddMotif: 'remplacement', cddCasRemplacement: 'depart_suppression' })).toBe(24);
    const c = { cdd: true, start: '2026-01-05', cddTerme: '2026-11-30', cddMotif: 'remplacement' as const, cddCasRemplacement: 'attente_cdi' as const };
    expect(messagesCdd(c).join(' ')).toMatch(/9 mois/);
    expect(messagesCdd({ ...c, cddCasRemplacement: 'absence' }).join(' ')).not.toMatch(/durée maximale/);
  });
});

import { monthBase } from '../src/engine/payroll';

describe('Section 6, point 1 : avenant au 15/10/2026 vers un planning remis (R-AV-02 ; CCN 109, 111)', () => {
  // Avant : 40 h (8 h × 5), 5,00 € : 866,67 € ; octobre 176 h ; du 01/10 au 14/10 : 10 jours, 80 h : 866,67 × 80 ÷ 176 = 393,94 €.
  // Après : 130 h payées par mois × 5,00 € = 650,00 € ; plannings remis de 30 h (6 h × 5) chaque semaine.
  const w = (s: string, e: string) => { const p: Planning = {}; for (const d of [1, 2, 3, 4, 5]) p[d] = [{ start: s, end: e }]; return p; };
  const av = (lundis: string[]) => {
    const plans: Record<string, Planning> = {};
    for (const l of lundis) plans[l] = w('08:00', '14:00');
    return ct({ planningsSemaines: plans, avenants: [{ id: 'a', from: '2026-10-15', changes: { planningVariable: true, pvForme: 'remis', heuresMensualisees: 130 } }] } as Partial<Contract>);
  };
  it('sans le planning des semaines d’avant l’avenant : le mois attend ces plannings', () => {
    const b = monthBase(makeCtx(av(['2026-10-12', '2026-10-19', '2026-10-26']), [], [], '2026-12-31'), '2026-10');
    expect(b.nonGere.join(' ')).toMatch(/semaines du 28\/09\/2026, du 05\/10\/2026/);
  });
  it('avec eux : 650,00 × 72 h ÷ 132 h = 354,55 € ; octobre = 393,94 + 354,55 = 748,49 €', () => {
    // Du 15/10 au 31/10 : 12 jours × 6 h = 72 h ; tout octobre avec le nouveau contrat : 22 jours × 6 h = 132 h.
    const b = monthBase(makeCtx(av(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']), [], [], '2026-12-31'), '2026-10');
    expect(b.nonGere).toEqual([]);
    expect(b.base).toBe(39394 + 35455);
  });
});

describe('Section 6, point 7 : décès du parent employeur (CCN 63.3.1, 119.1)', () => {
  it('aucun montant, la raison et le renvoi au retrait de l’enfant', () => {
    const f = finDeContrat(makeCtx(ct(), [], [], '2026-12-31'), '2026-10-05', 'deces_employeur');
    expect(f.nonGere?.[0]).toMatch(/Les parents retirent l’enfant/);
    expect(f.indemniteRupture).toBe(0);
  });
});
