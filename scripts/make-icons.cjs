// Génère les icônes PNG à partir de scripts/icon.svg (lancé à la main, les PNG sont versionnés).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8');
  const b = await chromium.launch();
  const p = await b.newPage();
  const shot = async (size, pad, out) => {
    await p.setViewportSize({ width: size, height: size });
    const inner = Math.round(size * (1 - 2 * pad));
    await p.setContent(`<html><body style="margin:0;background:#3346C8;display:grid;place-items:center;width:${size}px;height:${size}px">
      <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
    await p.screenshot({ path: path.join(__dirname, '..', 'public', 'icons', out) });
  };
  await shot(180, 0, 'apple-touch-icon.png');
  await shot(192, 0, 'icon-192.png');
  await shot(512, 0, 'icon-512.png');
  await shot(512, 0.1, 'icon-maskable-512.png');
  await shot(32, 0, 'favicon-32.png');
  await b.close();
})();
