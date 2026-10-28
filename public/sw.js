// Service worker : le site fonctionne sans réseau une fois ouvert une première fois.
const VERSION = '__VERSION__';
const CACHE = `pilote-am-${VERSION}`;
const SHELL = ['./', './index.html', './app.js', './styles.css', './manifest.webmanifest', './icon-180.png', './icon-512.png', './pdf.worker.min.mjs', './fonts/instrument-sans-latin-wght-normal.woff2', '__CHUNKS__'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('pilote-am-') && k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;
  // La version concurrente (sous /cc/) a son propre fonctionnement : on n'y touche pas
  if (url.pathname.includes('/cc/')) return;

  // Pages : réseau d'abord (pour recevoir les mises à jour), cache en secours
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  // Fichiers du site : cache d'abord
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
