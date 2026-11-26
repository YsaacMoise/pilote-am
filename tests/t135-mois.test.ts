import { describe, expect, it } from 'vitest';
import { joursLunette, masquerMontants, MONTANT_CACHE, valeurACopier } from '../src/screens/Mois';
import type { Contract, Planning } from '../src/engine/model';
import { euros } from '../src/engine/money';

// T-135 (retours du DG du 26/11/2026 soir) : lunette de l'enfant choisi ; paie cachée partout dans Mois.
function week(days: number[]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start: '08:00', end: '17:00' }];
  return p;
}
const contrat = (id: string, child: string, days: number[]): Contract => ({
  id, child, family: 'Martin', color: 0, start: '2026-01-05', yearType: 'complete', weeks: 52, weeksOff: [],
  planning: week(days), rateNet: 350, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
  kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2026-01-05',
  balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0,
  alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
});

describe('Lunette : vue de tous et calendrier d’un enfant', () => {
  const lea = contrat('c1', 'Léa', [1, 2, 3, 4, 5]);
  const tom = contrat('c2', 'Tom', [1, 3]);
  it('vue de tous : un jour dès qu’un contrat prévoit un accueil', () => {
    const j = joursLunette([lea, tom], '2026-12', []);
    expect(j.length).toBe(23); // décembre 2026 : 23 jours du lundi au vendredi
  });
  it('enfant choisi : seulement ses jours prévus', () => {
    const j = joursLunette([tom], '2026-12', []);
    expect(j.map((x) => x.d)).toEqual(['2026-12-02', '2026-12-07', '2026-12-09', '2026-12-14', '2026-12-16', '2026-12-21', '2026-12-23', '2026-12-28', '2026-12-30']);
    expect(j.every((x) => x.absents.length === 0)).toBe(true);
  });
  it('enfant choisi : férié gardé et marqué (25 décembre, un vendredi pour Léa)', () => {
    const j = joursLunette([lea], '2026-12', []);
    expect(j.find((x) => x.d === '2026-12-25')?.ferie).toBe(true);
  });
  it('absence de l’AM : jours retirés, comme la vue de tous', () => {
    const j = joursLunette([tom], '2026-12', [{ from: '2026-12-07', to: '2026-12-09' }]);
    expect(j.some((x) => x.d >= '2026-12-07' && x.d <= '2026-12-09')).toBe(false);
  });
});

describe('Paie cachée : montants masqués, valeur copiée intacte', () => {
  it('masque chaque montant d’une alerte, garde le reste du texte', () => {
    const a = `Indemnité d’entretien : le montant du contrat (${euros(400)} par jour) est sous le minimum. L’app verse le minimum, soit ${euros(123456)} de plus que le contrat ce mois-ci.`;
    const m = masquerMontants(a);
    expect(m).toBe(`Indemnité d’entretien : le montant du contrat (${MONTANT_CACHE} par jour) est sous le minimum. L’app verse le minimum, soit ${MONTANT_CACHE} de plus que le contrat ce mois-ci.`);
    expect(m).not.toMatch(/\d,\d\d/);
  });
  it('montant négatif masqué en entier', () => {
    expect(masquerMontants(`−${euros(3547)}`)).toBe(MONTANT_CACHE);
  });
  it('texte sans montant inchangé', () => {
    expect(masquerMontants('Article 114.1, 5 jours par an')).toBe('Article 114.1, 5 jours par an');
  });
  it('« Copier » garde la vraie valeur, même cachée', () => {
    expect(valeurACopier(euros(71195))).toBe('711,95');
  });
});
