// T-023 et T-017 : corrections du moteur A (brief M2, rapport projet/moteur/correctifs-t023.md).
// Chaque attendu vient d'un texte relu à la source le 18/11/2026 (cité dans chaque test) ou d'un cas officiel
// de tests/cas-officiels-v0.md. Aucun attendu n'est tiré du code.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Bulletin, Contract, NatureEvenement, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { computeMonth, declarationLines, declarationText } from '../src/engine/month';
import { dureeEvenement } from '../src/engine/evenements';
import { controleKm } from '../src/engine/km';
import type { DayRec } from '../src/engine/model';
import { controle } from '../src/engine/controle';
import { fiscalYear } from '../src/engine/fiscal';
import { entretienPlancher, PREMIERE_DATE_GEREE, ratesAt } from '../src/engine/rates';

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
    balances: { cpRestants: 30, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, ...over,
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
  it('après le 31/12/2026 : barèmes à vérifier, aucune valeur supposée', () => {
    const k = controleKm(5, 41, '2027-02-01');
    expect(k.niveau).toBe('a_verifier');
    expect(k.messages.join(' ')).toMatch(/barème de l’administration à vérifier/);
  });

  const c = contract({ kmTaux: 41 });
  const rec = (date: string, r: Partial<DayRec>): DayRec => ({ key: `c1|${date}`, cid: 'c1', date, ...r });
  it('art. 113 : 12 km avec 3 enfants transportés → un tiers de 12 × 0,41 € pour cet accueil', () => {
    const r = computeMonth(makeCtx({ ...c, kmCv: 5 }, [rec('2026-10-05', { km: 12, kmEnfants: 3 })], [], '2026-11-01'), '2026-10');
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
