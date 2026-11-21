// T-048 : pointage loin de l'heure prévue. L'app demande quelle heure est vraie au lieu de noter l'heure de l'appui.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Contract, DayRec as Jour, Plage } from '../src/engine/model';
import { dayInfo, makeCtx } from '../src/engine/payroll';

// Journée réduite aux champs utiles au pointage (clé, contrat et date ne jouent pas ici).
type DayRec = Jour;
const J = (x: Partial<Jour>): Jour => x as Jour;
import {
  choixPointage, decisionAppui, heuresInitiales, presencesAGarder, memeQuestion, pointerPlagePrevue, questionPlage, texteQuestion, enregistrerChoix, heureLisible, minutesPayeesEnPlus, msAvantMinuteSuivante, MSG_DEPART_AVANT_ARRIVEE, MSG_HEURE_FUTURE, nextAction, pointerJour,
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
  it('départ, avec les minutes payées en plus (chiffre donné par le moteur, voir plus bas)', () => {
    const rec = J({ pres: [{ a: '08:15' }] });
    expect(textesChoix({ ...choix(JOUR, rec, '17:40')!, payeesMin: 40 })).toEqual({
      titre: 'Départ prévu à 17 h', prevue: 'À 17 h', maintenant: 'Maintenant, 17 h 40 (+40 min payées)', autre: 'Autre heure',
    });
    expect(textesChoix({ ...choix(JOUR, rec, '18:15')!, payeesMin: 75 }).maintenant).toBe('Maintenant, 18 h 15 (+75 min payées)');
  });
  it('rien de payé en plus : pas de parenthèse', () => {
    const rec = J({ pres: [{ a: '08:15' }] });
    expect(textesChoix(choix(JOUR, rec, '17:40')!).maintenant).toBe('Maintenant, 17 h 40');
    expect(textesChoix({ ...choix(JOUR, rec, '17:40')!, payeesMin: 0 }).maintenant).toBe('Maintenant, 17 h 40');
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
    expect(compact).toContain("onClick={choix || question ? () => setFiche('choix') : action.run}");
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
    // Calée sur le début de chaque minute, relancée à chaque minute, nettoyée au démontage
    expect(t).toContain('setTimeout(() => { tic(); planifier(); }, msAvantMinuteSuivante(Date.now()))');
    expect(t).toContain("addEventListener('visibilitychange', retour)");
    expect(t).toContain("addEventListener('focus', tic)");
    expect(t).toContain('clearTimeout(id)');
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

// ---------- Relecture : réserves R1 et R2 ----------

describe('T-048 R1 : le choix est recalculé à l’heure de l’appui', () => {
  it('écran affiché à 9:00 (bouton simple), appui à 9:01 : rien n’est noté, les trois choix s’ouvrent', () => {
    const planned: Plage[] = [{ start: '08:30', end: '17:00' }];
    const na = nextAction({ planned }, undefined);
    // Au rendu de 9:00, 30 min pile : bouton simple
    expect(choixPointage(planned, na, '09:00')).toBeNull();
    // Appui à 9:01 : 31 min, le geste ouvre les trois choix
    expect(decisionAppui(planned, na, '09:01')).toBe('choix');
    expect(decisionAppui(planned, na, '09:00')).toBe('direct');
    // Départ : même règle
    const naD = nextAction({ planned }, J({ pres: [{ a: '08:30' }] }));
    expect(decisionAppui(planned, naD, '17:15')).toBe('direct');
    expect(decisionAppui(planned, naD, '17:16')).toBe('choix');
    // Accueil imprévu : toujours direct
    expect(decisionAppui([], nextAction({ planned: [] }, undefined), '23:00')).toBe('direct');
  });
  it('le bouton simple passe par decisionAppui avant d’enregistrer', () => {
    const src = readFileSync('src/screens/Today.tsx', 'utf8');
    expect(src).toContain("if (relireQuestion() || decisionAppui(di.planned, na, heure) === 'choix') { setFiche('choix'); return; }");
  });
  it('minuterie calée sur le début de la minute suivante', () => {
    const base = Date.UTC(2026, 10, 23, 8, 0, 0);
    expect(msAvantMinuteSuivante(base + 50_000)).toBe(10_050);
    expect(msAvantMinuteSuivante(base)).toBe(60_050);
    expect(msAvantMinuteSuivante(base + 59_999)).toBe(51);
  });
});

describe('T-048 R2 : « +N min payées » donné par le moteur', () => {
  const contrat = (planning: Contract['planning']): Contract => ({
    id: 'c1', child: 'Rose', family: 'Diallo', color: 1, start: '2026-09-01', yearType: 'complete', weeks: 52, weeksOff: [],
    planning, rateNet: 400, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2026-09-01',
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0,
    alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
  });
  const LUNDI = '2026-11-23';
  const r = (pres: Jour['pres']): Jour => ({ key: `c1|${LUNDI}`, cid: 'c1', date: LUNDI, pres });

  it('deux plages, matin non pointé, arrivée notée « À 7 h 30 » à 17:10, départ à 18:35 : chiffre du moteur, pas 605', () => {
    const c = contrat({ 1: [{ start: '07:30', end: '08:30' }, { start: '16:30', end: '18:30' }] });
    const ctx = makeCtx(c, [r([{ a: '07:30' }])], [], LUNDI);
    const ch = choixPointage(dayInfo(ctx, LUNDI).planned, nextAction(dayInfo(ctx, LUNDI), ctx.days.get(LUNDI)), '18:35')!;
    expect(ch).toMatchObject({ kind: 'd', idx: 0, prevue: '08:30', ecartMin: 605 });
    const n = minutesPayeesEnPlus(ctx, LUNDI, ch.idx, '18:35');
    // Moteur : 7:30-18:35 = 665 min de présence, dont 180 dans les plages prévues → 485 en plus ; départ à 8:30 → 0.
    const avec = makeCtx(c, [r([{ a: '07:30', d: '18:35' }])], [], LUNDI);
    const fin = makeCtx(c, [r([{ a: '07:30', d: '08:30' }])], [], LUNDI);
    expect(n).toBe(dayInfo(avec, LUNDI).extraMin - dayInfo(fin, LUNDI).extraMin);
    expect(n).toBe(485);
    expect(textesChoix({ ...ch, payeesMin: n }).maintenant).toBe('Maintenant, 18 h 35 (+485 min payées)');
  });
  it('arrivée à 17:05 après une fin prévue à 17:00, départ à 17:30 : 25 min payées, pas 30', () => {
    const c = contrat({ 1: [{ start: '08:15', end: '17:00' }] });
    const ctx = makeCtx(c, [r([{ a: '17:05' }])], [], LUNDI);
    const ch = choixPointage(dayInfo(ctx, LUNDI).planned, { idx: 0, kind: 'd' }, '17:30')!;
    expect(ch.ecartMin).toBe(30);
    const n = minutesPayeesEnPlus(ctx, LUNDI, 0, '17:30');
    expect(n).toBe(25);
    expect(textesChoix({ ...ch, payeesMin: n }).maintenant).toBe('Maintenant, 17 h 30 (+25 min payées)');
  });
  it('le contexte de l’écran et son cache ne sont pas touchés', () => {
    const c = contrat({ 1: [{ start: '08:15', end: '17:00' }] });
    const ctx = makeCtx(c, [r([{ a: '08:15' }])], [], LUNDI);
    const avant = dayInfo(ctx, LUNDI);
    expect(minutesPayeesEnPlus(ctx, LUNDI, 0, '17:40')).toBe(40);
    expect(dayInfo(ctx, LUNDI)).toBe(avant);
    expect(ctx.days.get(LUNDI)!.pres).toEqual([{ a: '08:15' }]);
  });
  it('départ à l’heure ou sans heure de plus payée : 0, pas de parenthèse', () => {
    const c = contrat({ 1: [{ start: '08:15', end: '17:00' }] });
    const ctx = makeCtx(c, [r([{ a: '08:15' }])], [], LUNDI);
    expect(minutesPayeesEnPlus(ctx, LUNDI, 0, '17:00')).toBe(0);
    expect(minutesPayeesEnPlus(ctx, LUNDI, 1, '17:40')).toBe(0);
  });
});

// ---------- Décision du DG du 21/11/2026 : question sur le matin ----------

describe('T-048 : question sur une plage passée sans pointage', () => {
  const ROSE: Plage[] = [{ start: '07:30', end: '08:30' }, { start: '16:30', end: '18:30' }];
  const q = (planned: Plage[], rec: Jour | undefined, maintenant: string, sautees: number[] = []) =>
    questionPlage(planned, nextAction({ planned }, rec, sautees), rec?.pres, maintenant);

  it('posée seulement quand la fin prévue est passée et qu’une plage prévue suit', () => {
    expect(q(ROSE, undefined, '17:10')).toEqual({ idx: 0, debut: '07:30', fin: '08:30' });
    expect(texteQuestion(q(ROSE, undefined, '17:10')!)).toBe('Plage de 7 h 30 à 8 h 30 : accueil comme prévu ?');
    expect(texteQuestion({ idx: 0, debut: '08:00', fin: '12:00' })).toBe('Plage de 8 h à 12 h : accueil comme prévu ?');
    // Fin prévue pas encore passée (8 h 30 pile) : choix d'arrivée normaux, pas de question
    expect(q(ROSE, undefined, '08:30')).toBeNull();
    expect(q(ROSE, undefined, '08:31')).not.toBeNull();
  });
  it('pas de question avec une seule plage, ni pour un accueil imprévu, ni sur la dernière plage', () => {
    expect(q([{ start: '08:15', end: '17:00' }], undefined, '20:00')).toBeNull();
    expect(q([], undefined, '20:00')).toBeNull();
    // Matin pointé, soir non pointé et passé : dernière plage, pas de question (choix d'arrivée)
    expect(q(ROSE, J({ pres: [{ a: '07:30', d: '08:30' }] }), '19:00')).toBeNull();
    // Arrivée déjà notée sur la plage : départ, pas de question
    expect(q(ROSE, J({ pres: [{ a: '07:30' }] }), '17:10')).toBeNull();
  });
  it('« Oui » enregistre la plage aux heures prévues, au même index', () => {
    expect(pointerPlagePrevue(J({}), 0, ROSE[0], true)).toEqual({ pres: [{ a: '07:30', d: '08:30' }], extra: undefined });
    // Puis la carte passe à la plage du soir, avec ses choix normaux (17:10 : 40 min après 16 h 30)
    const apres = pointerPlagePrevue(J({}), 0, ROSE[0], true);
    expect(nextAction({ planned: ROSE }, apres)).toEqual({ idx: 1, kind: 'a' });
    expect(q(ROSE, apres, '17:10')).toBeNull();
    expect(choixPointage(ROSE, nextAction({ planned: ROSE }, apres), '17:10')).toMatchObject({ kind: 'a', idx: 1, prevue: '16:30' });
    // Le chemin d'écriture : même updateDay, arrivee puis depart, message avec Annuler
    const src = readFileSync('src/screens/Today.tsx', 'utf8');
    expect(src).toContain('await updateDay(c.id, day, (r) => pointerPlagePrevue(r, q.idx, plage, di.planned.length > 0));');
    expect(src).toMatch(/logUsage\('arrivee', 'aujourdhui'\);\s*logUsage\('depart', 'aujourdhui'\);/);
  });
  it('« Non » n’enregistre rien et passe à la plage suivante (seuils compris)', () => {
    const src = readFileSync('src/screens/Today.tsx', 'utf8');
    expect(src).toContain('if (!oui) { onNon?.(q.idx); return; }');
    expect(nextAction({ planned: ROSE }, undefined, [0])).toEqual({ idx: 1, kind: 'a' });
    expect(q(ROSE, undefined, '17:10', [0])).toBeNull();
    // 16:55 : 25 min après 16 h 30, bouton simple ; 17:10 : trois choix
    expect(choixPointage(ROSE, nextAction({ planned: ROSE }, undefined, [0]), '16:55')).toBeNull();
    expect(choixPointage(ROSE, nextAction({ planned: ROSE }, undefined, [0]), '17:10')).toMatchObject({ idx: 1, prevue: '16:30' });
  });
  it('revérification à l’appui : question changée ou disparue, rien n’est enregistré', () => {
    const a = { idx: 0, debut: '07:30', fin: '08:30' };
    expect(memeQuestion(a, { ...a })).toBe(true);
    expect(memeQuestion(a, null)).toBe(false);
    expect(memeQuestion(a, { idx: 1, debut: '16:30', fin: '18:30' })).toBe(false);
    const src = readFileSync('src/screens/Today.tsx', 'utf8');
    expect(src).toContain('if (!memeQuestion(q, relireQuestion())) { setRelu((x) => x + 1); return; }');
  });
});

describe('T-048 : nextAction saute une plage vide quand une plage plus loin est pointée', () => {
  const ROSE: Plage[] = [{ start: '07:30', end: '08:30' }, { start: '16:30', end: '18:30' }];
  it('matin vide, soir arrivé : départ du soir', () => {
    expect(nextAction({ planned: ROSE }, J({ pres: [{}, { a: '17:10' }] }))).toEqual({ idx: 1, kind: 'd' });
    expect(nextAction({ planned: ROSE }, J({ pres: [{}, { a: '17:10', d: '18:30' }] }))).toBeNull();
  });
  it('rien ne change sans plage passée, pour un imprévu, ni pour une seule plage', () => {
    expect(nextAction({ planned: ROSE }, undefined)).toEqual({ idx: 0, kind: 'a' });
    expect(nextAction({ planned: ROSE }, J({ pres: [{ a: '07:30' }] }))).toEqual({ idx: 0, kind: 'd' });
    expect(nextAction({ planned: ROSE }, J({ pres: [{ a: '07:30', d: '08:30' }] }))).toEqual({ idx: 1, kind: 'a' });
    expect(nextAction({ planned: [] }, undefined)).toEqual({ idx: 0, kind: 'a' });
    expect(nextAction({ planned: [] }, J({ pres: [{ a: '10:00' }] }))).toEqual({ idx: 0, kind: 'd' });
    expect(nextAction({ planned: [] }, J({ pres: [{ a: '10:00', d: '11:00' }] }))).toBeNull();
    const UNE: Plage[] = [{ start: '08:15', end: '17:00' }];
    expect(nextAction({ planned: UNE }, undefined)).toEqual({ idx: 0, kind: 'a' });
    expect(nextAction({ planned: UNE }, J({ pres: [{ a: '08:15' }] }))).toEqual({ idx: 0, kind: 'd' });
    expect(nextAction({ planned: UNE }, J({ pres: [{ a: '08:15', d: '17:00' }] }))).toBeNull();
  });
});

describe('T-048 : cas du contrôle qualité (Rose, deux plages, matin non pointé, le soir)', () => {
  const ROSE: Plage[] = [{ start: '07:30', end: '08:30' }, { start: '16:30', end: '18:30' }];
  const LUNDI = '2026-11-23';
  const c: Contract = {
    id: 'c1', child: 'Rose', family: 'Diallo', color: 1, start: '2026-09-01', yearType: 'complete', weeks: 52, weeksOff: [],
    planning: { 1: ROSE }, rateNet: 400, majoration: 10, entretienJour: 0, repasPrix: 0, repasParJour: 0,
    kmTaux: 0, cpMode: 'juin', majoreFiscal: false, trackedFrom: '2026-09-01',
    balances: { cpRestants: 0, cpEnCours: 0, maladieDeduits: 0 }, history: [], createdAt: 0,
    alsaceMoselle: false, planningVariable: false, accueilOccasionnel: false, cdd: false,
  };
  const r = (pres: Jour['pres']): Jour => ({ key: `c1|${LUNDI}`, cid: 'c1', date: LUNDI, pres });
  it('à 17:10, la carte pose la question au lieu de « Arrivée prévue à 7 h 30 »', () => {
    expect(questionPlage(ROSE, nextAction({ planned: ROSE }, undefined), undefined, '17:10')).not.toBeNull();
  });
  it('« Oui » : plus de +480 ; le départ du soir paie seulement ce qui dépasse 18 h 30', () => {
    const apres = pointerPlagePrevue(r(undefined), 0, ROSE[0], true);
    // Arrivée du soir « Maintenant » 17:10, puis départ à 18:35
    const soir = pointerJour(apres, 1, 'a', '17:10', true);
    const ctx = makeCtx(c, [soir], [], LUNDI);
    const na = nextAction(dayInfo(ctx, LUNDI), soir);
    expect(na).toEqual({ idx: 1, kind: 'd' });
    const ch = choixPointage(ROSE, na, '18:46')!;
    expect(ch.prevue).toBe('18:30');
    expect(minutesPayeesEnPlus(ctx, LUNDI, 1, '18:46')).toBe(16);
  });
  it('« Non » : l’arrivée du soir « Maintenant » se note sans fausse erreur, puis le départ du soir', () => {
    const na = nextAction({ planned: ROSE }, undefined, [0])!;
    expect(na).toEqual({ idx: 1, kind: 'a' });
    const ch = choixPointage(ROSE, na, '17:10')!;
    // « Maintenant » pour une arrivée : jamais le message départ/arrivée
    expect(verifierHeure(ch.kind, '17:10', '17:10', undefined)).toBe('');
    const soir = pointerJour(r(undefined), 1, 'a', '17:10', true);
    expect(soir.pres).toEqual([{}, { a: '17:10' }]);
    // Sans le « Non » en mémoire (écran rechargé), la carte ne revient pas au matin : départ du soir
    expect(nextAction({ planned: ROSE }, soir)).toEqual({ idx: 1, kind: 'd' });
    expect(verifierHeure('d', '18:35', '18:35', soir.pres![1].a)).toBe('');
    const ctx = makeCtx(c, [soir], [], LUNDI);
    expect(minutesPayeesEnPlus(ctx, LUNDI, 1, '18:35')).toBe(5);
  });
});

// ---------- Contrôle de la n° 53 : fiche de la journée après « Non » pour le matin ----------

describe('T-048 : fiche de la journée, plage du matin restée vide', () => {
  const ROSE: Plage[] = [{ start: '07:30', end: '08:30' }, { start: '16:30', end: '18:30' }];
  it('matin sans arrivée, soir pointé : le matin s’affiche vide', () => {
    expect(heuresInitiales(ROSE, [{}, { a: '17:10' }], 2)).toEqual([{ a: '', d: '' }, { a: '17:10', d: '18:30' }]);
    expect(heuresInitiales(ROSE, [{}, { a: '17:10', d: '18:35' }], 2)).toEqual([{ a: '', d: '' }, { a: '17:10', d: '18:35' }]);
  });
  it('les autres cas ne changent pas : aucun pointage, plage pointée, une seule plage, imprévu', () => {
    expect(heuresInitiales(ROSE, undefined, 2)).toEqual([{ a: '07:30', d: '08:30' }, { a: '16:30', d: '18:30' }]);
    expect(heuresInitiales(ROSE, [{ a: '07:40' }], 2)).toEqual([{ a: '07:40', d: '08:30' }, { a: '16:30', d: '18:30' }]);
    expect(heuresInitiales(ROSE, [{ a: '07:40', d: '08:35' }, { a: '16:30' }], 2)).toEqual([{ a: '07:40', d: '08:35' }, { a: '16:30', d: '18:30' }]);
    expect(heuresInitiales([{ start: '08:15', end: '17:00' }], undefined, 1)).toEqual([{ a: '08:15', d: '17:00' }]);
    expect(heuresInitiales([], [{ a: '10:00' }], 1)).toEqual([{ a: '10:00', d: '' }]);
    expect(heuresInitiales([], undefined, 1)).toEqual([{ a: '', d: '' }]);
  });
  it('« Enregistrer » sans rien toucher : ni correction, ni présence le matin, et le soir garde son rang', () => {
    const avant = [{}, { a: '17:10' }];
    const form = heuresInitiales(ROSE, avant, 2);
    expect(heureCorrigee(avant, form)).toBe(false);
    const gardees = presencesAGarder(form);
    expect(gardees).toEqual([{}, { a: '17:10', d: '18:30' }]);
    expect(gardees[0].a).toBeUndefined();
    // La carte ne revient pas au matin
    expect(nextAction({ planned: ROSE }, J({ pres: gardees }))).toBeNull();
    expect(nextAction({ planned: ROSE }, J({ pres: [{}, { a: '17:10' }] }))).toEqual({ idx: 1, kind: 'd' });
  });
  it('plages vides en fin de liste retirées ; journée vidée : aucune présence', () => {
    expect(presencesAGarder([{ a: '08:00', d: '12:00' }, { a: '', d: '' }])).toEqual([{ a: '08:00', d: '12:00' }]);
    expect(presencesAGarder([{ a: '', d: '' }, { a: '', d: '' }])).toEqual([]);
    expect(presencesAGarder([{ a: '08:00', d: '' }])).toEqual([{ a: '08:00', d: undefined }]);
  });
  it('« Revenir au planning » remet encore les heures prévues', () => {
    const src = readFileSync('src/screens/Today.tsx', 'utf8');
    expect(src).toContain('onClick={() => setPres(di.planned.map((p) => ({ a: p.start, d: p.end })))}><Icon name="undo" />Revenir au planning');
  });
});
