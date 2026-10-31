const { chromium } = require('/opt/node-tools/node_modules/playwright-core');
const fs = require('fs');
const O = __dirname + '/cap/';
const taps = {};
const box = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
async function demo(b, time, scheme = 'light') {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, timezoneId: 'Europe/Paris', locale: 'fr-FR' });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date(time) });
  await p.goto('http://localhost:4173/'); await p.waitForTimeout(700);
  await p.getByText('Voir un exemple').click(); await p.waitForTimeout(1500);
  await ctx.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '.demo-banner{display:none!important}.demo-banner + .app .topbar{padding-top:8px}'; document.head.appendChild(s); }); });
  await p.addStyleTag({ content: '.demo-banner{display:none!important}.demo-banner + .app .topbar{padding-top:8px}' });
  await p.waitForTimeout(200);
  return { ctx, p };
}
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--lang=fr-FR'], env: { ...process.env, LANG: 'fr_FR.UTF-8', LANGUAGE: 'fr', LC_ALL: 'fr_FR.UTF-8' } });
  // 1. Aujourd'hui : arrivée d'Inès
  let { ctx, p } = await demo(b, '2026-10-29T07:31:00+01:00');
  await p.screenshot({ path: O + 'today-avant.png' });
  const arr = p.locator('.kid', { hasText: 'Inès' }).getByRole('button', { name: /Arrivée/ });
  taps.todayArrivee = await box(arr);
  await arr.click(); await p.waitForTimeout(500);
  await p.screenshot({ path: O + 'today-apres.png' });
  await ctx.close();
  // 2. Carnet : repas d'Inès
  ({ ctx, p } = await demo(b, '2026-10-29T11:50:00+01:00'));
  await p.goto('http://localhost:4173/#/carnet'); await p.waitForTimeout(800);
  const chip = p.locator('.chip', { hasText: 'Inès' });
  taps.carnetChip = await box(chip);
  await p.screenshot({ path: O + 'carnet-leo.png' });
  await chip.click(); await p.waitForTimeout(500);
  await p.screenshot({ path: O + 'carnet-avant.png' });
  const repas = p.locator('.quick button', { hasText: 'Repas' });
  taps.carnetRepas = await box(repas);
  await repas.click(); await p.waitForTimeout(700);
  await p.screenshot({ path: O + 'carnet-sheet.png' });
  const opt = p.locator('dialog[open] .choice, dialog[open] button', { hasText: 'A tout mangé' }).first();
  taps.carnetOption = await box(opt);
  await opt.click(); await p.waitForTimeout(600);
  await p.screenshot({ path: O + 'carnet-apres.png' });
  const env = p.getByRole('button', { name: /Envoyer le résumé/ });
  taps.carnetEnvoyer = await box(env);
  await ctx.close();
  // 3. Mois et congés
  ({ ctx, p } = await demo(b, '2026-10-29T18:40:00+01:00'));
  await p.goto('http://localhost:4173/#/mois'); await p.waitForTimeout(900);
  await p.screenshot({ path: O + 'mois.png' });
  await p.addStyleTag({ content: '.tabbar{display:none!important}' });
  await p.screenshot({ path: O + 'mois-long.png', fullPage: true });
  taps.moisEnvoyer = await box(p.getByRole('button', { name: /Envoyer au parent/ }));
  await p.goto('http://localhost:4173/#/conges'); await p.waitForTimeout(900);
  await p.screenshot({ path: O + 'conges.png' });
  await ctx.close();
  fs.writeFileSync(O + 'taps.json', JSON.stringify(taps, null, 1));
  console.log(taps);
  await b.close();
})();
