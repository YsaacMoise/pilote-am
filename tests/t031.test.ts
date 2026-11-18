// T-031 et T-028 : refus clair des cas non gérés, congés à confirmer signalés dans le compteur fiscal.
// Les attendus viennent de la charte (« tout cas non validé est refusé clairement ») et du brief de la vague 7 :
// ce sont des choix de l'app (refus, signal), pas des montants tirés d'un texte. Aucun montant attendu n'est calculé ici.
import { describe, expect, it } from 'vitest';
import type { AmLeave, Contract, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { fiscalYear } from '../src/engine/fiscal';

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
    balances: { cpRestants: 30, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, ...over,
  };
}

// Contrat de Mme Bertrand (année incomplète, 36 semaines) : ses congés de juin 2022 sont à confirmer (SUS-11, T-019).
const BERTRAND_OFF = ['2021-10-25', '2021-11-01', '2021-12-20', '2021-12-27', '2022-02-21', '2022-02-28', '2022-04-25', '2022-05-02',
  '2022-07-04', '2022-07-11', '2022-07-18', '2022-07-25', '2022-08-01', '2022-08-08', '2022-08-15', '2022-08-22'];
const bertrand = (over: Partial<Contract> = {}) => contract({ start: '2021-09-01', trackedFrom: '2021-09-01', yearType: 'incomplete', weeks: 36,
  weeksOff: BERTRAND_OFF, majoration: 15, ...over });

describe('T-028 : congés payés à confirmer dans le compteur fiscal', () => {
  it('le mois où des congés sont à confirmer est signalé, comme l’événement familial', () => {
    const f = fiscalYear(makeCtx(bertrand(), [], [], '2022-12-31'), 2022);
    expect(f.nonGere).toMatch(/Congés payés à confirmer en juin 2022 : ils ne sont pas comptés/);
  });
  it('sans congés à confirmer, rien n’est signalé', () => {
    const f = fiscalYear(makeCtx(contract(), [], [], '2026-10-31'), 2026);
    expect(f.nonGere ?? '').not.toMatch(/Congés payés à confirmer/);
  });
});
