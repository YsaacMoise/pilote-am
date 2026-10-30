// Audit WCAG 2.1 AA (axe-core) de tous les écrans, clair et sombre. AXE=chemin/vers/axe.min.js
// Site construit avec VITE_FAKE_CLOUD et faux service lancé (scripts/fake-cloud.mjs) : l'audit crée un compte de test local.
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
    await p.getByRole('button', { name: 'Découvrir avec des enfants fictifs' }).click();
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

    // Écrans du compte (hors exemple) : connexion, mot de passe oublié, écran Compte
    const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, locale: 'fr-FR', isMobile: true, hasTouch: true });
    const q = await c2.newPage();
    await q.goto(base);
    const audit2 = async (name) => {
      await q.addScriptTag({ content: axe });
      const r = await q.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })).violations.map((v) => `${v.id} (${v.impact}) : ${v.nodes.length} × ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
      total += r.length;
      console.log(`[${scheme}] ${name} : ${r.length ? r.join('\n    ') : 'OK'}`);
    };
    await q.getByRole('button', { name: 'J’ai déjà un compte' }).click();
    await audit2('accueil, connexion');
    await q.getByRole('button', { name: 'Mot de passe oublié' }).click();
    await audit2('accueil, mot de passe oublié');
    await q.getByRole('button', { name: 'Revenir à la connexion' }).click();
    await q.getByRole('button', { name: 'Créer un compte' }).click();
    await q.getByLabel('Adresse e-mail').fill(`axe-${scheme}-${Date.now()}@exemple.fr`);
    await q.getByLabel('Mot de passe').fill('motdepasse-solide');
    await q.getByRole('button', { name: 'Créer mon compte' }).click();
    await q.getByRole('heading', { name: 'Ton compte est prêt' }).waitFor();
    await audit2('accueil, compte prêt');
    await q.getByRole('button', { name: 'Continuer ici pour l’instant' }).click();
    await q.getByRole('button', { name: 'Ajouter mon premier enfant' }).click();
    await q.evaluate(() => { location.hash = '#/compte'; });
    await q.waitForTimeout(400);
    await audit2('#/compte');
    await c2.close();
  }
  console.log(total ? `${total} problème(s)` : 'Audit axe : aucun problème WCAG 2.1 AA');
  await b.close();
})();
