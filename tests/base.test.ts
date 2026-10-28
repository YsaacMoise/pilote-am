import { describe, expect, test } from 'bun:test';
import {
  formatEuros, formatRate, hourlyAmount, mulDiv, parseEuros, parseRateMilli, roundDiv,
} from '../src/engine/money';
import {
  addDays, datesOfMonth, formatLongDate, fullMonthsBetween, mondayOf, parseTime, weekday,
} from '../src/engine/dates';
import { easterSunday, holidayOn, publicHolidays } from '../src/engine/holidays';

describe('money', () => {
  test('arrondi demi vers le haut', () => {
    expect(roundDiv(5n, 2n)).toBe(3);
    expect(roundDiv(-5n, 2n)).toBe(-3);
    expect(roundDiv(4n, 3n)).toBe(1);
    expect(roundDiv(5n, 3n)).toBe(2);
  });
  test('mensualisation 3,80 € × 40 h × 52 / 12', () => {
    // 3800 millièmes × 40 × 52 ÷ 12 ÷ 10 → centimes
    expect(mulDiv(3800 * 40, 52, 120)).toBe(65867);
  });
  test('montant horaire : 0,435 € × 10 h = 4,35 €', () => {
    expect(hourlyAmount(435, 600)).toBe(435);
    expect(hourlyAmount(435, 540)).toBe(392); // 3,915 → 3,92
  });
  test('saisie et affichage', () => {
    expect(parseEuros('3,80')).toBe(380);
    expect(parseEuros('1 234,5 €')).toBe(123450);
    expect(parseEuros('abc')).toBeNull();
    expect(parseEuros('1,234')).toBeNull();
    expect(parseRateMilli('0,435')).toBe(435);
    expect(formatEuros(65867)).toBe('658,67 €');
    expect(formatEuros(123456789)).toBe('1 234 567,89 €');
    expect(formatRate(435)).toBe('0,435 €');
    expect(formatRate(3280)).toBe('3,28 €');
  });
});

describe('dates', () => {
  test('jour de la semaine', () => {
    expect(weekday('2026-10-01')).toBe(3); // jeudi
    expect(weekday('2026-10-28')).toBe(2); // mercredi
    expect(mondayOf('2026-10-28')).toBe('2026-10-26');
  });
  test('mois et ajouts', () => {
    expect(datesOfMonth('2026-02')).toHaveLength(28);
    expect(datesOfMonth('2028-02')).toHaveLength(29);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  test('ancienneté en mois révolus', () => {
    expect(fullMonthsBetween('2026-01-15', '2026-10-14')).toBe(8);
    expect(fullMonthsBetween('2026-01-15', '2026-10-15')).toBe(9);
    expect(fullMonthsBetween('2026-01-31', '2026-02-28')).toBe(1);
  });
  test('heures', () => {
    expect(parseTime('8 h 30')).toBe(510);
    expect(parseTime('17:45')).toBe(1065);
    expect(parseTime('25:00')).toBeNull();
    expect(formatLongDate('2026-10-28')).toBe('mercredi 28 octobre');
  });
});

describe('jours fériés', () => {
  test('Pâques', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
  });
  test('liste 2026', () => {
    const list = publicHolidays(2026).map((h) => h.date);
    expect(list).toHaveLength(11);
    expect(list).toContain('2026-04-06');
    expect(list).toContain('2026-05-14');
    expect(list).toContain('2026-05-25');
    expect(holidayOn('2026-11-11')?.name).toBe('Armistice 1918');
    expect(holidayOn('2026-05-01')?.isMayFirst).toBe(true);
  });
});
