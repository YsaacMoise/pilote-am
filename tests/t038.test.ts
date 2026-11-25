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
import { ratesAt } from '../src/engine/rates';
import { RULES } from '../src/screens/Regles';
import { NON_GERE_MAYOTTE, nonGeresContrat } from '../src/engine/nonGeres';
import { acquisition } from '../src/engine/conges';
import { libelleDureeSaisie, statutJourEvenement } from '../src/engine/evenements';
import { normaliserAbsence } from '../src/engine/absences';
import { computeMonth as computeMonthRef } from '../src/engine/month';

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
// Événement familial de durée non gérée (0) : jours « à confirmer » (statutJourEvenement). Congé sans solde : jours retenus (T-034).
const EVENEMENT: AmLeave = { id: 'e', type: 'evenement', from: '2026-03-10', to: '2026-03-11', joursEvenement: 0 };
const SANS_SOLDE: AmLeave = { id: 's', type: 'sans_solde', from: '2026-03-10', to: '2026-03-11' };
const fin = (leaves: AmLeave[], c = contract()) => finDeContrat(makeCtx(c, [], leaves, '2026-11-18'), '2026-10-28', 'retrait');

describe('T-038 B-1, revu par la T-103 : plus de jours « à confirmer » à faire entrer dans la régularisation', () => {
  it('ancienne saisie d’événement sans durée (0) : le mois est refusé avec la consigne, rien n’est « à confirmer »', () => {
    expect(salaireMensualise(contract())).toBe(60000);
    expect(computeMonthRef(makeCtx(contract(), [], [EVENEMENT], '2026-11-18'), '2026-03').nonGere.join(' ')).toMatch(/ne connaît pas encore sa durée/);
  });
  it('fin de contrat avec un congé sans solde : régularisation calculée, sans « à confirmer »', () => {
    const f = fin([SANS_SOLDE]);
    expect(f.regularisationAConfirmer).toBeUndefined();
    expect(f.regularisation).toBeLessThan(fin([]).regularisation);
  });
});

// Année complète, 40 h du lundi au vendredi, 5 € net, contrat commencé le 01/06/2026 (début de la période de référence).
const complete = (over: Partial<Contract> = {}) => contract({ start: '2026-06-01', trackedFrom: '2026-06-01', yearType: 'complete', weeks: 52, weeksOff: [], ...over });
const finC = (notif: string, motif: 'retrait' | 'demission', presentation?: string) => finDeContrat(makeCtx(complete(), [], [], '2027-01-18'), notif, motif, 0, presentation);

describe('T-038 AC-2, revu par la T-103 (F1) : une seule date de fin, indemnité de congés non pris sans réserve', () => {
  it('fin le 22/10/2026 : indemnité comptée', () => {
    const f = finC('2026-10-08', 'retrait');
    expect(f.dernierJour).toBe('2026-10-22');
    expect(f.cpAConfirmer).toBeUndefined();
    expect(f.cpIndemnite).toBeGreaterThan(0);
  });
  it('fin le 23/10/2026 : indemnité comptée (jours acquis par la méthode de l’arrêt du 10/01/1980, C10, C11)', () => {
    const f = finC('2026-10-09', 'retrait');
    expect(f.dernierJour).toBe('2026-10-23');
    expect(f.cpAConfirmer).toBeUndefined();
    expect(f.cpIndemnite).toBeGreaterThan(0);
  });
});

describe('T-038 AC-1, revu par la T-103 (F2) : démission de 3 mois à 1 an, 15 jours (CCN 120)', () => {
  it('retrait à 4 mois (15 jours) : indemnité de congés non pris comptée', () => {
    const f = finC('2026-10-05', 'retrait');
    expect(f.dernierJour).toBe('2026-10-19');
    expect(f.cpAConfirmer).toBeUndefined();
    expect(f.cpIndemnite).toBeGreaterThan(0);
  });
  it('démission à la même date : même fin, même indemnité, sans réserve', () => {
    const f = finC('2026-10-05', 'demission');
    const retrait = finC('2026-10-05', 'retrait');
    expect(f.dernierJour).toBe('2026-10-19');
    expect(f.cpAConfirmer).toBeUndefined();
    expect(f.cpIndemnite).toBe(retrait.cpIndemnite);
  });
  it('année incomplète : même régularisation pour la démission et le retrait, sans réserve', () => {
    const c = contract({ start: '2026-03-02', trackedFrom: '2026-03-02' });
    const f = finDeContrat(makeCtx(c, [], [], '2026-12-31'), '2026-10-14', 'demission');
    const r = finDeContrat(makeCtx(c, [], [], '2026-12-31'), '2026-10-14', 'retrait');
    expect(f.dernierJour).toBe(r.dernierJour);
    expect(f.regularisationAConfirmer).toBeUndefined();
    expect(f.regularisation).toBe(r.regularisation);
  });
});

describe('T-038 R-1, revu par la T-103 (F8) : décès de l’enfant, indemnité égale au préavis à partir du lendemain', () => {
  // CCN 119.4.2 : rupture « au jour du décès », « dernier salaire dû au jour du décès » : la période de l'indemnité part du lendemain.
  const c = complete({ start: '2024-09-02', trackedFrom: '2024-09-02' });
  it('décès le mercredi 14/10/2026 : un mois du 15/10 au 14/11/2026, compté', () => {
    const f = finDeContrat(makeCtx(c, [], [], '2026-12-31'), '2026-10-14', 'deces');
    expect(f.indemnitePreavis).toBeGreaterThan(0);
    expect(f.indemnitePreavisExplication).toMatch(/du 15\/10\/2026 au 14\/11\/2026/);
    expect(f.alertes.join(' ')).toMatch(/article 119\.4\.2/);
  });
  it('décès le samedi 31/10/2026 : novembre entier, compté', () => {
    const f = finDeContrat(makeCtx(c, [], [], '2026-12-31'), '2026-10-31', 'deces');
    expect(f.indemnitePreavis).toBe(salaireMensualise(c));
  });
});

describe('T-038 M-5 : pas de régularisation d’avenant si une absence non gérée tombe dans sa période', () => {
  it('accident du travail les 10 et 11/03/2026, avenant vers l’année complète au 01/09/2026 : rien versé, refus clair', () => {
    const av = { avenants: [{ id: 'a1', from: '2026-09-01', changes: { yearType: 'complete' as const, weeks: 52 } }] };
    const at: AmLeave = { id: 'at', type: 'non_gere', from: '2026-03-10', to: '2026-03-11' };
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
    statutJourEvenement(normaliserAbsence({ id: 'e', type: 'evenement', from, to: from, nature }), from);
  it('décès d’un enfant en 2022 (T-103, C6) : payé, l’écran annonce 5 jours ouvrables payés', () => {
    expect(statut('deces_enfant', '2022-06-01').paye).toBe(true);
    expect(libelleDureeSaisie('deces_enfant', '2022-06-01')).toBe('5 jours ouvrables payés');
  });
  it('décès d’un enfant de moins de 25 ans en 2023 (T-103) : 9 jours ouvrables, qui couvrent les 7 jours ouvrés de la loi', () => {
    expect(libelleDureeSaisie('deces_enfant_14', '2023-03-01')).toBe('9 jours ouvrables payés');
  });
  it('mariage en 2026 : payé par le moteur, l’écran annonce 4 jours ouvrables payés (CCN 48.1.3.1.1, L3142-4 1°)', () => {
    expect(statut('mariage', '2026-10-05').paye).toBe(true);
    expect(libelleDureeSaisie('mariage', '2026-10-05')).toBe('4 jours ouvrables payés');
  });
  it('congé de deuil en 2026 (T-103, C9) : payé, l’écran demande le montant des indemnités journalières', () => {
    expect(statut('deuil', '2026-10-05').paye).toBe(true);
    expect(libelleDureeSaisie('deuil', '2026-10-05')).toMatch(/^8 jours ouvrables, salaire maintenu moins les indemnités journalières/);
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
  it('fin de contrat (T-103) : démission de 3 mois à 1 an, 15 jours ; rien « à confirmer »', () => {
    expect(regle('Fin de contrat').r).toMatch(/de 3 mois à 1 an, la convention, plus favorable que la loi, prévoit 15 jours/);
    expect(`${regle('Fin de contrat').r} ${regle('Fin de contrat').choix}`).not.toMatch(/à confirmer|DDETS|environ/);
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

describe('T-038 suite, point 1, revu par la T-103 (F1) : indemnité de rupture d’un retrait, une seule date de fin', () => {
  const c = complete({ start: '2024-06-03', trackedFrom: '2024-06-03' });
  it('fin le jeudi 12/11/2026 : indemnité comptée, sans variante', () => {
    const f = finDeContrat(makeCtx(c, [], [], '2026-12-31'), '2026-10-13', 'retrait');
    expect(f.dernierJour).toBe('2026-11-12');
    expect(f.cpAConfirmer).toBeUndefined();
    expect(f.ruptureAConfirmer).toBeFalsy();
    expect(f.indemniteRupture).toBeGreaterThan(0);
  });
  it('lettre présentée un jour plus tard : la fin suit la présentation (CCN 64.1, fiche F2883), un seul montant chaque fois', () => {
    const f = finDeContrat(makeCtx(c, [], [], '2026-12-31'), '2026-04-05', 'retrait');
    const lendemain = finDeContrat(makeCtx(c, [], [], '2026-12-31'), '2026-04-05', 'retrait', 0, '2026-04-06');
    expect(f.dernierJour).toBe('2026-05-04');
    expect(lendemain.dernierJour).toBe('2026-05-05');
    expect(f.ruptureAConfirmer).toBeFalsy();
    expect(lendemain.ruptureAConfirmer).toBeFalsy();
    expect(lendemain.indemniteRupture).not.toBe(f.indemniteRupture);
  });
  it('fin le vendredi 15/05/2026 : comptée', () => {
    const f = finDeContrat(makeCtx(c, [], [], '2026-12-31'), '2026-04-16', 'retrait');
    expect(f.dernierJour).toBe('2026-05-15');
    expect(f.cpAConfirmer).toBeUndefined();
    expect(f.ruptureAConfirmer).toBeFalsy();
    expect(f.indemniteRupture).toBeGreaterThan(0);
  });
});

describe('T-038 suite 2 : Mayotte, contrat non géré (décision du DG)', () => {
  // T-077 : Mayotte est désormais calculée (regions.ts ; regles/t077-decisions.md) : plus de refus.
  it('réponse « Mayotte » : le mois et la fin de contrat sont calculés (T-077)', () => {
    const c = complete({ start: '2026-01-05', trackedFrom: '2026-01-05', mayotte: true });
    expect(nonGeresContrat(c)).not.toContain(NON_GERE_MAYOTTE);
    expect(monthBase(makeCtx(c, [], [], '2026-11-18'), '2026-10').nonGere).toEqual([]);
    expect(finDeContrat(makeCtx(c, [], [], '2026-12-31'), '2026-10-13', 'retrait').nonGere ?? []).not.toContain(NON_GERE_MAYOTTE);
  });
  it('réponses déjà données (« Ailleurs en France », sans le champ mayotte) : rien ne change', () => {
    const c = complete({ start: '2026-01-05', trackedFrom: '2026-01-05' });
    expect(nonGeresContrat(c)).toEqual([]);
    expect(monthBase(makeCtx(c, [], [], '2026-11-18'), '2026-10').nonGere).toEqual([]);
  });
});
