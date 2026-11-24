// T-078 (intégration), corrections D1, D2, D3 de la relecture du 22/11/2026 (rapports/integration-2026-11-22-relecture.md du
// dépôt calculateur-arvela). Attendus tirés des textes et des règles du projet, jamais du code :
// Revu par la T-103 : une seule date de fin (F1, F2), une seule méthode de l'indemnité de préavis (F5, CCN 122), 9 mois à
// la fin du contrat (F3), indemnité de préavis dans le 1/80 (F4).
// - D1 : CCN IDCC 3239, art. 64.2 et 66 : l'indemnité compensatrice de préavis court « jusqu'à la date prévue de fin ».
// - D2 : le texte de l'indemnité de rupture dit ce que le calcul compte vraiment (bulletins saisis jusqu'au dernier mois :
//   l'indemnité de congés non pris et la régularisation de la fin y sont, CCN art. 121.1, 123.1, 124).
// - D3 : pas d'indemnité de rupture en cas de démission (CCN art. 121.1 : retrait de l'enfant).
import { describe, expect, it } from 'vitest';
import type { Contract, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { finDeContrat, type Motif } from '../src/engine/fin';
import { euros } from '../src/engine/money';
import { ligneIndemnitePreavis } from '../src/screens/fin-lignes';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning { const p: Planning = {}; for (const d of days) p[d] = [{ start, end }]; return p; }
// 52 semaines, 45 h du lundi au vendredi, 7,45 € net : mensualisé 45 × 52 / 12 = 195 h, soit 1 452,75 € net (CCN art. 109.1).
function contrat52(start: string): Contract {
  return {
    id: 'c1', child: 'Léa', family: 'Martin', color: 0, start, yearType: 'complete', weeks: 52, weeksOff: [],
    planning: week('08:00', '17:00'), rateNet: 745, majoration: 10, entretienJour: 422, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: start,
    alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0,
  } as Contract;
}
const ctx = (c: Contract) => makeCtx(c, [], [], '2026-12-31');
const dispense = (d: string) => ({ demandeur: 'employeur' as const, dernierJourTravaille: d });

describe('T-078 D1, revu par la T-103 : indemnité de préavis des jours dispensés, une valeur', () => {
  it('P2b : retrait, lettre remise le 01/06/2026, dispense totale : 726,38 €, fin le 15/06', () => {
    const f = finDeContrat(ctx(contrat52('2025-09-01')), '2026-06-01', 'retrait', 0, undefined, dispense('2026-05-29'));
    expect(f.nonGere).toBeUndefined();
    expect(f.dernierJour).toBe('2026-06-15');
    expect(f.dispense).toMatchObject({ du: '2026-06-01', au: '2026-06-15', net: 72638 });
    const alerte = f.alertes.find((a) => a.includes('indemnité compensatrice de préavis'))!;
    expect(alerte).toContain(`égale au salaire de ces jours : ${euros(72638)} net`);
    expect(alerte).not.toMatch(/à confirmer|environ/);
    const l = ligneIndemnitePreavis(f.dispense!);
    expect(l.valeur).toBe(euros(72638));
  });
  it('P3 : démission entre 3 mois et 1 an, dispense totale : 15 jours (CCN 120), 726,38 €', () => {
    const f = finDeContrat(ctx(contrat52('2026-03-02')), '2026-10-01', 'demission', 0, undefined, dispense('2026-09-30'));
    expect(f.nonGere).toBeUndefined();
    expect(f.dispense).toMatchObject({ du: '2026-10-01', au: '2026-10-15', net: 72638 });
    expect(ligneIndemnitePreavis(f.dispense!).valeur).toBe(euros(72638));
  });
  it('jours dispensés en cours de mois : proportion de l’art. 111 (CCN 122)', () => {
    // Remise le samedi 06/06/2026, 15 jours : fin le samedi 20/06. Juin 2026 : 22 jours prévus, 198 h ; jours dispensés du 08
    // au 19/06, 10 jours, 90 h.
    const f = finDeContrat(ctx(contrat52('2025-09-01')), '2026-06-06', 'retrait', 0, undefined, dispense('2026-06-05'));
    expect(f.dispense!.net).toBe(Math.round((145275 * 90) / 198));
  });
  it('dispense dès le 1er du mois, préavis d’un mois : 1 452,75 €', () => {
    const f = finDeContrat(ctx(contrat52('2025-09-01')), '2026-10-01', 'retrait', 0, undefined, dispense('2026-09-30'));
    expect(f.dispense!.net).toBe(145275);
    expect(ligneIndemnitePreavis(f.dispense!).valeur).toBe(euros(145275));
  });
});

describe('T-078 D1 bis, revu par la T-103 : dispense déclarée, dernier jour travaillé = date de fin', () => {
  it('fin le 15/06, dernier jour travaillé le 15/06 : aucun jour dispensé, rien à ajouter', () => {
    const f = finDeContrat(ctx(contrat52('2025-09-01')), '2026-06-01', 'retrait', 0, undefined, dispense('2026-06-15'));
    expect(f.nonGere).toBeUndefined();
    expect(f.dernierJour).toBe('2026-06-15');
    expect(f.dispense).toBeUndefined();
    expect(f.alertes.join(' ')).not.toMatch(/à confirmer/);
  });
});

describe('T-078 D4, revu par la T-103 (F3) : 9 mois appréciés à la fin du contrat', () => {
  // 52 semaines, début 05/01/2026, retrait, lettre le 19/09/2026 (8 mois), 15 jours : fin le 03/10 (8 mois à la fin).
  it('fin le 03/10 : 8 mois, pas d’indemnité, sans réserve', () => {
    const f = finDeContrat(ctx(contrat52('2026-01-05')), '2026-09-19', 'retrait', 0, undefined, dispense('2026-09-25'));
    expect(f.dernierJour).toBe('2026-10-03');
    expect(f.indemniteRupture).toBe(0);
    expect(f.ruptureAConfirmer).toBeFalsy();
  });
  it('lettre le 20/09, fin le 04/10 : 9 mois à la fin, indemnité due, indemnité de préavis dans les bruts (F4)', () => {
    const f = finDeContrat(ctx(contrat52('2026-01-05')), '2026-09-20', 'retrait', 0, undefined, dispense('2026-09-25'));
    expect(f.dernierJour).toBe('2026-10-04');
    expect(f.ruptureAConfirmer).toBeFalsy();
    // Avant la T-103 : 209,26 € sans l'ICCP, alors « à confirmer » ; elle est maintenant sûre et entre dans l'assiette (A-45).
    expect(f.cpAConfirmer).toBeUndefined();
    expect(f.indemniteRupture).toBe(Math.round(f.totalBrut / 80));
    expect(f.indemniteRupture).toBeGreaterThan(20926);
  });
  it('témoin : lettre le 01/09 : pas d’indemnité, sûr', () => {
    const f = finDeContrat(ctx(contrat52('2026-01-05')), '2026-09-01', 'retrait', 0, undefined, dispense('2026-09-04'));
    expect(f.indemniteRupture).toBe(0);
    expect(f.ruptureAConfirmer).toBeFalsy();
  });
});

describe('T-078 D2, revu par la T-103 : bulletins saisis jusqu’au dernier mois', () => {
  it('le total saisi est l’assiette, rien n’est ajouté, indemnité comptée', () => {
    const f = finDeContrat(ctx(contrat52('2025-09-01')), '2026-10-01', 'retrait', 0, undefined, dispense('2026-09-30'), { total: 2500000, jusqua: '2026-10' });
    expect(f.totalBrut).toBe(2500000);
    expect(f.indemniteRupture).toBe(31250);
    expect(f.ruptureAConfirmer).toBeFalsy();
  });
});

describe('T-078 D3, revu par la T-103 : régularisation non calculée', () => {
  const lundis = (from: string, n: number) => Array.from({ length: n }, (_, i) => {
    const d = new Date(`${from}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 7 * i); return d.toISOString().slice(0, 10);
  });
  // Contrat des tests t072-t055 : 36 semaines, semaine du 16/02/2026 non saisie.
  const OFF = [...lundis('2025-10-20', 2), ...lundis('2025-12-22', 2), '2026-02-23', ...lundis('2026-04-13', 2), ...lundis('2026-07-06', 8), '2026-10-19'];
  const c36: Contract = { ...contrat52('2025-09-01'), yearType: 'incomplete', weeks: 36, weeksOff: OFF, planning: week('08:00', '16:00'), rateNet: 500, entretienJour: 0 } as Contract;
  const fin = (motif: Motif) => finDeContrat(makeCtx(c36, [], [], '2026-11-18'), '2026-10-28', motif, 0);
  it('démission : pas de phrase sur l’indemnité de rupture', () => {
    const f = fin('demission');
    expect(f.regularisationNonCalculee).toMatch(/^Régularisation non calculée/);
    expect(f.alertes.join(' ')).not.toMatch(/Indemnité de rupture non calculée/);
  });
  it('retrait (9 mois et plus) : l’indemnité de rupture est dite non calculée, avec la raison', () => {
    const f = fin('retrait');
    expect(f.ruptureAConfirmer).toBe(true);
    expect(f.indemniteRupture).toBe(0);
    expect(f.alertes.join(' ')).toMatch(/Indemnité de rupture non calculée : .*régularisation de fin de contrat, qui n’est pas calculée/);
  });
});
