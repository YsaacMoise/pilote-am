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
  // Date fixe : le parcours ne dépend pas du jour où il est lancé (bulletin de test de septembre 2026).
  await ctx.clock.install({ time: new Date('2026-10-15T10:00:00+02:00') });
  await ctx.clock.resume();
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push(e.message));
  const shot = (n) => p.screenshot({ path: path.join(out, `e2e-${scheme}-${n}.png`) });
  const toastHas = async (re) => { await p.locator('.toast p', { hasText: re }).waitFor({ timeout: 5000 }); return true; };
  // En cas d'échec : capture et texte de l'écran, pour voir où le parcours s'est arrêté
  const echec = async () => {
    await p.screenshot({ path: path.join(out, `e2e-${scheme}-ECHEC.png`) }).catch(() => {});
    fs.writeFileSync(path.join(out, `e2e-${scheme}-ECHEC.txt`), await p.locator('body').innerText().catch(() => ''));
  };
  try {

  await p.goto(base);
  const creer = p.getByRole('button', { name: 'Créer mon compte gratuit' }).first();
  await creer.waitFor();
  assert(await creer.isVisible(), 'accueil : création de compte proposée');
  // Conditions d'utilisation lisibles avant le compte, depuis le pied de page, puis retour à l'accueil
  await p.locator('.site-footer').getByRole('link', { name: 'Conditions d’utilisation' }).click();
  await p.getByRole('heading', { name: 'Contrat de traitement des données' }).waitFor();
  assert(await p.locator('.prose-page').getByText(/Mise à jour le \d{1,2} \S+ \d{4}\./).isVisible(), 'conditions d’utilisation : page datée, contrat de traitement présent');
  await p.getByRole('link', { name: 'Retour' }).click();
  await creer.waitFor();
  await creer.click();
  assert(await p.getByRole('link', { name: 'Conditions d’utilisation' }).first().isVisible(), 'création du compte : lien vers les conditions d’utilisation');
  await p.getByLabel('Adresse e-mail').fill(`parcours-${scheme}-${Date.now()}@exemple.fr`);
  await p.getByLabel('Mot de passe', { exact: true }).fill('Motdepasse-solide1');
  await p.getByRole('button', { name: 'Créer mon compte', exact: true }).click();
  await p.getByRole('button', { name: 'Continuer ici pour l’instant' }).click();
  await p.getByLabel('Ton prénom').fill('Sonia');
  await p.getByRole('button', { name: 'Ajouter un enfant que tu accueilles' }).click();

  // Contrat repris en cours d'année
  await p.getByLabel('Prénom de l’enfant').fill('Lou');
  await p.getByLabel('Nom de la famille').fill('Petit');
  // T-107 : l'écran Contrat a changé (T-079, T-031, T-076, T-104) : « Premier jour d'accueil », département, planning,
  // accueil régulier, CDI ou CDD.
  await p.getByLabel('Premier jour d’accueil').fill('2026-09-01');
  await p.getByLabel('Dans quel département accueilles-tu l’enfant ?').fill('31 – Haute-Garonne');
  await p.getByRole('radio', { name: /^Oui, une semaine type qui se répète/ }).click();
  await p.getByRole('radio', { name: /^Régulier/ }).click();
  await p.getByRole('radio', { name: /^CDI/ }).click();
  await p.getByLabel('Taux horaire net').fill('3,50');
  // T-115 (R3) : le brut se calcule seul depuis le net (F2 : 4,49 € redonne 3,50 € net, cotisation par cotisation) ;
  // un lien ouvre le champ brut pour écrire celui du contrat, un autre revient au brut calculé.
  await p.locator('.brut-calcule', { hasText: /Soit 4,49\s€ brut/ }).waitFor();
  assert(true, 'contrat : net 3,50 € saisi, brut 4,49 € affiché sans saisie');
  await p.getByRole('button', { name: 'Mon contrat indique un autre brut' }).click();
  await p.getByLabel('Taux horaire brut').waitFor();
  await p.getByRole('button', { name: 'Revenir au brut calculé' }).click();
  await p.locator('.brut-calcule').waitFor();
  assert(true, 'contrat : champ brut ouvert puis refermé (brut calculé gardé)');
  await p.getByRole('radio', { name: /^Par jour d’accueil/ }).click();
  await p.getByText('Reprise d’un contrat en cours').waitFor();
  // T-119 : contrat commencé avant l'app : Arvela calcule les congés de départ ; l'AM ne donne que les jours déjà pris (0 proposé).
  // Début au 01/09/2025 (droits de la période précédente) : la question est posée, 0 proposé.
  await p.getByLabel('Premier jour d’accueil').fill('2025-09-01');
  const prisAvant = p.getByLabel('Jours de congés déjà pris depuis le 1er juin 2026');
  await prisAvant.waitFor();
  assert((await prisAvant.inputValue()) === '0', 'congés de départ : 0 jour pris proposé d’office');
  await p.getByText('Comment c’est calculé').waitFor();
  assert(true, 'congés de départ : calcul montré (acquis, pris, reste)');
  // Début au 01/09/2026 (après le 1er juin) : aucun droit à prendre, la question n'est pas posée.
  await p.getByLabel('Premier jour d’accueil').fill('2026-09-01');
  await p.getByText('le contrat a commencé après le 1er juin 2026', { exact: false }).waitFor();
  assert(!(await prisAvant.isVisible()), 'congés de départ : pas de question quand aucun droit n’est à prendre');
  await shot('01-contrat');
  // T-119 : la carte des congés de départ allonge l'écran : le bouton est centré avant le clic (sinon sous la barre d'onglets).
  const enregistrer = p.getByRole('button', { name: 'Enregistrer et reprendre l’historique' });
  // Le message de la mesure d'usage (affiché à la création du compte) couvre le bas de l'écran : il part seul, on l'attend.
  await p.locator('.toast', { hasText: 'Pour s’améliorer' }).waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
  await enregistrer.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await enregistrer.click();
  await p.getByText('Indique qui fournit les repas de l’enfant.').waitFor();
  assert(true, 'contrat : choix des repas obligatoire');
  await p.getByRole('radio', { name: /^Les parents/ }).click();
  await enregistrer.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await enregistrer.click();
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

  // T-119 : le mois d'octobre du contrat repris a son montant (plus de mois bloqué faute de solde de congés).
  await p.goto(base + '#/mois');
  await p.locator('.summary .total').first().waitFor();
  assert(!(await p.getByText('Ce mois n’est pas calculé').isVisible()) && !(await p.getByText('Indique ton solde de congés').isVisible()), 'congés de départ : montant du mois affiché, aucune demande de solde');

  // Pointage en un geste + annulation
  await p.goto(base + '#/');
  const card = p.locator('article.kid', { hasText: 'Lou' });
  await card.getByRole('button', { name: /^Arrivée de Lou à/ }).click();
  assert(await toastHas(/^Arrivée de Lou à/), 'arrivée pointée en un geste');
  await p.locator('.toast').getByRole('button', { name: 'Annuler' }).click();
  await card.getByRole('button', { name: /^Arrivée de Lou à/ }).waitFor();
  assert(true, 'annulation de l’arrivée');
  await card.getByRole('button', { name: /^Arrivée de Lou à/ }).click();
  // T-048 : le bouton s'appelle « Départ » (l'heure est celle du moment).
  await card.getByRole('button', { name: 'Départ', exact: true }).click();
  assert(await toastHas(/^Départ de Lou/), 'départ pointé en un geste');
  await shot('03-aujourdhui');

  // Absence enfant malade hier (deux gestes : jour, puis enfant)
  const strip = p.locator('.daystrip button');
  await strip.nth(4).click();
  await p.getByRole('button', { name: /Modifier la journée \(Lou\)/ }).click();
  await p.getByRole('radio', { name: /malade, avec certificat/ }).click();
  await shot('04-journee');
  await p.getByRole('button', { name: 'Enregistrer' }).click();
  await card.getByText('Retenu sur le salaire').waitFor();
  assert(true, 'enfant malade avec certificat : retenu');

  // Absence de l'AM
  await strip.nth(5).click();
  await p.getByRole('button', { name: 'Je serai absente' }).click();
  await p.getByRole('radio', { name: /Événement familial/ }).click();
  // T-023 : l'événement est demandé pour proposer la durée (il n'est pas enregistré).
  await p.getByRole('radio', { name: /^Mon mariage ou mon PACS/ }).click();
  await p.getByRole('button', { name: 'Enregistrer' }).click();
  assert(await toastHas(/Événement familial/), 'absence de l’AM enregistrée');

  // T-115 (R1) : trois semaines en arrière puis retour à aujourd'hui (au-delà de l'ancienne limite de 5 jours).
  // Le contrat de Lou commence le 01/09/2026 : la bande recule jusque-là.
  for (let i = 0; i < 3; i++) await p.getByRole('button', { name: 'Semaine précédente' }).click();
  await p.locator('.daynav-range', { hasText: 'du 19 au 25 septembre' }).waitFor();
  assert((await p.locator('.daystrip button[aria-pressed="true"] .d-num').innerText()) === '24', 'jours : trois semaines en arrière (24 septembre)');
  await shot('04b-trois-semaines');
  await p.getByRole('button', { name: 'Revenir à aujourd’hui' }).click();
  await p.locator('.daystrip button[aria-pressed="true"]', { hasText: 'auj.' }).waitFor();
  assert(true, 'jours : retour à aujourd’hui en un geste');
  for (let i = 0; i < 3; i++) await p.getByRole('button', { name: 'Semaine suivante' }).click();
  await p.locator('.daynav-range', { hasText: 'novembre' }).waitFor();
  assert(true, 'jours : trois semaines en avant, jusqu’en novembre (absence prévue possible)');
  await p.getByRole('button', { name: 'Revenir à aujourd’hui' }).click();

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
  // Biberon en ml
  await p.getByRole('button', { name: 'Repas' }).click();
  await p.getByRole('button', { name: 'Biberon', exact: true }).click();
  await p.getByLabel('Biberon, quantité bue (ml)').fill('180');
  await p.getByRole('button', { name: 'Ajouter le biberon' }).click();
  await p.locator('.tl-item', { hasText: 'Biberon de 180 ml' }).waitFor();
  assert(true, 'carnet : biberon noté en ml');
  // Température : fièvre signalée
  await p.getByRole('button', { name: 'Soin' }).click();
  await p.getByRole('button', { name: 'Prise de température' }).click();
  await p.getByLabel('Température (°C)').fill('38,4');
  await p.getByText('c’est de la fièvre').waitFor();
  await p.getByRole('button', { name: 'Ajouter la température' }).click();
  await p.locator('.tl-item', { hasText: 'Température 38,4 °C' }).waitFor();
  assert(await p.locator('.tl-item .tag', { hasText: 'Fièvre' }).isVisible(), 'carnet : température notée, fièvre signalée');
  // Sieste avec heures de début et de fin
  await p.getByRole('button', { name: 'Sommeil' }).click();
  await p.locator('dialog').getByText('Noter un sommeil déjà terminé').click();
  await p.locator('dialog').getByLabel('Endormissement').fill('13:10');
  await p.locator('dialog').getByLabel('Réveil', { exact: true }).fill('15:05');
  await p.getByRole('button', { name: 'Enregistrer le sommeil' }).click();
  await p.locator('.tl-item', { hasText: '13h10 à 15h05 (1 h 55)' }).waitFor();
  assert(true, 'carnet : sieste avec durée calculée');
  // Modifier une note
  await p.getByRole('button', { name: /^Modifier la note de/ }).filter({ hasText: 'soleil' }).click();
  await p.getByLabel('Texte de la note').fill('A dessiné un grand soleil');
  await p.getByRole('button', { name: 'Enregistrer' }).click();
  await p.locator('.tl-item', { hasText: 'grand soleil' }).waitFor();
  assert(await toastHas(/Note modifiée/), 'carnet : note modifiée sans la recréer');
  await shot('05-carnet');
  await p.getByRole('button', { name: 'Envoyer le résumé aux parents' }).click();
  assert(await toastHas(/Résumé copié/), 'résumé copié (pas de feuille de partage dans Chromium)');
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  if (clip) {
    assert(clip.includes('A bien mangé') && clip.includes('Lou'), 'résumé du jour contient le repas');
    const l = clip.split('\n');
    assert(l.findIndex((x) => x.startsWith('Soins :')) < l.findIndex((x) => x.startsWith('Repas :')), 'résumé : les soins avant les repas');
    assert(clip.includes('Sommeil : 1 h 55 en tout'), 'résumé : total de sommeil');
  }
  // Historique : jour précédent, puis retour
  await p.getByRole('button', { name: 'Jour précédent' }).click();
  await p.getByRole('button', { name: 'Revenir à aujourd’hui' }).waitFor();
  assert(!(await p.locator('.tl-item', { hasText: 'grand soleil' }).count()), 'historique : la veille n’affiche pas les notes du jour');
  await shot('05b-carnet-veille');
  await p.getByRole('button', { name: 'Revenir à aujourd’hui' }).click();
  await p.locator('.tl-item', { hasText: 'grand soleil' }).waitFor();
  assert(true, 'historique : retour à aujourd’hui');

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
  // T-103 (D1, D6) : le brut est contrôlé avec le taux horaire brut du contrat. T-115 (R3) : sans lui, le brut du mois est
  // calculé depuis le net : 200,00 € de brut saisi est très loin du brut calculé, l'écart est signalé.
  await p.getByText('Salaire brut différent').waitFor();
  assert(true, 'contrôle : brut du bulletin comparé au brut calculé depuis le net (sans taux brut au contrat)');
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
  const [dl2] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Partager l’export pseudonymisé' }).click()]);
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
  } catch (e) { await echec(); throw e; }
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
