// T-121 : données de santé gardées sur le téléphone (consignes/t118-t121.md, partie T-121).
import { describe, expect, it } from 'vitest';
import type { Contract, Journal, Planning } from '../src/engine/model';
import { makeCtx } from '../src/engine/payroll';
import { buildSnapshot } from '../src/partage/snapshot';
import { applyRemote, docId, forRemote, planMerge, planRetraitSante, recuAvecSante, stable, trierEnvoi, type LocalRecord, type RemoteDoc } from '../src/sync/plan';
import { avecSanteLocale, contratSansSante, estNoteSante, resteSurTelephone } from '../src/sync/sante';
import { fiscalYear } from '../src/engine/fiscal';

const rd = (s: RemoteDoc['s'], k: string, v: unknown, t = 1): RemoteDoc => ({ s, k, v: v === null ? null : JSON.stringify(v), t });
const lr = (s: LocalRecord['s'], k: string, value: unknown): LocalRecord => ({ s, k, value });

const soin: Journal = { id: 'j1', cid: 'c1', date: '2026-11-04', time: '10:00', kind: 'soin', detail: 'Température 38,4 °C (fièvre)', temp: 38.4 };
const medoc: Journal = { id: 'j2', cid: 'c1', date: '2026-11-04', time: '10:30', kind: 'soin', detail: 'Médicament donné (ordonnance)' };
const selles: Journal = { id: 'j3', cid: 'c1', date: '2026-11-04', time: '11:00', kind: 'change', detail: 'Selles liquides' };
const repas: Journal = { id: 'j4', cid: 'c1', date: '2026-11-04', time: '12:00', kind: 'repas', detail: 'A tout mangé' };
const change: Journal = { id: 'j5', cid: 'c1', date: '2026-11-04', time: '12:30', kind: 'change', detail: 'Selles' };

function week(start: string, end: string): Planning {
  const p: Planning = {};
  for (const d of [1, 2, 3, 4, 5]) p[d] = [{ start, end }];
  return p;
}
const contrat: Contract = {
  id: 'c1', child: 'Léo', family: 'Martin', color: 2, start: '2026-09-01', yearType: 'complete', weeks: 52, weeksOff: [],
  planning: week('08:15', '17:30'), rateNet: 400, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
  kmTaux: 0, cpMode: 'juin', majoreFiscal: true, trackedFrom: '2026-09-01',
  balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0,
  alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
};

describe('T-121 : ce qui est de santé', () => {
  it('soins, températures et selles liquides ; pas le reste du carnet', () => {
    expect([soin, medoc, selles].every(estNoteSante)).toBe(true);
    expect([repas, change].some(estNoteSante)).toBe(false);
    expect(estNoteSante({ ...repas, temp: 37.5 })).toBe(true);
    expect(resteSurTelephone('journal', soin)).toBe(true);
    expect(resteSurTelephone('journal', repas)).toBe(false);
    expect(resteSurTelephone('contracts', soin)).toBe(false);
  });
});

describe('T-121 : forme en ligne', () => {
  it('le contrat part sans la case « handicap ou maladie », le reste est intact', () => {
    const v = forRemote('contracts', 'c1', contrat) as Record<string, unknown>;
    expect('majoreFiscal' in v).toBe(false);
    expect(v.child).toBe('Léo');
    expect(stable(v)).not.toContain('majoreFiscal');
    expect(contratSansSante({ id: 'c2' })).toEqual({ id: 'c2' });
  });
  it('les champs de santé du téléphone sont remis sur une version reçue', () => {
    const recu = { ...contratSansSante(contrat), rateNet: 450 };
    expect(avecSanteLocale('contracts', recu, contrat)).toEqual({ ...contrat, rateNet: 450 });
    // Sans copie sur le téléphone : la valeur de l'ancienne version en ligne arrive sur le téléphone.
    expect((avecSanteLocale('contracts', recu, undefined, contrat) as Contract).majoreFiscal).toBe(true);
    expect(avecSanteLocale('days', { key: 'x' }, { key: 'x', majoreFiscal: true })).toEqual({ key: 'x' });
  });
});

describe('T-121 : réunion du téléphone et du compte', () => {
  it('une note de santé du téléphone ne part pas ; les autres notes partent', () => {
    const p = planMerge([lr('journal', 'j1', soin), lr('journal', 'j4', repas)], []);
    expect(p.toRemote.map((r) => r.k)).toEqual(['j4']);
  });
  it('« garder le compte » n’efface pas du téléphone une note de santé absente du compte', () => {
    const p = planMerge([lr('journal', 'j1', soin)], [], { mode: 'account' });
    expect(p.deleteLocal).toEqual([]);
  });
  it('une pierre tombale ou une autre version en ligne ne remplace pas la note de santé du téléphone', () => {
    const p = planMerge([lr('journal', 'j1', soin)], [rd('journal', 'j1', null)]);
    expect(p.deleteLocal).toEqual([]);
    const p2 = planMerge([lr('journal', 'j1', soin)], [rd('journal', 'j1', { ...soin, detail: 'autre' })]);
    expect(p2.toLocal).toEqual([]);
    expect(p2.toRemote).toEqual([]);
    expect(applyRemote(soin, rd('journal', 'j1', null))).toEqual({ op: 'none' });
    expect(applyRemote(soin, rd('journal', 'j1', { ...soin, detail: 'autre' }))).toEqual({ op: 'none' });
  });
  it('une ancienne note de santé seulement en ligne arrive sur le téléphone, sans être retirée tout de suite', () => {
    const p = planMerge([], [rd('journal', 'j1', soin)]);
    expect(p.toLocal).toEqual([lr('journal', 'j1', soin)]);
    expect(p.toRemote).toEqual([]);
  });
  it('contrat en ligne sans la case : pas de conflit, le téléphone garde sa case', () => {
    const p = planMerge([lr('contracts', 'c1', contrat)], [rd('contracts', 'c1', contratSansSante(contrat))]);
    expect(p.conflicts).toBe(0);
    expect(p.toLocal).toEqual([]);
    expect(p.toRemote).toEqual([]);
  });
  it('contrat changé sur un autre appareil : la version du compte gagne, la case du téléphone reste', () => {
    const p = planMerge([lr('contracts', 'c1', contrat)], [rd('contracts', 'c1', { ...contratSansSante(contrat), rateNet: 450 })]);
    expect(p.toLocal).toEqual([lr('contracts', 'c1', { ...contrat, rateNet: 450 })]);
    const a = applyRemote(contrat, rd('contracts', 'c1', { ...contratSansSante(contrat), rateNet: 450 }));
    expect(a).toEqual({ op: 'put', value: { ...contrat, rateNet: 450 } });
    expect(applyRemote(contrat, rd('contracts', 'c1', contratSansSante(contrat)))).toEqual({ op: 'none' });
  });
  it('ancien contrat en ligne avec la case, absent du téléphone : la case arrive sur le téléphone', () => {
    const p = planMerge([], [rd('contracts', 'c1', contrat)]);
    expect(p.toLocal).toEqual([lr('contracts', 'c1', contrat)]);
    expect(p.toRemote).toEqual([]);
  });
});

describe('T-121 : retrait des données déjà en ligne (point 3)', () => {
  const local = (rs: LocalRecord[]) => new Map(rs.map((r) => [docId(r.s, r.k), r.value]));

  it('copie identique sur le téléphone : retirée ; copie absente ou différente : gardée et notée', () => {
    const p = planRetraitSante(
      [rd('journal', 'j1', soin), rd('journal', 'j2', medoc), rd('journal', 'j3', selles), rd('journal', 'j4', repas)],
      local([lr('journal', 'j1', soin), lr('journal', 'j3', { ...selles, time: '11:05' }), lr('journal', 'j4', repas)]),
    );
    expect(p.retirer).toEqual([{ s: 'journal', k: 'j1' }]);
    expect(p.gardes).toEqual([{ s: 'journal', k: 'j2', raison: 'manque' }, { s: 'journal', k: 'j3', raison: 'differe' }]);
    expect(p.corriger).toEqual([]);
  });
  it('contrat : réécrit sans la case seulement si le téléphone en a une copie identique ; sinon gardé', () => {
    const p = planRetraitSante([rd('contracts', 'c1', contrat)], local([lr('contracts', 'c1', contrat)]));
    expect(p.corriger).toEqual([lr('contracts', 'c1', contratSansSante(contrat))]);
    // Version en ligne différente (peut-être plus récente, d'un autre appareil) : on ne l'écrase pas (relecture m3).
    const p1 = planRetraitSante([rd('contracts', 'c1', { ...contrat, rateNet: 999 })], local([lr('contracts', 'c1', contrat)]));
    expect(p1.corriger).toEqual([]);
    expect(p1.gardes).toEqual([{ s: 'contracts', k: 'c1', raison: 'differe' }]);
    const p2 = planRetraitSante([rd('contracts', 'c1', contrat)], local([lr('contracts', 'c1', { ...contrat, majoreFiscal: false })]));
    expect(p2.gardes).toEqual([{ s: 'contracts', k: 'c1', raison: 'differe' }]);
    const p3 = planRetraitSante([rd('contracts', 'c1', contrat)], local([]));
    expect(p3.gardes).toEqual([{ s: 'contracts', k: 'c1', raison: 'manque' }]);
  });
  it('rien à retirer : pierres tombales, autres magasins, contrats déjà sans la case', () => {
    const p = planRetraitSante(
      [rd('journal', 'j1', null), rd('days', 'c1|2026-11-03', { key: 'c1|2026-11-03', abs: 'malade' }), rd('contracts', 'c1', contratSansSante(contrat))],
      local([lr('contracts', 'c1', contrat)]),
    );
    expect(p).toEqual({ retirer: [], corriger: [], gardes: [] });
  });
});

describe('T-121 : lien des parents', () => {
  it('le carnet du lien ne contient plus les notes de santé', () => {
    const snap = buildSnapshot({ ctx: makeCtx(contrat, [], [], '2026-11-04'), journal: [soin, medoc, selles, repas, change], amName: 'Sonia', enfants: 0, now: 1 });
    expect(snap.carnet.map((e) => e.detail)).toEqual(['A tout mangé', 'Selles']);
    expect(JSON.stringify(snap)).not.toMatch(/Température|Médicament|liquides/);
  });
});

describe('T-121 : la paie et l’abattement ne changent pas sur le téléphone', () => {
  it('contrat reçu d’un autre appareil puis rangé : même abattement qu’avant, case majorée gardée', () => {
    const a = applyRemote(contrat, rd('contracts', 'c1', { ...contratSansSante(contrat), color: 3 }));
    expect(a.op).toBe('put');
    const range = (a as { value: Contract }).value;
    const avant = fiscalYear(makeCtx(contrat, [], [], '2026-12-31'), 2026);
    const apres = fiscalYear(makeCtx(range, [], [], '2026-12-31'), 2026);
    expect(apres).toEqual(avant);
    // Témoin : sans la case, l'abattement change (le test voit bien la différence).
    expect(fiscalYear(makeCtx({ ...contrat, majoreFiscal: false }, [], [], '2026-12-31'), 2026)).not.toEqual(avant);
  });
});

describe('T-121 : seul chemin d’envoi (relecture m5)', () => {
  it('une note de santé n’est jamais écrite : elle est retirée ; le reste est écrit tel quel', () => {
    const docs = [
      { s: 'journal' as const, k: 'j1', v: stable(soin) },
      { s: 'journal' as const, k: 'j3', v: stable(selles) },
      { s: 'journal' as const, k: 'j4', v: stable(repas) },
      { s: 'journal' as const, k: 'j9', v: null },
      { s: 'contracts' as const, k: 'c1', v: stable(forRemote('contracts', 'c1', contrat)) },
    ];
    const t = trierEnvoi(docs);
    expect(t.retirer).toEqual([{ s: 'journal', k: 'j1' }, { s: 'journal', k: 'j3' }]);
    expect(t.ecrire.map((d) => d.k)).toEqual(['j4', 'j9', 'c1']);
    expect(t.ecrire.map((d) => d.v ?? '').join('')).not.toMatch(/majoreFiscal|Température|liquides/);
  });
  it('un lot reçu avec une donnée de santé (appareil resté sur une ancienne version) est repéré (relecture M1)', () => {
    expect(recuAvecSante([rd('journal', 'j1', soin)])).toBe(true);
    expect(recuAvecSante([rd('contracts', 'c1', contrat)])).toBe(true);
    expect(recuAvecSante([rd('contracts', 'c1', contratSansSante(contrat)), rd('journal', 'j4', repas), rd('journal', 'j1', null)])).toBe(false);
  });
});
