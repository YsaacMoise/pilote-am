// T-077 : Alsace-Moselle et Mayotte calculées. Règles : calculateur-arvela, regles/t077-decisions.md (R0 à R6), d'après
// regles/t077-alsace-moselle.md et regles/t077-mayotte.md. Attendus tirés des textes, calculés à la main :
// - R1 : brut = net ÷ part ; métropole 78,10 % ; Alsace-Moselle 78,10 − 1,30 = 76,80 % (1,50 % avant avril 2022 : 76,60 %) ;
//   Mayotte 100 − 11,80 = 88,20 % (Urssaf, taux salariaux de l'AM à Mayotte au 01/01/2026).
// - R2 : repères nets Urssaf (« Bas-Rhin, Haut-Rhin et Moselle » 3,23 € ; « Mayotte » 3,70 € au 01/06/2026).
// Revu par la T-103 (calculateur-arvela, rapports/T-103-inventaire.md, R1 à R7) :
// - R1 : Vendredi saint et 26 décembre pas fériés pour l'AM (C. trav. L3134-1, al. 2) ; R4 : 27 avril férié à Mayotte (L3422-2).
// - R3 (décision du DG du 24/11/2026) : maintien du droit local (L1226-23) pour toute absence pour maladie de l'AM ou de son
//   enfant, moins les indemnités journalières saisies (demandées si absentes).
// - R2 : pas de préavis local (L1234-16 vise les employés « chez des particuliers »).
// - R6 : Mayotte, abattement avec le SMIC de Mayotte (BOFiP, SMIC en vigueur pendant la garde) ; pas de CSG ni de CRDS.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Bulletin, Contract, DayRec, Planning } from '../src/engine/model';
import { dayInfo, makeCtx, monthBase } from '../src/engine/payroll';
import { computeMonth } from '../src/engine/month';
import { decompteConge } from '../src/engine/conges';
import { finDeContrat } from '../src/engine/fin';
import { fiscalYear } from '../src/engine/fiscal';
import { controle } from '../src/engine/controle';
import { minimumBrut, netToBrut, ratesAtRegion } from '../src/engine/rates';
import { ferieDe, MESSAGE_IJ_MAINTIEN_LOCAL, regionDe } from '../src/engine/regions';
import { nonGeresContrat } from '../src/engine/nonGeres';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}
// Année complète, 40 h du lundi au vendredi, 5 € net : 40 × 52 ÷ 12 × 5 = 866,67 € par mois (art. 109).
function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2025-01-06', yearType: 'complete', weeks: 52, weeksOff: [],
    planning: week('08:00', '16:00'), rateNet: 500, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2025-01-06',
    alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
    balances: { cpRestants: 20, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, ...over,
  };
}
const AM = { alsaceMoselle: true };
const MY = { alsaceMoselle: false, mayotte: true };
const rec = (date: string, r: Partial<DayRec>): DayRec => ({ key: `c1|${date}`, cid: 'c1', date, ...r });
const leave = (type: AmLeave['type'], from: string, to: string): AmLeave => ({ id: `${type}${from}`, type, from, to });

describe('T-077 R0 : région et périmètre', () => {
  it('Alsace-Moselle et Mayotte ne sont plus refusées', () => {
    expect(regionDe(contract(AM))).toBe('alsaceMoselle');
    expect(regionDe(contract(MY))).toBe('mayotte');
    expect(regionDe(contract())).toBe('metropole');
    expect(nonGeresContrat(contract(AM))).toEqual([]);
    expect(nonGeresContrat(contract(MY))).toEqual([]);
    expect(monthBase(makeCtx(contract(AM), [], [], '2026-11-22'), '2026-10').nonGere).toEqual([]);
  });
  it('T-103 (R1, R4) : fériés de l’AM : ni Vendredi saint ni 26 décembre en Alsace-Moselle ; 27 avril à Mayotte', () => {
    expect(ferieDe('alsaceMoselle', '2026-04-03')).toBeUndefined();
    expect(ferieDe('alsaceMoselle', '2026-12-26')).toBeUndefined();
    expect(ferieDe('alsaceMoselle', '2026-12-25')).toBeDefined();
    expect(ferieDe('mayotte', '2026-04-27')).toMatch(/27 avril/);
    expect(ferieDe('metropole', '2026-04-27')).toBeUndefined();
  });
});

describe('T-077 R1 : brut estimé depuis le net', () => {
  it('métropole inchangée, Alsace-Moselle 76,80 % (76,60 % avant avril 2022), Mayotte 88,20 %', () => {
    // T-115 (R3) : depuis 2024 (métropole et Alsace-Moselle), F1 du convertisseur officiel (brut.ts) remplace l'estimation :
    // 78 100 ÷ 0,7811975 = 99 974,7 ; Alsace-Moselle 78 100 ÷ 0,7681975 = 101 666,6. Avant 2024 et à Mayotte : inchangé.
    expect(netToBrut(78100, '2026-01-15')).toBe(99975);
    expect(netToBrut(78100, '2026-01-15', 'metropole')).toBe(99975);
    expect(netToBrut(78100, '2023-12-31', 'metropole')).toBe(100000); // estimation d'avant 2024, 78 100 ÷ 0,781
    expect(netToBrut(78100, '2026-01-15', 'alsaceMoselle')).toBe(101667);
    expect(netToBrut(78100, '2023-12-31', 'alsaceMoselle')).toBe(101693); // 78 100 ÷ 0,768 = 101 692,7
    expect(netToBrut(78100, '2022-03-31', 'alsaceMoselle')).toBe(101958); // 78 100 ÷ 0,766 = 101 958,2
    expect(netToBrut(78100, '2022-04-01', 'alsaceMoselle')).toBe(101693); // avant 2024 : estimation inchangée
    expect(netToBrut(78100, '2026-01-15', 'mayotte')).toBe(88549); // 78 100 ÷ 0,882 = 88 548,8
  });
  it('le brut estimé du mois suit la région', () => {
    const m = computeMonth(makeCtx(contract(MY), [], [], '2026-11-22'), '2026-10');
    expect(m.brutEstime).toBe(Math.round((m.netTotal * 10000) / 8820));
  });
});

describe('T-077 R2 : minimum', () => {
  it('repère net Urssaf par région ; aucun avant 2025', () => {
    expect(ratesAtRegion('2026-06-15', 'metropole')?.minConvNet).toBe(328);
    expect(ratesAtRegion('2026-06-15', 'alsaceMoselle')?.minConvNet).toBe(323);
    expect(ratesAtRegion('2026-06-15', 'mayotte')?.minConvNet).toBe(370);
    expect(ratesAtRegion('2025-04-01', 'alsaceMoselle')?.minConvNet).toBe(281);
    expect(ratesAtRegion('2025-01-15', 'mayotte')?.minConvNet).toBe(308);
    expect(ratesAtRegion('2024-06-01', 'mayotte')?.minConvNet).toBeUndefined();
    expect(ratesAtRegion('2026-06-15', 'mayotte')?.minConvBrut).toBe(420);
  });
  it('Mayotte : minimum légal sur le SMIC de Mayotte (0,281 × 9,56 €), sous la grille', () => {
    const m = minimumBrut('2026-06-15', 'mayotte')!;
    expect(m.legal).toBeCloseTo(268.636, 3);
    expect(m.certain).toBe(420);
    expect(m.source).toBe('grille');
  });
  it('contrôle du bulletin : minimum net de la région ; brut contrôlé avec le taux brut du contrat (T-103, D1)', () => {
    const b = { id: '', cid: 'c1', month: '2026-10', source: 'manuel', net: 88200, brut: 100000 } as Bulletin;
    const ctxM = makeCtx(contract(MY), [], [], '2026-11-22');
    const r = computeMonth(ctxM, '2026-10');
    expect(controle(b, r, 500, 'mayotte').find((x) => x.title === 'Brut non contrôlé')).toBeDefined();
    expect(controle(b, r, 300, 'mayotte').find((x) => x.title === 'Taux du contrat sous le minimum')?.detail).toMatch(/3,70/);
  });
});

describe('T-077 R3, revu par la T-103 (R1, R4) : fériés de l’AM selon la région', () => {
  it('26/12/2025 en Alsace-Moselle : jour ordinaire, comme en métropole', () => {
    const met = monthBase(makeCtx(contract(), [], [], '2026-11-22'), '2025-12');
    const als = monthBase(makeCtx(contract(AM), [], [], '2026-11-22'), '2025-12');
    expect(als.base).toBe(met.base);
    expect(als.joursActivite).toBe(met.joursActivite);
    expect(als.alerts.join(' ')).not.toMatch(/à confirmer|26 décembre/);
  });
  it('26/12/2025 travaillé en Alsace-Moselle : pas de majoration de férié', () => {
    const recs = [rec('2025-12-26', { pres: [{ a: '08:00', d: '16:00' }] })];
    const als = monthBase(makeCtx(contract(AM), recs, [], '2026-11-22'), '2025-12');
    expect(als.ferieAmount).toBe(0);
    expect(als.net).toBe(86667);
  });
  it('Mayotte : 27/04/2026 (lundi) férié chômé, payé ; travaillé : majoration de 10 % (CCN 47.2)', () => {
    const my = monthBase(makeCtx(contract(MY), [], [], '2026-11-22'), '2026-04');
    const met = monthBase(makeCtx(contract(), [], [], '2026-11-22'), '2026-04');
    expect(my.base).toBe(met.base);
    expect(dayInfo(makeCtx(contract(MY), [], [], '2026-11-22'), '2026-04-27').kind).toBe('ferie');
    expect(dayInfo(makeCtx(contract(), [], [], '2026-11-22'), '2026-04-27').kind).not.toBe('ferie');
    const t = monthBase(makeCtx(contract(MY), [rec('2026-04-27', { ferieTravaille: true, pres: [{ a: '08:00', d: '16:00' }] })], [], '2026-11-22'), '2026-04');
    expect(t.ferieAmount).toBe(400); // 8 h × 5,00 € × 10 %
  });
  it('lundi de Pâques 06/04/2026 en Alsace-Moselle : le jour prévu avant est le Vendredi saint, jour ordinaire', () => {
    const recs = [rec('2026-04-03', { pres: [{ a: '08:00', d: '16:00' }] })];
    const als = monthBase(makeCtx(contract(AM), recs, [], '2026-11-22'), '2026-04');
    expect(als.base).toBe(86667);
    expect(als.alerts.join(' ')).not.toMatch(/Férié du 06\/04/);
  });
  it('congé payé du 22/12/2025 au 02/01/2026 : 10 jours en Alsace-Moselle comme en métropole', () => {
    const cp = leave('cp', '2025-12-22', '2026-01-02');
    const als = decompteConge(makeCtx(contract(AM), [], [cp], '2026-11-22'), cp);
    const met = decompteConge(makeCtx(contract(), [], [cp], '2026-11-22'), cp);
    expect(met.jours).toBe(10);
    expect(als.jours).toBe(10);
    expect(als.demande).toBeUndefined();
  });
});

describe('T-077 R4, revu par la T-103 (R3, décision du DG) : maintien du droit local (Alsace-Moselle)', () => {
  const leaves = [leave('am_malade', '2026-09-14', '2026-09-15')];
  it('Alsace-Moselle : salaire maintenu, moins les indemnités journalières saisies (L1226-23)', () => {
    const met = monthBase(makeCtx(contract(), [], leaves, '2026-11-22'), '2026-09');
    const als = monthBase(makeCtx(contract(AM), [], [{ ...leaves[0], ijSecu: 5000 }], '2026-11-22'), '2026-09');
    expect(met.retenue).toBeGreaterThan(0);
    expect(als.retenue).toBe(0);
    expect(als.ijDeduites).toBe(5000);
    expect(als.base).toBe(86667 - 5000);
    expect(als.alerts.join(' ')).toMatch(/L1226-23/);
    expect(als.nonGere).toEqual([]);
  });
  it('indemnités journalières non saisies : le mois les demande (B)', () => {
    const als = monthBase(makeCtx(contract(AM), [], leaves, '2026-11-22'), '2026-09');
    expect(als.nonGere).toContain(MESSAGE_IJ_MAINTIEN_LOCAL);
  });
  it('Mayotte : retenue normale', () => {
    const met = monthBase(makeCtx(contract(), [], leaves, '2026-11-22'), '2026-09');
    const my = monthBase(makeCtx(contract(MY), [], leaves, '2026-11-22'), '2026-09');
    expect(my.base).toBe(met.base);
  });
  it('enfant de l’AM malade : même règle (Cass. soc. 04/12/2024)', () => {
    const l = [{ ...leave('am_enfant_malade', '2026-09-14', '2026-09-14'), ijSecu: 0 }];
    const als = monthBase(makeCtx(contract(AM), [], l, '2026-11-22'), '2026-09');
    expect(als.retenue).toBe(0);
    expect(als.base).toBe(86667);
  });
});

describe('T-077 R5, revu par la T-103 (R2) : pas de préavis local pour l’AM', () => {
  it('retrait après un an : un mois (convention), comme en métropole', () => {
    const als = finDeContrat(makeCtx(contract(AM), [], [], '2026-12-31'), '2026-10-01', 'retrait');
    const met = finDeContrat(makeCtx(contract(), [], [], '2026-12-31'), '2026-10-01', 'retrait');
    expect(als.preavisFin).toBe(met.preavisFin);
    expect(als.alertes.join(' ')).not.toMatch(/six semaines|à confirmer/);
  });
});

describe('T-077 R5, revu par la T-103 (R2) : autres motifs', () => {
  it('démission et décès : préavis de la convention, sans écart local', () => {
    for (const motif of ['demission', 'deces'] as const) {
      const f = finDeContrat(makeCtx(contract(AM), [], [], '2026-12-31'), '2026-10-01', motif);
      expect(f.alertes.join(' ')).not.toMatch(/six semaines|à confirmer/);
    }
    const court = finDeContrat(makeCtx(contract({ ...AM, start: '2026-09-01', trackedFrom: '2026-09-01' }), [], [], '2026-12-31'), '2026-10-01', 'retrait');
    expect(court.preavisFin).toBe('2026-10-08');
  });
});

describe('T-077 : textes', () => {
  it('congé qui finit la veille du 26/12 : rien à corriger', () => {
    const cp = leave('cp', '2025-12-22', '2025-12-25');
    const d = decompteConge(makeCtx(contract(AM), [], [cp], '2026-11-22'), cp);
    expect(d.demande).toBeUndefined();
  });
});

describe('T-077 R6, revu par la T-103 : revenu imposable à Mayotte', () => {
  it('abattement au SMIC de Mayotte (BOFiP, SMIC en vigueur pendant la garde) ; pas de CSG ni de CRDS', () => {
    const ctx = makeCtx(contract(MY), [], [], '2026-12-31');
    const f = fiscalYear(ctx, 2026);
    expect(f.smics).toEqual([933, 956]);
    let net = 0;
    for (let k = 1; k <= 12; k++) net += computeMonth(ctx, `2026-${String(k).padStart(2, '0')}` as `${number}-${string}`).netTotal;
    expect(f.netImposable).toBe(net);
    expect(f.nonGere ?? '').not.toMatch(/à confirmer/);
  });
});

describe('T-077 R7, revu par la T-103 (R1) : simulateur en Alsace-Moselle', () => {
  it('mêmes fériés qu’en métropole (Vendredi saint et 26 décembre non fériés pour l’AM)', async () => {
    const { simuler, simulationParDefaut } = await import('../src/engine/simulation');
    const d = '2026-11-01';
    const base = { ...simulationParDefaut(d), entretien: 400, entretienMode: 'jour' as const };
    expect(simuler({ ...base, alsaceMoselle: true }, d).feriesAn).toBe(simuler({ ...base, alsaceMoselle: false }, d).feriesAn);
  });
});

describe('T-077 : relecture (D1, D2), revu par la T-103', () => {
  it('relevé et lien des parents : jamais « undefined » ni « à confirmer »', async () => {
    const { buildSnapshot } = await import('../src/partage/snapshot');
    const ctx = makeCtx(contract(AM), [], [], '2026-01-10');
    const txt = JSON.stringify(buildSnapshot({ ctx, journal: [], amName: 'Nadia', enfants: 0, now: 0 }));
    expect(txt).not.toMatch(/undefined|à confirmer/);
  });
  it('dixième des congés : base complète en Alsace-Moselle', async () => {
    const { baseDixieme } = await import('../src/engine/conges');
    expect(baseDixieme(makeCtx(contract(AM), [], [], '2026-11-22'), 2025).aConfirmer).toBe(false);
  });
});

describe('T-077 et T-074 : férié local pendant un préavis dispensé (vérificateur P5-1)', () => {
  it('26/12/2025 dans la dispense : payé, comme en métropole', () => {
    const c = contract({ ...AM, end: '2025-12-31', rupture: { motif: 'retrait', notif: '2025-12-01', preavis: 'employeur', dernierJourTravaille: '2025-12-19' } as Contract['rupture'] });
    const met = monthBase(makeCtx({ ...c, alsaceMoselle: false }, [], [], '2026-11-22'), '2025-12');
    const als = monthBase(makeCtx(c, [], [], '2026-11-22'), '2025-12');
    expect(als.base).toBe(met.base);
  });
});
