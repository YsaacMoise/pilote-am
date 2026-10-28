// Construction du site : un seul fichier JavaScript, plus les fichiers statiques.
// Usage : node build.mjs [--watch]
import { build, context } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const preview = process.argv.includes('--preview');
const out = preview ? 'dist-preview' : 'dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const options = {
  entryPoints: { app: 'src/main.tsx' },
  bundle: true,
  format: 'esm',
  target: ['safari15'],
  outdir: out,
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  minify: true,
  sourcemap: false,
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"', __APP_VERSION__: JSON.stringify(new Date().toISOString().slice(0, 10)), __PREVIEW__: String(preview) },
  logLevel: 'info',
};

async function finish() {
  cpSync('public', out, { recursive: true });
  cpSync('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', `${out}/pdf.worker.min.mjs`);
  mkdirSync(`${out}/fonts`, { recursive: true });
  cpSync('node_modules/@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2', `${out}/fonts/instrument-sans-latin-wght-normal.woff2`);
  // Version du cache du service worker = empreinte des fichiers construits
  const chunks = existsSync(`${out}/chunks`) ? readdirSync(`${out}/chunks`).map((f) => `./chunks/${f}`) : [];
  const h = createHash('sha256').update(readFileSync(`${out}/app.js`)).update(readFileSync(`${out}/index.html`)).update(readFileSync(`${out}/styles.css`));
  for (const c of chunks) h.update(readFileSync(`${out}/${c.slice(2)}`));
  const hash = h.digest('hex').slice(0, 12);
  const sw = readFileSync(`${out}/sw.js`, 'utf8').replace('__VERSION__', hash).replace(", '__CHUNKS__'", chunks.map((c) => `, '${c}'`).join(''));
  writeFileSync(`${out}/sw.js`, sw);
  writeFileSync(`${out}/version.txt`, hash);
  console.log(`Version ${hash}`);
}

if (process.argv.includes('--watch')) {
  const ctx = await context({ ...options, plugins: [{ name: 'finish', setup(b) { b.onEnd(() => finish()); } }] });
  await ctx.watch();
} else {
  await build(options);
  await finish();
}
