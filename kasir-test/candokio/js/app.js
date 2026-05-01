// app.js

/**
 * Service untuk menangani interaksi dengan Google Apps Script API
 */
class DatabaseService {
    constructor(apiUrl, apiKey) {
        this.apiUrl = apiUrl;
        this.apiKey = apiKey;
    }

    /**
     * Core method untuk mengirim permintaan ke GAS
     */
    async request(action, payload) {
        const bodyData = {
            apiKey: this.apiKey,
            action: action,
            payload: payload
        };

        try {
            // Trik khusus GAS: Gunakan 'text/plain' agar tidak memicu CORS Preflight OPTIONS
            // yang seringkali di-block oleh Google.
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8', 
                },
                body: JSON.stringify(bodyData),
                redirect: 'follow' // Wajib untuk GAS
            });

            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.message);
            }
            return result.data;

        } catch (error) {
            console.error(`[DB Service Error - ${action}]:`, error);
            throw error;
        }
    }


    // --- BUNDLE METHOD SIAP PAKAI --- //

    async createTable(tableName, columnsArray) {
        return await this.request('createTable', {
            tableName: tableName,
            columns: columnsArray
        });
    }

    async insertData(tableName, dataObject) {
        return await this.request('insertRow', {
            tableName: tableName,
            data: dataObject
        });
    }

    async renameTable(oldName, newName) {
        return await this.request('renameTable', { oldName, newName });
    }

    async getAllData(tableName) {
        return await this.request('readRows', { tableName });
    }

    async updateData(tableName, id, newDataObject) {
        return await this.request('updateRow', { tableName, id, newData: newDataObject });
    }

    async deleteData(tableName, id) {
        return await this.request('deleteRow', { tableName, id });
    }
}

// Inisialisasi Service Global
const db = new DatabaseService(ENV.GAS_API_URL, ENV.API_KEY);

// --- OFFLINE-FIRST INTEGRATION & UTILS ---

/**
 * Membuat ID Unik di sisi klien secara instan tanpa menunggu server.
 * Format: PREFIX_TIMESTAMP_RANDOM (Contoh: PRD_171452123000_a1b2)
 */
db.generateId = function(prefix = 'ID_') {
    const timestamp = Date.now().toString();
    const randomHex = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
    return `${prefix}${timestamp}_${randomHex}`;
};

// Hubungkan ke modul OfflineService
if (typeof OfflineService !== 'undefined') {
    db.cachedRead = (tableName) => OfflineService.cachedRead(tableName);
    db.cachedBulkRead = (tableNames) => OfflineService.cachedBulkRead(tableNames);
    db.optimisticWrite = (action, payload, opts) => OfflineService.optimisticWrite(action, payload, opts);
    db.getQueueStatus = () => OfflineService.getQueueStatus();
}

// Fungsi Utama yang dipanggil saat tombol diklik di HTML
async function initializeProject() {
    const statusText = document.getElementById('statusMsg');
    statusText.innerText = "Memproses... Mohon tunggu.";
    statusText.style.color = "blue";

    try {
        // 1. Buat Tabel User
        statusText.innerText = "Mengecek/Membuat Tabel 'User'...";
        await db.createTable('User', ['id', 'username', 'password', 'role']);
        console.log("Tabel User Siap.");

        // 2. Masukkan Data Admin Default (Uji Coba Hashing & Sanitasi)
        statusText.innerText = "Memasukkan Data Admin...";
        const newAdmin = {
            id: Date.now(), // Generate ID sederhana
            username: "admin_utama",
            password: "PasswordRahasia123!", // Ini akan otomatis di-hash oleh backend!
            role: "administrator"
        };
        
        await db.insertData('User', newAdmin);
        console.log("Data Admin Berhasil Ditambahkan.");

        statusText.innerText = "SUKSES! Silakan cek file Google Sheets Anda.";
        statusText.style.color = "green";

    } catch (error) {
        statusText.innerText = "GAGAL: " + error.message;
        statusText.style.color = "red";
    }
}