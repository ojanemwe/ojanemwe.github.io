/* ============================================
   Palm Fertilizer — app.js
   Data Layer, Sync Engine, Auth, RBAC
   Backend: Google Apps Script via dotenv.js
   ============================================ */

const App = (() => {
  // === TIMEZONE CONFIG ===
  const TIMEZONE_MAP = { WIB: '+07:00', WITA: '+08:00', WIT: '+09:00' };
  let currentTimezone = localStorage.getItem('pf_timezone') || 'WITA';

  // === DUMMY DATA ===
  const DUMMY = {
    users: [
      { id_user:'USR-001', foto_base64:'', nama_lengkap:'Admin Utama', no_telp_user:'6281234567890', username:'admin', password:'admin123', pin_code:'888888', role:'ADMIN', hak_akses:'{"dashboard":true,"ritase":true,"pemupukan":true,"material":true,"lahan":true,"laporan":true,"settings":true}', created_at:'2026-01-01T00:00:00+08:00', updated_at:'2026-01-01T00:00:00+08:00', modified_by:'' },
      { id_user:'USR-002', foto_base64:'', nama_lengkap:'Asisten Kebun', no_telp_user:'6281234567891', username:'asisten', password:'asisten123', pin_code:'888888', role:'ASISTEN', hak_akses:'{"dashboard":true,"ritase":true,"pemupukan":true,"material":true,"lahan":true,"laporan":true,"settings":true}', created_at:'2026-01-01T00:00:00+08:00', updated_at:'2026-01-01T00:00:00+08:00', modified_by:'' },
      { id_user:'USR-003', foto_base64:'', nama_lengkap:'Checker Lapangan', no_telp_user:'6281234567892', username:'checker', password:'checker123', pin_code:'888888', role:'CHECKER', hak_akses:'{"dashboard":true,"ritase":true,"material":false}', created_at:'2026-01-01T00:00:00+08:00', updated_at:'2026-01-01T00:00:00+08:00', modified_by:'' },
      { id_user:'USR-004', foto_base64:'', nama_lengkap:'Mandor Kebun', no_telp_user:'6281234567893', username:'mandor', password:'mandor123', pin_code:'888888', role:'MANDOR', hak_akses:'{"dashboard":true,"pemupukan":true,"material":true}', created_at:'2026-01-01T00:00:00+08:00', updated_at:'2026-01-01T00:00:00+08:00', modified_by:'' }
    ],
    drivers: [
      { id_driver:'DRV-001', nama_driver:'Supriadi', nik_driver:'6471012345670001', no_telp_driver:'6281111111101', kode_unit_driver:'HL 01', modified_by:'' },
      { id_driver:'DRV-002', nama_driver:'Bambang S.', nik_driver:'6471012345670002', no_telp_driver:'6281111111102', kode_unit_driver:'HL 02', modified_by:'' },
      { id_driver:'DRV-003', nama_driver:'Hendra W.', nik_driver:'6471012345670003', no_telp_driver:'6281111111103', kode_unit_driver:'HL 03', modified_by:'' },
      { id_driver:'DRV-004', nama_driver:'Dedi Kurnia', nik_driver:'6471012345670004', no_telp_driver:'6281111111104', kode_unit_driver:'HL 04', modified_by:'' },
      { id_driver:'DRV-005', nama_driver:'Eko Prasetyo', nik_driver:'6471012345670005', no_telp_driver:'6281111111105', kode_unit_driver:'HL 05', modified_by:'' },
      { id_driver:'DRV-006', nama_driver:'Faisal R.', nik_driver:'6471012345670006', no_telp_driver:'6281111111106', kode_unit_driver:'HL 06', modified_by:'' }
    ],
    unit_truk: [
      { id_unit:'UNT-001', kode_unit:'HL 01', nama_unit:'ARM ROLL 130 HD', site_unit:'Loa Kulu', plat_nomor:'KT 8335 NN', driver_unit:'Supriadi', kapasitas_unit:8.0, qr_unit_base64:'' },
      { id_unit:'UNT-002', kode_unit:'HL 02', nama_unit:'ARM ROLL 130 HD', site_unit:'Loa Kulu', plat_nomor:'KT 8529 NN', driver_unit:'Bambang S.', kapasitas_unit:8.0, qr_unit_base64:'' },
      { id_unit:'UNT-003', kode_unit:'HL 03', nama_unit:'ARM ROLL 130 HD', site_unit:'Loa Kulu', plat_nomor:'KT 8396 GJ', driver_unit:'Hendra W.', kapasitas_unit:8.0, qr_unit_base64:'' },
      { id_unit:'UNT-004', kode_unit:'HL 04', nama_unit:'ARM ROLL 130 HD', site_unit:'Loa Kulu', plat_nomor:'KT 8376 GJ', driver_unit:'Dedi Kurnia', kapasitas_unit:8.0, qr_unit_base64:'' },
      { id_unit:'UNT-005', kode_unit:'HL 05', nama_unit:'ARM ROLL 130 HD', site_unit:'Loa Kulu', plat_nomor:'KT 8264 GM', driver_unit:'Eko Prasetyo', kapasitas_unit:8.0, qr_unit_base64:'' },
      { id_unit:'UNT-006', kode_unit:'HL 06', nama_unit:'ARM ROLL 130 HD', site_unit:'Loa Kulu', plat_nomor:'KT 8263 GM', driver_unit:'Faisal R.', kapasitas_unit:8.0, qr_unit_base64:'' }
    ],
    blok_lahan: [
      { id_lahan:'LHN-001', kode_lahan:'L04', luas_lahan:50 }
    ],
    suplier_material: [
      { id_pt:'SPL-001', kode_pt:'PKT', nama_pt:'PT Pupuk Kaltim', alamat_pt:'Bontang, Kalimantan Timur', no_telp_pt:'625413456789', modified_by:'' }
    ],
    site_pt: [
      { id_site:'SIT-001', kode_site:'LK', nama_site:'Site Loa Kulu', alamat_site:'Loa Kulu, Kutai Kartanegara', no_telp_site:'625412345678', modified_by:'' }
    ],
    opsi_material: [
      { id_opsi:'OPS-001', nama_opsi_material:'Dolomit', jenis_material:'Organik' },
      { id_opsi:'OPS-002', nama_opsi_material:'NPK', jenis_material:'Anorganik' }
    ],
    stok_material: [
      { id_stok:'STK-001', nama_material:'Dolomit', asal_material:'PT Pupuk Kaltim', total_stok:500, stok_terpakai:120 },
      { id_stok:'STK-002', nama_material:'NPK', asal_material:'PT Pupuk Kaltim', total_stok:300, stok_terpakai:45 }
    ],
    ritase_drop: [],
    pemupukan: [],
    laporan_harian_driver: [],
    error_log: []
  };

  // Generate koordinat_tdm & blok_kebun from CSV data pattern
  const tdmData = [];
  const kebunData = [];
  const tdmCoords = [
    [-0.5218,116.9107],[-0.5225,116.9115],[-0.5232,116.9122],[-0.5240,116.9130],
    [-0.5247,116.9137],[-0.5255,116.9145],[-0.5262,116.9152],[-0.5270,116.9160],
    [-0.5277,116.9167],[-0.5285,116.9175],[-0.5292,116.9182],[-0.5300,116.9190],
    [-0.5307,116.9197],[-0.5315,116.9205],[-0.5322,116.9212],[-0.5330,116.9220],
    [-0.5337,116.9227],[-0.5345,116.9235]
  ];
  for (let i = 0; i < 18; i++) {
    const kebutuhan = Math.floor(Math.random() * 8) + 3;
    tdmData.push({
      id_tdm: `TDM-${String(i+1).padStart(3,'0')}`,
      nama_tdm: `TDM-${i+1}`,
      kebutuhan_material_tdm: kebutuhan,
      longitude_tdm: tdmCoords[i][1],
      latitude_tdm: tdmCoords[i][0]
    });
  }
  for (let b = 1; b <= 108; b++) {
    const tdmIdx = Math.floor((b-1) / 6);
    kebunData.push({
      id_kebun: `KBN-${String(b).padStart(3,'0')}`,
      kode_kebun: String(b),
      luas_kebun: +(Math.random() * 2 + 0.3).toFixed(2),
      blok_lahan_kebun: 'L04',
      longitude_kebun: 116.91 + (Math.random() * 0.02),
      latitude_kebun: -0.52 - (Math.random() * 0.02),
      jumlah_pohon: Math.floor(Math.random() * 80) + 100
    });
  }
  DUMMY.koordinat_tdm = tdmData;
  DUMMY.blok_kebun = kebunData;

  // === DATA ACCESS ===
  function getData(table) {
    const cached = localStorage.getItem(`pf_${table}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Force reload dummy data if cached array is empty for essential seed tables
      if (parsed.length === 0 && (table === 'blok_kebun' || table === 'koordinat_tdm')) {
        localStorage.setItem(`pf_${table}`, JSON.stringify(DUMMY[table]));
        return DUMMY[table];
      }
      return parsed;
    }
    if (DUMMY[table]) {
      localStorage.setItem(`pf_${table}`, JSON.stringify(DUMMY[table]));
      return DUMMY[table];
    }
    return [];
  }

  function setData(table, data) {
    localStorage.setItem(`pf_${table}`, JSON.stringify(data));
  }

  function addRecord(table, record) {
    const data = getData(table);
    data.push(record);
    setData(table, data);
    addToSyncQueue({ action: 'create', table, record });
    return record;
  }

  function updateRecord(table, idField, idValue, updates) {
    const data = getData(table);
    const idx = data.findIndex(r => r[idField] === idValue);
    if (idx > -1) {
      Object.assign(data[idx], updates);
      setData(table, data);
      addToSyncQueue({ action: 'update', table, record: data[idx] });
    }
    return idx > -1 ? data[idx] : null;
  }

  function deleteRecord(table, idField, idValue) {
    let data = getData(table);
    data = data.filter(r => r[idField] !== idValue);
    setData(table, data);
    addToSyncQueue({ action: 'delete', table, id: idValue });
  }

  // === SYNC QUEUE ===
  function getSyncQueue() {
    return JSON.parse(localStorage.getItem('pf_sync_queue') || '[]');
  }

  function addToSyncQueue(entry) {
    const q = getSyncQueue();
    entry.timestamp = new Date().toISOString();
    entry.id = `SQ-${Date.now()}-${Math.random().toString(36).substr(2,4)}`;
    q.push(entry);
    localStorage.setItem('pf_sync_queue', JSON.stringify(q));
    updateSyncBadge();
    if (window.UI && window.UI.updateSyncMenu) window.UI.updateSyncMenu();
  }

  function updateSyncBadge() {
    const badge = document.getElementById('sync-badge');
    if (!badge) return;
    const count = getSyncQueue().length;
    badge.textContent = count > 0 ? count : '';
    badge.style.display = count > 0 ? 'flex' : 'none';
  }

  // === BACKEND API HELPER ===
  let _retryCount = 0;
  async function apiPost(payload) {
    const env = window.ENV || {};
    const url = env.GAS_API_URL;
    if (!url || url.includes('GANTI_DEPLOY_ID')) {
      console.warn('[Sync] GAS_API_URL belum dikonfigurasi di dotenv.js');
      return null;
    }
    payload.apiKey = env.API_KEY || '';
    const token = getSession()?.token;
    if (token) payload.token = token;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  }

  // Build schema map from EXCEL_TABLES + extra tables
  function buildSchema_() {
    const schema = {};
    // Master data tables
    for (const [table, cfg] of Object.entries(EXCEL_TABLES)) {
      schema[table] = [cfg.idField, ...cfg.headers];
    }
    // Transaction tables
    schema.users = ['id_user','foto_base64','nama_lengkap','no_telp_user','username','password','password_hash','salt','pin_code','role','hak_akses','password_changed','created_at','updated_at','modified_by'];
    schema.ritase_drop = ['id_input_rit','timestamp_rit','kode_unit_rit','asal_drop_suplier','tujuan_drop_material','tdm_tujuan','jarak_drop_tdm','tanggal_drop_tdm','jam_drop_tdm','jumlah_rit_tdm','status_rit','input_by'];
    schema.pemupukan = ['id_apply','tanggal_apply','kode_lahan','kode_kebun','jam_start_apply','jam_end_apply','foto_start_base64','foto_end_base64','status_apply','input_by'];
    schema.laporan_harian_driver = ['id_laporan','tanggal_laporan','kode_unit','driver','jumlah_rit','total_jarak_km'];
    schema.error_log = ['id_error','timestamp','source','message','stack'];
    return schema;
  }

  // === BACKGROUND SYNC ENGINE (Real) ===
  const CHUNK_SIZE = 50; // Max items per sync batch (GAS limit is 100, use 50 for safety)
  let isSyncing = false;
  async function processSyncQueue() {
    if (isSyncing || !isOnline()) return;
    const q = getSyncQueue();
    if (q.length === 0) return;

    // Check if GAS URL is configured
    const env = window.ENV || {};
    if (!env.GAS_API_URL || env.GAS_API_URL.includes('GANTI_DEPLOY_ID')) {
      // Fallback: simulate sync (clear queue) for dev/testing without backend
      return simulateSync_();
    }

    isSyncing = true;
    try {
      // Deduplicate: keep only latest operation per table+id
      const deduped = deduplicateQueue_(q);

      // Split into chunks to stay under GAS MAX_BATCH_SIZE
      const chunks = [];
      for (let i = 0; i < deduped.length; i += CHUNK_SIZE) {
        chunks.push(deduped.slice(i, i + CHUNK_SIZE));
      }

      let allSuccess = true;
      let totalProcessed = 0;

      for (const chunk of chunks) {
        try {
          const result = await apiPost({
            action: 'sync',
            schema: buildSchema_(),
            batch: chunk
          });

          if (result && result.success) {
            totalProcessed += result.processed || 0;
            // Remove synced items from queue
            const successIds = (result.results || []).filter(r => r.success).map(r => r.id);
            let current = getSyncQueue();
            if (result.processed === chunk.length && result.errors === 0) {
              // All items in this chunk succeeded — remove them all
              const chunkIds = new Set(chunk.map(c => c.id));
              current = current.filter(item => !chunkIds.has(item.id));
            } else {
              current = current.filter(item => !successIds.includes(item.id));
            }
            localStorage.setItem('pf_sync_queue', JSON.stringify(current));
            updateSyncBadge();
            if (window.UI && window.UI.updateSyncMenu) window.UI.updateSyncMenu();
          } else {
            allSuccess = false;
            throw new Error(result?.error || 'Sync chunk failed');
          }
        } catch (chunkErr) {
          console.error('[Sync] Chunk error:', chunkErr.message);
          allSuccess = false;
          break; // Stop processing remaining chunks on error
        }
      }

      if (allSuccess) {
        _retryCount = 0;
      } else {
        _retryCount = Math.min(_retryCount + 1, (window.ENV?.MAX_RETRY || 5));
      }
    } catch (e) {
      console.error('[Sync] Error:', e.message);
      _retryCount = Math.min(_retryCount + 1, (window.ENV?.MAX_RETRY || 5));
    } finally {
      isSyncing = false;
    }
  }

  // Fallback sync for dev without backend
  async function simulateSync_() {
    isSyncing = true;
    const q = getSyncQueue();
    let newQ = [...q];
    for (let i = 0; i < q.length; i++) {
      await new Promise(res => setTimeout(res, 300));
      newQ.shift();
      localStorage.setItem('pf_sync_queue', JSON.stringify(newQ));
      updateSyncBadge();
      if (window.UI && window.UI.updateSyncMenu) window.UI.updateSyncMenu();
    }
    isSyncing = false;
  }

  // Deduplicate: collapse multiple updates to same record
  function deduplicateQueue_(queue) {
    const map = new Map();
    for (const item of queue) {
      const key = `${item.table}_${item.action === 'delete' ? item.id : (item.record?.[findIdFieldForTable_(item.table)] || item.id || item.timestamp)}`;
      // Delete always wins over create/update
      if (item.action === 'delete') {
        map.set(key, item);
      } else if (!map.has(key) || map.get(key).action !== 'delete') {
        map.set(key, item);
      }
    }
    return Array.from(map.values());
  }

  function findIdFieldForTable_(table) {
    const cfg = EXCEL_TABLES[table];
    if (cfg) return cfg.idField;
    const tableIdMap = { users:'id_user', ritase_drop:'id_input_rit', pemupukan:'id_apply', laporan_harian_driver:'id_laporan', error_log:'id_error' };
    return tableIdMap[table] || 'id';
  }

  // Calculate sync interval with exponential backoff on errors
  function getSyncInterval_() {
    if (_retryCount === 0) return window.ENV?.SYNC_INTERVAL || 10000;
    const base = window.ENV?.BACKOFF_BASE || 2000;
    return Math.min(base * Math.pow(2, _retryCount), 60000);
  }

  // Adaptive interval sync
  let syncTimer = null;
  function scheduleSyncLoop_() {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      await processSyncQueue();
      scheduleSyncLoop_();
    }, getSyncInterval_());
  }
  scheduleSyncLoop_();

  window.forceSyncNow = async function() {
    if (!isOnline()) {
      if (window.UI) window.UI.toast('Tidak ada koneksi internet', 'error');
      return;
    }
    const q = getSyncQueue();
    if (q.length === 0) {
      if (window.UI) window.UI.toast('Semua data sudah tersinkronisasi');
      return;
    }
    if (window.UI) window.UI.toast('Sinkronisasi dimulai...', 'info');
    await processSyncQueue();
    const remaining = getSyncQueue().length;
    if (remaining === 0) {
      if (window.UI) window.UI.toast('Sinkronisasi selesai!', 'success');
    } else {
      if (window.UI) window.UI.toast(`Sinkronisasi selesai. ${remaining} item gagal.`, 'warning');
    }
  };

  // === PULL MASTER DATA FROM GAS ===
  let isPulling = false;
  async function pullMasterData(tables) {
    if (isPulling || !isOnline()) return null;
    const env = window.ENV || {};
    if (!env.GAS_API_URL || env.GAS_API_URL.includes('GANTI_DEPLOY_ID')) return null;

    isPulling = true;
    try {
      const result = await apiPost({ action: 'pull', tables: tables || null });
      if (result && result.success && result.data) {
        // Update localStorage with server data
        for (const [table, records] of Object.entries(result.data)) {
          if (table === 'sistem') {
            // Apply system settings from server
            applySettingsFromServer_(records);
            continue;
          }
          if (Array.isArray(records) && records.length > 0) {
            setData(table, records);
          }
        }
        return result.data;
      }
    } catch (e) {
      console.error('[Pull] Error:', e.message);
    } finally {
      isPulling = false;
    }
    return null;
  }

  // Apply settings received from GAS 'sistem' sheet
  function applySettingsFromServer_(rows) {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      const key = row.setting_key;
      const val = row.setting_value;
      if (!key) continue;
      if (key === 'timezone') {
        currentTimezone = val || 'WITA';
        localStorage.setItem('pf_timezone', currentTimezone);
      } else {
        localStorage.setItem(`pf_setting_${key}`, val);
      }
    }
  }

  // Background pull interval
  setInterval(() => {
    if (isOnline() && getSession()) pullMasterData();
  }, window.ENV?.PULL_INTERVAL || 30000);

  // === PHONE AUTO-FORMAT ===
  function formatPhone(val) {
    let v = val.replace(/\D/g, '');
    if (v.startsWith('0')) v = '62' + v.substring(1);
    return v;
  }

  // === TIMESTAMP ===
  function now() {
    const offset = TIMEZONE_MAP[currentTimezone] || '+08:00';
    const d = new Date();
    const sign = offset[0] === '+' ? 1 : -1;
    const hrs = parseInt(offset.substring(1, 3));
    const utc = d.getTime() + d.getTimezoneOffset() * 60000;
    const local = new Date(utc + sign * hrs * 3600000);
    const pad = n => String(n).padStart(2, '0');
    return `${local.getFullYear()}-${pad(local.getMonth()+1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}:${pad(local.getSeconds())}${offset}`;
  }

  function today() { return now().substring(0, 10); }
  function timeNow() { return now().substring(11, 16); }

  // === SESSION (Dual-mode: Online→GAS, Offline→localStorage) ===
  async function login(username, password) {
    // Try online auth first
    if (isOnline()) {
      const env = window.ENV || {};
      if (env.GAS_API_URL && !env.GAS_API_URL.includes('GANTI_DEPLOY_ID')) {
        try {
          const result = await apiPost({ action: 'auth', username, password });
          if (result && result.success) {
            const session = {
              user: result.user,
              token: result.token,
              loginAt: now(),
              password_changed: result.password_changed
            };
            localStorage.setItem('pf_session', JSON.stringify(session));
            // Cache user data locally for offline login
            cacheUserForOffline_(result.user, password);
            return session;
          } else {
            return { error: result?.error || 'Login gagal' };
          }
        } catch (e) {
          console.warn('[Auth] Online login failed, falling back to offline:', e.message);
        }
      }
    }

    // Offline fallback: check local data
    const users = getData('users');
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return { error: 'Username atau password salah (offline mode)' };
    const session = { user, token: `TK-${Date.now()}`, loginAt: now(), password_changed: true };
    localStorage.setItem('pf_session', JSON.stringify(session));
    return session;
  }

  function cacheUserForOffline_(user, password) {
    // Store password in local users for offline login fallback
    const users = getData('users');
    const idx = users.findIndex(u => u.username === user.username);
    const cached = { ...user, password: password };
    if (idx > -1) {
      users[idx] = cached;
    } else {
      users.push(cached);
    }
    setData('users', users);
  }

  function getSession() {
    const s = localStorage.getItem('pf_session');
    if (!s) return null;
    const session = JSON.parse(s);
    // Check expiry: 21:00 or day change
    const loginDate = session.loginAt?.substring(0, 10);
    const todayDate = today();
    const currentHour = new Date().getHours();
    if (loginDate !== todayDate || currentHour >= 21) {
      logout();
      return null;
    }
    return session;
  }

  function logout() { localStorage.removeItem('pf_session'); }

  function verifyPin(pin) {
    const session = JSON.parse(localStorage.getItem('pf_session') || 'null');
    return session && session.user.pin_code === pin;
  }

  // === CHANGE PASSWORD ===
  async function changePassword(oldPw, newPw) {
    const session = getSession();
    if (!session) return { error: 'Tidak ada sesi aktif' };
    try {
      const result = await apiPost({
        action: 'change_password',
        username: session.user.username,
        old_password: oldPw,
        new_password: newPw
      });
      if (result && result.success) {
        // Update session flag
        session.password_changed = true;
        localStorage.setItem('pf_session', JSON.stringify(session));
        // Update local cache
        cacheUserForOffline_(session.user, newPw);
        return { success: true };
      }
      return { error: result?.error || 'Gagal mengubah password' };
    } catch (e) {
      return { error: 'Gagal terhubung ke server: ' + e.message };
    }
  }

  // === RBAC ===
  function hasPermission(key) {
    const session = getSession();
    if (!session) return false;
    if (session.user.role === 'ADMIN') return true;
    try {
      const access = JSON.parse(session.user.hak_akses || '{}');
      return !!access[key];
    } catch (e) { return false; }
  }

  // === SETTINGS (localStorage + GAS sync) ===
  function getSetting(key, def) { return localStorage.getItem(`pf_setting_${key}`) || def; }
  function setSetting(key, val) {
    localStorage.setItem(`pf_setting_${key}`, val);
    syncSettingsToGAS_({ [key]: val });
  }

  function getRitConversion() {
    return {
      tonPerRit: parseFloat(getSetting('ton_per_rit', '8')),
      get kgPerRit() { return this.tonPerRit * 1000; }
    };
  }

  function getTimezone() { return currentTimezone; }
  function setTimezone(tz) {
    currentTimezone = tz;
    localStorage.setItem('pf_timezone', tz);
    syncSettingsToGAS_({ timezone: tz });
  }

  // Push settings to GAS 'sistem' sheet (fire-and-forget)
  async function syncSettingsToGAS_(settingsObj) {
    if (!isOnline()) return;
    const env = window.ENV || {};
    if (!env.GAS_API_URL || env.GAS_API_URL.includes('GANTI_DEPLOY_ID')) return;
    try {
      await apiPost({ action: 'save_settings', settings: settingsObj });
      console.log('[Settings] Synced to GAS:', Object.keys(settingsObj));
    } catch (e) {
      console.warn('[Settings] Sync failed:', e.message);
    }
  }

  // === ONLINE STATUS ===
  let _online = navigator.onLine;
  function isOnline() { return _online; }
  window.addEventListener('online', () => { _online = true; updateOnlineUI(); });
  window.addEventListener('offline', () => { _online = false; updateOnlineUI(); });
  function updateOnlineUI() {
    const dot = document.getElementById('status-dot');
    if (dot) {
      dot.className = `status-dot ${_online ? 'online' : 'offline'}`;
      dot.title = _online ? 'Online' : 'Offline';
    }
  }

  // === GPS ===
  function getGPS() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('GPS tidak tersedia'));
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        err => reject(err),
        { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
      );
    });
  }

  // === EXCEL EXPORT/IMPORT ===
  const EXCEL_TABLES = {
    stok_material:    { idField:'id_stok',   prefix:'STK', headers:['nama_material','asal_material','total_stok','stok_terpakai'] },
    suplier_material: { idField:'id_pt',     prefix:'SPL', headers:['kode_pt','nama_pt','alamat_pt','no_telp_pt'] },
    site_pt:          { idField:'id_site',   prefix:'SIT', headers:['kode_site','nama_site','alamat_site','no_telp_site'] },
    opsi_material:    { idField:'id_opsi',   prefix:'OPS', headers:['nama_opsi_material','jenis_material'] },
    koordinat_tdm:    { idField:'id_tdm',    prefix:'TDM', headers:['nama_tdm','kebutuhan_material_tdm','longitude_tdm','latitude_tdm'] },
    blok_kebun:       { idField:'id_kebun',  prefix:'KBN', headers:['kode_kebun','luas_kebun','blok_lahan_kebun','longitude_kebun','latitude_kebun','jumlah_pohon'] },
    blok_lahan:       { idField:'id_lahan',  prefix:'LHN', headers:['kode_lahan','luas_lahan'] },
    unit_truk:        { idField:'id_unit',   prefix:'UNT', headers:['kode_unit','nama_unit','site_unit','plat_nomor','driver_unit','kapasitas_unit'] },
    drivers:          { idField:'id_driver', prefix:'DRV', headers:['nama_driver','nik_driver','no_telp_driver','kode_unit_driver'] }
  };

  function downloadExcelTemplate() {
    if (!window.XLSX) { if(window.UI) UI.toast('Library SheetJS belum dimuat','error'); return; }
    const wb = XLSX.utils.book_new();
    for (const [table, cfg] of Object.entries(EXCEL_TABLES)) {
      const ws = XLSX.utils.aoa_to_sheet([cfg.headers]);
      XLSX.utils.book_append_sheet(wb, ws, table);
    }
    _saveWorkbook(wb, 'Template_DataMaster_PalmFertilizer.xlsx');
    if(window.UI) UI.toast('Template berhasil diunduh!','success');
  }

  function exportMasterDataExcel() {
    if (!window.XLSX) { if(window.UI) UI.toast('Library SheetJS belum dimuat','error'); return; }
    const wb = XLSX.utils.book_new();
    for (const [table, cfg] of Object.entries(EXCEL_TABLES)) {
      const data = getData(table);
      const rows = data.map(r => cfg.headers.map(h => r[h] ?? ''));
      const ws = XLSX.utils.aoa_to_sheet([cfg.headers, ...rows]);
      XLSX.utils.book_append_sheet(wb, ws, table);
    }
    _saveWorkbook(wb, `Export_DataMaster_${today().replace(/-/g,'')}.xlsx`);
    if(window.UI) UI.toast('Data master berhasil diekspor!','success');
  }

  // Reliable cross-browser file download via Blob + <a> click
  function _saveWorkbook(wb, filename) {
    const wbout = XLSX.write(wb, { bookType:'xlsx', type:'array' });
    const blob = new Blob([wbout], { type:'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function importMasterDataExcel(file, onComplete) {
    if (!file) return;
    if (!window.XLSX) { if(window.UI) UI.toast('Library SheetJS belum dimuat','error'); return; }
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const wb = XLSX.read(e.target.result, { type:'array' });
        let total = 0;
        const importedTables = {};
        for (const [table, cfg] of Object.entries(EXCEL_TABLES)) {
          const ws = wb.Sheets[table];
          if (!ws) continue;
          const rows = XLSX.utils.sheet_to_json(ws);
          if (!rows.length) continue;
          const records = rows.map((row, i) => {
            const rec = {};
            rec[cfg.idField] = `${cfg.prefix}-${Date.now()}-${i}`;
            cfg.headers.forEach(h => { rec[h] = row[h] !== undefined ? row[h] : ''; });
            if (table === 'suplier_material' || table === 'site_pt' || table === 'drivers') rec.modified_by = '';
            if (table === 'unit_truk') rec.qr_unit_base64 = '';
            return rec;
          });
          setData(table, records);
          importedTables[table] = records;
          total += records.length;
        }
        if(window.UI) UI.toast(`Import lokal berhasil! ${total} record. Menyinkronkan ke server...`,'info');
        if (typeof onComplete === 'function') onComplete();
        // Push to GAS in background
        pushBulkImportToGAS_(importedTables);
      } catch(err) {
        console.error('Import error:', err);
        if(window.UI) UI.toast('Gagal membaca file Excel. Pastikan format benar.','error');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // Push all imported tables to GAS via dedicated bulk_import endpoint
  async function pushBulkImportToGAS_(tablesData) {
    if (!isOnline()) {
      if(window.UI) UI.toast('Offline — data tersimpan lokal, akan disinkronkan saat online.','warning');
      // Store a single bulk-import marker in sync queue for retry when back online
      addToSyncQueue({ action: 'bulk_import', table: '_bulk_', record: { tables: Object.keys(tablesData) } });
      return;
    }
    const env = window.ENV || {};
    if (!env.GAS_API_URL || env.GAS_API_URL.includes('GANTI_DEPLOY_ID')) {
      if(window.UI) UI.toast('GAS API belum dikonfigurasi. Data hanya tersimpan lokal.','warning');
      return;
    }
    try {
      const result = await apiPost({
        action: 'bulk_import',
        schema: buildSchema_(),
        tables: tablesData
      });
      if (result && result.success) {
        // Success! Clear any stale sync queue items for imported tables
        clearSyncQueueForTables_(Object.keys(tablesData));
        if(window.UI) UI.toast(`✅ Sinkronisasi ke database berhasil! ${result.total_records} record diperbarui.`,'success');
      } else {
        throw new Error(result?.error || 'Bulk import failed');
      }
    } catch (e) {
      console.error('[BulkImport] Error:', e.message);
      if(window.UI) UI.toast('⚠️ Gagal sinkronisasi ke server. Akan dicoba ulang otomatis.','warning');
      // Do NOT flood sync queue with individual records!
      // Store a compact retry marker instead
      addToSyncQueue({ action: 'bulk_import', table: '_bulk_', record: { tables: Object.keys(tablesData) } });
    }
  }

  // Remove all sync queue items belonging to specified tables
  function clearSyncQueueForTables_(tableNames) {
    const tableSet = new Set(tableNames);
    const q = getSyncQueue();
    const filtered = q.filter(item => !tableSet.has(item.table));
    localStorage.setItem('pf_sync_queue', JSON.stringify(filtered));
    updateSyncBadge();
    if (window.UI && window.UI.updateSyncMenu) window.UI.updateSyncMenu();
  }

  // === INIT ===
  function init() {
    // Pre-cache all data tables
    ['users','drivers','unit_truk','koordinat_tdm','blok_lahan','blok_kebun',
     'suplier_material','site_pt','opsi_material','stok_material','ritase_drop','pemupukan','laporan_harian_driver']
      .forEach(t => getData(t));
    updateSyncBadge();
    setTimeout(updateOnlineUI, 100);
  }

  return {
    getData, setData, addRecord, updateRecord, deleteRecord,
    getSyncQueue, updateSyncBadge, formatPhone,
    now, today, timeNow,
    login, getSession, logout, verifyPin, changePassword, hasPermission,
    getSetting, setSetting, getRitConversion, getTimezone, setTimezone,
    isOnline, getGPS, init, TIMEZONE_MAP, pullMasterData,
    downloadExcelTemplate, exportMasterDataExcel, importMasterDataExcel,
    EXCEL_TABLES
  };
})();
