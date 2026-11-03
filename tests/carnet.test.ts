import { describe, expect, it } from 'vitest';
import type { Journal } from '../src/engine/model';
import {
  insecable, reveilOublie, detailReveilOublie, detailBiberon, detailSieste, detailTemperature, dureeLabel, estFievre, minutesSieste, parseMl, parseTemperature, resumeJour, siesteEnCours, sommeilTotal,
} from '../src/engine/carnet';

const j = (o: Partial<Journal>): Journal => ({ id: 'x', cid: 'c1', date: '2026-11-02', time: '12:00', kind: 'note', detail: '', ...o });

describe('carnet : sieste', () => {
  it('durée lisible', () => {
    expect(dureeLabel(45)).toBe('45 min');
    expect(dureeLabel(60)).toBe('1 h');
    expect(dureeLabel(115)).toBe('1 h 55');
    expect(dureeLabel(125)).toBe('2 h 05');
  });
  it('sieste terminée : texte avec heures et durée', () => {
    expect(detailSieste('13:10', '15:05')).toBe('13h10 à 15h05 (1 h 55)');
    expect(minutesSieste({ time: '13:10', fin: '15:05' })).toBe(115);
  });
  it('sieste en cours', () => {
    expect(detailSieste('12:40')).toBe('Dort depuis 12h40');
    expect(siesteEnCours(j({ kind: 'sieste', sommeil: true, time: '12:40' }))).toBe(true);
    expect(siesteEnCours(j({ kind: 'sieste', sommeil: true, time: '12:40', fin: '14:00' }))).toBe(false);
  });
  it('ancienne note « Endormissement » : pas une sieste en cours', () => {
    expect(siesteEnCours(j({ kind: 'sieste', detail: 'Endormissement' }))).toBe(false);
  });
  it('total de sommeil : les siestes qui se chevauchent ne comptent qu’une fois', () => {
    expect(sommeilTotal([{ time: '12:40', fin: '14:10' }, { time: '13:10', fin: '15:05' }])).toBe(145);
    expect(sommeilTotal([{ time: '10:30', fin: '11:00' }, { time: '13:10', fin: '15:05' }])).toBe(145);
    expect(sommeilTotal([{ time: '13:00', fin: '15:00' }, { time: '13:30', fin: '14:00' }])).toBe(120);
    expect(sommeilTotal([{ time: '13:00' }])).toBe(0);
    expect(sommeilTotal([])).toBe(0);
  });
  it('réveil avant l’endormissement : pas de durée inventée', () => {
    expect(minutesSieste({ time: '15:00', fin: '14:00' })).toBeUndefined();
  });
});

describe('carnet : affichage', () => {
  it('pas de coupure entre un nombre et son unité', () => {
    expect(insecable('Biberon de 180 ml')).toBe('Biberon de 180\u00a0ml');
    expect(insecable('13h10 à 15h05 (1 h 55)')).toBe('13h10 à 15h05 (1\u00a0h\u00a055)');
    expect(insecable('Température 38,4 °C (fièvre)')).toBe('Température 38,4\u00a0°C (fièvre)');
    expect(insecable('A mangé 2 hamburgers')).toBe('A mangé 2 hamburgers');
  });
});

describe('carnet : biberon et température', () => {
  it('quantité de biberon', () => {
    expect(parseMl('180')).toBe(180);
    expect(parseMl('0')).toBeUndefined();
    expect(parseMl('900')).toBeUndefined();
    expect(parseMl('abc')).toBeUndefined();
    expect(detailBiberon(180)).toBe('Biberon de 180 ml');
  });
  it('température : virgule ou point, une décimale', () => {
    expect(parseTemperature('38,2')).toBe(38.2);
    expect(parseTemperature('37.46')).toBe(37.5);
    expect(parseTemperature('382')).toBeUndefined();
    expect(parseTemperature('20')).toBeUndefined();
  });
  it('fièvre à partir de 38 °C', () => {
    expect(estFievre(37.9)).toBe(false);
    expect(estFievre(38)).toBe(true);
    expect(detailTemperature(37.2)).toBe('Température 37,2 °C');
    expect(detailTemperature(38.5)).toBe('Température 38,5 °C (fièvre)');
  });
});

describe('carnet : résumé du jour', () => {
  const notes: Journal[] = [
    j({ time: '16:00', kind: 'repas', ml: 120, detail: 'Biberon de 120 ml' }),
    j({ time: '09:30', kind: 'humeur', detail: 'De bonne humeur' }),
    j({ time: '10:00', kind: 'repas', ml: 180, detail: 'Biberon de 180 ml' }),
    j({ time: '13:10', kind: 'sieste', sommeil: true, fin: '15:05', detail: '13h10 à 15h05 (1 h 55)' }),
    j({ time: '10:30', kind: 'sieste', sommeil: true, fin: '11:00', detail: '10h30 à 11h00 (30 min)' }),
    j({ time: '14:20', kind: 'soin', temp: 38.4, detail: 'Température 38,4 °C (fièvre)' }),
    j({ time: '11:10', kind: 'change', detail: 'Selles' }),
    j({ time: '15:30', kind: 'change', detail: 'Couche mouillée' }),
  ];
  const txt = resumeJour({ enfant: 'Léa', jour: 'lundi 2 novembre', presence: 'Arrivée 8h05, départ 17h10', notes });
  const lignes = txt.split('\n');

  it('l’essentiel en tête : présence, puis soins, sieste, repas', () => {
    expect(lignes[0]).toBe('Bonjour ! La journée de Léa, lundi 2 novembre :');
    expect(lignes[2]).toBe('Arrivée 8h05, départ 17h10');
    expect(lignes[3]).toBe('Soins : Température 38,4 °C (fièvre) (14h20)');
    expect(lignes[4]).toBe('Sommeil : 2 h 25 en tout (10h30 à 11h00, 13h10 à 15h05)');
    expect(lignes[5]).toBe('Repas : Biberon de 180 ml (10h00), Biberon de 120 ml (16h00) (300 ml en tout)');
  });
  it('puis humeur, changes comptés, et fin du message', () => {
    expect(lignes[6]).toBe('Humeur : De bonne humeur (09h30)');
    expect(lignes[7]).toBe('Change : 2 (Selles (11h10), Couche mouillée (15h30))');
    expect(lignes.at(-1)).toBe('Bonne soirée !');
  });
  it('ce que les parents doivent apporter : ligne à part, pas compté comme un change', () => {
    const t = resumeJour({ enfant: 'Léo', jour: 'lundi 2 novembre', notes: [
      j({ time: '10:00', kind: 'change', detail: 'Selles' }),
      j({ time: '11:00', kind: 'change', detail: 'Couches à apporter' }),
      j({ time: '16:00', kind: 'change', detail: 'Vêtements de rechange à apporter' }),
      j({ time: '16:30', kind: 'change', detail: 'Couches à apporter' }),
    ] }).split('\n');
    expect(t).toContain('Change : 1 (Selles (10h00))');
    expect(t).toContain('À apporter : couches, vêtements de rechange');
  });
  it('sieste en cours ou ancienne note : pas de total inventé', () => {
    const t = resumeJour({ enfant: 'Léo', jour: 'lundi 2 novembre', notes: [j({ time: '12:40', kind: 'sieste', sommeil: true, detail: 'Dort depuis 12h40' })] });
    expect(t).toContain('Sommeil (en cours depuis 12h40)');
  });
});

describe('français : élision devant un prénom', () => {
  it('« de Léo », « d’Adam », « d’Inès », « d’Hugo »', async () => {
    const { de } = await import('../src/engine/texte');
    expect(de('Léo')).toBe('de Léo');
    expect(de('Adam')).toBe('d’Adam');
    expect(de('Inès')).toBe('d’Inès');
    expect(de('Élise')).toBe('d’Élise');
    expect(de('Hugo')).toBe('d’Hugo');
    expect(de('Violette')).toBe('de Violette');
  });
  it('résumé : « La journée d’Adam »', () => {
    expect(resumeJour({ enfant: 'Adam', jour: 'lundi 2 novembre', notes: [] }).split('\n')[0]).toBe('Bonjour ! La journée d’Adam, lundi 2 novembre :');
  });
});

describe('carnet : réveil oublié', () => {
  const ouvert = j({ date: '2026-11-01', time: '13:10', kind: 'sieste', sommeil: true, detail: 'Dort depuis 13h10' });
  it('sommeil d’un jour passé jamais terminé', () => {
    expect(reveilOublie(ouvert, '2026-11-02')).toBe(true);
    expect(reveilOublie({ ...ouvert, date: '2026-11-02' }, '2026-11-02')).toBe(false);
    expect(reveilOublie({ ...ouvert, fin: '14:00' }, '2026-11-02')).toBe(false);
    expect(detailReveilOublie('13:10')).toBe('Endormissement à 13h10, réveil non noté');
  });
  it('résumé d’un jour terminé : pas « en cours »', () => {
    const t = resumeJour({ enfant: 'Rose', jour: 'dimanche 1 novembre', notes: [ouvert], jourTermine: true });
    expect(t).toContain('Sommeil (endormissement à 13h10, réveil non noté)');
  });
});
