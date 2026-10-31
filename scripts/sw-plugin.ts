// Génère dist/sw.js avec la liste exacte des fichiers à mettre en cache (hors ligne complet).
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

export function swPlugin() {
  let outDir = 'dist';
  return {
    name: 'cc-service-worker',
    apply: 'build' as const,
    configResolved(cfg: { build: { outDir: string }; root: string }) {
      outDir = join(cfg.root, cfg.build.outDir);
    },
    closeBundle() {
      const files = walk(outDir)
        .map((p) => relative(outDir, p).split('\\').join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map') && !f.startsWith('videos/')); // vidéos : trop lourdes pour le hors ligne
      const hash = createHash('sha256');
      for (const f of files.sort()) hash.update(f).update(readFileSync(join(outDir, f)));
      const v = hash.digest('hex').slice(0, 10);
      const tpl = readFileSync(new URL('./sw-template.js', import.meta.url), 'utf8');
      const assets = ['./', ...files.map((f) => './' + f)];
      const sw = tpl.replace('__VERSION__', v).replace('__ASSETS__', JSON.stringify(assets));
      // écrit après la copie de public/
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
}
