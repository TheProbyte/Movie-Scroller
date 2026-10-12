// FlickPick service worker: app shell offline, posters cached, API always live.
const SHELL = 'mm-shell-v1';
const IMAGES = 'mm-images-v1';
const MAX_IMAGES = 400;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon.svg'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== IMAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.pathname.startsWith('/api/')) return; // always network

  // TMDB posters & logos: cache-first.
  if (url.hostname === 'image.tmdb.org') {
    event.respondWith(
      caches.open(IMAGES).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') {
          cache.put(req, res.clone());
          trim(IMAGES, MAX_IMAGES);
        }
        return res;
      }),
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // Navigations: network first, fall back to the cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(SHELL).then((c) => c.put('/', res.clone()));
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Hashed build assets: cache-first.
  if (url.pathname.startsWith('/assets/') || url.pathname.match(/\.(png|svg|webmanifest|woff2?)$/)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
  }
});
