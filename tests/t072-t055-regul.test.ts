// T-072 / T-055 (M12, rapports/T-050b-M12.md § 6) : régularisation de fin non calculée (semaines sans accueil manquantes).
// Règle (charte, T-019) : aucun montant sur une base incomplète. La régularisation entre dans l'assiette de l'indemnité
// de rupture (CCN art. 121.1) et dans la base du dixième (art. 48.1.1.5 et 124) : rupture et congés non pris « à confirmer ».
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
      it(`${cause}, ${motif} : indemnité de rupture et congés non pris à confirmer (déjà juste sur main)`, () => {
        const f = fin(off, motif);
        expect(f.alertes.some((a) => a.startsWith('Régularisation non calculée'))).toBe(true);
        expect(f.indemniteRupture).toBeGreaterThan(0);
        expect(f.ruptureAConfirmer).toBe(true);
        expect(f.alertes.some((a) => a.startsWith('Indemnité de rupture à confirmer') && a.includes('la régularisation de fin de contrat, qui n’est pas calculée'))).toBe(true);
        expect(f.cpAConfirmer).toContain('n’est pas calculée');
        expect(f.cpIndemnite).toBe(0);
      });
    }
    it(`${cause}, démission : congés non pris à confirmer, pas d’indemnité de rupture (déjà juste sur main)`, () => {
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
      expect(l.valeur).toBe('à confirmer');
      expect(l.hint).toMatch(/^Non calculée/);
      expect(l.hint).not.toMatch(/accueillies mais non payées/);
    });
  }
  it('témoin : toutes les semaines saisies, régularisation calculée et affichée en euros', () => {
    const f = fin(SEMAINES_OFF, 'retrait');
    expect(f.regularisationNonCalculee).toBeUndefined();
    expect(f.regularisation).toBe(62857);
    expect(ligneRegularisation(f, true).valeur).toMatch(/^628,57\s€$/);
  });
});
