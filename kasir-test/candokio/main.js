/**
 * ============================================================================
 * CANDOKIO POS — MAIN.JS (Logika Utama SPA)
 * ============================================================================
 * Berisi:
 * 1. Session/Auth Manager
 * 2. SPA Router (History API + Fragment Loading + Dynamic Script Injection)
 * 3. Theme Toggle (Dark/Light)
 * 4. Sidebar Toggle (Collapse/Expand)
 * 5. Notification System (Lonceng)
 * 6. Base64 Image Compression Utility
 * 7. Format Helpers (Tanggal, Mata Uang)
 * 8. Export CSV Utility
 * 9. Auto-Close Shift Timer
 * 10. Offline Sync Manager (IndexedDB)
 * ============================================================================
 */

// ============================================================================
// 0. GLOBAL STATE & REFERENCES
// ============================================================================
const App = {
  currentView: null,
  currentUser: null,
  viewCache: {},          // Cache HTML fragments yang sudah di-fetch
  injectedScripts: [],    // Daftar script yang di-inject (untuk cleanup)
  pollingInterval: null,  // Interval polling notifikasi & data
  shiftTimerInterval: null, // Timer auto-close shift
  isOnline: navigator.onLine,

  // Daftar semua view dan menu label
  VIEWS: {
    'view-dashboard':    { label: 'Dashboard',   file: 'views/view-dashboard.html' },
    'view-pos':          { label: 'Kasir (POS)', file: 'views/view-pos.html' },
    'view-products':     { label: 'Produk',      file: 'views/view-products.html' },
    'view-customers':    { label: 'Pelanggan',   file: 'views/view-customers.html' },
    'view-debt':         { label: 'Hutang',      file: 'views/view-debt.html' },
    'view-kas':          { label: 'KAS Harian',  file: 'views/view-kas.html' },
    'view-shift':        { label: 'Shift',       file: 'views/view-shift.html' },
    'view-transactions': { label: 'Transaksi',   file: 'views/view-transactions.html' },
    'view-reports':      { label: 'Laporan',     file: 'views/view-reports.html' },
    'view-profile':      { label: 'Profil',      file: 'views/view-profile.html' },
    'view-settings':     { label: 'Pengaturan',  file: 'views/view-settings.html' },
    'view-register':     { label: 'Daftar',      file: 'views/view-register.html' },
    'view-forgot-pw':    { label: 'Lupa Password', file: 'views/view-forgot-pw.html' },
  },

  // Default akses per role
  DEFAULT_ACCESS: {
    'superadmin': ['view-dashboard','view-pos','view-products','view-customers','view-debt','view-kas','view-shift','view-transactions','view-reports','view-profile','view-settings'],
    'admin':      ['view-dashboard','view-pos','view-products','view-customers','view-debt','view-kas','view-shift','view-transactions','view-reports','view-profile'],
    'kasir':      ['view-pos','view-products','view-customers','view-debt','view-kas','view-shift','view-transactions','view-profile']
  }
};

// ============================================================================
// 1. SESSION / AUTH MANAGER
// ============================================================================

/**
 * Simpan data sesi user ke localStorage setelah login berhasil
 */
function saveSession(token, userData) {
  localStorage.setItem('candokio_token', token);
  localStorage.setItem('candokio_user', JSON.stringify(userData));
  App.currentUser = userData;
}

/**
 * Ambil sesi user yang tersimpan
 */
function getSession() {
  const token = localStorage.getItem('candokio_token');
  const userData = localStorage.getItem('candokio_user');
  if (token && userData) {
    App.currentUser = JSON.parse(userData);
    return { token, user: App.currentUser };
  }
  return null;
}

/**
 * Hapus sesi (logout)
 */
function clearSession() {
  const token = localStorage.getItem('candokio_token');
  // Kirim logout ke server (best effort)
  if (token) {
    db.request('logout', {}).catch(() => {});
  }
  localStorage.removeItem('candokio_token');
  localStorage.removeItem('candokio_user');
  App.currentUser = null;
}

/**
 * Ambil token saat ini
 */
function getToken() {
  return localStorage.getItem('candokio_token') || '';
}

/**
 * Cek apakah user punya akses ke view tertentu
 */
function hasAccess(viewId) {
  if (!App.currentUser) return false;
  const role = App.currentUser.role;
  if (role === 'superadmin') return true; // Super Admin akses semua

  // Cek dari akses_halaman custom (jika ada)
  let akses = [];
  try {
    akses = JSON.parse(App.currentUser.akses_halaman || '[]');
  } catch (e) { akses = []; }

  // Jika akses custom kosong, gunakan default role
  if (!akses || akses.length === 0) {
    akses = App.DEFAULT_ACCESS[role] || [];
  }

  return akses.includes(viewId);
}

/**
 * Ambil default view setelah login berdasarkan role
 */
function getDefaultView() {
  if (!App.currentUser) return 'view-dashboard';
  const role = App.currentUser.role;
  // Kasir & Admin redirect ke POS, Super Admin ke Dashboard
  return (role === 'superadmin') ? 'view-dashboard' : 'view-pos';
}

// ============================================================================
// 2. SPA ROUTER (History API + Fragment Loading + Dynamic Script Injection)
// ============================================================================

/**
 * Navigasi ke view tertentu
 * @param {string} viewId - ID view (contoh: 'view-dashboard')
 * @param {boolean} pushHistory - Apakah push ke history (true = navigasi biasa, false = popstate)
 */
async function navigateTo(viewId, pushHistory = true) {
  const viewConfig = App.VIEWS[viewId];
  if (!viewConfig) {
    console.warn('[Router] View tidak ditemukan:', viewId);
    return;
  }

  // Cek akses
  if (!hasAccess(viewId)) {
    showToast('Akses ditolak! Anda tidak memiliki izin untuk halaman ini.', 'error');
    return;
  }

  // Jika sudah di view yang sama, skip
  if (App.currentView === viewId) return;

  try {
    // 1. Ambil HTML fragment (dari cache atau fetch)
    let html = App.viewCache[viewId];
    if (!html) {
      const response = await fetch(viewConfig.file);
      if (!response.ok) throw new Error('Gagal memuat halaman: ' + viewConfig.file);
      html = await response.text();
      App.viewCache[viewId] = html; // Cache untuk navigasi berikutnya
    }

    // 2. Cleanup: hapus script lama yang di-inject sebelumnya
    // Ini mencegah memory leak dan konflik logika antar view
    cleanupInjectedScripts();

    // 3. Inject HTML ke container
    const container = document.getElementById('app');
    container.innerHTML = html;

    // 4. Dynamic Script Injection: cari <script> di dalam fragment, eksekusi
    executeFragmentScripts(container);

    // 5. Update state & navigasi
    App.currentView = viewId;
    updateNavActive(viewId);

    // 6. Push ke History API (jika bukan dari popstate)
    if (pushHistory) {
      history.pushState({ view: viewId }, viewConfig.label, '#' + viewId);
    }

    // 7. Scroll ke atas
    container.scrollTo(0, 0);

    // 8. Tutup modal "More" jika terbuka (mobile)
    closeMoreModal();

  } catch (error) {
    console.error('[Router] Error navigasi:', error);
    document.getElementById('app').innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <h4>Gagal Memuat Halaman</h4>
        <p>${error.message}</p>
      </div>`;
  }
}

/**
 * Eksekusi semua <script> tag yang ada di dalam fragment HTML
 * Browser tidak auto-execute script yang di-inject via innerHTML,
 * jadi kita harus clone dan re-attach secara manual.
 */
function executeFragmentScripts(container) {
  const scripts = container.querySelectorAll('script');
  scripts.forEach(oldScript => {
    const newScript = document.createElement('script');

    // Copy semua atribut (src, type, dll)
    oldScript.getAttributeNames().forEach(attr => {
      newScript.setAttribute(attr, oldScript.getAttribute(attr));
    });

    // Copy inline content
    if (!oldScript.src) {
      newScript.textContent = oldScript.textContent;
    }

    // Tandai sebagai injected (untuk cleanup nanti)
    newScript.setAttribute('data-injected', 'true');

    // Ganti script lama dengan yang baru (trigger eksekusi)
    oldScript.parentNode.replaceChild(newScript, oldScript);

    // Track untuk cleanup
    App.injectedScripts.push(newScript);
  });
}

/**
 * Bersihkan script lama yang di-inject dari fragment sebelumnya
 * Ini penting agar tidak ada event listener atau interval yang bocor
 */
function cleanupInjectedScripts() {
  App.injectedScripts.forEach(script => {
    if (script.parentNode) {
      script.parentNode.removeChild(script);
    }
  });
  App.injectedScripts = [];

  // Hapus juga event listeners & intervals yang terdaftar oleh view (jika ada)
  if (window._viewCleanup && typeof window._viewCleanup === 'function') {
    window._viewCleanup();
    window._viewCleanup = null;
  }
}

/**
 * Update status active pada semua navigasi link (sidebar & bottom nav)
 */
function updateNavActive(viewId) {
  // Sidebar links
  document.querySelectorAll('.nav-link[data-view]').forEach(link => {
    link.classList.toggle('active', link.getAttribute('data-view') === viewId);
  });
  // Bottom nav links
  document.querySelectorAll('.bottom-link[data-view]').forEach(link => {
    link.classList.toggle('active', link.getAttribute('data-view') === viewId);
  });
}

/**
 * Sembunyikan menu yang tidak boleh diakses user
 */
function applyMenuVisibility() {
  document.querySelectorAll('[data-view]').forEach(el => {
    const viewId = el.getAttribute('data-view');
    const navItem = el.closest('.nav-item') || el.closest('li');
    if (navItem && viewId && App.VIEWS[viewId]) {
      const canAccess = hasAccess(viewId);
      navItem.style.display = canAccess ? '' : 'none';
    }
  });
}

// ============================================================================
// 3. THEME TOGGLE (Dark / Light)
// ============================================================================

function initTheme() {
  // Baca preferensi tersimpan, default Light
  const savedTheme = localStorage.getItem('candokio_theme') || 'light';
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('candokio_theme', theme);
  updateThemeIcon(theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('theme-icon');
  if (!icon) return;
  if (theme === 'dark') {
    // Sun icon (klik untuk ke Light)
    icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
  } else {
    // Moon icon (klik untuk ke Dark)
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }
}

// ============================================================================
// 4. SIDEBAR TOGGLE
// ============================================================================

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed');
  localStorage.setItem('candokio_sidebar', sidebar.classList.contains('collapsed') ? 'collapsed' : 'expanded');
}

function restoreSidebarState() {
  const state = localStorage.getItem('candokio_sidebar');
  if (state === 'collapsed') {
    document.getElementById('sidebar').classList.add('collapsed');
  }
}

// ============================================================================
// 5. NOTIFICATION SYSTEM (Lonceng)
// ============================================================================

/**
 * Fetch notifikasi dari server dan update badge
 */
async function fetchNotifications() {
  if (!App.currentUser) return;
  try {
    const notifs = await db.request('getNotifications', {
      role: App.currentUser.role,
      username: App.currentUser.username
    });
    updateNotifUI(notifs || []);
  } catch (e) {
    // Gagal fetch notifikasi bukan masalah kritis
    console.warn('[Notif] Gagal fetch:', e.message);
  }
}

/**
 * Update tampilan badge dan dropdown notifikasi
 */
function updateNotifUI(notifs) {
  const badge = document.getElementById('notif-badge');
  const list = document.getElementById('notif-list');

  // Update badge
  if (notifs.length > 0) {
    badge.textContent = notifs.length > 99 ? '99+' : notifs.length;
    badge.classList.add('show');
  } else {
    badge.classList.remove('show');
  }

  // Update dropdown list
  if (notifs.length === 0) {
    list.innerHTML = '<li class="notif-empty">Tidak ada notifikasi baru</li>';
    return;
  }

  list.innerHTML = notifs.map(n => {
    let iconClass = 'stok';
    let iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg>';
    if (n.tipe === 'register') {
      iconClass = 'register';
      iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>';
    } else if (n.tipe === 'reset_pw') {
      iconClass = 'reset_pw';
      iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
    } else if (n.tipe === 'shift') {
      iconClass = 'primary'; // We can reuse standard unstyled icon layout class, primary gives it a nice color
      iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    }

    const timeStr = formatDateTime(n.tanggal);
    return `<li class="notif-item" data-notif-id="${n.id}" onclick="handleNotifClick('${n.id}', '${n.tipe}')">
      <div class="notif-icon-wrap ${iconClass}">${iconSvg}</div>
      <div class="notif-text"><p>${escapeHtml(n.pesan)}</p><small>${timeStr}</small></div>
    </li>`;
  }).join('');
}

/**
 * Handler klik notifikasi — tandai dibaca dan navigasi jika perlu
 */
async function handleNotifClick(notifId, tipe) {
  try {
    await db.request('markNotificationRead', {
      notifId: notifId,
      username: App.currentUser.username
    });
  } catch (e) { /* abaikan */ }

  // Navigasi ke halaman terkait
  if (notifId === 'UNIT_INCOMPLETE') {
    await navigateTo('view-products');
    setTimeout(() => {
      const btn = document.getElementById('pf-tab-satuan');
      if (btn) btn.click();
    }, 200); // Tunggu render selesai
  }
  else if (tipe === 'stok') await navigateTo('view-products');
  else if (tipe === 'shift') await navigateTo('view-shift');
  else if (tipe === 'register' || tipe === 'reset_pw') await navigateTo('view-settings');

  // Refresh notifikasi
  fetchNotifications();
  toggleNotifDropdown(false);
}

/**
 * Toggle dropdown notifikasi
 */
function toggleNotifDropdown(forceState) {
  const dropdown = document.getElementById('notif-dropdown');
  if (forceState !== undefined) {
    dropdown.classList.toggle('show', forceState);
  } else {
    dropdown.classList.toggle('show');
  }
}

// ============================================================================
// 6. BASE64 IMAGE COMPRESSION UTILITY
// ============================================================================

/**
 * Kompresi gambar menjadi Base64 dengan limit karakter (max 50k)
 * @param {HTMLImageElement} img - Objek gambar yang sudah dimuat
 * @param {string} mimeType - Tipe mime (image/png, image/jpeg, dll)
 * @param {number} limit - Batas karakter (default 50000)
 * @returns {string} Base64 data URL
 */
function getCompressedBase64(img, mimeType, limit = 50000) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const format = mimeType.includes('jpeg') ? 'image/jpeg' : 'image/webp';

  let q = 0.9;
  let w = Math.min(img.width, 1200); // Max dimensi awal 1200px
  let h = Math.round((w / img.width) * img.height);
  let result = '';

  for (let i = 0; i < 20; i++) {
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    result = canvas.toDataURL(format, q);

    if (result.length <= limit) return result;

    // Strategi: turunkan kualitas dulu, baru resolusi
    if (q > 0.4) {
      q -= 0.15;
    } else {
      w = Math.floor(w * 0.8);
      h = Math.floor(h * 0.8);
      q = 0.8;
    }
  }
  return result;
}

/**
 * Proses file gambar menjadi base64 terkompresi
 * @param {File} file - File dari input
 * @returns {Promise<string>} Base64 string
 */
function processImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const rawBase64 = e.target.result;
      // Jika sudah kecil, langsung gunakan
      if (rawBase64.length <= 50000) {
        resolve(rawBase64);
        return;
      }
      // Kompresi via canvas
      const img = new Image();
      img.onload = function() {
        const compressed = getCompressedBase64(img, file.type);
        resolve(compressed);
      };
      img.onerror = () => reject(new Error('Gagal memuat gambar'));
      img.src = rawBase64;
    };
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// 6b. IMAGE CROPPER (Crop + Compress menggunakan Cropper.js)
// ============================================================================

/**
 * Buka cropper modal untuk mengatur posisi/crop foto.
 * @param {File} file - File gambar dari input
 * @param {object} options - { aspectRatio: 1 (default), maxSize: 50000 }
 * @returns {Promise<string>} base64 string yang sudah di-crop & compress
 */
function openImageCropper(file, options = {}) {
  return new Promise((resolve, reject) => {
    const aspectRatio = options.aspectRatio ?? 1;
    const maxSize = options.maxSize ?? 50000;

    const reader = new FileReader();
    reader.onload = function(e) {
      const modal = document.getElementById('cropper-modal');
      const imgEl = document.getElementById('cropper-image');
      const btnApply = document.getElementById('cropper-btn-apply');
      const btnCancel = document.getElementById('cropper-btn-cancel');
      const btnClose = document.getElementById('cropper-btn-close');

      imgEl.src = e.target.result;
      modal.classList.add('active');

      let cropperInstance = null;

      // Init Cropper after image loads in modal
      setTimeout(() => {
        if (typeof Cropper !== 'function') {
          // Fallback: jika Cropper.js belum dimuat, gunakan processImageFile
          modal.classList.remove('active');
          processImageFile(file).then(resolve).catch(reject);
          return;
        }
        if (cropperInstance) cropperInstance.destroy();
        cropperInstance = new Cropper(imgEl, {
          aspectRatio: aspectRatio,
          viewMode: 1,
          dragMode: 'move',
          autoCropArea: 0.85,
          background: false,
          responsive: true,
        });
      }, 150);

      function cleanup() {
        if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
        imgEl.src = '';
        modal.classList.remove('active');
        btnApply.removeEventListener('click', handleApply);
        btnCancel.removeEventListener('click', handleCancel);
        btnClose.removeEventListener('click', handleCancel);
      }

      function handleApply() {
        if (!cropperInstance) return;
        const canvas = cropperInstance.getCroppedCanvas({
          maxWidth: 800,
          maxHeight: 800,
          imageSmoothingQuality: 'high',
        });
        // Compress
        const isTransparent = ['image/png', 'image/webp', 'image/gif'].includes(file.type);
        const mime = isTransparent ? 'image/webp' : 'image/jpeg';
        const base64 = getCompressedBase64(canvas, mime, maxSize);
        cleanup();
        resolve(base64);
      }

      function handleCancel() {
        cleanup();
        reject(new Error('Dibatalkan'));
      }

      btnApply.addEventListener('click', handleApply);
      btnCancel.addEventListener('click', handleCancel);
      btnClose.addEventListener('click', handleCancel);
    };
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// 7. FORMAT HELPERS
// ============================================================================

/**
 * Format angka menjadi mata uang (Rp)
 * @param {number} amount
 * @param {string} currency - Simbol mata uang (default: 'Rp')
 * @returns {string}
 */
function formatCurrency(amount, currency = 'Rp') {
  const num = parseFloat(amount) || 0;
  const formatted = num.toLocaleString('id-ID', { minimumFractionDigits: 0 });
  return currency + ' ' + formatted;
}

/**
 * Format tanggal ISO ke DD/MM/YYYY
 * @param {string} isoString
 * @returns {string}
 */
function formatDate(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  if (isNaN(d)) return isoString.toString().substring(0, 10);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Format tanggal + waktu ke DD/MM/YYYY HH:mm WIB
 */
function formatDateTime(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  if (isNaN(d)) return isoString;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi} WIB`;
}

/**
 * Format tanggal ke ISO 8601 untuk dikirim ke backend
 */
function toISOWIB(date) {
  const d = date || new Date();
  const offset = '+07:00';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${offset}`;
}

/**
 * Escape HTML untuk mencegah XSS saat render ke DOM
 */
function escapeHtml(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================================
// 8. EXPORT CSV UTILITY
// ============================================================================

/**
 * Export array of objects ke file CSV
 * @param {Array} data - Array of objects
 * @param {string} filename - Nama file (tanpa ekstensi)
 * @param {Array} columns - Array kolom yang akan di-export (opsional)
 */
function exportCSV(data, filename, columns) {
  if (!data || data.length === 0) {
    showToast('Tidak ada data untuk di-export.', 'warning');
    return;
  }

  // Tentukan kolom
  const cols = columns || Object.keys(data[0]);

  // Header row
  let csv = cols.join(',') + '\n';

  // Data rows
  data.forEach(row => {
    const values = cols.map(col => {
      let val = row[col] !== undefined ? row[col] : '';
      // Escape koma dan quotes
      val = val.toString().replace(/"/g, '""');
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = '"' + val + '"';
      }
      // Skip base64 columns (terlalu besar)
      if (col.includes('base64') || col.includes('json')) val = '[DATA]';
      return val;
    });
    csv += values.join(',') + '\n';
  });

  // Download
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = (filename || 'export') + '_' + formatDate(new Date().toISOString()).replace(/\//g, '-') + '.csv';
  link.click();
  URL.revokeObjectURL(link.href);

  showToast('File CSV berhasil di-download!', 'success');
}

// ============================================================================
// 9. UI HELPERS (Toast, Loading, Modal)
// ============================================================================

/**
 * Tampilkan toast notification
 * @param {string} message
 * @param {string} type - 'success' | 'error' | 'warning' | 'info'
 * @param {number} duration - Durasi ms (default 3000)
 */
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Tampilkan/sembunyikan loading overlay global
 */
function showLoading(text = 'Memproses...') {
  const overlay = document.getElementById('loading-overlay');
  document.getElementById('loading-text').textContent = text;
  overlay.classList.add('active');
}

function hideLoading() {
  document.getElementById('loading-overlay').classList.remove('active');
}

/**
 * Tutup more modal (mobile)
 */
function closeMoreModal() {
  document.getElementById('more-modal').classList.remove('active');
}

// ============================================================================
// 10. AUTO-CLOSE SHIFT TIMER
// ============================================================================

/**
 * Cek apakah sudah waktunya auto-close shift (23:50 WIB)
 */
function checkAutoCloseShift() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();

  // Jam 23:50 WIB
  if (hours === 23 && minutes === 50) {
    console.log('[Shift] Auto-close triggered at 23:50 WIB');
    autoCloseActiveShift();
  }
}

/**
 * Auto-close shift yang masih aktif
 */
async function autoCloseActiveShift() {
  if (!App.currentUser) return;
  try {
    const activeShift = await db.request('getActiveShift', { kasir: App.currentUser.username });
    if (activeShift) {
      await db.request('closeShift', {
        shiftId: activeShift.id,
        uang_aktual: 0,
        isAuto: true,
        catatan: 'Auto-closed pada 23:50 WIB'
      });
      showToast('Shift telah ditutup otomatis pada 23:50 WIB.', 'warning', 5000);
    }
  } catch (e) {
    console.warn('[Shift] Gagal auto-close:', e.message);
  }
}

// ============================================================================
// 11. POLLING & BACKGROUND SYNC
// ============================================================================

/**
 * Update sync badge count di header (dipanggil oleh OfflineService)
 */
function updateSyncBadge(pendingCount) {
  const badge = document.getElementById('sync-badge');
  if (!badge) return;
  if (pendingCount > 0) {
    badge.textContent = pendingCount;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}
// Expose globally agar bisa dipanggil dari OfflineService
window.updateSyncBadge = updateSyncBadge;

/**
 * Mulai polling untuk notifikasi dan update data
 */
function startPolling() {
  // Polling setiap 60 detik
  App.pollingInterval = setInterval(() => {
    if (App.isOnline && App.currentUser) {
      fetchNotifications();
    }
  }, 60000);

  // Cek auto-close shift setiap menit
  App.shiftTimerInterval = setInterval(checkAutoCloseShift, 60000);
}

/**
 * Stop polling
 */
function stopPolling() {
  if (App.pollingInterval) clearInterval(App.pollingInterval);
  if (App.shiftTimerInterval) clearInterval(App.shiftTimerInterval);
}

// Online/offline handler
window.addEventListener('online', () => {
  App.isOnline = true;
  showToast('Koneksi internet kembali! Menyinkronkan data...', 'success');
  OfflineService.processQueue(); // Flush queue saat online kembali
});

window.addEventListener('offline', () => {
  App.isOnline = false;
  showToast('Anda sedang offline. Data disimpan lokal.', 'warning', 5000);
});

// ============================================================================
// 12. LOGIN & LOGOUT HANDLERS
// ============================================================================

/**
 * Handle form login submit
 */
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  if (!username || !password) {
    showToast('Username dan password wajib diisi.', 'warning');
    return;
  }

  const btnLogin = document.getElementById('btn-login');
  btnLogin.disabled = true;
  btnLogin.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;"></div> Memproses...';

  try {
    const result = await db.request('login', { username, password });
    // Simpan token ke DatabaseService untuk request berikutnya
    db.token = result.token;
    saveSession(result.token, result.user);

    showToast('Selamat datang, ' + (result.user.nama_lengkap || username) + '!', 'success');

    // Tampilkan app shell
    showAppShell();

  } catch (error) {
    if (error.message.includes('Tabel Pengguna belum dibuat')) {
      // Database belum diinisialisasi
      document.getElementById('init-modal').classList.add('active');
      showToast('Database kosong, silakan inisialisasi terlebih dahulu.', 'info');
    } else {
      showToast(error.message, 'error');
    }
    btnLogin.disabled = false;
    btnLogin.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Masuk';
  }
}

/**
 * Handle form inisialisasi submit
 */
document.getElementById('init-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const username = document.getElementById('init-username').value.trim().toLowerCase();
  const nama = document.getElementById('init-nama').value.trim();
  const password = document.getElementById('init-password').value;

  if (!username || !nama || !password) return;

  const btnInit = document.getElementById('btn-init');
  btnInit.disabled = true;
  btnInit.innerHTML = 'Memproses...';

  try {
    await db.request('initDatabase', { username, nama_lengkap: nama, password });
    
    document.getElementById('init-modal').classList.remove('active');
    Swal.fire({
      title: 'Inisialisasi Berhasil! 🎉',
      text: 'Struktur database telah dibuat. Silakan login menggunakan akun Super Admin yang baru saja Anda buat.',
      icon: 'success',
      confirmButtonText: 'OK Login',
      confirmButtonColor: '#6366F1'
    });
    
    // Auto-fill login form
    document.getElementById('login-username').value = username;
    document.getElementById('login-password').value = '';
    document.getElementById('login-password').focus();

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnInit.disabled = false;
    btnInit.innerHTML = '✨ Inisialisasi Sistem';
  }
});

/**
 * Handle logout
 */
function handleLogout() {
  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: 'Keluar?',
      text: 'Anda yakin ingin keluar dari aplikasi?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      confirmButtonText: 'Ya, Keluar',
      cancelButtonText: 'Batal'
    }).then((result) => {
      if (result.isConfirmed) performLogout();
    });
  } else {
    performLogout();
  }
}

function performLogout() {
  stopPolling();
  OfflineService.stopPeriodicSync();
  clearSession();
  OfflineService.clearAllCache();
  // Reset UI
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.body.style.overflow = '';
  App.currentView = null;
  App.viewCache = {};
  cleanupInjectedScripts();
  // Reset form
  document.getElementById('login-form').reset();
  document.getElementById('login-username').focus();
  // Bersihkan hash
  history.replaceState(null, '', window.location.pathname);
  showToast('Anda telah keluar.', 'info');
}

/**
 * Tampilkan App Shell setelah login berhasil
 */
function showAppShell() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Update avatar header
  if (App.currentUser && App.currentUser.photo_base64) {
    document.getElementById('header-avatar-img').src = App.currentUser.photo_base64;
  } else if (App.currentUser) {
    document.getElementById('header-avatar-img').src =
      'https://api.dicebear.com/7.x/initials/svg?seed=' +
      encodeURIComponent(App.currentUser.nama_lengkap || App.currentUser.username) +
      '&backgroundColor=6366F1&textColor=ffffff';
  }

  // Terapkan visibilitas menu berdasarkan RBAC
  applyMenuVisibility();

  // Restore sidebar state
  restoreSidebarState();

  // Navigasi ke default view berdasarkan role
  const defaultView = getDefaultView();
  const hashView = window.location.hash.replace('#', '');

  if (hashView && App.VIEWS[hashView] && hasAccess(hashView)) {
    navigateTo(hashView, false);
  } else {
    navigateTo(defaultView);
  }

  // Mulai polling & fetch notifikasi
  fetchNotifications();
  startPolling();

  // Start offline sync
  OfflineService.startPeriodicSync();
  OfflineService.processQueue(); // Flush queue yang tertunda
  OfflineService.getPendingCount().then(c => updateSyncBadge(c));
}

// ============================================================================
// 13. REGISTER & FORGOT PASSWORD (navigasi ke view tanpa login)
// ============================================================================

function showRegisterView() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  // Sembunyikan sidebar & bottom nav untuk register/forgot
  document.getElementById('sidebar').style.display = 'none';
  document.getElementById('bottom-nav').style.display = 'none';
  document.querySelector('.app-header').style.display = 'none';
  // Load register view
  loadPublicView('views/view-register.html');
}

function showForgotPwView() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  document.getElementById('sidebar').style.display = 'none';
  document.getElementById('bottom-nav').style.display = 'none';
  document.querySelector('.app-header').style.display = 'none';
  loadPublicView('views/view-forgot-pw.html');
}

async function loadPublicView(file) {
  try {
    const resp = await fetch(file);
    const html = await resp.text();
    document.getElementById('app').innerHTML = html;
    executeFragmentScripts(document.getElementById('app'));
  } catch (e) {
    document.getElementById('app').innerHTML = '<div class="empty-state"><h4>Gagal memuat halaman</h4></div>';
  }
}

function backToLogin() {
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('sidebar').style.display = '';
  document.getElementById('bottom-nav').style.display = '';
  document.querySelector('.app-header').style.display = '';
  document.body.style.overflow = '';
}

// ============================================================================
// 14. OVERRIDE DatabaseService.request untuk inject token
// ============================================================================

// Override request method agar otomatis menyertakan token
const originalRequest = db.request.bind(db);
db.request = async function(action, payload) {
  const bodyData = {
    apiKey: this.apiKey,
    action: action,
    payload: payload,
    token: getToken()
  };

  try {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(bodyData),
      redirect: 'follow'
    });

    const result = await response.json();

    if (!result.success) {
      // Jika sesi habis, redirect ke login
      if (result.message && result.message.includes('login ulang')) {
        performLogout();
      }
      throw new Error(result.message);
    }
    return result.data;

  } catch (error) {
    console.error(`[DB Service Error - ${action}]:`, error);
    throw error;
  }
};

// ============================================================================
// 15. EVENT LISTENERS & INITIALIZATION
// ============================================================================

function initMain() {
  // Inisialisasi tema
  initTheme();

  // --- Login Form ---
  document.getElementById('login-form').addEventListener('submit', handleLogin);

  // --- Register & Forgot Password Links ---
  document.getElementById('link-register').addEventListener('click', (e) => {
    e.preventDefault();
    showRegisterView();
  });
  document.getElementById('link-forgot').addEventListener('click', (e) => {
    e.preventDefault();
    showForgotPwView();
  });

  // --- Sidebar Toggle ---
  document.getElementById('btn-toggle-sidebar').addEventListener('click', toggleSidebar);

  // --- Theme Toggle ---
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);

  // --- Global Sync Button ---
  document.getElementById('btn-global-sync').addEventListener('click', async () => {
    const btn = document.getElementById('btn-global-sync');
    btn.classList.add('syncing');
    showToast('Menyinkronkan data...', 'info');
    try {
      // 1. Flush write queue dulu (urutan penting!)
      await OfflineService.processQueue();
      // 2. Refresh semua cache dari server
      await OfflineService.refreshAllCache();
      showToast('Data berhasil disinkronkan!', 'success');
      // 3. Re-render view aktif jika ada
      if (App.currentView) {
        const currentView = App.currentView;
        App.currentView = null; // Reset agar navigateTo tidak skip
        await navigateTo(currentView, false);
      }
    } catch (e) {
      showToast('Gagal sinkronisasi: ' + e.message, 'error');
    } finally {
      btn.classList.remove('syncing');
      const count = await OfflineService.getPendingCount();
      updateSyncBadge(count);
    }
  });

  // --- Notification Toggle ---
  document.getElementById('btn-notif').addEventListener('click', () => toggleNotifDropdown());

  // Tutup dropdown notifikasi saat klik di luar
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notif-dropdown');
    const btnNotif = document.getElementById('btn-notif');
    if (!dropdown.contains(e.target) && !btnNotif.contains(e.target)) {
      toggleNotifDropdown(false);
    }
  });

  // --- Avatar → Profil ---
  document.getElementById('btn-avatar').addEventListener('click', () => navigateTo('view-profile'));

  // --- Navigasi Sidebar ---
  document.querySelectorAll('.nav-link[data-view]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(link.getAttribute('data-view'));
    });
  });

  // --- Navigasi Bottom Nav ---
  document.querySelectorAll('.bottom-link[data-view]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(link.getAttribute('data-view'));
    });
  });

  // --- More Modal (Mobile) ---
  document.getElementById('btn-more-menu').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('more-modal').classList.add('active');
  });
  document.getElementById('btn-close-more').addEventListener('click', closeMoreModal);
  // Klik overlay tutup modal
  document.getElementById('more-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('more-modal')) closeMoreModal();
  });

  // --- Navigasi dari More Modal ---
  document.querySelectorAll('#more-modal .nav-link[data-view]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(link.getAttribute('data-view'));
    });
  });

  // --- Logout Buttons ---
  document.getElementById('btn-logout-mobile').addEventListener('click', handleLogout);

  // --- History API (Back/Forward browser + tombol back mobile) ---
  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.view) {
      navigateTo(e.state.view, false);
    } else {
      // Cek hash sebagai fallback
      const hash = window.location.hash.replace('#', '');
      if (hash && App.VIEWS[hash]) {
        navigateTo(hash, false);
      }
    }
  });

  // --- Cek sesi yang sudah ada (auto-login) ---
  const session = getSession();
  if (session) {
    db.token = session.token;
    showAppShell();
  } else {
    document.getElementById('login-screen').classList.remove('hidden');
    document.body.style.overflow = '';
    // Cek apakah database sudah diinisialisasi
    db.request('checkInitStatus').then(res => {
      if (res && res.isInit === false) {
        document.getElementById('setup-db-container').style.display = 'block';
      }
    }).catch(e => {
      console.error('Gagal mengecek status DB via checkInitStatus:', e.message);
      // Fallback: Cek paksa apakah Tabel Pengguna sudah ada lewat percobaan login
      db.request('login', { username: 'test', password: '123' }).catch(err => {
        if (err.message && err.message.toLowerCase().includes('belum dibuat')) {
          document.getElementById('setup-db-container').style.display = 'block';
        }
      });
    });
  }
  // --- Global: klik di luar modal (overlay) untuk menutup ---
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal-overlay') && e.target.classList.contains('active')) {
      e.target.classList.remove('active');
    }
  });

}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMain);
} else {
  initMain();
}
