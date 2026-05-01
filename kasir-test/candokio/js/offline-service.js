/**
 * ============================================================================
 * CANDOKIO POS — OFFLINE SERVICE (js/offline-service.js)
 * ============================================================================
 * Modul utama Offline-First Architecture:
 * 1. IndexedDB Cache via localForage (Stale-While-Revalidate reads)
 * 2. Optimistic UI Writes with persistent Sync Queue
 * 3. Background Queue Processor with GAS rate-limit protection
 * 4. Event-driven UI re-render on data changes
 * ============================================================================
 */

const OfflineService = (function() {
    'use strict';

    // ========================================================================
    // INSTANCES — 2 localForage stores
    // ========================================================================
    const dataCache = localforage.createInstance({
        name: 'candokio',
        storeName: 'dataCache',
        description: 'Cache data tabel dari server'
    });

    const syncQueue = localforage.createInstance({
        name: 'candokio',
        storeName: 'syncQueue',
        description: 'Antrean operasi tulis yang belum dikirim ke server'
    });

    // ========================================================================
    // STATE
    // ========================================================================
    let _isProcessing = false;
    let _processInterval = null;

    // Delay antar request ke GAS (ms) — mencegah rate limit
    const GAS_REQUEST_DELAY = 500;
    // Max retries sebelum item ditandai 'failed'
    const MAX_RETRIES = 15;
    // Exponential backoff base (ms)
    const BACKOFF_BASE = 1000;
    const BACKOFF_MAX = 30000;

    // ========================================================================
    // 1. CACHED READ — Stale-While-Revalidate
    // ========================================================================

    /**
     * Baca data dari cache (instan), lalu revalidasi dari server di background.
     * @param {string} tableName - Nama tabel (e.g. 'Produk')
     * @returns {Promise<Array>} Data dari cache (atau [] jika kosong)
     */
    async function cachedRead(tableName) {
        // 1. Baca dari IndexedDB (instan)
        let cached = null;
        try {
            cached = await dataCache.getItem(tableName);
        } catch (e) {
            console.warn('[OfflineService] Gagal baca cache:', tableName, e);
        }

        // 2. Background fetch dari server (non-blocking)
        if (navigator.onLine) {
            _revalidateTable(tableName).catch(() => {});
        }

        return cached || [];
    }

    /**
     * Baca banyak tabel dari cache sekaligus, lalu revalidasi di background.
     * @param {string[]} tableNames - Array nama tabel
     * @returns {Promise<Object>} { tableName: rows[] }
     */
    async function cachedBulkRead(tableNames) {
        const result = {};

        // 1. Baca semua dari cache secara paralel (instan)
        await Promise.all(tableNames.map(async (name) => {
            try {
                result[name] = (await dataCache.getItem(name)) || [];
            } catch (e) {
                result[name] = [];
            }
        }));

        // 2. Background: fetch semua dari server via bulkRead
        if (navigator.onLine) {
            _revalidateBulk(tableNames).catch(() => {});
        }

        return result;
    }

    /**
     * Background revalidation untuk satu tabel
     */
    async function _revalidateTable(tableName) {
        try {
            const freshData = await db.request('readRows', { tableName });
            const cached = await dataCache.getItem(tableName);

            if (_hasChanged(cached, freshData)) {
                await dataCache.setItem(tableName, freshData);
                _dispatchUpdate([tableName]);
            }
        } catch (e) {
            // Offline atau error — tetap pakai cache
            console.warn('[OfflineService] Revalidate gagal:', tableName, e.message);
        }
    }

    /**
     * Background revalidation untuk banyak tabel sekaligus
     */
    async function _revalidateBulk(tableNames) {
        try {
            const freshData = await db.request('bulkRead', { tableNames });
            const changedTables = [];

            for (const [name, rows] of Object.entries(freshData)) {
                const cached = await dataCache.getItem(name);
                if (_hasChanged(cached, rows)) {
                    await dataCache.setItem(name, rows);
                    changedTables.push(name);
                }
            }

            if (changedTables.length > 0) {
                _dispatchUpdate(changedTables);
            }
        } catch (e) {
            console.warn('[OfflineService] BulkRevalidate gagal:', e.message);
        }
    }

    /**
     * Refresh semua cache dari server (dipanggil oleh Global Sync button)
     */
    async function refreshAllCache() {
        const allTables = [
            'Produk', 'Kategori_Produk', 'Satuan_Produk', 'Pelanggan', 'Toko',
            'Transaksi', 'DetailTransaksi', 'Shift', 'Hutang', 'PembayaranHutang',
            'BukuKas'
        ];

        try {
            const freshData = await db.request('bulkRead', { tableNames: allTables });
            const changedTables = [];

            for (const [name, rows] of Object.entries(freshData)) {
                const cached = await dataCache.getItem(name);
                if (_hasChanged(cached, rows)) {
                    await dataCache.setItem(name, rows);
                    changedTables.push(name);
                }
            }

            if (changedTables.length > 0) {
                _dispatchUpdate(changedTables);
            }

            return { updated: changedTables.length, tables: changedTables };
        } catch (e) {
            console.error('[OfflineService] refreshAllCache gagal:', e);
            throw e;
        }
    }

    // ========================================================================
    // 2. OPTIMISTIC WRITE — Simpan lokal + Queue ke server
    // ========================================================================

    /**
     * Tulis data secara optimistik: simpan ke cache lokal, queue ke server.
     * @param {string} action - Nama action GAS (e.g. 'insertRow', 'createTransaction')
     * @param {object} payload - Payload data
     * @param {object} options - { localUpdate: async function(dataCache) }
     * @returns {Promise<{success: boolean, queueId: string}>}
     */
    async function optimisticWrite(action, payload, options = {}) {
        const queueId = Date.now() + '_' + Math.random().toString(36).substr(2, 8);
        const idempotencyKey = 'idem_' + queueId;

        // 1. Update cache lokal secara optimistik
        if (options.localUpdate && typeof options.localUpdate === 'function') {
            try {
                await options.localUpdate(dataCache);
            } catch (e) {
                console.warn('[OfflineService] localUpdate gagal:', e);
            }
        }

        // 2. Simpan ke sync queue (persistent — tidak hilang saat refresh/tutup browser)
        const queueItem = {
            id: queueId,
            action: action,
            payload: { ...payload, _idempotencyKey: idempotencyKey },
            status: 'pending',
            retries: 0,
            maxRetries: MAX_RETRIES,
            createdAt: new Date().toISOString(),
            lastAttempt: null,
            lastError: null
        };

        await syncQueue.setItem(queueId, queueItem);
        _updateBadge();

        // 3. Coba kirim langsung jika online (non-blocking)
        if (navigator.onLine) {
            setTimeout(() => processQueue(), 100);
        }

        return { success: true, queued: true, queueId };
    }

    /**
     * Tulis data langsung ke cache lokal (tanpa queue ke server).
     * Digunakan untuk computed/derived data seperti _dashboardStats.
     */
    async function setCacheItem(key, value) {
        await dataCache.setItem(key, value);
    }

    /**
     * Baca satu item dari cache.
     */
    async function getCacheItem(key) {
        return await dataCache.getItem(key);
    }

    // ========================================================================
    // 3. SYNC QUEUE PROCESSOR — FIFO, rate-limited, with retry
    // ========================================================================

    /**
     * Proses semua item pending di sync queue secara berurutan (FIFO).
     * Dengan jeda antar request untuk menghindari rate limit GAS.
     */
    async function processQueue() {
        if (_isProcessing) return;
        _isProcessing = true;

        try {
            // Ambil semua keys, sort by createdAt (FIFO)
            const keys = await syncQueue.keys();
            if (keys.length === 0) {
                _isProcessing = false;
                _updateBadge();
                return;
            }

            // Load semua items dan sort
            const items = [];
            for (const key of keys) {
                const item = await syncQueue.getItem(key);
                if (item && item.status === 'pending') {
                    items.push(item);
                }
            }

            items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

            // Chunk processing: proses hingga 20 antrean sekaligus via bulkSync
            const CHUNK_SIZE = 20;
            for (let i = 0; i < items.length; i += CHUNK_SIZE) {
                if (!navigator.onLine) {
                    console.log('[OfflineService] Offline — pause queue processing');
                    break;
                }

                const chunk = items.slice(i, i + CHUNK_SIZE);
                
                try {
                    // Update timestamp untuk semua item di chunk ini
                    for (const item of chunk) {
                        item.lastAttempt = new Date().toISOString();
                    }

                    const operations = chunk.map(c => ({
                        id: c.id,
                        action: c.action,
                        payload: c.payload,
                        idempotencyKey: c.payload._idempotencyKey
                    }));
                    
                    console.log(`[OfflineService] Mengirim bulkSync ${chunk.length} operasi...`);
                    const result = await db.request('bulkSync', { operations });
                    
                    // Proses hasil dari server untuk tiap operasi
                    for (const res of result.results) {
                        const originalItem = chunk.find(c => c.id === res.id);
                        if (!originalItem) continue;

                        if (res.status === 'success' || res.status === 'skipped') {
                            // Berhasil atau sudah pernah diproses (idempotent)
                            await syncQueue.removeItem(originalItem.id);
                            if (res.status === 'success') {
                                await _handleServerResponse(originalItem.action, originalItem.payload, res.data);
                            }
                            console.log('[OfflineService] Sync sukses:', originalItem.action, originalItem.id);
                        } else {
                            // Error pada item spesifik ini
                            originalItem.retries++;
                            originalItem.lastError = res.message || 'Error processing';
                            if (originalItem.retries >= originalItem.maxRetries) {
                                originalItem.status = 'failed';
                                console.error('[OfflineService] Max retries reached:', originalItem.action, originalItem.id);
                            }
                            await syncQueue.setItem(originalItem.id, originalItem);
                        }
                    }
                } catch (error) {
                    // Request bulk gagal total (timeout, network error, 429)
                    console.warn('[OfflineService] Bulk request gagal:', error.message);
                    for (const item of chunk) {
                        item.retries++;
                        item.lastError = error.message;
                        if (item.retries >= item.maxRetries) {
                            item.status = 'failed';
                        }
                        await syncQueue.setItem(item.id, item);
                    }
                    
                    // Exponential backoff berdasarkan retry paling tinggi di chunk
                    const maxRetriesInChunk = Math.max(...chunk.map(c => c.retries));
                    const backoff = Math.min(BACKOFF_BASE * Math.pow(2, maxRetriesInChunk - 1), BACKOFF_MAX);
                    await _sleep(backoff);
                    continue; // Skip ke iterasi berikutnya (bisa berhenti jika offline)
                }

                // Jeda normal antar request sukses
                await _sleep(GAS_REQUEST_DELAY);
            }
        } catch (e) {
            console.error('[OfflineService] processQueue error:', e);
        } finally {
            _isProcessing = false;
            _updateBadge();
        }
    }

    /**
     * Handle response dari server setelah sync berhasil.
     * Refresh cache tabel yang terkait agar data lokal = data server.
     */
    async function _handleServerResponse(action, payload, result) {
        // Setelah operasi berhasil di server, revalidate tabel terkait
        const tablesToRefresh = [];

        switch (action) {
            case 'createTransaction':
                tablesToRefresh.push('Produk', 'Transaksi', 'DetailTransaksi', 'Shift');
                if (payload.transaction && payload.transaction.metode === 'HUTANG') {
                    tablesToRefresh.push('Hutang');
                }
                break;
            case 'processReturn':
                tablesToRefresh.push('Produk', 'Transaksi', 'DetailTransaksi', 'Hutang');
                break;
            case 'insertRow':
            case 'updateRow':
            case 'deleteRow':
                if (payload.tableName) tablesToRefresh.push(payload.tableName);
                break;
            case 'openShift':
            case 'closeShift':
                tablesToRefresh.push('Shift', 'BukuKas');
                break;
            case 'payDebt':
                tablesToRefresh.push('Hutang', 'PembayaranHutang', 'BukuKas');
                break;
            case 'adjustStock':
                tablesToRefresh.push('Produk', 'PergerakanInventori');
                break;
            default:
                break;
        }

        // Revalidate tabel yang terkait dari server
        if (tablesToRefresh.length > 0 && navigator.onLine) {
            try {
                const uniqueTables = [...new Set(tablesToRefresh)];
                const freshData = await db.request('bulkRead', { tableNames: uniqueTables });
                for (const [name, rows] of Object.entries(freshData)) {
                    await dataCache.setItem(name, rows);
                }
                _dispatchUpdate(uniqueTables);
            } catch (e) {
                // Non-critical — cache akan di-refresh pada kesempatan berikutnya
                console.warn('[OfflineService] Post-sync revalidate gagal:', e.message);
            }
        }
    }

    /**
     * Retry semua item yang berstatus 'failed'
     */
    async function retryFailed() {
        const keys = await syncQueue.keys();
        for (const key of keys) {
            const item = await syncQueue.getItem(key);
            if (item && item.status === 'failed') {
                item.status = 'pending';
                item.retries = 0;
                await syncQueue.setItem(key, item);
            }
        }
        processQueue();
    }

    // ========================================================================
    // 4. QUEUE STATUS & MANAGEMENT
    // ========================================================================

    /**
     * Hitung jumlah item pending di queue
     */
    async function getPendingCount() {
        const keys = await syncQueue.keys();
        let count = 0;
        for (const key of keys) {
            const item = await syncQueue.getItem(key);
            if (item && (item.status === 'pending' || item.status === 'failed')) {
                count++;
            }
        }
        return count;
    }

    /**
     * Ambil status lengkap queue
     */
    async function getQueueStatus() {
        const keys = await syncQueue.keys();
        let pending = 0, failed = 0;
        const items = [];

        for (const key of keys) {
            const item = await syncQueue.getItem(key);
            if (!item) continue;
            if (item.status === 'pending') pending++;
            if (item.status === 'failed') failed++;
            items.push({
                id: item.id,
                action: item.action,
                status: item.status,
                retries: item.retries,
                createdAt: item.createdAt,
                lastError: item.lastError
            });
        }

        return { pending, failed, total: keys.length, items };
    }

    /**
     * Bersihkan semua cache dan queue (dipanggil saat logout)
     */
    async function clearAllCache() {
        try {
            await dataCache.clear();
            // TIDAK menghapus syncQueue saat logout — data belum tentu sudah sync
            // Queue akan tetap ada dan di-process saat login berikutnya
            console.log('[OfflineService] Data cache cleared');
        } catch (e) {
            console.warn('[OfflineService] Gagal clear cache:', e);
        }
    }

    /**
     * Force clear queue (hanya untuk admin/debug)
     */
    async function forceClearQueue() {
        await syncQueue.clear();
        _updateBadge();
    }

    // ========================================================================
    // 5. HELPERS
    // ========================================================================

    /**
     * Deteksi apakah data berubah (shallow JSON comparison)
     */
    function _hasChanged(oldData, newData) {
        if (!oldData && newData) return true;
        if (!oldData || !newData) return false;
        if (Array.isArray(oldData) && Array.isArray(newData) && oldData.length !== newData.length) return true;
        try {
            return JSON.stringify(oldData) !== JSON.stringify(newData);
        } catch (e) {
            return true;
        }
    }

    /**
     * Dispatch custom event untuk memberitahu UI bahwa data berubah
     */
    function _dispatchUpdate(tables) {
        window.dispatchEvent(new CustomEvent('data-updated', {
            detail: { tables: tables }
        }));
    }

    /**
     * Update sync badge di header
     */
    async function _updateBadge() {
        try {
            const count = await getPendingCount();
            if (typeof window.updateSyncBadge === 'function') {
                window.updateSyncBadge(count);
            }
        } catch (e) { /* non-critical */ }
    }

    /**
     * Sleep utility
     */
    function _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Start periodic queue processing (setiap 30 detik)
     */
    function startPeriodicSync() {
        if (_processInterval) return;
        _processInterval = setInterval(() => {
            if (navigator.onLine && !_isProcessing) {
                processQueue();
            }
        }, 30000);
    }

    /**
     * Stop periodic sync
     */
    function stopPeriodicSync() {
        if (_processInterval) {
            clearInterval(_processInterval);
            _processInterval = null;
        }
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================
    return {
        // Cache stores (exposed for direct access if needed)
        dataCache,
        syncQueue,

        // Read operations (Stale-While-Revalidate)
        cachedRead,
        cachedBulkRead,
        refreshAllCache,
        getCacheItem,
        setCacheItem,

        // Write operations (Optimistic + Queue)
        optimisticWrite,

        // Queue management
        processQueue,
        retryFailed,
        getPendingCount,
        getQueueStatus,

        // Lifecycle
        clearAllCache,
        forceClearQueue,
        startPeriodicSync,
        stopPeriodicSync
    };

})();

// Hubungkan ke instance db global
if (typeof db !== 'undefined' && typeof OfflineService !== 'undefined') {
    db.cachedRead = (tableName) => OfflineService.cachedRead(tableName);
    db.cachedBulkRead = (tableNames) => OfflineService.cachedBulkRead(tableNames);
    db.optimisticWrite = (action, payload, opts) => OfflineService.optimisticWrite(action, payload, opts);
    db.getQueueStatus = () => OfflineService.getQueueStatus();
}
