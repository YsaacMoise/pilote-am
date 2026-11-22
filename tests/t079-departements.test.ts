import { describe, expect, it } from 'vitest';
import { DEPARTEMENTS, libelleDepartement, lieuDuDepartement, reponseSaisie, trouverDepartement } from '../src/engine/departements';
import { nonGeresContrat, NON_GERE_ALSACE, NON_GERE_MAYOTTE } from '../src/engine/nonGeres';

const base = { planningVariable: false, accueilOccasionnel: false, cdd: false } as const;

describe('T-079 : département du lieu d’accueil', () => {
  it('liste complète : 101 départements, codes uniques', () => {
    expect(DEPARTEMENTS.length).toBe(101);
    expect(new Set(DEPARTEMENTS.map((d) => d.code)).size).toBe(101);
  });
  it('Alsace-Moselle déduite de 57, 67 et 68', () => {
    for (const c of ['57', '67', '68']) expect(lieuDuDepartement(c)).toEqual({ alsaceMoselle: true, mayotte: false });
  });
  it('Mayotte déduite de 976', () => expect(lieuDuDepartement('976')).toEqual({ alsaceMoselle: false, mayotte: true }));
  it('autres départements : ni l’un ni l’autre (dont 54, 88, 971, 974, 2A)', () => {
    for (const c of ['75', '54', '88', '971', '974', '2A']) expect(lieuDuDepartement(c)).toEqual({ alsaceMoselle: false, mayotte: false });
  });
  it('même effet qu’avant sur le calcul : contrat refusé seulement pour 57, 67, 68 et 976', () => {
    expect(nonGeresContrat({ ...base, ...lieuDuDepartement('67') })).toContain(NON_GERE_ALSACE);
    expect(nonGeresContrat({ ...base, ...lieuDuDepartement('976') })).toContain(NON_GERE_MAYOTTE);
    expect(nonGeresContrat({ ...base, ...lieuDuDepartement('75') })).toEqual([]);
  });
  it('saisie retrouvée par numéro, nom ou libellé de la liste', () => {
    expect(trouverDepartement('75')).toBe('75');
    expect(trouverDepartement('paris')).toBe('75');
    expect(trouverDepartement('2a')).toBe('2A');
    expect(trouverDepartement(libelleDepartement('976'))).toBe('976');
    expect(trouverDepartement('Côte-d’Or')).toBe('21');
    expect(trouverDepartement('1')).toBe('01');
    expect(trouverDepartement('Isere')).toBe('38');
    expect(trouverDepartement("cote-d'or")).toBe('21');
    expect(trouverDepartement('val d oise')).toBe('95');
    expect(trouverDepartement('Mos')).toBeUndefined();
    expect(trouverDepartement('100')).toBeUndefined();
    expect(trouverDepartement('')).toBeUndefined();
  });
  it('ancien contrat sans département : sa réponse d’avant reste lue', () => {
    expect(nonGeresContrat({ ...base, alsaceMoselle: true })).toContain(NON_GERE_ALSACE);
    expect(nonGeresContrat({ ...base, alsaceMoselle: false, mayotte: true })).toContain(NON_GERE_MAYOTTE);
  });
  it('saisie inconnue (vérificateur D1) : aucun département retenu, sauf la réponse d’un contrat d’avant', () => {
    const neuf = {};
    expect(reponseSaisie('Meuse', neuf)).toEqual({ departement: '55', alsaceMoselle: false, mayotte: false });
    expect(reponseSaisie('Mos', neuf)).toEqual({ departement: undefined, alsaceMoselle: undefined, mayotte: undefined });
    expect(reponseSaisie('', { departement: '57', alsaceMoselle: true, mayotte: false })).toEqual({ departement: undefined, alsaceMoselle: undefined, mayotte: undefined });
    expect(reponseSaisie('xx', { alsaceMoselle: true, mayotte: false })).toEqual({ departement: undefined, alsaceMoselle: true, mayotte: false });
  });
});
