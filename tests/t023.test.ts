// T-023 et T-017 : corrections du moteur A (brief M2, rapport projet/moteur/correctifs-t023.md).
// Chaque attendu vient d'un texte relu à la source le 18/11/2026 (cité dans chaque test) ou d'un cas officiel
// de tests/cas-officiels-v0.md. Aucun attendu n'est tiré du code.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Bulletin, Contract, NatureEvenement, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { computeMonth, declarationLines, declarationText } from '../src/engine/month';
import { dureeEvenement } from '../src/engine/evenements';
import { controleKm, SUIVI_ARRETES } from '../src/engine/km';
import type { DayRec } from '../src/engine/model';
import { controle } from '../src/engine/controle';
import { fiscalYear } from '../src/engine/fiscal';
import { finDeContrat } from '../src/engine/fin';
import { indemnite } from '../src/engine/conges';
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

  it('contrôle d’un bulletin de février 2025 : minimum de 3,50 € brut, pas de repère net supposé', () => {
    const c = contract({ start: '2024-09-02', trackedFrom: '2024-09-02', rateNet: 270 });
    const r = computeMonth(makeCtx(c, [], [], '2025-03-31'), '2025-02');
    const b: Bulletin = { id: 'b', cid: 'c1', month: '2025-02', source: 'manuel' };
    const checks = controle(b, r, 270);
    expect(checks.some((x) => x.title === 'Taux du contrat sous le minimum')).toBe(false);
    expect(checks.find((x) => x.title === 'Minimum net non contrôlé')?.detail).toMatch(/3,50/);
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
  const ev = (from: string, to: string, nature?: NatureEvenement): AmLeave => ({ id: 'e', type: 'evenement', from, to, ...(nature ? { nature } : {}) });
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
    // Art. 48.1.3.1.2 et 48.1.3.1.3 : congé de deuil indemnisé par la sécurité sociale, maintien sous déduction des IJ : non géré
    expect(dureeEvenement('deuil', '2026-10-05')).toBeUndefined();
  });

  it('T-033 : durées avant le 21/07/2023 (L3142-4 version du 19/12/2021 et CCN 48.1.3.1.1 version remplacée)', () => {
    // L3142-4 4° « Cinq jours pour le décès d'un enfant » ; CCN remplacée « 5 jours ouvrables pour le décès d'un enfant »
    expect(dureeEvenement('deces_enfant', '2022-06-01')).toBe(5);
    expect(dureeEvenement('deces_enfant', '2023-07-20')).toBe(5);
    expect(dureeEvenement('deces_enfant', '2023-07-21')).toBe(12); // loi n° 2023-622 : « Douze jours »
    // « sept jours ouvrés » (loi) contre « 9 jours ouvrables » (CCN) : comparaison d'unités non écrite → non géré
    expect(dureeEvenement('deces_enfant_14', '2023-07-20')).toBeUndefined();
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

  it('T-033 : la paie d’un événement avant le 01/05/2024 reste « à confirmer »', () => {
    const c22 = contract({ start: '2022-01-03', trackedFrom: '2022-01-03' });
    const r = computeMonth(makeCtx(c22, [], [ev('2022-06-07', '2022-06-08', 'deces_enfant')], '2022-12-31'), '2022-06');
    expect(r.nonGere).toEqual([]);
    expect(r.evenementAConfirmer).toBeGreaterThan(0);
  });

  it('mariage dans la durée (4 jours ouvrables du lundi au jeudi) : payé, « pas de réduction de la rémunération »', () => {
    const r = mois([ev('2026-10-05', '2026-10-08', 'mariage')]);
    expect(r.evenementAConfirmer).toBe(0);
    expect(r.retenue).toBe(0);
    expect(r.net).toBe(sansAbsence.net);
  });

  it('mariage saisi sur 5 jours ouvrables : le 5e n’est ni payé ni retenu, il est à confirmer', () => {
    const r = mois([ev('2026-10-05', '2026-10-09', 'mariage')]);
    expect(r.evenementAConfirmer).toBeGreaterThan(0);
    expect(r.retenue).toBe(0);
    expect(r.net + r.evenementAConfirmer).toBe(sansAbsence.net);
    expect(r.joursActivite).toBe(sansAbsence.joursActivite - 1);
    expect(r.alerts.join(' ')).toMatch(/4 jours ouvrables au plus/);
    expect(declarationLines(makeCtx(c, [], [ev('2026-10-05', '2026-10-09', 'mariage')], '2026-12-31'), r).find((l) => l.label === 'Salaire net')!.value).toMatch(/événement familial à confirmer/);
  });

  it('jour de plus de 600 km saisi en congé sans solde : retenu (« 1 jour ouvrable supplémentaire, non rémunéré »)', () => {
    const r = mois([ev('2026-10-05', '2026-10-08', 'mariage'), { id: 's', type: 'sans_solde', from: '2026-10-09', to: '2026-10-09' }]);
    expect(r.evenementAConfirmer).toBe(0);
    expect(r.retenue).toBeGreaterThan(0);
  });

  it('événement déjà saisi sans nature : à confirmer, ni payé ni retenu en silence', () => {
    const leaves = [ev('2026-10-05', '2026-10-05')];
    const r = mois(leaves);
    expect(r.evenementAConfirmer).toBeGreaterThan(0);
    expect(r.retenue).toBe(0);
    expect(r.alerts.join(' ')).toMatch(/nature de l’événement n’est pas renseignée/);
    expect(declarationText(makeCtx(c, [], leaves, '2026-12-31'), r, 'Ana')).toMatch(/sans l’événement familial à confirmer/);
  });

  it('annonce d’un handicap le 02/03/2026 : 5 jours (avant la loi du 12 juin 2026) ; le 15/06/2026 : 10 jours', () => {
    // Du lundi 02/03 au jeudi 12/03 : 10 jours ouvrables (le samedi 07/03 compte). Au-delà de 5 : 4 jours prévus à confirmer.
    const mars = mois([ev('2026-03-02', '2026-03-12', 'handicap_enfant')], '2026-03');
    expect(mars.evenementAConfirmer).toBeGreaterThan(0);
    expect(mars.joursActivite).toBe(mois([], '2026-03').joursActivite - 4);
    // Du lundi 15/06 au jeudi 25/06 : 10 jours ouvrables, tous dans la durée.
    expect(mois([ev('2026-06-15', '2026-06-25', 'handicap_enfant')], '2026-06').evenementAConfirmer).toBe(0);
  });

  it('congé de deuil : art. 48.1.3.1.3 non géré, à confirmer', () => {
    const r = mois([ev('2026-10-05', '2026-10-06', 'deuil')]);
    expect(r.evenementAConfirmer).toBeGreaterThan(0);
    expect(r.alerts.join(' ')).toMatch(/48\.1\.3\.1\.3/);
  });

  it('avant le 01/05/2024 : version de 48.1.3.1.1 non tranchée (avenant n° 4), à confirmer', () => {
    const r = computeMonth(makeCtx(contract({ start: '2023-09-04', trackedFrom: '2023-09-04' }), [], [ev('2024-03-04', '2024-03-04', 'naissance')], '2024-12-31'), '2024-03');
    expect(r.evenementAConfirmer).toBeGreaterThan(0);
    expect(r.alerts.join(' ')).toMatch(/période non gérée/);
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
    expect(r.kmAConfirmer).toBe(0);
  });
  it('art. 113 : km sans le nombre d’enfants → non payés, « à confirmer », jamais en entier par défaut', () => {
    const ctx = makeCtx(c, [rec('2026-10-05', { km: 12 })], [], '2026-11-01');
    const r = computeMonth(ctx, '2026-10');
    expect(r.km).toBe(0);
    expect(r.kmAConfirmer).toBe(12);
    expect(declarationLines(ctx, r).find((l) => l.label === 'Frais kilométriques')!.value).toMatch(/12 km à confirmer/);
    // Puissance non renseignée sur ce contrat : le contrôle du tarif le signale
    expect(r.alerts.join(' ')).toMatch(/renseigne la puissance fiscale/);
  });
});

describe('T-025 C-1 : durée d’un événement familial comptée par événement, pas par absence saisie', () => {
  // CCN 48.1.3.1.1 (en vigueur étendu, relu le 18/11/2026) : « 4 jours ouvrables pour son mariage » ; « 3 jours ouvrables
  // pour le décès […] d'un frère ou d'une sœur » ; « Ces congés sont pris au moment de l'événement ou, en accord avec le
  // particulier employeur, dans les jours qui entourent l'événement. » Octobre 2026 : aucun jour férié.
  const c = contract({ start: '2025-09-01', trackedFrom: '2025-09-01' });
  let id = 0;
  const ev = (from: string, to: string, nature: NatureEvenement): AmLeave => ({ id: `e${++id}`, type: 'evenement', from, to, nature });
  const mois = (leaves: AmLeave[], m = '2026-10') => computeMonth(makeCtx(c, [], leaves, '2026-12-31'), m);
  const sansAbsence = mois([]);

  it('mariage saisi en deux absences (05-06/10 puis 07-09/10) : 4 jours payés, le 5e à confirmer, comme en une seule saisie', () => {
    const une = mois([ev('2026-10-05', '2026-10-09', 'mariage')]);
    const deux = mois([ev('2026-10-05', '2026-10-06', 'mariage'), ev('2026-10-07', '2026-10-09', 'mariage')]);
    expect(deux.retenue).toBe(0);
    expect(deux.evenementAConfirmer).toBeGreaterThan(0);
    expect(deux.evenementAConfirmer).toBe(une.evenementAConfirmer);
    expect(deux.net).toBe(une.net);
    expect(deux.joursActivite).toBe(sansAbsence.joursActivite - 1);
    expect(deux.alerts.join(' ')).toMatch(/autre absence pour le même type d’événement/);
  });

  it('mariage du jeudi 08/10 au vendredi 09/10 puis du lundi 12/10 au mardi 13/10 : le samedi compte comme en une saisie, le 13/10 à confirmer', () => {
    // Jours ouvrables comptés : 08, 09, samedi 10, 12 → 4 ; le 13/10 dépasse.
    const deux = mois([ev('2026-10-08', '2026-10-09', 'mariage'), ev('2026-10-12', '2026-10-13', 'mariage')]);
    const une = mois([ev('2026-10-08', '2026-10-13', 'mariage')]);
    expect(deux.evenementAConfirmer).toBe(une.evenementAConfirmer);
    expect(deux.joursActivite).toBe(sansAbsence.joursActivite - 1);
  });

  it('deux décès d’un proche à 12 jours d’écart : la seconde absence est à confirmer (même événement ou non), jamais payée en silence', () => {
    // 05-07/10 : 3 jours ouvrables, payés. 19-21/10 : même nature, 12 jours après → reliée ; à confirmer.
    const r = mois([ev('2026-10-05', '2026-10-07', 'deces_proche'), ev('2026-10-19', '2026-10-21', 'deces_proche')]);
    expect(r.retenue).toBe(0);
    expect(r.joursActivite).toBe(sansAbsence.joursActivite - 3);
    expect(r.alerts.join(' ')).toMatch(/si c’est un autre événement, il est dû/);
  });

  it('deux décès d’un proche à plus de 15 jours d’écart : deux événements, chacun ses 3 jours payés', () => {
    const r = mois([ev('2026-09-07', '2026-09-09', 'deces_proche'), ev('2026-10-05', '2026-10-07', 'deces_proche')]);
    expect(r.evenementAConfirmer).toBe(0);
    expect(r.net).toBe(sansAbsence.net);
  });

  it('natures différentes (naissance puis mariage) : pas reliées', () => {
    const r = mois([ev('2026-10-05', '2026-10-07', 'naissance'), ev('2026-10-08', '2026-10-09', 'mariage')]);
    expect(r.evenementAConfirmer).toBe(0);
  });
});

describe('T-025 C-4 : férié chômé pendant un congé pour événement familial', () => {
  // CCN 48.1.3.1.1 : « 4 jours ouvrables pour son mariage » ; le texte ne dit pas si un férié compte dans ces jours.
  // CCN 47.2 : le férié chômé d'un jour habituellement travaillé ouvre droit au maintien de la rémunération, « sauf
  // autorisation d'absence préalablement accordée » (l'événement familial en est une). Lu le 18/11/2026.
  // Novembre 2026 : mercredi 11/11 férié.
  const c = contract({ start: '2025-09-01', trackedFrom: '2025-09-01' });
  const ev = (from: string, to: string): AmLeave => ({ id: 'm', type: 'evenement', from, to, nature: 'mariage' });
  const mois = (leaves: AmLeave[]) => computeMonth(makeCtx(c, [], leaves, '2026-12-31'), '2026-11');
  const sansAbsence = mois([]);

  it('mariage du lundi 09/11 au vendredi 13/11 : le 11/11 est payé (dû dans les deux lectures), le 13/11 est à confirmer', () => {
    const r = mois([ev('2026-11-09', '2026-11-13')]);
    expect(r.retenue).toBe(0);
    // Un seul jour à confirmer (le 13/11) : le salaire de ce jour sort du total, rien d'autre.
    expect(r.joursActivite).toBe(sansAbsence.joursActivite - 1);
    expect(r.net + r.evenementAConfirmer).toBe(sansAbsence.net);
    expect(r.alerts.join(' ')).toMatch(/un jour férié tombe pendant le congé/);
  });

  it('mariage du lundi 09/11 au jeudi 12/11 : 4 jours ouvrables même en comptant le férié → tout payé', () => {
    const r = mois([ev('2026-11-09', '2026-11-12')]);
    expect(r.evenementAConfirmer).toBe(0);
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
    expect(r.kmAConfirmer).toBe(0);
  });
  it('plusieurs employeurs demandeurs, 2 enfants transportés : moitié, 2,46 €', () => {
    expect(mois({ kmPartage: true, kmEnfants: 2 }).km).toBe(246);
  });
  it('plusieurs employeurs demandeurs sans le nombre d’enfants (ou moins de 2) : à confirmer, rien payé', () => {
    for (const r of [mois({ kmPartage: true }), mois({ kmPartage: true, kmEnfants: 1 })]) {
      expect(r.km).toBe(0);
      expect(r.kmAConfirmer).toBe(12);
    }
  });
  it('saisie d’avant T-025 avec 2 enfants, sans dire qui a demandé le trajet : à confirmer, jamais divisé en silence', () => {
    const r = mois({ kmEnfants: 2 });
    expect(r.km).toBe(0);
    expect(r.kmAConfirmer).toBe(12);
    expect(r.alerts.join(' ')).toMatch(/une autre famille a aussi demandé le trajet/);
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
    expect(m.doute).toBeUndefined();
    expect(m.source).toBe('legal');
  });
  it('août 2022 : 0,281 × 11,07 € = 3,11067 € → 3,11 € certain, 3,12 € si arrondi au centime supérieur', () => {
    const m = minimumBrut('2022-08-15')!;
    expect(m.certain).toBe(311);
    expect(m.doute).toBe(312);
  });
  it('janvier-avril 2022 : 0,281 × 10,57 € = 2,97017 € : la grille de 2,97 € vaut, 2,98 € si arrondi au centime supérieur', () => {
    const m = minimumBrut('2022-03-15')!;
    expect(m.certain).toBe(297);
    expect(m.doute).toBe(298);
    expect(m.source).toBe('grille');
  });
  it('juillet 2022 : grille de 3,06 € au-dessus de 3,04885 € ; octobre 2026 : grille de 4,20 € au-dessus de 0,281 × 12,31 €', () => {
    expect(minimumBrut('2022-07-15')).toMatchObject({ certain: 306, doute: undefined, source: 'grille' });
    expect(minimumBrut('2026-10-15')).toMatchObject({ certain: 420, doute: undefined, source: 'grille' });
  });
  it('contrôle d’un bulletin de juin 2022 : le repère donné est 3,05 € (minimum légal), pas 2,97 €', () => {
    const c = contract({ start: '2022-01-03', trackedFrom: '2022-01-03', rateNet: 240 });
    const r = computeMonth(makeCtx(c, [], [], '2022-07-31'), '2022-06');
    const b: Bulletin = { id: 'b', cid: 'c1', month: '2022-06', source: 'manuel' };
    expect(controle(b, r, 240).find((x) => x.title === 'Minimum net non contrôlé')?.detail).toMatch(/3,05 € brut \(minimum légal/);
  });
  it('contrôle d’un bulletin de mai 2022 à 3,00 € brut de l’heure : alerte « sous le minimum » (3,05 €), que la grille seule ne donnait pas', () => {
    const c = contract({ start: '2022-01-03', trackedFrom: '2022-01-03', rateNet: 234 });
    const r = computeMonth(makeCtx(c, [], [], '2022-07-31'), '2022-05');
    expect(r.cpIndemnite + r.cpComplement + r.complMin + r.majContratMin + r.majMin).toBe(0);
    const b: Bulletin = { id: 'b', cid: 'c1', month: '2022-05', source: 'manuel', heures: 100, brut: 30000, net: r.netTotal };
    expect(controle(b, r, 234).find((x) => x.title === 'Brut horaire sous le minimum')?.detail).toMatch(/3,05 €/);
  });
});

describe('T-025 C-5 : le salaire d’événement à confirmer n’est retiré en silence d’aucun calcul qui en dépend', () => {
  // CCN 48.1.3.1.1 (lu le 18/11/2026) : « Ces congés n'entraînent pas de réduction de la rémunération. Ils sont assimilés
  // à du temps de travail effectif pour la détermination du droit à congés payés et au titre de l'ancienneté. »
  // Événement saisi sans nature (saisie d'avant T-023) : son salaire est « à confirmer » (T-023 (2)).
  // T-030 : contrat au 1er juin 2025 (période de référence entière) ; une embauche au 1er septembre rend les jours acquis
  // à confirmer (A-23 : 23 jours en mois, 25 en semaines), ce qui masquerait l'effet testé ici.
  const c = contract({ start: '2025-06-01', trackedFrom: '2025-06-01' });
  const sansNature: AmLeave = { id: 'x', type: 'evenement', from: '2026-03-02', to: '2026-03-02' };
  const ctx = (leaves: AmLeave[], t = '2026-10-31') => makeCtx(c, [], leaves, t);

  it('indemnité de rupture (1/80e des salaires) : à confirmer, avec la raison', () => {
    expect(finDeContrat(ctx([]), '2026-10-28', 'retrait').ruptureAConfirmer).toBe(false);
    const f = finDeContrat(ctx([sansNature]), '2026-10-28', 'retrait');
    expect(f.ruptureAConfirmer).toBe(true);
    expect(f.alertes.join(' ')).toMatch(/salaire d’événement familial/);
  });
  it('compteur fiscal : le montant non compté est dit', () => {
    expect(fiscalYear(ctx([sansNature]), 2026).nonGere).toMatch(/Événement familial à confirmer/);
    expect(fiscalYear(ctx([]), 2026).nonGere ?? '').not.toMatch(/Événement familial/);
  });
  it('dixième des congés : si le salaire à confirmer change l’indemnité, elle est à confirmer avec les deux montants', () => {
    // Avenant au 01/05/2026 qui baisse le taux à 3 € net : le maintien de salaire (calculé au taux de juin) passe sous le
    // dixième, qui dépend alors du salaire à confirmer.
    const c2 = contract({ start: '2025-06-01', trackedFrom: '2025-06-01', avenants: [{ id: 'a', from: '2026-05-01', changes: { rateNet: 300 } }] });
    const sans = indemnite(makeCtx(c2, [], [], '2026-10-31'), 2025);
    expect(sans.methode).toBe('dixieme');
    expect(sans.aConfirmer).toBeUndefined();
    const avec = indemnite(makeCtx(c2, [], [sansNature], '2026-10-31'), 2025);
    expect(avec.aConfirmer?.message).toMatch(/salaire d’événement familial encore à confirmer/);
    expect(avec.aConfirmer?.montants.map((x) => x.montant)).toContain(avec.montant);
    expect(avec.aConfirmer?.montants.some((x) => x.montant > avec.montant)).toBe(true);
  });
  it('dixième des congés : si le maintien l’emporte dans les deux cas, rien n’est à confirmer', () => {
    // T-030 : période entière (embauche au 1er juin) ; sans hausse, le dixième d'une année complète passe le maintien.
    // Avenant au 01/05/2026 qui monte le taux à 6 € : le maintien (calculé au taux de juin) l'emporte.
    const c3 = contract({ start: '2025-06-01', trackedFrom: '2025-06-01', avenants: [{ id: 'b', from: '2026-05-01', changes: { rateNet: 600 } }] });
    expect(indemnite(makeCtx(c3, [], [], '2026-10-31'), 2025).methode).toBe('maintien');
    expect(indemnite(makeCtx(c3, [], [sansNature], '2026-10-31'), 2025).aConfirmer).toBeUndefined();
  });
  it('page des parents : le total du mois dit ce qui est sorti du total', () => {
    const snap = buildSnapshot({ ctx: makeCtx(c, [], [sansNature], '2026-04-10'), journal: [], amName: 'Ana', enfants: 0, now: 1 });
    expect(snap.mois.find((x) => x.month === '2026-03')?.aConfirmer).toEqual(['l’événement familial']);
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

describe('T-025 C-7 : mois terminé avec des montants à confirmer (anciennes saisies)', () => {
  // Pas de texte : consigne de l'app (constat C-7 de la relecture T-025). Vérifie seulement que la phrase apparaît
  // sur un mois terminé et pas sur le mois en cours.
  const c = contract({ start: '2025-09-01', trackedFrom: '2025-09-01', kmTaux: 41, kmCv: 5 });
  const sansNature: AmLeave = { id: 'x', type: 'evenement', from: '2026-10-05', to: '2026-10-05' };
  it('mois terminé : la phrase « déjà déclaré à Pajemploi » est ajoutée ; mois en cours : non', () => {
    expect(computeMonth(makeCtx(c, [], [sansNature], '2026-11-15'), '2026-10').alerts.join(' ')).toMatch(/déjà déclaré à Pajemploi/);
    expect(computeMonth(makeCtx(c, [], [sansNature], '2026-10-20'), '2026-10').alerts.join(' ')).not.toMatch(/déjà déclaré à Pajemploi/);
    const km: DayRec = { key: 'c1|2026-10-05', cid: 'c1', date: '2026-10-05', km: 10 };
    expect(computeMonth(makeCtx(c, [km], [], '2026-11-15'), '2026-10').alerts.join(' ')).toMatch(/déjà déclaré à Pajemploi/);
  });
});
