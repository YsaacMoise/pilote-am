// T-044 : indemnité d'entretien. Sources lues en entier le 18/11/2026 :
// - CCN IDCC 3239, socle AM, art. 114.1 (Légifrance KALISCTA000043941701) : « Elle est versée en cas de travail effectif,
//   par heure de travail. Le montant horaire de cette indemnité est prévu dans le contrat de travail. Il varie en fonction
//   de la durée de travail effectif, sans pouvoir être inférieur à 90 % du minimum garanti lorsque la durée de travail
//   journalière est de 9 heures. » ; « le montant journalier de cette indemnité ne peut pas être inférieur à 2,65 € ».
// - même page, art. 99 « Décompte du temps de travail » : le travail débute à l'heure prévue, ou à l'arrivée de l'enfant
//   « si celle-ci est antérieure » ; il prend fin à l'heure prévue, ou au départ de l'enfant « si celle-ci est postérieure ».
// - CASF D423-7 : montant « calculé en fonction de la durée effective d'accueil quotidien ».
// - Urssaf (remunerer-salarie-domicile) : 3,92 € « pour 9 heures de garde », « proratisable en fonction du nombre d'heures
//   d'accueil par jour », plancher 2,65 € ; service-public F12812 (vérifié le 17 juin 2026) : « Son montant varie en
//   fonction de la durée d'accueil ».
import { describe, expect, it } from 'vitest';
import type { Contract, DayRec, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { computeMonth } from '../src/engine/month';

function week(start: string, end: string, days = [1, 2, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}
// Situation G-C52-H32-T420-S10 du comparateur : lundi, mardi, jeudi, vendredi 8 h - 16 h, 4,00 € par jour (soit 0,50 €/h).
function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2025-09-01', yearType: 'complete', weeks: 52, weeksOff: [],
    planning: week('08:00', '16:00'), rateNet: 420, majoration: 10, entretienJour: 400, repasPrix: 300, repasParJour: 1,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2025-09-01',
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0,
    alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false, ...over,
  };
}
const rec = (date: string, r: Partial<DayRec>): DayRec => ({ key: `c1|${date}`, cid: 'c1', date, ...r });
const g52 = [rec('2026-09-07', { pres: [{ a: '08:00', d: '18:00' }] }), ...['14', '15', '17', '18'].map((j) => rec(`2026-09-${j}`, { pres: [{ a: '08:00', d: '17:45' }] }))];

// T-103 (décision du DG du 24/11/2026, rapports/T-103-inventaire.md, M1 à M4) : un seul montant par jour. Durée = temps de
// travail de l'art. 99 (heures prévues plus présence hors des plages ; hors planning, la présence). Contrat par heure :
// montant horaire × durée ; contrat « montant fixe par journée » : ce montant chaque jour. Au moins le minimum de l'art. 114.1
// (MG × 90 % ÷ 9 par heure, 2,65 € par jour au moins). Arrondi au centime par jour (ARR-01). Plus aucune part « à confirmer ».
describe('T-103 : entretien sans part à confirmer (CCN 99 et 114.1)', () => {
  it('contrat « par heure » 0,50 € : septembre 2026 de G-C52-H32-T420-S10 = 72,52 €, sans second total au mois', () => {
    const r = computeMonth(makeCtx(contract({ entretienJour: 0, entretienHeure: 50 }), g52, [], '2026-10-05'), '2026-09');
    // 4 jours de 9 h 45 à 4,875 € → 4,88 € (ARR-01).
    expect(r.entretien).toBe(7252);
    expect(r.alerts.join(' ')).not.toMatch(/en arrondissant|à confirmer/);
  });
  it('contrat « par jour » 4,00 € et jour de 10 h : le minimum de 10 h (4,35 €) est versé', () => {
    const r1 = computeMonth(makeCtx(contract(), [], [], '2026-10-05'), '2026-09');
    const r = computeMonth(makeCtx(contract(), [g52[0]], [], '2026-10-05'), '2026-09');
    expect(r.entretien - r1.entretien).toBe(435 - 400);
    expect(r.alerts.join(' ')).not.toMatch(/à confirmer/);
  });
  it('enfant parti à midi, tarif 2,00 € sous le minimum : la journée compte 8 h de travail (art. 99), minimum 3,48 €', () => {
    const r = computeMonth(makeCtx(contract({ entretienJour: 200 }), [rec('2026-09-07', { pres: [{ a: '08:00', d: '12:00' }] })], [], '2026-10-05'), '2026-09');
    expect(r.entretien).toBe(348 * r.presenceDays);
  });
  it('jour d’accueil hors planning, contrat « par jour » : le montant fixe du contrat est versé', () => {
    const r1 = computeMonth(makeCtx(contract(), [], [], '2026-10-05'), '2026-09');
    const r = computeMonth(makeCtx(contract(), [rec('2026-09-09', { pres: [{ a: '08:00', d: '12:00' }], extra: true })], [], '2026-10-05'), '2026-09');
    expect(r.entretien - r1.entretien).toBe(400);
  });
});

import { controle } from '../src/engine/controle';
describe('T-103 : contrôle du bulletin', () => {
  it('montant déclaré égal au calcul : entretien conforme', () => {
    const r = computeMonth(makeCtx(contract(), [g52[0]], [], '2026-10-05'), '2026-09');
    const checks = controle({ id: 'b', cid: 'c1', month: '2026-09', entretien: r.entretien, source: 'manuel' }, r, 420);
    expect(checks.some((x) => x.title === 'Entretien conforme')).toBe(true);
    expect(checks.some((x) => /à confirmer/.test(x.title))).toBe(false);
  });
});

import { MESSAGE_MOIS_DEJA_DECLARE } from '../src/engine/payroll';
import { fiscalYear } from '../src/engine/fiscal';
describe('T-103 : durée de travail, absence, mois passés, impôts', () => {
  const midi = rec('2026-09-07', { pres: [{ a: '08:00', d: '12:00' }] });
  it('contrat 0,50 € de l’heure, enfant parti à midi : 8 h de travail (art. 99), 4,00 €', () => {
    const r = computeMonth(makeCtx(contract({ entretienJour: 0, entretienHeure: 50, entretienMode: 'heure' }), [midi], [], '2026-10-05'), '2026-09');
    expect(r.entretien).toBe(400 * 17);
  });
  it('absence de l’enfant toute la journée : pas d’entretien', () => {
    const r = computeMonth(makeCtx(contract({ entretienJour: 0, entretienHeure: 50, entretienMode: 'heure' }), [rec('2026-09-07', { abs: 'parents' })], [], '2026-10-05'), '2026-09');
    expect(r.entretien).toBe(400 * 16);
  });
  it('mois passé : l’entretien ne déclenche plus l’alerte « mois déjà déclaré »', () => {
    const r = computeMonth(makeCtx(contract({ entretienJour: 300 }), [midi], [], '2026-11-18'), '2026-09');
    expect(r.alerts).not.toContain(MESSAGE_MOIS_DEJA_DECLARE);
  });
  it('récapitulatif des impôts : aucune part d’entretien mise de côté', () => {
    const f = fiscalYear(makeCtx(contract(), g52, [], '2027-01-10'), 2026);
    expect(f.nonGere ?? '').not.toMatch(/Indemnité d’entretien/);
  });
});

import { declarationText } from '../src/engine/month';
describe('T-103 : texte aux parents', () => {
  it('contrat « par heure », départ après 5 h : aucune ligne « à confirmer »', () => {
    const ctx = makeCtx(contract({ entretienJour: 0, entretienHeure: 60, entretienMode: 'heure' }), [rec('2026-09-07', { pres: [{ a: '08:00', d: '13:00' }] })], [], '2026-10-05');
    expect(declarationText(ctx, computeMonth(ctx, '2026-09'), 'Nadia')).not.toMatch(/à confirmer/);
  });
});
