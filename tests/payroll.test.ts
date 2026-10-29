import { describe, expect, it } from 'vitest';
import type { AmLeave, Contract, DayRec, Planning } from '../src/engine/model';
import { makeCtx, salaireMensualise, joursMensualises, mensuelMinutes, monthBase, sickDeductible, dayInfo } from '../src/engine/payroll';
import { computeMonth, declarationLines } from '../src/engine/month';
import { acquisition, compteur, cpForMonth, indemnite, joursOuvrables } from '../src/engine/conges';
import { finDeContrat } from '../src/engine/fin';
import { fiscalYear } from '../src/engine/fiscal';
import { controle } from '../src/engine/controle';
import { entretienPlancher, netToBrut } from '../src/engine/rates';
import { holidayName } from '../src/engine/holidays';
import { parseEuros, euros } from '../src/engine/money';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}

function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2026-01-05', yearType: 'complete', weeks: 52, weeksOff: [],
    planning: week('08:00', '17:00'), rateNet: 350, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2026-01-05',
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, ...over,
  };
}

const rec = (date: string, r: Partial<DayRec>): DayRec => ({ key: `c1|${date}`, cid: 'c1', date, ...r });

describe('mensualisation (art. 109)', () => {
  it('année complète : 45 h × 52 ÷ 12 = 195 h, à 3,50 € net = 682,50 €', () => {
    const c = contract();
    expect(mensuelMinutes(c)).toBe(195 * 60);
    expect(salaireMensualise(c)).toBe(68250);
    expect(joursMensualises(c)).toBe(22); // 5 × 52 ÷ 12 = 21,67 → 22
  });
  it('année incomplète 46 semaines : 45 h × 46 ÷ 12 = 172,5 h → 603,75 €', () => {
    const c = contract({ yearType: 'incomplete', weeks: 46 });
    expect(salaireMensualise(c)).toBe(60375);
    expect(joursMensualises(c)).toBe(20); // 5 × 46 ÷ 12 = 19,17 → 20
  });
  it('40 h par semaine, 52 semaines, 3,50 € → 606,67 €', () => {
    expect(salaireMensualise(contract({ planning: week('08:00', '16:00') }))).toBe(60667);
  });
  it('planning avec deux plages le même jour', () => {
    const p: Planning = { 1: [{ start: '07:30', end: '09:00' }, { start: '16:30', end: '18:30' }] };
    const c = contract({ planning: p });
    expect(mensuelMinutes(c)).toBeCloseTo((3.5 * 60 * 52) / 12);
  });
  it('heures contractuelles au-delà de 45 h majorées dans la mensualisation', () => {
    // 50 h par semaine : 45 h × 3,50 + 5 h × 3,85 = 176,75 € × 52 ÷ 12 = 765,92 €
    const c = contract({ planning: week('08:00', '18:00') });
    expect(salaireMensualise(c)).toBe(76592);
  });
});

describe('retenue pour absence (art. 111)', () => {
  const leaves: AmLeave[] = [{ id: 'l1', type: 'am_malade', from: '2026-10-12', to: '2026-10-13' }];
  it('année complète : méthode des heures', () => {
    const ctx = makeCtx(contract(), [], leaves, '2026-11-15');
    const b = monthBase(ctx, '2026-10');
    expect(b.divisorDays).toBe(22);
    expect(b.divisorMin).toBe(22 * 9 * 60);
    expect(b.deductedMin).toBe(18 * 60);
    // 682,50 × 180 ÷ 198 = 620,45
    expect(b.base).toBe(62045);
    expect(b.retenue).toBe(68250 - 62045);
    expect(b.heuresNormales).toBe(177); // 195 × 180/198 = 177,27
    expect(b.joursActivite).toBe(20);
  });
  it('année incomplète : méthode des jours', () => {
    const ctx = makeCtx(contract({ yearType: 'incomplete', weeks: 46 }), [], leaves, '2026-11-15');
    const b = monthBase(ctx, '2026-10');
    // 603,75 × 20 ÷ 22 = 548,86
    expect(b.base).toBe(54886);
  });
  it('absence voulue par les parents : payée', () => {
    const ctx = makeCtx(contract(), [rec('2026-10-14', { abs: 'parents' })], [], '2026-11-15');
    expect(monthBase(ctx, '2026-10').base).toBe(68250);
  });
  it('jour férié chômé : payé et hors diviseur', () => {
    const ctx = makeCtx(contract(), [], [], '2026-12-15');
    const b = monthBase(ctx, '2026-11'); // 11 novembre 2026 = mercredi
    expect(holidayName('2026-11-11')).toBe('11 novembre');
    expect(b.base).toBe(68250);
    expect(b.divisorDays).toBe(20); // 21 jours de semaine − 1 férié
  });
  it('mois d’entrée : prorata des heures prévues', () => {
    // Début le jeudi 15 octobre 2026 : 12 jours prévus sur 22
    const ctx = makeCtx(contract({ start: '2026-10-15', trackedFrom: '2026-10-15' }), [], [], '2026-11-15');
    const b = monthBase(ctx, '2026-10');
    expect(b.contractDays).toBe(12);
    expect(b.base).toBe(Math.round((68250 * 12) / 22));
    expect(b.joursActivite).toBe(12);
  });
});

describe('enfant malade (art. 105)', () => {
  it('5 jours d’absences courtes retenus, puis payés', () => {
    const recs = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-16', '2026-03-17', '2026-03-18', '2026-03-19']
      .map((d) => rec(d, { abs: 'malade_certif' }));
    const ctx = makeCtx(contract(), recs, [], '2026-04-01');
    const s = sickDeductible(ctx);
    expect([...s].sort()).toEqual(['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-16', '2026-03-17']);
    expect(dayInfo(ctx, '2026-03-18').deducted).toBe(false);
    expect(monthBase(ctx, '2026-03').alerts.join(' ')).toMatch(/restent payés/);
  });
  it('une longue absence : retenue sur 14 jours calendaires consécutifs', () => {
    // du lundi 9 au vendredi 20 mars puis lundi 23 : 11 jours prévus, 23 mars hors des 14 jours
    const days = ['09', '10', '11', '12', '13', '16', '17', '18', '19', '20', '23'].map((d) => rec(`2026-03-${d}`, { abs: 'malade_certif' }));
    const ctx = makeCtx(contract(), days, [], '2026-04-01');
    const s = sickDeductible(ctx);
    expect(s.size).toBe(10);
    expect(s.has('2026-03-23')).toBe(false);
  });
  it('sans certificat : payé', () => {
    const ctx = makeCtx(contract(), [rec('2026-03-02', { abs: 'malade' })], [], '2026-04-01');
    expect(monthBase(ctx, '2026-03').base).toBe(68250);
  });
  it('jours déjà déduits avant l’app (solde de départ)', () => {
    const c = contract({ start: '2025-09-01', trackedFrom: '2026-01-01', balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 4 } });
    const ctx = makeCtx(c, [rec('2026-03-02', { abs: 'malade_certif' }), rec('2026-03-03', { abs: 'malade_certif' })], [], '2026-04-01');
    expect(sickDeductible(ctx).size).toBe(1);
  });
});

describe('heures complémentaires et majorées (art. 96 et 110)', () => {
  it('jusqu’à 45 h au taux du contrat', () => {
    // contrat 40 h (8 h–16 h) ; le lundi 5 octobre départ à 18 h → 2 h complémentaires
    const c = contract({ planning: week('08:00', '16:00') });
    const ctx = makeCtx(c, [rec('2026-10-05', { pres: [{ a: '08:00', d: '18:00' }] })], [], '2026-11-01');
    const b = monthBase(ctx, '2026-10');
    expect(b.complMin).toBe(120);
    expect(b.majMin).toBe(0);
    expect(b.complAmount).toBe(700);
  });
  it('au-delà de 45 h majorées de 10 %', () => {
    // contrat 44 h (8 h–16 h 48) ; +2 h 12 dans la semaine → 1 h complémentaire, 1 h 12 majorée
    const c = contract({ planning: week('08:00', '16:48') });
    const recs = [rec('2026-10-05', { pres: [{ a: '08:00', d: '18:00' }] }), rec('2026-10-06', { pres: [{ a: '07:00', d: '16:48' }] })];
    const ctx = makeCtx(c, recs, [], '2026-11-01');
    const b = monthBase(ctx, '2026-10');
    expect(b.complMin).toBe(60);
    expect(b.majMin).toBe(72);
    expect(b.majAmount).toBe(Math.round((72 * 350 * 110) / 100 / 60)); // 4,62 €
  });
  it('arrivée tardive sans incidence (payée)', () => {
    const ctx = makeCtx(contract(), [rec('2026-10-05', { pres: [{ a: '10:00', d: '17:00' }] })], [], '2026-11-01');
    const b = monthBase(ctx, '2026-10');
    expect(b.base).toBe(68250);
    expect(b.complMin).toBe(0);
  });
  it('départ oublié : signalé, heure prévue retenue', () => {
    const ctx = makeCtx(contract(), [rec('2026-10-05', { pres: [{ a: '08:00' }] })], [], '2026-11-01');
    const di = dayInfo(ctx, '2026-10-05');
    expect(di.departOublie).toBe(true);
    expect(di.presentMin).toBe(540);
    expect(monthBase(ctx, '2026-10').forgotten).toEqual(['2026-10-05']);
  });
});

describe('jours fériés (art. 47)', () => {
  it('1er mai travaillé : +100 %', () => {
    const ctx = makeCtx(contract(), [rec('2026-05-01', { ferieTravaille: true })], [], '2026-06-01');
    const b = monthBase(ctx, '2026-05');
    expect(b.ferieAmount).toBe(3150); // 9 h × 3,50 €
  });
  it('autre férié travaillé : +10 %', () => {
    const ctx = makeCtx(contract(), [rec('2026-05-14', { ferieTravaille: true })], [], '2026-06-01'); // Ascension
    expect(monthBase(ctx, '2026-05').ferieAmount).toBe(315);
  });
});

describe('indemnité d’entretien (art. 114.1)', () => {
  it('max(2,65 €, MG ÷ 10 par heure)', () => {
    expect(entretienPlancher('2026-06-10', 540)).toBe(392); // 4,35 × 9 ÷ 10 = 3,915
    expect(entretienPlancher('2026-03-10', 540)).toBe(383); // 4,25 × 9 ÷ 10 = 3,825
    expect(entretienPlancher('2026-06-10', 300)).toBe(265); // 2,175 < 2,65
  });
  it('compte par jour d’accueil, pas les jours d’absence', () => {
    const ctx = makeCtx(contract(), [rec('2026-10-05', { abs: 'parents' })], [], '2026-11-01');
    const b = monthBase(ctx, '2026-10');
    expect(b.presenceDays).toBe(21);
    expect(b.entretien).toBe(21 * 392);
  });
  it('repas et kilomètres', () => {
    const c = contract({ repasPrix: 300, repasParJour: 1, kmTaux: 41 });
    const ctx = makeCtx(c, [rec('2026-10-05', { repas: 2, km: 12 })], [], '2026-11-01');
    const b = monthBase(ctx, '2026-10');
    expect(b.repas).toBe(23 * 300);
    expect(b.km).toBe(492);
  });
});

describe('congés payés (art. 48 et 102)', () => {
  it('période complète : 30 jours au plus', () => {
    const ctx = makeCtx(contract({ start: '2025-06-01', trackedFrom: '2025-06-01' }), [], [], '2026-06-15');
    expect(acquisition(ctx, 2025).jours).toBe(30);
  });
  it('année incomplète 46 semaines : 46 ÷ 4 × 2,5 = 28,75 → 29 jours', () => {
    const ctx = makeCtx(contract({ start: '2025-06-01', trackedFrom: '2025-06-01', yearType: 'incomplete', weeks: 46 }), [], [], '2026-06-15');
    expect(acquisition(ctx, 2025).jours).toBe(29);
    expect(acquisition(ctx, 2025, 1).jours).toBe(30); // +2 par enfant à charge, plafonné à 30
  });
  it('début en cours de période : arrondi au supérieur', () => {
    // 1er sept. 2026 → 31 mai 2027 : 273 jours = 39 semaines → 24,375 → 25
    const ctx = makeCtx(contract({ start: '2026-09-01', trackedFrom: '2026-09-01' }), [], [], '2027-06-15');
    expect(acquisition(ctx, 2026).jours).toBe(25);
  });
  it('jours ouvrables : lundi à samedi hors fériés', () => {
    expect(joursOuvrables('2026-08-10', '2026-08-23').length).toBe(11); // 15 août férié (samedi)
  });
  it('compteur : soldes de départ et prise', () => {
    const c = contract({ start: '2024-09-01', trackedFrom: '2026-07-01', balances: { cpRestants: 20, cpEnCours: 2.5, maladieDeduits: 0 } });
    const ctx = makeCtx(c, [], [{ id: 'l', type: 'cp', from: '2026-08-03', to: '2026-08-15' }], '2026-09-01');
    const k = compteur(ctx, '2026-09-01');
    expect(k.aPrendre).toBe(20);
    expect(k.pris).toBe(11); // 3 → 15 août, sans le 15 (férié) ni les dimanches
    expect(k.reste).toBe(9);
  });
  it('année incomplète : indemnité en juin = max(dixième, maintien)', () => {
    const c = contract({ start: '2025-06-01', trackedFrom: '2025-06-01', yearType: 'incomplete', weeks: 46 });
    const ctx = makeCtx(c, [], [], '2026-07-01');
    const ind = indemnite(ctx, 2025);
    // base : 12 × 603,75 € = 7 245 € → dixième 724,50 € ; maintien 29 j ÷ 6 × 45 h × 3,50 = 761,25 €
    expect(ind.dixieme).toBe(72450);
    expect(ind.maintien).toBe(76125);
    expect(ind.montant).toBe(76125);
    const juin = cpForMonth(ctx, '2026-06');
    expect(juin.indemnite).toBe(76125);
    expect(juin.jours).toBe(29);
    const r = computeMonth(ctx, '2026-06');
    expect(r.netTotal).toBe(60375 + 76125);
  });
  it('année complète : complément du dixième en juin seulement s’il est plus favorable', () => {
    const c = contract({ start: '2025-06-01', trackedFrom: '2025-06-01' });
    const ctx = makeCtx(c, [], [], '2026-07-01');
    const ind = indemnite(ctx, 2025);
    // dixième 819,00 € ; maintien 30 ÷ 6 × 45 × 3,50 = 787,50 € → complément 31,50 €
    expect(ind.dixieme).toBe(81900);
    expect(ind.maintien).toBe(78750);
    expect(cpForMonth(ctx, '2026-06').complement).toBe(3150);
  });
  it('versement au fur et à mesure', () => {
    const c = contract({ start: '2025-06-01', trackedFrom: '2025-06-01', yearType: 'incomplete', weeks: 46, cpMode: 'fur' });
    const ctx = makeCtx(c, [], [{ id: 'l', type: 'cp', from: '2026-07-06', to: '2026-07-11' }], '2026-08-01');
    const juil = cpForMonth(ctx, '2026-07');
    expect(juil.jours).toBe(6);
    expect(juil.indemnite).toBe(Math.round((76125 * 6) / 29));
  });
});

describe('fin de contrat (art. 120, 121, 124)', () => {
  it('préavis selon l’ancienneté', () => {
    const mk = (start: string) => makeCtx(contract({ start, trackedFrom: start }), [], [], '2026-10-28');
    expect(finDeContrat(mk('2026-09-01'), '2026-10-28', 'retrait').preavisLabel).toBe('8 jours calendaires');
    expect(finDeContrat(mk('2026-03-01'), '2026-10-28', 'retrait').preavisLabel).toBe('15 jours calendaires');
    expect(finDeContrat(mk('2025-01-06'), '2026-10-28', 'demission').preavisLabel).toBe('1 mois');
  });
  it('indemnité de rupture : 1/80e des bruts dès 9 mois', () => {
    const c = contract({ start: '2026-01-05', trackedFrom: '2026-01-05' });
    const ctx = makeCtx(c, [], [], '2026-12-31');
    const f = finDeContrat(ctx, '2026-10-30', 'retrait');
    expect(f.ancienneteMois).toBe(9);
    expect(f.indemniteRupture).toBe(Math.round(f.totalBrut / 80));
    expect(f.indemniteRupture).toBeGreaterThan(0);
    const f2 = finDeContrat(makeCtx(contract({ start: '2026-05-04', trackedFrom: '2026-05-04' }), [], [], '2026-12-31'), '2026-10-30', 'retrait');
    expect(f2.indemniteRupture).toBe(0);
    // Décès de l'enfant : 9 mois d'ancienneté exigés aussi (art. 119.4.2, fiche DREETS)
    const f3 = finDeContrat(makeCtx(contract({ start: '2026-05-04', trackedFrom: '2026-05-04' }), [], [], '2026-12-31'), '2026-10-30', 'deces');
    expect(f3.indemniteRupture).toBe(0);
    const f4 = finDeContrat(makeCtx(contract({ start: '2026-01-05', trackedFrom: '2026-01-05' }), [], [], '2026-12-31'), '2026-10-30', 'deces');
    expect(f4.indemniteRupture).toBeGreaterThan(0);
  });
  it('historique incomplet signalé', () => {
    const c = contract({ start: '2025-09-01', trackedFrom: '2026-09-01', history: [{ month: '2025-09', net: 50000, source: 'manuel' }] });
    const f = finDeContrat(makeCtx(c, [], [], '2026-10-28'), '2026-10-28', 'retrait');
    expect(f.manquants.length).toBe(11);
    expect(f.alertes[0]).toMatch(/Historique incomplet/);
  });
  it('régularisation en année incomplète si des heures prévues n’ont pas été payées', () => {
    // 46 semaines payées, mais aucune semaine sans accueil saisie : 3 mois accueillis à temps plein
    const c = contract({ start: '2026-01-05', trackedFrom: '2026-01-05', yearType: 'incomplete', weeks: 46 });
    const f = finDeContrat(makeCtx(c, [], [], '2026-04-30'), '2026-03-20', 'retrait');
    expect(f.regulMinutes).toBeGreaterThan(0);
    expect(f.regularisation).toBe(Math.round((f.regulMinutes * 350) / 60));
  });
});

describe('fiscal (CGI art. 80 sexies)', () => {
  it('3 SMIC par jour d’au moins 8 h, plafonné aux sommes reçues', () => {
    const c = contract({ start: '2026-10-01', trackedFrom: '2026-10-01' });
    const ctx = makeCtx(c, [], [], '2026-10-31');
    const f = fiscalYear(ctx, 2026);
    expect(f.jours).toBe(22);
    expect(f.abattementBrut).toBe(22 * 3 * 1231);
    expect(f.abattement).toBe(Math.min(f.abattementBrut, f.recu));
    expect(f.imposable).toBe(f.recu - f.abattement);
  });
  it('prorata sous 8 h et majoration à 4 SMIC', () => {
    const c = contract({ start: '2026-10-01', trackedFrom: '2026-10-01', planning: week('08:00', '12:00'), majoreFiscal: true });
    const f = fiscalYear(makeCtx(c, [], [], '2026-10-31'), 2026);
    expect(f.abattementBrut).toBe(Math.round(22 * 4 * 1231 * 0.5));
    expect(f.joursCourts).toBe(22);
  });
});

describe('contrôle du bulletin', () => {
  it('détecte un net trop faible et un brut incohérent', () => {
    const ctx = makeCtx(contract(), [], [], '2026-11-01');
    const r = computeMonth(ctx, '2026-10');
    const checks = controle({ id: 'b', cid: 'c1', month: '2026-10', net: r.netTotal - 3000, brut: r.netTotal, source: 'manuel' }, r, 350);
    expect(checks.some((x) => x.level === 'warn' && /manque 30,00/.test(x.title))).toBe(true);
    expect(checks.some((x) => /incohérents/.test(x.title))).toBe(true);
  });
  it('bulletin conforme', () => {
    const ctx = makeCtx(contract({ rateNet: 400 }), [], [], '2026-11-01');
    const r = computeMonth(ctx, '2026-10');
    const checks = controle({ id: 'b', cid: 'c1', month: '2026-10', net: r.netTotal, brut: netToBrut(r.netTotal, '2026-10-31'), heures: r.heuresNormales, jours: r.joursActivite, source: 'manuel' }, r, 400);
    expect(checks.every((x) => x.level === 'ok')).toBe(true);
  });
});

describe('déclaration Pajemploi', () => {
  it('cases dans l’ordre de la déclaration', () => {
    const ctx = makeCtx(contract(), [], [], '2026-11-01');
    const lines = declarationLines(ctx, computeMonth(ctx, '2026-10'));
    expect(lines.map((l) => l.label)).toEqual([
      'Heures normales', 'Jours d’activité', 'Jours de congés payés', 'Heures complémentaires', 'Heures majorées',
      'Salaire net', 'Indemnités d’entretien', 'Frais de repas', 'Frais kilométriques',
    ]);
    expect(lines[0].value).toBe('195 h');
    expect(lines[5].value).toBe(euros(68250));
  });
});

describe('montants', () => {
  it('saisie en euros → centimes', () => {
    expect(parseEuros('3,28')).toBe(328);
    expect(parseEuros('3.5 €')).toBe(350);
    expect(parseEuros('abc')).toBeNull();
    expect(euros(123456)).toBe('1 234,56 €');
  });
});

describe('régressions (relecture indépendante)', () => {
  const deuxPlages: Planning = {};
  for (const d of [1, 2, 3, 4, 5]) deuxPlages[d] = [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '18:00' }];
  it('deux plages : une présence continue 8 h–18 h = 2 h en plus (la pause)', () => {
    const ctx = makeCtx(contract({ planning: deuxPlages }), [rec('2026-10-05', { pres: [{ a: '08:00', d: '18:00' }] })], [], '2026-11-01');
    expect(dayInfo(ctx, '2026-10-05').extraMin).toBe(120);
  });
  it('deux plages : présence l’après-midi seulement = rien en plus', () => {
    const ctx = makeCtx(contract({ planning: deuxPlages }), [rec('2026-10-05', { pres: [{ a: '14:00', d: '18:00' }] })], [], '2026-11-01');
    expect(dayInfo(ctx, '2026-10-05').extraMin).toBe(0);
  });
  it('année incomplète : accueil pendant une semaine sans accueil = heures complémentaires', () => {
    const c = contract({ yearType: 'incomplete', weeks: 40, weeksOff: ['2026-10-05'] });
    const ctx = makeCtx(c, [rec('2026-10-06', { pres: [{ a: '08:00', d: '17:00' }] })], [], '2026-11-01');
    const b = monthBase(ctx, '2026-10');
    expect(b.complMin).toBe(540);
    expect(b.majMin).toBe(0);
  });
  it('fin : congés déjà versés à la prise principale non payés deux fois', () => {
    const c = contract({ start: '2025-06-01', trackedFrom: '2025-06-01', yearType: 'incomplete', weeks: 46, cpMode: 'principale' });
    const leaves: AmLeave[] = [{ id: 'l', type: 'cp', from: '2026-08-03', to: '2026-08-14' }];
    const ctx = makeCtx(c, [], leaves, '2027-01-10');
    expect(cpForMonth(ctx, '2026-08').indemnite).toBe(76125);
    const f = finDeContrat(ctx, '2027-01-04', 'demission');
    const seul = finDeContrat(makeCtx({ ...c, cpMode: 'principale' }, [], leaves, '2027-01-10'), '2027-01-04', 'demission');
    // Rien de plus que la période en cours : la période précédente est soldée.
    expect(f.cpIndemnite).toBe(seul.cpIndemnite);
    const cur = indemnite(makeCtx({ ...c, end: f.dernierJour }, [], leaves, '2027-01-10'), 2026);
    expect(f.cpIndemnite).toBeLessThanOrEqual(Math.max(cur.dixieme, cur.maintien) + 1);
  });
  it('fin : régularisation d’une embauche en cours de mois sans double prorata', () => {
    const p: Planning = { 1: [{ start: '08:00', end: '17:00' }], 2: [{ start: '08:00', end: '17:00' }] };
    const c = contract({ start: '2026-03-16', trackedFrom: '2026-03-16', yearType: 'incomplete', weeks: 46, planning: p });
    const f = finDeContrat(makeCtx(c, [], [], '2026-04-30'), '2026-03-23', 'retrait');
    // Préavis jusqu’au 30 : 5 jours prévus sur 10 en mars → 69 h × 5/10 = 34,5 h payées ; dues : 16, 17, 23, 24, 30 = 45 h → 10,5 h
    expect(f.dernierJour).toBe('2026-03-30');
    expect(Math.round(f.regulMinutes / 6) / 10).toBeCloseTo((5 * 9) - 18 * 46 / 12 * 5 / 10, 0);
  });
  it('préavis : 1 mois à partir de l’annonce, dernier jour la veille du quantième', () => {
    const f = finDeContrat(makeCtx(contract({ start: '2024-01-08', trackedFrom: '2024-01-08' }), [], [], '2026-05-01'), '2026-03-15', 'retrait');
    expect(f.dernierJour).toBe('2026-04-14');
  });
  it('pointage un jour férié sans case cochée : compté comme travaillé', () => {
    const ctx = makeCtx(contract(), [rec('2026-05-14', { pres: [{ a: '08:00', d: '17:00' }] })], [], '2026-06-01');
    expect(monthBase(ctx, '2026-05').ferieAmount).toBe(315);
  });
});

describe('corrections après audit de paie (28/10/2026)', () => {
  it('Pajemploi : heures du contrat au-delà de 45 h déclarées en heures majorées (art. 96.4)', () => {
    // 47,5 h/semaine, 52 semaines : 195 h normales + 10,83 h majorées par mois
    const c = contract({ planning: week('08:00', '17:30') });
    const r = computeMonth(makeCtx(c, [], [], '2026-11-15'), '2026-10');
    expect(r.heuresNormales).toBe(195);
    expect(r.majContratMin).toBe(650); // 2,5 × 52 ÷ 12 = 10 h 50
    expect(r.majMin).toBe(0);
    const maj = declarationLines(makeCtx(c, [], [], '2026-11-15'), r).find((l) => l.label === 'Heures majorées');
    expect(maj?.value).toMatch(/^10\s?h\s?50/);
  });
  it('Pajemploi : la retenue pour absence s’applique aux deux parts', () => {
    const c = contract({ planning: week('08:00', '17:30') });
    const leaves: AmLeave[] = [{ id: 'l1', type: 'am_malade', from: '2026-10-12', to: '2026-10-12' }];
    const r = computeMonth(makeCtx(c, [], leaves, '2026-11-15'), '2026-10');
    expect(r.paidFraction).toBeLessThan(1);
    expect(r.heuresNormales).toBe(Math.round(195 * r.paidFraction));
    expect(r.majContratMin).toBe(Math.round(650 * r.paidFraction));
  });
  it('abattement fiscal : SMIC en vigueur le jour de la garde (BOI-RSA-CHAMP-10-20-10 § 490)', () => {
    // Mai 2026 (SMIC 12,02 €) puis juin 2026 (12,31 €), journées de 9 h
    const c = contract({ start: '2026-05-01', trackedFrom: '2026-05-01' });
    const f = fiscalYear(makeCtx(c, [], [], '2026-06-30'), 2026, 0, '2026-06');
    const mai = 17, juin = 22; // 21 jours ouvrés en mai, moins 4 fériés (1er, 8, 14 et 25)
    expect(f.abattementBrut).toBe(Math.round(3 * (mai * 1202 + juin * 1231)));
    expect(f.smics).toEqual([1202, 1231]);
  });
  it('congés année incomplète : 40 semaines → 40 ÷ 4 × 2,5 = 25 jours, pas 26', () => {
    const c = contract({ start: '2026-06-01', trackedFrom: '2026-06-01', yearType: 'incomplete', weeks: 40, planning: week('08:00', '16:00'), rateNet: 380 });
    const ctx = makeCtx(c, [], [], '2027-06-15');
    expect(acquisition(ctx, 2026).jours).toBe(25);
  });
  it('maintien : heures au-delà de 45 h majorées comme dans le salaire', () => {
    // 47,5 h : 45 × 3,60 + 2,5 × 3,96 = 171,90 € par semaine ; 30 jours = 5 semaines = 859,50 €
    const c = contract({ start: '2025-06-01', trackedFrom: '2025-06-01', planning: week('08:00', '17:30'), rateNet: 360 });
    const ind = indemnite(makeCtx(c, [], [], '2026-07-01'), 2025);
    expect(ind.maintien).toBe(85950);
  });
});

describe('règles tranchées le 28/10/2026 (texte et fiches officielles)', () => {
  it('rupture : 9 mois appréciés à l’envoi de la lettre, pas à la fin du préavis', () => {
    // Début 15/01/2026, lettre le 14/10 : 8 mois à l’envoi, 9 à la fin du préavis → pas d’indemnité
    const c = contract({ start: '2026-01-15', trackedFrom: '2026-01-15' });
    const f = finDeContrat(makeCtx(c, [], [], '2026-12-31'), '2026-10-14', 'retrait');
    expect(f.indemniteRupture).toBe(0);
  });
  it('enfant malade : 5 jours courts et une longue absence se cumulent', () => {
    // 1 jour court, puis absence du 9 au 20 mars (10 jours prévus) : 1 + 10 retenus
    const days = ['2026-02-02', ...['09', '10', '11', '12', '13', '16', '17', '18', '19', '20'].map((d) => `2026-03-${d}`)]
      .map((d) => rec(d, { abs: 'malade_certif' }));
    expect(sickDeductible(makeCtx(contract(), days, [], '2026-04-01')).size).toBe(11);
  });
  it('enfant malade : après la longue absence, les absences courtes restent retenues', () => {
    const days = [...['09', '10', '11', '12', '13', '16', '17', '18'].map((d) => `2026-03-${d}`), '2026-04-14']
      .map((d) => rec(d, { abs: 'malade_certif' }));
    expect(sickDeductible(makeCtx(contract(), days, [], '2026-05-01')).size).toBe(9);
  });
  it('férié chômé non payé si l’AM est absente (maladie) le jour prévu juste avant', () => {
    // Lundi de Pâques 06/04/2026 ; AM malade le vendredi 03/04
    const leaves: AmLeave[] = [{ id: 'l', type: 'am_malade', from: '2026-04-03', to: '2026-04-03' }];
    const ctx = makeCtx(contract(), [], leaves, '2026-05-01');
    expect(dayInfo(ctx, '2026-04-06').deducted).toBe(true);
    expect(monthBase(ctx, '2026-04').alerts.join(' ')).toMatch(/Férié du 06\/04 non payé/);
  });
  it('férié chômé payé si l’AM était en congés payés la veille (absence autorisée)', () => {
    const leaves: AmLeave[] = [{ id: 'l', type: 'cp', from: '2026-03-30', to: '2026-04-03' }];
    expect(dayInfo(makeCtx(contract(), [], leaves, '2026-05-01'), '2026-04-06').deducted).toBe(false);
  });
  it('1er mai chômé toujours payé', () => {
    // Vendredi 1er mai 2026, AM malade le jeudi 30 avril
    const leaves: AmLeave[] = [{ id: 'l', type: 'am_malade', from: '2026-04-30', to: '2026-04-30' }];
    expect(dayInfo(makeCtx(contract(), [], leaves, '2026-06-01'), '2026-05-01').deducted).toBe(false);
  });
});

describe('repas fournis par les parents (avantage en nature, impots.gouv)', () => {
  it('chaque jour d’accueil ajoute 5,50 € aux sommes reçues en 2026', () => {
    const base = contract({ start: '2026-10-01', trackedFrom: '2026-10-01' });
    const sans = fiscalYear(makeCtx(base, [], [], '2026-10-31'), 2026);
    const avec = fiscalYear(makeCtx({ ...base, repasParents: true }, [], [], '2026-10-31'), 2026);
    expect(sans.repasParents).toBe(0);
    expect(avec.repasParents).toBe(22 * 550);
    expect(avec.recu - sans.recu).toBe(22 * 550);
  });
});
