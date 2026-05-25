const CACHE_NAME = 'zanju-cache-v2';
const urlsToCache = [
  './',
  './login.html',
  './dashboard.html',
  './manifest.json',
  './icon192.png',
  './icon512.png'
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
