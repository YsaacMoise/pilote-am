import { describe, expect, it } from 'vitest';
import { CHILD_COLORS, COLOR_NAMES, couleurLibre, couleursPrises } from '../src/ui/kit';

const k = (id: string, child: string, color: number, end?: string) => ({ id, child, color, end });

describe('couleurs des enfants : une couleur par enfant en cours de contrat', () => {
  it('8 couleurs, chacune nommée', () => {
    expect(CHILD_COLORS.length).toBe(8);
    expect(COLOR_NAMES.length).toBe(8);
  });
  it('les couleurs des contrats terminés redeviennent libres', () => {
    const p = couleursPrises([k('a', 'Adam', 0), k('b', 'Rose', 1, '2026-06-30'), k('c', 'Violette', 2)], 'x', '2026-11-02');
    expect([...p.keys()].sort()).toEqual([0, 2]);
    expect(p.get(0)).toBe('Adam');
    expect(couleurLibre(p)).toBe(1);
  });
  it('le contrat modifié ne bloque pas sa propre couleur', () => {
    const p = couleursPrises([k('a', 'Adam', 0), k('b', 'Rose', 1)], 'a', '2026-11-02');
    expect(p.has(0)).toBe(false);
  });
  it('toutes prises : on revient à la première', () => {
    const tous = CHILD_COLORS.map((_, i) => k(String(i), `E${i}`, i));
    expect(couleurLibre(couleursPrises(tous, 'x', '2026-11-02'))).toBe(0);
  });
});
