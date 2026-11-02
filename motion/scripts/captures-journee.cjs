// Scénario de capture « une journée d'Adam » : un vrai compte (Sonia), un vrai lien pour les parents, mis à jour en direct.
// Sert à la vidéo d'accueil, à la vidéo des parents et aux aides Aujourd'hui, Carnet et Inviter.
// Chaque état est photographié (avant, feuille ouverte, après) et la position de chaque élément utile est mesurée :
// aucune position écrite à la main dans les vidéos.
// Demande : scripts/fake-cloud.mjs (CLOUD) et l'app construite avec VITE_FAKE_CLOUD, servie à BASE_FAKE.
const fs = require('fs');
const path = require('path');
const { navigateur, telephone, rect, scenario, allerA, masquer, terminer } = require('./lib-captures.cjs');

const OUT = process.env.OUT || path.join(__dirname, '../public/ecrans/journee/');
const BASE_FAKE = process.env.BASE_FAKE || 'http://localhost:4175/';
const CLOUD = process.env.CLOUD || 'http://localhost:4180';
const J = {};
let pages = [];
const etape = scenario('journée d’Adam', OUT, () => pages);
const heure = (ctx, h) => ctx.clock.setFixedTime(new Date(`2026-11-04T${h}:00+01:00`));
// Les partages (résumé, lien) sont interceptés : on garde le texte envoyé
const intercepterPartage = (ctx) => ctx.addInitScript(() => {
  window.__partages = [];
  Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => { window.__partages.push(d); } });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
});
const dernierPartage = async (p) => p.evaluate(() => { const d = window.__partages.slice(-1)[0]; return d ? (d.text ?? d.url ?? '') : ''; });

terminer((async () => {
  const br = await navigateur();
  await fetch(CLOUD + '/reset-all', { method: 'POST' });
  const { ctx, p } = await telephone(br, '2026-11-04T07:50:00+01:00');
  await intercepterPartage(ctx);
  pages = [p];
  const shot = (page, n) => page.screenshot({ path: OUT + n + '.png' });

  await etape('Créer le compte de Sonia', async () => {
    await p.goto(BASE_FAKE);
    await p.getByRole('button', { name: 'Créer mon compte gratuit' }).click();
    await p.getByLabel('Adresse e-mail').fill('sonia@exemple.fr');
    await p.getByLabel('Mot de passe', { exact: true }).fill('Motdepasse-solide1');
    await p.getByRole('button', { name: 'Créer mon compte', exact: true }).click();
    await p.getByRole('button', { name: 'Continuer ici pour l’instant' }).click();
    await p.getByLabel('Ton prénom').fill('Sonia');
  });
  await etape('Ajouter Adam', async () => {
    await p.getByRole('button', { name: 'Ajouter un enfant que tu accueilles' }).click();
    await p.getByLabel('Prénom de l’enfant').fill('Adam');
    await p.getByLabel('Nom de la famille').fill('Martin');
    await p.getByLabel('Taux horaire net').fill('3,90');
    await p.getByRole('radio', { name: /^Les parents/ }).click();
    await p.getByRole('button', { name: /^Enregistrer/ }).first().click();
    await p.waitForTimeout(700);
    await masquer(p);
  });

  // Aide « Inviter » : Plus → fiche d'Adam → Créer le lien → code et envoi
  const { code, url } = await etape('Plus → fiche d’Adam → Créer le lien', async () => {
    await allerA(p, '#/plus');
    await shot(p, 'i-plus');
    J.iTabPlus = await rect(p.locator('.tabbar a').nth(3));
    J.iAdam = await rect(p.locator('a.li', { hasText: 'Adam' }));
    await p.locator('a.li', { hasText: 'Adam' }).first().click(); await p.waitForTimeout(900);
    await p.evaluate(() => scrollTo(0, 0));
    await shot(p, 'i-fiche');
    const carte = p.locator('section[aria-labelledby="partage-t"]');
    await carte.scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, -90)); await p.waitForTimeout(300);
    await shot(p, 'i-lien-0');
    J.iCarte0 = await rect(carte);
    J.iCreer = await rect(p.getByRole('button', { name: 'Créer le lien' }));
    await p.getByRole('button', { name: 'Créer le lien' }).click();
    await p.locator('.share-code').waitFor();
    await p.getByRole('button', { name: 'Envoyer le lien aux parents' }).and(p.locator(':enabled')).waitFor();
    await p.waitForTimeout(2500);
    await p.evaluate(() => { const e = document.querySelector('.share-url'); if (e) e.textContent = e.textContent.replace(/^[^/]+/, 'arvela.fr'); });
    await carte.scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, -90)); await p.waitForTimeout(300);
    await shot(p, 'i-lien-1');
    J.iCarte1 = await rect(carte);
    J.iCode = await rect(p.locator('.share-code'));
    J.iEnvoyer = await rect(p.getByRole('button', { name: 'Envoyer le lien aux parents' }));
    const c = (await p.locator('.share-code').textContent()).trim();
    const u = await p.getByRole('link', { name: 'Voir ce que voient les parents' }).getAttribute('href');
    await p.getByRole('button', { name: 'Envoyer le lien aux parents' }).click(); await p.waitForTimeout(400);
    J.texteLien = await dernierPartage(p);
    J.code = c;
    return { code: c, url: u };
  });

  const P = await telephone(br, '2026-11-04T07:59:00+01:00');
  const q = P.p;
  await P.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE_FAKE).origin });
  pages = [p, q];
  await etape('Parents : ouvrir le lien, taper le code', async () => {
    await q.goto(url); await q.getByRole('heading', { name: 'Code à 4 chiffres' }).waitFor();
    await masquer(q); await q.waitForTimeout(300);
    await shot(q, 'p-code-0');
    J.pCode = await rect(q.getByLabel('Code', { exact: true }));
    await q.getByLabel('Code', { exact: true }).fill(code.slice(0, 3)); await q.waitForTimeout(200);
    await shot(q, 'p-code-1');
    await q.getByLabel('Code', { exact: true }).fill(code);
    await q.getByRole('heading', { name: 'Adam' }).waitFor(); await q.waitForTimeout(600);
    await masquer(q);
    await shot(q, 'p-vide');
  });
  // Attendre qu'une ligne arrive chez le parent (mise à jour en direct, sinon rechargement de la page)
  const attendre = async (texte, h) => {
    await heure(P.ctx, h);
    try { await q.getByText(texte, { exact: true }).first().waitFor({ timeout: 6000 }); }
    catch { await q.reload(); await q.getByLabel('Code', { exact: true }).fill(code).catch(() => {}); await q.getByText(texte, { exact: true }).first().waitFor(); }
    await masquer(q);
    await q.waitForTimeout(700);
  };
  const parent = async (k) => {
    const carte = q.locator('section[aria-labelledby="auj-t"]');
    J[k + 'carte'] = await rect(carte);
    J[k + 'ligne'] = await rect(carte.locator('.ev').last());
    J[k + 'direct'] = await rect(q.locator('.live-dot'));
  };

  await etape('08 h 00 · Adam arrive (Aujourd’hui → Arrivée)', async () => {
    await heure(ctx, '08:00'); await allerA(p, '#/');
    const carte = p.locator('article.kid', { hasText: 'Adam' });
    await shot(p, 'a-auj-0');
    J.aArrivee = await rect(carte.getByRole('button', { name: /Arrivée/ }));
    J.aCarteAuj = await rect(carte);
    await carte.getByRole('button', { name: /Arrivée/ }).click(); await p.waitForTimeout(600);
    await shot(p, 'a-auj-1');
    J.aTagArrivee = await rect(carte.getByText(/^Arrivée \d/));
  });
  await etape('08 h 00 · l’arrivée apparaît chez les parents', async () => { await attendre('Arrivée', '08:00'); await shot(q, 'p-0'); await parent('p0'); });

  const tuiles = p.getByRole('region', { name: 'Ajouter au carnet d’Adam' });
  await etape('11 h 50 · Carnet → Repas → « A bien mangé »', async () => {
    await heure(ctx, '11:50'); await allerA(p, '#/carnet');
    await shot(p, 'a-carnet-0');
    J.aChipAdam = await rect(p.getByRole('group', { name: 'Enfant' }).getByRole('button', { name: /Adam/ })).catch(() => null);
    J.aTuiles = await rect(tuiles);
    J.aRepas = await rect(tuiles.getByRole('button', { name: 'Repas' }));
    J.aSommeil = await rect(tuiles.getByRole('button', { name: /^Sommeil/ }));
    J.aCarte0 = await rect(p.locator('section[aria-labelledby="tl-title"]'));
    await tuiles.getByRole('button', { name: 'Repas' }).click(); await p.waitForTimeout(800);
    await shot(p, 'a-repas');
    J.aRepasFeuille = await rect(p.locator('dialog[open]'));
    J.aBienMange = await rect(p.getByRole('button', { name: 'A bien mangé' }));
    await p.getByRole('button', { name: 'A bien mangé' }).click(); await p.waitForTimeout(800);
    await p.evaluate(() => scrollTo(0, 0));
    await shot(p, 'a-carnet-1');
    J.aCarte1 = await rect(p.locator('section[aria-labelledby="tl-title"]'));
    J.aLigne1 = await rect(p.locator('.tl-item').last());
  });
  await etape('11 h 51 · le repas apparaît chez les parents', async () => { await attendre('Repas', '11:51'); await shot(q, 'p-1'); await parent('p1'); });

  await etape('12 h 40 · Sommeil → « S’endort maintenant »', async () => {
    await heure(ctx, '12:40'); await allerA(p, '#/carnet');
    await shot(p, 'a-carnet-1b');
    await tuiles.getByRole('button', { name: /^Sommeil/ }).click(); await p.waitForTimeout(800);
    await shot(p, 'a-sommeil');
    J.aSommeilFeuille = await rect(p.locator('dialog[open]'));
    J.aEndort = await rect(p.getByRole('button', { name: /endort maintenant/ }));
    await p.getByRole('button', { name: /endort maintenant/ }).click(); await p.waitForTimeout(800);
    await p.evaluate(() => scrollTo(0, 0));
    await shot(p, 'a-carnet-2');
    J.aCarte2 = await rect(p.locator('section[aria-labelledby="tl-title"]'));
    J.aLigne2 = await rect(p.locator('.tl-item').last());
    J.aDodo = await rect(p.getByRole('region', { name: 'En train de dormir' }));
    J.aReveil = await rect(p.getByRole('region', { name: 'En train de dormir' }).getByRole('button', { name: /^Réveil/ }));
  });
  await etape('12 h 41 · le sommeil apparaît chez les parents', async () => { await attendre('Sommeil', '12:41'); await shot(q, 'p-2'); await parent('p2'); J.p2prive = await rect(q.getByText(/Lien privé/).first()); });

  await etape('Parents : onglet « Ce mois » et copie d’une case', async () => {
    await q.getByRole('tab', { name: 'Ce mois' }).click();
    await q.getByRole('heading', { name: 'Votre déclaration Pajemploi' }).waitFor(); await q.waitForTimeout(500);
    await masquer(q);
    await shot(q, 'p-mois');
    J.pMoisTab = await rect(q.getByRole('tab', { name: 'Ce mois' }));
    J.pTotal = await rect(q.locator('section[aria-labelledby="tot-p"]'));
    J.pDecl = await rect(q.locator('section[aria-labelledby="decl-p"]'));
    J.pCopier = await rect(q.locator('button.cpy').first());
    await q.locator('button.cpy').first().click(); await q.waitForTimeout(300);
    await shot(q, 'p-mois-copie');
    await q.getByRole('tab', { name: 'Aujourd’hui' }).click(); await q.waitForTimeout(400);
  });

  await etape('14 h 55 · Réveil', async () => {
    await heure(ctx, '14:55'); await allerA(p, '#/carnet');
    await shot(p, 'a-carnet-2b');
    await p.getByRole('region', { name: 'En train de dormir' }).getByRole('button', { name: /^Réveil/ }).click(); await p.waitForTimeout(800);
    await p.evaluate(() => scrollTo(0, 0));
    await shot(p, 'a-carnet-3');
    J.aCarte3 = await rect(p.locator('section[aria-labelledby="tl-title"]'));
    J.aLigne3 = await rect(p.locator('.tl-item').filter({ hasText: 'Sommeil' }).last());
  });

  await etape('17 h 30 · Départ, puis Modifier la journée', async () => {
    await heure(ctx, '17:30'); await allerA(p, '#/');
    const carte = p.locator('article.kid', { hasText: 'Adam' });
    await shot(p, 'a-soir-0');
    J.aDepart = await rect(carte.getByRole('button', { name: /Départ/ }));
    await carte.getByRole('button', { name: /Départ/ }).click(); await p.waitForTimeout(600);
    await shot(p, 'a-soir-1');
    J.aTagDepart = await rect(carte.getByText(/^Départ \d/));
    J.aModifier = await rect(carte.getByRole('button', { name: /Modifier/ }));
    await carte.getByRole('button', { name: /Modifier/ }).click(); await p.waitForTimeout(800);
    await shot(p, 'a-modifier');
    J.aModifierFeuille = await rect(p.locator('dialog[open]'));
    J.aHeureDepart = await rect(p.locator('dialog[open] input[type="time"]').nth(1));
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  });

  await etape('17 h 31 · la journée d’Adam et l’envoi du résumé', async () => {
    await heure(ctx, '17:31'); await allerA(p, '#/carnet');
    await shot(p, 'a-carnet-soir');
    J.aCarteSoir = await rect(p.locator('section[aria-labelledby="tl-title"]'));
    J.aResume = await rect(p.getByRole('button', { name: 'Envoyer le résumé aux parents' }));
    await p.getByRole('button', { name: 'Envoyer le résumé aux parents' }).click(); await p.waitForTimeout(400);
    J.texteResume = await dernierPartage(p);
  });
  await etape('17 h 31 · la journée terminée chez les parents', async () => { await attendre('Sommeil', '17:31'); await q.waitForTimeout(1500); await masquer(q); await shot(q, 'p-soir'); await parent('pSoir'); });

  fs.writeFileSync(OUT + 'journee.json', JSON.stringify(J, null, 1));
  await P.ctx.close(); await ctx.close(); await br.close();
  console.log(`captures « journée d’Adam » : ${Object.keys(J).length} mesures`);
})());
