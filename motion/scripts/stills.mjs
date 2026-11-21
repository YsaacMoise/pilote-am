// Rend plusieurs images fixes d'une composition en un seul regroupement (plus rapide que « remotion still » en boucle).
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import path from 'node:path';
const [id, times, prefix] = process.argv.slice(2);
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const comp = await selectComposition({ serveUrl, id, browserExecutable: '/usr/bin/google-chrome' });
for (const t of times.split(',').map(Number)) {
  await renderStill({ composition: comp, serveUrl, frame: Math.round(t * 30), output: `out/stills/${prefix}-${t}.jpeg`, imageFormat: 'jpeg', jpegQuality: 85, browserExecutable: '/usr/bin/google-chrome' });
}
console.log('ok');
