// Remplace l'ancien service worker de ysaacmoise.github.io/pilote-am (audit C-110) :
// il efface les caches, se désinscrit et renvoie les pages ouvertes vers arvela.fr.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate('https://arvela.fr/');
  })());
});
