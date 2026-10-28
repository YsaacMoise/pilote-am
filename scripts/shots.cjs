// Captures rapides de tous les écrans en mode exemple, clair et sombre.
const { chromium } = require('playwright');
const base = process.env.BASE || 'http://localhost:4173/pilote-am/';
const out = __dirname + '/out/';
(async () => {
  const b = await chromium.launch();
  const errors = [];
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${scheme}] ${m.type()}: ${m.text()}`); });
    p.on('pageerror', (e) => errors.push(`[${scheme}] pageerror: ${e.message}`));
    await p.goto(base);
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${out}${scheme}-00-welcome.png`, fullPage: true });
    await p.getByRole('button', { name: 'Voir avec des enfants d’exemple' }).click();
    await p.waitForTimeout(1200);
    const screens = ['', 'carnet', 'mois', 'plus', 'contrat/demo-leo', 'historique/demo-leo', 'controle', 'conges', 'fin/demo-leo', 'fiscal', 'sauvegarde', 'pilote', 'reglages', 'regles', 'installer', 'contrat/nouveau'];
    let i = 1;
    for (const s of screens) {
      await p.evaluate((h) => { location.hash = '#/' + h; }, s);
      await p.waitForTimeout(400);
      await p.screenshot({ path: `${out}${scheme}-${String(i++).padStart(2, '0')}-${s.replace(/\//g, '_') || 'today'}.png`, fullPage: true });
    }
    await ctx.close();
  }
  console.log(errors.length ? errors.join('\n') : 'Aucune erreur console');
  await b.close();
})();
