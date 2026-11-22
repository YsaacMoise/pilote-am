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
function variantesDe(msg: string | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of (msg ?? '').matchAll(/[Ff]in le (\d\d)\/(\d\d)\/(\d{4}) : ([\d\s  ,]+)\s?€/g)) out.set(`${m[3]}-${m[2]}-${m[1]}`, eur(m[4]));
  return out;
}

describe('T-054 : variante de date de fin et bulletins saisis jusqu’au dernier mois', () => {
  it('cas du constat (C-008) : fin le 16/11/2026, total 12 345,00 € jusqu’en novembre : 154,31 € sûr, plus de « 154,83 € »', () => {
    const f = finDeContrat(ctx(), '2026-11-02', 'retrait', 0, undefined, { total: T, jusqua: '2026-11' });
    expect(f.dernierJour).toBe('2026-11-16');
    expect(f.preavisFinAConfirmer).toBeTruthy();
    expect(f.indemniteRupture).toBe(15431);
    expect(f.ruptureVariantes).toBeUndefined();
    expect(f.ruptureAConfirmer).toBeFalsy();
  });

  it('chaque date de fin d’octobre 2026 à avril 2027 (février compris) : aucun jour de salaire en trop dans un mois couvert', () => {
    const fautes: string[] = [];
    let vus = 0, finsDeMois = 0;
    for (let notif = '2026-10-05'; notif <= '2027-03-31'; notif = addDays(notif, 1)) {
      const f0 = finDeContrat(ctx(), notif, 'retrait');
      const jusqua = monthOf(f0.dernierJour);
      const f = finDeContrat(ctx(), notif, 'retrait', 0, undefined, { total: T, jusqua });
      expect(f.dernierJour).toBe(f0.dernierJour);
      const base = Math.round(T / 80);
      if (f.indemniteRupture !== base) fautes.push(`${notif} : base ${f.indemniteRupture} au lieu de ${base}`);
      const lendemain = addDays(f.dernierJour, 1);
      const v = variantesDe(f.ruptureVariantes);
      vus++;
      if (monthOf(lendemain) === jusqua) {
        // Lendemain dans un mois couvert : même montant, donc pas de variante.
        if (f.ruptureVariantes) fautes.push(`${notif} (fin ${f.dernierJour}) : ${f.ruptureVariantes.slice(0, 140)}`);
      } else {
        // Fin le dernier jour du mois : le lendemain est dans un mois non couvert. Un jour sans accueil (samedi, dimanche)
        // n'ajoute rien ; un jour d'accueil ajoute son salaire, donc un montant plus haut.
        finsDeMois++;
        const jour = new Date(`${lendemain}T12:00:00Z`).getUTCDay();
        if (jour === 0 || jour === 6) { if (f.ruptureVariantes) fautes.push(`${notif} (fin ${f.dernierJour}, lendemain week-end) : ${f.ruptureVariantes.slice(0, 140)}`); }
        else if (!((v.get(lendemain) ?? 0) > base)) fautes.push(`${notif} (fin ${f.dernierJour}) : le jour du ${lendemain} n'est pas compté`);
      }
    }
    expect(vus).toBe(178);
    expect(finsDeMois).toBeGreaterThanOrEqual(6);
    expect(fautes).toEqual([]);
  });

  it('brut du dernier mois lu sur un bulletin contrôlé : la variante du lendemain, dans ce mois, n’ajoute rien', () => {
    const f = finDeContrat(ctx(), '2026-11-02', 'retrait', 0, undefined, { total: 1100000, jusqua: '2026-10', parMois: { '2026-11': 140000 } });
    expect(f.ruptureVariantes).toBeUndefined();
  });
});
