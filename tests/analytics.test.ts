import { describe, expect, it } from 'vitest';
import { state } from '../src/store';
import { pseudonymise } from '../src/analytics';

describe('mesure d’usage : pseudonymisation avant envoi', () => {
  it('remplace prénoms, familles et prénom de l’AM, sans toucher au reste', () => {
    state.contracts = [
      { id: 'a', child: 'Léo', family: 'Martin', createdAt: 1 } as any,
      { id: 'b', child: 'Marie-Lou', family: 'Durand', createdAt: 2 } as any,
      { id: 'c', child: 'Marie', family: 'Martin', createdAt: 3 } as any,
    ];
    state.settings = { ...state.settings, amName: 'Sonia' } as any;
    expect(pseudonymise('Arrivée de Léo à 8h, famille Martin')).toBe('Arrivée de Enfant 1 à 8h, famille Famille 1');
    expect(pseudonymise('Marie-Lou et Marie, LÉO')).toBe('Enfant 2 et Enfant 3, Enfant 1');
    expect(pseudonymise('Merci ! Sonia')).toBe('Merci ! AM');
    expect(pseudonymise('Léonard reste Léonard')).toBe('Léonard reste Léonard');
    expect(pseudonymise('Malade, avec certificat : 713,81 €')).toBe('Malade, avec certificat : 713,81 €');
    expect(pseudonymise('Connectée : sonia.dupont@gmail.com')).toBe('Connectée : e-mail masqué');
  });
});
