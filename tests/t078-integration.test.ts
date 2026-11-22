// T-078 (intégration), corrections D1, D2, D3 de la relecture du 22/11/2026 (rapports/integration-2026-11-22-relecture.md du
// dépôt calculateur-arvela). Attendus tirés des textes et des règles du projet, jamais du code :
// - D1 : CCN IDCC 3239, art. 64.2 et 66 : l'indemnité compensatrice de préavis court « jusqu'à la date prévue de fin » ; cette
//   date est « à confirmer » (PREAVIS-DATE-FIN ; démission de 3 mois à 1 an : CASF L423-26 contre CCN art. 120). Règle T-038
//   (AC-1, AC-2) : un montant qui change d'une date de fin possible à l'autre n'est ni donné ni compté, il est « à confirmer »
//   avec ses valeurs (comme l'indemnité égale au préavis du décès, CCN art. 119.4.2).
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

describe('T-078 D1 : indemnité de préavis des jours dispensés, une valeur par date de fin possible', () => {
  it('P2b : retrait, lettre remise le 01/06/2026, dispense totale : 726,38 € (fin le 15/06) ou 792,41 € (fin le 16/06), à confirmer', () => {
    const f = finDeContrat(ctx(contrat52('2025-09-01')), '2026-06-01', 'retrait', 0, undefined, dispense('2026-05-29'));
    expect(f.nonGere).toBeUndefined();
    expect(f.dernierJour).toBe('2026-06-15');
    expect(f.dispense).toMatchObject({ du: '2026-06-01', au: '2026-06-15' });
    expect(f.dispense!.aConfirmer).toBeDefined();
    expect(f.dispense!.aConfirmer).toContain(euros(72638));
    expect(f.dispense!.aConfirmer).toContain(euros(79241));
    expect(f.dispense!.variantes?.map((v) => v.net)).toEqual([72638, 79241]);
    // Alerte : plus de montant donné comme dû.
    const alerte = f.alertes.find((a) => a.includes('indemnité compensatrice de préavis'))!;
    expect(alerte).toBeDefined();
    expect(alerte).not.toContain(`égale au salaire de ces jours : ${euros(72638)}`);
    expect(alerte).toMatch(/à confirmer/);
    // Écran Fin, ligne « Indemnité de préavis ».
    const l = ligneIndemnitePreavis(f.dispense!);
    expect(l.valeur).toBe('à confirmer');
    expect(l.hint).toContain(euros(79241));
  });

  it('P3 : démission entre 3 mois et 1 an, dispense totale : 726,38 € (15 jours) ou 1 452,75 € (un mois), à confirmer', () => {
    const f = finDeContrat(ctx(contrat52('2026-03-02')), '2026-10-01', 'demission', 0, undefined, dispense('2026-09-30'));
    expect(f.nonGere).toBeUndefined();
    expect(f.dispense).toMatchObject({ du: '2026-10-01', au: '2026-10-15' });
    expect(f.dispense!.aConfirmer).toBeDefined();
    expect(f.dispense!.aConfirmer).toContain(euros(72638));
    expect(f.dispense!.aConfirmer).toContain(euros(145275));
    expect(f.dispense!.aConfirmer).toMatch(/durée du préavis/);
    const alerte = f.alertes.find((a) => a.includes('indemnité compensatrice de préavis'))!;
    expect(alerte).not.toContain(`égale au salaire de ces jours : ${euros(72638)}`);
    expect(ligneIndemnitePreavis(f.dispense!).valeur).toBe('à confirmer');
  });

  it('une seule valeur possible (fin un samedi, lendemain dimanche) : montant inchangé, donné', () => {
    // Remise le samedi 06/06/2026, 15 jours : fin le samedi 20/06, ou le dimanche 21/06 ; aucun jour d'accueil entre les deux.
    // Juin 2026 : 22 jours prévus, 198 h ; jours dispensés du 08 au 19/06, 10 jours, 90 h (art. 122 et 111).
    const f = finDeContrat(ctx(contrat52('2025-09-01')), '2026-06-06', 'retrait', 0, undefined, dispense('2026-06-05'));
    expect(f.dispense!.aConfirmer).toBeUndefined();
    expect(f.dispense!.variantes).toBeUndefined();
    expect(f.dispense!.net).toBe(Math.round((145275 * 90) / 198));
  });

  it('dispense dès le 1er du mois, préavis d’un mois : 31/10 ou 01/11, à confirmer (le 01/11 ajoute un jour de novembre)', () => {
    const f = finDeContrat(ctx(contrat52('2025-09-01')), '2026-10-01', 'retrait', 0, undefined, dispense('2026-09-30'));
    // Le dimanche 01/11/2026 est un jour férié et un dimanche : aucun jour d'accueil, une seule valeur.
    expect(f.dispense!.net).toBe(145275);
    expect(f.dispense!.aConfirmer).toBeUndefined();
    expect(ligneIndemnitePreavis(f.dispense!).valeur).toBe(euros(145275));
  });
});

describe('T-078 D2 : bulletins saisis jusqu’au dernier mois, le texte suit le calcul', () => {
  it('P4 : l’encadré de la rupture ne dit plus « sans l’indemnité de congés non pris ni la régularisation »', () => {
    const f = finDeContrat(ctx(contrat52('2025-09-01')), '2026-10-01', 'retrait', 0, undefined, dispense('2026-09-30'), { total: 2500000, jusqua: '2026-10' });
    expect(f.totalBrut).toBe(2500000);
    expect(f.ruptureVariantes).toBeDefined();
    expect(f.ruptureVariantes).toMatch(/Avec elle/);
    // Partie « avec / sans l'indemnité de préavis » (T-074) : ni l'ICCP ni la régularisation ne sont dites absentes, elles
    // sont dans le total des bulletins ; année complète : pas de régularisation.
    const avecSans = f.ruptureVariantes!.slice(f.ruptureVariantes!.indexOf('Avec elle'));
    expect(avecSans).not.toMatch(/sans l’indemnité de congés non pris/);
    expect(avecSans).not.toMatch(/régularisation de la fin/);
  });
  it('témoin : sans bulletins, année complète : l’indemnité de congés à confirmer reste dite absente, sans parler de régularisation', () => {
    const f = finDeContrat(ctx(contrat52('2025-09-01')), '2026-10-01', 'retrait', 0, undefined, dispense('2026-09-30'));
    expect(f.cpAConfirmer).toBeDefined();
    const avecSans = f.ruptureVariantes!.slice(f.ruptureVariantes!.indexOf('Avec elle'));
    expect(avecSans).toMatch(/sans l’indemnité de congés non pris, encore à confirmer/);
    expect(avecSans).not.toMatch(/régularisation de la fin/);
  });
});

describe('T-078 D3 : régularisation non calculée, « l’indemnité de rupture aussi » seulement si elle existe', () => {
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
    expect(f.regularisationNonCalculee).not.toMatch(/indemnité de rupture/);
    expect(f.alertes.find((a) => a.startsWith('Régularisation non calculée'))).not.toMatch(/indemnité de rupture/);
  });
  it('retrait (9 mois et plus) : la phrase reste', () => {
    const f = fin('retrait');
    expect(f.ruptureAConfirmer).toBe(true);
    expect(f.regularisationNonCalculee).toContain('L’indemnité de rupture aussi, même si tes bulletins couvrent le dernier mois.');
    expect(f.alertes.find((a) => a.startsWith('Régularisation non calculée'))).toContain('L’indemnité de rupture aussi');
  });
});
