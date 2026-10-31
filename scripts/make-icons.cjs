// Génère les icônes de l'app à partir des déclinaisons de la charte « Les Galets d'Équilibre » (lancé à la main, les fichiers sont versionnés).
// 03 « Icône App PWA » : fond Basalte, galets Albâtre, perle Terre d'Argile, symbole à 90 % (translate 6, scale 0.9), coins rx 26/120.
// 04 « Symbole seul & favicon » : les galets sans fond.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const INK = '#1E201D', BG = '#F7F4EF', ACCENT = '#C87D55';
const galets = (p, a) => `<rect x="33" y="18" width="20" height="78" rx="10" transform="rotate(19 43 57)" fill="${p}"/>`
  + `<rect x="67" y="18" width="20" height="78" rx="10" transform="rotate(-19 77 57)" fill="${p}" opacity="0.88"/>`
  + `<circle cx="60" cy="73" r="11.5" fill="${a}"/>`;
const svg = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">${inner}</svg>`;
// Icône PWA de la charte, coins arrondis
const pwaDark = svg(`<rect width="120" height="120" rx="26" fill="${INK}"/><g transform="translate(6, 6) scale(0.9)">${galets(BG, ACCENT)}</g>`);
// Plein cadre pour iOS (qui arrondit lui-même) et pour l'icône « maskable » d'Android (symbole dans la zone sûre de 80 %)
const fullBleed = (scale) => { const o = (120 - 120 * scale) / 2; return svg(`<rect width="120" height="120" fill="${INK}"/><g transform="translate(${o}, ${o}) scale(${scale})">${galets(BG, ACCENT)}</g>`); };
const symbol = svg(galets(INK, ACCENT));
// Favicon vectoriel : galets à l'encre, ou en albâtre quand le navigateur est en sombre
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><style>.p{fill:${INK}}@media (prefers-color-scheme: dark){.p{fill:${BG}}}</style>`
  + `<rect class="p" x="33" y="18" width="20" height="78" rx="10" transform="rotate(19 43 57)"/>`
  + `<rect class="p" x="67" y="18" width="20" height="78" rx="10" transform="rotate(-19 77 57)" opacity="0.88"/>`
  + `<circle cx="60" cy="73" r="11.5" fill="${ACCENT}"/></svg>`;

const out = (f) => path.join(__dirname, '..', 'public', 'icons', f);
(async () => {
  fs.writeFileSync(out('favicon.svg'), faviconSvg);
  fs.writeFileSync(path.join(__dirname, 'icon.svg'), pwaDark);
  const b = await chromium.launch();
  const p = await b.newPage();
  const shot = async (s, size, file) => {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:transparent">${s.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await p.screenshot({ path: out(file), omitBackground: true });
  };
  await shot(fullBleed(0.9), 180, 'apple-touch-icon.png');
  await shot(pwaDark, 192, 'icon-192.png');
  await shot(pwaDark, 512, 'icon-512.png');
  await shot(fullBleed(0.72), 512, 'icon-maskable-512.png');
  await shot(symbol, 32, 'favicon-32.png');
  await b.close();
})();
