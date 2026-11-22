// T-077 : Alsace-Moselle et Mayotte calculées. Règles : calculateur-arvela, regles/t077-decisions.md (R0 à R6), d'après
// regles/t077-alsace-moselle.md et regles/t077-mayotte.md. Attendus tirés des textes, calculés à la main :
// - R1 : brut = net ÷ part ; métropole 78,10 % ; Alsace-Moselle 78,10 − 1,30 = 76,80 % (1,50 % avant avril 2022 : 76,60 %) ;
//   Mayotte 100 − 11,80 = 88,20 % (Urssaf, taux salariaux de l'AM à Mayotte au 01/01/2026).
// - R2 : repères nets Urssaf (« Bas-Rhin, Haut-Rhin et Moselle » 3,23 € ; « Mayotte » 3,70 € au 01/06/2026).
// - R3 : 26 décembre et Vendredi saint (CT L3134-13), 27 avril à Mayotte (CT L3422-2) : à confirmer.
// - R4 : maintien du droit local (CT L1226-23) : jours de maladie de l'AM à confirmer en Alsace-Moselle seulement.
// - R5 : préavis de six semaines (CT L1234-16 1°) : écart chiffré.
// - R6 : Mayotte, abattement avec le SMIC de Mayotte (9,56 € au 01/06/2026) ou national ; pas de CSG ni de CRDS.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Bulletin, Contract, DayRec, Planning } from '../src/engine/model';
import { makeCtx, monthBase } from '../src/engine/payroll';
import { computeMonth } from '../src/engine/month';
import { decompteConge } from '../src/engine/conges';
import { finDeContrat } from '../src/engine/fin';
import { fiscalYear } from '../src/engine/fiscal';
import { controle } from '../src/engine/controle';
import { minimumBrut, netToBrut, ratesAtRegion } from '../src/engine/rates';
import { feriesLocaux, regionDe } from '../src/engine/regions';
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
  it('fériés locaux : Vendredi saint et 26 décembre (Alsace-Moselle), 27 avril (Mayotte)', () => {
    expect([...feriesLocaux('alsaceMoselle', 2026).keys()].sort()).toEqual(['2026-04-03', '2026-12-26']);
    expect([...feriesLocaux('alsaceMoselle', 2025).keys()].sort()).toEqual(['2025-04-18', '2025-12-26']);
    expect([...feriesLocaux('mayotte', 2026).keys()]).toEqual(['2026-04-27']);
    expect(feriesLocaux('metropole', 2026).size).toBe(0);
  });
});

describe('T-077 R1 : brut estimé depuis le net', () => {
  it('métropole inchangée, Alsace-Moselle 76,80 % (76,60 % avant avril 2022), Mayotte 88,20 %', () => {
    expect(netToBrut(78100, '2026-01-15')).toBe(100000);
    expect(netToBrut(78100, '2026-01-15', 'metropole')).toBe(100000);
    expect(netToBrut(78100, '2026-01-15', 'alsaceMoselle')).toBe(101693); // 78 100 ÷ 0,768 = 101 692,7
    expect(netToBrut(78100, '2022-03-31', 'alsaceMoselle')).toBe(101958); // 78 100 ÷ 0,766 = 101 958,2
    expect(netToBrut(78100, '2022-04-01', 'alsaceMoselle')).toBe(101693);
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
  it('contrôle du bulletin : part du net attendue par région', () => {
    const b = { id: '', cid: 'c1', month: '2026-10', source: 'manuel', net: 88200, brut: 100000 } as Bulletin;
    const ctxM = makeCtx(contract(MY), [], [], '2026-11-22');
    const r = computeMonth(ctxM, '2026-10');
    expect(controle(b, r, 500, 'mayotte').find((x) => x.title.startsWith('Net et brut'))?.level).toBe('ok');
    expect(controle(b, r, 500).find((x) => x.title.startsWith('Net et brut'))?.level).toBe('warn');
    expect(controle(b, r, 300, 'mayotte').find((x) => x.title === 'Taux du contrat sous le minimum')?.detail).toMatch(/3,70/);
  });
});

describe('T-077 R3 : jours fériés locaux, deux lectures', () => {
  it('26/12/2025 prévu non travaillé : ni payé ni retenu, 8 h sur 184 h à confirmer (art. 111)', () => {
    const met = monthBase(makeCtx(contract(), [], [], '2026-11-22'), '2025-12');
    const als = monthBase(makeCtx(contract(AM), [], [], '2026-11-22'), '2025-12');
    expect(met.base).toBe(86667);
    expect(met.evenementAConfirmer).toBe(0);
    // Décembre 2025 : 23 jours prévus de 8 h = 184 h ; 86 666,67 × 176 ÷ 184 = 82 898,55.
    expect(als.base).toBe(82899);
    expect(als.evenementAConfirmer).toBe(86667 - 82899);
    expect(als.joursFerieLocalAConfirmer).toBe(1);
    expect(als.alerts.join(' ')).toMatch(/26 décembre \(26\/12\), jour prévu non travaillé/);
    expect(als.joursActivite).toBe(met.joursActivite - 1);
  });
  it('26/12/2025 travaillé : salaire payé, majoration de 10 % à confirmer (8 h × 5 € × 10 % = 4,00 €)', () => {
    const recs = [rec('2025-12-26', { pres: [{ a: '08:00', d: '16:00' }] })];
    const als = monthBase(makeCtx(contract(AM), recs, [], '2026-11-22'), '2025-12');
    expect(als.base).toBe(86667);
    expect(als.ferieAmount).toBe(0);
    expect(als.ferieLocalAConfirmer).toBe(400);
    expect(als.net).toBe(86667);
  });
  it('Mayotte : 27/04/2026 (lundi) à confirmer ; l’Alsace-Moselle a le Vendredi saint (03/04)', () => {
    const my = monthBase(makeCtx(contract(MY), [], [], '2026-11-22'), '2026-04');
    const als = monthBase(makeCtx(contract(AM), [], [], '2026-11-22'), '2026-04');
    const met = monthBase(makeCtx(contract(), [], [], '2026-11-22'), '2026-04');
    expect(met.evenementAConfirmer).toBe(0);
    expect(my.joursFerieLocalAConfirmer).toBe(1);
    expect(my.alerts.join(' ')).toMatch(/27 avril/);
    expect(als.joursFerieLocalAConfirmer).toBe(1);
    expect(my.evenementAConfirmer).toBe(als.evenementAConfirmer);
  });
  it('absence de l’enfant saisie un férié local : payée dans les deux lectures, rien à confirmer', () => {
    const recs = [rec('2025-12-26', { abs: 'parents' })];
    const als = monthBase(makeCtx(contract(AM), recs, [], '2026-11-22'), '2025-12');
    expect(als.evenementAConfirmer).toBe(0);
    expect(als.base).toBe(86667);
  });
  it('férié national dont la condition de l’art. 47.2 dépend d’un férié local : à confirmer', () => {
    // Lundi de Pâques 06/04/2026. Jour prévu juste avant : le vendredi 03/04 (Vendredi saint) dans la lecture B ; le jeudi 02/04
    // dans la lecture A (le férié local est sauté, art. 47.2). L'AM est malade le jeudi 02/04 : condition manquée en A
    // seulement. Le 06/04 est donc à confirmer, comme le 03/04 lui-même ; le 02/04 relève de R4 (maintien).
    const leaves = [leave('am_malade', '2026-04-02', '2026-04-02')];
    const als = monthBase(makeCtx(contract(AM), [], leaves, '2026-11-22'), '2026-04');
    expect(als.joursFerieLocalAConfirmer).toBe(2);
    expect(als.joursMaintienAConfirmer).toBe(1);
    expect(als.alerts.join(' ')).toMatch(/Férié du 06\/04 : ni payé ni retenu/);
    // Métropole : le 03/04 est un jour ordinaire travaillé, le lundi de Pâques est payé.
    const met = monthBase(makeCtx(contract(), [], leaves, '2026-11-22'), '2026-04');
    expect(met.alerts.join(' ')).not.toMatch(/Férié du 06\/04/);
  });
  it('congé payé du 22/12/2025 au 02/01/2026 : 9 jours si le 26/12 est férié, 10 sinon', () => {
    const cp = leave('cp', '2025-12-22', '2026-01-02');
    const als = decompteConge(makeCtx(contract(AM), [], [cp], '2026-11-22'), cp);
    const met = decompteConge(makeCtx(contract(), [], [cp], '2026-11-22'), cp);
    expect(met.jours).toBe(10);
    expect(met.aConfirmer).toBeUndefined();
    expect(als.jours).toBe(9);
    expect(als.aConfirmer).toMatch(/9 jours si c’est un férié pour toi, 10 sinon/);
  });
});

describe('T-077 R4 : maintien de salaire du droit local (Alsace-Moselle)', () => {
  const leaves = [leave('am_malade', '2026-09-14', '2026-09-15')];
  it('Alsace-Moselle : jours ni payés ni retenus ; leur salaire est la retenue de la métropole', () => {
    const met = monthBase(makeCtx(contract(), [], leaves, '2026-11-22'), '2026-09');
    const als = monthBase(makeCtx(contract(AM), [], leaves, '2026-11-22'), '2026-09');
    expect(met.retenue).toBeGreaterThan(0);
    expect(als.base).toBe(met.base);
    expect(als.evenementAConfirmer).toBe(met.retenue);
    expect(als.joursMaintienAConfirmer).toBe(2);
    expect(als.alerts.join(' ')).toMatch(/L1226-23/);
  });
  it('Mayotte : retenue normale', () => {
    const met = monthBase(makeCtx(contract(), [], leaves, '2026-11-22'), '2026-09');
    const my = monthBase(makeCtx(contract(MY), [], leaves, '2026-11-22'), '2026-09');
    expect(my.base).toBe(met.base);
    expect(my.evenementAConfirmer).toBe(0);
  });
  it('enfant de l’AM malade : même règle', () => {
    const l = [leave('am_enfant_malade', '2026-09-14', '2026-09-14')];
    expect(monthBase(makeCtx(contract(AM), [], l, '2026-11-22'), '2026-09').joursMaintienAConfirmer).toBe(1);
  });
});

describe('T-077 R5 : préavis du droit local (Alsace-Moselle)', () => {
  it('retrait après un an : un mois (convention) ou six semaines (droit local), écart chiffré', () => {
    const als = finDeContrat(makeCtx(contract(AM), [], [], '2026-12-31'), '2026-10-01', 'retrait');
    const met = finDeContrat(makeCtx(contract(), [], [], '2026-12-31'), '2026-10-01', 'retrait');
    expect(met.preavisLocalAConfirmer).toBeUndefined();
    expect(als.preavisFin).toBe(met.preavisFin);
    expect(als.preavisLocalAConfirmer).toMatch(/11\/11\/2026/);
    expect(als.preavisLocalAConfirmer).toMatch(/de salaire en plus/);
    expect(als.alertes).toContain(als.preavisLocalAConfirmer);
  });
});

describe('T-077 R6 : revenu imposable à Mayotte', () => {
  it('abattement au SMIC de Mayotte, l’autre lecture affichée ; pas de CSG ni de CRDS', () => {
    const ctx = makeCtx(contract(MY), [], [], '2026-12-31');
    const f = fiscalYear(ctx, 2026);
    expect(f.abattementSmicNational).toBeGreaterThan(f.abattement);
    expect(f.aConfirmer).toMatch(/SMIC de Mayotte/);
    expect(f.smics).toEqual([933, 956]);
    let net = 0;
    for (let k = 1; k <= 12; k++) net += computeMonth(ctx, `2026-${String(k).padStart(2, '0')}` as `${number}-${string}`).netTotal;
    // Mois avec un jour à confirmer (27 avril) : salaire à confirmer non compté, comme ailleurs.
    expect(f.netImposable).toBe(net);
    const fm = fiscalYear(makeCtx(contract(), [], [], '2026-12-31'), 2026);
    expect(fm.aConfirmer).toBeUndefined();
    expect(fm.abattementSmicNational).toBeUndefined();
  });
});
