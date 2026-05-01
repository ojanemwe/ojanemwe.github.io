/* =========================================
   LOGIKA SERVICE WORKER & INSTALL PWA
   ========================================= */

// 1. Daftarkan Service Worker & Message Listener
if ('serviceWorker' in navigator) {
    const registerSW = () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => {
                console.log('Service Worker aktif:', reg.scope);
                // Minta izin background sync (bila didukung browser)
                if ('sync' in reg) {
                    navigator.serviceWorker.ready.then(swRegistration => {
                        return swRegistration.sync.register('sync-candokio-queue');
                    }).catch(err => console.log('Background Sync gagal didaftarkan', err));
                }
            })
            .catch(err => console.log('Service Worker gagal:', err));
    };

    if (document.readyState === 'complete') {
        registerSW();
    } else {
        window.addEventListener('load', registerSW);
    }

    // Dengarkan pesan dari Service Worker (misal dari Background Sync API)
    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data && event.data.type === 'SYNC_QUEUE') {
            console.log('Background Sync dipicu dari Service Worker!');
            if (typeof OfflineService !== 'undefined') {
                OfflineService.processQueue();
            }
        }
    });
}

// 2. Logika Tombol Install
let deferredPrompt;
const installBtn = document.getElementById('install-btn');

window.addEventListener('beforeinstallprompt', (e) => {
    // Mencegah browser memunculkan prompt otomatis
    e.preventDefault();
    // Simpan event agar bisa dipicu nanti
    deferredPrompt = e;
    // Munculkan tombol install buatan kita
    if (installBtn) {
        installBtn.style.display = 'flex';
    }
});

if (installBtn) {
    installBtn.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response: ${outcome}`);
            deferredPrompt = null;
            installBtn.style.display = 'none';
        }
    });
}

// Sembunyikan tombol jika sudah terinstal
window.addEventListener('appinstalled', () => {
    if (installBtn) {
        installBtn.style.display = 'none';
    }
    console.log('Aplikasi berhasil dipasang!');
});