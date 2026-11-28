// T-112, niveau B : parcours du compte et du partage avec le VRAI code Firebase (src/sync/backend-firebase.ts) et les VRAIES
// règles (firestore.rules), sur les émulateurs Auth et Firestore. Projet « demo-arvela » : aucune ressource réelle n'est jointe.
// Tiré de e2e-sync.cjs et e2e-parent.cjs. Données inventées seulement (« Essai »). Aucune donnée de santé.
// Étapes : inscription ; confirmation de l'adresse (code lu dans l'émulateur Auth) ; connexion ; contrat ; pointage et prénom en
// direct entre deux téléphones ; hors ligne puis retour du réseau ; lien parent ; mot de passe oublié ; suppression du compte.
// Usage : bash scripts/robot-parcours.sh emulateurs (construit le site d'essai, lance les émulateurs, puis ce parcours).
const { chromium } = require('playwright');
const Assistant = require('./e2e-assistant.cjs');
const path = require('path');
const fs = require('fs');
const base = process.env.BASE || 'http://localhost:4900/pilote-am/';
const EMU_AUTH = process.env.EMU_AUTH || 'http://127.0.0.1:4905';
const EMU_FS = process.env.EMU_FS || 'http://127.0.0.1:4906';
const PROJET = 'demo-arvela';
const out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });
const pages = {};

function assert(cond, msg) {
  if (!cond) throw new Error('ÉCHEC : ' + msg);
  console.log('  ok  ' + msg);
}

// Lecture directe des émulateurs, comme administrateur (« Bearer owner » : réservé aux émulateurs, hors règles).
const OWNER = { authorization: 'Bearer owner' };
async function json(url, init) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`émulateur : ${r.status} sur ${url}`);
  return r.json();
}
const comptes = async () => (await json(`${EMU_AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJET}/accounts:batchGet?maxResults=100`, { headers: OWNER })).users ?? [];
const codes = async () => (await json(`${EMU_AUTH}/emulator/v1/projects/${PROJET}/oobCodes`)).oobCodes ?? [];
const DOCS = `${EMU_FS}/v1/projects/${PROJET}/databases/(default)/documents`;
async function docsDe(uid) {
  const r = await json(`${DOCS}/users/${uid}/data?pageSize=500`, { headers: OWNER });
  return r.documents ?? [];
}
async function partage(id) {
  const r = await fetch(`${DOCS}/partages/${id}`, { headers: OWNER });
  if (r.status === 404) return null;
  return (await r.json()).fields ?? null;
}
async function attendreQue(f, ms, quoi) {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await f().catch(() => null);
    if (v) return v;
    if (Date.now() > fin) throw new Error('Délai dépassé en attendant : ' + quoi);
    await new Promise((r) => setTimeout(r, 400));
  }
}
async function attendre(page, fn, timeout) {
  const fin = Date.now() + timeout;
  for (;;) {
    if (await page.evaluate(fn).catch(() => false)) return;
    if (Date.now() > fin) throw new Error('Délai dépassé en attendant : ' + fn.toString());
    await page.waitForTimeout(150);
  }
}

async function phone(b, name) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch: true, isMobile: true });
  // Un jeudi 10 h, Paris (comme e2e-sync) : date passée exprès, les jetons des émulateurs (heure réelle) restent valides.
  await ctx.clock.install({ time: new Date('2026-11-26T10:00:00+01:00') });
  await ctx.clock.resume();
  const p = await ctx.newPage();
  pages[name] = p;
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  // Exception nommée : l'image de test du réseau de Firestore (WebChannel, www.google.com/images/cleardot.gif) après la coupure
  // du réseau ; la CSP de firebase.json la bloque aussi sur arvela.fr, et la garde l'aurait bloquée de toute façon.
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::|ERR_INTERNET_DISCONNECTED|Failed to fetch|www\.google\.com\/images\/cleardot\.gif/.test(m.text())) errors.push(m.text()); });
  // Diagnostic (relecteur T-112 : un « Ça n'a pas marché » au lieu de « mot de passe incorrect », 1 passage) :
  // chaque réponse en erreur des émulateurs et chaque avertissement de l'app s'impriment, pour qu'un échec dise sa cause.
  p.on('response', async (r) => {
    if (r.status() < 400 || !/127\.0\.0\.1:490[56]|localhost:490[56]/.test(r.url())) return;
    let corps = '';
    try { corps = (await r.text()).replace(/\s+/g, ' ').slice(0, 300); } catch { /* corps indisponible */ }
    console.log(`  [${name}] réponse ${r.status()} ${r.url().split('?')[0]} ${corps}`);
  });
  p.on('console', (m) => { if (m.type() === 'warning') console.log(`  [${name}] avertissement : ${m.text().slice(0, 300)}`); });
  p.shot = (n) => p.screenshot({ path: path.join(out, `firebase-${name}-${n}.png`) });
  return { ctx, p, errors };
}

(async () => {
  // Émulateurs vidés : chaque passage part de zéro.
  await fetch(`${EMU_AUTH}/emulator/v1/projects/${PROJET}/accounts`, { method: 'DELETE' });
  await fetch(`${EMU_FS}/emulator/v1/projects/${PROJET}/databases/(default)/documents`, { method: 'DELETE' });
  const b = await chromium.launch();
  const A = await phone(b, 'A');
  const B = await phone(b, 'B');
  const email = 'essai.sonia@exemple.fr';
  const pw = 'Essai-Motdepasse-1';
  const pw2 = 'Essai-Nouveau-2';

  console.log('\n== Inscription (téléphone A) ==');
  const a = A.p;
  await a.goto(base);
  await a.getByRole('button', { name: 'Créer mon compte gratuit' }).click();
  await a.getByRole('heading', { name: 'Crée ton compte' }).waitFor();
  await a.getByLabel('Adresse e-mail').fill(email);
  await a.getByLabel('Mot de passe').fill('court');
  await a.getByRole('button', { name: 'Créer mon compte' }).click();
  await a.getByText(/au moins 8 caractères et mélanger 3 types/).waitFor();
  assert(true, 'mot de passe trop faible refusé, en français');
  await a.getByLabel('Mot de passe').fill(pw);
  await a.getByRole('button', { name: 'Créer mon compte' }).click();
  await a.getByRole('heading', { name: 'Toi' }).waitFor({ timeout: 20000 });
  let us = await comptes();
  assert(us.length === 1 && us[0].email === email && !us[0].emailVerified, 'compte créé dans l’émulateur Auth, adresse pas encore confirmée');
  const uid = us[0].localId;

  console.log('\n== Contrat (assistant) ==');
  await Assistant.profil(a, { prenom: 'Essai' });
  await Assistant.ajouterEnfant(a, { prenom: 'Lou', famille: 'Essaifamille', debut: '2026-11-02' });
  await a.goto(base + '#/');
  await a.locator('article.kid', { hasText: 'Lou' }).waitFor();
  const docs1 = await attendreQue(async () => { const d = await docsDe(uid); return d.length >= 2 && d; }, 20000, 'données du compte dans Firestore');
  assert(docs1.length >= 2, `données envoyées dans Firestore sous users/${uid.slice(0, 6)}…/data (${docs1.length} documents), règles réelles`);
  await a.goto(base + '#/compte');
  await a.getByText(/^À jour/).waitFor({ timeout: 10000 });
  assert(await a.getByRole('heading', { name: 'Confirme ton adresse' }).isVisible(), 'écran Compte : « À jour », rappel « Confirme ton adresse »');
  await a.shot('01-compte');

  console.log('\n== Confirmation de l’adresse (lien lu dans l’émulateur Auth) ==');
  const verif = (await codes()).filter((c) => c.email === email && c.requestType === 'VERIFY_EMAIL').pop();
  assert(!!verif?.oobCode, 'e-mail de confirmation demandé à Firebase (code présent dans l’émulateur)');
  const L = await phone(b, 'lien');
  await L.p.goto(base + '?mode=verifyEmail&oobCode=' + encodeURIComponent(verif.oobCode));
  await L.p.getByRole('heading', { name: 'Adresse confirmée' }).waitFor({ timeout: 15000 });
  us = await comptes();
  assert(us[0].emailVerified === true, 'lien ouvert dans un autre navigateur : « Adresse confirmée », compte confirmé dans l’émulateur');
  await L.p.shot('02-adresse-confirmee');
  await L.ctx.close();
  // L'écran Plus est attendu avant de revenir : deux changements d'adresse dans la même milliseconde ne démontaient pas
  // l'écran Compte, qui ne relisait donc pas l'état (1 passage sur 3 en local, relecteur T-112). Une utilisatrice voit Plus.
  await a.goto(base + '#/plus');
  await a.getByRole('link', { name: /Réglages/ }).first().waitFor();
  await a.goto(base + '#/compte');
  await attendre(a, () => !document.getElementById('confirm-t'), 10000);
  assert(true, 'écran Compte de A : le rappel « Confirme ton adresse » a disparu');

  console.log('\n== Connexion (téléphone B) ==');
  const p2 = B.p;
  await p2.goto(base);
  await p2.locator('.hero-login').getByRole('button', { name: 'Me connecter' }).click();
  await p2.getByLabel('Adresse e-mail').fill(email);
  await p2.getByLabel('Mot de passe').fill('Mauvais-Motdepasse-9');
  await p2.getByRole('button', { name: 'Me connecter' }).click();
  await p2.getByText('Adresse ou mot de passe incorrect.').waitFor({ timeout: 15000 });
  assert(true, 'mauvais mot de passe : message clair');
  await p2.getByLabel('Mot de passe').fill(pw);
  await p2.getByRole('button', { name: 'Me connecter' }).click();
  await p2.locator('article.kid', { hasText: 'Lou' }).waitFor({ timeout: 25000 });
  assert(true, 'B : l’enfant créé sur A revient du compte');

  console.log('\n== Synchronisation entre les deux téléphones ==');
  await p2.goto(base + '#/reglages');
  await p2.getByLabel('Ton prénom').fill('Essai B');
  await a.goto(base + '#/reglages');
  await attendre(a, () => document.querySelector('input[autocomplete="given-name"]')?.value === 'Essai B', 15000);
  assert(true, 'prénom changé sur B → visible sur A');
  await a.goto(base + '#/');
  const card = a.locator('article.kid', { hasText: 'Lou' });
  await card.getByRole('button', { name: /^Arrivée de Lou à/ }).click();
  await p2.goto(base + '#/');
  await p2.locator('article.kid', { hasText: 'Lou' }).getByRole('button', { name: 'Départ' }).waitFor({ timeout: 15000 });
  assert(true, 'arrivée pointée sur A → visible sur B');
  await p2.shot('03-pointage-recu');

  console.log('\n== Hors ligne puis retour du réseau ==');
  await A.ctx.setOffline(true);
  await a.goto(base + '#/reglages').catch(() => {});
  await a.getByLabel('Ton prénom').fill('Essai hors ligne');
  await a.goto(base + '#/compte').catch(() => {});
  await a.getByText(/En attente de réseau|Hors ligne/).waitFor({ timeout: 10000 });
  assert(true, 'hors ligne : l’écran Compte le dit');
  await A.ctx.setOffline(false);
  await p2.goto(base + '#/reglages');
  await attendre(p2, () => document.querySelector('input[autocomplete="given-name"]')?.value === 'Essai hors ligne', 25000);
  assert(true, 'retour du réseau : le changement fait hors ligne arrive sur B');

  console.log('\n== Lien parent ==');
  await a.goto(base + '#/plus');
  await a.locator('a.li', { hasText: 'Lou' }).first().click();
  await a.getByRole('link', { name: /^Les parents et leur lien/ }).click();
  await a.getByRole('button', { name: 'Créer le lien' }).click();
  await a.locator('.share-code').waitFor({ timeout: 15000 });
  const code = (await a.locator('.share-code').textContent()).trim();
  const url = await a.getByRole('link', { name: 'Voir ce que voient les parents' }).getAttribute('href');
  const id = url.split('/p/')[1].split('.')[0];
  assert(/^\d{4}$/.test(code) && !url.includes(code), `lien créé, code à 4 chiffres (hors du lien)`);
  const enLigne = await attendreQue(() => partage(id), 15000, 'document du lien dans Firestore');
  assert(enLigne.owner?.stringValue === uid && !!enLigne.v?.stringValue, 'document du lien écrit dans Firestore (chiffré, au nom de l’AM)');
  await a.goto(base + '#/carnet');
  await a.getByRole('region', { name: 'Ajouter au carnet de Lou' }).getByRole('button', { name: 'Repas' }).click();
  await a.getByRole('button', { name: 'A tout mangé' }).click();
  const P = await phone(b, 'parents');
  const pp = P.p;
  await pp.goto(url);
  await pp.getByRole('heading', { name: 'Code à 4 chiffres' }).waitFor({ timeout: 15000 });
  await pp.getByLabel('Code', { exact: true }).fill(code === '0000' ? '1111' : '0000');
  await pp.getByText('Ce code ne correspond pas').waitFor({ timeout: 10000 });
  assert(true, 'parents : mauvais code refusé');
  await pp.getByLabel('Code', { exact: true }).fill(code);
  await pp.getByRole('heading', { name: 'Lou' }).waitFor({ timeout: 15000 });
  await pp.getByText('A tout mangé').waitFor({ timeout: 15000 });
  assert(!(await pp.content()).includes('Essaifamille'), 'parents : page ouverte avec le bon code, note du carnet lue depuis Firestore, nom de famille absent');
  await pp.shot('04-page-parents');
  await a.getByRole('region', { name: 'Ajouter au carnet de Lou' }).getByRole('button', { name: /^Sommeil/ }).click();
  await a.getByRole('button', { name: /endort maintenant/ }).click();
  await pp.getByText(/Dort depuis \d\dh\d\d/).waitFor({ timeout: 15000 });
  assert(true, 'parents : la sieste arrive en direct, sans recharger');
  await a.goto(base + '#/plus');
  await a.locator('a.li', { hasText: 'Lou' }).first().click();
  await a.getByRole('link', { name: /^Les parents et leur lien/ }).click();
  await a.getByRole('button', { name: 'Couper ce lien' }).click();
  await a.getByRole('button', { name: 'Couper le lien' }).click();
  await pp.getByRole('heading', { name: 'Ce lien n’est plus actif' }).waitFor({ timeout: 15000 });
  const coupe = await partage(id);
  assert(coupe?.revoque?.booleanValue === true && !coupe.v, 'lien coupé : page des parents fermée, pierre tombale sans contenu dans Firestore');

  console.log('\n== Mot de passe oublié (troisième téléphone) ==');
  const R = await phone(b, 'R');
  const r = R.p;
  await r.goto(base);
  await r.locator('.hero-login').getByRole('button', { name: 'Me connecter' }).click();
  await r.getByRole('button', { name: 'Mot de passe oublié' }).click();
  await r.getByLabel('Adresse e-mail').fill(email);
  await r.getByRole('button', { name: 'Recevoir un lien par e-mail' }).click();
  await r.getByText(/un e-mail vient de partir/).waitFor({ timeout: 15000 });
  const reset = await attendreQue(async () => (await codes()).filter((c) => c.email === email && c.requestType === 'PASSWORD_RESET').pop(), 10000, 'code de réinitialisation');
  assert(!!reset.oobCode, 'demande de nouveau mot de passe reçue par Firebase (code présent dans l’émulateur)');
  await r.goto(base + '?mode=resetPassword&oobCode=' + encodeURIComponent(reset.oobCode));
  await r.getByRole('heading', { name: 'Choisis un nouveau mot de passe' }).waitFor({ timeout: 15000 });
  assert(await r.getByText(email).isVisible(), 'lien ouvert : l’adresse du compte est rappelée');
  await r.getByLabel('Nouveau mot de passe').fill(pw2);
  await r.getByRole('button', { name: 'Enregistrer le mot de passe' }).click();
  await r.getByRole('heading', { name: 'C’est fait' }).waitFor({ timeout: 15000 });
  await r.getByRole('button', { name: 'Me connecter' }).click();
  await r.getByLabel('Mot de passe').waitFor({ timeout: 15000 });
  assert((await r.getByLabel('Adresse e-mail').inputValue()) === email, 'connexion ouverte avec l’adresse déjà remplie');
  await r.getByLabel('Mot de passe').fill(pw);
  await r.getByRole('button', { name: 'Me connecter' }).click();
  await r.getByText('Adresse ou mot de passe incorrect.').waitFor({ timeout: 15000 });
  assert(true, 'l’ancien mot de passe est refusé');
  await r.getByLabel('Mot de passe').fill(pw2);
  await r.getByRole('button', { name: 'Me connecter' }).click();
  await r.locator('article.kid', { hasText: 'Lou' }).waitFor({ timeout: 25000 });
  assert(true, 'connexion avec le nouveau mot de passe : les données reviennent');

  console.log('\n== Suppression du compte (téléphone R) ==');
  await r.goto(base + '#/compte');
  await r.getByRole('button', { name: 'Supprimer mon compte' }).click();
  await r.getByLabel('Ton mot de passe, par sécurité').fill(pw2);
  await r.getByRole('button', { name: 'Supprimer définitivement' }).click();
  await r.getByRole('heading', { name: 'Crée ton compte' }).waitFor({ timeout: 20000 });
  assert((await docsDe(uid)).length === 0, 'plus aucune donnée du compte dans Firestore');
  assert((await comptes()).length === 0, 'compte effacé de l’émulateur Auth');
  const tombe = await partage(id);
  assert(tombe?.revoque?.booleanValue === true && !tombe.v, 'le lien des parents reste une pierre tombale (identifiant gardé, sans contenu)');
  await r.goto(base + '#/');
  await r.locator('article.kid', { hasText: 'Lou' }).waitFor();
  assert(true, 'après suppression du compte : les données restent sur le téléphone');

  const errs = [...A.errors, ...B.errors, ...P.errors, ...R.errors];
  assert(errs.length === 0, 'aucune erreur dans la console' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  console.log('\nParcours Firebase (émulateurs) : tout est bon.');
})().catch(async (e) => { console.error(e); await Assistant.diagnostic(pages, out, 'firebase'); process.exit(1); });
