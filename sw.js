const CACHE_NAME   = 'brickrat-v3';
const MODEL_CACHE  = 'brickrat-model-v1';
const MODEL_URL    = 'https://pub-4622c204bf054ed7ae6895e757c1af7f.r2.dev/baked.glb';

// ── Install: activate immediately ────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting());

// ── Activate: delete old caches, claim clients ───────────────────────
self.addEventListener('activate', event => {
  const keep = [CACHE_NAME, MODEL_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: route requests ─────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;

  // 3-D model — cache-first (158 MB, kept until browser evicts)
  if (request.url === MODEL_URL) {
    event.respondWith(modelCacheFirst(request));
    return;
  }

  // App shell (same-origin) — stale-while-revalidate
  if (request.url.startsWith(self.registration.scope)) {
    event.respondWith(staleWhileRevalidate(event));
  }
});

// ── Strategies ────────────────────────────────────────────────────────

async function modelCacheFirst(request) {
  const cache  = await caches.open(MODEL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  // Not cached yet — fetch, store, return
  const response = await fetch(request.url, { mode: 'cors' });
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE_NAME);

  // ?room= and other query params are client-side only — always serve the same shell
  const cleanUrl = new URL(event.request.url);
  cleanUrl.search = '';
  const key = cleanUrl.toString();

  const cached = await cache.match(key);

  if (cached) {
    // Serve from cache immediately; refresh in background
    event.waitUntil(
      fetch(key)
        .then(r => { if (r.ok) cache.put(key, r.clone()); })
        .catch(() => {})
    );
    return cached;
  }

  // No cache yet — fetch, store, return
  const response = await fetch(key);
  if (response.ok) cache.put(key, response.clone());
  return response;
}
