/** Offline support: precache the app shell, then serve network-first with a cache fallback. */
const CACHE_NAME = 'kongu-dictionary-v1';
const NETWORK_TIMEOUT_MS = 4000;
const APP_SHELL = [
  './', './index.html', './about.html', './contribute.html', './manifest.json',
  './assets/styles.css?v=1', './assets/theme.js?v=1', './assets/main.js?v=1', './assets/store.js?v=1',
  './assets/search.js?v=1', './assets/selectors.js?v=1', './assets/render.js?v=1', './assets/router.js?v=1',
  './assets/csv.js?v=1', './assets/register-sw.js?v=1', './data/entries.csv',
  './data/categories.csv', './data/sources.csv', './assets/icon.svg',
  './assets/icon-192.png', './assets/icon-512.png', './assets/og-preview.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    const response = await fetch(request, { signal: controller.signal });
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      void cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') return caches.match('./index.html');
    return Response.error();
  } finally {
    clearTimeout(timeout);
  }
}
