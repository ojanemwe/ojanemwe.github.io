const CACHE_NAME = 'zanju-cache-v1';
const urlsToCache = [
  './',
  './login.html',
  './dashboard.html',
  './manifest.json',
  './icon192.png',
  './icon512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
