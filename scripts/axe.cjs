// Audit WCAG 2.1 AA (axe-core) de tous les écrans, clair et sombre. AXE=chemin/vers/axe.min.js
const { chromium } = require('playwright');
const fs = require('fs');
const base = process.env.BASE || 'http://localhost:4173/pilote-am/';
const axe = fs.readFileSync(process.env.AXE, 'utf8');
(async () => {
  const b = await chromium.launch();
  let total = 0;
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, locale: 'fr-FR', isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await p.goto(base);
    await p.waitForTimeout(300);
    const audit = async (name) => {
      await p.addScriptTag({ content: axe });
      const r = await p.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })).violations.map((v) => `${v.id} (${v.impact}) : ${v.nodes.length} × ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
      total += r.length;
      console.log(`[${scheme}] ${name} : ${r.length ? r.join('\n    ') : 'OK'}`);
    };
    await audit('accueil');
    await p.getByRole('button', { name: 'Voir avec des enfants d’exemple' }).click();
    await p.waitForTimeout(1000);
    for (const s of ['', 'carnet', 'mois', 'plus', 'contrat/demo-leo', 'avenant/demo-leo/nouveau', 'historique/demo-leo', 'controle', 'conges', 'fin/demo-leo', 'fiscal', 'sauvegarde', 'pilote', 'reglages', 'regles', 'installer']) {
      await p.evaluate((h) => { location.hash = '#/' + h; }, s);
      await p.waitForTimeout(350);
      await audit('#/' + s);
    }
    // une feuille ouverte
    await p.evaluate(() => { location.hash = '#/'; });
    await p.waitForTimeout(300);
    await p.getByRole('button', { name: /Modifier \(Léo\)/ }).click();
    await p.waitForTimeout(400);
    await audit('feuille journée');
    await ctx.close();
  }
  console.log(total ? `${total} problème(s)` : 'Audit axe : aucun problème WCAG 2.1 AA');
  await b.close();
})();
