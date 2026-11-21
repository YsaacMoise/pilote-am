import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { swPlugin } from './scripts/sw-plugin';

// Version affichée dans l'app et jointe à la mesure d'usage (C-042) : commit court + date de construction.
// Paquet de publication : version.txt (ajouté au paquet, absent du dépôt) fige la version, pour que le fichier
// principal construit (assets/index-….js) soit le même quel que soit le jour de construction (empreinte-attendue.txt).
function appVersion(): string {
  try {
    const figee = readFileSync('version.txt', 'utf8').trim();
    if (figee) return figee;
  } catch { /* pas de version figée : version de développement */ }
  let sha = (process.env.GITHUB_SHA || '').slice(0, 7);
  if (!sha) {
    try { sha = execSync('git rev-parse --short HEAD').toString().trim(); } catch { sha = 'local'; }
  }
  return `${sha} (${new Date().toISOString().slice(0, 10)})`;
}

export default defineConfig({
  base: './',
  plugins: [preact(), swPlugin()],
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  build: { target: 'es2020', assetsInlineLimit: 0, chunkSizeWarningLimit: 1500 },
  test: { include: ['tests/**/*.test.ts'] },
} as any);
