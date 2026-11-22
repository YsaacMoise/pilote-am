// T-050d (correcteur M13) : relecture T-050b/T-050c, points B-1, C-1 et C-3.
// Montants attendus calculés à la main à partir de la règle (CCN art. 121.1 : 1/80 des salaires bruts, ICCP et
// régularisation de fin comprises ; art. 124 et 48.1.1.5 : régularisation dans la base du dixième), pas lus dans le code.
import { describe, expect, it } from 'vitest';
import type { Contract, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { finDeContrat } from '../src/engine/fin';
import { euros } from '../src/engine/money';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}
const lundis = (from: string, n: number) => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7 * i);
  return d.toISOString().slice(0, 10);
});
// Contrat des tests t038 : 36 semaines, 40 h du lundi au vendredi, 5 € net de l'heure, soit 600 € net par mois.
const SEMAINES_OFF = [...lundis('2025-10-20', 2), ...lundis('2025-12-22', 2), ...lundis('2026-02-16', 2), ...lundis('2026-04-13', 2), ...lundis('2026-07-06', 8), '2026-10-19'];
function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2025-09-01', yearType: 'incomplete', weeks: 36, weeksOff: SEMAINES_OFF,
    planning: week('08:00', '16:00'), rateNet: 500, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2025-09-01',
    alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, ...over,
  };
}

// Calcul à la main. Contrat du 01/09/2025 au 31/07/2026 (retrait envoyé et remis le 17/07/2026, préavis de 15 jours).
// Salaire mensualisé : 40 h × 36 semaines ÷ 12 × 5 € = 600,00 € net, soit 768,25 € brut (600 ÷ 0,781, au centime).
// 11 mois de septembre à juillet : 11 × 768,25 = 8 450,75 €.
// Régularisation : 48 semaines du 01/09/2025 au 31/07/2026, dont 12 sans accueil (2+2+2+2 et 4 en juillet) : 36 semaines
// accueillies × 40 h × 5 € = 7 200 € dus ; 11 × 600 = 6 600 € payés ; 600,00 € net dus, soit 768,25 € brut.
// Congés non pris : 0 (congés de juin pris et payés). Assiette : 8 450,75 + 768,25 = 9 219,00 € ; 9 219,00 ÷ 80 = 115,24 €.
// Variante « fin le 01/08/2026 » : samedi, semaine sans accueil (8 semaines à partir du 06/07) : aucun salaire en plus,
// même régularisation : 115,24 € aussi.
const ASSIETTE = 921900;
const RUPTURE = 11524;

describe('T-050d, B-1 : la variante de date de fin ne compte jamais deux fois l’ICCP ni la régularisation', () => {
  const ctx = () => makeCtx(contract(), [], [], '2027-12-31');
  it('sans bulletins saisis : assiette et indemnité calculées à la main, fin calculée et fin du lendemain identiques', () => {
    const r = finDeContrat(ctx(), '2026-07-17', 'retrait');
    expect(r.dernierJour).toBe('2026-07-31');
    expect(r.regularisation).toBe(60000);
    expect(r.regularisationAConfirmer).toBeUndefined();
    // Jours de congés de l'année incomplète « à confirmer » (T-019) : ICCP non donnée, non ajoutée, rupture « à confirmer ».
    expect(r.cpAConfirmer).toBeDefined();
    expect(r.cpIndemnite).toBe(0);
    expect(r.ruptureAConfirmer).toBe(true);
    expect(r.totalBrut).toBe(ASSIETTE);
    expect(r.indemniteRupture).toBe(RUPTURE);
    // Fin le 01/08/2026 calculée directement : même assiette, même montant.
    const l = finDeContrat(ctx(), '2026-07-17', 'retrait', 0, '2026-07-18');
    expect(l.dernierJour).toBe('2026-08-01');
    expect(l.totalBrut).toBe(ASSIETTE);
    expect(l.indemniteRupture).toBe(RUPTURE);
  });
  // Relecture T-072 (B-1), décision de la direction du 22/11/2026 : si la fin passe au 01/08, l'ICCP et la régularisation
  // seraient sur le bulletin d'août, hors du total saisi jusqu'à juillet. La variante ne peut pas donner 115,24 € comme sûr.
  // Ici l'ICCP de cette variante est à confirmer : l'indemnité est « à confirmer » (avant : 115,24 € sûr pour les deux dates).
  it('total des bulletins saisi jusqu’à juillet : fin le 31/07, 115,24 € ; variante du 01/08 à confirmer (B-1, T-072)', () => {
    const r = finDeContrat(ctx(), '2026-07-17', 'retrait', 0, undefined, { total: ASSIETTE, jusqua: '2026-07' });
    expect(r.totalBrut).toBe(ASSIETTE);
    expect(r.indemniteRupture).toBe(RUPTURE);
    expect(r.ruptureAConfirmer).toBe(true);
    expect(r.ruptureVariantes).toContain('Fin le 31/07/2026 : 115,24');
    expect(r.ruptureVariantes).toContain('Fin le 01/08/2026 : à confirmer');
    expect(r.ruptureVariantes).not.toContain('124,84');
  });
  it('brut du bulletin de juillet lu (régularisation comprise) : rien n’est compté deux fois dans la variante', () => {
    // Bulletin de juillet lu : 768,25 € de salaire + 768,25 € de régularisation = 1 536,50 € ; assiette inchangée.
    const parMois: Record<string, number> = {};
    for (const m of ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']) parMois[m] = 76825;
    parMois['2026-07'] = 153650;
    const r = finDeContrat(ctx(), '2026-07-17', 'retrait', 0, undefined, { parMois });
    expect(r.totalBrut).toBe(ASSIETTE);
    expect(r.indemniteRupture).toBe(RUPTURE);
    // Relecture T-072 (B-1) : même raison que ci-dessus, la variante du 01/08 est à confirmer (avant : aucune variante).
    expect(r.ruptureAConfirmer).toBe(true);
    expect(r.ruptureVariantes).toContain('Fin le 01/08/2026 : à confirmer');
  });
});

describe('T-050d, C-3 : base du dixième incomplète, le message donne un minimum', () => {
  it('S50B-I46-F1-2P-DECES : « le dixième vaut au moins 202,30 € », jamais « vaut 202,30 € »', () => {
    // Situation du comparateur : mercredi 8 h-18 h, 4,20 € net, 46 semaines, du 01/11/2025 au 31/05/2027, décès le 31/05/2027.
    // Salaire mensualisé : 10 h × 46 ÷ 12 × 4,20 € = 161,00 € ; période 2026-2027 : 12 × 161,00 = 1 932,00 €.
    // Dixième sans l'indemnité de l'an dernier (à confirmer) : (1 932,00 + régularisation) ÷ 10, soit un minimum.
    const c = contract({
      start: '2025-11-01', trackedFrom: '2025-11-01', weeks: 46, planning: week('08:00', '18:00', [3]), rateNet: 420,
      entretienJour: 400, repasPrix: 300, repasParJour: 1, end: '2027-05-31',
      weeksOff: ['2025-11-17', '2026-03-02', '2026-06-01', '2026-06-08', '2026-07-20', '2026-08-03', '2026-11-09', '2027-06-07', '2027-06-14', '2027-07-05', '2027-07-12', '2027-08-02'],
    });
    const f = finDeContrat(makeCtx(c, [], [], '2027-12-31'), '2027-05-31', 'deces');
    expect(f.regularisation).toBe(9100);
    expect(f.cpDixiemeEnCours).toBe(Math.round((193200 + f.regularisation) / 10));
    expect(f.cpDixiemeEnCours).toBe(20230);
    expect(f.cpIndemnite).toBe(0);
    expect(f.cpAConfirmer).toContain('l’indemnité de l’an dernier, qui est elle-même à confirmer');
    expect(f.cpAConfirmer).toContain(`avec elle, le dixième vaut au moins ${euros(20230)}`);
    expect(f.cpAConfirmer).not.toContain(`le dixième vaut ${euros(20230)}`);
  });
});
