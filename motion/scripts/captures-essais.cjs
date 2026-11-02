// Scénario de capture « une journée d'Adam », côté assistante maternelle et côté parent (vrai lien, mis à jour en direct).
// Sert à la vidéo d'accueil et aux essais A et B. Chaque état est photographié (avant, feuille ouverte, après),
// et la position de chaque élément touché, de chaque feuille et de chaque nouvelle ligne est mesurée : aucune position écrite à la main.
// Demande : scripts/fake-cloud.mjs sur :4180 et la version de l'app construite avec VITE_FAKE_CLOUD, servie à BASE_FAKE.
// Usage : BASE_FAKE=http://127.0.0.1:4175/ node scripts/captures-essais.cjs
const fs = require('fs');
const path = require('path');
const { navigateur, telephone, rect, scenario, allerA, masquer, terminer } = require('./lib-captures.cjs');

const OUT = process.env.OUT || path.join(__dirname, '../public/ecrans/essais/');
const BASE_FAKE = process.env.BASE_FAKE || 'http://localhost:4175/';
const CLOUD = process.env.CLOUD || 'http://localhost:4180';
const J = {};
let pages = [];
const etape = scenario('journée d’Adam', OUT, () => pages);
const heure = (ctx, h) => ctx.clock.setFixedTime(new Date(`2026-11-04T${h}:00+01:00`));

terminer((async () => {
  const br = await navigateur();
  await fetch(CLOUD + '/reset-all', { method: 'POST' });
  const { ctx, p } = await telephone(br, '2026-11-04T07:50:00+01:00');
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
  const { code, url } = await etape('Créer le lien pour les parents', async () => {
    await allerA(p, '#/plus');
    await p.locator('a.li', { hasText: 'Adam' }).first().click(); await p.waitForTimeout(900);
    await p.getByRole('button', { name: 'Créer le lien' }).click();
    await p.locator('.share-code').waitFor();
    await p.getByRole('button', { name: 'Envoyer le lien aux parents' }).and(p.locator(':enabled')).waitFor();
    await p.waitForTimeout(2500);
    return { code: (await p.locator('.share-code').textContent()).trim(), url: await p.getByRole('link', { name: 'Voir ce que voient les parents' }).getAttribute('href') };
  });

  const P = await telephone(br, '2026-11-04T07:59:00+01:00');
  const q = P.p;
  pages = [p, q];
  await etape('Ouvrir la page des parents avec le code', async () => {
    await q.goto(url); await q.getByRole('heading', { name: 'Code à 4 chiffres' }).waitFor();
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
  });
  await etape('12 h 41 · le sommeil apparaît chez les parents', async () => { await attendre('Sommeil', '12:41'); await shot(q, 'p-2'); await parent('p2'); });

  fs.writeFileSync(OUT + 'essais.json', JSON.stringify(J, null, 1));
  await P.ctx.close(); await ctx.close(); await br.close();
  console.log(`captures « journée d’Adam » : ${Object.keys(J).length} positions mesurées`);
})());
