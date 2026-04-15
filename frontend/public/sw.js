const CACHE_NAME = 'applied-v6';
const STATIC_ASSETS = [
  '/manifest.json',
  '/apple-touch-icon.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// Install: only cache true static assets (NOT index.html)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: claim all clients immediately and wipe old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      ),
      self.clients.claim(),
    ])
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Network-only: API calls and external services
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('anthropic.com') ||
    url.hostname.includes('finnhub.io') ||
    url.hostname.includes('allorigins.win') ||
    url.hostname.includes('corsproxy.io')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // HTML pages: ALWAYS network-first so updated CSS/JS deploys instantly
  if (event.request.mode === 'navigate' ||
      url.pathname === '/' ||
      url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Fonts: stale-while-revalidate
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(event.request);
        const fresh = fetch(event.request).then(res => {
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fresh;
      })
    );
    return;
  }

  // Static assets (icons, manifest): cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res.ok) {
          caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
        }
        return res;
      });
    })
  );
});
