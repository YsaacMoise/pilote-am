// T-023 et T-017 : corrections du moteur A (brief M2, rapport projet/moteur/correctifs-t023.md).
// Chaque attendu vient d'un texte relu à la source le 18/11/2026 (cité dans chaque test) ou d'un cas officiel
// de tests/cas-officiels-v0.md. Aucun attendu n'est tiré du code.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Bulletin, Contract, NatureEvenement, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { computeMonth, declarationLines } from '../src/engine/month';
import { dureeEvenement } from '../src/engine/evenements';
import { normaliserAbsence, normaliserAbsences, type AbsenceLue } from '../src/engine/absences';
import { controleKm, SUIVI_ARRETES } from '../src/engine/km';
import type { DayRec } from '../src/engine/model';
import { controle } from '../src/engine/controle';
import { fiscalYear } from '../src/engine/fiscal';
import { buildSnapshot } from '../src/partage/snapshot';
import { entretienPlancher, minimumBrut, PREMIERE_DATE_GEREE, ratesAt } from '../src/engine/rates';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}
function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2025-09-01', yearType: 'complete', weeks: 52, weeksOff: [],
    planning: week('08:00', '16:00'), rateNet: 500, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2025-09-01',
    balances: { cpRestants: 30, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0,
    // Décision du DG du 18/11/2026 : sans réponse aux 3 questions T-031, le mois n'est pas calculé.
    alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false, ...over,
  };
}

describe('T-023 (3) barèmes datés avant le 01/04/2025 (BAREME-ABSENT)', () => {
  it('SMIC et MG : décrets et arrêtés de relèvement, art. 1 à 3 (JORF)', () => {
    // Décret n° 2021-1741 du 22/12/2021 : « porté à 10,57 euros l'heure » ; MG « 3,76 euros », au 1er janvier 2022
    expect(ratesAt('2022-01-01')).toMatchObject({ smic: 1057, mg: 376 });
    // Arrêté du 19/04/2022 : 10,85 € et 3,86 € au 1er mai 2022
    expect(ratesAt('2022-05-01')).toMatchObject({ smic: 1085, mg: 386 });
    // Arrêté du 29/07/2022 : 11,07 € et 3,94 € au 1er août 2022
    expect(ratesAt('2022-08-01')).toMatchObject({ smic: 1107, mg: 394 });
    // Décret n° 2022-1608 du 22/12/2022 : 11,27 € et 4,01 € au 1er janvier 2023
    expect(ratesAt('2023-01-01')).toMatchObject({ smic: 1127, mg: 401 });
    // Arrêté du 26/04/2023 : 11,52 € et 4,10 € au 1er mai 2023
    expect(ratesAt('2023-05-01')).toMatchObject({ smic: 1152, mg: 410 });
    // Décret n° 2023-1216 du 20/12/2023 : 11,65 € et 4,15 € au 1er janvier 2024
    expect(ratesAt('2024-01-01')).toMatchObject({ smic: 1165, mg: 415 });
    // Décret n° 2024-951 du 23/10/2024 : 11,88 € et 4,22 € au 1er novembre 2024 ; la veille, encore 11,65 €
    expect(ratesAt('2024-10-31')).toMatchObject({ smic: 1165, mg: 415 });
    expect(ratesAt('2024-11-01')).toMatchObject({ smic: 1188, mg: 422 });
    expect(ratesAt('2025-12-31')).toMatchObject({ smic: 1188, mg: 422 });
  });

  it('minimum conventionnel : annexe 5 et avenants, art. 2 « premier jour calendaire du mois suivant » le JORF de l’arrêté d’extension', () => {
    const min = (d: string) => ratesAt(d)!.minConvBrut;
    expect(min('2022-01-01')).toBe(297); // annexe 5, texte de base : 2,97 €
    expect(min('2022-06-30')).toBe(297);
    expect(min('2022-07-01')).toBe(306); // avenant n° 1, JORF 14/06/2022
    expect(min('2022-09-01')).toBe(317); // avenant n° 2, JORF 23/08/2022
    expect(min('2022-12-01')).toBe(320); // avenant n° 3, JORF 23/11/2022
    expect(min('2023-04-01')).toBe(326); // avenant n° 4, JORF 1er mars 2023
    expect(min('2023-05-01')).toBe(336); // avenant n° 5, JORF 18/04/2023
    expect(min('2023-09-01')).toBe(343); // avenant n° 6, JORF 02/08/2023
    expect(min('2024-02-01')).toBe(345); // avenant n° 7, JORF 24/01/2024 (C-MENS : « 3,45 € en 2024 »)
    expect(min('2024-05-01')).toBe(350); // avenant n° 8, JORF 26/04/2024 : 3,50 € (3,64 € = valeur avec titre AM-GE)
    expect(min('2025-03-31')).toBe(350); // avenant n° 8 encore applicable
    expect(min('2025-04-01')).toBe(364); // avenant n° 9, JORF 18/03/2025
  });

  it('cas officiel C-MENS-11 : « 2,97 € (taux 2022) »', () => {
    expect(ratesAt('2022-03-15')!.minConvBrut).toBe(297);
  });

  it('avant le 01/01/2022 : période non gérée, jamais les barèmes d’une autre période', () => {
    expect(PREMIERE_DATE_GEREE).toBe('2022-01-01');
    expect(ratesAt('2021-12-31')).toBeUndefined();
    expect(entretienPlancher('2021-12-31', 540)).toBeUndefined();
  });

  it('plancher d’entretien en 2023 : MG de 4,10 € (arrêté du 26/04/2023), 90 % du MG pour 9 h (CCN art. 114.1)', () => {
    expect(entretienPlancher('2023-06-15', 540)).toBe(369); // 4,10 × 9 ÷ 10 = 3,69
  });

  it('mois avant 2022 : entretien du contrat retenu et signalé, sans plancher supposé', () => {
    const c = contract({ start: '2021-11-01', trackedFrom: '2021-11-01', entretienJour: 300 });
    const r = computeMonth(makeCtx(c, [], [], '2021-12-31'), '2021-11');
    expect(r.entretien).toBe(300 * r.presenceDays);
    expect(r.alerts.join(' ')).toMatch(/Période non gérée/);
  });

  // T-038 (M-1) : l'Urssaf publie le repère net de cette période (« Du 1er janvier 2025 au 31 mars 2025 », métropole et
  // Drom : « Salaire horaire brut 3,50 € » ; « Salaire horaire net 2,74 € », page relue le 18/11/2026).
  it('contrôle d’un bulletin de février 2025 : repère net de l’Urssaf, 2,74 € ; 2,70 € est sous le minimum', () => {
    const c = contract({ start: '2024-09-02', trackedFrom: '2024-09-02', rateNet: 270 });
    const r = computeMonth(makeCtx(c, [], [], '2025-03-31'), '2025-02');
    const b: Bulletin = { id: 'b', cid: 'c1', month: '2025-02', source: 'manuel' };
    const checks = controle(b, r, 270);
    expect(checks.some((x) => x.title === 'Minimum net non contrôlé')).toBe(false);
    expect(checks.find((x) => x.title === 'Taux du contrat sous le minimum')?.detail).toMatch(/minimum conventionnel net \(2,74/);
    expect(controle(b, r, 274).some((x) => x.title === 'Taux du contrat sous le minimum')).toBe(false);
  });

  it('compteur fiscal 2021 : pas d’abattement calculé avec un SMIC d’une autre année', () => {
    const c = contract({ start: '2021-09-01', trackedFrom: '2021-09-01' });
    const f = fiscalYear(makeCtx(c, [], [], '2021-12-31'), 2021);
    expect(f.abattementBrut).toBe(0);
    expect(f.nonGere).toMatch(/Période non gérée/);
  });
});

describe('T-023 (2) événements familiaux, R-ABS-06', () => {
  // Contrat du lundi au vendredi, 8 h par jour, année complète. Octobre 2026 : aucun jour férié.
  const c = contract({ start: '2025-09-01', trackedFrom: '2025-09-01' });
  // Saisie ramenée à la forme enregistrée (décision du DG du 21/11/2026 : nombre de jours, pas de nature).
  const ev = (from: string, to: string, nature?: NatureEvenement): AmLeave => normaliserAbsence({ id: 'e', type: 'evenement', from, to, ...(nature ? { nature } : {}) });
  const mois = (leaves: AmLeave[], m = '2026-10') => computeMonth(makeCtx(c, [], leaves, '2026-12-31'), m);
  const sansAbsence = mois([]);

  it('durées : la plus favorable entre CCN 48.1.3.1.1 (avenant n° 4) et C. trav. L3142-4 (version du 14/06/2026)', () => {
    expect(dureeEvenement('mariage', '2026-10-05')).toBe(4); // « 4 jours ouvrables pour son mariage ou [...] PACS » ; L3142-4 1° : quatre
    expect(dureeEvenement('mariage_enfant', '2026-10-05')).toBe(1); // CCN : 1 ; L3142-4 2° : un
    expect(dureeEvenement('naissance', '2026-10-05')).toBe(3); // CCN : 3 ; L3142-4 3° et 3° bis : trois
    expect(dureeEvenement('deces_enfant', '2026-10-05')).toBe(12); // CCN et L3142-4 4° : douze
    expect(dureeEvenement('deces_enfant_14', '2026-10-05')).toBe(14); // CCN et L3142-4 4° : quatorze
    expect(dureeEvenement('deces_proche', '2026-10-05')).toBe(3); // CCN et L3142-4 5° : trois
    expect(dureeEvenement('deces_descendant', '2026-10-05')).toBe(1); // CCN seule : 1
    expect(dureeEvenement('deces_ascendant', '2026-10-05')).toBe(1); // CCN seule : 1
    // Annonce d'un handicap : CCN 5 ; L3142-4 6° « Cinq jours » jusqu'au 13/06/2026, « Dix jours » depuis le 14/06/2026
    expect(dureeEvenement('handicap_enfant', '2026-06-13')).toBe(5);
    expect(dureeEvenement('handicap_enfant', '2026-06-14')).toBe(10);
    // Art. 48.1.3.1.2 : 8 jours ouvrables ; T-103 (C9) : salaire maintenu moins les indemnités journalières (montant saisi)
    expect(dureeEvenement('deuil', '2026-10-05')).toBe(8);
  });

  it('T-033 : durées avant le 21/07/2023 (L3142-4 version du 19/12/2021 et CCN 48.1.3.1.1 version remplacée)', () => {
    // L3142-4 4° « Cinq jours pour le décès d'un enfant » ; CCN remplacée « 5 jours ouvrables pour le décès d'un enfant »
    expect(dureeEvenement('deces_enfant', '2022-06-01')).toBe(5);
    expect(dureeEvenement('deces_enfant', '2023-07-20')).toBe(5);
    expect(dureeEvenement('deces_enfant', '2023-07-21')).toBe(12); // loi n° 2023-622 : « Douze jours »
    // T-103 : « 9 jours ouvrables » (CCN) contiennent toujours au moins « sept jours ouvrés » (loi) : 9
    expect(dureeEvenement('deces_enfant_14', '2023-07-20')).toBe(9);
    expect(dureeEvenement('deces_enfant_14', '2023-07-21')).toBe(14);
    // L3142-4 6° « Deux jours » ; CCN remplacée « 2 jours ouvrables pour l'annonce de la survenue d'un handicap »
    expect(dureeEvenement('handicap_enfant', '2022-06-01')).toBe(2);
    expect(dureeEvenement('handicap_enfant', '2023-07-21')).toBe(5);
    // Sans changement dans les deux versions : 4, 1, 3, 3, 1, 1
    expect(dureeEvenement('mariage', '2022-06-01')).toBe(4);
    expect(dureeEvenement('deces_proche', '2022-06-01')).toBe(3);
    expect(dureeEvenement('deces_ascendant', '2022-06-01')).toBe(1);
    // Avant la CCN IDCC 3239 (01/01/2022) : aucun texte lu
    expect(dureeEvenement('mariage', '2021-12-31')).toBeUndefined();
  });

  it('T-103 (C6) : un événement de 2022 est payé selon la version de 2022 et la loi (avenant n° 4 en vigueur au 01/05/2024)', () => {
    const c22 = contract({ start: '2022-01-03', trackedFrom: '2022-01-03' });
    const r = computeMonth(makeCtx(c22, [], [ev('2022-06-07', '2022-06-08', 'deces_enfant')], '2022-12-31'), '2022-06');
    expect(r.nonGere).toEqual([]);
    expect(r.retenue).toBe(0);
  });

  it('mariage dans la durée (4 jours ouvrables du lundi au jeudi) : payé, « pas de réduction de la rémunération »', () => {
    const r = mois([ev('2026-10-05', '2026-10-08', 'mariage')]);
    expect(r.retenue).toBe(0);
    expect(r.net).toBe(sansAbsence.net);
  });

  it('mariage saisi sur 5 jours ouvrables : le 5e n’est plus un congé pour événement familial, il est retenu (T-103)', () => {
    const r = mois([ev('2026-10-05', '2026-10-09', 'mariage')]);
    expect(r.retenue).toBeGreaterThan(0);
    expect(r.net + r.retenue).toBe(sansAbsence.net);
    expect(r.joursActivite).toBe(sansAbsence.joursActivite - 1);
    expect(r.alerts.join(' ')).toMatch(/4 jours ouvrables au plus.*retenu comme une absence non payée/);
    expect(declarationLines(makeCtx(c, [], [ev('2026-10-05', '2026-10-09', 'mariage')], '2026-12-31'), r).find((l) => l.label === 'Salaire net')!.value).not.toMatch(/à confirmer/);
  });

  it('jour de plus de 600 km saisi en congé sans solde : retenu (« 1 jour ouvrable supplémentaire, non rémunéré »)', () => {
    const r = mois([ev('2026-10-05', '2026-10-08', 'mariage'), { id: 's', type: 'sans_solde', from: '2026-10-09', to: '2026-10-09' }]);
    expect(r.retenue).toBeGreaterThan(0);
  });

  it('événement saisi avec l’app en ligne (sans nature ni durée) : payé comme avant (décision du DG du 21/11/2026)', () => {
    const leaves = [ev('2026-10-05', '2026-10-05')];
    const r = mois(leaves);
    expect(r.retenue).toBe(0);
    expect(r.net).toBe(sansAbsence.net);
    expect(r.alerts.join(' ')).not.toMatch(/durée|Événement familial/);
  });

  it('annonce d’un handicap le 02/03/2026 : 5 jours (avant la loi du 12 juin 2026) ; le 15/06/2026 : 10 jours', () => {
    // Du lundi 02/03 au jeudi 12/03 : 10 jours ouvrables (le samedi 07/03 compte). Au-delà de 5 : 4 jours prévus retenus.
    const mars = mois([ev('2026-03-02', '2026-03-12', 'handicap_enfant')], '2026-03');
    expect(mars.retenue).toBeGreaterThan(0);
    expect(mars.joursActivite).toBe(mois([], '2026-03').joursActivite - 4);
    // Du lundi 15/06 au jeudi 25/06 : 10 jours ouvrables, tous dans la durée.
    expect(mois([ev('2026-06-15', '2026-06-25', 'handicap_enfant')], '2026-06').retenue).toBe(0);
  });

  it('congé de deuil (T-103, C9) : 8 jours ouvrables, salaire maintenu moins les indemnités journalières saisies', () => {
    const l = ev('2026-10-05', '2026-10-06', 'deuil');
    const r = mois([{ ...l, ijSecu: 5000 }]);
    expect(r.nonGere).toEqual([]);
    expect(r.ijDeduites).toBe(5000);
    expect(r.net).toBe(sansAbsence.net - 5000);
  });

  it('avant le 01/05/2024 (T-103, C6) : version de 2022 de 48.1.3.1.1, payé sans réserve', () => {
    const r = computeMonth(makeCtx(contract({ start: '2023-09-04', trackedFrom: '2023-09-04' }), [], [ev('2024-03-04', '2024-03-04', 'naissance')], '2024-12-31'), '2024-03');
    expect(r.retenue).toBe(0);
  });
});

describe('T-017 indemnité kilométrique (CCN art. 57 et 113)', () => {
  // Barème de l'administration, 5 CV et moins : 0,32 / 0,40 / 0,23 € (arrêté du 14 mars 2022, dès le 01/01/2022) ;
  // 0,33 / 0,41 / 0,24 € (arrêté du 29 mai 2026, du 01/06 au 31/12/2026). Barème fiscal 5 CV : d × 0,636 jusqu'à 5 000 km ;
  // (d × 0,357) + 1 395 € de 5 001 à 20 000 km ; d × 0,427 au-delà ; + 20 % pour une voiture électrique (CGI ann. IV art. 6 B, II).
  it('puissance fiscale non renseignée : contrôle impossible, dit quoi renseigner', () => {
    const k = controleKm(undefined, 41, '2026-10-01');
    expect(k.niveau).toBe('impossible');
    expect(k.messages[0]).toMatch(/renseigne la puissance fiscale/);
  });
  it('0,20 € en 5 CV : sous le plancher pour toutes les tranches (au moins 0,23 €) → alerte certaine', () => {
    const k = controleKm(5, 20, '2026-03-10');
    expect(k.niveau).toBe('alerte');
    expect(k.messages[0]).toMatch(/0,23 €/);
  });
  it('0,35 € en 5 CV avant juin 2026 : sous 0,40 € seulement de 2 001 à 10 000 km → à vérifier avec la tranche', () => {
    const k = controleKm(5, 35, '2026-03-10');
    expect(k.niveau).toBe('a_verifier');
    expect(k.messages.join(' ')).toMatch(/de 2 001 à 10 000 km \(0,40 €\)/);
  });
  it('barème majoré du 01/06/2026 : 0,24 € n’est plus sous le plancher de la 3e tranche, il l’est sous 0,33 et 0,41', () => {
    const k = controleKm(5, 24, '2026-07-10');
    expect(k.niveau).toBe('a_verifier');
    expect(k.messages.join(' ')).toMatch(/jusqu’à 2 000 km \(0,33 €\) ou de 2 001 à 10 000 km \(0,41 €\)/);
  });
  it('0,64 € en 5 CV : au-dessus de 0,636 €, sauf voiture électrique (+ 20 %) → à vérifier', () => {
    const k = controleKm(5, 64, '2026-10-01');
    expect(k.niveau).toBe('a_verifier');
    expect(k.messages.join(' ')).toMatch(/électrique/);
  });
  it('0,80 € en 5 CV : au-dessus de 0,636 × 1,2 pour toutes les tranches → alerte certaine', () => {
    expect(controleKm(5, 80, '2026-10-01').niveau).toBe('alerte');
  });
  it('0,50 € en 5 CV : au-dessus du barème fiscal dès 9 756 km dans l’année ((d × 0,357) + 1 395 € < d × 0,50)', () => {
    const k = controleKm(5, 50, '2026-10-01');
    expect(k.niveau).toBe('a_verifier');
    expect(k.messages.join(' ')).toMatch(/9.756 km/);
  });
  it('T-033 : après le 31/12/2026, barème de base de l’arrêté du 3 juillet 2006 (sans date de fin) et avertissement de suivi', () => {
    // 5 CV, 0,41 € : au moins 0,40 € (plus haut taux du barème de base, de 2 001 à 10 000 km) ; au plus le coût moyen
    // fiscal le plus bas, (20 000 × 0,357 + 1 395) ÷ 20 000 = 0,42675 € : conforme pour toute distance.
    const k = controleKm(5, 41, '2027-02-01');
    expect(k.niveau).toBe('ok');
    expect(k.messages).toEqual([SUIVI_ARRETES]);
    expect(controleKm(5, 22, '2027-02-01').niveau).toBe('alerte'); // 0,22 € < 0,23 €, sous toutes les tranches
    // L'arrêté du 29 mai 2026 ne vaut que jusqu'au 31/12/2026 : 0,40 € en 5 CV est sous 0,41 € en décembre 2026
    expect(controleKm(5, 40, '2026-12-31').niveau).toBe('a_verifier');
    expect(controleKm(5, 40, '2027-01-01').niveau).toBe('ok');
  });

  const c = contract({ kmTaux: 41 });
  const rec = (date: string, r: Partial<DayRec>): DayRec => ({ key: `c1|${date}`, cid: 'c1', date, ...r });
  it('art. 113 : 12 km demandés par plusieurs familles, 3 enfants transportés → un tiers de 12 × 0,41 € pour cet accueil', () => {
    // T-025 C-2 : `kmPartage: true` ajouté. Le prorata ne s'applique que « Lorsque plusieurs particuliers employeurs sont demandeurs ».
    const r = computeMonth(makeCtx({ ...c, kmCv: 5 }, [rec('2026-10-05', { km: 12, kmPartage: true, kmEnfants: 3 })], [], '2026-11-01'), '2026-10');
    expect(r.km).toBe(164); // 4,92 € ÷ 3 = 1,64 €
  });
  it('art. 113 : km sans les réponses sur le trajet → le mois demande la donnée (T-103, K1), jamais payés en entier par défaut', () => {
    const ctx = makeCtx(c, [rec('2026-10-05', { km: 12 })], [], '2026-11-01');
    const r = computeMonth(ctx, '2026-10');
    expect(r.km).toBe(0);
    expect(r.nonGere.join(' ')).toMatch(/Frais kilométriques du 05\/10 : indique si une autre famille a aussi demandé ce trajet/);
  });
});

describe('T-025 C-1 : durée d’un événement familial comptée par événement, pas par absence saisie', () => {
  // CCN 48.1.3.1.1 (en vigueur étendu, relu le 18/11/2026) : « 4 jours ouvrables pour son mariage » ; « 3 jours ouvrables
  // pour le décès […] d'un frère ou d'une sœur » ; « Ces congés sont pris au moment de l'événement ou, en accord avec le
  // particulier employeur, dans les jours qui entourent l'événement. » Octobre 2026 : aucun jour férié.
  const c = contract({ start: '2025-09-01', trackedFrom: '2025-09-01' });
  let id = 0;
  // Saisies d'avant (avec nature) : le chargement pose le lien « suite de » selon l'ancienne règle, puis retire la nature
  // (décision du DG du 21/11/2026). Les résultats sont ceux d'avant.
  const ev = (from: string, to: string, nature: NatureEvenement): AbsenceLue => ({ id: `e${++id}`, type: 'evenement', from, to, nature });
  const mois = (leaves: AbsenceLue[], m = '2026-10') => computeMonth(makeCtx(c, [], normaliserAbsences(leaves), '2026-12-31'), m);
  const sansAbsence = mois([]);

  it('mariage saisi en deux absences (05-06/10 puis 07-09/10) : 4 jours payés, le 5e retenu, comme en une seule saisie', () => {
    const une = mois([ev('2026-10-05', '2026-10-09', 'mariage')]);
    const deux = mois([ev('2026-10-05', '2026-10-06', 'mariage'), ev('2026-10-07', '2026-10-09', 'mariage')]);
    expect(deux.retenue).toBeGreaterThan(0);
    expect(deux.retenue).toBe(une.retenue);
    expect(deux.net).toBe(une.net);
    expect(deux.joursActivite).toBe(sansAbsence.joursActivite - 1);
    expect(deux.alerts.join(' ')).toMatch(/en comptant l’absence saisie/);
  });

  it('mariage du jeudi 08/10 au vendredi 09/10 puis du lundi 12/10 au mardi 13/10 : le samedi compte comme en une saisie, le 13/10 retenu', () => {
    // Jours ouvrables comptés : 08, 09, samedi 10, 12 → 4 ; le 13/10 dépasse.
    const deux = mois([ev('2026-10-08', '2026-10-09', 'mariage'), ev('2026-10-12', '2026-10-13', 'mariage')]);
    const une = mois([ev('2026-10-08', '2026-10-13', 'mariage')]);
    expect(deux.retenue).toBe(une.retenue);
    expect(deux.joursActivite).toBe(sansAbsence.joursActivite - 1);
  });

  it('deux décès d’un proche à 12 jours d’écart, reliés (ancienne saisie) : la seconde absence dépasse la durée, retenue avec la raison', () => {
    // 05-07/10 : 3 jours ouvrables, payés. 19-21/10 : même nature, 12 jours après → reliée par l'ancienne règle (l'AM peut
    // supprimer le lien en ressaisissant) ; T-103 : retenue, la raison est dite.
    const r = mois([ev('2026-10-05', '2026-10-07', 'deces_proche'), ev('2026-10-19', '2026-10-21', 'deces_proche')]);
    expect(r.retenue).toBeGreaterThan(0);
    expect(r.joursActivite).toBe(sansAbsence.joursActivite - 3);
    expect(r.alerts.join(' ')).toMatch(/en comptant l’absence saisie/);
  });

  it('deux décès d’un proche à plus de 15 jours d’écart : deux événements, chacun ses 3 jours payés', () => {
    const r = mois([ev('2026-09-07', '2026-09-09', 'deces_proche'), ev('2026-10-05', '2026-10-07', 'deces_proche')]);
    expect(r.net).toBe(sansAbsence.net);
  });

  it('natures différentes (naissance puis mariage) : pas reliées', () => {
    const r = mois([ev('2026-10-05', '2026-10-07', 'naissance'), ev('2026-10-08', '2026-10-09', 'mariage')]);
    // Chacun dans sa propre durée (naissance 3 jours, mariage 4 jours) : tout est payé.
    expect(r.retenue).toBe(0);
    expect(r.nonGere).toEqual([]);
  });
});

describe('T-025 C-4 : férié chômé pendant un congé pour événement familial', () => {
  // CCN 48.1.3.1.1 : « 4 jours ouvrables pour son mariage » ; le texte ne dit pas si un férié compte dans ces jours.
  // CCN 47.2 : le férié chômé d'un jour habituellement travaillé ouvre droit au maintien de la rémunération, « sauf
  // autorisation d'absence préalablement accordée » (l'événement familial en est une). Lu le 18/11/2026.
  // Novembre 2026 : mercredi 11/11 férié.
  const c = contract({ start: '2025-09-01', trackedFrom: '2025-09-01' });
  const ev = (from: string, to: string): AmLeave => normaliserAbsence({ id: 'm', type: 'evenement', from, to, nature: 'mariage' });
  const mois = (leaves: AmLeave[]) => computeMonth(makeCtx(c, [], leaves, '2026-12-31'), '2026-11');
  const sansAbsence = mois([]);

  it('mariage du lundi 09/11 au vendredi 13/11 (T-103, C7) : le 11/11 férié ne compte pas, le congé couvre le 13/11 : tout payé', () => {
    // CCN 48, liminaire : jours ouvrables hors fériés chômés ; L3142-4 : jours ouvrables. 09, 10, 12, 13 = 4 jours.
    const r = mois([ev('2026-11-09', '2026-11-13')]);
    expect(r.retenue).toBe(0);
    expect(r.net).toBe(sansAbsence.net);
  });

  it('mariage du lundi 09/11 au jeudi 12/11 : 4 jours ouvrables même en comptant le férié → tout payé', () => {
    const r = mois([ev('2026-11-09', '2026-11-12')]);
    expect(r.net).toBe(sansAbsence.net);
    expect(r.joursActivite).toBe(sansAbsence.joursActivite);
  });
});

describe('T-025 C-2 : partage des km seulement si plusieurs employeurs demandent le trajet (CCN art. 113)', () => {
  // Art. 113, lu en entier le 18/11/2026 : al. 2 « Si le particulier employeur demande à l'assistant maternel […] d'utiliser
  // son véhicule personnel afin de transporter l'enfant accueilli, une indemnité […] est alors versée […] conformément
  // aux dispositions prévues à l'article 57 » ; al. 3 « Lorsque plusieurs particuliers employeurs sont demandeurs de
  // déplacements, l'indemnité due par chacun d'entre eux est déterminée au prorata du nombre d'enfants transportés. »
  const c = contract({ kmTaux: 41, kmCv: 5 });
  const rec = (date: string, r: Partial<DayRec>): DayRec => ({ key: `c1|${date}`, cid: 'c1', date, ...r });
  const mois = (r: Partial<DayRec>) => computeMonth(makeCtx(c, [rec('2026-10-05', { km: 12, ...r })], [], '2026-11-01'), '2026-10');

  it('un seul employeur demandeur, l’enfant de l’AM aussi à bord : pas de division, 12 × 0,41 € = 4,92 €', () => {
    const r = mois({ kmPartage: false });
    expect(r.km).toBe(492);
  });
  it('plusieurs employeurs demandeurs, 2 enfants transportés : moitié, 2,46 €', () => {
    expect(mois({ kmPartage: true, kmEnfants: 2 }).km).toBe(246);
  });
  it('plusieurs employeurs demandeurs sans le nombre d’enfants (ou moins de 2) : le mois demande la donnée (T-103, K1)', () => {
    for (const r of [mois({ kmPartage: true }), mois({ kmPartage: true, kmEnfants: 1 })]) {
      expect(r.km).toBe(0);
      expect(r.nonGere.join(' ')).toMatch(/combien d’enfants étaient dans la voiture/);
    }
  });
  it('saisie d’avant T-025 avec 2 enfants, sans dire qui a demandé le trajet : le mois demande la donnée, jamais divisé en silence', () => {
    const r = mois({ kmEnfants: 2 });
    expect(r.km).toBe(0);
    expect(r.nonGere.join(' ')).toMatch(/une autre famille a aussi demandé ce trajet/);
  });
  it('saisie d’avant T-025 avec 1 seul enfant : une seule famille demandeuse possible, indemnité entière', () => {
    expect(mois({ kmEnfants: 1 }).km).toBe(492);
  });
});

describe('T-025 C-3 : minimum horaire brut = le plus haut de la grille et de 0,281 × SMIC (CASF D423-9)', () => {
  // CASF D423-9 (en vigueur depuis le 01/05/2008, lu le 18/11/2026) : « ne peut être inférieure à 0,281 fois le montant
  // du salaire minimum de croissance par enfant et par heure d'accueil ». Annexe 5, art. 2 : la grille s'applique « dès
  // lors qu'elles sont au moins aussi favorables » que le minimum statutaire. SMIC : arrêtés du 19/04/2022 (10,85 €)
  // et du 29/07/2022 (11,07 €), décret du 22/12/2021 (10,57 €). Grille : 2,97 € puis 3,06 € (avenant n° 1, 01/07/2022).
  it('mai-juin 2022 : 0,281 × 10,85 € = 3,04885 € → 3,05 € dans toute lecture de l’arrondi, au-dessus de 2,97 €', () => {
    const m = minimumBrut('2022-05-15')!;
    expect(m.certain).toBe(305);
    expect(m.source).toBe('legal');
  });
  it('août 2022 : 0,281 × 11,07 € = 3,11067 € → 3,12 € (T-103, D3 : un taux de 3,11 € est inférieur au minimum)', () => {
    const m = minimumBrut('2022-08-15')!;
    expect(m.certain).toBe(312);
  });
  it('janvier-avril 2022 : 0,281 × 10,57 € = 2,97017 € → 2,98 €, au-dessus de la grille de 2,97 € (T-103, D3)', () => {
    const m = minimumBrut('2022-03-15')!;
    expect(m.certain).toBe(298);
    expect(m.source).toBe('legal');
  });
  it('juillet 2022 : grille de 3,06 € au-dessus de 3,04885 € ; octobre 2026 : grille de 4,20 € au-dessus de 0,281 × 12,31 €', () => {
    expect(minimumBrut('2022-07-15')).toMatchObject({ certain: 306, source: 'grille' });
    expect(minimumBrut('2026-10-15')).toMatchObject({ certain: 420, source: 'grille' });
  });
  it('contrôle d’un bulletin de juin 2022 : le repère donné est 3,05 € (minimum légal), pas 2,97 €', () => {
    const c = contract({ start: '2022-01-03', trackedFrom: '2022-01-03', rateNet: 240 });
    const r = computeMonth(makeCtx(c, [], [], '2022-07-31'), '2022-06');
    const b: Bulletin = { id: 'b', cid: 'c1', month: '2022-06', source: 'manuel' };
    expect(controle(b, r, 240).find((x) => x.title === 'Minimum net non contrôlé')?.detail).toMatch(/3,05 € brut \(minimum légal/);
  });
  it('contrôle d’un bulletin de mai 2022 à 3,00 € brut de l’heure : alerte « sous le minimum » (3,05 €), que la grille seule ne donnait pas', () => {
    // T-103 (D1) : le taux brut du contrat (3,00 €) est comparé au minimum, sans estimation.
    const c = contract({ start: '2022-01-03', trackedFrom: '2022-01-03', rateNet: 234, rateBrut: 300 });
    const r = computeMonth(makeCtx(c, [], [], '2022-07-31'), '2022-05');
    const b: Bulletin = { id: 'b', cid: 'c1', month: '2022-05', source: 'manuel', heures: 100, brut: 30000, net: r.netTotal };
    expect(controle(b, r, 234, 'metropole', 300).find((x) => x.title === 'Brut horaire sous le minimum')?.detail).toMatch(/3,05 €/);
  });
});

describe('T-103 : une ancienne saisie d’événement sans durée (0) refuse le mois et dit quoi faire, jamais « à confirmer »', () => {
  // Décision du DG du 24/11/2026 : plus aucun montant en suspens. Une saisie que l'app ne sait pas lire : refus clair (B).
  const c = contract({ start: '2025-06-01', trackedFrom: '2025-06-01' });
  const sansDuree: AmLeave = { id: 'x', type: 'evenement', from: '2026-03-02', to: '2026-03-02', joursEvenement: 0 };
  it('mois refusé avec la consigne de ressaisie', () => {
    const r = computeMonth(makeCtx(c, [], [sansDuree], '2026-10-31'), '2026-03');
    expect(r.nonGere.join(' ')).toMatch(/saisie ancienne sans durée.*saisis-la de nouveau/);
  });
  it('page des parents : rien « à confirmer »', () => {
    const snap = buildSnapshot({ ctx: makeCtx(c, [], [sansDuree], '2026-04-10'), journal: [], amName: 'Ana', enfants: 0, now: 1 });
    expect(JSON.stringify(snap.mois.find((x) => x.month === '2026-03') ?? {})).not.toMatch(/à confirmer/);
  });
});

describe('T-025 C-6 : valeur du repas fourni (avantage en nature) seulement si lue à une source admise', () => {
  // urssaf.fr, page « Avantages en nature » lue le 18/11/2026 : « Montant de l'avantage en 2026 : 1 repas 5,50 € ».
  // Aucune valeur 2025 sur une source admise : non comptée, et dit à l'AM.
  it('2026 : 5,50 € ; 2025 : valeur absente, repas non comptés et signalés', () => {
    expect(ratesAt('2026-03-01')!.repasAvantage).toBe(550);
    expect(ratesAt('2025-06-01')!.repasAvantage).toBeUndefined();
    const c = contract({ start: '2025-01-06', trackedFrom: '2025-01-06', repasParents: true });
    const f = fiscalYear(makeCtx(c, [], [], '2025-12-31'), 2025);
    expect(f.nonGere).toMatch(/valeur officielle du repas pour cette année n’est pas dans l’app/);
  });
});

describe('T-025 C-7, revu par la T-103 (K1) : ancienne saisie de km incomplète', () => {
  const c = contract({ start: '2025-09-01', trackedFrom: '2025-09-01', kmTaux: 41, kmCv: 5 });
  it('mois terminé ou en cours : le mois attend les réponses, aucun montant « à confirmer »', () => {
    const km: DayRec = { key: 'c1|2026-10-05', cid: 'c1', date: '2026-10-05', km: 10 };
    const r = computeMonth(makeCtx(c, [km], [], '2026-11-15'), '2026-10');
    expect(r.nonGere.join(' ')).toMatch(/Frais kilométriques du 05\/10/);
    expect(r.alerts.join(' ')).not.toMatch(/à confirmer/);
  });
});
