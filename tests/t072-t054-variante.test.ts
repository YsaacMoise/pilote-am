// T-072 / T-054 (M12, rapports/T-050b-M12.md § 6) : fin de contrat avec le total des bulletins saisi jusqu'au dernier mois.
// La variante « fin un jour plus tard » ne doit ajouter aucun salaire pour un mois déjà couvert par les bulletins : les
// bruts perçus de ce mois sont ceux du bulletin (assiette du 1/80, CCN art. 121.1). Un jour d'un mois non couvert reste
// compté. Contrat des tests C-008 (tests/fiscal.test.ts) : 52 semaines, 9 h par jour du lundi au vendredi, 3,50 € net.
import { describe, expect, it } from 'vitest';
import type { Contract, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { finDeContrat } from '../src/engine/fin';
import { addDays, monthOf } from '../src/engine/dates';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning { const p: Planning = {}; for (const d of days) p[d] = [{ start, end }]; return p; }
const contrat = (): Contract => ({ id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2026-01-05', yearType: 'complete', weeks: 52, weeksOff: [],
  planning: week('08:00', '17:00'), rateNet: 350, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
  kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2026-01-05', alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
  balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0 } as Contract);
const ctx = () => makeCtx(contrat(), [], [], '2027-12-31');
const T = 1234500;
const eur = (s: string) => Math.round(parseFloat(s.replace(/\s| | /g, '').replace(',', '.')) * 100);
/** Variantes lues dans le message : date de fin (AAAA-MM-JJ) → montant en centimes */
describe('T-054, revu par la T-103 (F1) : une seule date de fin, bulletins saisis jusqu’au dernier mois', () => {
  it('cas du constat (C-008) : fin le 16/11/2026, total 12 345,00 € jusqu’en novembre : 154,31 €, sans réserve', () => {
    const f = finDeContrat(ctx(), '2026-11-02', 'retrait', 0, undefined, { total: T, jusqua: '2026-11' });
    expect(f.dernierJour).toBe('2026-11-16');
    expect(f.indemniteRupture).toBe(15431);
    expect(f.ruptureAConfirmer).toBeFalsy();
  });

  it('chaque date de fin d’octobre 2026 à avril 2027 (février compris) : total des bulletins seul, rien en trop', () => {
    const fautes: string[] = [];
    let vus = 0;
    for (let notif = '2026-10-05'; notif <= '2027-03-31'; notif = addDays(notif, 1)) {
      const f0 = finDeContrat(ctx(), notif, 'retrait');
      const jusqua = monthOf(f0.dernierJour);
      const f = finDeContrat(ctx(), notif, 'retrait', 0, undefined, { total: T, jusqua });
      expect(f.dernierJour).toBe(f0.dernierJour);
      const base = Math.round(T / 80);
      if (f.indemniteRupture !== base) fautes.push(`${notif} : ${f.indemniteRupture} au lieu de ${base}`);
      if (f.ruptureAConfirmer) fautes.push(`${notif} (fin ${f.dernierJour}) : indemnité non calculée`);
      vus++;
    }
    expect(vus).toBe(178);
    expect(fautes).toEqual([]);
  }, 60000);

  it('fin le samedi 31/10/2026, total saisi jusqu’à octobre : 154,31 €, sans réserve', () => {
    const f = finDeContrat(ctx(), '2026-10-17', 'retrait', 0, undefined, { total: T, jusqua: '2026-10' });
    expect(f.dernierJour).toBe('2026-10-31');
    expect(f.cpAConfirmer).toBeUndefined();
    expect(f.ruptureAConfirmer).toBeFalsy();
    expect(f.indemniteRupture).toBe(15431);
  });

  it('brut du dernier mois lu sur un bulletin contrôlé : il remplace le calcul de ce mois', () => {
    const f = finDeContrat(ctx(), '2026-11-02', 'retrait', 0, undefined, { total: 1100000, jusqua: '2026-10', parMois: { '2026-11': 140000 } });
    expect(f.totalBrut).toBe(1240000);
    expect(f.indemniteRupture).toBe(15500);
  });
});
