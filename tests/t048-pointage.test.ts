// T-048 : pointage loin de l'heure prévue. L'app demande quelle heure est vraie au lieu de noter l'heure de l'appui.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { DayRec as Jour, Plage } from '../src/engine/model';

// Journée réduite aux champs utiles au pointage (clé, contrat et date ne jouent pas ici).
type DayRec = Jour;
const J = (x: Partial<Jour>): Jour => x as Jour;
import {
  choixPointage, enregistrerChoix, heureLisible, MSG_DEPART_AVANT_ARRIVEE, MSG_HEURE_FUTURE, nextAction, pointerJour,
  SEUIL_ARRIVEE_MIN, SEUIL_DEPART_MIN, textesChoix, verifierHeure,
} from '../src/screens/Today';
import { evChoixPointage, evCorrection, evCorrections, evPointage, heureCorrigee, heureCorrigeeDetail, type GestePointage } from '../src/usage-events';

const JOUR: Plage[] = [{ start: '08:15', end: '17:00' }];
const DEUX: Plage[] = [{ start: '08:00', end: '12:00' }, { start: '13:30', end: '17:00' }];
const choix = (planned: Plage[], rec: DayRec | undefined, maintenant: string) => choixPointage(planned, nextAction({ planned }, rec), maintenant);

describe('T-048 : seuils stricts', () => {
  it('constantes', () => {
    expect(SEUIL_ARRIVEE_MIN).toBe(30);
    expect(SEUIL_DEPART_MIN).toBe(15);
  });
  it('arrivée : 29 et 30 min après le début prévu, rien ne change ; 31 min, trois choix', () => {
    expect(choix(JOUR, undefined, '08:44')).toBeNull();
    expect(choix(JOUR, undefined, '08:45')).toBeNull();
    expect(choix(JOUR, undefined, '08:46')).toEqual({ kind: 'a', idx: 0, prevue: '08:15', maintenant: '08:46', ecartMin: 31 });
    // Avant l'heure prévue : rien ne change
    expect(choix(JOUR, undefined, '07:50')).toBeNull();
  });
  it('départ : 14 et 15 min après la fin prévue, rien ne change ; 16 min, trois choix', () => {
    const rec = J({ pres: [{ a: '08:15' }] });
    expect(choix(JOUR, rec, '17:14')).toBeNull();
    expect(choix(JOUR, rec, '17:15')).toBeNull();
    expect(choix(JOUR, rec, '17:16')).toEqual({ kind: 'd', idx: 0, prevue: '17:00', maintenant: '17:16', ecartMin: 16 });
  });
});

describe('T-048 : textes', () => {
  it('heures sans « 00 » ni zéro devant', () => {
    expect(heureLisible('08:15')).toBe('8 h 15');
    expect(heureLisible('17:00')).toBe('17 h');
    expect(heureLisible('09:05')).toBe('9 h 05');
  });
  it('arrivée', () => {
    expect(textesChoix(choix(JOUR, undefined, '09:05')!)).toEqual({
      titre: 'Arrivée prévue à 8 h 15', prevue: 'À 8 h 15', maintenant: 'Maintenant, 9 h 05', autre: 'Autre heure',
    });
  });
  it('départ, avec les minutes payées en plus', () => {
    const rec = J({ pres: [{ a: '08:15' }] });
    expect(textesChoix(choix(JOUR, rec, '17:40')!)).toEqual({
      titre: 'Départ prévu à 17 h', prevue: 'À 17 h', maintenant: 'Maintenant, 17 h 40 (+40 min payées)', autre: 'Autre heure',
    });
    expect(textesChoix(choix(JOUR, rec, '18:15')!).maintenant).toBe('Maintenant, 18 h 15 (+75 min payées)');
  });
});

describe('T-048 : ce que chaque choix enregistre', () => {
  // L'enregistrement passe par enregistrerChoix (vérification) puis pointerJour (même mise à jour qu'avant T-048).
  function simule(rec: DayRec, planned: Plage[], maintenant: string, geste: GestePointage, autre?: string) {
    const ch = choix(planned, rec, maintenant)!;
    const heure = geste === 'prevue' ? ch.prevue : geste === 'maintenant' ? maintenant : autre!;
    let apres: DayRec | null = null;
    let evs: string[] = [];
    const arrivee = ch.kind === 'd' ? rec.pres?.[ch.idx]?.a : undefined;
    const err = enregistrerChoix(ch, heure, geste, maintenant, arrivee, (h, g) => {
      apres = pointerJour(rec, ch.idx, ch.kind, h, planned.length > 0);
      evs = evPointage(ch.kind === 'a', g);
    });
    return { err, apres: apres as DayRec | null, evs };
  }
  it('arrivée : heure prévue, maintenant, autre heure', () => {
    expect(simule(J({}), JOUR, '09:05', 'prevue')).toEqual({ err: '', apres: { pres: [{ a: '08:15' }], extra: undefined }, evs: ['arrivee', 'arrivee_heure_prevue'] });
    expect(simule(J({}), JOUR, '09:05', 'maintenant')).toEqual({ err: '', apres: { pres: [{ a: '09:05' }], extra: undefined }, evs: ['arrivee', 'arrivee_maintenant_tardive'] });
    expect(simule(J({}), JOUR, '09:05', 'autre', '08:40')).toEqual({ err: '', apres: { pres: [{ a: '08:40' }], extra: undefined }, evs: ['arrivee', 'arrivee_autre_heure'] });
  });
  it('départ : heure prévue, maintenant, autre heure (l’arrivée est gardée)', () => {
    const rec = J({ pres: [{ a: '08:15' }] });
    expect(simule(rec, JOUR, '17:40', 'prevue')).toEqual({ err: '', apres: { pres: [{ a: '08:15', d: '17:00' }], extra: undefined }, evs: ['depart', 'depart_heure_prevue'] });
    expect(simule(rec, JOUR, '17:40', 'maintenant')).toEqual({ err: '', apres: { pres: [{ a: '08:15', d: '17:40' }], extra: undefined }, evs: ['depart', 'depart_maintenant_tardif'] });
    expect(simule(rec, JOUR, '17:40', 'autre', '17:10')).toEqual({ err: '', apres: { pres: [{ a: '08:15', d: '17:10' }], extra: undefined }, evs: ['depart', 'depart_autre_heure'] });
  });
  it('avant le seuil, seul « arrivee » ou « depart » part, comme avant', () => {
    expect(evPointage(true, null)).toEqual(['arrivee']);
    expect(evPointage(false, null)).toEqual(['depart']);
  });
});

describe('T-048 : « Autre heure »', () => {
  it('rien n’est enregistré tant que l’heure est refusée ; une seule écriture à « Enregistrer »', () => {
    const pointer = vi.fn();
    const ch = { kind: 'a' as const };
    expect(enregistrerChoix(ch, '', 'autre', '09:05', undefined, pointer)).not.toBe('');
    expect(enregistrerChoix(ch, '09:30', 'autre', '09:05', undefined, pointer)).toBe(MSG_HEURE_FUTURE);
    expect(pointer).not.toHaveBeenCalled();
    expect(enregistrerChoix(ch, '08:40', 'autre', '09:05', undefined, pointer)).toBe('');
    expect(pointer).toHaveBeenCalledTimes(1);
    expect(pointer).toHaveBeenCalledWith('08:40', 'autre');
  });
  it('l’écriture se fait seulement dans « Enregistrer » de la fiche (fermer n’écrit rien)', () => {
    const src = readFileSync('src/screens/Today.tsx', 'utf8');
    const fiche = src.slice(src.indexOf('function AutreHeureSheet'));
    const corps = fiche.slice(0, fiche.indexOf('\n}\n'));
    // Un seul appel d'écriture, dans save(), appelé par le bouton « Enregistrer »
    expect(corps.match(/enregistrerChoix\(/g)).toHaveLength(1);
    expect(corps).not.toMatch(/pointer\(/);
    expect(corps).toMatch(/onClick=\{save\}>Enregistrer</);
    // Heure réglée d'avance sur l'heure prévue
    expect(corps).toContain('useState(ch.prevue)');
  });
  it('heure future refusée', () => {
    expect(verifierHeure('a', '09:06', '09:05')).toBe(MSG_HEURE_FUTURE);
    expect(verifierHeure('d', '18:00', '17:40', '08:15')).toBe(MSG_HEURE_FUTURE);
    expect(verifierHeure('a', '09:05', '09:05')).toBe('');
  });
  it('départ avant ou à l’heure d’arrivée refusé, avec le message de la fiche de la journée', () => {
    expect(MSG_DEPART_AVANT_ARRIVEE).toBe('L’heure de départ doit être après l’arrivée.');
    expect(verifierHeure('d', '08:00', '17:40', '08:15')).toBe(MSG_DEPART_AVANT_ARRIVEE);
    expect(verifierHeure('d', '08:15', '17:40', '08:15')).toBe(MSG_DEPART_AVANT_ARRIVEE);
    expect(verifierHeure('d', '08:16', '17:40', '08:15')).toBe('');
  });
  it('« À <fin prévue> » refusé quand l’arrivée enregistrée est après la fin prévue', () => {
    const pointer = vi.fn();
    // Arrivée corrigée à 17:05, fin prévue 17:00, il est 17:30
    const rec = J({ pres: [{ a: '17:05' }] });
    const ch = choix(JOUR, rec, '17:30')!;
    expect(ch.prevue).toBe('17:00');
    expect(enregistrerChoix(ch, ch.prevue, 'prevue', '17:30', '17:05', pointer)).toBe(MSG_DEPART_AVANT_ARRIVEE);
    expect(pointer).not.toHaveBeenCalled();
  });
});

describe('T-048 : deuxième plage et accueil imprévu', () => {
  it('deuxième plage : l’heure prévue est celle de la plage de l’après-midi', () => {
    const rec = J({ pres: [{ a: '08:00', d: '12:00' }] });
    expect(choix(DEUX, rec, '14:00')).toBeNull();
    expect(choix(DEUX, rec, '14:01')).toEqual({ kind: 'a', idx: 1, prevue: '13:30', maintenant: '14:01', ecartMin: 31 });
    expect(pointerJour(rec, 1, 'a', '13:30', true).pres).toEqual([{ a: '08:00', d: '12:00' }, { a: '13:30' }]);
    const rec2 = J({ pres: [{ a: '08:00', d: '12:00' }, { a: '13:30' }] });
    expect(choix(DEUX, rec2, '17:15')).toBeNull();
    expect(choix(DEUX, rec2, '17:16')?.prevue).toBe('17:00');
  });
  it('matin dépassé en entier : le choix porte encore sur la plage du matin', () => {
    expect(choix(DEUX, undefined, '15:00')).toMatchObject({ kind: 'a', idx: 0, prevue: '08:00' });
  });
  it('accueil imprévu (pas de planning) : rien ne change, à toute heure', () => {
    expect(choix([], undefined, '23:59')).toBeNull();
    expect(choix([], J({ pres: [{ a: '08:00' }] }), '23:59')).toBeNull();
    expect(pointerJour(J({}), 0, 'a', '10:00', false)).toEqual({ pres: [{ a: '10:00' }], extra: true });
  });
  it('plage en plus (au-delà du planning) : pas d’heure prévue, rien ne change', () => {
    expect(choixPointage(JOUR, { idx: 1, kind: 'a' }, '23:00')).toBeNull();
  });
});

describe('T-048 : vue en liste et réévaluation', () => {
  const src = readFileSync('src/screens/Today.tsx', 'utf8');
  it('la ligne de la liste ouvre les mêmes trois choix dans une fiche quand le seuil est passé', () => {
    const k = src.slice(src.indexOf('function KidCard'), src.indexOf('type Pointer ='));
    // Un seul calcul du choix pour la carte et la ligne
    expect(k.match(/choixPointage\(/g)).toHaveLength(1);
    const compact = k.slice(k.indexOf('if (compact)'), k.indexOf('return (\n    <article class="kid"'));
    expect(compact).toContain("onClick={choix ? () => setFiche('choix') : action.run}");
    expect(compact).toContain('{fiches}');
    expect(k).toMatch(/fiche === 'choix'\s*\? <Sheet[^\n]*>\{choixVue\}<\/Sheet>/);
    // Le libellé du bouton de la ligne ne change pas
    expect(compact).toContain('<Icon name={action.icon} />{action.label}');
  });
  it('la carte garde le bouton « Modifier »', () => {
    expect(src).toContain("{action ? 'Modifier' : day > t ? 'Prévoir une absence' : 'Modifier la journée'}");
  });
  it('l’écran se réévalue chaque minute et au retour sur l’app', () => {
    const t = src.slice(src.indexOf('export function Today'), src.indexOf('const kids'));
    expect(t).toContain('setInterval(tic, 60_000)');
    expect(t).toContain("addEventListener('visibilitychange', retour)");
    expect(t).toContain("addEventListener('focus', tic)");
    expect(t).toContain('clearInterval(id)');
  });
});

describe('T-048 : mesure d’usage', () => {
  const noms = [
    ...[true, false].flatMap((a) => (['prevue', 'maintenant', 'autre'] as GestePointage[]).flatMap((g) => evPointage(a, g))),
    ...evCorrections('2026-11-21', '2026-11-21', [{ a: '08:05', d: '17:10' }], [{ a: '08:15', d: '17:00' }]),
  ];
  it('les huit nouveaux noms', () => {
    expect([true, false].flatMap((a) => (['prevue', 'maintenant', 'autre'] as GestePointage[]).map((g) => evChoixPointage(a, g)))).toEqual([
      'arrivee_heure_prevue', 'arrivee_maintenant_tardive', 'arrivee_autre_heure',
      'depart_heure_prevue', 'depart_maintenant_tardif', 'depart_autre_heure',
    ]);
    expect(noms).toContain('heure_corrigee_arrivee');
    expect(noms).toContain('heure_corrigee_depart');
  });
  it('noms fixes : ni heure, ni chiffre, ni prénom, ni identifiant', () => {
    for (const n of noms) expect(n).toMatch(/^[a-z_]+$/);
    const usage = readFileSync('src/usage-events.ts', 'utf8');
    // Les fonctions de nom ne reçoivent ni heure ni nom : seulement arrivée/départ et le geste.
    expect(usage).toMatch(/export function evChoixPointage\(arrivee: boolean, geste: GestePointage\): string/);
    expect(usage).toMatch(/export function evPointage\(arrivee: boolean, geste: GestePointage \| null\): string\[\]/);
  });
  it('heure_corrigee_arrivee et heure_corrigee_depart en plus de heure_corrigee, le jour même', () => {
    const J = '2026-11-21';
    expect(evCorrections(J, J, [{ a: '08:05' }], [{ a: '07:55' }])).toEqual(['heure_corrigee', 'heure_corrigee_arrivee']);
    expect(evCorrections(J, J, [{ a: '08:05', d: '17:40' }], [{ a: '08:05', d: '17:00' }])).toEqual(['heure_corrigee', 'heure_corrigee_depart']);
    expect(evCorrections(J, J, [{ a: '08:05', d: '17:40' }], [{ a: '08:15', d: '17:00' }])).toEqual(['heure_corrigee', 'heure_corrigee_arrivee', 'heure_corrigee_depart']);
    // Deuxième plage
    expect(evCorrections(J, J, [{ a: '08:00', d: '12:00' }, { a: '13:30', d: '17:40' }], [{ a: '08:00', d: '12:00' }, { a: '13:30', d: '17:00' }])).toEqual(['heure_corrigee', 'heure_corrigee_depart']);
    // Pas de correction : rien
    expect(evCorrections(J, J, [{ a: '08:05' }], [{ a: '08:05', d: '17:00' }])).toEqual([]);
    // Après coup : inchangé, sans détail
    expect(evCorrections('2026-11-20', J, [{ a: '08:05' }], [{ a: '07:55' }])).toEqual(['heure_corrigee_apres_coup']);
  });
  it('heureCorrigee repose sur le détail et garde son résultat', () => {
    const cas: [any, any][] = [[[{ a: '08:05' }], [{ a: '07:55' }]], [[{ a: '08:05', d: '17:10' }], [{ a: '08:05', d: '16:50' }]], [[{ a: '08:05' }], [{ a: '08:05', d: '17:00' }]], [undefined, [{ a: '08:00' }]]];
    for (const [a, b] of cas) {
      const d = heureCorrigeeDetail(a, b);
      expect(heureCorrigee(a, b)).toBe(d.arrivee || d.depart);
    }
    expect(heureCorrigeeDetail([{ a: '08:05', d: '17:10' }], [{ a: '08:05', d: '16:50' }])).toEqual({ arrivee: false, depart: true });
    expect(evCorrection('2026-11-21', '2026-11-21')).toBe('heure_corrigee');
  });
  it('la fiche de la journée envoie les événements de correction détaillés', () => {
    const src = readFileSync('src/screens/Today.tsx', 'utf8');
    expect(src).toContain("for (const ev of evCorrections(day, today(), rec?.pres, apres)) logUsage(ev, 'aujourdhui');");
  });
});
