const { chromium } = require('playwright');
// Captures des écrans des tutoriels (Mois, Inviter, Simulateur). Usage : node scripts/captures-tutos.cjs [mois|sim|inviter]
// Demande : le site construit servi sur :4173 (vite preview) et, pour « inviter », une version VITE_FAKE_CLOUD=http://localhost:4180 servie sur :4175 avec scripts/fake-cloud.mjs.
const fs = require('fs');
const OUT = '/home/claude/pilote-am/motion/public/ecrans/';
const J = {}; // rects par écran
const which = process.argv[2] || 'all';
const HIDE = `.demo-banner{display:none!important} .toast-wrap{display:none!important}`;
async function phone(br, clock) {
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  await ctx.clock.setFixedTime(new Date(clock));
  await ctx.addInitScript(() => { try { localStorage.setItem('pam-videos', JSON.stringify({ vues: [], fermees: ['pointer', 'carnet', 'mois', 'inviter', 'simulateur'] })); localStorage.setItem('pam-demo-video', '1'); } catch {} });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('ERR', e.message));
  return { ctx, p };
}
const css = (p, extra = '') => p.addStyleTag({ content: HIDE + extra });
// Rectangle d'un élément, en coordonnées de page (ou d'écran si vp)
async function R(p, loc, vp = false) {
  const b = await loc.first().boundingBox();
  const sy = vp ? 0 : await p.evaluate(() => scrollY);
  const r = { left: Math.round(b.x), top: Math.round(b.y + sy), w: Math.round(b.width), h: Math.round(b.height) };
  r.x = r.left + Math.round(r.w / 2); r.y = r.top + Math.round(r.h / 2);
  return r;
}
const shot = (p, n) => p.screenshot({ path: OUT + n + '.png' });
async function long(p, n) {
  await p.evaluate(() => scrollTo(0, 0));
  const st = await p.addStyleTag({ content: '.tabbar,.sim-sticky,.topbar{visibility:hidden!important}' });
  // garder la barre du haut visible : on la remet en position normale
  await p.addStyleTag({ content: '.topbar{position:static!important;visibility:visible!important}' });
  await p.screenshot({ path: OUT + n + '.png', fullPage: true });
  await st.evaluate((e) => e.remove());
  await p.evaluate(() => { [...document.querySelectorAll('style')].slice(-1)[0].remove(); });
}
async function demo(p) {
  await p.goto('http://localhost:4173/'); await p.waitForTimeout(700);
  await p.getByText('Essayer avec des enfants fictifs').first().click(); await p.waitForTimeout(2200);
  await css(p);
}
const go = async (p, h, w = 900) => { await p.evaluate((x) => (location.hash = x), h); await p.waitForTimeout(w); await p.evaluate(() => scrollTo(0, 0)); };

(async () => {
  const br = await chromium.launch({ env: { ...process.env, LANG: 'fr_FR.UTF-8', LANGUAGE: 'fr' }, args: ['--lang=fr'] });
  if (which === 'all' || which === 'mois') {
    const { ctx, p } = await phone(br, '2026-10-30T17:45:00+01:00');
    await demo(p);
    await go(p, '#/'); await shot(p, 'm-auj');
    J.mTabMois = await R(p, p.locator('.tabbar a').nth(2), true);
    await go(p, '#/mois'); await shot(p, 'm-mois');
    await long(p, 'm-mois-long');
    J.mChips = await R(p, p.locator('.chips'));
    J.mTotal = await R(p, p.locator('section.summary'));
    J.mDecl = await R(p, p.locator('section[aria-labelledby="decl-t"]'));
    J.mDeclHint = await R(p, p.locator('section[aria-labelledby="decl-t"] p.muted').first());
    J.mEnvoyer = await R(p, p.getByRole('button', { name: 'Envoyer au parent' }));
    J.mControle = await R(p, p.getByRole('link', { name: 'Contrôler le bulletin' }));
    J.mExc = await R(p, p.locator('section[aria-labelledby="exc-t"]'));
    J.mExcLi = await R(p, p.locator('section[aria-labelledby="exc-t"] .li'));
    J.mPageH = await p.evaluate(() => document.documentElement.scrollHeight);
    await p.getByRole('link', { name: 'Contrôler le bulletin' }).click(); await p.waitForTimeout(900); await p.evaluate(() => scrollTo(0, 0));
    await shot(p, 'm-controle');
    J.mCtrlForm = await R(p, p.locator('fieldset', { has: p.locator('legend', { hasText: 'Le bulletin' }) }));
    for (const [l, v] of [['Salaire net', '713,81'], ['Salaire brut', '913,97'], ['Heures normales', '186'], ['Jours d’activité', '21'], ['Indemnités d’entretien', '82,88']]) await p.getByLabel(l, { exact: true }).fill(v);
    await p.locator('h1').click(); await p.waitForTimeout(700);
    await long(p, 'm-controle-long');
    J.mCtrlRes = await R(p, p.locator('section[aria-labelledby="res"]'));
    J.mCtrlH = await p.evaluate(() => document.documentElement.scrollHeight);
    await ctx.close();
  }
  if (which === 'all' || which === 'sim') {
    const { ctx, p } = await phone(br, '2026-10-30T17:45:00+01:00');
    await demo(p);
    await go(p, '#/plus'); await shot(p, 's-plus');
    J.sItem = await R(p, p.locator('a.li', { hasText: 'Simuler un accueil' }), true);
    J.sItemPage = await R(p, p.locator('a.li', { hasText: 'Simuler un accueil' }));
    await long(p, 's-plus-long');
    J.sPlusH = await p.evaluate(() => document.documentElement.scrollHeight);
    await go(p, '#/simulateur', 1200);
    // Un accueil réaliste : 8 h 30 → 17 h 30, 4,60 € brut, entretien 4 €, repas 3 €
    const t = p.locator('input[type=time]');
    await t.nth(0).fill('08:30'); await t.nth(1).fill('17:30');
    await p.getByLabel('Salaire horaire brut').fill('4,60');
    await p.getByLabel('Montant par jour d’accueil').fill('4,00');
    await p.getByText('L’assistante maternelle fournit des repas').click(); await p.waitForTimeout(300);
    const repas = p.getByLabel(/Prix d.un repas|Prix du repas/);
    if (await repas.count()) await repas.first().fill('3,00');
    await p.getByLabel('Revenu fiscal de référence 2024 du foyer').fill('38000');
    await p.locator('h1').click(); await p.waitForTimeout(900);
    await shot(p, 's-sim');
    await long(p, 's-sim-long');
    J.sPageH = await p.evaluate(() => document.documentElement.scrollHeight);
    const leg = async (txt) => R(p, p.locator('fieldset', { has: p.locator('legend', { hasText: txt }) }));
    J.sAccueil = await leg('L’accueil'); J.sTarif = await leg('Le tarif'); J.sFamille = await leg('La famille');
    J.sHoraires = await R(p, p.locator('input[type=time]').nth(0)); J.sHoraires2 = await R(p, p.locator('input[type=time]').nth(1));
    J.sSalaire = await R(p, p.getByLabel('Salaire horaire brut'));
    J.sEntretien = await R(p, p.getByLabel('Montant par jour d’accueil'));
    J.sFoyer = await R(p, p.getByText('En couple', { exact: true }));
    J.sRfr = await R(p, p.getByLabel('Revenu fiscal de référence 2024 du foyer'));
    J.sResult = await R(p, p.locator('.summary').first());
    J.sDetail = await R(p, p.locator('section', { has: p.locator('h2', { hasText: 'Le détail' }) }));
    J.sMois = await R(p, p.locator('section', { has: p.locator('h2', { hasText: 'Mois par mois' }) }));
    J.sEnvoyer = await R(p, p.getByRole('button', { name: 'Envoyer à la famille' }));
    const det = p.locator('section', { has: p.locator('h2', { hasText: 'Le détail' }) });
    J.sCaf = await R(p, det.getByText('Aide de la CAF (CMG)', { exact: true }));
    J.sCredit = await R(p, det.getByText('Crédit d’impôt', { exact: true }));
    J.sJuil = await R(p, p.locator('section', { has: p.locator('h2', { hasText: 'Mois par mois' }) }).getByText('juil. 2027', { exact: true }));
    J.sRepas = await R(p, p.getByText('L’assistante maternelle fournit des repas'));
    // La barre « Coût réel » du bas de l'écran, vue au début du formulaire
    await p.evaluate(() => scrollTo(0, 600)); await p.waitForTimeout(500);
    await shot(p, 's-sim-bas');
    await ctx.close();
  }
  if (which === 'all' || which === 'inviter') {
    const B = 'http://localhost:4175/';
    await fetch('http://localhost:4180/reset-all', { method: 'POST' });
    const { ctx, p } = await phone(br, '2026-11-04T08:12:00+01:00');
    await p.goto(B);
    await p.getByRole('button', { name: 'Créer mon compte gratuit' }).click();
    await p.getByLabel('Adresse e-mail').fill('sonia@exemple.fr');
    await p.getByLabel('Mot de passe').fill('Motdepasse-solide');
    await p.getByRole('button', { name: 'Créer mon compte' }).click();
    await p.getByRole('button', { name: 'Continuer ici pour l’instant' }).click();
    await p.getByLabel('Ton prénom').fill('Sonia');
    await p.getByRole('button', { name: 'Ajouter un enfant que tu accueilles' }).click();
    await p.getByLabel('Prénom de l’enfant').fill('Léo');
    await p.getByLabel('Nom de la famille').fill('Martin');
    await p.getByLabel('Taux horaire net').fill('3,90');
    await p.getByRole('radio', { name: /^Les parents/ }).click();
    await p.getByRole('button', { name: /^Enregistrer/ }).first().click();
    await p.waitForTimeout(700);
    await css(p);
    // Une journée : arrivée, repas, sieste
    await go(p, '#/');
    await p.getByRole('button', { name: /Arrivée/ }).first().click(); await p.waitForTimeout(400);
    const carnet = async (h, btn, choix) => {
      await ctx.clock.setFixedTime(new Date('2026-11-04T' + h + ':00+01:00'));
      await go(p, '#/carnet', 600);
      await p.getByRole('region', { name: 'Ajouter au carnet de Léo' }).getByRole('button', { name: btn }).click();
      await p.getByRole('button', { name: choix }).click(); await p.waitForTimeout(400);
    };
    await carnet('11:50', 'Repas', 'A tout mangé');
    await carnet('12:40', 'Sieste', 'Endormissement');
    await carnet('14:55', 'Sieste', 'Réveil');
    await ctx.clock.setFixedTime(new Date('2026-11-04T16:20:00+01:00'));
    await go(p, '#/plus'); await shot(p, 'i-plus');
    J.iTabPlus = await R(p, p.locator('.tabbar a').nth(3), true);
    J.iLeo = await R(p, p.locator('a.li', { hasText: 'Léo' }), true);
    await p.locator('a.li', { hasText: 'Léo' }).first().click(); await p.waitForTimeout(900);
    await p.evaluate(() => scrollTo(0, 0)); await shot(p, 'i-contrat');
    const card = p.locator('section[aria-labelledby="partage-t"]');
    await card.scrollIntoViewIfNeeded();
    await p.evaluate(() => scrollBy(0, -80)); await p.waitForTimeout(300);
    J.iScroll = await p.evaluate(() => scrollY);
    await p.evaluate(() => scrollTo(0, 0));
    await long(p, 'i-contrat-long');
    J.iCard = await R(p, card); J.iCreer = await R(p, p.getByRole('button', { name: 'Créer le lien' }));
    await p.getByRole('button', { name: 'Créer le lien' }).click();
    await p.locator('.share-code').waitFor();
    await p.getByRole('button', { name: 'Envoyer le lien aux parents' }).and(p.locator(':enabled')).waitFor();
    await p.waitForTimeout(3500);
    await p.evaluate(() => { const e = document.querySelector('.share-url'); e.textContent = e.textContent.replace(/^[^/]+/, 'arvela.fr'); });
    await long(p, 'i-contrat-code-long');
    J.iCard2 = await R(p, card); J.iCode = await R(p, p.locator('.share-code')); J.iUrl = await R(p, p.locator('.share-url'));
    J.iEnvoyer = await R(p, p.getByRole('button', { name: 'Envoyer le lien aux parents' }));
    J.iCouper = await R(p, p.getByRole('button', { name: 'Couper ce lien' }));
    J.iContratH = await p.evaluate(() => document.documentElement.scrollHeight);
    J.code = (await p.locator('.share-code').textContent()).trim();
    const url = await p.getByRole('link', { name: 'Voir ce que voient les parents' }).getAttribute('href');
    // Les parents
    const P = await phone(br, '2026-11-04T16:20:00+01:00');
    const q = P.p;
    await q.goto(url); await q.getByRole('heading', { name: 'Code à 4 chiffres' }).waitFor();
    await q.waitForTimeout(500); await shot(q, 'i-p-code');
    J.iPCode = await R(q, q.getByLabel('Code', { exact: true }), true);
    await q.getByLabel('Code', { exact: true }).fill(J.code);
    await q.getByRole('heading', { name: 'Léo' }).waitFor({ timeout: 8000 }); await q.waitForTimeout(600);
    await shot(q, 'i-p-auj');
    J.iPJour = await R(q, q.locator('.card').filter({ hasText: 'Arrivée' }).first(), true);
    J.iPArr = await R(q, q.getByText('Arrivée', { exact: true }).first(), true);
    J.iPRepas = await R(q, q.getByText('Repas', { exact: true }).first(), true);
    J.iPReveil = await R(q, q.getByText('Réveil', { exact: true }).first(), true);
    J.iPMoisTab = await R(q, q.getByRole('tab', { name: 'Ce mois' }), true);
    await q.getByRole('tab', { name: 'Ce mois' }).click();
    await q.getByRole('heading', { name: 'Votre déclaration Pajemploi' }).waitFor(); await q.waitForTimeout(500);
    await shot(q, 'i-p-mois');
    J.iPDecl = await R(q, q.locator('section, .card').filter({ has: q.getByRole('heading', { name: 'Votre déclaration Pajemploi' }) }).last(), true);
    J.iPTabs = await R(q, q.getByRole('tablist'), true);
    await P.ctx.close();
    await ctx.close();
  }
  const f = OUT + 'tuto.json';
  const old = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : {};
  fs.writeFileSync(f, JSON.stringify({ ...old, ...J }, null, 1));
  await br.close();
  console.log('ok', Object.keys(J).length);
})().catch((e) => { console.error(e); process.exit(1); });
