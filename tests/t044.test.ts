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

describe('T-044 : entretien au tarif horaire du contrat (CCN art. 114.1)', () => {
  it('contrat « par heure » 0,50 € : septembre 2026 de G-C52-H32-T420-S10 = 72,50 € (lecture horaire du constat)', () => {
    const r = computeMonth(makeCtx(contract({ entretienJour: 0, entretienHeure: 50 }), g52, [], '2026-10-05'), '2026-09');
    // T-044b : ARR-01, chaque jour arrondi au centime le plus proche (4 jours de 9 h 45 à 4,875 € → 4,88 €) : 72,52 €.
    // Arrondi sur le mois : 72,50 €. L'app le dit.
    expect(r.entretien).toBe(7252);
    expect(r.entretienAConfirmer).toBe(0);
    expect(r.alerts.join(' ')).toMatch(/72,52\s€ en arrondissant chaque jour.*72,50\s€/);
  });
  it('contrat « par jour » 4,00 € et jour plus long que le planning : la part qui dépend de la lecture est à confirmer', () => {
    // 7 septembre, 10 h : 4,35 € (minimum, MG 4,35 ÷ 10 × 10) au tarif du jour, 5,00 € si les 4 € valent pour les 8 h prévues.
    const r = computeMonth(makeCtx(contract(), [g52[0]], [], '2026-10-05'), '2026-09');
    expect(r.entretienAConfirmer).toBe(65);
    expect(r.alerts.join(' ')).toMatch(/Indemnité d’entretien : 0,65\s€ à confirmer/);
  });
  it('enfant parti à midi, tarif sous le minimum : 8 h (art. 99) ou 4 h (accueil) ; le plus bas est versé, l’écart à confirmer', () => {
    // Tarif du contrat 2,00 € par jour (sous le minimum). Présence 8 h - 12 h, prévu 8 h - 16 h : minimum 8 × 0,435 = 3,48 €.
    const r = computeMonth(makeCtx(contract({ entretienJour: 200 }), [rec('2026-09-07', { pres: [{ a: '08:00', d: '12:00' }] })], [], '2026-10-05'), '2026-09');
    const jours = r.presenceDays;
    expect(jours).toBeGreaterThan(1);
    // Jours au planning respecté : 8 h, 3,48 € chacun. Le 7 septembre : 2,65 € (accueil, 4 h) versés, 0,83 € à confirmer
    // (3,48 € sur 8 h de travail, art. 99). T-044b, relecture V5 P2-B1 : les textes ne tranchent pas.
    expect(r.entretien).toBe(348 * (jours - 1) + 265);
    expect(r.entretienAConfirmer).toBe(83);
  });
  it('jour d’accueil hors planning, contrat « par jour » : le minimum est dû, le reste du tarif du jour à confirmer', () => {
    // Mercredi 9 septembre, 8 h - 12 h, non prévu : minimum 2,65 € ; 4,00 € au tarif du jour ; pas de durée de référence.
    const r = computeMonth(makeCtx(contract(), [rec('2026-09-09', { pres: [{ a: '08:00', d: '12:00' }], extra: true })], [], '2026-10-05'), '2026-09');
    expect(r.entretienAConfirmer).toBe(135);
  });
});

import { controle } from '../src/engine/controle';
describe('T-044 : contrôle du bulletin avec une part d’entretien à confirmer', () => {
  it('montant déclaré selon la lecture horaire : dans la fourchette, pas d’alerte « différentes »', () => {
    const r = computeMonth(makeCtx(contract(), [g52[0]], [], '2026-10-05'), '2026-09');
    const checks = controle({ id: 'b', cid: 'c1', month: '2026-09', entretien: r.entretien + r.entretienAConfirmer, source: 'manuel' }, r, 420);
    expect(checks.some((x) => x.title === 'Indemnités d’entretien différentes')).toBe(false);
    expect(checks.some((x) => x.title === 'Entretien dans la fourchette à confirmer')).toBe(true);
  });
});

import { MESSAGE_MOIS_DEJA_DECLARE } from '../src/engine/payroll';
import { fiscalYear } from '../src/engine/fiscal';
// T-044b : relecture V5, périmètre 2 (/home/claude/v5-relecture.md). Tests écrits avant la correction.
describe('T-044b : durée d’accueil ou durée de travail, mois passés, impôts', () => {
  const midi = rec('2026-09-07', { pres: [{ a: '08:00', d: '12:00' }] });
  it('P2-B1 : contrat 0,50 € de l’heure, enfant parti à midi : 2,65 € versés, 1,35 € à confirmer (4,00 € sur 8 h de travail)', () => {
    const r = computeMonth(makeCtx(contract({ entretienJour: 0, entretienHeure: 50, entretienMode: 'heure' }), [midi], [], '2026-10-05'), '2026-09');
    // 16 jours de 8 h à 4,00 € ; le 7 septembre : 2,65 € (4 h d'accueil, minimum) ou 4,00 € (8 h de travail).
    expect(r.entretien).toBe(400 * 16 + 265);
    expect(r.entretienAConfirmer).toBe(135);
    expect(r.alerts.join(' ')).toMatch(/temps de présence de l’enfant .* ou en temps de travail/);
  });
  it('absence de l’enfant toute la journée : pas d’entretien (Urssaf « n’est pas versée en cas d’absence de l’enfant »)', () => {
    const r = computeMonth(makeCtx(contract({ entretienJour: 0, entretienHeure: 50, entretienMode: 'heure' }), [rec('2026-09-07', { abs: 'parents' })], [], '2026-10-05'), '2026-09');
    expect(r.entretien).toBe(400 * 16);
    expect(r.entretienAConfirmer).toBe(0);
  });
  it('C2-1 : mois passé dont le montant dépend de la lecture : alerte « mois déjà déclaré »', () => {
    const r = computeMonth(makeCtx(contract({ entretienJour: 300 }), [midi], [], '2026-11-18'), '2026-09');
    expect(r.entretienAConfirmer).toBeGreaterThan(0);
    expect(r.alerts).toContain(MESSAGE_MOIS_DEJA_DECLARE);
  });
  it('C2-2 : récapitulatif des impôts : la part d’entretien à confirmer est signalée et non comptée', () => {
    const f = fiscalYear(makeCtx(contract(), g52, [], '2027-01-10'), 2026);
    expect(f.nonGere ?? '').toMatch(/Indemnité d’entretien à confirmer : .* en septembre 2026 ne sont pas comptés/);
  });
});

import { declarationText } from '../src/engine/month';
// T-044c (direction) : le texte aux parents donne la vraie raison de la part d'entretien à confirmer.
describe('T-044c : raison de la part d’entretien à confirmer dans le texte aux parents', () => {
  const depart = rec('2026-09-07', { pres: [{ a: '08:00', d: '13:00' }] });
  it('contrat « par heure » 0,60 €, enfant parti après 5 h : présence ou travail, jamais « tarif par jour »', () => {
    const ctx = makeCtx(contract({ entretienJour: 0, entretienHeure: 60, entretienMode: 'heure' }), [depart], [], '2026-10-05');
    const t = declarationText(ctx, computeMonth(ctx, '2026-09'), 'Nadia');
    expect(t).toMatch(/Indemnité d’entretien : .* à confirmer ensemble \(une journée comptée en temps de présence de l’enfant ou en temps de travail, selon la lecture\)/);
    expect(t).not.toMatch(/tarif du contrat par jour/);
  });
  it('contrat « par jour », même départ : les deux raisons', () => {
    const ctx = makeCtx(contract(), [depart], [], '2026-10-05');
    const t = declarationText(ctx, computeMonth(ctx, '2026-09'), 'Nadia');
    expect(t).toMatch(/temps de travail, selon la lecture ; tarif du contrat par jour, journée d’une autre durée que le planning/);
  });
});
