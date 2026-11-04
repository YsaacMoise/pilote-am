// Sert dist/ sous /pilote-am/ comme GitHub Pages (pour les tests locaux).
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
const root = new URL('../dist/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const port = Number(process.argv[2] ?? 4173);
// CSP=1 : applique la même règle de sécurité (Content-Security-Policy) que firebase.json, pour que les
// parcours de test échouent si l'app charge quelque chose que la règle interdit en production.
// CSP_CONNECT : adresses en plus pour les tests (par exemple le faux service en ligne http://localhost:4180).
let csp = null;
if (process.env.CSP) {
  const conf = JSON.parse(await readFile(new URL('../firebase.json', import.meta.url), 'utf8'));
  const all = conf.hosting.headers.find((h) => h.source === '**');
  csp = all.headers.find((h) => h.key === 'Content-Security-Policy').value.replace('upgrade-insecure-requests', '').trim().replace(/;$/, '');
  if (process.env.CSP_CONNECT) csp = csp.replace("connect-src 'self'", "connect-src 'self' " + process.env.CSP_CONNECT);
}
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/pilote-am/')) { res.writeHead(404); res.end('404'); return; }
  let p = join(root, decodeURIComponent(url.pathname.slice('/pilote-am/'.length)));
  try { if ((await stat(p)).isDirectory()) p = join(p, 'index.html'); const b = await readFile(p); res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream', ...(csp ? { 'content-security-policy': csp } : {}) }); res.end(b); }
  catch { res.writeHead(404); res.end('404'); }
}).listen(port, () => console.log('http://localhost:' + port + '/pilote-am/'));
