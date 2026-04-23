const CACHE_NAME = 'pwa-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Install Service Worker dan simpan file ke cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Gunakan file dari cache saat offline
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Kembalikan response dari cache jika ada, jika tidak ambil dari jaringan
        return response || fetch(event.request);
      })
  );
});