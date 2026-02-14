const CACHE_NAME = 'selfquiz-cache-v1.3.33';
const ASSETS = [
  './',
  './index.html',
  './theme.js',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './json-worker.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

// Helper to limit cache size (LRU)
async function trimCache(cacheNameOrInstance, maxItems) {
  let cache;
  if (typeof cacheNameOrInstance === 'string') {
    cache = await caches.open(cacheNameOrInstance);
  } else {
    cache = cacheNameOrInstance;
  }
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    const keysToDelete = keys.slice(0, keys.length - maxItems);
    // Optimization: Delete concurrently (approx 3x faster than serial loop)
    await Promise.all(keysToDelete.map(key => cache.delete(key)));
  }
}

self.addEventListener('activate', event => {
  const allowedCaches = [CACHE_NAME, 'selfquiz-data-v1', 'selfquiz-fonts-v1'];
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => !allowedCaches.includes(key)).map(key => caches.delete(key))
    ))
  );
});

self.addEventListener('fetch', event => {
  // Navigation strategy: Return App Shell (index.html)
  // Ensures offline access even with query parameters (e.g., ?source=pwa)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(response => {
        return response || fetch(event.request);
      })
    );
    return;
  }

  // Runtime caching for quiz data (JSON files) - Stale-While-Revalidate
  if (event.request.url.endsWith('.json')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open('selfquiz-data-v1');
        const cachedResponse = await cache.match(event.request);

        const fetchPromise = fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
            trimCache(cache, 10);
          }
          return networkResponse;
        }).catch(() => {
          // Network failed, nothing to do
        });

        if (cachedResponse) {
          event.waitUntil(fetchPromise);
          return cachedResponse;
        }

        return fetchPromise;
      })()
    );
    return;
  }

  // Runtime caching for fonts (Cache First)
  if (event.request.destination === 'font') {
    event.respondWith(
      (async () => {
        const cache = await caches.open('selfquiz-fonts-v1');
        const cachedResponse = await cache.match(event.request.url);
        if (cachedResponse) {
          return cachedResponse;
        }
        const networkResponse = await fetch(event.request);
        if (networkResponse && networkResponse.status === 200) {
          event.waitUntil(
            cache.put(event.request.url, networkResponse.clone()).then(() => {
              trimCache(cache, 5);
            })
          );
        }
        return networkResponse;
      })()
    );
    return;
  }

  // Default strategy for other assets (Cache First)
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
