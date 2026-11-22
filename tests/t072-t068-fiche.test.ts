// T-072 / T-068 (contrôle de la n° 53, rapports/controle-maj-2026-11-21-PR53.md, l. 148-150) : fiche de la journée.
// Le jour même, une heure prévue pas encore passée n'est pas pré-remplie : le départ reste vide tant que son heure
// n'est pas passée, et « Enregistrer » sans geste n'écrit aucune heure. Après l'heure (fiche du soir) et pour un jour
// passé, rien ne change (T-048 : plage sautée laissée vide, autres plages remplies avec le planning).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Plage } from '../src/engine/model';
import { heuresInitiales, presencesAEnregistrer } from '../src/screens/Today';

const ADAM: Plage[] = [{ start: '07:30', end: '17:30' }];
const ROSE: Plage[] = [{ start: '07:30', end: '08:30' }, { start: '16:30', end: '18:30' }];

describe('T-068 : départ vide tant que son heure n’est pas passée', () => {
  it('cas du constat : Adam arrivé à 7 h 58, fiche ouverte à 10 h : départ vide, « Enregistrer » ne note aucun départ', () => {
    const form = heuresInitiales(ADAM, [{ a: '07:58' }], 1, '10:00');
    expect(form).toEqual([{ a: '07:58', d: '' }]);
    expect(presencesAEnregistrer(ADAM, form, false, '10:00')).toEqual([{ a: '07:58', d: undefined }]);
  });
  it('rien de pointé, fiche ouverte à 10 h puis « Enregistrer » : aucune heure écrite (journée comme prévu)', () => {
    const form = heuresInitiales(ADAM, undefined, 1, '10:00');
    expect(form).toEqual([{ a: '07:30', d: '' }]);
    expect(presencesAEnregistrer(ADAM, form, false, '10:00')).toBeUndefined();
  });
  it('avant l’arrivée prévue (6 h) : arrivée et départ vides, rien n’est écrit', () => {
    const form = heuresInitiales(ADAM, undefined, 1, '06:00');
    expect(form).toEqual([{ a: '', d: '' }]);
    expect(presencesAEnregistrer(ADAM, form, false, '06:00')).toBeUndefined();
  });
  it('deux plages, matin pointé, fiche à 10 h : la plage du soir reste vide et n’est pas écrite', () => {
    const form = heuresInitiales(ROSE, [{ a: '07:35', d: '08:32' }], 2, '10:00');
    expect(form).toEqual([{ a: '07:35', d: '08:32' }, { a: '', d: '' }]);
    expect(presencesAEnregistrer(ROSE, form, false, '10:00')).toEqual([{ a: '07:35', d: '08:32' }]);
  });
  it('arrivée du soir pointée à 16 h 40, fiche à 17 h : départ du soir vide', () => {
    const form = heuresInitiales(ROSE, [{ a: '07:35', d: '08:32' }, { a: '16:40' }], 2, '17:00');
    expect(form).toEqual([{ a: '07:35', d: '08:32' }, { a: '16:40', d: '' }]);
    expect(presencesAEnregistrer(ROSE, form, false, '17:00')).toEqual([{ a: '07:35', d: '08:32' }, { a: '16:40', d: undefined }]);
  });
  it('heure atteinte (17 h 30) ou passée (18 h) : le départ prévu est proposé, comme avant (fiche du soir)', () => {
    expect(heuresInitiales(ADAM, [{ a: '07:58' }], 1, '17:30')).toEqual([{ a: '07:58', d: '17:30' }]);
    expect(heuresInitiales(ADAM, [{ a: '07:58' }], 1, '18:00')).toEqual([{ a: '07:58', d: '17:30' }]);
    expect(presencesAEnregistrer(ADAM, [{ a: '07:58', d: '17:30' }], false, '18:00')).toEqual([{ a: '07:58', d: '17:30' }]);
    expect(presencesAEnregistrer(ADAM, [{ a: '07:30', d: '17:30' }], false, '18:00')).toBeUndefined();
  });
  it('jour passé (sans heure du jour) : inchangé, plage sautée vide (T-048), autres plages au planning', () => {
    expect(heuresInitiales(ADAM, [{ a: '07:58' }], 1)).toEqual([{ a: '07:58', d: '17:30' }]);
    expect(heuresInitiales(ROSE, [{}, { a: '17:10' }], 2)).toEqual([{ a: '', d: '' }, { a: '17:10', d: '18:30' }]);
    expect(heuresInitiales(ROSE, undefined, 2)).toEqual([{ a: '07:30', d: '08:30' }, { a: '16:30', d: '18:30' }]);
    expect(presencesAEnregistrer(ROSE, [{ a: '07:30', d: '08:30' }, { a: '16:30', d: '18:30' }], false)).toBeUndefined();
    expect(presencesAEnregistrer(ROSE, [{ a: '', d: '' }, { a: '17:10', d: '18:30' }], false)).toEqual([{}, { a: '17:10', d: '18:30' }]);
  });
  it('jour à venir : aucune présence écrite', () => {
    expect(presencesAEnregistrer(ADAM, [{ a: '08:00', d: '17:00' }], true)).toBeUndefined();
  });
  it('la fiche passe l’heure du jour seulement le jour même', () => {
    const src = readFileSync('src/screens/Today.tsx', 'utf8');
    expect(src).toContain('heuresInitiales(di.planned, rec?.pres, slots, day === today() ? nowHHMM() : undefined)');
  });
});
