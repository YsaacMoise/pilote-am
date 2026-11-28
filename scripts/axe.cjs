// Audit WCAG 2.1 AA (axe-core) de tous les écrans, clair et sombre. AXE=chemin/vers/axe.min.js
// Site construit avec VITE_FAKE_CLOUD et faux service lancé (scripts/fake-cloud.mjs) : l'audit crée un compte de test local.
const { chromium } = require('playwright');
const fs = require('fs');
const Assistant = require('./e2e-assistant.cjs');
const base = process.env.BASE || 'http://localhost:4173/pilote-am/';
const axe = fs.readFileSync(process.env.AXE, 'utf8');
(async () => {
  const b = await chromium.launch();
  let total = 0;
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, locale: 'fr-FR', isMobile: true, hasTouch: true });
    // T-112 : horloge fixée (jeudi 26/11/2026, 10 h, Paris) : les écrans du jour ne dépendent plus de l'heure du passage.
    await ctx.clock.install({ time: new Date('2026-11-26T10:00:00+01:00') });
    await ctx.clock.resume();
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
    await p.getByRole('button', { name: 'Essayer avec des enfants fictifs' }).first().click();
    await p.waitForTimeout(1000);
    // T-112 : la démonstration s'ouvre sur la feuille de la vidéo d'accueil ; elle est auditée, puis fermée par « Explorer seule ».
    const seule = p.getByRole('button', { name: 'Explorer seule' });
    if (await seule.count()) { await audit('démonstration, feuille d’accueil'); await seule.click(); await p.waitForTimeout(300); }
    for (const s of ['', 'carnet', 'mois', 'plus', 'contrat/demo-leo', 'confidentialite', 'conditions', 'mentions', 'avenant/demo-leo/nouveau', 'historique/demo-leo', 'controle', 'conges', 'fin/demo-leo', 'fiscal', 'sauvegarde', 'pilote', 'reglages', 'regles', 'installer']) {
      await p.evaluate((h) => { location.hash = '#/' + h; }, s);
      await p.waitForTimeout(350);
      await audit('#/' + s);
    }
    // une feuille ouverte
    await p.evaluate(() => { location.hash = '#/'; });
    await p.waitForTimeout(300);
    await p.getByRole('button', { name: /^Modifier( la journée)? \(Adam\)$/ }).first().click(); // T-112 : l'enfant demo-leo s'appelle Adam
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
    // T-112 : libellés de l'accueil depuis la T-122 (« Me connecter », plus d'écran « Ton compte est prêt »).
    await q.locator('.hero-login').getByRole('button', { name: 'Me connecter' }).click();
    await audit2('accueil, connexion');
    await q.getByRole('button', { name: 'Mot de passe oublié' }).click();
    await audit2('accueil, mot de passe oublié');
    await q.getByRole('button', { name: 'Revenir à la connexion' }).click();
    await q.getByRole('button', { name: 'Créer un compte' }).click();
    await q.getByLabel('Adresse e-mail').fill(`axe-${scheme}-${Date.now()}@exemple.fr`);
    await q.getByLabel('Mot de passe').fill('Motdepasse-solide'); // T-112 : règle des 3 types de caractères
    await q.getByRole('button', { name: 'Créer mon compte' }).click();
    await q.getByRole('heading', { name: 'Toi' }).waitFor();
    await audit2('profil « Toi » après création du compte');
    await Assistant.profil(q);
    await q.getByLabel('Prénom de l’enfant').waitFor();
    await audit2('assistant, nouvel enfant');
    await q.evaluate(() => { location.hash = '#/compte'; });
    await q.waitForTimeout(400);
    await audit2('#/compte');
    await c2.close();
  }
  console.log(total ? `${total} problème(s)` : 'Audit axe : aucun problème WCAG 2.1 AA');
  await b.close();
  // T-112 : un problème d'accessibilité met le robot au rouge.
  if (total) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
