// Sert dist/ sous /pilote-am/cc/ comme GitHub Pages (pour les tests locaux).
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
const root = new URL('../dist/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const port = Number(process.argv[2] ?? 4173);
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/pilote-am/cc/')) { res.writeHead(404); res.end('404'); return; }
  let p = join(root, decodeURIComponent(url.pathname.slice('/pilote-am/cc/'.length)));
  try { if ((await stat(p)).isDirectory()) p = join(p, 'index.html'); const b = await readFile(p); res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('404'); }
}).listen(port, () => console.log('http://localhost:' + port + '/pilote-am/cc/'));
