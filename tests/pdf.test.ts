import { describe, expect, it } from 'vitest';
import { isScanText, parseBulletin } from '../src/pdf';

describe('PDF scanné', () => {
  it('reconnaît un PDF sans texte (scan ou photo)', () => {
    expect(isScanText('')).toBe(true);
    expect(isScanText(' \n \n 1 ')).toBe(true);
  });
  it('accepte un vrai bulletin', () => {
    const t = 'Bulletin de salaire Pajemploi Période du 01/09/2026 au 30/09/2026 Salaire net payé 812,40 Heures normales 140';
    expect(isScanText(t)).toBe(false);
    expect(parseBulletin(t).net).toBe(81240);
  });
});
