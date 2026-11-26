import { describe, expect, it } from 'vitest';
import { bornesCadran, ficheDepart, indexMaintenant, journeeFiche } from '../src/screens/Today';
import type { DayRec } from '../src/engine/model';

// T-126 (Vision 1.1) : carte « Maintenant », bornes du cadran, raccourci « Absente » (consigne 9.4).
describe('carte « Maintenant » : prochaine action la plus proche de maintenant', () => {
  const h = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3));
  it('choisit l’heure prévue la plus proche, avant ou après', () => {
    expect(indexMaintenant([h('08:30'), h('17:30'), h('07:30')], h('10:00'))).toBe(0);
    expect(indexMaintenant([h('08:30'), h('11:00'), h('07:30')], h('10:00'))).toBe(1);
  });
  it('à égalité, l’ordre des contrats', () => {
    expect(indexMaintenant([h('09:00'), h('11:00')], h('10:00'))).toBe(0);
  });
  it('un enfant sans action prévue n’est jamais choisi ; aucun : -1', () => {
    expect(indexMaintenant([null, h('18:00')], h('10:00'))).toBe(1);
    expect(indexMaintenant([null, null], h('10:00'))).toBe(-1);
    expect(indexMaintenant([], h('10:00'))).toBe(-1);
  });
});

describe('bornes du cadran', () => {
  it('heure la plus tôt arrondie en dessous, la plus tardive au-dessus', () => {
    expect(bornesCadran([7 * 60 + 30, 18 * 60 + 30, 8 * 60])).toEqual({ debut: 7 * 60, fin: 19 * 60 });
  });
  it('heures pleines gardées ; une heure au moins', () => {
    expect(bornesCadran([8 * 60, 17 * 60])).toEqual({ debut: 8 * 60, fin: 17 * 60 });
    expect(bornesCadran([9 * 60, 9 * 60])).toEqual({ debut: 9 * 60, fin: 10 * 60 });
  });
  it('sans heure : pas de cadran', () => {
    expect(bornesCadran([])).toBeNull();
  });
});

describe('raccourci « Absente » : même écriture que la feuille Journée', () => {
  const rec: DayRec = { key: 'c|2026-11-26', cid: 'c', date: '2026-11-26', repas: 0, km: 12, kmPartage: true, kmEnfants: 3, ferieTravaille: true };
  it('absence posée, présence retirée, le reste de la journée gardé', () => {
    const avant: DayRec = { ...rec, pres: [{ a: '08:30' }] };
    const r = journeeFiche(avant, { ...ficheDepart(avant, 1), abs: 'malade', gardees: undefined, certifDu: '', certifAu: '' }, 1, true);
    expect(r.abs).toBe('malade');
    expect(r.pres).toBeUndefined();
    expect(r.repas).toBe(0);
    expect(r.km).toBe(12);
    expect(r.kmPartage).toBe(true);
    expect(r.kmEnfants).toBe(3);
    expect(r.ferieTravaille).toBe(true);
  });
  it('dates du certificat gardées seulement pour « malade avec certificat » et les deux dates', () => {
    const f = { ...ficheDepart(rec, 1), gardees: undefined };
    expect(journeeFiche(rec, { ...f, abs: 'malade_certif', certifDu: '2026-11-26', certifAu: '2026-11-28' }, 1, true)).toMatchObject({ certifDu: '2026-11-26', certifAu: '2026-11-28' });
    expect(journeeFiche(rec, { ...f, abs: 'malade_certif', certifDu: '2026-11-26', certifAu: '' }, 1, true).certifDu).toBeUndefined();
    expect(journeeFiche(rec, { ...f, abs: 'parents', certifDu: '2026-11-26', certifAu: '2026-11-28' }, 1, true).certifDu).toBeUndefined();
  });
  it('valeurs de départ : celles de la journée, sinon celles du contrat', () => {
    expect(ficheDepart(undefined, 2)).toEqual({ repas: 2, km: 0, kmEnfants: 0, kmPartage: false, ferieT: false });
    // T-025 C-2 : ancienne saisie sans « kmPartage » et plusieurs enfants dans la voiture = trajet partagé.
    expect(ficheDepart({ key: 'k', cid: 'c', date: '2026-11-26', km: 5, kmEnfants: 2 }, 1).kmPartage).toBe(true);
  });
  it('journée gardée comme prévu (« Oui ») : la feuille écrit les mêmes champs qu’avant', () => {
    const r = journeeFiche({ ...rec, abs: 'malade' }, { ...ficheDepart(rec, 1), abs: 'none', gardees: [{ a: '08:00', d: '17:00' }], certifDu: '', certifAu: '' }, 1, false);
    expect(r.abs).toBeUndefined();
    expect(r.pres).toEqual([{ a: '08:00', d: '17:00' }]);
    expect(r.extra).toBe(true);
  });
});
