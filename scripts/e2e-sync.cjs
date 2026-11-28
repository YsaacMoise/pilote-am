// Parcours automatisé du compte et de la copie en ligne, sur deux « téléphones » séparés,
// avec le faux service en ligne (scripts/fake-cloud.mjs). Aucun compte réel n'est créé.
// T-122 : SCHEME=dark pour le parcours en sombre (clair par défaut).
// Usage :
//   VITE_FAKE_CLOUD=http://localhost:4180 npm run build
//   node scripts/fake-cloud.mjs 4180 & node scripts/serve.mjs 4173 & node scripts/e2e-sync.cjs
const { chromium } = require('playwright');
const Assistant = require('./e2e-assistant.cjs');
const path = require('path');
const fs = require('fs');
const base = process.env.BASE || 'http://localhost:4173/pilote-am/';
const cloud = process.env.CLOUD || 'http://localhost:4180';
const out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });

// Attente d'une condition dans la page, par page.evaluate : waitForFunction évalue une chaîne,
// ce que la règle CSP (sans 'unsafe-eval') interdit quand serve.mjs tourne avec CSP=1.
async function attendre(page, fn, timeout) {
  const fin = Date.now() + timeout;
  for (;;) {
    if (await page.evaluate(fn).catch(() => false)) return;
    if (Date.now() > fin) throw new Error('Délai dépassé en attendant : ' + fn.toString());
    await page.waitForTimeout(150);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error('ÉCHEC : ' + msg);
  console.log('  ok  ' + msg);
}
const stats = async () => (await fetch(cloud + '/stats')).json();
const pages = {};

async function phone(b, name) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: process.env.SCHEME === 'dark' ? 'dark' : 'light', locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch: true, isMobile: true });
  // T-122 : le thème suit le parcours (l'app est en version jour par défaut ; « sombre » = version nuit choisie).
  if (process.env.SCHEME === 'dark') await ctx.addInitScript(() => { try { localStorage.setItem('pam-theme', 'dark'); } catch { /* rien */ } });
  // T-112 (constat T-137) : horloge fixée à un jeudi 10 h, Paris, comme boutons.cjs. Sans elle, le parcours échouait le
  // week-end (pas d'accueil prévu, bouton « Imprévu ») et après 17 h 45 (trois choix de départ). L'heure avance ensuite
  // normalement. Date passée exprès : les jetons de connexion de l'émulateur (heure réelle) restent valides. HEURE=reelle : sans.
  if (process.env.HEURE !== 'reelle') { await ctx.clock.install({ time: new Date('2026-11-26T10:00:00+01:00') }); await ctx.clock.resume(); }
  const p = await ctx.newPage();
  pages[name] = p; // T-112 : pour le diagnostic en cas d'échec
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
  const pw = 'Motdepasse-solide';

  console.log('\n== Téléphone A : création du compte puis premier enfant ==');
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
  // T-122 : plus d'écran « Ton compte est prêt » intercalé : profil « Toi », puis l'assistant d'ajout.
  await a.getByRole('heading', { name: 'Toi' }).waitFor();
  assert(true, 'compte créé, profil « Toi » tout de suite (l’installation reste dans Plus)');
  await a.shot('01-compte-pret');
  await Assistant.profil(a);
  await Assistant.ajouterEnfant(a, { prenom: 'Lou', famille: 'Petit', debut: process.env.HEURE === 'reelle' ? `${new Date().toISOString().slice(0, 7)}-01` : '2026-11-02' });
  if (await a.getByRole('button', { name: 'Enregistrer ce mois' }).isVisible().catch(() => false)) await a.goto(base + '#/');
  await a.goto(base + '#/');
  await a.locator('article.kid', { hasText: 'Lou' }).waitFor();
  await a.waitForTimeout(2500);
  // T-122 : l'envoi peut prendre plus de 2,5 s (chiffrement de T-121) : attendu jusqu'à 15 s.
  let st = await stats();
  for (let i = 0; i < 25 && !(Object.keys(st)[0] && st[Object.keys(st)[0]].live >= 2); i++) { await a.waitForTimeout(500); st = await stats(); }
  const uid = Object.keys(st)[0];
  assert(uid && st[uid].live >= 2, `données envoyées dans le compte (${st[uid]?.live} documents)`);
  await a.goto(base + '#/compte');
  await a.getByText(/^À jour/).waitFor({ timeout: 8000 });
  assert(true, 'écran Compte : « À jour »');
  await a.shot('02-compte-a-jour');

  console.log('\n== Téléphone B : connexion, tout revient ==');
  const p2 = B.p;
  await p2.goto(base);
  await p2.locator('.hero-login').getByRole('button', { name: 'Me connecter' }).click();
  await p2.getByLabel('Adresse e-mail').fill(email);
  await p2.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
  await p2.getByRole('button', { name: 'Me connecter' }).click();
  await p2.getByText('Adresse ou mot de passe incorrect.').waitFor();
  assert(true, 'mauvais mot de passe : message clair');
  await p2.getByLabel('Mot de passe').fill(pw);
  await p2.getByRole('button', { name: 'Me connecter' }).click();
  await p2.locator('article.kid', { hasText: 'Lou' }).waitFor({ timeout: 20000 });
  assert(true, 'B : l’enfant créé sur A apparaît, sans repasser par l’accueil');
  await p2.shot('03-b-recupere');

  console.log('\n== Changements en direct entre les deux téléphones ==');
  await p2.goto(base + '#/reglages');
  await p2.getByLabel('Ton prénom').fill('Sonia B');
  await a.goto(base + '#/reglages');
  await attendre(a, () => document.querySelector('input[autocomplete="given-name"]')?.value === 'Sonia B', 10000);
  assert(true, 'prénom changé sur B → visible sur A');

  await a.goto(base + '#/');
  const card = a.locator('article.kid', { hasText: 'Lou' });
  // L'heure réelle peut être loin de l'heure prévue (T-048) : choix « Maintenant » si l'app le propose.
  const maintenant = card.getByRole('button', { name: /^Arrivée de Lou : Maintenant/ });
  if (await maintenant.count()) await maintenant.click(); else await card.getByRole('button', { name: /^Arrivée de Lou à/ }).click();
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
  await attendre(p2, () => document.querySelector('input[autocomplete="given-name"]')?.value === 'Sonia hors ligne', 15000);
  assert(true, 'retour du réseau : le changement fait hors ligne arrive sur B');

  console.log('\n== Fermeture et réouverture ==');
  await a.close();
  const a2 = await A.ctx.newPage();
  await a2.goto(base + '#/compte');
  await a2.getByText(email).first().waitFor();
  await a2.getByText(/^À jour/).waitFor({ timeout: 8000 });
  assert(true, 'réouverture : toujours connectée et à jour');

  console.log('\n== Ajout puis suppression d’un enfant, propagés ==');
  const before = (await stats())[uid].live;
  await a2.goto(base + '#/contrat/nouveau');
  await Assistant.ajouterEnfant(a2, { prenom: 'Inès', famille: 'Martin', debut: process.env.HEURE === 'reelle' ? `${new Date().toISOString().slice(0, 7)}-01` : '2026-11-02', taux: '3,60' });
  await p2.goto(base + '#/plus');
  await p2.locator('.li-title', { hasText: 'Inès' }).waitFor({ timeout: 10000 });
  assert(true, 'enfant ajouté sur A → visible sur B');
  await p2.locator('.li-title', { hasText: 'Inès' }).click();
  await p2.getByRole('link', { name: /^Le contrat/ }).click();
  await p2.getByRole('button', { name: 'Supprimer ce contrat' }).click();
  await a2.goto(base + '#/plus');
  await attendre(a2, () => ![...document.querySelectorAll('.li-title')].some((e) => e.textContent.includes('Inès')), 10000);
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

  console.log('\n== Changements faits déconnectée, puis reconnexion ==');
  await a2.goto(base + '#/reglages');
  await a2.getByLabel('Ton prénom').fill('Sonia déconnectée');
  await a2.waitForTimeout(300);
  await a2.goto(base + '#/compte');
  await a2.getByRole('button', { name: 'J’ai déjà un compte' }).click().catch(() => {});
  await a2.getByLabel('Adresse e-mail').fill(email);
  await a2.getByLabel('Mot de passe').fill(pw);
  await a2.getByRole('button', { name: 'Me connecter' }).click();
  await a2.getByText(/^À jour/).waitFor({ timeout: 10000 });
  await p2.goto(base + '#/reglages');
  await attendre(p2, () => document.querySelector('input[autocomplete="given-name"]')?.value === 'Sonia déconnectée', 10000);
  assert(true, 'changement fait pendant la déconnexion : envoyé à la reconnexion, visible sur B');

  console.log('\n== Troisième téléphone avec ses propres enfants : choix demandé ==');
  const C = await phone(b, 'C');
  const c = C.p;
  // Téléphone utilisé avant l'arrivée des comptes : ses données sont posées directement dans sa base.
  const all = (await (await fetch(`${cloud}/docs?uid=${uid}&since=-1`)).json()).docs;
  const lou = JSON.parse(all.find((d) => d.s === 'contracts' && d.v && d.v.includes('"Lou"')).v);
  const malo = { ...lou, id: 'ancien-malo', child: 'Malo', family: 'Roux', createdAt: 1 };
  await c.goto(base);
  await c.evaluate(async (malo) => {
    const stores = { kv: 'k', contracts: 'id', days: 'key', leaves: 'id', bulletins: 'id', journal: 'id', feedback: 'id', usage: 'id', snapshots: 'id' };
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('pam-donnees', 1);
      r.onupgradeneeded = () => { for (const [s, k] of Object.entries(stores)) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: k }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await new Promise((res) => {
      const tx = db.transaction(['kv', 'contracts'], 'readwrite');
      tx.objectStore('kv').put({ k: 'settings', v: { amName: 'Ancienne', enfantsACharge: 0, onboarded: true } });
      tx.objectStore('contracts').put(malo);
      tx.oncomplete = res;
    });
    db.close();
  }, malo);
  await c.goto(base + '#/compte');
  await c.reload();
  await c.getByRole('button', { name: 'J’ai déjà un compte' }).click();
  await c.getByLabel('Adresse e-mail').fill(email);
  await c.getByLabel('Mot de passe').fill(pw);
  await c.getByRole('button', { name: 'Me connecter' }).click();
  await c.getByRole('heading', { name: 'Ce téléphone et ton compte ont chacun des enfants' }).waitFor({ timeout: 10000 });
  assert(true, 'enfants des deux côtés : le choix est demandé, rien n’est mélangé');
  await c.shot('05-choix');
  const live1 = (await stats())[uid].live;
  const docs1 = JSON.stringify(await (await fetch(`${cloud}/docs?uid=${uid}&since=-1`)).json());
  assert(!JSON.stringify(await (await fetch(`${cloud}/docs?uid=${uid}&since=-1`)).json()).includes('Malo'), 'avant le choix : rien de ce téléphone n’est parti en ligne');
  await c.getByRole('button', { name: 'Garder ce qui est dans mon compte' }).click();
  await c.getByText(/^À jour/).waitFor({ timeout: 10000 });
  await c.goto(base + '#/plus');
  await c.locator('.li-title', { hasText: 'Lou' }).waitFor();
  assert(!(await c.locator('.li-title', { hasText: 'Malo' }).count()), '« garder le compte » : le téléphone a pris les enfants du compte, sans doublon');
  const docs2 = JSON.stringify(await (await fetch(`${cloud}/docs?uid=${uid}&since=-1`)).json());
  // Données de l'AM seulement : la marque d'appareil de T-121 (kv/appareil-…, format de l'app) est écrite à chaque connexion.
  const donnees = (j) => JSON.parse(j).docs.filter((x) => x.v !== null && !(x.s === 'kv' && String(x.k).startsWith('appareil-'))).map((x) => `${x.s}/${x.k}:${x.v}`).sort().join('\n');
  assert(donnees(docs2) === donnees(docs1), 'le compte n’a pas changé (données de l’AM)');

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

  const errs = [...A.errors, ...B.errors, ...C.errors].filter((e) => !/Failed to fetch|ERR_INTERNET_DISCONNECTED|net::|status of 400/.test(e));
  assert(errs.length === 0, 'aucune erreur dans la console' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  console.log('\nParcours compte et synchronisation : tout est bon.');
})().catch(async (e) => { console.error(e); await Assistant.diagnostic(pages, out, 'sync'); process.exit(1); });
