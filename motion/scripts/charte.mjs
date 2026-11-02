// Charte des vidéos lue dans l'app : couleurs (variables du thème clair de src/styles.css), polices (@font-face) et logo (src/ui/Logo.tsx).
// Écrit motion/src/charte.json et copie les polices dans motion/public/fonts/. Si la charte de l'app change, relancer ce script suffit.
// Usage : node scripts/charte.mjs   (depuis motion/)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const motion = path.resolve(ici, '..');
const app = path.resolve(motion, '..');
const css = fs.readFileSync(path.join(app, 'src/styles.css'), 'utf8');

// 1. Variables du premier bloc :root (thème clair)
const debut = css.indexOf(':root {');
if (debut < 0) throw new Error('Charte : bloc « :root { » introuvable dans src/styles.css');
let prof = 0, fin = debut;
for (let i = css.indexOf('{', debut); i < css.length; i++) {
  if (css[i] === '{') prof++;
  if (css[i] === '}' && --prof === 0) { fin = i; break; }
}
const bloc = css.slice(debut, fin).replace(/\/\*[\s\S]*?\*\//g, '');
const vars = {};
for (const m of bloc.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
const besoin = ['bg', 'surface', 'surface-2', 'line', 'ink', 'ink-2', 'accent', 'accent-large', 'accent-ink', 'accent-soft', 'sauge', 'ok', 'ok-soft', 'warn', 'warn-soft', 'font-body', 'font-display', 'font-num'];
const manque = besoin.filter((k) => !vars[k]);
if (manque.length) throw new Error(`Charte : variables absentes de :root dans src/styles.css : ${manque.map((k) => '--' + k).join(', ')}`);

// 2. Polices : chaque @font-face, fichier copié depuis node_modules de l'app
const polices = [];
fs.mkdirSync(path.join(motion, 'public/fonts'), { recursive: true });
for (const m of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
  const b = m[1];
  const famille = /font-family:\s*'([^']+)'/.exec(b)?.[1];
  const style = /font-style:\s*(\w+)/.exec(b)?.[1] ?? 'normal';
  const poids = /font-weight:\s*([\d ]+)/.exec(b)?.[1]?.trim() ?? '400';
  const url = /url\('([^']+)'\)/.exec(b)?.[1];
  if (!famille || !url) continue;
  const source = path.join(app, 'node_modules', url);
  if (!fs.existsSync(source)) throw new Error(`Charte : police introuvable ${source} (lancer « npm ci » à la racine)`);
  const fichier = path.basename(url);
  fs.copyFileSync(source, path.join(motion, 'public/fonts', fichier));
  polices.push({ famille, style, poids, fichier });
}

// 3. Logo : éléments du SVG de src/ui/Logo.tsx
const logoSrc = fs.readFileSync(path.join(app, 'src/ui/Logo.tsx'), 'utf8');
const svg = /<svg[^>]*viewBox="([^"]+)"[^>]*>([\s\S]*?)<\/svg>/.exec(logoSrc);
if (!svg) throw new Error('Charte : SVG du logo introuvable dans src/ui/Logo.tsx');
const elements = [...svg[2].matchAll(/<(rect|circle|path|ellipse)\s([^>]*?)\/>/g)].map((e) => {
  const attrs = {};
  for (const a of e[2].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
  return { tag: e[1], attrs };
});

const charte = {
  source: 'Généré par motion/scripts/charte.mjs depuis src/styles.css et src/ui/Logo.tsx — ne pas modifier à la main',
  couleurs: Object.fromEntries(Object.entries(vars).filter(([k, v]) => /^#|^rgb/.test(v)).map(([k, v]) => [k, v])),
  familles: { body: vars['font-body'], display: vars['font-display'], num: vars['font-num'] },
  polices,
  logo: { viewBox: svg[1], elements },
};
fs.writeFileSync(path.join(motion, 'src/charte.json'), JSON.stringify(charte, null, 1));
console.log(`charte : ${Object.keys(charte.couleurs).length} couleurs, ${polices.length} polices, logo ${elements.length} éléments`);
