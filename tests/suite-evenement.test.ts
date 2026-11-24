// Décision du DG du 21/11/2026 (« Demander à l'AM ») : deux absences « événement familial » sont reliées seulement si
// l'AM dit que la seconde est la suite de la première (`suiteDe`). Cas A, B, C, F de la relecture de la n° 52.
// Valeurs « avant » : calculées par le commit 9a078a7 (absences enregistrées avec leur nature).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AmLeave, Contract, NatureEvenement } from '../src/engine/model';
import { absenceSaisie, appliquerReponses, appliquerReponseSuite, liensApresSuppression, questionsSuite, questionsVisibles, reponsesCompletes, type Reponse, normaliserAbsences, questionSuite, texteQuestionSuite, type AbsenceLue } from '../src/engine/absences';
import { makeCtx } from '../src/engine/payroll';
import { computeMonth } from '../src/engine/month';

const plage = [{ start: '08:00', end: '16:00' }];
const c: Contract = {
  id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2024-01-01', yearType: 'complete', weeks: 52, weeksOff: [],
  planning: { 1: plage, 2: plage, 3: plage, 4: plage, 5: plage }, rateNet: 500, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
  kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2024-01-01',
  balances: { cpRestants: 30, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0,
  alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
} as Contract;
const avant = JSON.parse(readFileSync(new URL('./fixtures/paie-evenements-suite-avant.json', import.meta.url), 'utf8'));
type Cas = [string, [NatureEvenement, string, string][]];
const CAS: Record<string, Cas> = {
  A: ['2026-06', [['handicap_enfant', '2026-06-10', '2026-06-12'], ['handicap_enfant', '2026-06-15', '2026-06-19']]],
  B: ['2026-10', [['naissance', '2026-10-05', '2026-10-07'], ['deces_proche', '2026-10-12', '2026-10-14']]],
  C: ['2026-10', [['mariage_enfant', '2026-10-05', '2026-10-05'], ['deces_ascendant', '2026-10-09', '2026-10-09']]],
  D: ['2026-10', [['naissance', '2026-10-05', '2026-10-07'], ['naissance', '2026-10-12', '2026-10-14']]],
  E: ['2026-10', [['deuil', '2026-10-05', '2026-10-07'], ['deces_enfant_14', '2026-10-12', '2026-10-14']]],
  F: ['2026-03', [['deces_descendant', '2026-03-02', '2026-03-03'], ['deces_ascendant', '2026-03-06', '2026-03-06']]],
  G: ['2026-10', [['mariage', '2026-10-05', '2026-10-06'], ['mariage', '2026-10-08', '2026-10-09'], ['mariage', '2026-10-12', '2026-10-13']]],
};
const lire = (r: ReturnType<typeof computeMonth>) => ({ net: r.net, netTotal: r.netTotal, aConfirmer: r.evenementAConfirmer, jours: r.joursActivite, retenue: r.retenue, joursEvt: r.joursEvenementAConfirmer });
const calc = (m: string, ls: AmLeave[]) => lire(computeMonth(makeCtx(c, [], ls, '2026-12-31'), m));

/** Saisie à l'écran, dans l'ordre, avec la même réponse à chaque question « C'est la suite de… ? » */
function saisir(ls: Cas[1], oui: boolean): AmLeave[] {
  const out: AmLeave[] = [];
  ls.forEach(([n, from, to], i) => {
    const l = absenceSaisie('evenement', n, `e${i}`, from, to)!;
    const q = questionSuite(from, to, out);
    if (i > 0) expect(q?.sens).toBe('avant');
    for (const x of appliquerReponseSuite(l, q, oui)) {
      const k = out.findIndex((y) => y.id === x.id);
      if (k >= 0) out[k] = x; else out.push(x);
    }
  });
  return out;
}

describe('question à la saisie', () => {
  it('une autre absence à 15 jours au plus : question sur la plus proche avant, avec sa date', () => {
    const a = absenceSaisie('evenement', 'mariage', 'a', '2026-06-01', '2026-06-02')!;
    const b = absenceSaisie('evenement', 'mariage', 'b', '2026-06-08', '2026-06-10')!;
    const q = questionSuite('2026-06-15', '2026-06-15', [a, b])!;
    expect(q.autre.id).toBe('b');
    expect(texteQuestionSuite(q)).toBe('C’est la suite de l’absence du 08/06 ?');
  });
  it('plus de 15 jours d’écart, ou une autre absence que l’événement familial : pas de question', () => {
    const a = absenceSaisie('evenement', 'mariage', 'a', '2026-05-01', '2026-05-02')!;
    const cp: AmLeave = { id: 'cp', type: 'cp', from: '2026-06-10', to: '2026-06-12' };
    expect(questionSuite('2026-06-15', '2026-06-15', [a, cp])).toBeUndefined();
  });
  it('saisie dans le désordre : l’app demande si l’absence d’après est la suite ; « oui » relie la nouvelle à elle', () => {
    const apres = absenceSaisie('evenement', 'naissance', 'x', '2026-10-12', '2026-10-14')!;
    const nouvelle = absenceSaisie('evenement', 'naissance', 'y', '2026-10-05', '2026-10-07')!;
    const q = questionSuite(nouvelle.from, nouvelle.to, [apres])!;
    expect(q.sens).toBe('apres');
    expect(texteQuestionSuite(q)).toBe('L’absence du 12/10 est-elle la suite de celle-ci ?');
    const ls = appliquerReponseSuite(nouvelle, q, true);
    expect(ls).toEqual([{ ...nouvelle, suiteDe: 'x' }]);
    ls.push(apres);
    expect(calc('2026-10', ls)).toEqual(avant.D); // comme saisi dans l'ordre
    expect(appliquerReponseSuite(nouvelle, q, false)).toEqual([nouvelle]);
  });
  it('le lien est un identifiant interne, sans la raison', () => {
    const ls = saisir(CAS.A[1], true);
    expect(ls[1]).toEqual({ id: 'e1', type: 'evenement', from: '2026-06-15', to: '2026-06-19', joursEvenement: 10, suiteDe: 'e0' });
    expect(JSON.stringify(ls)).not.toMatch(/handicap|nature/);
  });
});

describe('cas A, B, C, F : réponse « oui » ou « non »', () => {
  for (const k of ['A', 'B', 'C', 'F']) {
    const [m, ls] = CAS[k];
    const sans = avant[`${k}-sans`];
    it(`${k}, « non » : chaque événement payé selon sa propre durée, rien retenu`, () => {
      const r = calc(m, saisir(ls, false));
      expect(r.retenue).toBe(0);
      expect(r.net + r.aConfirmer).toBe(sans.net); // jamais payé en moins en silence
      // Durée propre de chaque saisie (calculée seule) : même total à confirmer que la somme des absences seules.
      const seules = ls.map(([n, from, to], i) => calc(m, [absenceSaisie('evenement', n, `s${i}`, from, to)!]).aConfirmer).reduce((a, b) => a + b, 0);
      expect(r.aConfirmer).toBe(seules);
      // Natures différentes (B, C, F) : c'est ce que faisait 9a078a7.
      if (k !== 'A') expect(r).toEqual(avant[k]);
    });
    it(`${k}, « oui » : durée de la première saisie, les jours en trop « à confirmer », jamais retenus`, () => {
      const r = calc(m, saisir(ls, true));
      expect(r.retenue).toBe(0);
      expect(r.aConfirmer).toBeGreaterThan(0);
      expect(r.net + r.aConfirmer).toBe(sans.net);
      // Même nature (A) : c'est ce que faisait 9a078a7.
      if (k === 'A') expect(r).toEqual(avant.A);
    });
  }
  it('A, « oui » : 4 jours à confirmer (5 jours prévus au 10/06/2026, avant la loi du 12 juin 2026), comme 9a078a7', () => {
    expect(calc('2026-06', saisir(CAS.A[1], true)).joursEvt).toBe(4);
    expect(calc('2026-06', saisir(CAS.A[1], false)).joursEvt).toBe(0);
  });
});

describe('migration : saisies d’avant (avec nature) reliées comme à 9a078a7, même paie', () => {
  for (const [k, [m, ls]] of Object.entries(CAS)) {
    it(k, () => {
      const lues: AbsenceLue[] = ls.map(([n, from, to], i) => ({ id: `e${i}`, type: 'evenement', from, to, nature: n }));
      const migrees = normaliserAbsences(lues);
      expect(JSON.stringify(migrees)).not.toContain('nature');
      expect(calc(m, migrees)).toEqual(avant[k]);
    });
  }
  it('le lien posé suit l’ancienne règle : même nature seulement, la plus proche avant', () => {
    const lues: AbsenceLue[] = CAS.G[1].map(([n, from, to], i) => ({ id: `e${i}`, type: 'evenement', from, to, nature: n }));
    expect(normaliserAbsences(lues).map((l) => l.suiteDe)).toEqual([undefined, 'e0', 'e1']);
    const b: AbsenceLue[] = CAS.B[1].map(([n, from, to], i) => ({ id: `e${i}`, type: 'evenement', from, to, nature: n }));
    expect(normaliserAbsences(b).map((l) => l.suiteDe)).toEqual([undefined, undefined]);
  });
});

// Relecture ciblée de la n° 52 (N1, N2) : un groupe se lit dans les deux sens et reste entier après une suppression.
describe('groupes : ressaisie, saisie au milieu, suppression', () => {
  const sans = (m: string) => calc(m, []);
  /** Saisie à l'écran d'une absence, avec la réponse donnée (la question doit être posée si `oui` est donné) */
  const ajouter = (ls: AmLeave[], id: string, n: NatureEvenement, from: string, to: string, oui?: boolean): AmLeave[] => {
    const q = questionSuite(from, to, ls);
    if (oui !== undefined) expect(q).toBeDefined();
    return [...ls, ...appliquerReponseSuite(absenceSaisie('evenement', n, id, from, to)!, q, !!oui)];
  };
  const supprimer = (ls: AmLeave[], id: string): AmLeave[] => {
    const r = liensApresSuppression(id, ls);
    return ls.filter((x) => x.id !== id).map((x) => r.find((y) => y.id === x.id) ?? x);
  };
  /** Ce que donnait 9a078a7 pour les mêmes absences saisies avec leur nature (relié par l'ancienne règle) */
  const avecNature = (m: string, ls: [NatureEvenement, string, string][]) =>
    calc(m, normaliserAbsences(ls.map(([n, from, to], i) => ({ id: `n${i}`, type: 'evenement', from, to, nature: n }))));

  it('N1 : naissance 05-06/10, 12-13/10 « oui », suppression du 05/10 puis ressaisie 06-07/10 : question posée, 1 jour à confirmer', () => {
    let ls = ajouter([], 'a', 'naissance', '2026-10-05', '2026-10-06');
    ls = ajouter(ls, 'b', 'naissance', '2026-10-12', '2026-10-13', true);
    ls = supprimer(ls, 'a');
    expect(ls.find((x) => x.id === 'b')?.suiteDe).toBeUndefined(); // plus de lien vers une absence supprimée
    expect(questionSuite('2026-10-06', '2026-10-07', ls)?.autre.id).toBe('b');
    const oui = ajouter(ls, 'c', 'naissance', '2026-10-06', '2026-10-07', true);
    const r = calc('2026-10', oui);
    expect(r.joursEvt).toBe(1);
    expect(r.retenue).toBe(0);
    expect(r.net + r.aConfirmer).toBe(sans('2026-10').net);
    expect(r).toEqual(avecNature('2026-10', [['naissance', '2026-10-06', '2026-10-07'], ['naissance', '2026-10-12', '2026-10-13']]));
  });

  it('N2 : 05/10, 12/10 « suite du 05/10 », puis 08-09/10 « oui » : un seul groupe, comme 9a078a7', () => {
    let ls = ajouter([], 'x', 'naissance', '2026-10-05', '2026-10-05');
    ls = ajouter(ls, 'y', 'naissance', '2026-10-12', '2026-10-12', true);
    ls = ajouter(ls, 'z', 'naissance', '2026-10-08', '2026-10-09', true);
    const r = calc('2026-10', ls);
    expect(r.joursEvt).toBeGreaterThan(0);
    expect(r.retenue).toBe(0);
    expect(r.net + r.aConfirmer).toBe(sans('2026-10').net);
    expect(r).toEqual(avecNature('2026-10', [['naissance', '2026-10-05', '2026-10-05'], ['naissance', '2026-10-12', '2026-10-12'], ['naissance', '2026-10-08', '2026-10-09']]));
  });

  it('suppression au milieu d’une suite : les deux autres restent reliées', () => {
    let ls = ajouter([], 'p', 'naissance', '2026-10-05', '2026-10-06');
    ls = ajouter(ls, 'q', 'naissance', '2026-10-08', '2026-10-08', true);
    ls = ajouter(ls, 'r', 'naissance', '2026-10-12', '2026-10-13', true);
    ls = supprimer(ls, 'q');
    expect(ls.find((x) => x.id === 'r')?.suiteDe).toBe('p');
    const r = calc('2026-10', ls);
    expect(r).toEqual(avecNature('2026-10', [['naissance', '2026-10-05', '2026-10-06'], ['naissance', '2026-10-12', '2026-10-13']]));
    expect(r.joursEvt).toBe(1);
    expect(r.net + r.aConfirmer).toBe(sans('2026-10').net);
  });

  it('suppression de la première : la suivante devient la première, les autres la désignent', () => {
    let ls = ajouter([], 'p', 'mariage', '2026-10-05', '2026-10-05');
    ls = ajouter(ls, 'q', 'mariage', '2026-10-08', '2026-10-09', true);
    ls = [...ls, { ...absenceSaisie('evenement', 'mariage', 's', '2026-10-12', '2026-10-14')!, suiteDe: 'p' }];
    ls = supprimer(ls, 'p');
    expect(ls.find((x) => x.id === 'q')?.suiteDe).toBeUndefined();
    expect(ls.find((x) => x.id === 's')?.suiteDe).toBe('q');
    const r = calc('2026-10', ls);
    expect(r).toEqual(avecNature('2026-10', [['mariage', '2026-10-08', '2026-10-09'], ['mariage', '2026-10-12', '2026-10-14']]));
  });

  it('lien vers une absence qui n’existe plus : ignoré, l’absence compte seule', () => {
    const l = { ...absenceSaisie('evenement', 'naissance', 'w', '2026-10-05', '2026-10-09')!, suiteDe: 'disparue' };
    expect(calc('2026-10', [l])).toEqual(calc('2026-10', [absenceSaisie('evenement', 'naissance', 'w', '2026-10-05', '2026-10-09')!]));
  });
});

// Relecture 3 de la n° 52 (R1) : une absence voisine avant ET une après. Après « non » pour celle d'avant, l'app demande
// aussi pour celle d'après.
describe('deux absences voisines, avant et après', () => {
  const X = absenceSaisie('evenement', 'naissance', 'X', '2026-10-01', '2026-10-01')!;
  const Z = absenceSaisie('evenement', 'mariage', 'Z', '2026-10-20', '2026-10-21')!;
  const Y = absenceSaisie('evenement', 'mariage', 'Y', '2026-10-14', '2026-10-16')!;
  const qs = questionsSuite(Y.from, Y.to, [X, Z]);
  const sans = calc('2026-10', []);

  it('deux questions : X d’abord ; celle de Z seulement après « non »', () => {
    expect(qs.map((q) => `${q.sens}|${q.autre.id}`)).toEqual(['avant|X', 'apres|Z']);
    expect(questionsVisibles(qs, [undefined, undefined])).toHaveLength(1);
    expect(questionsVisibles(qs, ['oui', undefined])).toHaveLength(1);
    expect(questionsVisibles(qs, ['non', undefined])).toHaveLength(2);
    expect(reponsesCompletes(qs, ['non', undefined])).toBe(false); // Enregistrer grisé
    expect(reponsesCompletes(qs, ['non', 'oui'])).toBe(true);
    expect(reponsesCompletes(qs, ['oui', undefined])).toBe(true);
  });

  it('« non » pour X, « oui » pour Z : Y rejoint Z, 1 jour à confirmer (5 jours pour 4), comme 9a078a7', () => {
    const ls = [X, Z, ...appliquerReponses(Y, qs, ['non', 'oui'] as Reponse[])];
    expect(ls.find((l) => l.id === 'Y')?.suiteDe).toBe('Z');
    expect(ls.find((l) => l.id === 'Z')?.suiteDe).toBeUndefined(); // le lien est posé sur la nouvelle absence
    const r = calc('2026-10', ls);
    expect(r.joursEvt).toBe(1);
    expect(r.retenue).toBe(0);
    expect(r.net + r.aConfirmer).toBe(sans.net);
    const avecNature = normaliserAbsences([
      { id: 'X', type: 'evenement', from: X.from, to: X.to, nature: 'naissance' },
      { id: 'Z', type: 'evenement', from: Z.from, to: Z.to, nature: 'mariage' },
      { id: 'Y', type: 'evenement', from: Y.from, to: Y.to, nature: 'mariage' },
    ]);
    expect(r).toEqual(calc('2026-10', avecNature));
  });

  it('« non » pour les deux : trois événements, chacun selon sa durée, rien en silence', () => {
    const ls = [X, Z, ...appliquerReponses(Y, qs, ['non', 'non'] as Reponse[])];
    expect(ls.some((l) => l.suiteDe)).toBe(false);
    const r = calc('2026-10', ls);
    expect(r.retenue).toBe(0);
    expect(r.aConfirmer).toBe(0); // 1, 3 et 2 jours, chacun dans sa durée
    expect(r.net).toBe(sans.net);
  });

  it('« oui » pour X : Y rejoint X, pas de seconde question', () => {
    const ls = appliquerReponses(Y, qs, ['oui', 'oui'] as Reponse[]);
    expect(ls).toEqual([{ ...Y, suiteDe: 'X' }]);
  });
});
