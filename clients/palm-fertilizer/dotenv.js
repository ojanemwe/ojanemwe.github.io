/* ============================================
   Palm Fertilizer — Environment Configuration
   File ini berfungsi seperti .env untuk PWA.
   JANGAN commit file ini ke repository publik!
   ============================================ */

const ENV = {
  // =============================================
  // GANTI URL DI BAWAH INI DENGAN URL DEPLOYMENT
  // Google Apps Script Web App Anda!
  // (Spreadsheet → Extensions → Apps Script → Deploy → Web App)
  // =============================================
  GAS_API_URL: "https://script.google.com/macros/s/AKfycbyvsCYYFal_IcpM7nHt7ZhFo8cqtE2ICbJF8Oo7PFtdhzlIf49fibx1e1pUR0IEAF28/exec",

  // =============================================
  // Kunci API ini HARUS SAMA PERSIS dengan
  // CONFIG.API_KEY di Code.gs
  // =============================================
  API_KEY: "PF-SecureKey-2026-!@#PalmFertilizer",

  // Interval sinkronisasi (ms)
  SYNC_INTERVAL: 10000,    // 10 detik — proses antrian sync_queue
  PULL_INTERVAL: 30000,    // 30 detik — refresh master data dari server

  // Retry configuration (exponential backoff)
  MAX_RETRY: 5,
  BACKOFF_BASE: 2000       // base delay: 2s → 4s → 8s → 16s → 32s
};

// Ekspos ke scope global
window.ENV = ENV;
