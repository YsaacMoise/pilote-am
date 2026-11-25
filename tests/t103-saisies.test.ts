// T-103 : saisies des données B (écrans) et refus d'un partage d'indemnités journalières non écrit (point N1 soumis au DG).
import { describe, expect, it } from 'vitest';
import type { AmLeave, Contract, Planning } from '../src/engine/model';
import { makeCtx, MESSAGE_IJ_SALAIRES_AUTRES } from '../src/engine/payroll';
import { computeMonth } from '../src/engine/month';
import { normaliserAbsence } from '../src/engine/absences';
import { planningAvecDimanche } from '../src/engine/nonGeres';
import { demandeIJ, verifierSaisieT103 } from '../src/screens/Today';

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
    balances: { cpRestants: 30, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0,
    alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false, ...over,
  };
}
const deuil = (ij?: number): AmLeave => ({ ...normaliserAbsence({ id: 'e', type: 'evenement', from: '2026-10-05', to: '2026-10-06', nature: 'deuil' }), ...(ij === undefined ? {} : { ijSecu: ij }) });

describe('T-103 (K1, C3) : réponses obligatoires de la fiche de la journée', () => {
  const base = { abs: 'none', km: 0, kmPartage: false, kmEnfants: 0, certifDu: '', certifAu: '' };
  it('trajet partagé sans le nombre d’enfants : refusé', () => {
    expect(verifierSaisieT103({ ...base, km: 12, kmPartage: true, kmEnfants: 1 })).toMatch(/^Kilomètres/);
    expect(verifierSaisieT103({ ...base, km: 12, kmPartage: true, kmEnfants: 2 })).toBe('');
    expect(verifierSaisieT103({ ...base, km: 12, kmPartage: false })).toBe('');
  });
  it('certificat : deux dates ou aucune, dans l’ordre', () => {
    expect(verifierSaisieT103({ ...base, abs: 'malade_certif' })).toBe('');
    expect(verifierSaisieT103({ ...base, abs: 'malade_certif', certifDu: '2026-10-05' })).toMatch(/^Certificat/);
    expect(verifierSaisieT103({ ...base, abs: 'malade_certif', certifDu: '2026-10-09', certifAu: '2026-10-05' })).toMatch(/après le premier/);
    expect(verifierSaisieT103({ ...base, abs: 'malade_certif', certifDu: '2026-10-05', certifAu: '2026-10-19' })).toBe('');
  });
});

describe('T-103 (C9, R3) : montant des indemnités journalières demandé à la saisie', () => {
  const metro = contract();
  const local = contract({ id: 'c2', alsaceMoselle: true });
  it('congé de deuil : toujours ; autre événement : jamais', () => {
    expect(demandeIJ('evenement', 'deuil', '2026-10-05', '2026-10-06', [metro])).toBe('deuil');
    expect(demandeIJ('evenement', 'mariage', '2026-10-05', '2026-10-06', [metro])).toBeUndefined();
  });
  it('maladie : seulement si un contrat en Alsace-Moselle couvre les dates', () => {
    expect(demandeIJ('am_malade', undefined, '2026-10-05', '2026-10-06', [metro])).toBeUndefined();
    expect(demandeIJ('am_enfant_malade', undefined, '2026-10-05', '2026-10-06', [metro, local])).toBe('local');
    expect(demandeIJ('am_malade', undefined, '2026-10-05', '2026-10-06', [{ ...local, end: '2026-09-30' }])).toBeUndefined();
  });
});

describe('T-103 (N1) : indemnités journalières partagées entre les employeurs (CSS R323-4 ; CCN 48.1.3.1.3)', () => {
  it('contrat seul (sans calcul de part) : indemnités déduites en entier', () => {
    const r = computeMonth(makeCtx(contract(), [], [deuil(5000)], '2026-12-31'), '2026-10');
    expect(r.ijDeduites).toBe(5000);
    expect(r.nonGere).toEqual([]);
  });
  it('part du contrat 25 % (son salaire des 3 mois sur le total) : 12,50 € déduits sur 50,00 €', () => {
    const ctx = makeCtx(contract(), [], [deuil(5000)], '2026-12-31');
    ctx.partIJ = () => 0.25;
    const r = computeMonth(ctx, '2026-10');
    expect(r.ijDeduites).toBe(1250);
    expect(r.nonGere).toEqual([]);
  });
  it('salaires hors de l’app non saisis : le mois attend la donnée', () => {
    const ctx = makeCtx(contract(), [], [deuil(5000)], '2026-12-31');
    ctx.partIJ = () => undefined;
    const r = computeMonth(ctx, '2026-10');
    expect(r.nonGere).toContain(MESSAGE_IJ_SALAIRES_AUTRES);
    expect(r.ijDeduites ?? 0).toBe(0);
  });
  it('Alsace-Moselle : même partage', () => {
    const am: AmLeave = { id: 'm', type: 'am_malade', from: '2026-10-05', to: '2026-10-06', ijSecu: 3000 };
    const ctx = makeCtx(contract({ alsaceMoselle: true }), [], [am], '2026-12-31');
    ctx.partIJ = () => 0.5;
    expect(computeMonth(ctx, '2026-10').ijDeduites).toBe(1500);
  });
});

describe('T-103 (C8) : dimanche au planning, jour de repos demandé', () => {
  it('planning fixe, avenant ou horaires variables', () => {
    expect(planningAvecDimanche(contract())).toBe(false);
    expect(planningAvecDimanche(contract({ planning: week('08:00', '16:00', [1, 2, 3, 7]) }))).toBe(true);
    expect(planningAvecDimanche(contract({ planningVariable: true, cycle: [week('08:00', '16:00'), week('08:00', '12:00', [7])] }))).toBe(true);
  });
});
