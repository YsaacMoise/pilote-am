// T-107 : les sept cas encore refusés, calculés (décision du DG du 25/11/2026 : « lance pour les 7 nouveaux cas »).
// Règles et sources : calculateur-arvela, regles/t107-*.md. Attendus tirés des textes cités, calculés à la main dans les
// commentaires. Cas 2 (démission enceinte) : tests/t045.test.ts ; cas 4 (fins de CDD) et 7 (essai) : tests/t076-cdd.test.ts ;
// cas 3 (47 à 51 semaines) : tests/t031.test.ts.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Contract, Rupture } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { computeMonth } from '../src/engine/month';
import { finDeContrat } from '../src/engine/fin';
import { controleFinContrat } from '../src/engine/preavis';
import { cpPendantPreavis, finPreavisProrogee } from '../src/engine/suspensions';
import { dureeEvenement, libelleDureeSaisie, statutJourEvenement } from '../src/engine/evenements';
import { absenceSaisie } from '../src/engine/absences';

const plage = [{ start: '08:00', end: '16:00' }];
const contrat = (over: Partial<Contract> = {}): Contract => ({
  id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2024-09-01', yearType: 'complete', weeks: 52, weeksOff: [],
  planning: { 1: plage, 2: plage, 3: plage, 4: plage, 5: plage }, rateNet: 500, majoration: 10, entretienJour: 0, repasPrix: 0,
  repasParJour: 0, kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2024-09-01',
  balances: { cpRestants: 30, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0,
  alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false, departement: '31', ...over,
} as Contract);
const abs = (type: AmLeave['type'], from: string, to: string, over: Partial<AmLeave> = {}): AmLeave => ({ id: `${type}${from}`, type, from, to, ...over });

describe('T-107, cas 1 : congés payés pendant le préavis (CCN 64.1, troisième cas, accord écrit de cumul)', () => {
  // Retrait remis en main propre le 15/10/2026, plus d'un an d'ancienneté : préavis d'un mois, du 15/10 au 14/11/2026 (CCN 120).
  // Congés payés du lundi 02/11 au vendredi 06/11/2026 : 5 jours calendaires dans le préavis.
  const cp = [abs('cp', '2026-11-02', '2026-11-06')];
  const ctx = (c = contrat(), leaves = cp) => makeCtx(c, [], leaves, '2027-06-30');
  it('sans réponse : la question de l’accord écrit est posée, aucun montant', () => {
    const f = finDeContrat(ctx(), '2026-10-15', 'retrait');
    expect(f.nonGere?.join(' ')).toMatch(/accord écrit et signé.*article 64\.1/);
    expect(f.indemniteRupture + f.cpIndemnite).toBe(0);
  });
  it('sans accord : préavis prorogé des 5 jours de congés, fin le 19/11/2026', () => {
    const f = finDeContrat(ctx(), '2026-10-15', 'retrait', 0, undefined, undefined, undefined, { cumulCpPreavis: false });
    expect(f.nonGere).toBeUndefined();
    expect(f.preavisFin).toBe('2026-11-19');
    expect(f.dernierJour).toBe('2026-11-19');
    expect(f.alertes.join(' ')).toMatch(/congés payés pris sans accord écrit de cumul.*5 jours plus tard, le 19\/11\/2026/);
  });
  it('avec accord écrit et signé : pas de suspension, fin le 14/11/2026', () => {
    const f = finDeContrat(ctx(), '2026-10-15', 'retrait', 0, undefined, undefined, undefined, { cumulCpPreavis: true });
    expect(f.nonGere).toBeUndefined();
    expect(f.dernierJour).toBe('2026-11-14');
    expect(f.alertes.join(' ')).toMatch(/accord écrit et signé.*pas suspendu/);
  });
  it('congés hors du préavis : aucune question, fin inchangée', () => {
    const f = finDeContrat(ctx(contrat(), [abs('cp', '2026-11-16', '2026-11-20')]), '2026-10-15', 'retrait');
    expect(f.nonGere).toBeUndefined();
    expect(f.dernierJour).toBe('2026-11-14');
  });
  it('congés qui commencent dans la prorogation d’un autre congé : comptés aussi (jusqu’au 14/11 + 5, puis + 2)', () => {
    // 02-06/11 prorogent au 19/11 ; des congés les 18 et 19/11 tombent alors dans le préavis : 2 jours de plus, fin le 21/11.
    const l = [...cp, abs('cp', '2026-11-18', '2026-11-19')];
    expect(cpPendantPreavis('2026-10-15', '2026-11-14', [abs('cp', '2026-11-18', '2026-11-19')])).toBe(false);
    expect(finPreavisProrogee('2026-10-15', '2026-11-14', l, false)).toBe('2026-11-21');
    expect(finPreavisProrogee('2026-10-15', '2026-11-14', l, true)).toBe('2026-11-14');
  });
  it('préavis dont les parents dispensent l’AM : pas de question de cumul (la fin est la date prévue de fin du préavis)', () => {
    const f = finDeContrat(ctx(), '2026-10-15', 'retrait', 0, undefined, { demandeur: 'employeur', dernierJourTravaille: '2026-10-30' });
    expect(f.dernierJour).toBe('2026-11-14');
    expect(f.nonGere?.join(' ') ?? '').not.toMatch(/accord écrit/);
    // Reste hors T-107 : une absence notée pendant les jours dispensés est encore refusée (T-074, D1 ; rapport T-107).
    expect(f.nonGere?.join(' ')).toMatch(/pendant le préavis dont les parents t’ont dispensée/);
  });
  it('mois : la date de fin enregistrée est contrôlée avec la réponse ; sans réponse, la question, demandée une fois', () => {
    const r = (x: Partial<Rupture>): Rupture => ({ motif: 'retrait', notif: '2026-10-15', preavis: 'execute', ...x });
    expect(controleFinContrat(contrat({ end: '2026-11-19', rupture: r({ cumulCpPreavis: false }) }), cp)).toBeUndefined();
    expect(controleFinContrat(contrat({ end: '2026-11-14', rupture: r({ cumulCpPreavis: true }) }), cp)).toBeUndefined();
    expect(controleFinContrat(contrat({ end: '2026-11-14', rupture: r({ cumulCpPreavis: false }) }), cp)?.message).toMatch(/ne concorde pas.*19\/11\/2026/);
    expect(controleFinContrat(contrat({ end: '2026-11-19', rupture: r({}) }), cp)?.message).toMatch(/accord écrit et signé/);
    const m = computeMonth(ctx(contrat({ end: '2026-11-19', rupture: r({ cumulCpPreavis: false }) })), '2026-11');
    expect(m.nonGere).toEqual([]);
  });
});

describe('T-107, cas 2 : contrôle du mois (démission enceinte, CT L1225-34)', () => {
  const r = (x: Partial<Rupture>): Rupture => ({ motif: 'demission', notif: '2026-10-01', preavis: 'am_sans_accord', dernierJourTravaille: '2026-10-10', ...x });
  it('T-109 : aucune question sur la grossesse ; la fin au dernier jour travaillé concorde', () => {
    expect(controleFinContrat(contrat({ end: '2026-10-10', rupture: r({}) }))).toBeUndefined();
    expect(controleFinContrat(contrat({ end: '2026-10-31', rupture: r({}) }))?.message).toMatch(/n’est pas le dernier jour travaillé/);
  });
});

describe('T-107, cas 5 : CDI rompu par la suspension, la modification ou le retrait de l’agrément (CCN 119.3, 121.1)', () => {
  const ctx = () => makeCtx(contrat(), [], [], '2027-06-30');
  it('sans préavis, à la date de la décision du conseil départemental ; ni indemnité de rupture, congés non pris payés', () => {
    const f = finDeContrat(ctx(), '2026-10-15', 'agrement');
    expect(f.nonGere).toBeUndefined();
    expect(f.preavisFin).toBe('2026-10-15');
    expect(f.dernierJour).toBe('2026-10-15');
    expect(f.indemniteRupture).toBe(0);
    expect(f.ruptureExplication).toMatch(/119\.3 et 121\.1/);
    expect(f.cpIndemnite).toBeGreaterThan(0);
    // Mêmes congés non pris qu'une fin sans préavis le même jour (faute grave) : seule la date de fin compte (CCN 67, 123).
    expect(f.cpIndemnite).toBe(finDeContrat(ctx(), '2026-10-15', 'faute_grave').cpIndemnite);
    expect(f.alertes.join(' ')).toMatch(/119\.3/);
  });
  it('un préavis non fait n’a pas de sens ici : refusé avec un message clair', () => {
    const f = finDeContrat(ctx(), '2026-10-15', 'agrement', 0, undefined, { demandeur: 'am_acceptee', dernierJourTravaille: '2026-10-15' });
    expect(f.nonGere?.join(' ')).toMatch(/n’a pas de préavis/);
  });
  it('mois : la date de fin enregistrée est la date de la décision', () => {
    const r: Rupture = { motif: 'agrement', notif: '2026-10-15', preavis: 'execute' };
    expect(controleFinContrat(contrat({ end: '2026-10-15', rupture: r }))).toBeUndefined();
    expect(computeMonth(makeCtx(contrat({ end: '2026-10-15', rupture: r }), [], [], '2027-06-30'), '2026-10').nonGere).toEqual([]);
  });
});

describe('T-107, cas 6 : événement familial commencé avant 2022 (ancienne CCN, art. 13 ; C. trav. L3142-4 à la date)', () => {
  it('durées : la plus favorable de l’ancienne convention et de L3142-4 à la date', () => {
    // 20/12/2021 : L3142-4 version du 19/12/2021 ; ancienne CCN, art. 13.
    expect(dureeEvenement('mariage', '2021-12-20')).toBe(4); // 4 et 4
    expect(dureeEvenement('mariage_enfant', '2021-12-20')).toBe(1);
    expect(dureeEvenement('naissance', '2021-12-20')).toBe(3);
    expect(dureeEvenement('deces_enfant', '2021-12-20')).toBe(5); // CCN 2, L3142-4 5
    expect(dureeEvenement('deces_enfant_14', '2021-12-20')).toBe(7); // CCN 2, L3142-4 « sept jours ouvrés »
    expect(dureeEvenement('deces_enfant_14', '2020-06-30')).toBe(5); // version du 10/08/2016 : cinq jours
    expect(dureeEvenement('deces_proche', '2021-12-20')).toBe(3); // CCN 1 ou 2, L3142-4 3
    expect(dureeEvenement('handicap_enfant', '2021-12-20')).toBe(2);
    expect(dureeEvenement('deces_ascendant', '2021-12-20')).toBe(1); // CCN : grand-parent
    expect(dureeEvenement('deces_descendant', '2021-12-20')).toBeUndefined(); // aucun texte
    expect(dureeEvenement('deuil', '2021-12-20')).toBe(8); // L3142-1-1, depuis le 01/07/2020
    expect(dureeEvenement('deuil', '2020-06-30')).toBeUndefined();
    expect(dureeEvenement('mariage', '2016-08-09')).toBeUndefined();
    // À partir de 2022 : inchangé (CCN 3239).
    expect(dureeEvenement('deces_enfant_14', '2022-01-03')).toBe(9);
  });
  it('saisie : aucun congé (petit-enfant avant 2022) : rien n’est enregistré, l’écran dit quoi saisir', () => {
    expect(absenceSaisie('evenement', 'deces_descendant', 'x', '2021-12-20', '2021-12-21')).toBeUndefined();
    expect(libelleDureeSaisie('deces_descendant', '2021-12-20')).toMatch(/Pas de congé.*congé payé ou sans solde/);
    expect(libelleDureeSaisie('mariage', '2021-12-20')).toBe('4 jours ouvrables payés');
    expect(libelleDureeSaisie('deces_enfant_14', '2021-12-20')).toMatch(/7 jours ouvrés/);
    // T-109 : aucune marque qui révèle l'événement ; seulement le nombre de jours (8 jours ouvrables jusqu'au 7e jour travaillé).
    const ouvres = absenceSaisie('evenement', 'deces_enfant_14', 'x', '2021-12-31', '2022-01-11', [contrat({ start: '2021-09-01' })])!;
    // T-109 (second contrôle) : un seul nombre, sans champ propre à ce cas.
    expect(ouvres).toEqual({ id: 'x', type: 'evenement', from: '2021-12-31', to: '2022-01-11', joursEvenement: 8 });
  });
  it('sept jours ouvrés : jours de travail prévus (lundi au vendredi), fériés exclus : payé le 10/01, retenu le 11/01/2022', () => {
    // Du vendredi 31/12/2021 au mardi 11/01/2022. Jours ouvrés : 31/12 (1) ; samedi 01/01 férié et sans accueil ; 03 au 07/01
    // (2 à 6) ; lundi 10/01 (7) : payés. Mardi 11/01 : 8e, retenu. T-109 : converti à la saisie en jours ouvrables jusqu'au
    // 7e jour travaillé : 31/12, 03 au 08/01 et 10/01 = 8 jours ouvrables ; le calcul paie les mêmes jours.
    const l = absenceSaisie('evenement', 'deces_enfant_14', 'e1', '2021-12-31', '2022-01-11', [contrat({ start: '2021-09-01' })])!;
    expect(statutJourEvenement(l, '2022-01-10', [l], 7)).toEqual({ paye: true });
    const st = statutJourEvenement(l, '2022-01-11', [l], 7);
    expect(st.paye).toBe(false);
    expect(!st.paye && st.raison).toMatch(/8 jours ouvrables au plus.*ancienne convention, article 13/);
  });
  it('jours ouvrables (mariage du 31/12/2021) : 4 jours, samedi compris ; le 5e jour ouvrable est retenu', () => {
    // 31/12 (1), samedi 01/01 férié (ne compte pas), lundi 03/01 (2), 04/01 (3), 05/01 (4) ; 06/01 retenu.
    const l = absenceSaisie('evenement', 'mariage', 'e2', '2021-12-31', '2022-01-06')!;
    expect(statutJourEvenement(l, '2022-01-05', [l])).toEqual({ paye: true });
    expect(statutJourEvenement(l, '2022-01-06', [l]).paye).toBe(false);
  });
  it('ancienne saisie sans durée (0) : la durée est demandée une fois, en saisissant l’absence de nouveau', () => {
    const st = statutJourEvenement(abs('evenement', '2021-12-30', '2022-01-04', { joursEvenement: 0 }), '2022-01-03');
    expect(st.paye).toBe(false);
    expect(!st.paye && st.raison).toMatch(/saisis-la de nouveau en choisissant l’événement/);
    expect(!st.paye && st.raison).not.toMatch(/ne la calcule pas|non géré/);
  });
});
