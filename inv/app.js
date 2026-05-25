// 1. Registrasi Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker terdaftar:', reg.scope))
      .catch(err => console.error('Service Worker gagal:', err));
  });
}

// 2. Logika Manajemen Tombol Install
let deferredPrompt;
const installBtn = document.getElementById('installBtn');

window.addEventListener('beforeinstallprompt', (e) => {
  // Mencegah banner bawaan browser muncul otomatis
  e.preventDefault();
  deferredPrompt = e;
  // Menampilkan tombol kustom
  if (installBtn) {
    installBtn.classList.remove('hidden');
  }
});

if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('Pengguna menerima instalasi PWA');
      }
      deferredPrompt = null;
      installBtn.classList.add('hidden');
    }
  });
}

window.addEventListener('appinstalled', () => {
  // Sembunyikan tombol jika aplikasi sukses terpasang
  if (installBtn) {
    installBtn.classList.add('hidden');
  }
  deferredPrompt = null;
  console.log('PWA berhasil diinstal di perangkat');
});
