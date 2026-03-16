// Bump this string on every deploy to evict the old cache.
const CACHE = 'stickerdays-v2';

self.addEventListener('install', () => {
  // Nothing to pre-cache — assets are hashed by Vite and fetched on demand.
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Delete every cache except the current one.
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;

  const url = new URL(e.request.url);

  // ── Navigation requests (HTML pages) ──────────────────────────────────────
  // Always fetch from the network so the browser gets the latest index.html
  // with correct hashed asset references after each Vercel deployment.
  // Falling back to a stale cached HTML is what causes the MIME-type error:
  // old HTML references old /assets/*.js filenames that no longer exist, so
  // Vercel's catch-all rewrite returns index.html in their place, and the
  // browser rejects HTML where it expected JavaScript.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/'))
    );
    return;
  }

  // ── Vite-hashed assets (/assets/*) ────────────────────────────────────────
  // These filenames include a content hash so they are immutable — safe to
  // serve from cache indefinitely and populate on first fetch.
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // ── Everything else (manifest, icons, sw itself, …) ───────────────────────
  // Network first, fall back to cache when offline.
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
