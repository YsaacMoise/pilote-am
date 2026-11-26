// T-118 : défauts du relevé T-111 (D-09, D-18, D-23, D-24) et titre des écrans.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AmLeave, Contract, DayRec, Planning } from '../src/engine/model';
import { brutDuNet, makeCtx, monthBase, monthBrut } from '../src/engine/payroll';
import { computeMonth } from '../src/engine/month';
import { lignesDetail, sommeLignes } from '../src/engine/detail';
import { alertesDurees, amplitudeJour, AMPLITUDE_MAX_MIN } from '../src/engine/durees';
import { amplitudeFiche, choixPointage, SEUIL_AVANCE_MIN, textesChoix } from '../src/screens/Today';

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
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0, cpSaisi: true }, history: [], createdAt: 0,
    alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false, departement: '75', ...over,
  } as Contract;
}
const rec = (date: string, r: Partial<DayRec>): DayRec => ({ key: `c1|${date}`, cid: 'c1', date, ...r });

describe('T-118 (D-23) : les lignes du détail font le salaire net', () => {
  const cas: [string, Contract, DayRec[], AmLeave[], string][] = [
    ['mois complet', contract(), [], [], '2026-10'],
    ['entrée le 18/11', contract({ start: '2026-11-18', trackedFrom: '2026-11-18' }), [], [], '2026-11'],
    ['sortie le 13/11', contract({ end: '2026-11-13' }), [], [], '2026-11'],
    ['avenant au 15/10 (taux)', contract({ avenants: [{ id: 'a1', from: '2026-10-15', changes: { rateNet: 400 } }] }), [], [], '2026-10'],
    ['avenant au 15/10 (planning)', contract({ avenants: [{ id: 'a1', from: '2026-10-15', changes: { planning: week('08:00', '15:00') } }] }), [], [], '2026-10'],
    ['absence retenue', contract(), [], [{ id: 'l1', type: 'am_malade', from: '2026-10-12', to: '2026-10-13' }], '2026-10'],
    ['heures en plus', contract(), [rec('2026-10-06', { pres: [{ a: '08:00', d: '19:00' }] })], [], '2026-10'],
  ];
  for (const [nom, c, days, leaves, m] of cas) {
    it(nom, () => {
      // Fin de contrat : réponses de l'écran « Fin de contrat » données (préavis), comme dans l'app.
      const ctx = { ...makeCtx(c, days, leaves, '2026-12-15'), finControlee: true };
      const r = computeMonth(ctx, m);
      expect(r.nonGere).toEqual([]);
      const l = lignesDetail(c, m, r);
      expect(l[l.length - 1]).toMatchObject({ label: 'Salaire net', montant: r.netTotal, total: true });
      expect(sommeLignes(l)).toBe(r.netTotal);
    });
  }
  it('entrée en cours de mois : une ligne de prorata, négative', () => {
    const c = contract({ start: '2026-11-18', trackedFrom: '2026-11-18' });
    const l = lignesDetail(c, '2026-11', computeMonth(makeCtx(c, [], [], '2026-12-15'), '2026-11'));
    const p = l.find((x) => x.label.startsWith('Prorata'))!;
    expect(p.label).toContain('contrat commencé le 18/11');
    expect(p.montant).toBeLessThan(0);
  });
  it('avenant : une ligne par période, plus de ligne « le même chaque mois »', () => {
    const c = contract({ avenants: [{ id: 'a1', from: '2026-10-15', changes: { rateNet: 400 } }] });
    const l = lignesDetail(c, '2026-10', computeMonth(makeCtx(c, [], [], '2026-12-15'), '2026-10'));
    expect(l.filter((x) => x.label.startsWith('Salaire du '))).toHaveLength(2);
    expect(l.some((x) => x.label.includes('le même chaque mois'))).toBe(false);
    expect(l[0].label).toContain('du 01/10 au 14/10');
    expect(l[1].label).toContain('du 15/10 au 31/10');
  });
});

describe('T-118 (D-24) : brut d’un mois d’avenant, période par période', () => {
  it('le taux brut change : chaque période garde son rapport brut ÷ net', () => {
    // 4,30 € net / 5,50 € brut avant, 3,91 € net / 5,00 € brut après le 15/10
    const c = contract({ rateNet: 430, rateBrut: 550, avenants: [{ id: 'a1', from: '2026-10-15', changes: { rateNet: 391, rateBrut: 500 } }] });
    const ctx = makeCtx(c, [], [], '2026-12-15');
    const b = monthBase(ctx, '2026-10');
    const [s1, s2] = b.segments!;
    const attendu = Math.round((s1.net * 550) / 430) + Math.round((s2.net * 500) / 391);
    expect(monthBrut(ctx, '2026-10')).toBe(attendu);
    // Avant la T-118 : tout le mois au rapport du dernier jour
    expect(brutDuNet(c, b.net, '2026-10-31')).not.toBe(attendu);
    expect(computeMonth(ctx, '2026-10').brutEstime).toBe(attendu);
  });
  it('même rapport brut ÷ net (planning seul) : calcul inchangé', () => {
    const c = contract({ rateBrut: 448, avenants: [{ id: 'a1', from: '2026-10-15', changes: { planning: week('08:00', '15:00') } }] });
    const ctx = makeCtx(c, [], [], '2026-12-15');
    const b = monthBase(ctx, '2026-10');
    expect(monthBrut(ctx, '2026-10')).toBe(brutDuNet(c, b.net, '2026-10-31'));
  });
  it('mois sans avenant : calcul inchangé', () => {
    const c = contract({ rateBrut: 448 });
    const ctx = makeCtx(c, [], [], '2026-12-15');
    expect(monthBrut(ctx, '2026-10')).toBe(brutDuNet(c, monthBase(ctx, '2026-10').net, '2026-10-31'));
  });
});

describe('T-118 (D-09) : journée de plus de 13 h', () => {
  const c = contract();
  it('vendredi de 8 h à 22 h, sans travail le samedi : alerte', () => {
    const ctx = makeCtx(c, [rec('2026-11-20', { pres: [{ a: '08:00', d: '22:00' }] })], [], '2026-11-21');
    expect(amplitudeJour([ctx], '2026-11-20')).toBe(14 * 60);
    expect(alertesDurees([ctx], '2026-11-20').some((x) => x.startsWith('Journée de 14 h'))).toBe(true);
  });
  it('journée de 12 h : pas d’alerte de durée', () => {
    const ctx = makeCtx(c, [rec('2026-11-20', { pres: [{ a: '08:00', d: '20:00' }] })], [], '2026-11-21');
    expect(alertesDurees([ctx], '2026-11-20').some((x) => x.startsWith('Journée de'))).toBe(false);
  });
  it('fiche du jour : amplitude des heures saisies', () => {
    expect(amplitudeFiche([{ a: '08:00', d: '22:00' }])).toBe(14 * 60);
    expect(amplitudeFiche([{ a: '07:00', d: '09:00' }, { a: '16:00', d: '20:30' }])).toBe(13 * 60 + 30);
    expect(amplitudeFiche([{ a: '08:00' }])).toBe(0);
    expect(AMPLITUDE_MAX_MIN).toBe(780);
  });
});

describe('T-118 (D-18) : arrivée bien avant l’heure prévue', () => {
  const plan = [{ start: '07:30', end: '17:30' }];
  it('3 h 19 pour 7 h 30 : l’app demande l’heure vraie', () => {
    const ch = choixPointage(plan, { idx: 0, kind: 'a' }, '03:19')!;
    expect(ch).toMatchObject({ kind: 'a', prevue: '07:30', ecartMin: -251 });
    expect(textesChoix(ch).titre).toBe('Arrivée prévue à 7 h 30, dans 4 h 11');
  });
  it('une heure d’avance ou moins : heure de l’appui notée, comme avant', () => {
    expect(choixPointage(plan, { idx: 0, kind: 'a' }, '06:30')).toBeNull();
    expect(choixPointage(plan, { idx: 0, kind: 'a' }, '06:29')).not.toBeNull();
    expect(SEUIL_AVANCE_MIN).toBe(60);
  });
  it('un départ en avance n’est pas concerné', () => {
    expect(choixPointage(plan, { idx: 0, kind: 'd' }, '12:00')).toBeNull();
  });
});

describe('T-118 : textes', () => {
  it('jamais « Arvela · Arvela »', () => {
    const app = readFileSync('src/app.tsx', 'utf8');
    expect(app).toContain("document.title = title ? `${title} · Arvela` : 'Arvela'");
    expect(app).toContain("guide: 'Vidéos'");
  });
  it('D-14 : plus d’ordre d’envoi à YKM dans Données du pilote', () => {
    const p = readFileSync('src/screens/Pilote.tsx', 'utf8');
    expect(p).not.toContain('envoie l’export');
    expect(p).not.toContain('YKM');
  });
});

describe('T-118 : contrat allégé', () => {
  it('département du profil : celui du dernier contrat saisi qui en a un', async () => {
    const { departementDesContrats } = await import('../src/engine/departements');
    expect(departementDesContrats([])).toBeUndefined();
    expect(departementDesContrats([{ departement: '31', createdAt: 1 }, { departement: '75', createdAt: 5 }, { createdAt: 9 }])).toBe('75');
  });
  it('nouveau contrat : CDI, régulier, entretien par jour cochés d’avance ; planning identique sans réponse', () => {
    const src = readFileSync('src/screens/Contrat.tsx', 'utf8');
    const b = src.slice(src.indexOf('function blank()'), src.indexOf('export function Contrat'));
    expect(b).toContain("cdd: false, accueilOccasionnel: false, entretienMode: 'jour',");
    expect(b).not.toContain('planningVariable');
  });
  it('récapitulatif : chaque réponse cochée d’avance y figure', async () => {
    const { lignesRecap } = await import('../src/screens/Contrat');
    const l = Object.fromEntries(lignesRecap(contract({ cdd: false, accueilOccasionnel: false, entretienMode: 'jour', entretienJour: 0, repasParents: true } as Partial<Contract>)));
    expect(l['Contrat']).toBe('CDI');
    expect(l['Accueil']).toBe('régulier');
    expect(l['Département']).toBe('75 – Paris');
    expect(l['Entretien']).toMatch(/^minimum légal/);
    expect(l['Planning']).toMatch(/^le même chaque semaine \(45 h sur 5 jours\)/);
    const vide = Object.fromEntries(lignesRecap(contract({ cdd: undefined, planningVariable: undefined, departement: undefined, alsaceMoselle: undefined } as Partial<Contract>)));
    expect(vide['Contrat']).toBe('à indiquer');
    expect(vide['Planning']).toBe('à indiquer');
    expect(vide['Département']).toBe('à indiquer');
  });
});
