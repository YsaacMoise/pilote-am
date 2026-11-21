// T-050d (correcteur M13), points B-1 (fiche Bertrand) et C-1. Comme tests/t050b-regularisation.test.ts, ce fichier
// neutralise les seules raisons « jours à confirmer » des congés (acquisition, indemnité annuelle, compteur, congés du mois)
// pour isoler le mécanisme testé ; il garde le net comme brut (netToBrut neutre), comme la sonde du relecteur sur la fiche.
import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/engine/rates', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/engine/rates')>()), netToBrut: (n: number) => n }));
vi.mock('../src/engine/conges', async (importOriginal) => {
  const m = await importOriginal<typeof import('../src/engine/conges')>();
  return {
    ...m,
    acquisition: (...a: Parameters<typeof m.acquisition>) => ({ ...m.acquisition(...a), aConfirmer: undefined }),
    indemnite: (...a: Parameters<typeof m.indemnite>) => ({ ...m.indemnite(...a), aConfirmer: undefined }),
    compteur: (...a: Parameters<typeof m.compteur>) => ({ ...m.compteur(...a), aPrendreAConfirmer: undefined, decompteAConfirmer: [] }),
    cpForMonth: (...a: Parameters<typeof m.cpForMonth>) => ({ ...m.cpForMonth(...a), aConfirmer: undefined }),
  };
});
import type { AmLeave, Contract, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { finDeContrat } from '../src/engine/fin';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}
const conge = (type: AmLeave['type'], from: string, to: string): AmLeave => ({ id: `${type}${from}`, type, from, to });
function contrat(over: Partial<Contract>): Contract {
  return {
    id: 'c1', child: 'P', family: 'E', color: 0, start: '2021-09-01', yearType: 'complete', weeks: 52, weeksOff: [],
    planning: week('08:00', '16:00'), rateNet: 500, majoration: 15, entretienJour: 0, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'fur', majoreFiscal: false, trackedFrom: '2021-09-01', alsaceMoselle: false, planningVariable: false,
    accueilOccasionnel: false, cdd: false, balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, ...over,
  };
}

// Fiche DDETS 31 « Accueil sur 46 semaines ou moins » (Bertrand), comme la sonde p3 du relecteur : retrait remis le
// 01/09/2022, préavis d'un mois, fin le 30/09/2022 ; variante « fin le 01/10/2022 » (premier jour du préavis compté ou non).
const AN1 = ['2021-10-25', '2021-11-01', '2021-12-20', '2021-12-27', '2022-02-21', '2022-02-28', '2022-04-25', '2022-05-02', '2022-07-04', '2022-07-11', '2022-07-18', '2022-07-25', '2022-08-01', '2022-08-08', '2022-08-15', '2022-08-22'];
const AN2 = ['2022-10-24', '2022-10-31', '2022-12-19', '2022-12-26', '2023-02-13', '2023-02-20', '2023-04-17', '2023-04-24', '2023-07-10', '2023-07-17', '2023-07-24', '2023-07-31', '2023-08-07', '2023-08-14', '2023-08-21', '2023-08-28'];
const bertrand = () => contrat({ yearType: 'incomplete', weeks: 36, weeksOff: [...AN1, ...AN2] });
const ctxB = () => makeCtx(bertrand(), [], [conge('am_malade', '2021-10-13', '2021-10-15'), conge('cp', '2022-08-01', '2022-08-13')], '2022-10-15', 2);

describe('T-050d, B-1 : fiche Bertrand, la variante du lendemain ne recompte ni l’ICCP ni la régularisation', () => {
  it('total des bulletins saisi jusqu’à septembre 2022 (9 000,00 €) : 112,50 € pour les deux dates, pas 130,24 €', () => {
    // À la main : 9 000,00 ÷ 80 = 112,50 €. Le 01/10/2022 est un samedi, sans accueil (lundi au vendredi) : aucun salaire
    // en plus ; l'ICCP et la régularisation sont déjà dans le bulletin de septembre. La variante vaut donc 112,50 € aussi.
    const f = finDeContrat(ctxB(), '2022-09-01', 'retrait', 2, undefined, { total: 900000, jusqua: '2022-09' });
    expect(f.dernierJour).toBe('2022-09-30');
    expect(f.regularisation).toBeGreaterThan(0);
    expect(f.cpIndemnite).toBeGreaterThan(0);
    expect(f.totalBrut).toBe(900000);
    expect(f.indemniteRupture).toBe(11250);
    expect(f.ruptureVariantes).toBeUndefined();
    expect(f.ruptureAConfirmer).toBeFalsy();
  });
  it('sans bulletins saisis : la variante du 01/10/2022 donne le même montant que la fin au 30/09/2022', () => {
    // Le samedi 01/10/2022 n'ajoute aucun salaire : même assiette (salaires, régularisation et ICCP), même indemnité.
    const f = finDeContrat(ctxB(), '2022-09-01', 'retrait', 2);
    const lendemain = finDeContrat(ctxB(), '2022-09-01', 'retrait', 2, '2022-09-02');
    expect(lendemain.dernierJour).toBe('2022-10-01');
    // Assiette : 7 714,29 € de salaires et 285,71 € de régularisation (fiche), plus 1 133,33 € d'ICCP (moteur, vérifiée par
    // le relecteur, R-1) = 9 133,33 € ; 9 133,33 ÷ 80 = 114,17 €.
    expect(f.regularisation).toBe(28571);
    expect(f.cpIndemnite).toBe(113333);
    expect(f.totalBrut).toBe(771429 + 28571 + 113333);
    expect(f.indemniteRupture).toBe(11417);
    expect(lendemain.totalBrut).toBe(f.totalBrut);
    expect(f.indemniteRupture).toBe(Math.round(f.totalBrut / 80));
    expect(lendemain.indemniteRupture).toBe(f.indemniteRupture);
    expect(f.ruptureVariantes).toBeUndefined();
    expect(f.ruptureAConfirmer).toBeFalsy();
  });
});

// Contrat des tests t038 : 36 semaines, 40 h du lundi au vendredi, 5 € net de l'heure.
const lundis = (from: string, n: number) => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7 * i);
  return d.toISOString().slice(0, 10);
});
const SEMAINES_OFF = [...lundis('2025-10-20', 2), ...lundis('2025-12-22', 2), ...lundis('2026-02-16', 2), ...lundis('2026-04-13', 2), ...lundis('2026-07-06', 8), '2026-10-19'];
const t038 = (weeksOff: string[]) => contrat({ start: '2025-09-01', trackedFrom: '2025-09-01', yearType: 'incomplete', weeks: 36, weeksOff, majoration: 10, cpMode: 'juin' });

const f0 = () => finDeContrat(makeCtx(t038(SEMAINES_OFF.filter((w) => w !== '2026-10-19')), [], [], '2026-11-18'), '2026-10-28', 'retrait');

describe('T-050d, C-1 : régularisation non calculée, l’ICCP et l’indemnité de rupture qui en dépendent sont « à confirmer »', () => {
  it('toutes les semaines sans accueil saisies : témoin, ICCP donnée et indemnité de rupture sûre', () => {
    const f = finDeContrat(makeCtx(t038(SEMAINES_OFF), [], [], '2026-11-18'), '2026-10-28', 'retrait');
    expect(f.cpAConfirmer).toBeUndefined();
    expect(f.cpIndemnite).toBeGreaterThan(0);
    expect(f.ruptureAConfirmer).toBeFalsy();
  });
  it('la seule semaine sans accueil saisie de la 2e année (19/10/2026) manque, il en faut 16 : ICCP et rupture « à confirmer », raison dite', () => {
    const f = finDeContrat(makeCtx(t038(SEMAINES_OFF.filter((w) => w !== '2026-10-19')), [], [], '2026-11-18'), '2026-10-28', 'retrait');
    expect(f.regularisation).toBe(0);
    expect(f.alertes.some((a) => a.startsWith('Régularisation non calculée : il manque 16 semaines sans accueil') && a.includes('L’indemnité de congés non pris en dépend : elle est à confirmer.'))).toBe(true);
    expect(f.cpIndemnite).toBe(0);
    expect(f.cpAConfirmer).toContain('la régularisation de fin de contrat n’est pas calculée (il manque 16 semaines sans accueil)');
    expect(f.cpExplication).toContain('À confirmer');
    expect(f.indemniteRupture).toBeGreaterThan(0);
    expect(f.ruptureAConfirmer).toBe(true);
    expect(f.alertes).toContain('Indemnité de rupture à confirmer : elle ne compte pas encore l’indemnité de congés non pris à confirmer, ni la régularisation de fin de contrat, qui n’est pas calculée : il manque des semaines sans accueil.');
  });
  it('même cas, total des bulletins saisi jusqu’au dernier mois : ICCP « à confirmer », rupture sur les bulletins', () => {
    const f = finDeContrat(makeCtx(t038(SEMAINES_OFF.filter((w) => w !== '2026-10-19')), [], [], '2026-11-18'), '2026-10-28', 'retrait', 0, undefined, { total: 1000000, jusqua: f0().dernierJour.slice(0, 7) as `${number}-${number}` });
    expect(f.cpAConfirmer).toContain('n’est pas calculée');
    expect(f.cpIndemnite).toBe(0);
    expect(f.totalBrut).toBe(1000000);
  });
});
