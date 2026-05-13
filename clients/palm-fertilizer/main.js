/* ============================================
   Palm Fertilizer — main.js
   SPA Router, UI Logic, Theme, Navigation
   ============================================ */

const Router = (() => {
  const viewCache = {};
  let currentView = '';

  async function navigate(viewName) {
    if (currentView === viewName) return;
    const container = document.getElementById('app-content');
    if (!container) return;

    // Show skeleton while loading
    container.innerHTML = '<div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>';

    try {
      let html;
      if (viewCache[viewName]) {
        html = viewCache[viewName];
      } else {
        const resp = await fetch(`views/${viewName}.html?_=${Date.now()}`);
        if (!resp.ok) throw new Error('View not found');
        html = await resp.text();
      }

      container.innerHTML = html;

      // Execute inline scripts
      const scripts = container.querySelectorAll('script');
      scripts.forEach(oldScript => {
        const newScript = document.createElement('script');
        if (oldScript.src) {
          newScript.src = oldScript.src;
        } else {
          newScript.textContent = oldScript.textContent;
        }
        oldScript.parentNode.replaceChild(newScript, oldScript);
      });

      currentView = viewName;
      updateActiveNav(viewName);
      window.history.pushState({ view: viewName }, '', `#${viewName}`);

      // Re-init Lucide icons
      if (window.lucide) lucide.createIcons();

    } catch (e) {
      container.innerHTML = `<div class="empty-state"><p>Gagal memuat halaman</p><button class="btn btn-primary" onclick="Router.navigate('view-dashboard')">Kembali</button></div>`;
      console.error('Router error:', e);
    }
  }

  function updateActiveNav(viewName) {
    // Sidebar links
    document.querySelectorAll('.nav-link').forEach(l => {
      l.classList.toggle('active', l.dataset.view === viewName);
    });
    // Bottom nav links
    document.querySelectorAll('.bottom-link').forEach(l => {
      l.classList.toggle('active', l.dataset.view === viewName);
    });
  }

  // Handle browser back/forward
  window.addEventListener('popstate', e => {
    if (e.state && e.state.view) navigate(e.state.view);
  });

  return { navigate, updateActiveNav };
})();

// === UI CONTROLLER ===
const UI = (() => {
  // Theme
  function initTheme() {
    const saved = localStorage.getItem('pf_theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('pf_theme', next);
    updateThemeIcon(next);
  }

  function updateThemeIcon(theme) {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.innerHTML = theme === 'dark'
      ? '<i data-lucide="sun" class="icon"></i>'
      : '<i data-lucide="moon" class="icon"></i>';
    if (window.lucide) lucide.createIcons();
  }

  // Sidebar toggle
  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('mini');
  }

  // Profile dropdown
  function toggleProfileDropdown() {
    const menu = document.getElementById('profile-dropdown-menu');
    const syncMenu = document.getElementById('sync-dropdown-menu');
    if (syncMenu) syncMenu.classList.remove('active');
    if (menu) menu.classList.toggle('active');
  }

  // Sync dropdown
  function toggleSyncDropdown() {
    const menu = document.getElementById('sync-dropdown-menu');
    const profMenu = document.getElementById('profile-dropdown-menu');
    if (profMenu) profMenu.classList.remove('active');
    if (menu) {
      menu.classList.toggle('active');
      if (menu.classList.contains('active')) updateSyncMenu();
    }
  }

  function updateSyncMenu() {
    const list = document.getElementById('sync-queue-list');
    if (!list) return;
    const q = App.getSyncQueue();
    if (q.length === 0) {
      list.innerHTML = '<div class="text-center text-muted text-sm" style="padding:1rem 0">Tidak ada antrean ✅</div>';
      return;
    }
    list.innerHTML = q.map(item => `
      <div style="padding:.5rem;border-bottom:1px solid var(--border-color);display:flex;flex-direction:column;gap:.25rem">
        <div style="display:flex;justify-content:space-between">
          <strong style="text-transform:capitalize">${item.action}</strong>
          <span class="badge badge-primary text-xs">${item.table}</span>
        </div>
        <div class="text-xs text-muted">${new Date(item.timestamp).toLocaleTimeString('id-ID')}</div>
      </div>
    `).join('');
  }

  // Close dropdown on outside click
  document.addEventListener('click', e => {
    const pMenu = document.getElementById('profile-dropdown-menu');
    const pBtn = document.getElementById('profile-btn');
    if (pMenu && pBtn && !pBtn.contains(e.target) && !pMenu.contains(e.target)) {
      pMenu.classList.remove('active');
    }
    
    const sMenu = document.getElementById('sync-dropdown-menu');
    const sBtn = document.getElementById('notif-bell');
    if (sMenu && sBtn && !sBtn.contains(e.target) && !sMenu.contains(e.target)) {
      sMenu.classList.remove('active');
    }
  });

  // More modal (mobile)
  function toggleMoreModal() {
    const modal = document.getElementById('more-modal');
    if (modal) modal.classList.toggle('active');
  }

  // Toast notifications
  function toast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = message;
    container.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
  }

  // Modal helpers
  function openModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('active');
  }
  function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('active');
  }

  // Build sidebar & bottom nav based on user role
  function buildNavigation(user) {
    const hakAkses = JSON.parse(user.hak_akses || '{}');
    const role = user.role;

    const menuItems = [
      { view: 'view-dashboard', icon: 'layout-dashboard', label: 'Dashboard', key: 'dashboard', always: true },
      { view: 'view-ritase', icon: 'scan-line', label: 'Cek Ritase', key: 'ritase' },
      { view: 'view-pemupukan', icon: 'sprout', label: 'Pemupukan', key: 'pemupukan' },
      { view: 'view-material', icon: 'package', label: 'Material', key: 'material' },
      { view: 'view-lahan', icon: 'map-pin', label: 'Lahan & Kebun', key: 'lahan' },
      { view: 'view-laporan', icon: 'file-spreadsheet', label: 'Laporan', key: 'laporan' },
    ];

    const allowed = menuItems.filter(m => {
      if (m.always) return true;
      if (role === 'ADMIN') return true;
      if (role === 'ASISTEN') return hakAkses[m.key] !== false;
      if (role === 'CHECKER') return ['ritase', 'material'].includes(m.key);
      if (role === 'MANDOR') return ['pemupukan', 'material'].includes(m.key);
      return false;
    });

    // Sidebar
    const sidebarNav = document.getElementById('sidebar-nav');
    if (sidebarNav) {
      sidebarNav.innerHTML = allowed.map(m => `
        <li><a href="#" class="nav-link" data-view="${m.view}" onclick="event.preventDefault();Router.navigate('${m.view}')">
          <i data-lucide="${m.icon}" class="icon"></i><span>${m.label}</span>
        </a></li>
      `).join('');

      // Add settings for admin/asisten
      if (role === 'ADMIN' || role === 'ASISTEN') {
        sidebarNav.innerHTML += `
          <li style="margin-top:auto;padding-top:1rem;border-top:1px solid var(--border-color)">
            <a href="#" class="nav-link" data-view="view-settings" onclick="event.preventDefault();Router.navigate('view-settings')">
              <i data-lucide="settings" class="icon"></i><span>Settings</span>
            </a>
          </li>`;
      }
    }

    // Bottom nav (mobile) - max 4 + more
    const bottomNav = document.getElementById('bottom-nav-list');
    if (bottomNav) {
      const mobileItems = allowed.slice(0, 4);
      const moreItems = allowed.slice(4);
      bottomNav.innerHTML = mobileItems.map(m => `
        <li><a href="#" class="bottom-link" data-view="${m.view}" onclick="event.preventDefault();Router.navigate('${m.view}')">
          <i data-lucide="${m.icon}" class="icon"></i><span>${m.label}</span>
        </a></li>
      `).join('') + `
        <li><a href="#" class="bottom-link" onclick="event.preventDefault();UI.toggleMoreModal()">
          <i data-lucide="ellipsis" class="icon"></i><span>Lainnya</span>
        </a></li>`;

      // Populate More Modal dynamically
      const moreModalContent = document.getElementById('more-modal-dynamic-links');
      if (moreModalContent) {
        moreModalContent.innerHTML = moreItems.map(m => `
          <a href="#" class="nav-link" data-view="${m.view}" onclick="event.preventDefault();UI.toggleMoreModal();Router.navigate('${m.view}')">
            <i data-lucide="${m.icon}" class="icon"></i><span>${m.label}</span>
          </a>
        `).join('');
      }

      // Hide settings if not admin/asisten
      const settingsLink = document.getElementById('more-modal-settings');
      if (settingsLink) {
        settingsLink.style.display = (role === 'ADMIN' || role === 'ASISTEN') ? 'flex' : 'none';
      }
    }

    if (window.lucide) lucide.createIcons();
  }

  // Login UI
  function showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('pin-screen').classList.remove('active');
  }

  function showApp(session) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('pin-screen').classList.remove('active');
    document.getElementById('app-shell').style.display = 'flex';

    // Set user info in header
    const nameEl = document.getElementById('header-user-name');
    if (nameEl) nameEl.textContent = session.user.nama_lengkap;

    buildNavigation(session.user);
    Router.navigate('view-dashboard');
    App.updateSyncBadge();
  }

  function showPinScreen() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('pin-screen').classList.add('active');
  }

  return {
    initTheme, toggleTheme, toggleSidebar, toggleProfileDropdown,
    toggleSyncDropdown, updateSyncMenu,
    toggleMoreModal, toast, openModal, closeModal,
    buildNavigation, showLogin, showApp, showPinScreen
  };
})();

// === PIN PAD LOGIC ===
const PinPad = (() => {
  let pin = '';
  const MAX = 6;

  function press(num) {
    if (pin.length >= MAX) return;
    pin += num;
    updateDots();
    if (pin.length === MAX) {
      setTimeout(verify, 200);
    }
  }

  function del() {
    pin = pin.slice(0, -1);
    updateDots();
  }

  function clear() {
    pin = '';
    updateDots();
  }

  function updateDots() {
    document.querySelectorAll('.pin-dot').forEach((dot, i) => {
      dot.classList.toggle('filled', i < pin.length);
    });
  }

  function verify() {
    if (App.verifyPin(pin)) {
      const session = App.getSession();
      if (session) {
        UI.showApp(session);
        UI.toast('Selamat datang kembali!');
      } else {
        UI.showLogin();
      }
    } else {
      document.getElementById('pin-error').textContent = 'PIN salah!';
      setTimeout(() => {
        document.getElementById('pin-error').textContent = '';
      }, 2000);
      clear();
    }
  }

  return { press, del, clear };
})();

// === INIT ON LOAD ===
window.addEventListener('DOMContentLoaded', () => {
  UI.initTheme();
  App.init();

  // Check session
  const session = App.getSession();
  if (session) {
    // Has active session - show PIN lock
    const needPin = localStorage.getItem('pf_needs_pin');
    if (needPin === 'true') {
      UI.showPinScreen();
    } else {
      UI.showApp(session);
    }
  } else {
    UI.showLogin();
  }

  // Login form handler
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      const btn = loginForm.querySelector('button[type="submit"]');
      const origText = btn.innerHTML;
      btn.innerHTML = '<i data-lucide="loader-2" class="icon-sm" style="animation:spin 1s linear infinite"></i> Memproses...';
      btn.disabled = true;

      try {
        const session = await App.login(username, password);
        if (session && session.error) {
          document.getElementById('login-error').textContent = session.error;
          setTimeout(() => { document.getElementById('login-error').textContent = ''; }, 4000);
        } else if (session && session.user) {
          localStorage.setItem('pf_needs_pin', 'false');
          UI.showApp(session);
          UI.toast('Login berhasil!');

          // Check if password change is required (first login)
          if (session.password_changed === false) {
            setTimeout(() => promptPasswordChange_(), 500);
          }
        } else {
          document.getElementById('login-error').textContent = 'Username atau password salah!';
          setTimeout(() => { document.getElementById('login-error').textContent = ''; }, 3000);
        }
      } catch (err) {
        document.getElementById('login-error').textContent = 'Gagal terhubung ke server.';
        setTimeout(() => { document.getElementById('login-error').textContent = ''; }, 4000);
      } finally {
        btn.innerHTML = origText;
        btn.disabled = false;
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  // Password change prompt (first login)
  async function promptPasswordChange_() {
    if (!window.Swal) {
      alert('Anda perlu mengganti password default. Silakan buka menu Profil.');
      return;
    }
    const { value: formValues } = await Swal.fire({
      title: 'Ganti Password',
      html:
        '<p style="font-size:.85rem;color:var(--text-muted);margin-bottom:1rem">Ini adalah login pertama Anda. Demi keamanan, silakan ganti password default.</p>' +
        '<input id="swal-old-pw" type="password" class="swal2-input" placeholder="Password lama">' +
        '<input id="swal-new-pw" type="password" class="swal2-input" placeholder="Password baru (min 6 karakter)">' +
        '<input id="swal-confirm-pw" type="password" class="swal2-input" placeholder="Konfirmasi password baru">',
      focusConfirm: false,
      allowOutsideClick: false,
      confirmButtonText: 'Simpan Password Baru',
      showCancelButton: true,
      cancelButtonText: 'Nanti Saja',
      preConfirm: () => {
        const oldPw = document.getElementById('swal-old-pw').value;
        const newPw = document.getElementById('swal-new-pw').value;
        const confirmPw = document.getElementById('swal-confirm-pw').value;
        if (!oldPw || !newPw) { Swal.showValidationMessage('Semua field wajib diisi'); return false; }
        if (newPw.length < 6) { Swal.showValidationMessage('Password baru minimal 6 karakter'); return false; }
        if (newPw !== confirmPw) { Swal.showValidationMessage('Konfirmasi password tidak cocok'); return false; }
        return { oldPw, newPw };
      }
    });

    if (formValues) {
      const result = await App.changePassword(formValues.oldPw, formValues.newPw);
      if (result && result.success) {
        UI.toast('Password berhasil diubah!', 'success');
      } else {
        UI.toast(result?.error || 'Gagal mengubah password', 'error');
      }
    }
  }

  // Mark needs PIN on page unload
  window.addEventListener('beforeunload', () => {
    if (App.getSession()) localStorage.setItem('pf_needs_pin', 'true');
  });
});
