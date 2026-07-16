// Bump CACHE on every deploy so clients drop stale shells/assets.
const CACHE = 'bgc-v18';
const PRECACHE = ['/manifest.webmanifest', '/favicon.svg', '/logo.png'];

self.addEventListener('install', (event) => {
  // Activate immediately so users get the new SW without a second visit.
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/socket.io')) return;

  // HTML navigations: always prefer network so deploys show up immediately.
  // Only fall back to cache when offline.
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/index.html') || caches.match('/')))
    );
    return;
  }

  // Service worker itself + sw scripts: network first
  if (url.pathname.endsWith('sw.js') || url.pathname.endsWith('toffee-sw.js')) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  // Hashed build assets under /assets/ are immutable — cache-first is safe.
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (!res || res.status !== 200 || res.type !== 'basic') return res;
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        });
      })
    );
    return;
  }

  // Everything else same-origin: network first, cache fallback.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
  }
});
