// Parcours complet automatisé (Playwright + Chromium), 390 × 844, clair puis sombre.
// Usage : VITE_FAKE_CLOUD=http://localhost:4180 npm run build, puis
//   node scripts/fake-cloud.mjs 4180 & node scripts/serve.mjs 4173 & node scripts/e2e.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const base = process.env.BASE || 'http://localhost:4173/pilote-am/';
const out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });
const pdf = path.join(__dirname, '..', 'tests', 'fixtures', 'bulletin-test.pdf');

function assert(cond, msg) {
  if (!cond) throw new Error('ÉCHEC : ' + msg);
  console.log('  ok  ' + msg);
}

async function run(scheme) {
  console.log(`\n== Parcours ${scheme} ==`);
  const b = await chromium.launch();
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, locale: 'fr-FR',
    timezoneId: 'Europe/Paris', hasTouch: true, isMobile: true, acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push(e.message));
  const shot = (n) => p.screenshot({ path: path.join(out, `e2e-${scheme}-${n}.png`) });
  const toastHas = async (re) => { await p.locator('.toast p', { hasText: re }).waitFor({ timeout: 5000 }); return true; };

  await p.goto(base);
  await p.getByRole('heading', { name: 'Arvela' }).waitFor();
  assert(await p.getByRole('button', { name: 'Créer mon compte' }).isVisible(), 'accueil : création de compte proposée');
  await p.getByLabel('Adresse e-mail').fill(`parcours-${scheme}-${Date.now()}@exemple.fr`);
  await p.getByLabel('Mot de passe').fill('motdepasse-solide');
  await p.getByRole('button', { name: 'Créer mon compte' }).click();
  await p.getByRole('button', { name: 'Continuer ici pour l’instant' }).click();
  await p.getByLabel('Ton prénom').fill('Sonia');
  await p.getByRole('button', { name: 'Ajouter un enfant que tu accueilles' }).click();

  // Contrat repris en cours d'année
  await p.getByLabel('Prénom de l’enfant').fill('Lou');
  await p.getByLabel('Nom de la famille').fill('Petit');
  await p.getByLabel('Date de début réelle').fill('2026-09-01');
  await p.getByLabel('Taux horaire net').fill('3,50');
  await p.getByText('Reprise d’un contrat en cours').waitFor();
  await shot('01-contrat');
  await p.getByRole('button', { name: 'Enregistrer et reprendre l’historique' }).click();
  await p.getByText('Indique qui fournit les repas de l’enfant.').waitFor();
  assert(true, 'contrat : choix des repas obligatoire');
  await p.getByRole('radio', { name: /^Les parents/ }).click();
  await p.getByRole('button', { name: 'Enregistrer et reprendre l’historique' }).click();
  await p.getByText('1 mois sans bulletin').waitFor();
  assert(true, 'contrat créé, historique demandé');

  // Import PDF (pdf.js legacy)
  await p.locator('input[type=file]').setInputFiles(pdf);
  await p.getByRole('heading', { name: 'Vérifie le bulletin lu' }).waitFor({ timeout: 15000 });
  assert((await p.getByLabel('Salaire net').inputValue()) === '560,00', 'PDF : salaire net lu (560,00)');
  assert((await p.getByLabel('Salaire brut (si indiqué)').inputValue()) === '717,03', 'PDF : salaire brut lu (717,03)');
  assert((await p.locator('#hm-month').inputValue()) === '2026-09', 'PDF : mois reconnu (septembre 2026)');
  await shot('02-pdf');
  await p.getByRole('button', { name: 'Enregistrer ce mois' }).click();
  await p.getByText('Historique complet.').waitFor();
  assert(true, 'historique complet après import');

  // Pointage en un geste + annulation
  await p.goto(base + '#/');
  const card = p.locator('article.kid', { hasText: 'Lou' });
  await card.getByRole('button', { name: 'Arrivée' }).click();
  assert(await toastHas(/^Arrivée de Lou à/), 'arrivée pointée en un geste');
  await p.locator('.toast').getByRole('button', { name: 'Annuler' }).click();
  await card.getByRole('button', { name: 'Arrivée' }).waitFor();
  assert(true, 'annulation de l’arrivée');
  await card.getByRole('button', { name: 'Arrivée' }).click();
  await card.getByRole('button', { name: 'Départ' }).click();
  assert(await toastHas(/^Départ de Lou/), 'départ pointé en un geste');
  await shot('03-aujourdhui');

  // Absence enfant malade hier (deux gestes : jour, puis enfant)
  const strip = p.locator('.daystrip button');
  await strip.nth(4).click();
  await p.getByRole('button', { name: /Modifier la journée \(Lou\)/ }).click();
  await p.getByRole('radio', { name: /Malade, avec certificat/ }).click();
  await shot('04-journee');
  await p.getByRole('button', { name: 'Enregistrer' }).click();
  await card.getByText('Retenu sur le salaire').waitFor();
  assert(true, 'enfant malade avec certificat : retenu');

  // Absence de l'AM
  await strip.nth(5).click();
  await p.getByRole('button', { name: 'Je serai absente' }).click();
  await p.getByRole('radio', { name: /Événement familial/ }).click();
  await p.getByRole('button', { name: 'Enregistrer' }).click();
  assert(await toastHas(/Événement familial/), 'absence de l’AM enregistrée');

  // Carnet
  await p.getByRole('link', { name: 'Carnet' }).click();
  await p.getByRole('button', { name: 'Repas' }).click();
  await p.getByRole('button', { name: 'A bien mangé' }).click();
  await p.locator('.tl-item', { hasText: 'A bien mangé' }).waitFor();
  assert(true, 'carnet : repas noté');
  await p.getByRole('button', { name: 'Note libre' }).click();
  await p.getByLabel('Ta note').fill('A dessiné un soleil');
  await p.getByRole('button', { name: 'Ajouter la note' }).click();
  await p.locator('.tl-item', { hasText: 'soleil' }).waitFor();
  await shot('05-carnet');
  await p.getByRole('button', { name: 'Envoyer le résumé aux parents' }).click();
  assert(await toastHas(/Résumé copié/), 'résumé copié (pas de feuille de partage dans Chromium)');
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  if (clip) assert(clip.includes('A bien mangé') && clip.includes('Lou'), 'résumé du jour contient le repas');

  // Mois
  await p.getByRole('link', { name: 'Mois' }).click();
  await p.getByRole('heading', { name: 'À déclarer sur Pajemploi' }).waitFor();
  const labels = await p.locator('.decl-label > span:first-child').allTextContents();
  assert(labels[0] === 'Heures normales' && labels[5] === 'Salaire net', 'mois : cases dans l’ordre Pajemploi');
  await shot('06-mois');
  await p.getByRole('button', { name: 'Envoyer au parent' }).click();
  const clip2 = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  if (clip2) assert(clip2.includes('Pajemploi') && clip2.includes('Salaire net'), 'texte pour le parent');

  // Contrôle du bulletin
  await p.getByRole('link', { name: 'Contrôler le bulletin' }).click();
  await p.getByLabel('Salaire net').fill('100,00');
  await p.getByLabel('Salaire brut').fill('200,00');
  await p.getByText('Net et brut incohérents').waitFor();
  assert(true, 'contrôle : incohérence net/brut détectée');
  await shot('07-controle');

  // Ça coince
  await p.getByRole('button', { name: 'Ça coince' }).click();
  await p.getByLabel('Ce qui coince').fill('Lou : je ne trouve pas le bouton pour la sieste');
  await p.getByRole('button', { name: 'Envoyer la remarque' }).click();
  assert(await toastHas(/^Merci/), '« Ça coince » enregistré');

  // Sauvegarde puis restauration
  await p.goto(base + '#/sauvegarde');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Sauvegarder dans Fichiers' }).click()]);
  const file = path.join(out, `sauvegarde-${scheme}.json`);
  await dl.saveAs(file);
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert(backup.format === 'cc-pilote-am-sauvegarde' && backup.data.contracts.length === 1, 'sauvegarde : fichier complet');
  // On abîme les données puis on restaure
  await p.evaluate(async () => {
    const db = await new Promise((r) => { const q = indexedDB.open('pam-donnees'); q.onsuccess = () => r(q.result); });
    await new Promise((r) => { const tx = db.transaction('contracts', 'readwrite'); tx.objectStore('contracts').clear(); tx.oncomplete = r; });
  });
  await p.locator('input[type=file]').setInputFiles(file);
  await p.getByRole('heading', { name: 'Restaurer cette sauvegarde ?' }).waitFor();
  await p.getByRole('button', { name: 'Remplacer par la sauvegarde' }).click();
  await p.getByText('Sauvegarde restaurée.').waitFor();
  await p.goto(base + '#/plus');
  await p.locator('.li-title', { hasText: 'Lou' }).waitFor();
  assert(true, 'restauration : le contrat est revenu');
  // Fichier refusé
  const bad = path.join(out, 'pas-une-sauvegarde.json');
  fs.writeFileSync(bad, '{"hello":1}');
  await p.goto(base + '#/sauvegarde');
  await p.locator('input[type=file]').setInputFiles(bad);
  await p.getByText('Ce fichier n’est pas une sauvegarde d’Arvela.').waitFor();
  assert(true, 'restauration : fichier étranger refusé');

  // Export anonymisé
  await p.goto(base + '#/pilote');
  await p.getByRole('button', { name: /Mois suivant/ }).click();
  const [dl2] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Partager l’export anonymisé' }).click()]);
  const ex = fs.readFileSync(await dl2.path(), 'utf8');
  assert(!/Lou|Petit|Sonia|soleil|bien mangé/.test(ex), 'export : aucun prénom ni note du carnet');
  assert(JSON.parse(ex).enfants[0].enfant === 'A', 'export : enfant renommé A');

  // Écrans annexes
  for (const h of ['conges', 'fin', 'fiscal', 'regles', 'reglages', 'installer']) {
    await p.goto(base + '#/' + h);
    await p.waitForTimeout(200);
  }
  await p.goto(base + '#/fin');
  await shot('08-fin');

  // Hors ligne
  await p.goto(base);
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.waitForTimeout(1500);
  await ctx.setOffline(true);
  await p.reload();
  await p.locator('article.kid', { hasText: 'Lou' }).waitFor({ timeout: 8000 });
  assert(true, 'hors ligne : l’app se recharge sans réseau');
  await ctx.setOffline(false);

  // Horizontal scroll ?
  for (const h of ['', 'carnet', 'mois', 'plus', 'contrat/nouveau', 'conges', 'fin', 'fiscal', 'sauvegarde', 'pilote']) {
    await p.goto(base + '#/' + h);
    await p.waitForTimeout(150);
    const over = await p.evaluate(() => {
      const scrollable = (el) => { for (let x = el.parentElement; x; x = x.parentElement) { const o = getComputedStyle(x).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
      return [...document.querySelectorAll('main *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && !scrollable(el); }).map((el) => el.tagName + '.' + el.className).slice(0, 3);
    });
    assert(over.length === 0, `rien ne dépasse de l’écran (#/${h})` + (over.length ? ' : ' + over.join(', ') : ''));
  }

  // Cibles tactiles >= 44 px
  const small = await p.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('button, a, input, select, textarea, [role=radio]')) {
      const r = el.getBoundingClientRect();
      if (!r.width || el.classList.contains('sr-only')) continue;
      if (r.height < 44 || r.width < 44) bad.push(`${el.tagName} « ${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)} » ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return bad;
  });
  assert(small.length === 0, 'cibles tactiles ≥ 44 px sur #/pilote' + (small.length ? ' : ' + small.join(', ') : ''));

  const real = errors.filter((e) => !/Failed to load resource.*ERR_INTERNET_DISCONNECTED/.test(e));
  assert(real.length === 0, 'aucune erreur de console' + (real.length ? ' : ' + real.join(' | ') : ''));
  await b.close();
}

(async () => {
  try {
    await run('light');
    await run('dark');
    console.log('\nParcours complet : OK');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
})();
