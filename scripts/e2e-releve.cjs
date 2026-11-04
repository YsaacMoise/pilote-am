// Relevé du mois (PDF) sur un iPhone simulé, app installée : premier partage refusé par Safari (geste trop ancien),
// second accepté depuis la bannière ; fichier seul, sans texte ; contrôle axe de l’écran Mois. AXE=chemin/vers/axe.min.js
const { chromium, devices } = require('playwright');
const axe = require('fs').readFileSync(process.env.AXE, 'utf8');
const base = process.env.BASE || 'http://localhost:4173/';
(async () => {
  const b = await chromium.launch();
  let defauts = 0;
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], colorScheme: scheme, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
    // App installée sur iPhone : navigator.standalone, partage de fichiers disponible. Premier partage refusé
    // (NotAllowedError, comme Safari quand le geste est trop ancien), le second accepté.
    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', { get: () => true });
      window.__partages = [];
      let n = 0;
      navigator.canShare = (d) => !!(d && d.files && d.files.length);
      navigator.share = async (d) => {
        n++;
        if (d.text || d.title) throw new Error('texte interdit avec un fichier (WebKit 244408)');
        if (n <= 2) throw new DOMException('geste trop ancien', 'NotAllowedError');
        window.__partages.push({ name: d.files[0].name, type: d.files[0].type, size: d.files[0].size });
      };
    });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(base); await p.waitForTimeout(800);
    await p.getByRole('button', { name: 'Essayer avec des enfants fictifs' }).first().click(); await p.waitForTimeout(1500);
    await p.evaluate(() => { location.hash = '#/mois'; }); await p.waitForTimeout(800);
    const audit = async (nom) => {
      await p.addScriptTag({ content: axe });
      const r = await p.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })).violations.map((v) => `${v.id} (${v.impact}) ${v.nodes.length}× ${v.nodes[0].target.join(' ')}`));
      defauts += r.length;
      console.log(`[${scheme}] axe ${nom} : ${r.length ? r.join(' | ') : '0 défaut'}`);
    };
    await audit('Mois');
    await p.getByRole('button', { name: 'Relevé du mois (PDF)' }).tap();
    await p.getByRole('button', { name: 'Partager le relevé' }).waitFor({ timeout: 20000 });
    await audit('Mois, relevé prêt');
    // La bannière appartient au mois et à l'enfant affichés : elle disparaît quand on change de mois.
    await p.getByRole('button', { name: 'Mois précédent' }).tap();
    await p.waitForTimeout(300);
    if (await p.getByRole('button', { name: 'Partager le relevé' }).count()) throw new Error('bannière restée sur un autre mois');
    await p.getByRole('button', { name: 'Mois suivant' }).tap();
    await p.waitForTimeout(300);
    // Nouvelle fabrication, partage encore refusé, puis relancé depuis la bannière : il passe.
    await p.getByRole('button', { name: 'Relevé du mois (PDF)' }).tap();
    await p.getByRole('button', { name: 'Partager le relevé' }).waitFor({ timeout: 20000 });
    await p.getByRole('button', { name: 'Partager le relevé' }).tap();
    await p.waitForFunction(() => window.__partages.length === 1, null, { timeout: 20000 });
    await p.waitForTimeout(500);
    const parts = await p.evaluate(() => window.__partages);
    const banniere = await p.getByRole('button', { name: 'Partager le relevé' }).count();
    console.log(`[${scheme}] partages :`, JSON.stringify(parts), '; bannière restante :', banniere, '; erreurs :', errs.join(' ') || 'aucune');
    await ctx.close();
  }
  console.log('total défauts axe :', defauts);
  await b.close();
})();
