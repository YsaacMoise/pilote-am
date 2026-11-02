// Refait les vidéos d'Arvela d'une seule commande, à partir de l'app telle qu'elle est aujourd'hui.
//   1. Charte : couleurs, polices et logo lus dans l'app (scripts/charte.mjs).
//   2. App : construite avec le faux service en ligne, servie en local avec ce faux service.
//   3. Captures : chaque scénario (videos.json) refait les gestes dans la vraie app et mesure les positions.
//   4. Voix : repères de chaque fiche (voix/*.json) mesurés dans le fichier son ; mots mal prononcés signalés.
//   5. Rendu Remotion, finition du son (scripts/final.sh), planche de contrôle (out/controle-<id>.png).
// Usage (depuis motion/) :
//   node scripts/videos.mjs                 tout refaire
//   node scripts/videos.mjs essai-B         une seule vidéo (et ce dont elle dépend)
//   node scripts/videos.mjs --sans-rendu    captures et voix seulement (rapide, pour vérifier qu'aucune étape ne casse)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MOTION = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.resolve(MOTION, '..');
const conf = JSON.parse(fs.readFileSync(path.join(MOTION, 'videos.json'), 'utf8'));
const args = process.argv.slice(2);
const sansRendu = args.includes('--sans-rendu');
const demandees = args.filter((a) => !a.startsWith('--'));
const videos = demandees.length ? conf.videos.filter((v) => demandees.includes(v.id)) : conf.videos;
if (!videos.length) { console.error(`Vidéo inconnue : ${demandees.join(', ')}. Vidéos connues : ${conf.videos.map((v) => v.id).join(', ')}`); process.exit(1); }
const NAVIGATEUR = process.env.REMOTION_BROWSER || ['/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'].find((f) => fs.existsSync(f));
const PORT_APP = 4175, PORT_CLOUD = 4180;
const debut = Date.now();
const titre = (t) => console.log(`\n=== ${t} (${Math.round((Date.now() - debut) / 1000)} s)`);

function lancer(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { stdio: 'inherit', cwd: MOTION, ...opts, env: { ...process.env, ...(opts.env ?? {}) } });
  if (r.status !== 0) { arreter(); console.error(`\nArrêt : « ${cmd} ${argv.join(' ')} » a échoué.`); process.exit(1); }
}

// Même chose sans bloquer : indispensable quand le serveur de l'app tourne dans ce processus pendant les captures
function lancerSansBloquer(cmd, argv, opts = {}) {
  return new Promise((ok) => {
    const c = spawn(cmd, argv, { stdio: 'inherit', cwd: MOTION, ...opts, env: { ...process.env, ...(opts.env ?? {}) } });
    c.on('exit', (code) => {
      if (code !== 0) { arreter(); console.error(`\nArrêt : « ${cmd} ${argv.join(' ')} » a échoué.`); process.exit(1); }
      ok();
    });
  });
}

// Petit serveur de fichiers pour l'app construite
function servir(dossier, port) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.vtt': 'text/vtt', '.mjs': 'text/javascript' };
  return http.createServer((req, res) => {
    let f = path.join(dossier, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(dossier)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(port, '127.0.0.1');
}

let serveur, cloud;
function arreter() { serveur?.close(); cloud?.kill(); }
process.on('exit', arreter);

// 1. Charte
titre('Charte lue dans l’app');
lancer('node', ['scripts/charte.mjs']);

// 2 et 3. App et captures
const scenarios = [...new Set(videos.flatMap((v) => v.captures))];
if (scenarios.length) {
  titre('Construction de l’app (avec le faux service en ligne)');
  const build = path.join(MOTION, '.build/app-fake');
  lancer('npx', ['vite', 'build', '--outDir', path.relative(APP, build), '--emptyOutDir', '--logLevel', 'error'], { cwd: APP, env: { VITE_FAKE_CLOUD: `http://localhost:${PORT_CLOUD}` } });
  serveur = servir(build, PORT_APP);
  cloud = spawn('node', ['scripts/fake-cloud.mjs', String(PORT_CLOUD)], { cwd: APP, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    const ok = await fetch(`http://localhost:${PORT_CLOUD}/`).then(() => true, () => false);
    if (ok) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  for (const s of scenarios) {
    titre(`Captures : ${s}`);
    await lancerSansBloquer('node', [conf.captures[s].script], { env: { BASE_FAKE: `http://127.0.0.1:${PORT_APP}/`, CLOUD: `http://localhost:${PORT_CLOUD}`, NODE_PATH: process.env.NODE_PATH ?? '/opt/npm-tools/node_modules' } });
  }
  arreter();
}

// 4. Voix
const fiches = [...new Set(videos.flatMap((v) => v.voix))];
for (const f of fiches) {
  titre(`Repères de la voix : ${f}`);
  lancer('python3', ['scripts/reperes.py', `voix/${f}.json`]);
}

// 5. Rendu, finition, planche de contrôle
if (!sansRendu) {
  fs.mkdirSync(path.join(MOTION, 'out'), { recursive: true });
  for (const v of videos) {
    titre(`Rendu : ${v.id}`);
    const brut = `out/raw-${v.id}.mp4`;
    lancer('npx', ['remotion', 'render', v.composition, brut, '--concurrency=2', '--log=error', ...(NAVIGATEUR ? [`--browser-executable=${NAVIGATEUR}`] : [])]);
    lancer('bash', ['scripts/final.sh', brut, v.sortie]);
    const d = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', v.sortie], { cwd: MOTION }).stdout.toString());
    lancer('ffmpeg', ['-v', 'error', '-y', '-i', v.sortie, '-vf', `fps=8/${d},scale=270:-1,tile=8x1`, '-frames:v', '1', `out/controle-${v.id}.png`]);
  }
}

// Bilan
titre('Terminé');
for (const f of fiches) {
  const r = JSON.parse(fs.readFileSync(path.join(MOTION, `public/voix/${f}.reperes.json`), 'utf8'));
  if (r.a_ecouter.length) console.log(`Voix « ${f} » : à écouter ${r.a_ecouter.map((x) => `vers ${x.vers} s (« ${x.attendu} » entendu « ${x.entendu} »)`).join(' ; ')}`);
}
if (!sansRendu) for (const v of videos) console.log(`${v.id} : ${v.sortie} · planche out/controle-${v.id}.png`);
process.exit(0);
