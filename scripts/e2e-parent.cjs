// Parcours automatisé du lien parent, avec le faux service en ligne (scripts/fake-cloud.mjs).
// L'AM crée un lien, les parents l'ouvrent sur un autre appareil avec le code, voient le carnet
// se remplir en direct, puis l'AM coupe le lien. Aucun compte réel n'est créé.
// Usage :
//   VITE_FAKE_CLOUD=http://localhost:4180 npm run build
//   node scripts/fake-cloud.mjs 4180 & node scripts/serve.mjs 4173 & node scripts/e2e-parent.cjs
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

async function phone(b, name) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(base).origin });
  // Un mercredi d'accueil ordinaire, en fin de journée (le carnet a du contenu, le jour a un statut)
  if (process.env.HEURE !== 'reelle') await ctx.clock.setFixedTime(new Date('2026-11-04T16:20:00+01:00'));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  p.shot = (n) => p.screenshot({ path: path.join(out, `parent-${name}-${n}.png`), fullPage: true });
  return { ctx, p, errors };
}

async function axe(p, label) {
  const src = process.env.AXE;
  if (!src) return;
  await p.addScriptTag({ path: src });
  const r = await p.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map((v) => `${v.id}: ${v.nodes.length}`));
  assert(r.length === 0, `accessibilité (${label}) : ${r.length ? r.join(', ') : 'aucun défaut'}`);
}

(async () => {
  await fetch(cloud + '/reset-all', { method: 'POST' });
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const A = await phone(b, 'am');
  const P = await phone(b, 'parents');
  const a = A.p;

  console.log('\n== AM : compte, un enfant ==');
  await a.goto(base);
  await a.getByRole('button', { name: 'Créer mon compte gratuit' }).click();
  await a.getByLabel('Adresse e-mail').fill('sonia@exemple.fr');
  await a.getByLabel('Mot de passe').fill('Motdepasse-solide');
  await a.getByRole('button', { name: 'Créer mon compte' }).click();
  await a.getByRole('button', { name: 'Continuer ici pour l’instant' }).click();
  await a.getByLabel('Ton prénom').fill('Sonia');
  await a.getByRole('button', { name: 'Ajouter un enfant que tu accueilles' }).click();
  await a.getByLabel('Prénom de l’enfant').fill('Lou');
  await a.getByLabel('Nom de la famille').fill('Petit');
  await a.getByLabel('Taux horaire net').fill('3,50');
  await a.getByRole('radio', { name: /^Les parents/ }).click();
  await a.getByRole('button', { name: /^Enregistrer/ }).first().click();
  await a.waitForTimeout(500);
  await a.goto(base + '#/plus');
  await a.locator('a.li', { hasText: 'Lou' }).first().click();
  await a.getByRole('heading', { name: 'Lien pour les parents' }).waitFor();
  await a.getByRole('button', { name: 'Créer le lien' }).click();
  await a.locator('.share-code').waitFor();
  const code = (await a.locator('.share-code').textContent()).trim();
  const url = await a.getByRole('link', { name: 'Voir ce que voient les parents' }).getAttribute('href');
  assert(/^\d{4}$/.test(code), `lien créé, code à 4 chiffres affiché (${code})`);
  assert(!url.includes(code), 'le code n’est pas dans le lien');
  await a.getByRole('button', { name: 'Envoyer le lien aux parents' }).and(a.locator(':enabled')).waitFor();
  await a.locator('section[aria-labelledby="partage-t"]').screenshot({ path: path.join(out, 'parent-am-01-carte-lien.png') });
  await axe(a, 'carte lien AM');

  console.log('\n== AM : une note au carnet ==');
  await a.goto(base + '#/carnet');
  await a.getByRole('region', { name: 'Ajouter au carnet de Lou' }).getByRole('button', { name: 'Repas' }).click();
  await a.getByRole('button', { name: 'A tout mangé' }).click();
  await a.waitForTimeout(2500);

  console.log('\n== Parents : ouverture du lien ==');
  const p = P.p;
  await p.goto(url);
  await p.getByRole('heading', { name: 'Code à 4 chiffres' }).waitFor();
  await p.shot('02-code');
  await axe(p, 'saisie du code');
  const faux = code === '0000' ? '1111' : '0000';
  await p.getByLabel('Code', { exact: true }).fill(faux);
  await p.getByText('Ce code ne correspond pas').waitFor({ timeout: 8000 });
  assert(true, 'mauvais code refusé');
  await p.getByLabel('Code', { exact: true }).fill(code);
  await p.getByRole('heading', { name: 'Lou' }).waitFor({ timeout: 8000 });
  assert(await p.getByText('chez Sonia, assistante maternelle').isVisible(), 'page ouverte avec le bon code : prénom de l’enfant et de l’AM');
  assert(await p.getByText('A tout mangé').isVisible(), 'la note du carnet est visible');
  assert(!(await p.content()).includes('Petit'), 'le nom de la famille n’apparaît pas');
  await p.shot('03-aujourdhui');
  await axe(p, 'parents, aujourd’hui');

  console.log('\n== En direct : nouvelle note de l’AM ==');
  await a.getByRole('region', { name: 'Ajouter au carnet de Lou' }).getByRole('button', { name: 'Sieste' }).click();
  await a.getByRole('button', { name: 'Endormissement' }).click();
  await p.getByText('Endormissement').waitFor({ timeout: 10000 });
  assert(true, 'la sieste apparaît chez les parents sans recharger');
  await p.shot('04-en-direct');

  console.log('\n== Parents : le mois ==');
  await p.getByRole('tab', { name: 'Ce mois' }).click();
  await p.getByRole('heading', { name: 'Votre déclaration Pajemploi' }).waitFor();
  const btn = p.getByRole('button', { name: /^Copier Heures normales/ });
  await btn.click();
  const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  assert(/^\d+$/.test(clip), `copie de la case « Heures normales » sans unité (${clip})`);
  await p.shot('05-mois');
  await axe(p, 'parents, mois');

  console.log('\n== Parents : le code est retenu ==');
  await p.reload();
  await p.getByRole('heading', { name: 'Lou' }).waitFor({ timeout: 8000 });
  assert(true, 'rechargé sans redemander le code');

  console.log('\n== AM : couper le lien ==');
  await a.goto(base + '#/plus');
  await a.locator('a.li', { hasText: 'Lou' }).first().click();
  await a.getByRole('button', { name: 'Couper ce lien' }).click();
  await a.getByRole('button', { name: 'Couper le lien' }).click();
  await a.getByRole('button', { name: 'Créer le lien' }).waitFor();
  await p.getByRole('heading', { name: 'Ce lien n’est plus actif' }).waitFor({ timeout: 10000 });
  assert(true, 'lien coupé : la page des parents se ferme d’elle-même');
  await p.shot('06-coupe');
  assert((await (await fetch(cloud + '/share?id=' + url.split('/p/')[1].split('.')[0])).json()).doc === null, 'plus rien en ligne pour ce lien');

  console.log('\n== Lien resté en ligne sans contrat : effacé au prochain branchement ==');
  const st = await (await fetch(cloud + '/stats')).json();
  const owner = Object.keys(st)[0];
  const orphelin = 'OOOOOOOOOOOOOOOOOOOOOO';
  await fetch(cloud + '/share-put', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: orphelin, owner, v: 'x', iv: 'x', salt: 'x' }) });
  await a.reload();
  await a.waitForTimeout(4000);
  assert((await (await fetch(cloud + '/share?id=' + orphelin)).json()).doc === null, 'lien orphelin effacé en ligne');

  console.log('\n== Lien abîmé ==');
  await p.goto(base + '#/p/abc');
  await p.getByRole('heading', { name: 'Ce lien est incomplet' }).waitFor();
  assert(true, 'lien incomplet expliqué');

  const errs = [...A.errors, ...P.errors];
  assert(errs.length === 0, `aucune erreur dans la console${errs.length ? ' : ' + errs.join(' | ') : ''}`);
  await b.close();
  console.log('\nParcours du lien parent : tout est bon.');
})().catch((e) => { console.error(e); process.exit(1); });
