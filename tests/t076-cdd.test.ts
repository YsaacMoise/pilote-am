// T-076 : contrat à durée déterminée (CDD) calculé par le moteur A.
// Spécification : regles/t076-decisions-direction.md, section 2. Règles : regles/t076-cdd.md (R-CDD-xx, P1 à P5).
// Les attendus sont calculés à la main dans les commentaires, d'après les formules du rapport, avec les conventions de l'app :
// montants en centimes, arrondi au centime le plus proche, brut estimé = net × 10000 / 7810 (netToBrut), net estimé =
// brut × 7810 / 10000. Notation : n2b(x) = arrondi(x × 10000 / 7810) ; b2n(x) = arrondi(x × 7810 / 10000).
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
    expect(finDeContrat(ctxDe(c), '2026-04-30', 'fin_cdd').ifcNet).toBe(33879);
  });
});

describe('R-CDD-07, R-CDD-09, R-CDD-10 : IFC puis ICCP, IFC dans la base du dixième', () => {
  // Direction T-076 : l'IFC est calculée sur le net (Urssaf : « La déclaration et le paiement doivent être réalisés sur la
  // base du net »). Assiette nette = 78788 + 3 × 86667 = 338789 (3 387,89 €).
  // IFC nette = arrondi(10 % × 338789) = 33878,9 → 338,79 € (33879) ; brut affiché = n2b(33879) = 43379.
  // ICCP (dixième de la période, IFC comprise) : (338789 + 33879) / 10 = 372668 / 10 → 372,67 € (37267).
  // Maintien : au plus 11 jours acquis (lecture la plus haute) × 200 € la semaine / 6 = 366,67 € < 372,67 € : pas d'écart P3.
  // Plancher L1242-16 (aucun congé pris) : 10 % × (salaires + IFC), même base : 372,67 €.
  // P4, lecture 2 : arrondi(10 % × (338789 + 37267)) = 37605,6 → 376,06 € ; à confirmer 376,06 − 338,79 = 37,27 €.
  it('fin au terme : montants du rapport', () => {
    const f = fin(cdd(), '2026-04-30', 'terme');
    expect(f.assietteNetteCdd).toBe(338789);
    expect(f.ifcNet).toBe(33879);
    expect(f.ifc).toBe(43379);
    expect(f.brutCdd).toBe(433789);
    expect(f.cpIndemnite).toBe(37267);
    expect(f.cpPartAConfirmer).toBeUndefined();
    expect(f.ifcPartAConfirmer?.montant).toBe(3727);
    expect(f.ifcPartAConfirmer?.lectures).toEqual([37606, 33879]);
    expect(f.regularisation).toBe(0);
  });
  it('IFC nette calculée sur le net, pas reconvertie depuis le brut (direction T-076)', () => {
    // 4,00 € net de l'heure, du 05/01 au 31/03/2026 : mensualisé 40 × 52 / 12 × 4,00 = 693,33 € ; janvier 69333 × 160 / 176
    // = 63030,0 → 630,30 €. Assiette nette = 63030 + 2 × 69333 = 201696 ; IFC nette = 20169,6 → 201,70 € (20170).
    // L'ancienne route par le brut donnait b2n(arrondi(10 % × (n2b(63030) + 2 × n2b(69333)))) = 201,69 € : un centime de moins.
    const f = fin(cdd({ rateNet: 400, cddTerme: '2026-03-31' }), '2026-03-31', 'terme');
    expect(f.ifcNet).toBe(20170);
    expect(f.ifc).toBe(25826);
  });
  it('ordre R-CDD-09 : sans l’IFC dans la base, le dixième serait plus bas (338,79 €) ; l’IFC ne compte pas l’ICCP', () => {
    // Dixième sans IFC : 338789 / 10 = 33878,9 → 338,79 €. Avec : 372,67 €. Écart = 10 % de l'IFC nette (33,88 €).
    const f = fin(cdd(), '2026-04-30', 'terme');
    expect(f.cpIndemnite - 33879).toBe(3388);
    // IFC = 10 % des seuls salaires (lecture 1 de P4, retenue), pas 10 % de (salaires + ICCP).
    expect(f.ifcNet).toBe(Math.round(338789 / 10));
  });
  it('déclaration : IFC en net, champ Pajemploi mntIndPrecarite, sans heure', () => {
    const f = fin(cdd(), '2026-04-30', 'terme');
    expect(f.declaration).toEqual([expect.objectContaining({ champ: 'mntIndPrecarite', net: 33879 })]);
    expect(f.declaration?.[0].hint).toMatch(/aucune heure/);
  });
  it('assiette : entretien, repas et kilomètres exclus', () => {
    const recs: DayRec[] = [{ key: 'c1|2026-02-12', cid: 'c1', date: '2026-02-12', km: 30, kmPartage: false }];
    const f = fin(cdd({ entretienJour: 300, repasPrix: 400, repasParJour: 1, kmTaux: 50 }), '2026-04-30', 'terme', recs);
    // Mêmes salaires qu'au cas de référence : assiette 338789, IFC nette 33879.
    expect(f.assietteNetteCdd).toBe(338789);
    expect(f.ifcNet).toBe(33879);
  });
  it('assiette : heures complémentaires et majorées comprises', () => {
    // Mercredi 11/02 : 7 h - 18 h, 3 h en plus (semaine à 43 h) : 3 h complémentaires.
    // Semaine du 16/02 : 7 h - 18 h chaque jour, 15 h en plus : 5 h complémentaires (jusqu'à 45 h), 10 h majorées (+10 %).
    // Février : 866,67 + 8 h × 5,00 + 10 h × 5,50 = 866,67 + 40,00 + 55,00 = 961,67 €.
    // Assiette = 78788 + 96167 + 2 × 86667 = 348289 ; IFC nette = 34828,9 → 348,29 €.
    const recs: DayRec[] = ['2026-02-11', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20']
      .map((d) => ({ key: `c1|${d}`, cid: 'c1', date: d, pres: [{ a: '07:00', d: '18:00' }] }));
    const ctx = ctxDe({ ...cdd(), end: '2026-04-30' }, recs);
    expect(computeMonth(ctx, '2026-02').netTotal).toBe(96167);
    const f = fin(cdd(), '2026-04-30', 'terme', recs);
    expect(f.assietteNetteCdd).toBe(348289);
    expect(f.ifcNet).toBe(34829);
  });
  it('assiette : congés payés versés compris (maintien du salaire pendant les congés)', () => {
    // 6 jours de congés de la période précédente (solde de départ), pris du 16 au 21/03 : le salaire de mars est maintenu
    // (866,67 €) et compte dans l'assiette, qui reste 338789.
    const leaves: AmLeave[] = [{ id: 'cp1', type: 'cp', from: '2026-03-16', to: '2026-03-21' }];
    const c = cdd({ balances: { cpRestants: 6, cpEnCours: 0, maladieDeduits: 0 } });
    expect(computeMonth(ctxDe({ ...c, end: '2026-04-30' }, [], leaves), '2026-03').netTotal).toBe(86667);
    const f = fin(c, '2026-04-30', 'terme', [], leaves);
    expect(f.assietteNetteCdd).toBe(338789);
    expect(f.ifcNet).toBe(33879);
  });
});

describe('R-CDD-08 : IFC selon la façon dont le CDD finit', () => {
  // IFC nette. Fin anticipée le 31/03 : assiette = 78788 + 2 × 86667 = 252122 ; IFC = 25212,2 → 252,12 €.
  const cas: [Parameters<typeof finDeCdd>[2], string, number][] = [
    ['terme', '2026-04-30', 33879],
    ['commun_accord', '2026-03-31', 25212],
    ['employeur', '2026-03-31', 25212],
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
      expect(r.ifcNet).toBe(ifc);
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
    // L'app calcule en net : 800 € brut = 624,80 € net au rapport de l'app (7810 / 10000). Contrat choisi pour un salaire
    // mensualisé de 624,80 € : 26 h 48 par semaine (4 jours de 8 h à 14 h 42), 5,38 € net : 1608 min × 5,38 × 52 / 12 / 60
    // = 624,80 €. Du jeudi 01/01 au samedi 28/02 : deux mois complets. Assiette nette 124960 ; IFC nette 12496 ;
    // brut = n2b(12496) = 16000 (160,00 €) ; assiette brute n2b(124960) = 160000 (1 600,00 €).
    const c = cdd({ start: '2026-01-01', trackedFrom: '2026-01-01', cddTerme: '2026-02-28', planning: week('08:00', '14:42', [1, 2, 4, 5]), rateNet: 538 });
    const f = finDeCdd(ctxDe(c), '2026-02-28', 'terme', 0);
    expect(f.assietteNetteCdd).toBe(124960);
    expect(f.brutCdd).toBe(160000);
    expect(f.ifcNet).toBe(12496);
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
    // IFC nette : lecture 1 = 10 % × 59091 → 59,09 € ; lecture 2 = 10 % × 60000 = 60,00 €.
    // ICCP lecture 1 : (59091 + 5909) / 10 = 65,00 € ; lecture 2 : (60000 + 6000) / 10 = 66,00 €.
    // Maintien (P3) : 2 jours au plus × 200 € / 6 = 66,67 €. ICCP : 65,00 € sûrs, 66,67 − 65,00 = 1,67 € à confirmer.
    // P4, lecture 2 : arrondi(10 % × (60000 + 6667)) = 6666,7 → 66,67 €. IFC : 59,09 € sûrs, 7,58 € à confirmer.
    const f = fin(c, '2026-03-27', 'terme');
    expect(f.ifcNet).toBe(5909);
    expect(f.ifcPartAConfirmer?.lectures).toEqual([6667, 5909]);
    expect(f.ifcPartAConfirmer?.montant).toBe(758);
    expect(f.cpIndemnite).toBe(6500);
    expect(f.cpPartAConfirmer?.lectures).toEqual([6667, 6500]);
    expect(f.cpPartAConfirmer?.montant).toBe(167);
    // Point 1 (direction) : le total versé n'est jamais sous le plus petit des deux totaux. Mars versé : 590,91 € ;
    // totaux : 590,91 € (lecture 1) et 600,00 € (lecture 2) : rien à compléter, 9,09 € à confirmer.
    expect(f.regularisation).toBe(0);
    expect(f.regularisationPartAConfirmer?.lectures).toEqual([909, 0]);
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
  it('fin : total versé = le plus petit des deux totaux ; IFC et ICCP de chaque lecture', () => {
    // Régularisation (lecture 1) : jours dus = 20 + 15 + 22 + 17 = 74 jours × 8 h × 5,00 € = 2 960,00 € ; versé par la
    //   mensualisation 227,27 + 3 × 250 = 977,27 € ; régularisation 1 982,73 €. Lecture 2 : aucune.
    // Totaux du CDD : lecture 1 = 977,27 + 1 982,73 = 2 960,00 € ; lecture 2 = 787,88 + 650,00 + 866,67 + 669,70 = 2 974,25 €.
    // Versé chaque mois (le plus bas) : 977,27 €. Reste dû à la fin : lecture 1 = 2 960,00 − 977,27 = 1 982,73 € ;
    //   lecture 2 = 2 974,25 − 977,27 = 1 996,98 €. Part sûre 1 982,73 € ; à confirmer 14,25 €.
    //   Total versé = 977,27 + 1 982,73 = 2 960,00 € = min(2 960,00 ; 2 974,25) (direction T-076, point bloquant).
    // IFC nette : lecture 1 = 10 % × 296000 = 296,00 € ; lecture 2 = 10 % × 297425 = 29742,5 → 297,43 €. Part sûre 296,00 €.
    // ICCP (dixième) lecture 1 : (296000 + 29600) / 10 = 325,60 € ; lecture 2 : (297425 + 29743) / 10 = 32716,8 → 327,17 €.
    //   Maintien le plus haut (lecture 2, 11 jours) : 366,67 €. Part sûre 325,60 €, à confirmer 41,07 €.
    // P4, lecture 2 la plus haute : arrondi(10 % × (297425 + 36667)) = 33409,2 → 334,09 €.
    const f = fin(c, '2026-04-30', 'terme');
    expect(f.regularisation).toBe(198273);
    expect(f.regularisationPartAConfirmer?.lectures).toEqual([199698, 198273]);
    expect(f.regularisationPartAConfirmer?.montant).toBe(1425);
    expect(f.regularisationParLecture).toEqual([198273, 0]);
    const ctx = ctxDe({ ...c, end: '2026-04-30' });
    const verse = ['2026-01', '2026-02', '2026-03', '2026-04'].reduce((t, m) => t + computeMonth(ctx, m).netTotal, 0);
    expect(verse).toBe(97727);
    expect(verse + f.regularisation).toBe(Math.min(296000, 297425));
    expect(f.ifcNet).toBe(29600);
    expect(f.cpIndemnite).toBe(32560);
    expect(f.cpPartAConfirmer?.lectures).toEqual([36667, 32560]);
    expect(f.ifcPartAConfirmer?.lectures).toEqual([33409, 29600]);
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

// ---------------------------------------------------------------------------------------------------------------------
// Corrections après vérification (rapports/T-076-verif-cdd.md ; décisions D7 à D10, regles/t076-decisions-direction.md, §4)
// ---------------------------------------------------------------------------------------------------------------------
import { fiscalYear } from '../src/engine/fiscal';

describe('B1 / D8 : suite en CDI, rien n’est dû à la fin', () => {
  it('P2 « je continue en CDI » : ni régularisation, ni solde, ni ICCP, ni IFC', () => {
    // Même CDD que P2 : avant la correction, 1 982,73 € de régularisation étaient comptés.
    const c = cdd({ yearType: 'incomplete', weeks: 15, weeksOff: ['2026-02-16', '2026-04-06'] });
    const f = fin(c, '2026-04-30', 'suite_cdi');
    expect(f.regularisation).toBe(0);
    expect(f.regularisationPartAConfirmer).toBeUndefined();
    expect(f.cpIndemnite).toBe(0);
    expect(f.ifcNet).toBe(0);
  });
});

describe('M1 / D7 : P1, lecture 2, les heures payées par un autre texte comptent', () => {
  // Du lundi 04/05 au vendredi 22/05/2026 : 15 jours prévus (dont les fériés chômés du 08/05 et du 14/05), 120 h.
  // Mai 2026 : 21 jours prévus, 168 h. Lecture 1 : 86667 × 120 / 168 = 61904,98 → 619,05 €.
  // Lecture 2 (D7) : fériés chômés payés (CCN 47) compris : 15 × 8 h × 5,00 € = 600,00 € (avant : 520,00 €).
  const c = cdd({ start: '2026-05-04', trackedFrom: '2026-05-04', cddTerme: '2026-05-22' });
  it('fériés chômés comptés', () => {
    const r = computeMonth(ctxDe({ ...c, end: '2026-05-22' }), '2026-05');
    expect(r.cddLectures).toEqual([61905, 60000]);
    expect(r.netTotal).toBe(60000);
  });
  it('absence de l’enfant à la demande des parents (payée, CCN 105) comptée', () => {
    // Avant : 480,00 €. Le 12/05 reste payé : 600,00 €.
    const recs: DayRec[] = [{ key: 'c1|2026-05-12', cid: 'c1', date: '2026-05-12', abs: 'parents' }];
    const r = computeMonth(ctxDe({ ...c, end: '2026-05-22' }, recs), '2026-05');
    expect(r.cddLectures).toEqual([61905, 60000]);
  });
  it('congé sans solde de l’AM retiré', () => {
    // 13/05 sans solde : lecture 2 = 14 × 8 × 5 = 560,00 € ; lecture 1 = 86667 × (120 − 8) / 168 = 57778.
    const leaves: AmLeave[] = [{ id: 's', type: 'sans_solde', from: '2026-05-13', to: '2026-05-13' }];
    const r = computeMonth(ctxDe({ ...c, end: '2026-05-22' }, [], leaves), '2026-05');
    expect(r.cddLectures).toEqual([57778, 56000]);
  });
});

describe('M2 / D9 : dates de fin face au terme précis', () => {
  for (const f of ['initiative_am', 'commun_accord', 'employeur', 'faute_grave', 'essai'] as const) {
    it(`${f} le jour du terme : refusé, « choisis Terme »`, () => {
      const r = fin(cdd(), '2026-04-30', f);
      expect(r.nonGere?.[0]).toMatch(/Au terme, choisis/);
      expect(r.ifcNet ?? 0).toBe(0);
    });
  }
  it('revue 2 (r1, r2) : valeur de fin inconnue refusée ; report du terme sans exigence d’écrit (L1243-7)', () => {
    const f = fin(cdd(), '2026-04-30', 'saisonnier' as never);
    expect(f.nonGere?.[0]).toMatch(/Fin de CDD inconnue de l’app \(« saisonnier »\)/);
    expect((f.ifc ?? 0) + f.cpIndemnite).toBe(0);
    const apres = fin(cdd(), '2026-05-15', 'terme').nonGere?.[0] ?? '';
    expect(apres).not.toMatch(/par écrit, mets/);
    expect(apres).toMatch(/retour de la personne remplacée : code du travail, article L1243-7/);
  });
  it('fin après le terme sans nouveau contrat : refusée (L1243-11)', () => {
    expect(fin(cdd(), '2026-05-15', 'commun_accord').nonGere?.[0]).toMatch(/après la date de fin prévue|Au terme/);
    expect(fin(cdd(), '2026-05-15', 'terme').nonGere?.[0]).toMatch(/L1243-11/);
    expect(fin(cdd(), '2026-05-15', 'refus_cdi').nonGere?.[0]).toMatch(/L1243-11/);
  });
  it('terme imprécis : fin après la durée minimale acceptée', () => {
    expect(fin(cdd({ cddTermeImprecis: true }), '2026-05-15', 'terme').nonGere).toBeUndefined();
  });
});

describe('M3 / D10 : CDD à cheval sur le 1er juin, parts sûres de l’IFC et de l’ICCP', () => {
  // CDD du lundi 02/03 au vendredi 31/07/2026, 52 semaines, aucun congé pris. Mois complets : 5 × 866,67 € = 4 333,35 €.
  // Le complément de juin (période de mars à mai) est à confirmer (nombre de jours) : il n'est pas versé.
  // IFC nette = arrondi(10 % × 433335) = 43333,5 → 433,34 €.
  // ICCP : période en cours (juin, juillet) (173334 + 43334) / 10 = 21666,8 → 216,67 € ; période précédente : dixième
  //   3 × 86667 / 10 = 26000,1 → 260,00 €, rien de versé : 260,00 €. Total 476,67 €.
  //   Plancher L1242-16 : (433335 + 43334) / 10 = 47666,9 → 476,67 €. Avant la correction : ni IFC ni ICCP chiffrées.
  const c = cdd({ start: '2026-03-02', trackedFrom: '2026-03-02', cddTerme: '2026-07-31' });
  it('montants sûrs donnés', () => {
    const f = fin(c, '2026-07-31', 'terme');
    expect(f.ifcAConfirmer).toBeUndefined();
    expect(f.cpAConfirmer).toBeUndefined();
    expect(f.ifcNet).toBe(43334);
    expect(f.cpIndemnite).toBe(47667);
  });
});

describe('M4 : compteur fiscal, salaire du CDD à confirmer signalé', () => {
  it('écart P2 de chaque mois et sommes de fin dites', () => {
    const c = cdd({ yearType: 'incomplete', weeks: 15, weeksOff: ['2026-02-16', '2026-04-06'], end: '2026-04-30' });
    const t = fiscalYear(ctxDe(c), 2026).nonGere ?? '';
    expect(t).toMatch(/Salaire du CDD à confirmer en janvier/);
    expect(t).toMatch(/Fin du CDD en avril/);
  });
});

describe('m2 : P1 lecture 2, seuil de 45 h sur la semaine civile entière', () => {
  it('semaine à cheval sur deux mois : heures au-delà de 45 h majorées dans le bon mois', () => {
    // 10 h par jour du lundi au vendredi (50 h), du lundi 23/03 au vendredi 03/04/2026 (moins d'un mois).
    // Semaine du 30/03 : lundi 30 et mardi 31 en mars (20 h), mercredi 1er à vendredi 3 en avril (30 h). Dans l'ordre des
    // jours, les heures au-delà de 45 h sont les 5 dernières, le vendredi 03/04 : en avril.
    // Avril, lecture 2 : 25 h × 5,00 + 5 h × 5,50 = 125,00 + 27,50 = 152,50 € (avant : 30 h × 5,00 = 150,00 €).
    const c = cdd({ start: '2026-03-23', trackedFrom: '2026-03-23', cddTerme: '2026-04-03', planning: week('07:00', '17:00') });
    const r = monthBase({ ...ctxDe({ ...c, end: '2026-04-03' }), lectureCdd: 2 }, '2026-04');
    expect(r.base).toBe(15250);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Corrections après la relecture indépendante (rapports/T-076-relecture.md ; décisions D15, D17, D18, D19, section 5)
// ---------------------------------------------------------------------------------------------------------------------
import { NON_GERE_CDD_PV, messageApresTerme } from '../src/engine/cdd';

describe('D15 (R1, R3) : CDD à planning variable refusé en entier', () => {
  it('CDD de moins d’un mois à planning variable (scénario R1) : refusé, aucun montant', () => {
    // Cycle A 45 h / B 15 h ancré au 02/03/2026, 65 h payées par mois, CDD du 02/03 au 20/03/2026.
    const c = cdd({ start: '2026-03-02', trackedFrom: '2026-03-02', cddTerme: '2026-03-20', planningVariable: true, pvForme: 'cycle',
      cycle: [week('07:00', '16:00'), week('08:00', '11:00')], cycleAncre: '2026-03-02', heuresMensualisees: 65 } as Partial<Contract>);
    expect(nonGeresContrat(c)).toContain(NON_GERE_CDD_PV);
    expect(computeMonth(ctxDe({ ...c, end: '2026-03-20' }), '2026-03').nonGere).toContain(NON_GERE_CDD_PV);
    expect(fin(c, '2026-03-20', 'terme').nonGere).toContain(NON_GERE_CDD_PV);
  });
});

describe('D18 (R5) : mois travaillés après le terme d’un CDD, sans fin enregistrée', () => {
  it('refusés avec le message L1243-11 ; avant le terme, calculés', () => {
    // CDD du 09/03 au 27/03/2026, aucune fin enregistrée, l'AM continue : avril et mai refusés (avant : 866,67 € et 840,00 €).
    const c = cdd({ start: '2026-03-09', trackedFrom: '2026-03-09', cddTerme: '2026-03-27' });
    const ctx = ctxDe(c);
    expect(computeMonth(ctx, '2026-04').nonGere).toContain(messageApresTerme('2026-03-27'));
    expect(computeMonth(ctx, '2026-05').nonGere).toContain(messageApresTerme('2026-03-27'));
    // Mars contient des jours après le terme (30 et 31) : refusé aussi tant que la fin n'est pas enregistrée.
    expect(computeMonth(ctx, '2026-03').nonGere).toContain(messageApresTerme('2026-03-27'));
    // Fin enregistrée au terme : mars calculé (P1, 590,91 € sûrs).
    expect(computeMonth(ctxDe({ ...c, end: '2026-03-27' }), '2026-03').nonGere).toEqual([]);
    // Terme imprécis (durée minimale) : pas de refus après la date.
    expect(computeMonth(ctxDe(cdd({ cddTermeImprecis: true })), '2026-05').nonGere).toEqual([]);
  });
});

describe('D19 (R7) : fin pendant la période d’essai au-delà d’un mois, refusée', () => {
  it('CDD du 05/01 au 30/06/2026, fin « essai » le 15/05 : refusée ; le 09/01 : acceptée', () => {
    const c = cdd({ cddTerme: '2026-06-30' });
    expect(fin(c, '2026-05-15', 'essai').nonGere?.[0]).toMatch(/L1242-10/);
    expect(fin(c, '2026-02-05', 'essai').nonGere?.[0]).toMatch(/L1242-10/);
    expect(fin(c, '2026-01-09', 'essai').nonGere).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Relecture 2 (rapports/T-076-relecture.md, N1, N2) et revue 3 (r2 bis)
// ---------------------------------------------------------------------------------------------------------------------
import { buildSnapshot } from '../src/partage/snapshot';
import { finEssaiCdd, messageApresTerme as apresTerme, messageMoisApresTerme, messageTermeAVenir } from '../src/engine/cdd';

describe('N1 : D19, limite de deux semaines pour un CDD de six mois ou moins', () => {
  it('CDD du 05/01 au 29/05/2026, fin « essai » le 30/01 (26e jour) : refusée (avant : IFC 0)', () => {
    // 145 jours, six mois ou moins : essai au plus 14 jours (limite de deux semaines), jusqu'au 18/01.
    expect(finEssaiCdd(cdd({ cddTerme: '2026-05-29' }))).toEqual({ court: '2026-01-18', long: '2026-01-18' });
    expect(fin(cdd({ cddTerme: '2026-05-29' }), '2026-01-30', 'essai').nonGere?.[0]).toMatch(/L1242-10/);
    // Sonde de la revue 3 : CDD du 05/01 au 30/04, fin « essai » le 23/01 (19e jour) : refusée.
    expect(fin(cdd(), '2026-01-23', 'essai').nonGere?.[0]).toMatch(/L1242-10/);
    expect(fin(cdd(), '2026-01-18', 'essai').nonGere).toBeUndefined();
  });
  it('entre les deux façons de compter les semaines : refus avec message', () => {
    // CDD du 05/01 au 14/02/2026 : 41 jours, 5 semaines entières (essai jusqu'au 09/01) ou 6 commencées (jusqu'au 10/01).
    const c = cdd({ cddTerme: '2026-02-14' });
    expect(finEssaiCdd(c)).toEqual({ court: '2026-01-09', long: '2026-01-10' });
    expect(fin(c, '2026-01-09', 'essai').nonGere).toBeUndefined();
    expect(fin(c, '2026-01-10', 'essai').nonGere?.[0]).toMatch(/à confirmer/);
    expect(fin(c, '2026-01-11', 'essai').nonGere?.[0]).toMatch(/après la fin possible/);
  });
  it('CDD de plus de six mois : un jour par semaine, au plus un mois', () => {
    // Du 05/01 au 31/12/2026 : 361 jours, 51 ou 52 semaines : limite d'un mois, jusqu'au 04/02.
    expect(finEssaiCdd(cdd({ cddTerme: '2026-12-31' }))).toEqual({ court: '2026-02-04', long: '2026-02-04' });
  });
});

describe('N2 : mois du terme d’un CDD en cours, avant le terme', () => {
  // CDD du 02/03 au 15/04/2026, fin pas encore enregistrée.
  const c = cdd({ start: '2026-03-02', trackedFrom: '2026-03-02', cddTerme: '2026-04-15' });
  it('aujourd’hui le 10/04 : avril calculé, alerte « enregistre la fin » ; mai refusé avec un message juste', () => {
    const ctx = makeCtx(c, [], [], '2026-04-10');
    const avril = computeMonth(ctx, '2026-04');
    expect(avril.nonGere).toEqual([]);
    expect(avril.alerts).toContain(messageTermeAVenir('2026-04-15'));
    expect(computeMonth(ctx, '2026-05').nonGere).toEqual([messageMoisApresTerme('2026-04-15')]);
    // Page des parents : avril n'est pas « non calculé ».
    const snap = buildSnapshot({ ctx: makeCtx(c, [], [], '2026-04-10'), journal: [], amName: 'Nina', enfants: 0, now: 0 });
    expect(snap.mois.find((x) => x.month === '2026-04')?.nonGere).toBeFalsy();
  });
  it('aujourd’hui le 20/04, fin non enregistrée : avril refusé (jours après le terme, L1243-11)', () => {
    expect(computeMonth(makeCtx(c, [], [], '2026-04-20'), '2026-04').nonGere).toEqual([apresTerme('2026-04-15')]);
  });
  it('r2 bis : le message ne demande plus un report « par écrit »', () => {
    expect(apresTerme('2026-04-15')).not.toMatch(/par écrit/);
    expect(apresTerme('2026-04-15')).toMatch(/L1243-7/);
  });
});
