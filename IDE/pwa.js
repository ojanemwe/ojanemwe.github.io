/* =========================================
   LOGIKA SERVICE WORKER & INSTALL PWA
   ========================================= */

// 1. Daftarkan Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker aktif:', reg.scope))
            .catch(err => console.log('Service Worker gagal:', err));
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
        installBtn.style.display = 'block';
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