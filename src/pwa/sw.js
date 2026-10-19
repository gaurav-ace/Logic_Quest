// Service worker template. The build (vite.config.ts) replaces the two placeholders and
// writes the result to dist/sw.js. Plain JS because it is copied, not bundled.
//
// Strategy: every app file is cached at install time. Pages are fetched from the network first
// (with a short timeout), so an online launch always gets the latest deploy; the cached copy is
// the offline fallback. Other files (hashed, so they never change) come from the cache first.
// A new deploy changes the version, which installs a fresh cache and deletes the old one.

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
    event.respondWith(pageFromNetworkFirst(request));
    return;
  }

  event.respondWith(caches.match(request, { cacheName: CACHE }).then((cached) => cached || fetch(request)));
});

/** How long to wait for the network before opening the cached app instead (slow connections). */
const NETWORK_TIMEOUT_MS = 3000;

async function pageFromNetworkFirst(request) {
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
    ]);
    if (response.ok) return response;
  } catch {
    // Offline or too slow: fall through to the cached copy.
  }
  // Any page URL (including ones with a query string) opens the cached app shell. The fresh
  // response is deliberately not cached here: it may name new files this cache doesn't have.
  const cached = await caches.match(self.registration.scope, { cacheName: CACHE });
  return cached || fetch(request);
}
