// T-045 : préavis non exécuté (constat B-2 de la relecture V5). Attendus tirés des textes, jamais du code :
// - CCN IDCC 3239, art. 64 : la date de fin correspond « au dernier jour travaillé, en cas d'inexécution totale ou partielle du
//   préavis à l'initiative du salarié » et « à la date prévue de fin du préavis » si l'inexécution est à l'initiative de
//   l'employeur.
// - Art. 64.2, al. 2 : l'inexécution demandée par le salarié et acceptée par l'employeur : « le contrat de travail prend fin
//   au dernier jour travaillé ». Service-public.fr F33164 et F16842 : l'AM « n'est pas payée pour la partie du préavis non
//   réalisé ».
// - Art. 64.2, al. 1, 66 et 122 : inexécution imposée par l'employeur : indemnité compensatrice jusqu'à la date prévue de fin.
//   T-074 : ce cas est calculé (tests/t074-preavis-dispense.test.ts).
// - Art. 64.2, al. 2, fin : sans accord, l'employeur peut demander à l'AM une indemnité égale au net du préavis non fait.
//   T-107 (cas 2) : calculé ; rien n'est dû par l'AM enceinte qui démissionne (C. trav. L1225-34).
// Les montants du cas accepté sont comparés au même calcul de l'app pour un contrat qui finit le même jour sans préavis
// (faute grave notifiée ce jour-là) : seule la date de fin change, la règle ne fixe rien d'autre.
import { describe, expect, it } from 'vitest';
import type { Contract, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { finDeContrat } from '../src/engine/fin';

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
    alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, ...over,
  };
}
const ctxDe = (c: Contract) => makeCtx(c, [], [], '2026-12-31');

describe('T-045 : préavis non exécuté (CCN art. 64 et 64.2)', () => {
  it('B-2 : un contrat dont la date de fin précède la fin du préavis n’est plus calculé en silence jusqu’à la fin du préavis', () => {
    // Ancienne S18 du comparateur : démission notifiée le 30/10/2026, moins de 3 mois, fin du contrat le 30/10.
    const f = finDeContrat(ctxDe(contract({ start: '2026-09-01', trackedFrom: '2026-09-01', end: '2026-10-30' })), '2026-10-30', 'demission');
    expect(f.preavisFin).toBe('2026-11-06');
    expect(f.nonGere?.length).toBeGreaterThan(0);
    expect(f.totalBrut + f.cpIndemnite + f.regularisation + f.indemniteRupture).toBe(0);
  });

  it('démission, dispense demandée par l’AM et acceptée : fin au dernier jour travaillé, sans indemnité de préavis', () => {
    const c = contract({ start: '2026-09-01', trackedFrom: '2026-09-01' });
    const f = finDeContrat(ctxDe(c), '2026-10-30', 'demission', 0, undefined, { demandeur: 'am_acceptee', dernierJourTravaille: '2026-10-30' });
    expect(f.nonGere).toBeUndefined();
    expect(f.dernierJour).toBe('2026-10-30');
    expect(f.preavisFin).toBe('2026-11-06');
    expect(f.indemnitePreavis).toBe(0);
    const ref = finDeContrat(ctxDe(c), '2026-10-30', 'faute_grave');
    expect(f.cpIndemnite).toBe(ref.cpIndemnite);
    expect(f.regularisation).toBe(ref.regularisation);
    expect(f.totalBrut).toBe(ref.totalBrut);
  });

  it('retrait, inexécution partielle demandée par l’AM et acceptée : fin au dernier jour travaillé, indemnité de rupture sur les salaires jusqu’à ce jour', () => {
    const c = contract();
    const f = finDeContrat(ctxDe(c), '2026-10-01', 'retrait', 0, undefined, { demandeur: 'am_acceptee', dernierJourTravaille: '2026-10-15' });
    expect(f.preavisFin).toBe('2026-10-31');
    expect(f.dernierJour).toBe('2026-10-15');
    expect(f.nonGere).toBeUndefined();
    expect(f.regularisationAConfirmer).toBeUndefined();
    const ref = finDeContrat(ctxDe(c), '2026-10-15', 'faute_grave');
    expect(f.totalBrut).toBe(ref.totalBrut);
    expect(f.cpIndemnite).toBe(ref.cpIndemnite);
    expect(f.indemniteRupture).toBe(Math.round(ref.totalBrut / 80));
  });

  it('dispense à l’initiative de l’employeur : date de fin = fin prévue du préavis, calculée depuis T-074', () => {
    // T-074 (regles/t074-preavis-dispense.md) : ce cas n'est plus refusé ; détail dans tests/t074-preavis-dispense.test.ts.
    const f = finDeContrat(ctxDe(contract()), '2026-10-01', 'retrait', 0, undefined, { demandeur: 'employeur', dernierJourTravaille: '2026-10-10' });
    expect(f.dernierJour).toBe('2026-10-31');
    expect(f.nonGere).toBeUndefined();
    expect(f.dispense).toMatchObject({ du: '2026-10-11', au: '2026-10-31' });
  });

  // T-107 (cas 2) : préavis non fait sans l'accord des parents, calculé. CCN 64 : fin au dernier jour travaillé ; CCN 64.2,
  // al. 2 : les parents peuvent demander « une indemnité égale au montant de la rémunération nette correspondant à la durée non
  // exécutée du préavis » ; C. trav. L1225-34 (CASF L423-2, 3°) : la salariée enceinte rompt « sans préavis et sans devoir
  // d'indemnité de rupture ». Démission : la grossesse est demandée une fois.
  it('T-107 (cas 2) : démission sans l’accord des parents, grossesse non dite : la question est posée, aucun montant', () => {
    const f = finDeContrat(ctxDe(contract()), '2026-10-01', 'demission', 0, undefined, { demandeur: 'am_sans_accord', dernierJourTravaille: '2026-10-10' });
    expect(f.dernierJour).toBe('2026-10-10');
    expect(f.nonGere?.join(' ')).toMatch(/enceinte.*L1225-34/);
    expect(f.totalBrut + f.cpIndemnite + f.regularisation + f.indemniteRupture).toBe(0);
  });
  it('T-107 (cas 2) : démission enceinte sans préavis : fin au dernier jour travaillé, rien de dû aux parents', () => {
    const f = finDeContrat(ctxDe(contract()), '2026-10-01', 'demission', 0, undefined, { demandeur: 'am_sans_accord', dernierJourTravaille: '2026-10-10' }, undefined, { grossesse: true });
    expect(f.nonGere).toBeUndefined();
    expect(f.dernierJour).toBe('2026-10-10');
    expect(f.indemniteDueParents?.net).toBe(0);
    expect(f.alertes.join(' ')).toMatch(/L1225-34/);
    // Mêmes congés non pris qu'un départ au même jour accepté par les parents (seule la date de fin compte, CCN 64).
    const accepte = finDeContrat(ctxDe(contract()), '2026-10-01', 'demission', 0, undefined, { demandeur: 'am_acceptee', dernierJourTravaille: '2026-10-10' });
    expect(f.cpIndemnite).toBe(accepte.cpIndemnite);
    expect(f.cpIndemnite).toBeGreaterThan(0);
  });
  it('T-107 (cas 2) : démission sans l’accord des parents, pas enceinte : les parents peuvent demander le net du préavis non fait', () => {
    const f = finDeContrat(ctxDe(contract()), '2026-10-01', 'demission', 0, undefined, { demandeur: 'am_sans_accord', dernierJourTravaille: '2026-10-10' }, undefined, { grossesse: false });
    expect(f.nonGere).toBeUndefined();
    expect(f.dernierJour).toBe('2026-10-10');
    // Préavis d'un mois (13 mois d'ancienneté, CCN 120) : du 01/10 au 31/10/2026. Non fait : du 11/10 au 31/10. Mensualisé net
    // 40 h × 52 ÷ 12 × 5 € = 866,67 € ; octobre 2026 : 22 jours de 8 h prévus (176 h), dont 15 jours (120 h) après le 10/10.
    // CCN 122 et 111 : 866,67 × 120 ÷ 176 = 590,91 €.
    expect(f.indemniteDueParents).toEqual({ net: 59091, du: '2026-10-11', au: '2026-10-31' });
    expect(f.alertes.join(' ')).toMatch(/590,91.*64\.2/);
  });
  it('T-107 (cas 2) : retrait de l’enfant, l’AM part sans leur accord : même indemnité possible (pas de question de grossesse)', () => {
    const f = finDeContrat(ctxDe(contract()), '2026-10-01', 'retrait', 0, undefined, { demandeur: 'am_sans_accord', dernierJourTravaille: '2026-10-10' });
    expect(f.nonGere).toBeUndefined();
    expect(f.indemniteDueParents?.net).toBe(59091);
  });

  it('saisies incohérentes : refus clair, jamais un montant', () => {
    const c = contract();
    const avant = finDeContrat(ctxDe(c), '2026-10-01', 'retrait', 0, undefined, { demandeur: 'am_acceptee', dernierJourTravaille: '2026-09-30' });
    expect(avant.nonGere?.length).toBeGreaterThan(0);
    const apres = finDeContrat(ctxDe(c), '2026-10-01', 'retrait', 0, undefined, { demandeur: 'am_acceptee', dernierJourTravaille: '2026-11-01' });
    expect(apres.nonGere?.length).toBeGreaterThan(0);
    const sansPreavis = finDeContrat(ctxDe(c), '2026-10-01', 'faute_grave', 0, undefined, { demandeur: 'am_acceptee', dernierJourTravaille: '2026-10-01' });
    expect(sansPreavis.nonGere?.length).toBeGreaterThan(0);
    // Date de fin du contrat saisie avant le dernier jour travaillé déclaré.
    const incoherent = finDeContrat(ctxDe(contract({ end: '2026-10-05' })), '2026-10-01', 'retrait', 0, undefined, { demandeur: 'am_acceptee', dernierJourTravaille: '2026-10-15' });
    expect(incoherent.nonGere?.length).toBeGreaterThan(0);
  });

  it('préavis fait en entier : rien ne change (date de fin du contrat égale à la fin du préavis)', () => {
    const f = finDeContrat(ctxDe(contract({ end: '2026-10-31' })), '2026-10-01', 'retrait');
    expect(f.nonGere).toBeUndefined();
    expect(f.dernierJour).toBe('2026-10-31');
  });
});
