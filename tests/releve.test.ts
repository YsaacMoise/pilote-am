// Relevé du mois (PDF) : données préparées par une fonction pure, sans nouveau calcul. Montants calculés à la main.
import { describe, expect, it } from 'vitest';
import type { Contract, DayRec, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { computeMonth, declarationLines } from '../src/engine/month';
import { MENTION_RELEVE, nomFichierReleve, prenomFichier, releveDonnees } from '../src/releve/donnees';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}
const contract = (over: Partial<Contract> = {}): Contract => ({
  id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2026-01-05', yearType: 'complete', weeks: 52, weeksOff: [],
  planning: week('08:00', '17:00'), rateNet: 350, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
  kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2026-01-05',
  balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, ...over,
});
const rec = (date: string, r: Partial<DayRec>): DayRec => ({ key: `c1|${date}`, cid: 'c1', date, ...r });
const recs = [rec('2026-10-06', { pres: [{ a: '08:00', d: '18:00' }] }), rec('2026-10-13', { abs: 'malade' })];
const now = new Date(2026, 9, 31, 18, 5);

describe('relevé du mois : données', () => {
  const ctx = makeCtx(contract(), recs, [], '2026-11-02');
  const d = releveDonnees(ctx, '2026-10', { amName: ' Sophie ', now, version: '1.0.0-test' });
  it('en-tête : mois, enfant, famille, assistante maternelle, mois terminé donc pas provisoire', () => {
    expect(d.moisLabel).toBe('octobre 2026');
    expect(d.titre).toBe('Relevé du mois');
    expect(d.provisoire).toBe(false);
    expect([d.enfant, d.famille, d.am]).toEqual(['Léa', 'Martin', 'Sophie']);
    expect(d.nomFichier).toBe('Arvela-releve-Léa-2026-10.pdf');
    expect(d.fabrique).toBe('Fabriqué le 31/10/2026 à 18 h 05');
    expect(d.version).toBe('1.0.0-test');
    expect(d.mention).toBe(MENTION_RELEVE);
  });
  it('tableau des jours : 22 jours ouvrés d’octobre 2026, horaires prévus et réels, absence avec son motif', () => {
    expect(d.lignes.length).toBe(22);
    expect(d.lignes[0]).toEqual({ date: '2026-10-01', jour: 'jeu. 1', prevu: '08:00–17:00', reel: 'comme prévu', absence: '' });
    expect(d.lignes.find((l) => l.date === '2026-10-06')?.reel).toBe('08:00–18:00');
    const abs = d.lignes.find((l) => l.date === '2026-10-13')!;
    expect(abs.absence).toBe('Malade, sans certificat, payé');
    expect(abs.reel).toBe('');
  });
  it('totaux : 22 × 9 h = 198 h prévues ; 20 × 9 h + 10 h = 190 h d’accueil ; 21 jours ; 1 absence', () => {
    expect(d.totaux).toEqual([
      { label: 'Heures prévues au planning', value: '198 h' },
      { label: 'Heures d’accueil', value: '190 h' },
      { label: 'Jours d’accueil', value: '21' },
      { label: 'Jours d’absence de l’enfant', value: '1' },
    ]);
  });
  it('montants : 682,50 + 3,85 (1 h au-delà de 45 h) = 686,35 € ; entretien 20 × 3,92 + 4,35 = 82,75 € ; total 769,10 €', () => {
    const v = Object.fromEntries(d.montants.map((m) => [m.label, m.value.replace(/\s/g, ' ')]));
    expect(v['Salaire net']).toBe('686,35 €');
    expect(v['Indemnités d’entretien']).toBe('82,75 €');
    expect(v['Repas']).toBe('0,00 €');
    expect(v['Kilomètres']).toBe('0,00 €');
    expect(v['Total à verser']).toBe('769,10 €');
  });
  it('lignes Pajemploi : exactement celles de l’écran Mois, dans le même ordre', () => {
    expect(d.declaration).toEqual(declarationLines(ctx, computeMonth(ctx, '2026-10')));
  });
  it('jamais un bulletin de salaire : ni brut, ni cotisations, ni net imposable', () => {
    const t = JSON.stringify({ ...d, mention: '' });
    expect(t).not.toMatch(/brut|cotisation|imposable|bulletin/i);
    expect(d.mention).toMatch(/Il ne remplace pas le bulletin de salaire Pajemploi, qui fait foi\./);
  });
  it('mois en cours : titre « provisoire », jours à venir sans horaires réels', () => {
    const p = releveDonnees(makeCtx(contract(), recs, [], '2026-10-15'), '2026-10', { amName: 'Sophie', now, version: 'x' });
    expect(p.provisoire).toBe(true);
    expect(p.titre).toBe('Relevé du mois, provisoire');
    expect(p.lignes.find((l) => l.date === '2026-10-20')?.reel).toBe('');
    expect(p.totaux[1].label).toBe('Heures d’accueil à ce jour');
  });
  it('nom de fichier : séparateurs retirés, espaces en tirets', () => {
    expect(prenomFichier(' Marie Anne/ ')).toBe('Marie-Anne');
    expect(nomFichierReleve('', '2026-11')).toBe('Arvela-releve-enfant-2026-11.pdf');
  });
});
