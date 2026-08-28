/* PASSERMARKEN · Service Worker
   Strategie: Cache-First für alles Lokale (das Spiel muss im Flugmodus laufen),
   Stale-While-Revalidate für Webfonts (optional, bricht offline nicht). */
const BUILD = 'passermarken-v1.0.0';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg'
];
const RUNTIME = 'passermarken-runtime-v1';

self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(BUILD)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== BUILD && k !== RUNTIME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const crossOrigin = url.origin !== self.location.origin;

  /* Webfonts & CDN: im Hintergrund aktualisieren, aber nie blockieren */
  if (crossOrigin) {
    ev.respondWith(
      caches.open(RUNTIME).then(cache =>
        cache.match(req).then(hit => {
          const fresh = fetch(req)
            .then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; })
            .catch(() => hit);
          return hit || fresh;
        })
      )
    );
    return;
  }

  /* Alles Lokale: Cache-First, Navigation fällt auf index.html zurück */
  ev.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(BUILD).then(c => c.put(req, copy));
      return res;
    }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
