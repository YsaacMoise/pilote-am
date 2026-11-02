// Parcours du carnet (Playwright + Chromium, 390 × 844), en passant par le mode démonstration.
// Usage : npm run build, puis node scripts/serve.mjs 4173 & node scripts/e2e-carnet.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const base = process.env.BASE || 'http://localhost:4173/pilote-am/';
const out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });

function assert(cond, msg) {
  if (!cond) throw new Error('ÉCHEC : ' + msg);
  console.log('  ok  ' + msg);
}

async function run(scheme) {
  console.log(`\n== Carnet, ${scheme} ==`);
  const b = await chromium.launch();
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, locale: 'fr-FR',
    timezoneId: 'Europe/Paris', hasTouch: true, isMobile: true, permissions: ['clipboard-read', 'clipboard-write'],
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push(e.message));
  const shot = (n) => p.screenshot({ path: path.join(out, `carnet-${scheme}-${n}.png`) });
  const toastHas = async (re) => { await p.locator('.toast p', { hasText: re }).waitFor({ timeout: 5000 }); return true; };
  const tl = (txt) => p.locator('.tl-item', { hasText: txt });

  await p.goto(base);
  await p.getByRole('button', { name: 'Essayer avec des enfants fictifs' }).first().click();
  const seule = p.getByRole('button', { name: 'Explorer seule' });
  await seule.waitFor({ timeout: 8000 }).then(() => seule.click()).catch(() => {});
  await p.getByRole('link', { name: 'Carnet' }).click();
  await p.getByRole('heading', { name: /La journée de/ }).waitFor();
  const kid = (await p.getByRole('heading', { name: /La journée de/ }).textContent()).replace('La journée de ', '').trim();

  // Note libre, puis modification
  await p.getByRole('button', { name: 'Note libre' }).click();
  await p.getByLabel('Ta note').fill('A dessiné un soleil');
  await p.getByRole('button', { name: 'Ajouter la note' }).click();
  await tl('soleil').waitFor();
  await p.getByRole('button', { name: /^Modifier la note de/ }).filter({ hasText: 'soleil' }).click();
  await p.getByLabel('Texte de la note').fill('A dessiné un grand soleil');
  await p.getByRole('button', { name: 'Enregistrer' }).click();
  await tl('grand soleil').waitFor();
  assert(await toastHas(/Note modifiée/), 'note modifiée sans la recréer');
  assert((await tl('soleil').count()) === 1, 'une seule note après modification');

  // Biberon en ml
  await p.getByRole('button', { name: 'Repas' }).click();
  await p.getByLabel('Biberon, quantité bue (ml)').fill('180');
  await shot('02-fiche-repas');
  await p.getByRole('button', { name: 'Ajouter le biberon' }).click();
  await tl('Biberon de 180 ml').waitFor();
  assert(true, 'biberon noté en ml');

  // Température : fièvre signalée
  await p.getByRole('button', { name: 'Soin' }).click();
  await p.getByLabel('Température (°C)').fill('38,4');
  await p.getByText('c’est de la fièvre').waitFor();
  await shot('03-fiche-soin');
  await p.getByRole('button', { name: 'Ajouter la température' }).click();
  await tl('Température 38,4 °C').waitFor();
  assert(await p.locator('.tl-item .tag', { hasText: 'Fièvre' }).isVisible(), 'température notée, fièvre signalée');

  // Sieste avec début et fin ; réveil avant l'endormissement refusé
  await p.getByRole('button', { name: 'Sieste' }).click();
  await p.locator('dialog').getByLabel('Endormissement').fill('15:30');
  await p.locator('dialog').getByLabel(/^Réveil/).fill('15:00');
  assert(await p.getByText('L’heure du réveil doit être après l’endormissement.').isVisible(), 'réveil avant l’endormissement refusé');
  await p.locator('dialog').getByLabel('Endormissement').fill('13:10');
  await p.locator('dialog').getByLabel(/^Réveil/).fill('15:05');
  await shot('04-fiche-sieste');
  await p.getByRole('button', { name: 'Enregistrer la sieste' }).click();
  await tl('13h10 à 15h05 (1 h 55)').waitFor();
  assert(true, 'sieste avec durée calculée');

  // Sieste en cours (données de démonstration) : terminée en la modifiant
  const enCours = tl('Dort depuis');
  if (await enCours.count()) {
    assert(await enCours.getByRole('button', { name: /^Réveil de/ }).isVisible(), 'sieste en cours : bouton Réveil');
    await enCours.getByRole('button', { name: /^Modifier la note de/ }).click();
    await p.locator('dialog').getByLabel(/^Réveil/).fill('14:10');
    await p.getByRole('button', { name: 'Enregistrer' }).click();
    await tl('12h40 à 14h10 (1 h 30)').waitFor();
    assert(true, 'sieste en cours terminée par modification');
  }
  await p.evaluate(() => window.scrollTo(0, 0));
  await shot('01-carnet');

  // Résumé : l'essentiel en tête
  await p.getByRole('button', { name: 'Envoyer le résumé aux parents' }).click();
  await toastHas(/Résumé copié/);
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  assert(clip.includes(`La journée de ${kid}`), 'résumé : prénom de l’enfant');
  const l = clip.split('\n');
  const i = (s) => l.findIndex((x) => x.startsWith(s));
  assert(i('Soins :') > 0 && i('Soins :') < i('Sieste') && i('Sieste') < i('Repas :'), 'résumé : soins, puis sieste, puis repas');
  assert(/Sieste : \d+ h( \d\d)? en tout/.test(clip), 'résumé : total de sieste');
  fs.writeFileSync(path.join(out, `carnet-${scheme}-resume.txt`), clip);

  // Historique : jour précédent, note ajoutée ce jour-là, retour
  await p.getByRole('button', { name: 'Jour précédent' }).click();
  await p.getByRole('button', { name: 'Revenir à aujourd’hui' }).waitFor();
  assert(!(await tl('grand soleil').count()), 'veille : les notes du jour n’y sont pas');
  await p.getByRole('button', { name: 'Humeur' }).click();
  await p.getByRole('button', { name: 'Calme' }).click();
  await tl('Calme').waitFor();
  assert(true, 'note ajoutée à la veille');
  await shot('05-veille');
  await p.getByRole('button', { name: 'Revenir à aujourd’hui' }).click();
  await tl('grand soleil').waitFor();
  assert(!(await tl('Calme').count()), 'retour à aujourd’hui : la note de la veille reste à la veille');
  assert(await p.getByRole('button', { name: 'Jour suivant' }).isDisabled(), 'pas de jour futur');

  // Mise en page : rien ne dépasse, cibles tactiles d'au moins 44 px
  const debord = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert(!debord, 'rien ne dépasse de l’écran');
  const petites = await p.evaluate(() => [...document.querySelectorAll('main button, main a')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 44 || r.width < 44); })
    .map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 40)));
  assert(!petites.length, 'cibles de 44 px au moins' + (petites.length ? ' : ' + petites.join(', ') : ''));
  assert(!errors.length, 'zéro erreur de console' + (errors.length ? ' : ' + errors.join(' | ') : ''));
  await b.close();
}

(async () => {
  for (const s of ['light', 'dark']) await run(s);
  console.log('\nCarnet : tout est bon.');
})().catch((e) => { console.error(e.message); process.exit(1); });
