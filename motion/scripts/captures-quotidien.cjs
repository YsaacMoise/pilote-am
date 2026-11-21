const { chromium } = require('playwright');
// Captures de « Une journée avec Arvela » (scène Didactic) : écrans Aujourd'hui, Carnet, Mois, Plus de la démonstration,
// et positions des éléments touchés ou cerclés (public/ecrans/taps.json).
// Usage : BASE=http://127.0.0.1:4176/ node scripts/captures-quotidien.cjs  (site construit, servi à la racine)
const fs = require('fs');
const OUT = process.env.OUT || '/home/claude/pilote-am/motion/public/ecrans/';
const BASE = process.env.BASE || 'http://localhost:4173/';
const HIDE = `.demo-banner{display:none!important} .toast-wrap{display:none!important} .aide-video{display:none!important}`;
const J = {};

async function R(p, loc, vp = true) {
  const b = await loc.first().boundingBox();
  const sy = vp ? 0 : await p.evaluate(() => scrollY);
  const r = { left: Math.round(b.x), top: Math.round(b.y + sy), w: Math.round(b.width), h: Math.round(b.height) };
  return { x: r.left + Math.round(r.w / 2), y: r.top + Math.round(r.h / 2), ...r };
}
const union = (a, b) => {
  const left = Math.min(a.left, b.left), top = Math.min(a.top, b.top);
  const w = Math.max(a.left + a.w, b.left + b.w) - left, h = Math.max(a.top + a.h, b.top + b.h) - top;
  return { x: left + Math.round(w / 2), y: top + Math.round(h / 2), w, h, top, left };
};
const shot = (p, n) => p.screenshot({ path: OUT + n + '.png' });
async function long(p, n) {
  await p.evaluate(() => scrollTo(0, 0));
  const st = await p.addStyleTag({ content: '.tabbar{visibility:hidden!important} .topbar{position:static!important}' });
  await p.screenshot({ path: OUT + n + '.png', fullPage: true });
  await st.evaluate((e) => e.remove());
}
const go = async (p, h, w = 900) => { await p.evaluate((x) => (location.hash = x), h); await p.waitForTimeout(w); await p.evaluate(() => scrollTo(0, 0)); };
const heure = (ctx, h) => ctx.clock.setFixedTime(new Date(`2026-10-29T${h}:00+01:00`));

(async () => {
  const br = await chromium.launch({ env: { ...process.env, LANG: 'fr_FR.UTF-8', LANGUAGE: 'fr' }, args: ['--lang=fr'] });
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  await heure(ctx, '07:31');
  await ctx.addInitScript(() => { try { localStorage.setItem('pam-videos', JSON.stringify({ vues: [], fermees: ['pointer', 'carnet', 'mois', 'inviter', 'simulateur'] })); localStorage.setItem('pam-demo-video', '1'); } catch {} });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto(BASE); await p.waitForTimeout(700);
  await p.getByText('Essayer avec des enfants fictifs').first().click(); await p.waitForTimeout(2200);
  const seule = p.getByRole('button', { name: 'Explorer seule' });
  if (await seule.isVisible().catch(() => false)) { await seule.click(); await p.waitForTimeout(400); }
  await p.addStyleTag({ content: HIDE });

  // 01 · Aujourd'hui : le matin, Rose arrive
  await go(p, '#/');
  const carte = (n) => p.locator('article.kid', { hasText: n });
  await shot(p, 'auj-matin');
  J.carteInes = await R(p, carte('Rose'));
  J.arrivee = await R(p, carte('Rose').getByRole('button', { name: /Arrivée/ }));
  J.tabCarnet = await R(p, p.locator('.tabbar a').nth(1));
  J.tabMois = await R(p, p.locator('.tabbar a').nth(2));
  J.tabPlus = await R(p, p.locator('.tabbar a').nth(3));
  await carte('Rose').getByRole('button', { name: /Arrivée/ }).click(); await p.waitForTimeout(500);
  // Le message « Arrivée de Rose… Annuler » reste visible sur cet écran
  await p.addStyleTag({ content: '.toast-wrap{display:block!important}' }); await p.waitForTimeout(900);
  await shot(p, 'auj-arrivee');
  J.tagArrivee = await R(p, carte('Rose').getByText(/^Arrivée \d/));
  J.annuler = await R(p, p.locator('.toast').getByRole('button', { name: 'Annuler' }));
  await p.addStyleTag({ content: '.toast-wrap{display:none!important}' });

  // Le soir, Adam repart
  await heure(ctx, '17:32'); await go(p, '#/carnet', 300); await go(p, '#/');
  await shot(p, 'auj-soir');
  J.depart = await R(p, carte('Adam').getByRole('button', { name: /Départ/ }));
  await carte('Adam').getByRole('button', { name: /Départ/ }).click(); await p.waitForTimeout(500);
  await p.addStyleTag({ content: '.toast-wrap{display:block!important}' }); await p.waitForTimeout(900);
  await shot(p, 'auj-depart');
  await shot(p, 'auj-avant-modifier');
  await p.addStyleTag({ content: '.toast-wrap{display:none!important}' });
  J.modifier = await R(p, carte('Rose').getByRole('button', { name: /Modifier/ }));
  await carte('Rose').getByRole('button', { name: /Modifier/ }).click(); await p.waitForTimeout(700);
  await shot(p, 'auj-modifier');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);

  // 02 · Carnet, à 11 h 50 : Adam d'abord, puis Rose, Repas, « A tout mangé »
  await heure(ctx, '11:50'); await go(p, '#/'); await go(p, '#/carnet');
  // La démonstration prévoit une sieste d'Adam à 12 h 40 : à 11 h 50 elle n'a pas encore commencé
  const sieste = p.locator('.tl-item', { hasText: 'Dort depuis' });
  if (await sieste.count()) { await sieste.getByRole('button', { name: /^Supprimer/ }).click(); await p.waitForTimeout(400); }
  await p.evaluate(() => scrollTo(0, 0));
  await shot(p, 'carnet-leo');
  J.chipInes = await R(p, p.getByRole('group', { name: 'Enfant' }).getByRole('button', { name: /Rose/ }));
  await p.getByRole('group', { name: 'Enfant' }).getByRole('button', { name: /Rose/ }).click(); await p.waitForTimeout(500);
  await p.evaluate(() => scrollTo(0, 0));
  await shot(p, 'carnet-ines');
  const tuiles = p.getByRole('region', { name: /^Ajouter au carnet de Rose/ });
  J.repas = await R(p, tuiles.getByRole('button', { name: 'Repas' }));
  J.sieste = await R(p, tuiles.getByRole('button', { name: /^Sommeil/ }));
  J.change = await R(p, tuiles.getByRole('button', { name: 'Change' }));
  J.tuiles = union(J.repas, J.change);
  await tuiles.getByRole('button', { name: 'Repas' }).click(); await p.waitForTimeout(700);
  await shot(p, 'carnet-repas');
  J.toutMange = await R(p, p.getByRole('button', { name: 'A tout mangé' }));
  await p.getByRole('button', { name: 'A tout mangé' }).click(); await p.waitForTimeout(600);
  await p.evaluate(() => scrollTo(0, 0));
  await p.addStyleTag({ content: '.toast-wrap{display:block!important}' }); await p.waitForTimeout(900);
  await shot(p, 'carnet-note');
  await p.addStyleTag({ content: '.toast-wrap{display:none!important}' });
  J.ligneNote = await R(p, p.locator('.tl-item', { hasText: 'A tout mangé' }));
  J.envoyerResume = await R(p, p.getByRole('button', { name: 'Envoyer le résumé aux parents' }));

  // 03 · Mois
  await heure(ctx, '17:45'); await go(p, '#/'); await go(p, '#/mois');
  await shot(p, 'mois');
  J.total = await R(p, p.locator('section.summary'));
  await long(p, 'mois-long');
  J.decl = await R(p, p.locator('section[aria-labelledby="decl-t"]'), false);
  J.envoyerParent = await R(p, p.getByRole('button', { name: 'Envoyer au parent' }), false);
  const salaireNet = (await p.locator('section.summary').textContent()).match(/salaire net ([\d\s ,]+€)/)?.[1]?.replace(/\s+/g, ' ') ?? '';

  // 04 · Plus
  await go(p, '#/plus');
  await shot(p, 'plus');
  await long(p, 'plus-long');
  J.liConges = await R(p, p.locator('a.li', { hasText: 'Congés' }), false);
  J.liControle = await R(p, p.locator('a.li', { hasText: 'Contrôler un bulletin' }), false);
  J.liReglages = await R(p, p.locator('a.li', { hasText: 'Réglages' }), false);

  fs.writeFileSync(OUT + 'taps.json', JSON.stringify(J, null, 1));
  await br.close();
  console.log('ok', Object.keys(J).length, 'salaire net', salaireNet);
})().catch((e) => { console.error(e); process.exit(1); });
