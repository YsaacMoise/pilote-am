// T-072 / T-055 (M12, rapports/T-050b-M12.md § 6) : régularisation de fin non calculée (semaines sans accueil manquantes).
// Règle (charte, T-019) : aucun montant sur une base incomplète. La régularisation entre dans l'assiette de l'indemnité
// de rupture (CCN art. 121.1) et dans la base du dixième (art. 48.1.1.5 et 124) : rupture et congés non pris non calculés (T-103).
// Sur main, la correction M13 (T-050d, C-1) couvre déjà le retrait avec la 2e année sans saisie (tests/t050d-neutralise).
// Ici : les autres causes et motifs (verts sur main, preuve), et ce qui manquait : la régularisation elle-même, donnée
// pour 0,00 € (résultat et écran Fin).
import { describe, expect, it } from 'vitest';
import type { Contract, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { finDeContrat, type Motif } from '../src/engine/fin';
import { ligneRegularisation } from '../src/screens/fin-lignes';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning { const p: Planning = {}; for (const d of days) p[d] = [{ start, end }]; return p; }
const lundis = (from: string, n: number) => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${from}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 7 * i); return d.toISOString().slice(0, 10);
});
// Contrat des tests t038 : 36 semaines, 40 h du lundi au vendredi, 5 € net de l'heure (600 € net par mois).
const SEMAINES_OFF = [...lundis('2025-10-20', 2), ...lundis('2025-12-22', 2), ...lundis('2026-02-16', 2), ...lundis('2026-04-13', 2), ...lundis('2026-07-06', 8), '2026-10-19'];
const contrat = (weeksOff: string[]): Contract => ({ id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2025-09-01', yearType: 'incomplete', weeks: 36, weeksOff,
  planning: week('08:00', '16:00'), rateNet: 500, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
  kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2025-09-01', alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
  balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0 } as Contract);
const fin = (weeksOff: string[], motif: Motif, notif = '2026-10-28', bruts?: any) => finDeContrat(makeCtx(contrat(weeksOff), [], [], '2026-11-18'), notif, motif, 0, undefined, bruts);
// Deux causes : une semaine passée non saisie (16/02/2026 retirée), ou la 2e année sans aucune semaine saisie (19/10/2026 retirée).
const PASSEE = SEMAINES_OFF.filter((w) => w !== '2026-02-16');
const AN2 = SEMAINES_OFF.filter((w) => w !== '2026-10-19');

describe('T-055 : régularisation non calculée, rien n’est calculé avec 0', () => {
  for (const [cause, off] of [['semaine passée non saisie', PASSEE], ['2e année sans semaine saisie', AN2]] as const) {
    for (const motif of ['retrait', 'deces', 'inaptitude', 'inaptitude_pro'] as Motif[]) {
      it(`${cause}, ${motif} : indemnité de rupture et congés non pris non calculés, la donnée est demandée (T-103)`, () => {
        const f = fin(off, motif);
        expect(f.alertes.some((a) => a.startsWith('Régularisation non calculée'))).toBe(true);
        expect(f.indemniteRupture).toBe(0);
        expect(f.ruptureAConfirmer).toBe(true);
        expect(f.alertes.some((a) => a.startsWith('Indemnité de rupture non calculée') && a.includes('la régularisation de fin de contrat, qui n’est pas calculée'))).toBe(true);
        expect(f.cpAConfirmer).toContain('n’est pas calculée');
        expect(f.cpIndemnite).toBe(0);
      });
    }
    it(`${cause}, démission : congés non pris non calculés, pas d’indemnité de rupture`, () => {
      const f = fin(off, 'demission');
      expect(f.cpAConfirmer).toContain('n’est pas calculée');
      expect(f.cpIndemnite).toBe(0);
      expect(f.indemniteRupture).toBe(0);
    });
    it(`${cause} : la régularisation est dite non calculée, jamais « 0,00 € » (résultat et écran Fin)`, () => {
      const f = fin(off, 'retrait');
      expect(f.regularisation).toBe(0); // non comptée dans le total
      expect(f.regularisationNonCalculee).toMatch(/^Régularisation non calculée : il manque \d+ semaines? sans accueil/);
      const l = ligneRegularisation(f, true);
      expect(l.valeur).toBe('non calculée');
      expect(l.hint).toMatch(/^Non calculée/);
      expect(l.hint).not.toMatch(/accueillies mais non payées/);
    });
  }
  // Direction T-072 (point 2) : la régularisation entre dans l'assiette du 1/80 (CCN art. 121.1 ; analyse T-050, point 2 ;
  // art. 124 : « régularisation définitive du salaire »). Non calculée, elle n'est pas connue : un total de bulletins
  // couvrant le dernier mois ne prouve pas qu'elle y est. L'indemnité reste « à confirmer ».
  for (const [cause, off] of [['semaine passée non saisie', PASSEE], ['2e année sans semaine saisie', AN2]] as const) {
    it(`${cause}, total des bulletins saisi jusqu’au dernier mois : indemnité de rupture non calculée`, () => {
      const f0 = fin(off, 'retrait');
      const f = fin(off, 'retrait', '2026-10-28', { total: 1000000, jusqua: f0.dernierJour.slice(0, 7) });
      expect(f.totalBrut).toBe(1000000);
      expect(f.ruptureAConfirmer).toBe(true);
      expect(f.alertes.some((a) => a.startsWith('Indemnité de rupture non calculée') && a.includes('qui n’est pas calculée'))).toBe(true);
      expect(f.regularisationNonCalculee).not.toContain('sauf si');
    });
    it(`${cause}, brut du dernier mois lu sur un bulletin : indemnité de rupture non calculée`, () => {
      const f0 = fin(off, 'retrait');
      const m = f0.dernierJour.slice(0, 7);
      const avant = `${m.slice(0, 5)}${String(Number(m.slice(5)) - 1).padStart(2, '0')}`;
      const f = fin(off, 'retrait', '2026-10-28', { total: 900000, jusqua: avant, parMois: { [m]: 150000 } });
      expect(f.totalBrut).toBe(1050000);
      expect(f.ruptureAConfirmer).toBe(true);
    });
    it(`${cause} : la base du dixième en cours n’est pas donnée (cpDixiemeEnCours absent)`, () => {
      expect(fin(off, 'retrait').cpDixiemeEnCours).toBeUndefined();
    });
  }
  it('témoin : toutes les semaines saisies, régularisation calculée et affichée en euros', () => {
    const f = fin(SEMAINES_OFF, 'retrait');
    expect(f.regularisationNonCalculee).toBeUndefined();
    expect(f.regularisation).toBe(62857);
    expect(f.cpDixiemeEnCours).toBeGreaterThan(0);
    expect(ligneRegularisation(f, true).valeur).toMatch(/^628,57\s€$/);
  });
});
