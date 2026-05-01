/**
 * ============================================================================
 * CANDOKIO POS — SERVICE WORKER (sw.js)
 * ============================================================================
 * Strategi:
 * - Cache-first untuk aset statis (HTML, CSS, JS, icon, fonts)
 * - Network-first untuk API calls
 * - Fallback offline untuk aset yang belum di-cache
 * ============================================================================
 */

const CACHE_NAME = 'candokio-cache-v4';

// Daftar aset statis yang di-cache saat install
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './manifest.json',
  './config.txt',
  './js/app.js',
  './js/pwa.js',
  './css/pwa.css',
  './assets/icon.svg',
  './assets/icon-192.png'
];

// Daftar file view yang di-cache (lazy, saat pertama kali diakses)
const VIEW_FILES = [
  './views/view-dashboard.html',
  './views/view-pos.html',
  './views/view-products.html',
  './views/view-customers.html',
  './views/view-debt.html',
  './views/view-kas.html',
  './views/view-transactions.html',
  './views/view-reports.html',
  './views/view-profile.html',
  './views/view-settings.html',
  './views/view-register.html',
  './views/view-forgot-pw.html'
];

// Install: Cache aset statis
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching aset statis...');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate: Hapus cache lama
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Hapus cache lama:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Strategi hybrid
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (API POST calls)
  if (event.request.method !== 'GET') return;

  // Skip Google Apps Script API calls
  if (url.hostname.includes('script.google.com')) return;

  // Skip external CDN — biarkan browser handle caching-nya
  if (url.hostname !== location.hostname &&
      !url.hostname.includes('fonts.googleapis.com') &&
      !url.hostname.includes('fonts.gstatic.com')) {
    return;
  }

  // Cache-first untuk aset statis dan view files
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }

        // Jika tidak ada di cache, fetch dari network dan cache hasilnya
        return fetch(event.request)
          .then(response => {
            // Hanya cache response yang valid
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone response karena akan digunakan 2x (cache + return)
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(() => {
            // Fallback offline — tampilkan index.html untuk navigasi SPA
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match('./index.html');
            }
          });
      })
  );
});

// Sync: Background Sync API trigger
self.addEventListener('sync', event => {
  if (event.tag === 'sync-candokio-queue') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SYNC_QUEUE' }));
      })
    );
  }
});