// Scénario de capture « démonstration » : un mois complet (enfants fictifs Adam, Rose, Violette).
// Sert aux aides Mois et Simulateur, et à la fin de la vidéo d'accueil (« ton mois se calcule tout seul »).
// Pages longues photographiées en entier (barre d'onglets masquée) : les positions sont en coordonnées de page.
const fs = require('fs');
const path = require('path');
const { navigateur, telephone, rect, scenario, allerA, masquer, terminer } = require('./lib-captures.cjs');

const OUT = process.env.OUT || path.join(__dirname, '../public/ecrans/demo/');
const BASE = process.env.BASE_FAKE || 'http://localhost:4175/';
const J = {};
let pages = [];
const etape = scenario('démonstration', OUT, () => pages);

// Position d'un élément dans la page entière (et non dans la partie visible)
async function rectPage(p, loc) {
  const r = await rect(loc);
  const sy = await p.evaluate(() => scrollY);
  return { ...r, top: r.top + sy, y: r.y + sy };
}
async function pageEntiere(p, n) {
  await p.evaluate(() => scrollTo(0, 0));
  const st = await p.addStyleTag({ content: '.tabbar,.sim-sticky{visibility:hidden!important} .topbar{position:static!important}' });
  await p.screenshot({ path: OUT + n + '.png', fullPage: true });
  await st.evaluate((e) => e.remove());
}

terminer((async () => {
  const br = await navigateur();
  const { ctx, p } = await telephone(br, '2026-10-29T17:45:00+01:00');
  await ctx.addInitScript(() => {
    window.__partages = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => { window.__partages.push(d); } });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
  });
  pages = [p];
  const shot = (n) => p.screenshot({ path: OUT + n + '.png' });
  const partage = () => p.evaluate(() => { const d = window.__partages.slice(-1)[0]; return d ? (d.text ?? '') : ''; });

  await etape('Ouvrir la démonstration', async () => {
    await p.goto(BASE); await p.waitForTimeout(700);
    await p.getByText('Essayer avec des enfants fictifs').first().click(); await p.waitForTimeout(2000);
    const seule = p.getByRole('button', { name: 'Explorer seule' });
    if (await seule.isVisible().catch(() => false)) { await seule.click(); await p.waitForTimeout(400); }
    await masquer(p);
  });

  await etape('Mois d’Adam : total, cases Pajemploi, envoi au parent', async () => {
    await allerA(p, '#/mois', 1000);
    await shot('m-mois');
    J.mTabMois = await rect(p.locator('.tabbar a').nth(2));
    J.mTotal = await rectPage(p, p.locator('section.summary'));
    J.mDecl = await rectPage(p, p.locator('section[aria-labelledby="decl-t"]'));
    const lignes = p.locator('section[aria-labelledby="decl-t"] .decl-line');
    J.mLignes = [];
    for (let i = 0; i < await lignes.count(); i++) J.mLignes.push({ ...(await rectPage(p, lignes.nth(i))), texte: (await lignes.nth(i).innerText()).split('\n')[0] });
    J.mEnvoyer = await rectPage(p, p.getByRole('button', { name: 'Envoyer au parent' }));
    J.mHauteur = await p.evaluate(() => document.documentElement.scrollHeight);
    await pageEntiere(p, 'm-mois-long');
    await p.getByRole('button', { name: 'Envoyer au parent' }).click(); await p.waitForTimeout(400);
    J.texteMois = await partage();
  });

  await etape('Plus → Simuler un accueil', async () => {
    await allerA(p, '#/plus', 900);
    await p.locator('a.li', { hasText: 'Simuler un accueil' }).evaluate((e) => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(300);
    await shot('s-plus');
    J.sTabPlus = await rect(p.locator('.tabbar a').nth(3));
    J.sLien = await rect(p.locator('a.li', { hasText: 'Simuler un accueil' }));
    await p.locator('a.li', { hasText: 'Simuler un accueil' }).click(); await p.waitForTimeout(1200);
    await p.evaluate(() => scrollTo(0, 0));
    await shot('s-sim');
    J.sArrivee = await rectPage(p, p.locator('input[type="time"]').first());
    J.sDepart = await rectPage(p, p.locator('input[type="time"]').nth(1));
    J.sTarif = await rectPage(p, p.getByLabel('Salaire horaire brut'));
    J.sResultat = await rectPage(p, p.locator('section[aria-labelledby="sim-t"]'));
    J.sDetail = await rectPage(p, p.locator('section[aria-labelledby="sim-d"]'));
    J.sEnvoyer = await rectPage(p, p.getByRole('button', { name: 'Envoyer à la famille' }));
    J.sHauteur = await p.evaluate(() => document.documentElement.scrollHeight);
    await pageEntiere(p, 's-sim-long');
    await p.getByRole('button', { name: 'Envoyer à la famille' }).click(); await p.waitForTimeout(400);
    J.texteSim = await partage();
  });

  // Aide « Carnet » : plusieurs enfants, on choisit Rose, on note un repas, puis son sommeil et son réveil
  const heure = (h) => ctx.clock.setFixedTime(new Date(`2026-10-29T${h}:00+01:00`));
  await etape('Carnet : arrivée de Rose à 7 h 31', async () => {
    await heure('07:31'); await allerA(p, '#/', 800);
    const carte = p.locator('article.kid', { hasText: 'Rose' });
    if (await carte.getByRole('button', { name: /Arrivée/ }).count()) { await carte.getByRole('button', { name: /Arrivée/ }).click(); await p.waitForTimeout(500); }
  });
  const enfant = p.getByRole('group', { name: 'Enfant' });
  await etape('Carnet 11 h 50 : choisir Rose → Repas → « A tout mangé »', async () => {
    await heure('11:50'); await allerA(p, '#/carnet', 900);
    // La démonstration prévoit une sieste d'Adam à 12 h 40 : à 11 h 50 elle n'a pas encore commencé
    await enfant.getByRole('button', { name: /Adam/ }).click(); await p.waitForTimeout(400);
    const sieste = p.locator('.tl-item', { hasText: 'Dort depuis' });
    if (await sieste.count()) { await sieste.getByRole('button', { name: /^Supprimer/ }).click(); await p.waitForTimeout(400); }
    await p.evaluate(() => scrollTo(0, 0));
    await shot('c-adam');
    J.cRose = await rect(enfant.getByRole('button', { name: /Rose/ }));
    await enfant.getByRole('button', { name: /Rose/ }).click(); await p.waitForTimeout(500);
    await p.evaluate(() => scrollTo(0, 0));
    await shot('c-rose-0');
    const tuiles = p.getByRole('region', { name: /^Ajouter au carnet de Rose/ });
    J.cRepas = await rect(tuiles.getByRole('button', { name: 'Repas' }));
    J.cSommeil = await rect(tuiles.getByRole('button', { name: /^Sommeil/ }));
    await tuiles.getByRole('button', { name: 'Repas' }).click(); await p.waitForTimeout(800);
    await shot('c-repas');
    J.cRepasFeuille = await rect(p.locator('dialog[open]'));
    J.cToutMange = await rect(p.getByRole('button', { name: 'A tout mangé' }));
    await p.getByRole('button', { name: 'A tout mangé' }).click(); await p.waitForTimeout(800);
    await p.evaluate(() => scrollTo(0, 0));
    await shot('c-rose-1');
    J.cCarte0 = await rect(p.locator('section[aria-labelledby="tl-title"]'));
    J.cLigne1 = await rect(p.locator('.tl-item').last());
    J.cHeure1 = await rect(p.locator('.tl-item').last().locator('.tl-time'));
  });
  await etape('Carnet 12 h 40 : Sommeil → « S’endort maintenant » → Réveil', async () => {
    await heure('12:40'); await allerA(p, '#/carnet', 900);
    await enfant.getByRole('button', { name: /Rose/ }).click(); await p.waitForTimeout(400);
    await p.evaluate(() => scrollTo(0, 0));
    await shot('c-rose-1b');
    const tuiles = p.getByRole('region', { name: /^Ajouter au carnet de Rose/ });
    await tuiles.getByRole('button', { name: /^Sommeil/ }).click(); await p.waitForTimeout(800);
    await shot('c-sommeil');
    J.cSommeilFeuille = await rect(p.locator('dialog[open]'));
    J.cEndort = await rect(p.getByRole('button', { name: /endort maintenant/ }));
    await p.getByRole('button', { name: /endort maintenant/ }).click(); await p.waitForTimeout(800);
    await p.evaluate(() => scrollTo(0, 0));
    await shot('c-rose-2');
    const dodo = p.getByRole('region', { name: 'En train de dormir' });
    J.cDodo = await rect(dodo);
    J.cReveil = await rect(dodo.getByRole('button', { name: /Réveil/ }).first());
    await heure('14:55'); await allerA(p, '#/carnet', 700);
    await enfant.getByRole('button', { name: /Rose/ }).click(); await p.waitForTimeout(400);
    await p.evaluate(() => scrollTo(0, 0));
    await shot('c-rose-2b');
    const reveil = p.getByRole('region', { name: 'En train de dormir' }).getByRole('button', { name: /Réveil/ }).first();
    J.cReveil2 = await rect(reveil);
    await reveil.click(); await p.waitForTimeout(800);
    await p.evaluate(() => scrollTo(0, 0));
    await shot('c-rose-3');
  });
  await etape('Carnet 15 h 00 : À apporter → « Couches »', async () => {
    await heure('15:00'); await allerA(p, '#/carnet', 700);
    await enfant.getByRole('button', { name: /Rose/ }).click(); await p.waitForTimeout(400);
    await p.evaluate(() => scrollTo(0, 0));
    await shot('c-rose-3b');
    const tuile = p.getByRole('region', { name: /^Ajouter au carnet de Rose/ }).getByRole('button', { name: /^À apporter/ });
    J.cApporter = await rect(tuile);
    await tuile.click(); await p.waitForTimeout(800);
    await shot('c-apporter');
    J.cApporterFeuille = await rect(p.locator('dialog[open]'));
    J.cCouches = await rect(p.getByRole('button', { name: 'Couches', exact: true }));
    await p.getByRole('button', { name: 'Couches', exact: true }).click(); await p.waitForTimeout(800);
    await p.evaluate(() => scrollTo(0, 0));
    await shot('c-rose-4');
    J.cLigneApporter = await rect(p.locator('.tl-item', { hasText: 'À apporter' }).last());
  });

  fs.writeFileSync(OUT + 'demo.json', JSON.stringify(J, null, 1));
  await ctx.close(); await br.close();
  console.log(`captures « démonstration » : ${Object.keys(J).length} mesures`);
})());
