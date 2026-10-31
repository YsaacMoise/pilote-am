// Génère les icônes PNG à partir de scripts/icon.svg (lancé à la main, les PNG sont versionnés).
// Fond papier de la charte (#F7F4EF), symbole des galets centré avec une marge.
const { chromium } = require('playwright');
const FOND = '#F7F4EF';
const fs = require('fs');
const path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8');
  const b = await chromium.launch();
  const p = await b.newPage();
  const shot = async (size, pad, out) => {
    await p.setViewportSize({ width: size, height: size });
    const inner = Math.round(size * (1 - 2 * pad));
    await p.setContent(`<html><body style="margin:0;background:${FOND};display:flex;align-items:center;justify-content:center;overflow:hidden;width:${size}px;height:${size}px">
      <div style="flex:none;width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
    await p.screenshot({ path: path.join(__dirname, '..', 'public', 'icons', out) });
  };
  await shot(180, 0.03, 'apple-touch-icon.png');
  await shot(192, 0.03, 'icon-192.png');
  await shot(512, 0.03, 'icon-512.png');
  await shot(512, 0.12, 'icon-maskable-512.png');
  await shot(32, -0.12, 'favicon-32.png');
  await b.close();
})();
