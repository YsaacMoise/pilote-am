// T-038 : corrections des constats de la relecture V4 (projet/regles/t036-relecture.md). Attendus tirés des textes ou des
// sondes de V4, jamais du code :
// - B-1 (sonde S1 de V4) : un jour « à confirmer » n'est ni payé ni retenu dans son mois ; la régularisation (art. 109.2)
//   ne doit pas verser son salaire en silence. S'il est dû, tout se passe comme sans absence ; s'il ne l'est pas, comme
//   un congé sans solde (absence retenue par la déduction de l'art. 111). Les deux montants sont donnés, rien n'est compté.
// - Art. 111 (déduction d'absence en jours, année incomplète) : 600 € × 2 jours ÷ 22 jours prévus en mars 2026 = 54,55 €.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Contract, Planning } from '../src/engine/model';
import { makeCtx, MESSAGE_MOIS_DEJA_DECLARE, messageMoisSansSoldeChange, monthBase, salaireMensualise } from '../src/engine/payroll';
import { finDeContrat } from '../src/engine/fin';
import { euros } from '../src/engine/money';
import { ratesAt } from '../src/engine/rates';
import { RULES } from '../src/screens/Regles';
import { acquisition } from '../src/engine/conges';
import { libelleDureeSaisie, statutJourEvenement } from '../src/engine/evenements';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}
const lundis = (from: string, n: number) => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7 * i);
  return d.toISOString().slice(0, 10);
});
// 36 semaines (16 semaines sans accueil par année de contrat), 40 h du lundi au vendredi, 5 € net : 600 € par mois (art. 109).
const SEMAINES_OFF = [...lundis('2025-10-20', 2), ...lundis('2025-12-22', 2), ...lundis('2026-02-16', 2), ...lundis('2026-04-13', 2), ...lundis('2026-07-06', 8), '2026-10-19'];
function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2025-09-01', yearType: 'incomplete', weeks: 36, weeksOff: SEMAINES_OFF,
    planning: week('08:00', '16:00'), rateNet: 500, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2025-09-01',
    alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, ...over,
  };
}
// Événement familial sans nature : jours « à confirmer » (statutJourEvenement). Congé sans solde : jours retenus (T-034).
const EVENEMENT: AmLeave = { id: 'e', type: 'evenement', from: '2026-03-10', to: '2026-03-11' };
const SANS_SOLDE: AmLeave = { id: 's', type: 'sans_solde', from: '2026-03-10', to: '2026-03-11' };
const fin = (leaves: AmLeave[], c = contract()) => finDeContrat(makeCtx(c, [], leaves, '2026-11-18'), '2026-10-28', 'retrait');

describe('T-038 B-1 : la régularisation ne verse jamais en silence un salaire « à confirmer »', () => {
  it('mars 2026 : 2 jours d’événement à confirmer, 54,55 € sortis du salaire (art. 111 : 600 × 2 ÷ 22)', () => {
    expect(salaireMensualise(contract())).toBe(60000);
    const b = monthBase(makeCtx(contract(), [], [EVENEMENT], '2026-11-18'), '2026-03');
    expect(b.evenementAConfirmer).toBe(5455);
    expect(b.base).toBe(60000 - 5455);
  });
  it('fin de contrat (sonde S1) : régularisation à confirmer, ni comptée ni donnée, avec les deux lectures', () => {
    const sans = fin([]);
    const retenu = fin([SANS_SOLDE]);
    const f = fin([EVENEMENT]);
    expect(sans.regularisationAConfirmer).toBeUndefined();
    expect(sans.regularisation).toBeGreaterThan(0);
    // Avant la correction : sans.regularisation + 54,55 € comptés dans le total.
    expect(f.regularisation).toBe(0);
    expect(f.regularisationAConfirmer).toContain(`${euros(sans.regularisation)} si les jours à confirmer sont dus`);
    expect(f.regularisationAConfirmer).toContain(`${euros(retenu.regularisation)} s’ils ne le sont pas`);
    // Le congé sans solde retient les mêmes 2 jours : la lecture « non dus » est plus basse que la lecture « dus ».
    expect(retenu.regularisation).toBeLessThan(sans.regularisation);
  });
  it('avenant qui passe en année complète au 01/09/2026 : rien n’est versé, les deux montants sont dans l’alerte', () => {
    const av = { avenants: [{ id: 'a1', from: '2026-09-01', changes: { yearType: 'complete' as const, weeks: 52 } }] };
    const ref = monthBase(makeCtx(contract(av), [], [], '2026-11-18'), '2026-09');
    const retenu = monthBase(makeCtx(contract(av), [], [SANS_SOLDE], '2026-11-18'), '2026-09');
    const b = monthBase(makeCtx(contract(av), [], [EVENEMENT], '2026-11-18'), '2026-09');
    expect(ref.regulAvenant).toBeGreaterThan(0);
    expect(b.regulAvenant).toBeUndefined();
    expect(b.net).toBe(ref.net - ref.regulAvenant!);
    const alerte = b.alerts.find((a) => a.startsWith('Régularisation à l’avenant du 01/09 à confirmer'));
    expect(alerte).toContain(`${euros(ref.regulAvenant!)} si les jours à confirmer sont dus`);
    expect(alerte).toContain(`${euros(retenu.regulAvenant!)} s’ils ne le sont pas`);
  });
});

// Année complète, 40 h du lundi au vendredi, 5 € net, contrat commencé le 01/06/2026 (début de la période de référence).
const complete = (over: Partial<Contract> = {}) => contract({ start: '2026-06-01', trackedFrom: '2026-06-01', yearType: 'complete', weeks: 52, weeksOff: [], ...over });
const finC = (notif: string, motif: 'retrait' | 'demission', presentation?: string) => finDeContrat(makeCtx(complete(), [], [], '2027-01-18'), notif, motif, 0, presentation);

describe('T-038 AC-2 : date de fin du préavis à confirmer, indemnité de congés non pris comparée à la fin J+1', () => {
  it('fin le 22/10/2026 ou le 23/10/2026 : même indemnité, elle reste comptée', () => {
    const f = finC('2026-10-08', 'retrait');
    expect(f.dernierJour).toBe('2026-10-22');
    expect(f.cpAConfirmer).toBeUndefined();
    expect(f.cpIndemnite).toBeGreaterThan(0);
  });
  it('fin le 23/10/2026 : le lendemain, le nombre de jours acquis devient à confirmer ; rien n’est compté', () => {
    const f = finC('2026-10-09', 'retrait');
    const lendemain = finC('2026-10-09', 'retrait', '2026-10-10');
    expect(f.dernierJour).toBe('2026-10-23');
    expect(lendemain.dernierJour).toBe('2026-10-24');
    // À la fin du 24/10, l'acquisition elle-même est à confirmer (A-23, deux fiches DREETS) : pas de montant.
    expect(lendemain.cpAConfirmer).toMatch(/Tes jours de congés de cette période sont à confirmer/);
    expect(f.cpIndemnite).toBe(0);
    expect(f.cpAConfirmer).toMatch(/^Indemnité de congés non pris à confirmer/);
    expect(f.cpAConfirmer).toMatch(/Fin le 23\/10\/2026 : [\d\s\u202f\u00a0]+,\d\d\u00a0€/);
    expect(f.cpAConfirmer).toContain('Fin le 24/10/2026 : nombre de jours à confirmer');
  });
});

describe('T-038 AC-1 : démission de 3 mois à 1 an, durée en conflit (CASF L423-26 : un mois ; CCN art. 120 : 15 jours)', () => {
  it('retrait à 4 mois (15 jours, sans conflit) : indemnité de congés non pris comptée', () => {
    const f = finC('2026-10-05', 'retrait');
    expect(f.dernierJour).toBe('2026-10-19');
    expect(f.cpAConfirmer).toBeUndefined();
    expect(f.cpIndemnite).toBeGreaterThan(0);
  });
  it('démission à la même date : le préavis d’un mois finirait le 04/11/2026 ; l’indemnité change, elle est à confirmer', () => {
    const f = finC('2026-10-05', 'demission');
    const retrait = finC('2026-10-05', 'retrait');
    expect(f.dernierJour).toBe('2026-10-19');
    expect(f.cpIndemnite).toBe(0);
    expect(f.cpAConfirmer).toMatch(/^Indemnité de congés non pris à confirmer : elle dépend de la durée du préavis et de sa date de fin/);
    expect(f.cpAConfirmer).toContain(`Fin le 19/10/2026 : ${euros(retrait.cpIndemnite)}`);
    expect(f.cpAConfirmer).toContain('Préavis d’un mois, fin le 04/11/2026');
  });
  it('année incomplète : la régularisation est calculée pour les deux durées et mise à confirmer si elle change', () => {
    const c = contract({ start: '2026-03-02', trackedFrom: '2026-03-02' });
    const f = finDeContrat(makeCtx(c, [], [], '2026-12-31'), '2026-10-14', 'demission');
    const r = finDeContrat(makeCtx(c, [], [], '2026-12-31'), '2026-10-14', 'retrait');
    expect(f.dernierJour).toBe(r.dernierJour);
    expect(r.regularisationAConfirmer).toBeUndefined();
    expect(f.regularisation).toBe(0);
    expect(f.regularisationAConfirmer).toMatch(/^Régularisation à confirmer : elle dépend de la durée du préavis et de sa date de fin/);
    expect(f.regularisationAConfirmer).toContain(`Fin le 28/10/2026 : ${euros(r.regularisation)}`);
    expect(f.regularisationAConfirmer).toContain('Préavis d’un mois, fin le 13/11/2026');
  });
});

describe('T-038 R-1 : décès de l’enfant, indemnité égale au préavis, premier jour non fixé par un texte', () => {
  const c = complete({ start: '2024-09-02', trackedFrom: '2024-09-02' });
  it('décès le mercredi 14/10/2026 : un mois du 15/10 ou du 14/10, montants différents, rien n’est compté', () => {
    const f = finDeContrat(makeCtx(c, [], [], '2026-12-31'), '2026-10-14', 'deces');
    expect(f.indemnitePreavis).toBe(0);
    expect(f.indemnitePreavisAConfirmer).toMatch(/Du 15\/10\/2026 au 14\/11\/2026 \(lendemain du décès\) : .* ; du 14\/10\/2026 au 13\/11\/2026 \(jour du décès\) : /);
  });
  it('décès le samedi 31/10/2026 : même montant quel que soit le premier jour (novembre entier, R-FIN-05), compté', () => {
    const f = finDeContrat(makeCtx(c, [], [], '2026-12-31'), '2026-10-31', 'deces');
    expect(f.indemnitePreavisAConfirmer).toBeUndefined();
    expect(f.indemnitePreavis).toBe(salaireMensualise(c));
  });
});

describe('T-038 M-5 : pas de régularisation d’avenant si une absence non gérée tombe dans sa période', () => {
  it('accident du travail les 10 et 11/03/2026, avenant vers l’année complète au 01/09/2026 : rien versé, refus clair', () => {
    const av = { avenants: [{ id: 'a1', from: '2026-09-01', changes: { yearType: 'complete' as const, weeks: 52 } }] };
    const at: AmLeave = { id: 'at', type: 'accident_travail', from: '2026-03-10', to: '2026-03-11' };
    const b = monthBase(makeCtx(contract(av), [], [at], '2026-11-18'), '2026-09');
    expect(b.regulAvenant).toBeUndefined();
    expect(b.alerts.some((a) => a.startsWith('Régularisation à l’avenant du 01/09 non calculée : un cas non géré'))).toBe(true);
  });
});

describe('T-038 point 10 (G-6) : un jour de l’enfant noté « sans solde » ne bloque plus le calcul des congés (année incomplète)', () => {
  it('même acquisition qu’avec une absence voulue par les parents le même jour (CCN art. 105 al. 1 : absence payée)', () => {
    const rec = (abs: 'sans_solde_enfant' | 'parents') => [{ key: `c1|2026-03-10`, cid: 'c1', date: '2026-03-10', abs }];
    const ss = acquisition(makeCtx(contract(), rec('sans_solde_enfant'), [], '2026-11-18'), 2025);
    const parents = acquisition(makeCtx(contract(), rec('parents'), [], '2026-11-18'), 2025);
    expect(ss).toEqual(parents);
    expect(ss.aConfirmer?.message ?? '').not.toContain('une absence (maladie, congé sans solde…) change le calcul');
  });
});

describe('T-038 AC-3 : écran de saisie d’un événement familial, le texte suit le moteur', () => {
  const statut = (nature: Parameters<typeof libelleDureeSaisie>[0], from: string) =>
    statutJourEvenement({ id: 'e', type: 'evenement', from, to: from, nature }, from);
  it('décès d’un enfant en 2022 : le moteur met « à confirmer », l’écran n’annonce plus « 5 jours ouvrables payés »', () => {
    expect(statut('deces_enfant', '2022-06-01').paye).toBe(false);
    expect(libelleDureeSaisie('deces_enfant', '2022-06-01')).toBe('Période non gérée (avant le 01/05/2024) : durée à vérifier avec les parents');
  });
  it('décès d’un enfant de moins de 25 ans en 2023 (jours ouvrés contre ouvrables) : plus de « Indemnisé par la Sécurité sociale »', () => {
    expect(libelleDureeSaisie('deces_enfant_14', '2023-03-01')).not.toMatch(/Sécurité sociale/);
    expect(libelleDureeSaisie('deces_enfant_14', '2023-03-01')).toMatch(/^Période non gérée/);
  });
  it('mariage en 2026 : payé par le moteur, l’écran annonce 4 jours ouvrables payés (CCN 48.1.3.1.1, L3142-4 1°)', () => {
    expect(statut('mariage', '2026-10-05').paye).toBe(true);
    expect(libelleDureeSaisie('mariage', '2026-10-05')).toBe('4 jours ouvrables payés');
  });
  it('congé de deuil en 2026 : non géré par le moteur, l’écran le dit', () => {
    expect(statut('deuil', '2026-10-05').paye).toBe(false);
    expect(libelleDureeSaisie('deuil', '2026-10-05')).toMatch(/^Non géré par l’app/);
  });
});

describe('T-038 M-1, M-2 : repères nets du minimum AM lus sur la page Urssaf (mise à jour du 01/06/2026)', () => {
  it('du 01/01/2025 au 31/03/2025 : 3,50 € brut, 2,74 € net ; au 01/06/2026 : 4,20 € brut, 3,28 € net, source Urssaf', () => {
    expect(ratesAt('2025-02-15')).toMatchObject({ minConvBrut: 350, minConvNet: 274 });
    expect(ratesAt('2026-10-15')).toMatchObject({ minConvBrut: 420, minConvNet: 328 });
    expect(ratesAt('2026-10-15')!.source).toMatch(/Urssaf/);
    expect(ratesAt('2025-02-15')!.source).toMatch(/Urssaf/);
  });
});

describe('T-038 M-3 : écran Règles complété', () => {
  const regle = (debut: string) => RULES.find((x) => x.t.startsWith(debut))!;
  it('fin de contrat : conflit de durée de la démission (CASF L423-26 / CCN art. 120) et montants à confirmer', () => {
    expect(regle('Fin de contrat').r).toMatch(/L423-26\) prévoit un mois, la convention 15 jours/);
    expect(regle('Fin de contrat').choix).toMatch(/ne sont pas comptés dans le total/);
  });
  it('congés payés : jours pour enfant à charge acquis au 31 mai (CCN 48.1.3.3, CPA-03)', () => {
    expect(regle('Congés payés').choix).toMatch(/acquis au 31 mai.*48\.1\.3\.3/);
  });
  it('impôts : SMIC en vigueur le jour de la garde, comme fiscal.ts (BOI-RSA-CHAMP-10-20-10 § 490)', () => {
    expect(regle('Impôts').choix).toMatch(/SMIC horaire en vigueur le jour de la garde/);
    expect(regle('Impôts').choix).not.toMatch(/1er janvier/);
  });
});

describe('T-038 G-1 : mois terminé avec un jour noté « sans solde » (retenu avant T-035b), alerte de régularisation', () => {
  const rec = [{ key: 'c1|2026-10-14', cid: 'c1', date: '2026-10-14', abs: 'sans_solde_enfant' as const }];
  const c = complete({ start: '2026-01-05', trackedFrom: '2026-01-05' });
  it('octobre 2026 terminé : le salaire est plein (art. 105) et l’alerte dit quoi faire si le mois est déjà déclaré', () => {
    const b = monthBase(makeCtx(c, rec, [], '2026-11-15'), '2026-10');
    expect(b.base).toBe(salaireMensualise(c));
    expect(b.alerts).toContain(messageMoisSansSoldeChange(1));
    expect(b.alerts).toContain(MESSAGE_MOIS_DEJA_DECLARE);
    expect(messageMoisSansSoldeChange(1)).toMatch(/1 jour d’absence de l’enfant noté « sans solde » est maintenant payé.*article 105.*régularisation avec les parents/);
  });
  it('mois en cours (pas encore déclarable) : pas d’alerte de régularisation', () => {
    const b = monthBase(makeCtx(c, rec, [], '2026-10-20'), '2026-10');
    expect(b.alerts).not.toContain(messageMoisSansSoldeChange(1));
  });
});

describe('T-038 suite, point 1 : indemnité de rupture d’un retrait quand la fin du préavis bouge d’un jour', () => {
  // Début le 03/06/2024 (début de période de référence) : les congés de la période sont sûrs, l'assiette est complète.
  const c = complete({ start: '2024-06-03', trackedFrom: '2024-06-03' });
  it('fin le jeudi 12/11/2026 ou le vendredi 13/11/2026 : deux montants, « à confirmer », non comptée', () => {
    const f = finDeContrat(makeCtx(c, [], [], '2026-12-31'), '2026-10-13', 'retrait');
    const lendemain = finDeContrat(makeCtx(c, [], [], '2026-12-31'), '2026-10-13', 'retrait', 0, '2026-10-14');
    expect(f.dernierJour).toBe('2026-11-12');
    expect(lendemain.dernierJour).toBe('2026-11-13');
    expect(f.ruptureAConfirmer).toBe(true);
    expect(f.ruptureVariantes).toContain(`Fin le 12/11/2026 : ${euros(f.indemniteRupture)}`);
    expect(f.ruptureVariantes).toContain(`Fin le 13/11/2026 : ${euros(lendemain.indemniteRupture)}`);
    expect(lendemain.indemniteRupture).not.toBe(f.indemniteRupture);
  });
  it('fin le vendredi 13/11/2026 : le samedi n’est pas un jour d’accueil, même montant, comptée', () => {
    const f = finDeContrat(makeCtx(c, [], [], '2026-12-31'), '2026-10-14', 'retrait');
    expect(f.ruptureVariantes).toBeUndefined();
    expect(f.ruptureAConfirmer).toBeFalsy();
    expect(f.indemniteRupture).toBeGreaterThan(0);
  });
});
