import { describe, expect, it } from 'vitest';
import { rangsSymboles } from '../src/screens/Carnet';

// T-141 : chaque note de la réglette a son symbole ; deux symboles trop proches s'étagent.
describe('réglette du carnet : rangées des symboles', () => {
  it('symboles espacés : tous sur la rangée du bas', () => {
    expect(rangsSymboles([10, 40, 80])).toEqual([0, 0, 0]);
  });
  it('symboles proches : le suivant monte d’une rangée, puis redescend dès qu’il y a la place', () => {
    expect(rangsSymboles([100, 105, 110, 140])).toEqual([0, 1, 2, 0]);
  });
  it('écart de 18 exactement : pas de chevauchement', () => {
    expect(rangsSymboles([50, 68])).toEqual([0, 0]);
  });
  it('aucune note : aucune rangée', () => {
    expect(rangsSymboles([])).toEqual([]);
  });
});
