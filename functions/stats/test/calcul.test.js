// T-127 : tests des calculs purs et de la liste blanche (sans Firebase). Lancer : cd functions/stats && npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CLES_EVENEMENT, CLES_NOMBRES, CLES_PROPRIETES, CLES_SEMAINE, DISTINCT_ID, EVENEMENT, JOUR_MS, SEMAINES, VERSION,
  ajouterJours, contratEnCours, datesContrat, dernierPassage, estRepere, evenement, jourParis, listeExclus, lundiParis, totauxComptes,
} from '../calcul.js';

const H = 3600 * 1000;

test('liste des comptes exclus : virgules, espaces, vide', () => {
  assert.deepEqual([...listeExclus('')], []);
  assert.deepEqual([...listeExclus(undefined)], []);
  assert.deepEqual([...listeExclus(' a1, b2 ;c3\nd4 ')], ['a1', 'b2', 'c3', 'd4']);
});

test('jour et lundi à l’heure de Paris, changements d’heure compris', () => {
  // Dimanche 29/11/2026 23 h 30 UTC = lundi 30/11 0 h 30 à Paris (heure d'hiver, UTC+1).
  assert.equal(jourParis(Date.UTC(2026, 10, 29, 23, 30)), '2026-11-30');
  assert.equal(lundiParis(Date.UTC(2026, 10, 29, 23, 30)), '2026-11-30');
  // Dimanche 29/11/2026 22 h 30 UTC = dimanche 23 h 30 à Paris : semaine du lundi 23/11.
  assert.equal(lundiParis(Date.UTC(2026, 10, 29, 22, 30)), '2026-11-23');
  // Heure d'été : samedi 27/06/2026 22 h 30 UTC = dimanche 28/06 0 h 30 à Paris (UTC+2) ; lundi 22/06.
  assert.equal(jourParis(Date.UTC(2026, 5, 27, 22, 30)), '2026-06-28');
  assert.equal(lundiParis(Date.UTC(2026, 5, 27, 22, 30)), '2026-06-22');
  // Nuit du passage à l'heure d'hiver (dimanche 25/10/2026) : lundi 19/10.
  assert.equal(lundiParis(Date.UTC(2026, 9, 25, 1, 30)), '2026-10-19');
  assert.equal(ajouterJours('2026-03-01', -1), '2026-02-28');
  assert.equal(ajouterJours('2026-12-28', 7), '2027-01-04');
});

test('dernier passage : la plus récente des deux dates connues', () => {
  assert.equal(dernierPassage({ lastSignInTime: 'Thu, 26 Nov 2026 10:00:00 GMT', lastRefreshTime: '2026-11-26T12:00:00.000Z' }), Date.UTC(2026, 10, 26, 12));
  assert.equal(dernierPassage({ lastSignInTime: 'Thu, 26 Nov 2026 10:00:00 GMT', lastRefreshTime: null }), Date.UTC(2026, 10, 26, 10));
  assert.equal(dernierPassage({ lastSignInTime: undefined, lastRefreshTime: '2026-11-20T00:00:00.000Z' }), Date.UTC(2026, 10, 20));
  assert.equal(dernierPassage({}), null);
  assert.equal(dernierPassage(undefined), null);
});

test('totaux des comptes sur un jeu connu', () => {
  const now = Date.UTC(2026, 10, 26, 4, 0); // jeudi 26/11/2026, 5 h à Paris
  const comptes = [
    { creation: now - 2 * H, passage: now - 1 * H, verifie: true }, // nouvelle d'aujourd'hui
    { creation: now - 25 * H, passage: now - 6 * JOUR_MS, verifie: false }, // hier : hors 1 jour, dans 7 jours
    { creation: now - 20 * JOUR_MS, passage: now - 10 * JOUR_MS, verifie: true },
    { creation: now - 30 * JOUR_MS, passage: now - 31 * JOUR_MS, verifie: false }, // limite des 30 jours : comptée
    { creation: now - 200 * JOUR_MS, passage: null, verifie: true }, // hors des 26 semaines
    { creation: null, passage: null, verifie: false }, // date inconnue : comptée au total seulement
  ];
  const t = totauxComptes(comptes, now);
  assert.equal(t.inscrites_total, 6);
  assert.equal(t.nouvelles_1j, 1);
  assert.equal(t.nouvelles_7j, 2);
  assert.equal(t.nouvelles_30j, 4);
  assert.equal(t.connectees_7j, 2);
  assert.equal(t.connectees_30j, 3);
  assert.equal(t.emails_verifies, 3);
  assert.equal(t.inscrites_par_semaine.length, SEMAINES);
  assert.equal(t.inscrites_par_semaine.at(-1).lundi, '2026-11-23');
  assert.equal(t.inscrites_par_semaine[0].lundi, ajouterJours('2026-11-23', -7 * 25));
  // Semaine du 23/11 : les deux premiers ; 06/11 : semaine du 02/11 ; 27/10 : semaine du 26/10.
  const parLundi = Object.fromEntries(t.inscrites_par_semaine.map((s) => [s.lundi, s.nombre]));
  assert.equal(parLundi['2026-11-23'], 2);
  assert.equal(parLundi['2026-11-02'], 1);
  assert.equal(parLundi['2026-10-26'], 1);
  assert.equal(t.inscrites_par_semaine.reduce((n, s) => n + s.nombre, 0), 4);
  for (const s of t.inscrites_par_semaine) assert.deepEqual(Object.keys(s), CLES_SEMAINE);
});

test('repère d’appareil reconnu, données saisies non', () => {
  assert.equal(estRepere('kv~appareil-1a2b3c'), true);
  assert.equal(estRepere('kv~settings'), false);
  assert.equal(estRepere('days~2026-11-26'), false);
  assert.equal(estRepere('contracts~appareil-1'), false);
});

test('dates du contrat : seules start et end sont gardées, la partie chiffrée n’est pas lue', () => {
  assert.equal(datesContrat(null), null);
  assert.equal(datesContrat(undefined), null);
  assert.deepEqual(datesContrat('{pas du json'), { start: undefined, end: undefined });
  assert.deepEqual(datesContrat('null'), { start: undefined, end: undefined });
  const v = JSON.stringify({ id: 'c1', child: 'Léo', family: 'Martin', parentEmail: 'p@exemple.fr', start: '2026-01-05', end: '', sante: { iv: 'x', c: 'y' } });
  const d = datesContrat(v);
  assert.deepEqual(d, { start: '2026-01-05', end: undefined });
  assert.deepEqual(Object.keys(d), ['start', 'end']);
});

test('contrat en cours : même règle que l’app (src/store.ts, activeContracts)', () => {
  const jour = '2026-11-26';
  assert.equal(contratEnCours({ start: '2026-01-05' }, jour), true);
  assert.equal(contratEnCours({ start: '2026-11-26' }, jour), true); // commence aujourd'hui
  assert.equal(contratEnCours({ start: '2026-01-05', end: '2026-11-26' }, jour), true); // finit aujourd'hui
  assert.equal(contratEnCours({ start: '2026-01-05', end: '2026-11-25' }, jour), false); // fini hier
  assert.equal(contratEnCours({ start: '2026-11-27' }, jour), false); // commence demain
  assert.equal(contratEnCours({ start: undefined, end: undefined }, jour), false);
  assert.equal(contratEnCours(null, jour), false);
});

const totauxValides = () => {
  const t = Object.fromEntries(CLES_NOMBRES.map((k, i) => [k, i]));
  t.inscrites_par_semaine = Array.from({ length: SEMAINES }, (_, i) => ({ lundi: ajouterJours('2026-06-01', 7 * i), nombre: i }));
  return t;
};

test('liste blanche : l’événement ne contient que les clés listées', () => {
  const now = Date.UTC(2026, 10, 26, 4);
  const t = { ...totauxValides(), uid: 'secret-uid', email: 'am@exemple.fr', prenom: 'Léa', naissance: '1990-01-01' };
  t.inscrites_par_semaine[0].uid = 'secret-uid';
  const e = evenement(t, 'phc_test', now);
  assert.deepEqual(Object.keys(e), CLES_EVENEMENT);
  assert.deepEqual(Object.keys(e.properties).sort(), [...CLES_PROPRIETES].sort());
  for (const s of e.properties.inscrites_par_semaine) assert.deepEqual(Object.keys(s), CLES_SEMAINE);
  assert.equal(e.event, EVENEMENT);
  assert.equal(e.distinct_id, DISTINCT_ID);
  assert.equal(e.timestamp, '2026-11-26T04:00:00.000Z');
  assert.equal(e.properties.version, VERSION);
  assert.equal(e.properties.$process_person_profile, false);
  assert.equal(e.properties.$geoip_disable, true);
  for (const k of CLES_NOMBRES) assert.ok(Number.isSafeInteger(e.properties[k]) && e.properties[k] >= 0, k);
  const texte = JSON.stringify(e);
  for (const interdit of ['secret-uid', 'am@exemple.fr', 'Léa', '1990-01-01', '"email"', '"prenom"', '"uid"', '"naissance"']) assert.ok(!texte.includes(interdit), interdit);
});

test('liste blanche : un total absent, négatif ou non entier arrête l’envoi', () => {
  const now = Date.UTC(2026, 10, 26, 4);
  for (const mauvais of [undefined, -1, 1.5, '3', NaN, null]) {
    const t = totauxValides();
    t.actives_7j = mauvais;
    assert.throws(() => evenement(t, 'phc_test', now), /Total invalide/);
  }
  const t = totauxValides();
  t.inscrites_par_semaine = t.inscrites_par_semaine.slice(1);
  assert.throws(() => evenement(t, 'phc_test', now), /semaines/);
  const t2 = totauxValides();
  t2.inscrites_par_semaine[3].lundi = 'am@exemple.fr';
  assert.throws(() => evenement(t2, 'phc_test', now), /Semaine invalide/);
});

test('le code serveur ne contient aucun appel d’écriture', () => {
  const ecritures = /\.(set|add|update|delete|create|commit|runTransaction|batch|bulkWriter|recursiveDelete|createUser|updateUser|deleteUser|deleteUsers|importUsers|setCustomUserClaims|revokeRefreshTokens)\s*\(/;
  for (const f of ['../calcul.js', '../collecte.js', '../index.js']) {
    const code = readFileSync(new URL(f, import.meta.url), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    // `parSemaine.set` : table en mémoire du calcul, pas Firebase.
    const lignes = code.split('\n').filter((l) => ecritures.test(l) && !/parSemaine\.set\(/.test(l));
    assert.deepEqual(lignes, [], f);
  }
});
