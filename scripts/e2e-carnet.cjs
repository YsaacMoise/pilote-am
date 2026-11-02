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
  // Heure fixe (jeudi 15 octobre 2026, 15 h 30) : le parcours ne dépend pas du moment où il est lancé
  await ctx.clock.install({ time: new Date('2026-10-15T15:30:00+02:00') });
  await ctx.clock.pauseAt(new Date('2026-10-15T15:30:00+02:00'));
  await ctx.clock.resume();
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
  await p.getByRole('heading', { name: /La journée d/ }).waitFor();
  const titre = (await p.getByRole('heading', { name: /La journée d/ }).textContent()).trim();
  const kid = titre.replace(/^La journée (de |d’)/, '');

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
  await p.getByRole('button', { name: 'Biberon', exact: true }).click();
  await p.getByLabel('Biberon, quantité bue (ml)').fill('180');
  await shot('02-fiche-repas');
  await p.getByRole('button', { name: 'Ajouter le biberon' }).click();
  await tl('Biberon de 180 ml').waitFor();
  assert(true, 'biberon noté en ml');

  // Température : fièvre signalée
  await p.getByRole('button', { name: 'Soin' }).click();
  await p.getByRole('button', { name: 'Prise de température' }).click();
  await p.getByLabel('Température (°C)').fill('38,4');
  await p.getByText('c’est de la fièvre').waitFor();
  await shot('03-fiche-soin');
  await p.getByRole('button', { name: 'Ajouter la température' }).click();
  await tl('Température 38,4 °C').waitFor();
  assert(await p.locator('.tl-item .tag', { hasText: 'Fièvre' }).isVisible(), 'température notée, fièvre signalée');

  // Sommeil en cours (démonstration : endormi à 12h40) : un bandeau en haut du carnet, avec le réveil
  const btnSommeil = p.getByRole('region', { name: /^Ajouter au carnet d/ }).getByRole('button', { name: /^Sommeil/ });
  const dodo = p.getByRole('region', { name: 'En train de dormir' });
  assert(/Adam dort.*depuis 12h40/.test(await dodo.textContent()), 'bandeau « Adam dort depuis 12h40 » en haut du carnet');
  await p.evaluate(() => window.scrollTo(0, 0));
  await shot('00-bandeau-dodo');
  await dodo.getByRole('button', { name: /^Réveil d/ }).click();
  await tl('12h40 à 15h30 (2 h 50)').waitFor();
  assert(await toastHas(/Réveil noté à 15h30/), 'réveil en un geste depuis le bandeau, durée calculée');
  assert(!(await dodo.count()), 'plus personne ne dort : le bandeau disparaît');

  // Choix rapide : sieste de moins de 15 minutes
  await btnSommeil.click();
  await p.getByRole('button', { name: /endort maintenant/ }).waitFor();
  assert(await p.locator('dialog').getByText('Au réveil, touche').isVisible(), 'la fiche dit où se trouve le réveil');
  await shot('04b-fiche-sommeil');
  await p.getByRole('button', { name: 'Sieste rapide (moins de 15 min)' }).click();
  await tl('Sieste rapide (moins de 15 min)').waitFor();
  assert(true, 'choix rapide : sieste de moins de 15 minutes');

  // Sommeil déjà terminé, saisi après coup ; réveil avant l'endormissement refusé
  await btnSommeil.click();
  await p.locator('dialog').getByText('Noter un sommeil déjà terminé').click();
  await p.locator('dialog').getByLabel('Endormissement').fill('10:00');
  await p.locator('dialog').getByLabel('Réveil', { exact: true }).fill('09:30');
  assert(await p.getByText('L’heure du réveil doit être après l’endormissement.').isVisible(), 'réveil avant l’endormissement refusé');
  await p.locator('dialog').getByLabel('Réveil', { exact: true }).fill('10:30');
  await p.getByRole('button', { name: 'Enregistrer le sommeil' }).click();
  await tl('10h00 à 10h30 (30 min)').waitFor();
  assert(true, 'sommeil terminé saisi après coup');

  // S'endort maintenant, en un geste
  await btnSommeil.click();
  await p.getByRole('button', { name: /endort maintenant/ }).click();
  await tl('Dort depuis 15h30').waitFor();
  assert(/Adam dort.*depuis 15h30/.test(await dodo.textContent()), 'endormissement en un geste, le bandeau réapparaît');
  await p.evaluate(() => window.scrollTo(0, 0));
  await shot('01-carnet');

  // Résumé : l'essentiel en tête
  await p.getByRole('button', { name: 'Envoyer le résumé aux parents' }).click();
  await toastHas(/Résumé copié/);
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  assert(clip.includes(titre), 'résumé : prénom de l’enfant (avec l’élision)');
  const l = clip.split('\n');
  const i = (s) => l.findIndex((x) => x.startsWith(s));
  assert(i('Soins :') > 0 && i('Soins :') < i('Sommeil') && i('Sommeil') < i('Repas :'), 'résumé : soins, puis sommeil, puis repas');
  assert(clip.includes('Sommeil : 3 h 20 en tout'), 'résumé : total de sommeil (2 h 50 + 30 min)');
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
