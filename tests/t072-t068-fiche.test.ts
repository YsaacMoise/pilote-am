// T-072 / T-068 (contrôle de la n° 53, rapports/controle-maj-2026-11-21-PR53.md, l. 148-150) : fiche de la journée.
// Le jour même, une heure prévue pas encore passée n'est pas pré-remplie : le départ reste vide tant que son heure
// n'est pas passée, et « Enregistrer » sans geste n'écrit aucune heure. Après l'heure (fiche du soir) et pour un jour
// passé, rien ne change (T-048 : plage sautée laissée vide, autres plages remplies avec le planning).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Plage } from '../src/engine/model';
import { heuresInitiales, presencesAEnregistrer, departSansArrivee, verifierFiche } from '../src/screens/Today';

const ADAM: Plage[] = [{ start: '07:30', end: '17:30' }];
const ROSE: Plage[] = [{ start: '07:30', end: '08:30' }, { start: '16:30', end: '18:30' }];

describe('T-068 : départ vide tant que son heure n’est pas passée', () => {
  it('cas du constat : Adam arrivé à 7 h 58, fiche ouverte à 10 h : départ vide, « Enregistrer » ne note aucun départ', () => {
    const form = heuresInitiales(ADAM, [{ a: '07:58' }], 1, '10:00');
    expect(form).toEqual([{ a: '07:58', d: '' }]);
    expect(presencesAEnregistrer(ADAM, form, false, '10:00')).toEqual([{ a: '07:58', d: undefined }]);
  });
  it('rien de pointé, fiche ouverte à 10 h puis « Enregistrer » : arrivée non proposée, aucune heure écrite (journée comme prévu)', () => {
    const form = heuresInitiales(ADAM, undefined, 1, '10:00');
    expect(form).toEqual([{ a: '', d: '' }]);
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
  // Direction T-072 (point 4) : une plage dont l'heure d'arrivée est passée mais qui n'est pas pointée n'est pas remplie
  // le jour même : sinon « Enregistrer », après une modification d'une autre plage, écrirait son arrivée sans geste.
  it('matin pointé, soir non pointé, fiche à 17 h, départ du matin corrigé : l’arrivée du soir n’est pas écrite', () => {
    const form = heuresInitiales(ROSE, [{ a: '07:35', d: '08:32' }], 2, '17:00');
    expect(form).toEqual([{ a: '07:35', d: '08:32' }, { a: '', d: '' }]);
    const modifie = [{ a: '07:35', d: '08:40' }, form[1]];
    expect(presencesAEnregistrer(ROSE, modifie, false, '17:00')).toEqual([{ a: '07:35', d: '08:40' }]);
  });
  it('matin non pointé (passé), fiche à 17 h, arrivée du soir saisie : le matin reste vide (T-048, plage sautée)', () => {
    const form = heuresInitiales(ROSE, undefined, 2, '17:00');
    expect(form).toEqual([{ a: '', d: '' }, { a: '', d: '' }]);
    expect(presencesAEnregistrer(ROSE, [form[0], { a: '16:40', d: '' }], false, '17:00')).toEqual([{}, { a: '16:40', d: undefined }]);
  });
  it('fiche à 19 h, rien de pointé : rien n’est proposé ni écrit sans geste', () => {
    const form = heuresInitiales(ROSE, undefined, 2, '19:00');
    expect(form).toEqual([{ a: '', d: '' }, { a: '', d: '' }]);
    expect(presencesAEnregistrer(ROSE, form, false, '19:00')).toBeUndefined();
  });
  // Direction T-072, quatrième passe (B-3 de la relecture) : « aucune heure enregistrée sans geste de l'AM ». Le jour même,
  // aucun départ non pointé n'est proposé, même après l'heure prévue : l'AM utilise le bouton Départ (T-048) ou tape l'heure.
  it('B-3 : heure atteinte (17 h 30) ou passée (18 h, 20 h) : départ non pointé laissé vide, « Enregistrer » ne l’écrit pas', () => {
    for (const h of ['17:30', '18:00', '20:00']) {
      const form = heuresInitiales(ADAM, [{ a: '07:58' }], 1, h);
      expect(form).toEqual([{ a: '07:58', d: '' }]);
      expect(presencesAEnregistrer(ADAM, form, false, h)).toEqual([{ a: '07:58', d: undefined }]);
    }
    expect(heuresInitiales(ROSE, [{ a: '07:35' }, { a: '16:40' }], 2, '19:00')).toEqual([{ a: '07:35', d: '' }, { a: '16:40', d: '' }]);
  });
  it('B-3 : un départ tapé par l’AM est écrit tel quel', () => {
    expect(presencesAEnregistrer(ADAM, [{ a: '07:58', d: '17:30' }], false, '18:00')).toEqual([{ a: '07:58', d: '17:30' }]);
    expect(presencesAEnregistrer(ADAM, [{ a: '07:30', d: '17:30' }], false, '18:00')).toEqual([{ a: '07:30', d: '17:30' }]);
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

  // Relecture T-072, B-2 : un départ saisi sans arrivée était perdu sans message (presencesAGarder ne garde que les plages
  // avec arrivée). « Enregistrer » est refusé avec un message qui demande l'arrivée et rappelle l'heure prévue.
  it('B-2 : jour même à 19 h, journée non pointée, départ seul saisi : refusé avec un message, rien de perdu en silence', () => {
    const form = heuresInitiales(ADAM, undefined, 1, '19:00');
    const saisi = [{ ...form[0], d: '18:15' }];
    expect(departSansArrivee(saisi, ADAM)).toBe('Départ sans arrivée : indique aussi l’heure d’arrivée (prévue à 7 h 30).');
  });
  it('B-2 : jour même avant l’heure prévue (10 h), départ seul saisi : même refus', () => {
    expect(departSansArrivee([{ a: '', d: '09:45' }], ADAM)).toContain('Départ sans arrivée');
  });
  it('B-2 : deux plages, départ du soir seul saisi : refus qui nomme la plage du soir', () => {
    expect(departSansArrivee([{ a: '07:35', d: '08:32' }, { a: '', d: '18:45' }], ROSE)).toBe('Départ (2) sans arrivée : indique aussi l’heure d’arrivée (prévue à 16 h 30).');
  });
  it('B-2 : jour passé, arrivée effacée et départ gardé : même refus ; plage sans heure prévue : message sans heure', () => {
    expect(departSansArrivee([{ a: '', d: '17:30' }], ADAM)).toContain('prévue à 7 h 30');
    expect(departSansArrivee([{ a: '', d: '17:30' }], [])).toBe('Départ sans arrivée : indique aussi l’heure d’arrivée.');
  });
  it('B-2 : rien à refuser quand chaque départ a son arrivée, ou sans départ', () => {
    expect(departSansArrivee([{ a: '07:58', d: '' }], ADAM)).toBe('');
    expect(departSansArrivee([{ a: '', d: '' }, { a: '16:40', d: '18:45' }], ROSE)).toBe('');
    expect(departSansArrivee([{ a: '07:30', d: '17:30' }], ADAM)).toBe('');
  });
  // Remarque du relecteur sur B-2 : avec une absence choisie (ou un jour à venir), le bloc des heures est caché et les heures
  // ne sont pas enregistrées (save retire les présences). Les contrôles des heures ne s'appliquent pas : sinon « Enregistrer »
  // resterait muet, le message étant dans le bloc caché.
  it('B-2 : heures visibles, les deux contrôles s’appliquent', () => {
    expect(verifierFiche([{ a: '', d: '18:15' }], ADAM, true)).toBe('Départ sans arrivée : indique aussi l’heure d’arrivée (prévue à 7 h 30).');
    expect(verifierFiche([{ a: '08:00', d: '07:00' }], ADAM, true)).toBe('L’heure de départ doit être après l’arrivée.');
    expect(verifierFiche([{ a: '08:00', d: '17:00' }], ADAM, true)).toBe('');
  });
  it('B-2 : absence choisie ou jour à venir (heures cachées, non enregistrées) : aucun contrôle, « Enregistrer » n’est pas bloqué', () => {
    expect(verifierFiche([{ a: '', d: '18:15' }], ADAM, false)).toBe('');
    expect(verifierFiche([{ a: '08:00', d: '07:00' }], ADAM, false)).toBe('');
  });
  it('B-2 : la fiche vérifie avant d’écrire, seulement quand les heures sont visibles', () => {
    const src = readFileSync('src/screens/Today.tsx', 'utf8');
    // T-109 (correction 20) : le jour même, l'heure de maintenant est passée pour refuser une heure à venir.
    expect(src).toMatch(/const erreur = verifierFiche\(pres, di\.planned, abs === 'none' && !future, day === today\(\) \? nowHHMM\(\) : undefined\);\s*if \(erreur\) \{ setErr\(erreur\); return; \}/);
    expect(src).toContain("{abs === 'none' && !future && (");
  });
});
