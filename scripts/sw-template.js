// Service worker d’Arvela (version de travail). Caches préfixés « pam- ».
// La base Claude Code est servie sous /cc/ sur la même origine : on n'y touche jamais.
const VERSION = '__VERSION__';
const CACHE = 'pam-' + VERSION;
const ASSETS = __ASSETS__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('pam-') && k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'pam-skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  // La base enregistrée sous /cc/ a son propre service worker
  if (url.pathname.startsWith(scope.pathname + 'cc/')) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE).then((c) => c.match('./').then((r) => r || fetch(req)))
    );
    return;
  }
  event.respondWith(
    caches.open(CACHE).then((c) =>
      c.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') c.put(req, res.clone());
        return res;
      }))
    )
  );
});
