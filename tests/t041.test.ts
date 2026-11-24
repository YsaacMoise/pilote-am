// T-041 : constats M-6 et R-2 de la relecture V4 (regles/t036-relecture.md).
// M-6 : CCN IDCC 3239, socle AM, art. 105, lu en entier sur Légifrance le 18/11/2026 (KALISCTA000043941866) :
// « en cas d'absence durant 14 jours calendaires consécutifs ». Le texte ne dit pas si les jours sans accueil prévu
// couverts par le certificat après le dernier jour d'absence comptent : les jours restent « à confirmer », le message le dit
// (texte du message revu par la suite T-041 : « le dernier jour du certificat (entre le … et le …) »).
import { describe, expect, it } from 'vitest';
import type { Contract, DayRec, Planning } from '../src/engine/model';
import { makeCtx, sickDeductible, sickLectures } from '../src/engine/payroll';
import { RATES, dateLongue, entretienHoraireMin, minConvDepuis, minimumTitreAmAp, ratesConnus, repasAvantageAu, repasAvantageParAnnee, valeurDepuis, type Rates } from '../src/engine/rates';
import { eurosTexte } from '../src/engine/money';
import { controle } from '../src/engine/controle';
import { computeMonth } from '../src/engine/month';

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
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0,
    alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false, ...over,
  };
}
const rec = (date: string, r: Partial<DayRec>): DayRec => ({ key: `c1|${date}`, cid: 'c1', date, ...r });
const malade = (jours: string[]) => jours.map((d) => rec(`2026-03-${d}`, { abs: 'malade_certif' }));

describe('T-041 M-6, revu par la T-103 : art. 105, dates du certificat', () => {
  it('lundi 9 au vendredi 20 mars, sans dates de certificat : le certificat peut couvrir le week-end (14 jours) : l’app les demande', () => {
    const ctx = makeCtx(contract(), malade(['09', '10', '11', '12', '13', '16', '17', '18', '19', '20']), [], '2026-04-01');
    const { demandes } = sickLectures(ctx);
    expect([...demandes.keys()].sort()).toEqual(['2026-03-16', '2026-03-17', '2026-03-18', '2026-03-19', '2026-03-20']);
    expect(demandes.get('2026-03-16')!).toMatch(/indique les dates de début et de fin du certificat médical de l’absence du 09\/03 au 20\/03/);
  });
  it('même absence, certificat du 9 au 20 mars (12 jours) : absence courte, 5 jours retenus, le reste payé', () => {
    const jours = ['09', '10', '11', '12', '13', '16', '17', '18', '19', '20'].map((d) => rec(`2026-03-${d}`, { abs: 'malade_certif', certifDu: '2026-03-09', certifAu: '2026-03-20' }));
    const { retenus, demandes } = sickLectures(makeCtx(contract(), jours, [], '2026-04-01'));
    expect([...retenus].sort()).toEqual(['2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13']);
    expect(demandes.size).toBe(0);
  });
  it('certificat du 9 au 22 mars (14 jours calendaires) : absence longue, 10 jours retenus', () => {
    const jours = ['09', '10', '11', '12', '13', '16', '17', '18', '19', '20'].map((d) => rec(`2026-03-${d}`, { abs: 'malade_certif', certifDu: '2026-03-09', certifAu: '2026-03-22' }));
    expect(sickDeductible(makeCtx(contract(), jours, [], '2026-04-01')).size).toBe(10);
  });
  it('absence de 14 jours calendaires mesurée sur les jours prévus : longue, 10 jours retenus, rien à demander', () => {
    const ctx = makeCtx(contract(), malade(['09', '10', '11', '12', '13', '16', '17', '18', '19', '20', '23']), [], '2026-04-01');
    expect(sickDeductible(ctx).size).toBe(10);
    expect(sickLectures(ctx).demandes.size).toBe(0);
  });
});


// R-2 : les textes qui citent un barème le lisent dans rates.ts à la date du calcul (valeurs du tableau RATES,
// sources dans ses lignes : arrêté du 22 mai 2026, Urssaf mise à jour du 01/06/2026).
describe('T-041 R-2 : montants et dates de barème lus dans rates.ts', () => {
  it('au 18/11/2026 : minimum depuis le 1er juin 2026, entretien 0,435 € de l’heure et 2,65 € par jour', () => {
    expect(minConvDepuis('2026-11-18')).toBe('2026-06-01');
    expect(dateLongue(minConvDepuis('2026-11-18')!)).toBe('1er juin 2026');
    expect(eurosTexte(entretienHoraireMin('2026-11-18')!)).toBe('0,435 €');
    expect(eurosTexte(ratesConnus('2026-11-18').entretienPlancherJour)).toBe('2,65 €');
    expect(minimumTitreAmAp('2026-11-18')).toBe(437);
    expect(repasAvantageAu('2026-11-18')).toBe(550);
    expect(repasAvantageParAnnee()).toEqual([{ annee: '2026', montant: 550 }]);
  });
  it('format des montants cités : 875 €, 1 750 €, 5 €, 2,60 €', () => {
    expect(eurosTexte(87500)).toBe('875 €');
    expect(eurosTexte(175000)).toBe('1 750 €');
    expect(eurosTexte(500)).toBe('5 €');
    expect(eurosTexte(260)).toBe('2,60 €');
  });
  it('une revalorisation ajoutée dans RATES change les textes (SMIC et MG au 1er décembre, grille au 1er janvier)', () => {
    const base = RATES.at(-1)!;
    const dec: Rates = { ...base, from: '2026-12-01', smic: base.smic + 20, mg: base.mg + 7, source: 'test' };
    const jan: Rates = { ...dec, from: '2027-01-01', minConvBrut: base.minConvBrut + 10, minConvNet: (base.minConvNet ?? 0) + 8, repasAvantage: undefined, source: 'test' };
    RATES.push(dec, jan);
    try {
      // SMIC et MG changent, la grille non : le minimum date toujours du 1er juin 2026, l'entretien suit le MG.
      expect(minConvDepuis('2026-12-15')).toBe('2026-06-01');
      expect(entretienHoraireMin('2026-12-15')).toBe((base.mg + 7) / 10);
      expect(minimumTitreAmAp('2026-12-15')).toBe(437);
      // La grille change : nouvelle date, et le minimum avec le titre AM-AP n'est plus cité (valeur non connue).
      expect(minConvDepuis('2027-01-15')).toBe('2027-01-01');
      expect(minimumTitreAmAp('2027-01-15')).toBeUndefined();
      expect(repasAvantageAu('2027-01-15')).toBeUndefined();
      // Contrôle du bulletin : la date du minimum net vient de la grille, pas de la dernière ligne de barèmes.
      expect(valeurDepuis('2026-12-31', 'minConvNet')).toBe('2026-06-01');
    } finally {
      RATES.splice(RATES.indexOf(dec), 2);
    }
  });
  it('minimum net : date de la première ligne qui porte la valeur (1er janvier 2025, pas avant)', () => {
    expect(valeurDepuis('2025-02-15', 'minConvNet')).toBe('2025-01-01');
    expect(valeurDepuis('2024-06-15', 'minConvNet')).toBeUndefined();
  });
});

describe('T-041 R-2 : contrôle du bulletin, date du minimum net', () => {
  it('avec une ligne SMIC au 1er décembre 2026, le minimum net de décembre date toujours du 01/06/2026', () => {
    const base = RATES.at(-1)!;
    const dec: Rates = { ...base, from: '2026-12-01', smic: base.smic + 20, mg: base.mg + 7, source: 'test' };
    RATES.push(dec);
    try {
      const ctx = makeCtx(contract({ rateNet: 300 }), [], [], '2027-01-05');
      const r = computeMonth(ctx, '2026-12');
      const w = controle({ id: 'b', cid: 'c1', month: '2026-12', source: 'manuel' }, r, 300).find((x) => x.title === 'Taux du contrat sous le minimum')!;
      expect(w.detail).toMatch(/\(3,28\s€\) depuis le 01\/06\/2026/);
    } finally {
      RATES.splice(RATES.indexOf(dec), 1);
    }
  });
});

// T-103 (C1 à C5) : CCN 105 lu à la lettre (Cass. soc. 25/03/2020, n° 18-12.467) ; une date inconnue qui change le résultat
// est demandée à l'AM (le mois attend la saisie), jamais « à confirmer ».
describe('T-103 : art. 105, données demandées et lecture unique', () => {
  const malades = (jours: string[]) => jours.map((d) => rec(d, { abs: 'malade_certif' }));
  it('certificat qui peut commencer avant le premier jour prévu (lundi de Pâques) : le 20/04 dépend de cette date, elle est demandée', () => {
    const jours = ['2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10', '2026-04-13', '2026-04-14', '2026-04-15', '2026-04-16', '2026-04-17', '2026-04-20'];
    const { demandes } = sickLectures(makeCtx(contract(), malades(jours), [], '2026-05-01'));
    expect(demandes.has('2026-04-20')).toBe(true);
    expect(computeMonth(makeCtx(contract(), malades(jours), [], '2026-05-01'), '2026-04').nonGere.join(' ')).toMatch(/certificat médical/);
  });
  it('absences avant et après un férié, sans certificat : l’une peut couvrir l’autre, les dates sont demandées', () => {
    const jours = ['2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10'];
    expect(sickLectures(makeCtx(contract(), malades(jours), [], '2026-05-01')).demandes.size).toBeGreaterThan(0);
  });
  it('mêmes absences, un certificat du 30/03 au 10/04 (12 jours) : une absence courte, 5 jours retenus', () => {
    const jours = ['2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10'];
    const recs = jours.map((d) => rec(d, { abs: 'malade_certif', certifDu: '2026-03-30', certifAu: '2026-04-10' }));
    const { retenus, demandes } = sickLectures(makeCtx(contract(), recs, [], '2026-05-01'));
    expect([...retenus].sort()).toEqual(jours.slice(0, 5));
    expect(demandes.size).toBe(0);
  });
  it('(C4) absence à cheval sur la date anniversaire (11/03) : chaque jour compte dans sa période', () => {
    const c = contract({ start: '2025-03-11', trackedFrom: '2025-03-11' });
    const jours = ['2026-02-02', '2026-02-03', '2026-02-04', '2026-02-05', '2026-02-06', '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13'];
    const recs = jours.map((d) => rec(d, { abs: 'malade_certif', certifDu: d < '2026-03-01' ? '2026-02-02' : '2026-03-09', certifAu: d < '2026-03-01' ? '2026-02-06' : '2026-03-13' }));
    const { retenus, demandes } = sickLectures(makeCtx(c, recs, [], '2026-04-01'));
    expect([...retenus].sort()).toEqual([...jours.slice(0, 5), '2026-03-11', '2026-03-12', '2026-03-13']);
    expect(demandes.size).toBe(0);
  });
  it('(C2) accueil le lundi seulement : 3 lundis d’affilée (15 jours calendaires) = l’absence longue, retenue sur 14 jours', () => {
    const c = contract({ planning: week('08:00', '17:00', [1]) });
    const jours = ['2026-01-05', '2026-01-19', '2026-02-02', '2026-02-16', '2026-03-02', '2026-03-09', '2026-03-16'];
    const { retenus } = sickLectures(makeCtx(c, malades(jours), [], '2026-04-01'));
    expect([...retenus].sort()).toEqual(['2026-01-05', '2026-01-19', '2026-02-02', '2026-02-16', '2026-03-02', '2026-03-09']);
  });
  it('(C5) 6 jours déjà retenus avant l’app, origine inconnue : la question est posée ; absence longue : 3 jours retenus', () => {
    const c = contract({ start: '2025-09-01', trackedFrom: '2026-01-05', balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 6 } });
    const trois = malades(['2026-03-02', '2026-03-03', '2026-03-04']);
    expect(sickLectures(makeCtx(c, trois, [], '2026-04-01')).demandes.get('2026-03-02')!).toMatch(/déjà retenus avant le suivi par l’app/);
    const longue = contract({ ...c, balances: { ...c.balances, maladieDeduitsLongue: true } });
    expect(sickLectures(makeCtx(longue, trois, [], '2026-04-01')).retenus.size).toBe(3);
    const courtes = contract({ ...c, balances: { ...c.balances, maladieDeduitsLongue: false } });
    expect(sickLectures(makeCtx(courtes, trois, [], '2026-04-01')).retenus.size).toBe(0);
  });
});
