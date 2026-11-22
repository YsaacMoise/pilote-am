// T-074 : préavis que les parents dispensent l'AM de faire, en tout ou en partie. Attendus tirés des textes
// (regles/t074-preavis-dispense.md du dépôt calculateur-arvela), jamais du code :
// - CCN IDCC 3239, art. 64 : fin du contrat « à la date prévue de fin du préavis, en cas d'inexécution totale ou partielle du
//   préavis à l'initiative du particulier employeur ».
// - Art. 64.2, al. 1 : indemnité compensatrice « jusqu'à la date prévue de fin », égale à la rémunération brute, soumise à
//   cotisations ; la période compte pour les congés et l'ancienneté. Art. 66, 122 et 111 : mois partiel au prorata des heures.
// - Art. 114.1 et 114.2, CASF L423-18 : entretien et repas seulement les jours d'accueil réel.
// - Points ouverts, « à confirmer » avec leurs valeurs : régularisation (D-2), indemnité de rupture (envoi 1, question 4 ; D-1).
import { describe, expect, it } from 'vitest';
import type { Contract, Planning } from '../src/engine/model';
import { dayInfo, makeCtx } from '../src/engine/payroll';
import { computeMonth } from '../src/engine/month';
import { finDeContrat } from '../src/engine/fin';
import { controleFinContrat } from '../src/engine/preavis';
import { euros } from '../src/engine/money';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}
function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2026-09-14', yearType: 'complete', weeks: 52, weeksOff: [],
    planning: week('08:00', '17:00'), rateNet: 745, majoration: 10, entretienJour: 422, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2026-09-14',
    alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, ...over,
  };
}
const ctxDe = (c: Contract) => makeCtx(c, [], [], '2026-12-31');
const DISPENSE = { demandeur: 'employeur' as const, dernierJourTravaille: '2026-11-26' };
// 45 h sur 5 jours, 52 semaines, 7,45 € net : mensualisé 45 × 52 / 12 = 195 h, soit 1 452,75 € net (CCN art. 109.1).
const MENSUALISE = 145275;

describe('T-074 : préavis dispensé par les parents (CCN art. 64, 64.2, 66, 122)', () => {
  it('fin à la date prévue de fin du préavis ; indemnité de préavis des jours dispensés ; plus de refus', () => {
    // Remise en main propre le 23/11/2026, moins de 3 mois : 8 jours calendaires (art. 120), du 23 au 30/11 (lecture de l'app).
    const f = finDeContrat(ctxDe(contract()), '2026-11-23', 'retrait', 0, undefined, DISPENSE);
    expect(f.nonGere).toBeUndefined();
    expect(f.dernierJour).toBe('2026-11-30');
    expect(f.dispense).toMatchObject({ du: '2026-11-27', au: '2026-11-30' });
    // Art. 122 et 111 : 18 h dispensées (27 et 30/11) sur 189 h prévues en novembre (21 jours, férié du 11 compris).
    expect(f.dispense!.net).toBe(Math.round((MENSUALISE * 18 * 60) / (189 * 60)));
    expect(f.alertes.join(' ')).toMatch(/64\.2/);
    // Moins de 9 mois sous les deux lectures (remise de la lettre ou fin du contrat) : ni indemnité ni « à confirmer ».
    expect(f.indemniteRupture).toBe(0);
    expect(f.ruptureAConfirmer).toBeFalsy();
  });

  it('congés : la période dispensée compte (art. 64.2) ; 5 ou 7 jours selon la lecture (A-23), montants donnés, rien compté', () => {
    const f = finDeContrat(ctxDe(contract()), '2026-11-23', 'retrait', 0, undefined, DISPENSE);
    expect(f.cpJoursRestants).toBe(7);
    expect(f.cpIndemnite).toBe(0);
    expect(f.cpAConfirmer).toBeDefined();
    // D4 (vérificateur) : cas où les jours dispensés changent le nombre de jours. Début le 01/09/2026, lettre le 24/11, 8 jours
    // jusqu'au 01/12 ; dernier jour travaillé le 27/11. Avec les jours dispensés, 3 mois entiers et 1 jour : 2,5 × 3 = 7,5 plus
    // le prorata, arrondi à l'entier supérieur (art. 48.1.1.2) ; sans eux (fin au 27/11), 2 mois et 27 jours.
    const c = contract({ start: '2026-09-01', trackedFrom: '2026-09-01' });
    const emp = finDeContrat(ctxDe(c), '2026-11-24', 'retrait', 0, undefined, { demandeur: 'employeur', dernierJourTravaille: '2026-11-27' });
    const am = finDeContrat(ctxDe(c), '2026-11-24', 'retrait', 0, undefined, { demandeur: 'am_acceptee', dernierJourTravaille: '2026-11-27' });
    expect(emp.dernierJour).toBe('2026-12-01');
    expect(am.dernierJour).toBe('2026-11-27');
    expect(emp.cpJoursRestants).toBeGreaterThan(am.cpJoursRestants);
  });

  it('P-1 : mois travaillé puis dispensé, deux lectures de la part qui est l’indemnité ; total inchangé', () => {
    const f = finDeContrat(ctxDe(contract()), '2026-11-23', 'retrait', 0, undefined, DISPENSE);
    // Proportion de l'art. 111 : 1 452,75 × 18 / 189 = 138,36 € ; heures × taux : 18 × 7,45 = 134,10 €.
    expect(f.dispense!.net).toBe(13836);
    expect(f.dispense!.autre).toBe(13410);
    // Dernier mois sans aucun jour travaillé (dispense dès le 1er du mois) : art. 122 et 111, une seule lecture.
    const c = contract({ start: '2025-09-01', trackedFrom: '2025-09-01' });
    const g = finDeContrat(ctxDe(c), '2026-10-01', 'retrait', 0, undefined, { demandeur: 'employeur', dernierJourTravaille: '2026-09-30' });
    expect(g.dispense).toMatchObject({ du: '2026-10-01', au: '2026-10-31' });
    expect(g.dispense!.autre).toBeUndefined();
    expect(g.dispense!.net).toBe(MENSUALISE);
  });

  it('D1 : absence de l’AM un jour dispensé : rien n’est calculé (jamais une retenue en silence)', () => {
    const leave = { id: 'l1', type: 'am_malade' as const, from: '2026-11-27', to: '2026-11-27' };
    const c = contract({ end: '2026-11-30', rupture: { motif: 'retrait', notif: '2026-11-23', preavis: 'employeur', dernierJourTravaille: '2026-11-26' } });
    const r = computeMonth(makeCtx(c, [], [leave], '2026-12-31'), '2026-11');
    expect((r.nonGere ?? []).join(' ')).toMatch(/dispensée/);
    const f = finDeContrat(makeCtx(contract(), [], [leave], '2026-12-31'), '2026-11-23', 'retrait', 0, undefined, DISPENSE);
    expect(f.nonGere?.join(' ')).toMatch(/dispensée/);
    // La même absence avant la dispense (jour travaillé du préavis) n'est pas touchée par cette règle.
    const g = finDeContrat(makeCtx(contract(), [], [{ ...leave, from: '2026-11-25', to: '2026-11-25' }], '2026-12-31'), '2026-11-23', 'retrait', 0, undefined, DISPENSE);
    expect((g.nonGere ?? []).join(' ')).not.toMatch(/dispensée/);
  });

  it('mois avec jours dispensés : alerte sur la déclaration Pajemploi (P-1)', () => {
    const c = contract({ end: '2026-11-30', rupture: { motif: 'retrait', notif: '2026-11-23', preavis: 'employeur', dernierJourTravaille: '2026-11-26' } });
    expect(computeMonth(ctxDe(c), '2026-11').alerts.join(' ')).toMatch(/Pajemploi/);
    expect(computeMonth(ctxDe(c), '2026-10').alerts.join(' ')).not.toMatch(/dispensée/);
  });

  it('R2 : dispense totale, enfant plus confié dès le jour de la lettre : la veille est admise', () => {
    const f = finDeContrat(ctxDe(contract()), '2026-11-23', 'retrait', 0, undefined, { demandeur: 'employeur', dernierJourTravaille: '2026-11-22' });
    expect(f.nonGere).toBeUndefined();
    expect(f.dispense).toMatchObject({ du: '2026-11-23', au: '2026-11-30' });
    // Du 23 au 30/11 : 6 jours prévus, 54 h sur 189 h.
    expect(f.dispense!.net).toBe(Math.round((MENSUALISE * 54) / 189));
    expect(controleFinContrat({ start: '2026-09-14', end: '2026-11-30', rupture: { motif: 'retrait', notif: '2026-11-23', preavis: 'employeur', dernierJourTravaille: '2026-11-22' } })).toBeUndefined();
  });

  it('dernier mois : salaire mensualisé entier, entretien des seuls jours d’accueil réel (art. 114.1)', () => {
    const c = contract({ end: '2026-11-30', rupture: { motif: 'retrait', notif: '2026-11-23', preavis: 'employeur', dernierJourTravaille: '2026-11-26' } });
    const ctx = ctxDe(c);
    const r = computeMonth(ctx, '2026-11');
    expect(r.nonGere ?? []).toEqual([]);
    expect(r.net).toBe(MENSUALISE);
    // Du 02 au 26/11 du lundi au vendredi, sans le 11/11 férié : 18 jours × 4,22 €.
    expect(r.entretien).toBe(18 * 422);
    expect(dayInfo(ctx, '2026-11-27')).toMatchObject({ kind: 'absent', dispense: true, deducted: false, inDivisor: true, presentMin: 0 });
    expect(dayInfo(ctx, '2026-11-26').dispense).toBeUndefined();
    // Préavis fait en entier : même salaire, 2 jours d'entretien de plus.
    const fait = computeMonth(ctxDe(contract({ end: '2026-11-30', rupture: { motif: 'retrait', notif: '2026-11-23', preavis: 'execute' } })), '2026-11');
    expect(fait.net).toBe(MENSUALISE);
    expect(fait.entretien).toBe(20 * 422);
  });

  it('une présence pointée un jour dispensé l’emporte (accueil réel)', () => {
    const c = contract({ end: '2026-11-30', rupture: { motif: 'retrait', notif: '2026-11-23', preavis: 'employeur', dernierJourTravaille: '2026-11-26' } });
    const ctx = makeCtx(c, [{ key: 'c1|2026-11-27', cid: 'c1', date: '2026-11-27', pres: [{ a: '08:00', d: '17:00' }] }], [], '2026-12-31');
    expect(dayInfo(ctx, '2026-11-27').kind).toBe('present');
  });

  it('contrôle de la date de fin enregistrée (calcul des mois)', () => {
    const r = { motif: 'retrait' as const, notif: '2026-11-23', preavis: 'employeur' as const, dernierJourTravaille: '2026-11-26' };
    expect(controleFinContrat({ start: '2026-09-14', end: '2026-11-30', rupture: r })).toBeUndefined();
    // Lendemain admis : date de fin du préavis à confirmer (jour de remise compté ou non).
    expect(controleFinContrat({ start: '2026-09-14', end: '2026-12-01', rupture: r })).toBeUndefined();
    expect(controleFinContrat({ start: '2026-09-14', end: '2026-11-26', rupture: r })?.message).toMatch(/date prévue de fin du préavis/);
    expect(controleFinContrat({ start: '2026-09-14', end: '2026-11-30', rupture: { ...r, dernierJourTravaille: undefined } })).toBeDefined();
    expect(controleFinContrat({ start: '2026-09-14', end: '2026-11-30', rupture: { ...r, dernierJourTravaille: '2026-12-02' } })).toBeDefined();
    // Écran Fin : fin de contrat saisie au dernier jour travaillé, refusée avec la règle.
    const f = finDeContrat(ctxDe(contract({ end: '2026-11-26' })), '2026-11-23', 'retrait', 0, undefined, DISPENSE);
    expect(f.nonGere?.join(' ')).toMatch(/date prévue de fin du préavis/);
  });

  it('dispense totale dès la remise de la lettre : tout le préavis est payé, sans entretien', () => {
    const f = finDeContrat(ctxDe(contract()), '2026-11-23', 'retrait', 0, undefined, { demandeur: 'employeur', dernierJourTravaille: '2026-11-23' });
    expect(f.nonGere).toBeUndefined();
    expect(f.dispense).toMatchObject({ du: '2026-11-24', au: '2026-11-30' });
    // 24, 25, 26, 27 et 30/11 : 45 h sur 189 h.
    expect(f.dispense!.net).toBe(Math.round((MENSUALISE * 45) / 189));
  });

  it('dispense demandée par l’AM et acceptée : inchangé (fin au dernier jour travaillé, rien pour la suite)', () => {
    const f = finDeContrat(ctxDe(contract()), '2026-11-23', 'retrait', 0, undefined, { demandeur: 'am_acceptee', dernierJourTravaille: '2026-11-26' });
    expect(f.dernierJour).toBe('2026-11-26');
    expect(f.dispense).toBeUndefined();
  });

  it('départ sans accord des parents : toujours refusé', () => {
    const f = finDeContrat(ctxDe(contract()), '2026-11-23', 'demission', 0, undefined, { demandeur: 'am_sans_accord', dernierJourTravaille: '2026-11-26' });
    expect(f.nonGere?.length).toBeGreaterThan(0);
  });

  it('9 mois atteints à la lettre : indemnité de rupture « à confirmer », avec et sans l’indemnité de préavis', () => {
    const c = contract({ start: '2025-09-01', trackedFrom: '2025-09-01', planning: week('08:00', '16:00'), rateNet: 500 });
    // Un an et plus : préavis d'un mois, du 01/10 au 31/10/2026 ; dispense après le 10/10.
    const f = finDeContrat(ctxDe(c), '2026-10-01', 'retrait', 0, undefined, { demandeur: 'employeur', dernierJourTravaille: '2026-10-09' });
    expect(f.nonGere).toBeUndefined();
    expect(f.dernierJour).toBe('2026-10-31');
    expect(f.ruptureAConfirmer).toBe(true);
    const avec = Math.round(f.totalBrut / 80);
    const sans = Math.round((f.totalBrut - f.dispense!.brut) / 80);
    expect(avec).not.toBe(sans);
    expect(f.ruptureVariantes).toContain(`Avec elle : ${euros(avec)} ; sans elle : ${euros(sans)}`);
  });

  it('9 mois atteints seulement à la fin du contrat : « à confirmer » (D-1), jamais compté', () => {
    // Début le 05/01/2026, lettre le 28/09/2026 : 8 mois ; préavis de 15 jours jusqu'au 12/10/2026 : 9 mois à la fin.
    const c = contract({ start: '2026-01-05', trackedFrom: '2026-01-05', planning: week('08:00', '16:00'), rateNet: 500 });
    const f = finDeContrat(ctxDe(c), '2026-09-28', 'retrait', 0, undefined, { demandeur: 'employeur', dernierJourTravaille: '2026-10-02' });
    expect(f.dernierJour).toBe('2026-10-12');
    expect(f.indemniteRupture).toBe(0);
    expect(f.ruptureAConfirmer).toBe(true);
    expect(f.ruptureVariantes).toMatch(/9 mois/);
  });

  it('année incomplète : régularisation « à confirmer » si elle dépend de la place des jours dispensés (D-2)', () => {
    const lundis = (from: string, n: number) => Array.from({ length: n }, (_, i) => {
      const d = new Date(`${from}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 7 * i); return d.toISOString().slice(0, 10);
    });
    const off = [...lundis('2025-10-20', 2), ...lundis('2025-12-22', 2), ...lundis('2026-02-16', 2), ...lundis('2026-04-13', 2), ...lundis('2026-07-06', 8), '2026-10-19'];
    const c = contract({ start: '2025-09-01', trackedFrom: '2025-09-01', yearType: 'incomplete', weeks: 36, weeksOff: off, planning: week('08:00', '16:00'), rateNet: 500, entretienJour: 0 });
    const f = finDeContrat(makeCtx(c, [], [], '2026-11-18'), '2026-06-10', 'retrait', 0, undefined, { demandeur: 'employeur', dernierJourTravaille: '2026-06-15' });
    expect(f.nonGere).toBeUndefined();
    expect(f.regularisationAConfirmer).toMatch(/dispensée/);
    expect(f.regularisation).toBe(0);
  });
});
