import { describe, expect, test } from 'bun:test';
import { parseBulletin } from '../src/pdf';

// Texte synthétique au format d'un bulletin Pajemploi (à recaler sur les vrais bulletins).
const SAMPLE = `Pajemploi
Bulletin de salaire
Période d'emploi du 01/09/2026 au 30/09/2026
Salarié : Sandrine X
Nombre d'heures normales  163,33
Nombre de jours d'activité  16
Salaire brut  793,62 €
Salaire net  619,92 €
Indemnités d'entretien  69,60 €
Indemnités de repas  64,00 €
Net à payer  753,52 €`;

describe('lecture de bulletin', () => {
  test('montants repérés par leur libellé', () => {
    const p = parseBulletin(SAMPLE);
    expect(p.month).toBe('2026-09');
    expect(p.netCents).toBe(61_992);
    expect(p.grossCents).toBe(79_362);
    expect(p.hours).toBe(163.33);
    expect(p.days).toBe(16);
    expect(p.entretienCents).toBe(6_960);
    expect(p.mealsCents).toBe(6_400);
    expect(p.kmCents).toBeUndefined();
    expect(p.found).toBe(6);
  });
  test('valeur sur la ligne suivante et milliers séparés', () => {
    const p = parseBulletin('Période : octobre 2026\nSalaire brut\n1 234,56\nSalaire net imposable 900,00\nSalaire net\n1.012,40');
    expect(p.month).toBe('2026-10');
    expect(p.grossCents).toBe(123_456);
    expect(p.netCents).toBe(101_240);
  });
  test('texte sans rapport : rien de reconnu', () => {
    const p = parseBulletin('Facture EDF\nMontant 45,00');
    expect(p.found).toBe(0);
    expect(p.netCents).toBeUndefined();
  });
});
