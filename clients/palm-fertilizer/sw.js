const CACHE_NAME = 'palm-fertilizer-v1.6';
const ASSETS = [
  '/', '/index.html', '/style.css', '/main.js', '/app.js', '/dotenv.js',
  '/views/view-dashboard.html', '/views/view-ritase.html',
  '/views/view-pemupukan.html', '/views/view-material.html',
  '/views/view-lahan.html', '/views/view-profile.html',
  '/views/view-settings.html', '/views/view-register.html',
  '/views/view-forgot-pw.html', '/views/view-laporan.html',
  '/lib/xlsx.full.min.js',
  '/PWA/pwa.css', '/PWA/pwa.js',
  '/PWA/PalmFert-192.png',
  '/PWA/PalmFert-512.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.min.js',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.all.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

// Install — cache all assets
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS).catch(() => {})));
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

// Fetch — Stale-While-Revalidate (skip blob/data URLs to preserve download filenames)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  if (url.startsWith('blob:') || url.startsWith('data:')) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// Background Sync
self.addEventListener('sync', e => {
  if (e.tag === 'sync-data') {
    e.waitUntil(syncPendingData());
  }
});

async function syncPendingData() {
  // In production, this reads sync_queue from IndexedDB and POSTs to GAS
  console.log('[SW] Background sync triggered');
}
