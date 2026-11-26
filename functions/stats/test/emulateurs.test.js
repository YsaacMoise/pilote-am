// T-127 : totaux justes sur un jeu connu, et aucune écriture, sur les émulateurs Auth et Firestore. Lancer depuis la racine :
//   npx firebase emulators:exec --only auth,firestore --project demo-arvela "node --test functions/stats/test/emulateurs.test.js"
// (ou : cd functions/stats && npm run test:emulateurs). firebase-tools exige Java 21.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { collecter } from '../collecte.js';
import { CLES_EVENEMENT, CLES_PROPRIETES, JOUR_MS, ajouterJours, evenement, jourParis, lundiParis } from '../calcul.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('À lancer avec les émulateurs (FIRESTORE_EMULATOR_HOST et FIREBASE_AUTH_EMULATOR_HOST absents) : jamais sur la vraie base.');
}

const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-arvela' });
const auth = getAuth(app);
const db = getFirestore(app);
const H = 3600 * 1000;
const maintenant = Date.now();
const jour = jourParis(maintenant);
const ts = (ms) => Timestamp.fromMillis(ms);
const iso = (ms) => new Date(ms).toUTCString();

// Comptes du jeu connu. X : compte de test du DG, exclu.
const COMPTES = [
  { uid: 'compteA', email: 'a@exemple.fr', emailVerified: true, creation: maintenant - 2 * H, connexion: maintenant - 1 * H },
  { uid: 'compteB', email: 'b@exemple.fr', emailVerified: false, creation: maintenant - 20 * JOUR_MS, connexion: maintenant - 10 * JOUR_MS },
  { uid: 'compteC', email: 'c@exemple.fr', emailVerified: true, creation: maintenant - 100 * JOUR_MS, connexion: maintenant - 60 * JOUR_MS },
  { uid: 'compteD', email: 'd@exemple.fr', emailVerified: false, creation: maintenant - 400 * JOUR_MS, connexion: null },
  { uid: 'compteE', email: 'e@exemple.fr', emailVerified: false, creation: maintenant - 5 * JOUR_MS, connexion: null },
  { uid: 'compteX', email: 'test@exemple.fr', emailVerified: true, creation: maintenant - 1 * H, connexion: maintenant - 1 * H },
];
const EXCLUS = new Set(['compteX', 'compteInexistant']);

const contrat = (id, champs) => JSON.stringify({ id, child: 'Léo', family: 'Martin', parentEmail: 'parent@exemple.fr', rateNet: 400, ...champs });
const docData = (uid, s, k, v, t) => db.doc(`users/${uid}/data/${s}~${k}`).set({ s, k, v, t: ts(t), d: 'appareil-test' });
const SEL = 'selselselselselselsel_';

async function poserJeu() {
  await auth.importUsers(COMPTES.map((c) => ({
    uid: c.uid, email: c.email, emailVerified: c.emailVerified,
    metadata: { creationTime: iso(c.creation), ...(c.connexion ? { lastSignInTime: iso(c.connexion) } : {}) },
  })));
  // A : un contrat en cours, un fini, un supprimé ; une journée il y a 3 jours ; un repère d'appareil il y a 1 h (sauté).
  await docData('compteA', 'contracts', 'c1', contrat('c1', { start: '2026-01-05' }), maintenant - 40 * JOUR_MS);
  await docData('compteA', 'contracts', 'c2', contrat('c2', { start: '2025-09-01', end: '2026-06-30' }), maintenant - 100 * JOUR_MS);
  await docData('compteA', 'contracts', 'c3', null, maintenant - 50 * JOUR_MS);
  await docData('compteA', 'days', '2026-11-23', '{"in":"08:00"}', maintenant - 3 * JOUR_MS);
  await docData('compteA', 'kv', 'appareil-aaa', '{"v":{"format":2}}', maintenant - 1 * H);
  // B : un contrat qui commence dans 10 jours ; 12 repères récents (plus d'une page) ; une journée il y a 20 jours.
  await docData('compteB', 'contracts', 'b1', contrat('b1', { start: ajouterJours(jour, 10) }), maintenant - 20 * JOUR_MS);
  for (let i = 0; i < 12; i++) await docData('compteB', 'kv', `appareil-b${i}`, '{"v":{"format":2}}', maintenant - 2 * JOUR_MS - i * H);
  await docData('compteB', 'days', '2026-11-06', '{"in":"08:00"}', maintenant - 20 * JOUR_MS - H);
  // C : rien depuis 40 jours, aucun contrat.
  await docData('compteC', 'days', '2026-10-15', '{"in":"08:00"}', maintenant - 40 * JOUR_MS);
  // D : un contrat qui finit aujourd'hui, un autre en cours avec une partie chiffrée ; écrit il y a 1 h.
  await docData('compteD', 'contracts', 'd1', contrat('d1', { start: '2024-09-01', end: jour }), maintenant - 1 * H);
  await docData('compteD', 'contracts', 'd2', contrat('d2', { start: '2025-01-06', sante: { iv: 'iviviviviviviviv', c: 'chiffre', e: 'empreinte' } }), maintenant - 2 * H);
  // E : un contrat illisible (présent, dates inconnues), écrit il y a 5 jours.
  await docData('compteE', 'contracts', 'e1', '{illisible', maintenant - 5 * JOUR_MS);
  // X (exclu) : contrat en cours, journée d'aujourd'hui.
  await docData('compteX', 'contracts', 'x1', contrat('x1', { start: '2026-01-05' }), maintenant - 1 * H);
  await docData('compteX', 'days', jour, '{"in":"08:00"}', maintenant - 1 * H);
  // Liens parents : A un actif et un coupé ; C un actif ; X un actif et un coupé.
  const lien = (owner) => ({ owner, v: 'texte-chiffre', iv: 'iviviviviviviviv', salt: SEL, t: ts(maintenant - JOUR_MS) });
  const coupe = (owner) => ({ owner, revoque: true, t: ts(maintenant - JOUR_MS) });
  await db.doc('partages/lienA1aaaaaaaaaaaaaaaa').set(lien('compteA'));
  await db.doc('partages/lienA2aaaaaaaaaaaaaaaa').set(coupe('compteA'));
  await db.doc('partages/lienC1cccccccccccccccc').set(lien('compteC'));
  await db.doc('partages/lienX1xxxxxxxxxxxxxxxx').set(lien('compteX'));
  await db.doc('partages/lienX2xxxxxxxxxxxxxxxx').set(coupe('compteX'));
}

/** Relevé complet de la base (chemin, date de mise à jour, contenu) et des comptes : il doit être identique avant et après. */
async function releve() {
  const docs = [];
  const parcourir = async (cols) => {
    for (const col of cols) {
      for (const ref of await col.listDocuments()) {
        const s = await ref.get();
        if (s.exists) docs.push([ref.path, s.updateTime.toMillis(), JSON.stringify(s.data())]);
        await parcourir(await ref.listCollections());
      }
    }
  };
  await parcourir(await db.listCollections());
  const comptes = (await auth.listUsers(1000)).users.map((u) => JSON.stringify(u.toJSON()));
  return { docs: docs.sort(), comptes: comptes.sort() };
}

await poserJeu();

test('totaux justes sur le jeu connu, comptes de test exclus', async () => {
  const t = await collecter({ auth, db, maintenant, exclus: EXCLUS });
  assert.equal(t.inscrites_total, 5);
  assert.equal(t.comptes_exclus, 1); // compteInexistant n'est pas un compte : pas compté
  assert.equal(t.nouvelles_1j, 1); // A
  assert.equal(t.nouvelles_7j, 2); // A, E
  assert.equal(t.nouvelles_30j, 3); // A, E, B
  assert.equal(t.connectees_7j, 1); // A
  assert.equal(t.connectees_30j, 2); // A, B
  assert.equal(t.emails_verifies, 2); // A, C
  assert.equal(t.actives_7j, 3); // A (journée, repère sauté), D, E
  assert.equal(t.actives_30j, 4); // + B (journée derrière 12 repères)
  assert.equal(t.comptes_avec_contrat, 4); // A, B, D, E
  assert.equal(t.contrats_en_cours, 3); // A c1, D d1 (finit aujourd'hui), D d2
  assert.equal(t.liens_parents_actifs, 2); // A, C (X exclu, coupés non comptés)
  const attendu = new Map();
  for (const c of COMPTES.filter((c) => !EXCLUS.has(c.uid))) {
    const l = lundiParis(c.creation);
    attendu.set(l, (attendu.get(l) ?? 0) + 1);
  }
  for (const s of t.inscrites_par_semaine) assert.equal(s.nombre, attendu.get(s.lundi) ?? 0, s.lundi);
  assert.equal(t.inscrites_par_semaine.reduce((n, s) => n + s.nombre, 0), 4); // D (400 jours) hors des 26 semaines

  // Liste blanche sur l'événement réel : aucune donnée du jeu ne sort.
  const e = evenement(t, 'phc_test', maintenant);
  assert.deepEqual(Object.keys(e), CLES_EVENEMENT);
  assert.deepEqual(Object.keys(e.properties).sort(), [...CLES_PROPRIETES].sort());
  const texte = JSON.stringify(e);
  for (const c of COMPTES) {
    assert.ok(!texte.includes(c.uid), c.uid);
    assert.ok(!texte.includes(c.email), c.email);
  }
  for (const interdit of ['Léo', 'Martin', 'parent@exemple.fr', 'chiffre', 'appareil', 'lienA1']) assert.ok(!texte.includes(interdit), interdit);
});

test('sans compte exclu : le compte de test est compté', async () => {
  const t = await collecter({ auth, db, maintenant, exclus: new Set() });
  assert.equal(t.inscrites_total, 6);
  assert.equal(t.comptes_exclus, 0);
  assert.equal(t.contrats_en_cours, 4);
  assert.equal(t.liens_parents_actifs, 3);
  assert.equal(t.actives_7j, 4);
});

test('aucune écriture dans Firestore ni dans les comptes', async () => {
  const avant = await releve();
  assert.ok(avant.docs.length >= 27, `jeu posé (${avant.docs.length} documents)`);
  await collecter({ auth, db, maintenant, exclus: EXCLUS });
  await collecter({ auth, db, maintenant, exclus: new Set() });
  const apres = await releve();
  assert.deepEqual(apres, avant);
});
