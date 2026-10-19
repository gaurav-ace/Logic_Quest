// Service worker template. The build (vite.config.ts) replaces the two placeholders and
// writes the result to dist/sw.js. Plain JS because it is copied, not bundled.
//
// Strategy: "app shell". Every app file is cached at install time, and served from the cache
// first, so the app opens instantly and works with no network. A new deploy changes the
// version, which installs a fresh cache and deletes the old one.

const VERSION = '__CACHE_VERSION__';
const PRECACHE = __PRECACHE_LIST__;
const CACHE = `logic-quest-${VERSION}`;

self.addEventListener('install', (event) => {
  // skipWaiting: the whole app is one small bundle loaded at start, so taking over an open
  // page early is safe, and the learner gets fixes without closing every tab first.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('logic-quest-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Any page URL (including ones with a query string) opens the app shell.
    event.respondWith(
      caches.match(self.registration.scope, { cacheName: CACHE }).then((cached) => cached || fetch(request)),
    );
    return;
  }

  event.respondWith(caches.match(request, { cacheName: CACHE }).then((cached) => cached || fetch(request)));
});
