// T-076 : contrat à durée déterminée (CDD) calculé par le moteur A.
// Spécification : regles/t076-decisions-direction.md, section 2. Règles : regles/t076-cdd.md (R-CDD-xx, P1 à P5).
// Les attendus sont calculés à la main dans les commentaires, d'après les formules du rapport, avec les conventions de l'app :
// montants en centimes, arrondi au centime le plus proche, brut estimé = net × 10000 / 7810 (netToBrut), net estimé =
// brut × 7810 / 10000 (brutToNet). Notation : n2b(x) = arrondi(x × 10000 / 7810) ; b2n(x) = arrondi(x × 7810 / 10000).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AmLeave, Contract, DayRec, Planning } from '../src/engine/model';
import { makeCtx, monthBase } from '../src/engine/payroll';
import { computeMonth, declarationLines } from '../src/engine/month';
import { finDeCdd, finDeContrat, MESSAGE_CDD_PAS_DE_PREAVIS, MESSAGES_FIN_CDD_NON_GEREE } from '../src/engine/fin';
import { controleFinContrat } from '../src/engine/preavis';
import { nonGeresContrat } from '../src/engine/nonGeres';
import { CDD_A_COMPLETER, NON_GERE_CDD_P1_P2, estCddMoinsUnMois } from '../src/engine/cdd';
import { monthsBetween } from '../src/engine/dates';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}

/**
 * CDD de référence : du lundi 05/01/2026 au jeudi 30/04/2026, du lundi au vendredi de 8 h à 16 h (40 h par semaine),
 * 5,00 € net de l'heure, accueil toute l'année (52 semaines), remplacement.
 * Salaire mensualisé (R-CDD-04, CCN 109.1, diviseur 12 quelle que soit la durée, E-CDD-02 et E-CDD-03) :
 * 40 h × 52 / 12 × 5,00 € = 866,666… → 866,67 € (86667).
 */
const cdd = (over: Partial<Contract> = {}): Contract => ({
  id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2026-01-05', yearType: 'complete', weeks: 52, weeksOff: [],
  planning: week('08:00', '16:00'), rateNet: 500, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0, kmTaux: 0,
  cpMode: 'juin', majoreFiscal: false, trackedFrom: '2026-01-05', balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 },
  history: [], createdAt: 0, alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false,
  cdd: true, cddTerme: '2026-04-30', cddMotif: 'remplacement', ...over,
});
const ctxDe = (c: Contract, recs: DayRec[] = [], leaves: AmLeave[] = []) => makeCtx(c, recs, leaves, '2026-12-31');
const fin = (c: Contract, jour: string, f: Parameters<typeof finDeCdd>[2], recs: DayRec[] = [], leaves: AmLeave[] = []) =>
  finDeCdd(ctxDe(c, recs, leaves), jour, f);

describe('R-CDD-04 : mensualisation du CDD comme un CDI (52 semaines sur 12 mois)', () => {
  it('salaire mensualisé et mois d’entrée (art. 111)', () => {
    const ctx = ctxDe({ ...cdd(), end: '2026-04-30' });
    // Mois complets : 866,67 €.
    expect(monthBase(ctx, '2026-02').salaireMens).toBe(86667);
    expect(computeMonth(ctx, '2026-02').netTotal).toBe(86667);
    expect(computeMonth(ctx, '2026-03').netTotal).toBe(86667);
    // Avril : mois complet (fin le 30) ; le lundi de Pâques (06/04, férié chômé) est payé : 866,67 €.
    expect(computeMonth(ctx, '2026-04').netTotal).toBe(86667);
    // Janvier : 22 jours prévus au planning (8 h), dont 20 dans le CDD (à partir du 05/01) : 86667 × 160 / 176 = 78788,18 → 787,88 €.
    expect(computeMonth(ctx, '2026-01').netTotal).toBe(78788);
    // Aucune seconde lecture pour ce CDD (ni P1 ni P2).
    expect(computeMonth(ctx, '2026-01').cddAConfirmer).toBeUndefined();
  });
  it('plus de refus « non géré » pour un CDD qui a sa date de fin prévue', () => {
    expect(nonGeresContrat(cdd())).toEqual([]);
    expect(monthBase(ctxDe(cdd()), '2026-03').nonGere).toEqual([]);
  });
  it('CDD sans date de fin prévue : à compléter, rien calculé', () => {
    expect(monthBase(ctxDe(cdd({ cddTerme: undefined })), '2026-03').nonGere).toContain(CDD_A_COMPLETER);
  });
});

describe('R-CDD-06 : ni préavis ni indemnité de rupture', () => {
  it('fin au terme : pas de préavis, indemnité de rupture 0', () => {
    const f = fin(cdd(), '2026-04-30', 'terme');
    expect(f.nonGere).toBeUndefined();
    expect(f.preavisLabel).toMatch(/Pas de préavis/);
    expect(f.preavisFin).toBe('2026-04-30');
    expect(f.dernierJour).toBe('2026-04-30');
    expect(f.indemniteRupture).toBe(0);
    expect(f.indemnitePreavis).toBe(0);
    expect(f.ruptureExplication).toBe(MESSAGE_CDD_PAS_DE_PREAVIS);
  });
  it('la date de fin d’un CDD n’est pas contrôlée face à un préavis : les mois ne sont pas bloqués', () => {
    const c = { ...cdd(), end: '2026-04-30' };
    expect(controleFinContrat(c)).toBeUndefined();
    expect(monthBase(ctxDe(c), '2026-04').nonGere).toEqual([]);
    // Fin enregistrée par l'écran Fin (motif « fin de CDD ») : pas de blocage non plus.
    const r = { ...c, rupture: { motif: 'fin_cdd' as const, notif: '2026-04-30', preavis: 'execute' as const, finCdd: 'terme' as const } };
    expect(controleFinContrat(r)).toBeUndefined();
    // Le même contrat en CDI reste contrôlé (préavis sans réponse) : rien ne change pour le CDI.
    expect(controleFinContrat({ ...c, cdd: false })?.message).toMatch(/préavis/);
  });
  it('fin d’un CDD enregistrée avec un motif de CDI : refusée', () => {
    const c = { ...cdd(), end: '2026-04-30', rupture: { motif: 'retrait' as const, notif: '2026-04-15', preavis: 'execute' as const } };
    expect(controleFinContrat(c)?.message).toMatch(/CDD/);
    expect(finDeContrat(ctxDe(cdd()), '2026-04-15', 'retrait').nonGere?.[0]).toMatch(/Ce contrat est un CDD/);
  });
  it('finDeContrat avec le motif « fin de CDD » reprend la réponse enregistrée', () => {
    const c = { ...cdd(), rupture: { motif: 'fin_cdd' as const, notif: '2026-04-30', preavis: 'execute' as const, finCdd: 'terme' as const } };
    expect(finDeContrat(ctxDe(c), '2026-04-30', 'fin_cdd').ifc).toBe(43379);
  });
});

describe('R-CDD-07, R-CDD-09, R-CDD-10 : IFC puis ICCP, IFC dans la base du dixième', () => {
  // BrutCDD = n2b(78788) + 3 × n2b(86667) = 100881 + 3 × 110969 = 433788 (4 337,88 €).
  // IFC = 10 % × 4 337,88 = 433,788 → 433,79 € brut (43379) ; net = b2n(43379) = 33878,999 → 338,79 € (33879).
  // ICCP (dixième de la période, IFC comprise) : (78788 + 3 × 86667 + 33879) / 10 = 372668 / 10 → 372,67 € (37267).
  // Maintien : au plus 11 jours acquis (lecture la plus haute) × 200 € la semaine / 6 = 366,67 € < 372,67 € : pas d'écart P3.
  // Plancher L1242-16 (aucun congé pris) : 10 % × (salaires + IFC), même base : 372,67 €.
  // P4 : à confirmer = 10 % × n2b(37267) = 10 % × 47717 = 4771,7 → 47,72 € ; lecture 2 : 433,79 + 47,72 = 481,51 €.
  it('fin au terme : montants du rapport', () => {
    const f = fin(cdd(), '2026-04-30', 'terme');
    expect(f.brutCdd).toBe(433788);
    expect(f.totalBrut).toBe(433788);
    expect(f.ifc).toBe(43379);
    expect(f.ifcNet).toBe(33879);
    expect(f.cpIndemnite).toBe(37267);
    expect(f.cpPartAConfirmer).toBeUndefined();
    expect(f.ifcPartAConfirmer?.montant).toBe(4772);
    expect(f.ifcPartAConfirmer?.lectures).toEqual([48151, 43379]);
    expect(f.regularisation).toBe(0);
  });
  it('ordre R-CDD-09 : sans l’IFC dans la base, le dixième serait plus bas (338,79 €) ; l’IFC ne compte pas l’ICCP', () => {
    // Dixième sans IFC : 338789 / 10 = 33878,9 → 338,79 €. Avec : 372,67 €. Écart = 10 % de l'IFC nette (33,88 €).
    const f = fin(cdd(), '2026-04-30', 'terme');
    expect(f.cpIndemnite - 33879).toBe(3388);
    // IFC = 10 % des seuls salaires (lecture 1 de P4, retenue) : 43379, pas 10 % de (salaires + ICCP).
    expect(f.ifc).toBe(Math.round(433788 / 10));
  });
  it('déclaration : IFC en net, champ Pajemploi mntIndPrecarite, sans heure', () => {
    const f = fin(cdd(), '2026-04-30', 'terme');
    expect(f.declaration).toEqual([expect.objectContaining({ champ: 'mntIndPrecarite', net: 33879 })]);
    expect(f.declaration?.[0].hint).toMatch(/aucune heure/);
  });
  it('assiette : entretien, repas et kilomètres exclus', () => {
    const recs: DayRec[] = [{ key: 'c1|2026-02-12', cid: 'c1', date: '2026-02-12', km: 30, kmPartage: false }];
    const f = fin(cdd({ entretienJour: 300, repasPrix: 400, repasParJour: 1, kmTaux: 50 }), '2026-04-30', 'terme', recs);
    // Mêmes salaires qu'au cas de référence : BrutCDD 433788, IFC 43379.
    expect(f.brutCdd).toBe(433788);
    expect(f.ifc).toBe(43379);
  });
  it('assiette : heures complémentaires et majorées comprises', () => {
    // Mercredi 11/02 : 7 h - 18 h, 3 h en plus (semaine à 43 h) : 3 h complémentaires.
    // Semaine du 16/02 : 7 h - 18 h chaque jour, 15 h en plus : 5 h complémentaires (jusqu'à 45 h), 10 h majorées (+10 %).
    // Février : 866,67 + 8 h × 5,00 + 10 h × 5,50 = 866,67 + 40,00 + 55,00 = 961,67 € ; n2b(96167) = 123133.
    // BrutCDD = 100881 + 123133 + 2 × 110969 = 445952 ; IFC = 44595,2 → 445,95 €.
    const recs: DayRec[] = ['2026-02-11', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20']
      .map((d) => ({ key: `c1|${d}`, cid: 'c1', date: d, pres: [{ a: '07:00', d: '18:00' }] }));
    const ctx = ctxDe({ ...cdd(), end: '2026-04-30' }, recs);
    expect(computeMonth(ctx, '2026-02').netTotal).toBe(96167);
    const f = fin(cdd(), '2026-04-30', 'terme', recs);
    expect(f.brutCdd).toBe(445952);
    expect(f.ifc).toBe(44595);
  });
  it('assiette : congés payés versés compris (maintien du salaire pendant les congés)', () => {
    // 6 jours de congés de la période précédente (solde de départ), pris du 16 au 21/03 : le salaire de mars est maintenu
    // (866,67 €) et compte dans BrutCDD, qui reste 433788.
    const leaves: AmLeave[] = [{ id: 'cp1', type: 'cp', from: '2026-03-16', to: '2026-03-21' }];
    const c = cdd({ balances: { cpRestants: 6, cpEnCours: 0, maladieDeduits: 0 } });
    expect(computeMonth(ctxDe({ ...c, end: '2026-04-30' }, [], leaves), '2026-03').netTotal).toBe(86667);
    const f = fin(c, '2026-04-30', 'terme', [], leaves);
    expect(f.brutCdd).toBe(433788);
    expect(f.ifc).toBe(43379);
  });
});

describe('R-CDD-08 : IFC selon la façon dont le CDD finit', () => {
  // Fin anticipée le 31/03 : BrutCDD = 100881 + 2 × 110969 = 322819 ; IFC = 32281,9 → 322,82 €.
  const cas: [Parameters<typeof finDeCdd>[2], string, number][] = [
    ['terme', '2026-04-30', 43379],
    ['commun_accord', '2026-03-31', 32282],
    ['employeur', '2026-03-31', 32282],
    ['suite_cdi', '2026-04-30', 0],
    ['refus_cdi', '2026-04-30', 0],
    ['initiative_am', '2026-03-31', 0],
    ['faute_grave', '2026-03-31', 0],
    ['essai', '2026-01-09', 0],
  ];
  for (const [f, jour, ifc] of cas) {
    it(`${f} : IFC ${ifc}`, () => {
      const r = fin(cdd(), jour, f);
      expect(r.nonGere).toBeUndefined();
      expect(r.ifc).toBe(ifc);
      expect(r.indemniteRupture).toBe(0);
      if (!ifc) expect(r.ifcExplication).toMatch(/Pas d’indemnité de fin de contrat/);
      if (!ifc) expect(r.declaration).toEqual([]);
    });
  }
  it('rupture par le parent : dommages et intérêts non calculés, « à voir avec un conseil »', () => {
    expect(fin(cdd(), '2026-03-31', 'employeur').alertes.join(' ')).toMatch(/dommages et intérêts.*conseil/);
  });
  it('suite en CDI : ni IFC ni ICCP (L1242-16, al. 3)', () => {
    const r = fin(cdd(), '2026-04-30', 'suite_cdi');
    expect(r.cpIndemnite).toBe(0);
    expect(r.cpExplication).toMatch(/restent acquis/);
  });
  it('refus de CDI, faute grave, essai : ICCP due sans IFC dans sa base', () => {
    // Refus de CDI au terme : (78788 + 3 × 86667) / 10 = 33878,9 → 338,79 €.
    expect(fin(cdd(), '2026-04-30', 'refus_cdi').cpIndemnite).toBe(33879);
  });
  for (const f of ['force_majeure', 'inaptitude', 'jeune_vacances', 'saisonnier_usage', 'autre'] as const) {
    it(`${f} : non géré, message précis, aucun montant`, () => {
      const r = fin(cdd(), '2026-03-31', f);
      expect(r.nonGere).toEqual([MESSAGES_FIN_CDD_NON_GEREE[f]]);
      expect((r.ifc ?? 0) + r.cpIndemnite + r.regularisation + r.indemniteRupture).toBe(0);
      expect(MESSAGES_FIN_CDD_NON_GEREE[f]).not.toMatch(/€/);
    });
  }
  it('« terme atteint » avec un dernier jour avant la date prévue : refusé (l’IFC dépend de la vraie raison)', () => {
    expect(fin(cdd(), '2026-03-31', 'terme').nonGere?.[0]).toMatch(/avant la date de fin prévue/);
  });
  it('sans réponse : aucun montant', () => {
    expect(fin(cdd(), '2026-04-30', undefined).nonGere?.[0]).toMatch(/Dis comment finit le CDD/);
  });
});

describe('C-FIN-11 (Urssaf, Virginie) : 1 600 € brut, IFC 160 €', () => {
  it('du 1er janvier au 28 février, 800 € brut par mois : IFC 160,00 € brut', () => {
    // Urssaf : « 800 € + 800 € = 1 600 € brut ; la prime de précarité sera alors de 1 600 € × 10 % = 160 € brut ».
    const c = cdd({ start: '2026-01-01', trackedFrom: '2026-01-01', cddTerme: '2026-02-28' });
    const f = finDeCdd(ctxDe(c), '2026-02-28', 'terme', 0, { parMois: { '2026-01': 80000, '2026-02': 80000 } });
    expect(f.brutCdd).toBe(160000);
    expect(f.ifc).toBe(16000);
  });
});

describe('P1 : CDD à terme précis de moins d’un mois, deux lectures', () => {
  // Du lundi 09/03 au vendredi 27/03/2026 : 15 jours, 120 h. Mars 2026 : 22 jours prévus, 176 h.
  // Lecture 1 (mensualisé puis art. 111) : 86667 × 120 / 176 = 59091,1 → 590,91 €.
  // Lecture 2 (taux × heures réellement faites) : 120 h × 5,00 € = 600,00 €.
  // Part sûre 590,91 € ; à confirmer 9,09 €.
  const c = cdd({ start: '2026-03-09', trackedFrom: '2026-03-09', cddTerme: '2026-03-27' });
  it('le cas est reconnu (moins d’un mois) ; un mois juste n’en est pas un', () => {
    expect(estCddMoinsUnMois(c)).toBe(true);
    expect(estCddMoinsUnMois({ ...c, cddTerme: '2026-04-08' })).toBe(false);
    expect(estCddMoinsUnMois({ ...c, cddTermeImprecis: true })).toBe(false);
  });
  it('mois : part sûre, écart à confirmer hors du total', () => {
    const r = computeMonth(ctxDe({ ...c, end: '2026-03-27' }), '2026-03');
    expect(r.cddLectures).toEqual([59091, 60000]);
    expect(r.netTotal).toBe(59091);
    expect(r.cddAConfirmer).toBe(909);
    expect(r.alerts.join(' ')).toMatch(/9,09\s€ à confirmer/);
    expect(declarationLines(ctxDe({ ...c, end: '2026-03-27' }), r).find((l) => l.label === 'Salaire net')?.value).toMatch(/\+ 9,09\s€ de salaire du CDD à confirmer/);
  });
  it('fin : IFC et ICCP dans chaque lecture, part sûre = la plus basse', () => {
    // IFC : lecture 1 = n2b(59091) / 10 = 75661 / 10 → 75,66 € ; lecture 2 = n2b(60000) / 10 = 76825 / 10 = 7682,5 → 76,83 €.
    // ICCP lecture 1 : (59091 + b2n(7566) = 5909) / 10 = 65,00 € ; lecture 2 : (60000 + b2n(7683) = 6000) / 10 = 66,00 €.
    // Maintien (P3) : 2 jours au plus × 200 € / 6 = 66,67 €. ICCP : 65,00 € sûrs, 66,67 − 65,00 = 1,67 € à confirmer.
    // P4, lecture 2 : 76,83 + 10 % × n2b(6667) = 76,83 + 8536 / 10 → 76,83 + 8,54 = 85,37 €. IFC : 75,66 € sûrs, 9,71 € à confirmer.
    const f = fin(c, '2026-03-27', 'terme');
    expect(f.ifc).toBe(7566);
    expect(f.ifcPartAConfirmer?.lectures).toEqual([8537, 7566]);
    expect(f.ifcPartAConfirmer?.montant).toBe(971);
    expect(f.cpIndemnite).toBe(6500);
    expect(f.cpPartAConfirmer?.lectures).toEqual([6667, 6500]);
    expect(f.cpPartAConfirmer?.montant).toBe(167);
  });
});

describe('P2 : CDD avec semaines sans accueil, deux lectures', () => {
  // Même CDD, semaines sans accueil du 16/02 et du 06/04 ; contrat : 15 semaines d'accueil programmées (17 − 2).
  // Lecture 1 (46 semaines ou moins, art. 109.2) : mensualisé = 40 h × 15 / 12 × 5,00 € = 250,00 € ; janvier (méthode des
  //   jours) : 25000 × 20 / 22 = 22727,3 → 227,27 €.
  // Lecture 2 (52 semaines, art. 111 sur les semaines sans accueil) : janvier 787,88 € ; février 86667 × 120 / 160 = 650,00 € ;
  //   mars 866,67 € ; avril 86667 × 136 / 176 = 66970,0 → 669,70 €.
  const c = cdd({ yearType: 'incomplete', weeks: 15, weeksOff: ['2026-02-16', '2026-04-06'] });
  it('mois : part sûre = lecture la plus basse, écart à confirmer', () => {
    const ctx = ctxDe({ ...c, end: '2026-04-30' });
    const attendus: [string, number, number][] = [['2026-01', 22727, 78788], ['2026-02', 25000, 65000], ['2026-03', 25000, 86667], ['2026-04', 25000, 66970]];
    for (const [m, l1, l2] of attendus) {
      const r = computeMonth(ctx, m);
      expect(r.cddLectures).toEqual([l1, l2]);
      expect(r.netTotal).toBe(Math.min(l1, l2));
      expect(r.cddAConfirmer).toBe(Math.abs(l2 - l1));
    }
  });
  it('fin : régularisation de la lecture 1 à confirmer, IFC et ICCP de chaque lecture', () => {
    // Régularisation (lecture 1) : jours dus = 20 + 15 + 22 + 17 = 74 jours × 8 h × 5,00 € = 2 960,00 € ; versé 227,27 + 3 × 250
    //   = 977,27 € ; régularisation 1 982,73 €. Lecture 2 : aucune. Part sûre 0, à confirmer 1 982,73 €.
    // IFC lecture 1 : (n2b(22727) + 3 × n2b(25000) + n2b(198273)) / 10 = 379001 / 10 → 379,00 € ;
    //   lecture 2 : (n2b(78788) + n2b(65000) + n2b(86667) + n2b(66970)) / 10 = 380826 / 10 → 380,83 €. Part sûre 379,00 €.
    // ICCP (dixième) lecture 1 : (97727 + 198273 + b2n(37900) = 29600) / 10 = 325,60 € ;
    //   lecture 2 : (297425 + b2n(38083) = 29743) / 10 = 32716,8 → 327,17 €. Part sûre 325,60 €.
    //   Maintien le plus haut (lecture 2, 11 jours) : 366,67 €. À confirmer : 366,67 − 325,60 = 41,07 €.
    const f = fin(c, '2026-04-30', 'terme');
    expect(f.regularisation).toBe(0);
    expect(f.regularisationPartAConfirmer?.lectures).toEqual([198273, 0]);
    expect(f.ifc).toBe(37900);
    expect(f.cpIndemnite).toBe(32560);
    expect(f.cpPartAConfirmer?.lectures).toEqual([36667, 32560]);
    // P4 sur la lecture la plus haute : 380,83 + 10 % × n2b(36667) = 380,83 + 4694,8 → 46,95 = 427,78 €.
    expect(f.ifcPartAConfirmer?.lectures).toEqual([42778, 37900]);
    expect(f.alertes.join(' ')).toMatch(/Sur tout le CDD/);
  });
  it('P1 et P2 à la fois : non géré', () => {
    const p = cdd({ start: '2026-03-09', trackedFrom: '2026-03-09', cddTerme: '2026-03-27', yearType: 'incomplete', weeks: 2, weeksOff: ['2026-03-16'] });
    expect(nonGeresContrat(p)).toContain(NON_GERE_CDD_P1_P2);
  });
});

describe('Non-régression : un CDI donne exactement les mêmes sorties qu’avant T-076', () => {
  // Sorties capturées sur le code d'avant T-076 (commit 4f85868), mêmes contrats et saisies (tests/fixtures/t076-cdi-avant.json).
  const avant = JSON.parse(readFileSync(new URL('./fixtures/t076-cdi-avant.json', import.meta.url), 'utf8')) as Record<string, unknown>;
  const CDI: Record<string, Contract> = {
    complet: { id: 'c1', child: 'L', family: 'M', color: 0, start: '2025-09-01', yearType: 'complete', weeks: 52, weeksOff: [], planning: week('08:00', '17:00'), rateNet: 480, majoration: 10, entretienJour: 350, repasPrix: 300, repasParJour: 1, kmTaux: 40, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2025-09-01', balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false },
    incomplet: { id: 'c1', child: 'L', family: 'M', color: 0, start: '2025-09-01', yearType: 'incomplete', weeks: 40, weeksOff: ['2025-10-20', '2025-10-27', '2025-12-22', '2025-12-29', '2026-02-16', '2026-02-23', '2026-04-13', '2026-04-20', '2026-07-27', '2026-08-03', '2026-08-10', '2026-08-17'], planning: week('08:30', '16:30', [1, 2, 4, 5]), rateNet: 520, majoration: 15, entretienJour: 400, repasPrix: 0, repasParJour: 0, kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2025-09-01', balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false },
  };
  const recs: DayRec[] = [
    { key: 'c1|2026-02-11', cid: 'c1', date: '2026-02-11', pres: [{ a: '07:00', d: '18:30' }] },
    { key: 'c1|2026-03-03', cid: 'c1', date: '2026-03-03', abs: 'malade_certif' },
    { key: 'c1|2026-03-05', cid: 'c1', date: '2026-03-05', km: 12, kmPartage: false },
  ];
  const leaves: AmLeave[] = [{ id: 'l1', type: 'cp', from: '2026-05-11', to: '2026-05-16' }];
  it('mois et fins de contrat identiques', () => {
    const apres: Record<string, unknown> = {};
    for (const [nom, c] of Object.entries(CDI)) {
      const ctx = makeCtx(c, recs, leaves, '2026-11-15');
      for (const m of monthsBetween('2025-09', '2026-10')) apres[`${nom}|${m}`] = computeMonth(ctx, m);
      for (const motif of ['retrait', 'demission', 'deces', 'inaptitude', 'faute_grave', 'essai'] as const) {
        apres[`${nom}|fin|${motif}`] = finDeContrat(makeCtx(c, recs, leaves, '2026-11-15'), '2026-09-14', motif, 0, '2026-09-16');
      }
    }
    expect(JSON.parse(JSON.stringify(apres))).toEqual(avant);
  });
});
