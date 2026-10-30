import { describe, expect, it } from 'vitest';
import { applyRemote, docId, mergeSettings, needsChoice, nextSince, planMerge, stable, type LocalRecord, type RemoteDoc } from '../src/sync/plan';

const rd = (s: RemoteDoc['s'], k: string, v: unknown, t = 1): RemoteDoc => ({ s, k, v: v === null ? null : JSON.stringify(v), t });
const lr = (s: LocalRecord['s'], k: string, value: unknown): LocalRecord => ({ s, k, value });

describe('identifiants de documents', () => {
  it('encode les caractères interdits par Firestore', () => {
    expect(docId('days', 'abc|2026-10-30')).toBe('days~abc%7C2026-10-30');
    expect(docId('kv', 'a/b')).not.toContain('/');
    expect(docId('kv', '..')).not.toContain('.');
  });
  it('deux magasins avec la même clé donnent deux documents', () => {
    expect(docId('contracts', 'x')).not.toBe(docId('journal', 'x'));
  });
});

describe('comparaison stable', () => {
  it('ignore l’ordre des clés', () => {
    expect(stable({ a: 1, b: { c: 2, d: 3 } })).toBe(stable({ b: { d: 3, c: 2 }, a: 1 }));
  });
});

describe('première réunion des données', () => {
  it('compte vide : tout le téléphone part en ligne', () => {
    const p = planMerge([lr('contracts', 'c1', { id: 'c1' }), lr('days', 'c1|2026-10-01', { key: 'c1|2026-10-01' })], []);
    expect(p.toRemote).toHaveLength(2);
    expect(p.toLocal).toHaveLength(0);
  });

  it('téléphone vide : tout le compte arrive', () => {
    const p = planMerge([], [rd('contracts', 'c1', { id: 'c1' }), rd('journal', 'j1', { id: 'j1' })]);
    expect(p.toLocal.map((r) => r.k).sort()).toEqual(['c1', 'j1']);
    expect(p.toRemote).toHaveLength(0);
  });

  it('les suppressions en ligne ne reviennent pas sur un téléphone vide', () => {
    const p = planMerge([], [rd('contracts', 'c1', null)]);
    expect(p.toLocal).toHaveLength(0);
  });

  it('conflit : la version en ligne gagne sur un nouvel appareil', () => {
    const p = planMerge([lr('contracts', 'c1', { id: 'c1', child: 'Lou' })], [rd('contracts', 'c1', { id: 'c1', child: 'Léo' })]);
    expect(p.conflicts).toBe(1);
    expect(p.toLocal[0].value).toEqual({ id: 'c1', child: 'Léo' });
    expect(p.toRemote).toHaveLength(0);
  });

  it('conflit : le téléphone gagne seulement pour ce qu’il a changé hors connexion', () => {
    const local = [lr('contracts', 'c1', { id: 'c1', child: 'Lou' }), lr('contracts', 'c2', { id: 'c2', child: 'Ana' })];
    const remote = [rd('contracts', 'c1', { id: 'c1', child: 'Léo' }), rd('contracts', 'c2', { id: 'c2', child: 'Anna' })];
    const p = planMerge(local, remote, { localWins: new Set([docId('contracts', 'c1')]) });
    expect(p.toRemote.map((r) => r.value)).toEqual([{ id: 'c1', child: 'Lou' }]);
    expect(p.toLocal.map((r) => r.value)).toEqual([{ id: 'c2', child: 'Anna' }]);
  });

  it('suppression en ligne : effacée du téléphone, sauf changement local plus récent', () => {
    expect(planMerge([lr('journal', 'j1', { id: 'j1' })], [rd('journal', 'j1', null)]).deleteLocal).toEqual([{ s: 'journal', k: 'j1' }]);
    expect(planMerge([lr('journal', 'j1', { id: 'j1' })], [rd('journal', 'j1', null)], { localWins: new Set([docId('journal', 'j1')]) }).toRemote).toHaveLength(1);
  });

  it('« garder le compte » : le téléphone prend exactement le contenu du compte', () => {
    const p = planMerge([lr('contracts', 'c1', { id: 'c1' }), lr('contracts', 'c9', { id: 'c9' })], [rd('contracts', 'c1', { id: 'c1', x: 1 }), rd('contracts', 'c2', { id: 'c2' })], { mode: 'account' });
    expect(p.deleteLocal).toEqual([{ s: 'contracts', k: 'c9' }]);
    expect(p.toLocal.map((r) => r.k).sort()).toEqual(['c1', 'c2']);
    expect(p.toRemote).toHaveLength(0);
  });

  it('« garder ce téléphone » : le compte prend exactement le contenu du téléphone', () => {
    const p = planMerge([lr('contracts', 'c1', { id: 'c1' })], [rd('contracts', 'c1', { id: 'c1', x: 1 }), rd('contracts', 'c2', { id: 'c2' })], { mode: 'phone' });
    expect(p.deleteRemote).toEqual([{ s: 'contracts', k: 'c2' }]);
    expect(p.toRemote.map((r) => r.k)).toEqual(['c1']);
    expect(p.toLocal).toHaveLength(0);
  });

  it('enfants des deux côtés : on demande avant de réunir', () => {
    expect(needsChoice([lr('contracts', 'a', {})], [rd('contracts', 'b', {})])).toBe(true);
    expect(needsChoice([lr('contracts', 'a', {})], [rd('contracts', 'a', {})])).toBe(false);
    expect(needsChoice([], [rd('contracts', 'b', {})])).toBe(false);
    expect(needsChoice([lr('contracts', 'a', {})], [rd('contracts', 'b', null)])).toBe(false);
  });

  it('identique des deux côtés : rien à faire', () => {
    const p = planMerge([lr('contracts', 'c1', { b: 1, a: 2 })], [rd('contracts', 'c1', { a: 2, b: 1 })]);
    expect(p).toEqual({ toLocal: [], deleteLocal: [], toRemote: [], deleteRemote: [], conflicts: 0 });
  });

  it('réglages : le prénom vient du compte, les repères de l’appareil restent les siens', () => {
    const local = lr('kv', 'settings', { k: 'settings', v: { amName: '', lastAutoCopy: 5, persisted: true } });
    const remote = rd('kv', 'settings', { k: 'settings', v: { amName: 'Sonia', onboarded: true, lastAutoCopy: 99, lastBackup: 7 } });
    const p = planMerge([local], [remote]);
    const v = (p.toLocal[0].value as { v: Record<string, unknown> }).v;
    expect(v).toEqual({ amName: 'Sonia', onboarded: true, lastAutoCopy: 5, persisted: true });
    expect(p.conflicts).toBe(0);
  });
});

describe('réglages', () => {
  it('l’accueil fait sur un appareil vaut pour tous', () => {
    expect(mergeSettings({ onboarded: true }, { amName: 'A' }).onboarded).toBe(true);
  });
});

describe('changements reçus en direct', () => {
  it('ajout, modification, suppression, écho identique', () => {
    expect(applyRemote(undefined, rd('journal', 'j1', { id: 'j1' }))).toEqual({ op: 'put', value: { id: 'j1' } });
    expect(applyRemote({ id: 'j1', x: 1 }, rd('journal', 'j1', { id: 'j1', x: 2 }))).toEqual({ op: 'put', value: { id: 'j1', x: 2 } });
    expect(applyRemote({ id: 'j1' }, rd('journal', 'j1', null))).toEqual({ op: 'del' });
    expect(applyRemote(undefined, rd('journal', 'j1', null))).toEqual({ op: 'none' });
    expect(applyRemote({ id: 'j1' }, rd('journal', 'j1', { id: 'j1' }))).toEqual({ op: 'none' });
  });

  it('reprise : l’heure du dernier changement reçu avance', () => {
    expect(nextSince(10, [rd('journal', 'a', {}, 5), rd('journal', 'b', {}, 42)])).toBe(42);
    expect(nextSince(50, [])).toBe(50);
  });
});
