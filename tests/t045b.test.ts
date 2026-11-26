// T-045b : constats P3-B1 et C3-1 de la relecture V5 (périmètre 3). Attendus tirés des textes, jamais du code :
// - CCN IDCC 3239, art. 64 : date de fin = fin du préavis s'il est fait ; « date prévue de fin du préavis » si l'employeur
//   impose l'inexécution ; « dernier jour travaillé » si l'inexécution est à l'initiative du salarié.
// - Art. 64.2, al. 1, et 66 : dispense imposée par l'employeur, indemnité compensatrice « jusqu'à la date prévue de fin du
//   contrat de travail ». Le mois où finit le contrat ne peut donc pas être calculé sans savoir qui a voulu l'inexécution.
// - Règle de la direction (T-045b) : jamais un total silencieux. Sans réponse enregistrée sur le préavis, le mois de fin est
//   refusé (« non géré ») ; avec une réponse qui ne concorde pas avec la date de fin saisie, il est refusé aussi.
import { describe, expect, it } from 'vitest';
import type { Contract, Planning, Rupture } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { computeMonth, declarationText } from '../src/engine/month';
import { finDeContrat } from '../src/engine/fin';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}
function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2025-09-01', yearType: 'complete', weeks: 52, weeksOff: [],
    planning: week('08:00', '16:00'), rateNet: 500, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2025-09-01',
    alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, ...over,
  };
}
const mois = (c: Contract, m: string) => computeMonth(makeCtx(c, [], [], '2027-03-31'), m);
// Démission notifiée et remise le 05/11/2026, plus d'un an d'accueil : préavis d'un mois, du 05/11 au 04/12 (art. 120).
const R = (over: Partial<Rupture> = {}): Rupture => ({ motif: 'demission', notif: '2026-11-05', preavis: 'execute', ...over });

describe('T-045b : le mois où finit le contrat connaît le préavis', () => {
  it('P3-B1 (sonde V5) : date de fin saisie sans réponse sur le préavis, le mois de fin est refusé, pas de total', () => {
    const c = contract({ end: '2026-11-13' });
    const r = mois(c, '2026-11');
    expect(r.nonGere.length).toBeGreaterThan(0);
    expect(r.nonGere.join(' ')).toMatch(/64\.2/);
    expect(declarationText(makeCtx(c, [], [], '2027-03-31'), r, 'AM')).not.toMatch(/Total à me verser/);
    // Le préavis dure au plus un mois (art. 120) : octobre (à partir du 13/10) peut aussi être un mois de préavis non fait.
    expect(mois(c, '2026-10').nonGere.length).toBeGreaterThan(0);
    expect(mois(c, '2026-09').nonGere).toEqual([]);
  });

  it('cas B enregistré (dispense voulue par les parents) : calculé depuis T-074, fin à la date prévue de fin du préavis', () => {
    // T-074 (regles/t074-preavis-dispense.md ; CCN art. 64 et 64.2) : les mois du préavis dispensé sont calculés.
    const c = contract({ end: '2026-12-04', rupture: R({ motif: 'retrait', preavis: 'employeur', dernierJourTravaille: '2026-11-13' }) });
    expect(mois(c, '2026-11').nonGere).toEqual([]);
    expect(mois(c, '2026-12').nonGere).toEqual([]);
    expect(mois(c, '2026-10').nonGere).toEqual([]);
    // Même réponse, date de fin saisie au dernier jour travaillé : refusé, le contrat finit à la date prévue de fin (art. 64).
    const c2 = contract({ end: '2026-11-13', rupture: R({ motif: 'retrait', preavis: 'employeur', dernierJourTravaille: '2026-11-13' }) });
    expect(mois(c2, '2026-11').nonGere.join(' ')).toMatch(/date prévue de fin du préavis/);
  });

  it('cas C enregistré (départ sans accord) : calculé depuis T-107, sans question depuis T-109 (fin au dernier jour travaillé)', () => {
    const c = contract({ end: '2026-11-13', rupture: R({ preavis: 'am_sans_accord', dernierJourTravaille: '2026-11-13' }) });
    expect(mois(c, '2026-11').nonGere).toEqual([]);
  });

  it('cas A enregistré (dispense demandée par l’AM, acceptée) : fin au dernier jour travaillé, le mois est calculé', () => {
    const c = contract({ end: '2026-11-13', rupture: R({ preavis: 'am_acceptee', dernierJourTravaille: '2026-11-13' }) });
    const r = mois(c, '2026-11');
    expect(r.nonGere).toEqual([]);
    expect(declarationText(makeCtx(c, [], [], '2027-03-31'), r, 'AM')).toMatch(/Total à me verser/);
  });

  it('préavis fait en entier, date de fin = fin du préavis : le mois est calculé', () => {
    const c = contract({ end: '2026-12-04', rupture: R() });
    expect(mois(c, '2026-12').nonGere).toEqual([]);
    expect(mois(c, '2026-11').nonGere).toEqual([]);
  });

  it('C3-1 : date de fin saisie après la fin du préavis, refusée dans le mois et dans la fin de contrat', () => {
    const c = contract({ end: '2027-01-31', rupture: R() });
    expect(mois(c, '2027-01').nonGere.join(' ')).toMatch(/04\/12\/2026/);
    const f = finDeContrat(makeCtx(contract({ end: '2027-01-31' }), [], [], '2027-03-31'), '2026-11-05', 'demission');
    expect(f.preavisFin).toBe('2026-12-04');
    expect(f.nonGere?.join(' ')).toMatch(/31\/01\/2027/);
    expect(f.totalBrut + f.cpIndemnite + f.regularisation + f.indemniteRupture).toBe(0);
  });

  it('date de fin saisie avant la fin du préavis alors que le préavis est déclaré fait : refusé', () => {
    const c = contract({ end: '2026-11-13', rupture: R() });
    expect(mois(c, '2026-11').nonGere.length).toBeGreaterThan(0);
  });
});
