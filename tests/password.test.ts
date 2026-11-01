import { describe, expect, it } from 'vitest';
import { passwordChecks } from '../src/password';

describe('règle des mots de passe : 8 caractères, 3 types sur 4', () => {
  it('refuse les mots de passe trop courts, même variés', () => {
    expect(passwordChecks('Ab1!').ok).toBe(false);
  });
  it('refuse 2 types seulement', () => {
    expect(passwordChecks('motdepasse').ok).toBe(false); // minuscules
    expect(passwordChecks('motdepasse12').ok).toBe(false); // minuscules + chiffres
    expect(passwordChecks('motdepasse-solide').ok).toBe(false); // minuscules + spécial
  });
  it('accepte 3 types sur 4', () => {
    expect(passwordChecks('Motdepasse12').ok).toBe(true); // majuscule, minuscules, chiffres
    expect(passwordChecks('motdepasse-12').ok).toBe(true); // minuscules, spécial, chiffres
    expect(passwordChecks('Léo et Inès 2026').ok).toBe(true); // accents et espaces comptent
  });
  it('compte les lettres accentuées comme des lettres', () => {
    const c = passwordChecks('ÉTÉàéè');
    expect(c.majuscule && c.minuscule && !c.special).toBe(true);
  });
});
