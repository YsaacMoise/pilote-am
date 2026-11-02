const { chromium } = require('playwright');
// Captures des essais « deux téléphones » et « la journée qui se raconte » : côté assistante maternelle et côté parent,
// état par état (avant, feuille ouverte, après), avec la position de chaque élément touché et de chaque nouvelle ligne.
// Demande : scripts/fake-cloud.mjs sur :4180 et la version VITE_FAKE_CLOUD servie à la racine (BASE_FAKE).
// Usage : BASE_FAKE=http://127.0.0.1:4175/ node scripts/captures-essais.cjs
const fs = require('fs');
const OUT = process.env.OUT || '/home/claude/pilote-am/motion/public/ecrans/essais/';
const BASE_FAKE = process.env.BASE_FAKE || 'http://localhost:4175/';
const HIDE = `.demo-banner{display:none!important} .toast-wrap{display:none!important} .aide-video{display:none!important}`;
const J = {};
fs.mkdirSync(OUT, { recursive: true });

async function phone(br, clock) {
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  await ctx.clock.setFixedTime(new Date(clock));
  await ctx.addInitScript(() => { try { localStorage.setItem('pam-videos', JSON.stringify({ vues: ['quotidien', 'parents'], fermees: ['pointer', 'carnet', 'mois', 'inviter', 'simulateur'] })); localStorage.setItem('pam-demo-video', '1'); } catch {} });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('ERR', e.message));
  return { ctx, p };
}
async function R(p, loc) {
  const b = await loc.first().boundingBox();
  const r = { left: Math.round(b.x), top: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  r.x = r.left + Math.round(r.w / 2); r.y = r.top + Math.round(r.h / 2);
  return r;
}
const shot = (p, n) => p.screenshot({ path: OUT + n + '.png' });
const go = async (p, h, w = 700) => { await p.evaluate((x) => (location.hash = x), h); await p.waitForTimeout(w); await p.evaluate(() => scrollTo(0, 0)); };
const heure = (ctx, h) => ctx.clock.setFixedTime(new Date(`2026-11-04T${h}:00+01:00`));

(async () => {
  const br = await chromium.launch({ env: { ...process.env, LANG: 'fr_FR.UTF-8', LANGUAGE: 'fr' }, args: ['--lang=fr'] });
  await fetch('http://localhost:4180/reset-all', { method: 'POST' });
  const { ctx, p } = await phone(br, '2026-11-04T07:50:00+01:00');
  await p.goto(BASE_FAKE);
  await p.getByRole('button', { name: 'Créer mon compte gratuit' }).click();
  await p.getByLabel('Adresse e-mail').fill('sonia@exemple.fr');
  await p.getByLabel('Mot de passe', { exact: true }).fill('Motdepasse-solide1');
  await p.getByRole('button', { name: 'Créer mon compte', exact: true }).click();
  await p.getByRole('button', { name: 'Continuer ici pour l’instant' }).click();
  await p.getByLabel('Ton prénom').fill('Sonia');
  await p.getByRole('button', { name: 'Ajouter un enfant que tu accueilles' }).click();
  await p.getByLabel('Prénom de l’enfant').fill('Adam');
  await p.getByLabel('Nom de la famille').fill('Martin');
  await p.getByLabel('Taux horaire net').fill('3,90');
  await p.getByRole('radio', { name: /^Les parents/ }).click();
  await p.getByRole('button', { name: /^Enregistrer/ }).first().click();
  await p.waitForTimeout(700);
  await p.addStyleTag({ content: HIDE });

  // Le lien pour les parents, créé avant la journée
  await go(p, '#/plus');
  await p.locator('a.li', { hasText: 'Adam' }).first().click(); await p.waitForTimeout(900);
  await p.getByRole('button', { name: 'Créer le lien' }).click();
  await p.locator('.share-code').waitFor();
  await p.getByRole('button', { name: 'Envoyer le lien aux parents' }).and(p.locator(':enabled')).waitFor();
  await p.waitForTimeout(2500);
  const code = (await p.locator('.share-code').textContent()).trim();
  const url = await p.getByRole('link', { name: 'Voir ce que voient les parents' }).getAttribute('href');

  const P = await phone(br, '2026-11-04T07:59:00+01:00');
  const q = P.p;
  await q.goto(url); await q.getByRole('heading', { name: 'Code à 4 chiffres' }).waitFor();
  await q.getByLabel('Code', { exact: true }).fill(code);
  await q.getByRole('heading', { name: 'Adam' }).waitFor({ timeout: 8000 }); await q.waitForTimeout(600);
  await q.addStyleTag({ content: HIDE });
  await shot(q, 'p-vide');
  // Attendre qu'une ligne arrive chez le parent (mise à jour en direct, sinon rechargement)
  const attendre = async (texte, h) => {
    await heure(P.ctx, h);
    try { await q.getByText(texte, { exact: true }).first().waitFor({ timeout: 6000 }); }
    catch { await q.reload(); await q.getByLabel('Code', { exact: true }).fill(code).catch(() => {}); await q.getByText(texte, { exact: true }).first().waitFor({ timeout: 8000 }); }
    await q.addStyleTag({ content: HIDE });
    await q.waitForTimeout(700);
  };
  const derniereLigneParent = async () => {
    const carte = q.locator('section[aria-labelledby="auj-t"]');
    return { carte: await R(q, carte), ligne: await R(q, carte.locator('.ev').last()) };
  };

  // 08 h 00 · Adam arrive
  await heure(ctx, '08:00'); await go(p, '#/');
  const carte = p.locator('article.kid', { hasText: 'Adam' });
  await shot(p, 'a-auj-0');
  J.aArrivee = await R(p, carte.getByRole('button', { name: /Arrivée/ }));
  J.aCarteAuj = await R(p, carte);
  await carte.getByRole('button', { name: /Arrivée/ }).click(); await p.waitForTimeout(600);
  await shot(p, 'a-auj-1');
  J.aTagArrivee = await R(p, carte.getByText(/^Arrivée \d/));
  await attendre('Arrivée', '08:00');
  await shot(q, 'p-0');
  Object.assign(J, Object.fromEntries(Object.entries(await derniereLigneParent()).map(([k, v]) => ['p0' + k, v])));

  // 11 h 50 · Repas
  await heure(ctx, '11:50'); await go(p, '#/carnet');
  const tuiles = p.getByRole('region', { name: 'Ajouter au carnet d’Adam' });
  await shot(p, 'a-carnet-0');
  J.aRepas = await R(p, tuiles.getByRole('button', { name: 'Repas' }));
  J.aSommeil = await R(p, tuiles.getByRole('button', { name: /^Sommeil/ }));
  J.aCarte0 = await R(p, p.locator('section[aria-labelledby="tl-title"]'));
  await tuiles.getByRole('button', { name: 'Repas' }).click(); await p.waitForTimeout(800);
  await shot(p, 'a-repas');
  J.aBienMange = await R(p, p.getByRole('button', { name: 'A bien mangé' }));
  await p.getByRole('button', { name: 'A bien mangé' }).click(); await p.waitForTimeout(800);
  await p.evaluate(() => scrollTo(0, 0));
  await shot(p, 'a-carnet-1');
  J.aCarte1 = await R(p, p.locator('section[aria-labelledby="tl-title"]'));
  J.aLigne1 = await R(p, p.locator('.tl-item').last());
  await attendre('Repas', '11:51');
  await shot(q, 'p-1');
  Object.assign(J, Object.fromEntries(Object.entries(await derniereLigneParent()).map(([k, v]) => ['p1' + k, v])));

  // 12 h 40 · Il s'endort
  await heure(ctx, '12:40'); await go(p, '#/carnet');
  await shot(p, 'a-carnet-1b');
  await tuiles.getByRole('button', { name: /^Sommeil/ }).click(); await p.waitForTimeout(800);
  await shot(p, 'a-sommeil');
  J.aEndort = await R(p, p.getByRole('button', { name: /endort maintenant/ }));
  await p.getByRole('button', { name: /endort maintenant/ }).click(); await p.waitForTimeout(800);
  await p.evaluate(() => scrollTo(0, 0));
  await shot(p, 'a-carnet-2');
  J.aCarte2 = await R(p, p.locator('section[aria-labelledby="tl-title"]'));
  J.aLigne2 = await R(p, p.locator('.tl-item').last());
  J.aDodo = await R(p, p.getByRole('region', { name: 'En train de dormir' }));
  await attendre('Sommeil', '12:41');
  await shot(q, 'p-2');
  Object.assign(J, Object.fromEntries(Object.entries(await derniereLigneParent()).map(([k, v]) => ['p2' + k, v])));

  fs.writeFileSync(OUT + 'essais.json', JSON.stringify(J, null, 1));
  await P.ctx.close(); await ctx.close(); await br.close();
  console.log('ok', Object.keys(J).length);
})().catch((e) => { console.error(e); process.exit(1); });
