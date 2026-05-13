/* === PWA Install Logic === */
(() => {
  let deferredPrompt = null;
  const banner = document.getElementById('pwa-install-banner');
  const btnInstall = document.getElementById('pwa-install-btn');
  const btnDismiss = document.getElementById('pwa-dismiss-btn');

  if (!banner || !btnInstall) return;

  // Capture the beforeinstallprompt event
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Only show if user hasn't dismissed recently
    const dismissed = localStorage.getItem('pf_pwa_dismissed');
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      // Re-show after 3 days
      if (Date.now() - dismissedAt < 3 * 24 * 60 * 60 * 1000) return;
    }
    banner.classList.add('visible');
  });

  // Install button click
  btnInstall.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('[PWA] User accepted install');
    }
    deferredPrompt = null;
    banner.classList.remove('visible');
  });

  // Dismiss button click
  if (btnDismiss) {
    btnDismiss.addEventListener('click', (e) => {
      e.stopPropagation();
      banner.classList.remove('visible');
      localStorage.setItem('pf_pwa_dismissed', String(Date.now()));
    });
  }

  // Hide banner if app is already installed
  window.addEventListener('appinstalled', () => {
    banner.classList.remove('visible');
    deferredPrompt = null;
    console.log('[PWA] App installed');
  });

  // Also hide if running in standalone mode (already installed)
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
    banner.classList.remove('visible');
  }
})();
