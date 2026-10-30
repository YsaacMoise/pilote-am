// Parcours automatisé du compte et de la copie en ligne, sur deux « téléphones » séparés,
// avec le faux service en ligne (scripts/fake-cloud.mjs). Aucun compte réel n'est créé.
// Usage :
//   VITE_FAKE_CLOUD=http://localhost:4180 npm run build
//   node scripts/fake-cloud.mjs 4180 & node scripts/serve.mjs 4173 & node scripts/e2e-sync.cjs
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const base = process.env.BASE || 'http://localhost:4173/pilote-am/';
const cloud = process.env.CLOUD || 'http://localhost:4180';
const out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });

function assert(cond, msg) {
  if (!cond) throw new Error('ÉCHEC : ' + msg);
  console.log('  ok  ' + msg);
}
const stats = async () => (await fetch(cloud + '/stats')).json();

async function phone(b, name) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  if (process.env.DEBUG) {
    p.on('request', (r) => {
      if (r.url().includes(':4180') && r.method() === 'POST') console.log(`    [${name} POST]`, r.url().split('/').pop(), (r.postData() || '').slice(0, 160));
    });
  }
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p.shot = (n) => p.screenshot({ path: path.join(out, `sync-${name}-${n}.png`) });
  return { ctx, p, errors };
}

(async () => {
  await fetch(cloud + '/reset-all', { method: 'POST' });
  const b = await chromium.launch();
  const A = await phone(b, 'A');
  const B = await phone(b, 'B');
  const email = 'sonia@exemple.fr';
  const pw = 'motdepasse-solide';

  console.log('\n== Téléphone A : création du compte puis premier enfant ==');
  const a = A.p;
  await a.goto(base);
  await a.getByRole('heading', { name: 'Crée ton compte' }).waitFor();
  await a.getByLabel('Adresse e-mail').fill(email);
  await a.getByLabel('Mot de passe').fill('court');
  await a.getByRole('button', { name: 'Créer mon compte' }).click();
  await a.getByText('Le mot de passe doit faire au moins 8 caractères.').waitFor();
  assert(true, 'mot de passe trop court refusé, en français');
  await a.getByLabel('Mot de passe').fill(pw);
  await a.getByRole('button', { name: 'Créer mon compte' }).click();
  await a.getByRole('heading', { name: 'Ton compte est prêt' }).waitFor();
  assert(await a.getByRole('button', { name: /Installer/ }).isVisible(), 'compte créé, bouton Installer proposé ensuite');
  await a.shot('01-compte-pret');
  await a.getByRole('button', { name: 'Continuer ici pour l’instant' }).click();
  await a.getByLabel('Ton prénom').fill('Sonia');
  await a.getByRole('button', { name: 'Ajouter mon premier enfant' }).click();
  await a.getByLabel('Prénom de l’enfant').fill('Lou');
  await a.getByLabel('Nom de la famille').fill('Petit');
  await a.getByLabel('Taux horaire net').fill('3,50');
  await a.getByRole('radio', { name: /^Les parents/ }).click();
  await a.getByRole('button', { name: /^Enregistrer/ }).first().click();
  await a.waitForTimeout(500);
  if (await a.getByRole('button', { name: 'Enregistrer ce mois' }).isVisible().catch(() => false)) await a.goto(base + '#/');
  await a.goto(base + '#/');
  await a.locator('article.kid', { hasText: 'Lou' }).waitFor();
  await a.waitForTimeout(2500);
  let st = await stats();
  const uid = Object.keys(st)[0];
  assert(uid && st[uid].live >= 2, `données envoyées dans le compte (${st[uid]?.live} documents)`);
  await a.goto(base + '#/compte');
  await a.getByText(/^À jour/).waitFor({ timeout: 8000 });
  assert(true, 'écran Compte : « À jour »');
  await a.shot('02-compte-a-jour');

  console.log('\n== Téléphone B : connexion, tout revient ==');
  const p2 = B.p;
  await p2.goto(base);
  await p2.getByRole('button', { name: 'J’ai déjà un compte' }).click();
  await p2.getByLabel('Adresse e-mail').fill(email);
  await p2.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
  await p2.getByRole('button', { name: 'Me connecter' }).click();
  await p2.getByText('Adresse ou mot de passe incorrect.').waitFor();
  assert(true, 'mauvais mot de passe : message clair');
  await p2.getByLabel('Mot de passe').fill(pw);
  await p2.getByRole('button', { name: 'Me connecter' }).click();
  await p2.locator('article.kid', { hasText: 'Lou' }).waitFor({ timeout: 10000 });
  assert(true, 'B : l’enfant créé sur A apparaît, sans repasser par l’accueil');
  await p2.shot('03-b-recupere');

  console.log('\n== Changements en direct entre les deux téléphones ==');
  await p2.goto(base + '#/reglages');
  await p2.getByLabel('Ton prénom').fill('Sonia B');
  await a.goto(base + '#/reglages');
  await a.waitForFunction(() => document.querySelector('input[autocomplete="given-name"]')?.value === 'Sonia B', null, { timeout: 10000 });
  assert(true, 'prénom changé sur B → visible sur A');

  await a.goto(base + '#/');
  const card = a.locator('article.kid', { hasText: 'Lou' });
  await card.getByRole('button', { name: 'Arrivée' }).click();
  await p2.goto(base + '#/');
  await p2.locator('article.kid', { hasText: 'Lou' }).getByRole('button', { name: 'Départ' }).waitFor({ timeout: 10000 });
  assert(true, 'arrivée pointée sur A → visible sur B');

  console.log('\n== Hors ligne ==');
  await A.ctx.setOffline(true);
  await a.goto(base + '#/reglages').catch(() => {});
  await a.getByLabel('Ton prénom').fill('Sonia hors ligne');
  await a.goto(base + '#/compte').catch(() => {});
  await a.getByText(/En attente de réseau|Hors ligne/).waitFor({ timeout: 8000 });
  assert(true, 'hors ligne : l’écran Compte le dit, rien n’est perdu');
  await a.shot('04-hors-ligne');
  await A.ctx.setOffline(false);
  await p2.goto(base + '#/reglages');
  await p2.waitForFunction(() => document.querySelector('input[autocomplete="given-name"]')?.value === 'Sonia hors ligne', null, { timeout: 15000 });
  assert(true, 'retour du réseau : le changement fait hors ligne arrive sur B');

  console.log('\n== Fermeture et réouverture ==');
  await a.close();
  const a2 = await A.ctx.newPage();
  await a2.goto(base + '#/compte');
  await a2.getByText(email).waitFor();
  await a2.getByText(/^À jour/).waitFor({ timeout: 8000 });
  assert(true, 'réouverture : toujours connectée et à jour');

  console.log('\n== Ajout puis suppression d’un enfant, propagés ==');
  const before = (await stats())[uid].live;
  await a2.goto(base + '#/contrat/nouveau');
  await a2.getByLabel('Prénom de l’enfant').fill('Inès');
  await a2.getByLabel('Nom de la famille').fill('Martin');
  await a2.getByLabel('Taux horaire net').fill('3,60');
  await a2.getByRole('radio', { name: /^Les parents/ }).click();
  await a2.getByRole('button', { name: /^Enregistrer/ }).first().click();
  await a2.waitForTimeout(500);
  await p2.goto(base + '#/plus');
  await p2.locator('.li-title', { hasText: 'Inès' }).waitFor({ timeout: 10000 });
  assert(true, 'enfant ajouté sur A → visible sur B');
  await p2.locator('.li-title', { hasText: 'Inès' }).click();
  await p2.getByRole('button', { name: 'Supprimer ce contrat' }).click();
  await a2.goto(base + '#/plus');
  await a2.waitForFunction(() => ![...document.querySelectorAll('.li-title')].some((e) => e.textContent.includes('Inès')), null, { timeout: 10000 });
  assert(true, 'enfant supprimé sur B → disparu sur A');
  const after = (await stats())[uid];
  assert(after.live === before && after.total > before, `suppression gardée en ligne comme « pierre tombale » (${after.total - after.live} marquée)`);

  console.log('\n== Déconnexion sur A ==');
  await a2.goto(base + '#/compte');
  await a2.getByRole('button', { name: 'Me déconnecter' }).click();
  await a2.getByRole('heading', { name: 'Connecte-toi' }).or(a2.getByRole('heading', { name: 'Crée ton compte' })).waitFor();
  await a2.goto(base + '#/');
  await a2.locator('article.kid', { hasText: 'Lou' }).waitFor();
  assert(true, 'déconnectée : les données restent sur le téléphone');

  console.log('\n== Suppression du compte sur B ==');
  await p2.goto(base + '#/compte');
  await p2.getByRole('button', { name: 'Supprimer mon compte' }).click();
  await p2.getByLabel('Ton mot de passe, par sécurité').fill(pw);
  await p2.getByRole('button', { name: 'Supprimer définitivement' }).click();
  await p2.getByRole('heading', { name: 'Crée ton compte' }).waitFor({ timeout: 8000 });
  st = await stats();
  assert(!st[uid], `compte supprimé : plus rien en ligne (avant : ${before} documents)`);
  await p2.goto(base + '#/');
  await p2.locator('article.kid', { hasText: 'Lou' }).waitFor();
  assert(true, 'après suppression du compte : les données restent sur le téléphone');

  const errs = [...A.errors, ...B.errors].filter((e) => !/Failed to fetch|ERR_INTERNET_DISCONNECTED|net::|status of 400/.test(e));
  assert(errs.length === 0, 'aucune erreur dans la console' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  console.log('\nParcours compte et synchronisation : tout est bon.');
})().catch((e) => { console.error(e); process.exit(1); });
