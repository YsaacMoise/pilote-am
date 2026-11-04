// Lot 2 : régime fiscal spécial des assistants maternels (CGI art. 80 sexies). Montants calculés à la main.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Contract, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { fiscalYear } from '../src/engine/fiscal';

function week(start: string, end: string, days = [1, 2, 3, 4, 5]): Planning {
  const p: Planning = {};
  for (const d of days) p[d] = [{ start, end }];
  return p;
}

function contract(over: Partial<Contract> = {}): Contract {
  return {
    id: 'c1', child: 'Léa', family: 'Martin', color: 0, start: '2026-01-05', yearType: 'complete', weeks: 52, weeksOff: [],
    planning: week('08:00', '17:00'), rateNet: 350, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2026-01-05',
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0, ...over,
  };
}

describe('C-011 : SMIC en vigueur le jour de la garde (BOI-RSA-CHAMP-10-20-10 § 490)', () => {
  it('mois repris de l’historique : SMIC du mois, puis SMIC du jour pour les mois suivis', () => {
    // Avril et mai 2026 sur bulletin (20 et 17 jours, SMIC 12,02 €), juin suivi par l'app (22 jours de 9 h, SMIC 12,31 €).
    // 3 × 37 × 12,02 = 1 334,22 € ; 3 × 22 × 12,31 = 812,46 € ; total 2 146,68 €.
    const c = contract({
      start: '2026-04-01', trackedFrom: '2026-06-01',
      history: [
        { month: '2026-04', net: 68250, jours: 20, source: 'manuel' },
        { month: '2026-05', net: 68250, jours: 17, source: 'manuel' },
      ],
    });
    const f = fiscalYear(makeCtx(c, [], [], '2026-06-30'), 2026, 0, '2026-06');
    expect(f.jours).toBe(59);
    expect(f.abattementBrut).toBe(214668);
    expect(f.smics).toEqual([1202, 1231]);
  });
  it('l’écran « Comment l’app calcule » ne parle plus du SMIC du 1er janvier', () => {
    const regles = readFileSync(new URL('../src/screens/Regles.tsx', import.meta.url), 'utf8');
    expect(regles).not.toMatch(/SMIC du 1er janvier/);
    expect(regles).toMatch(/SMIC retenu est celui en vigueur le jour de la garde/);
  });
});
