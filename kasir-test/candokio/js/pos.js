/**
 * ============================================================================
 * CANDOKIO POS — POS.JS (Logika Terminal Kasir)
 * ============================================================================
 * Cart management, checkout, shift, barcode scanner, receipt printing
 * ============================================================================
 */
(function () {
    'use strict';

    // ========================================================================
    // STATE
    // ========================================================================
    const POS = {
        products: [],           // All products (cached)
        categories: [],         // Category list
        customers: [],          // Customer list for autocomplete
        cart: [],               // Cart items: { product_id, nama, harga, cost, qty, stok }
        discount: { type: 'amount', value: 0 },  // { type: 'amount'|'percent', value: number }
        activeShift: null,      // Current active shift object
        selectedCustomer: '',   // Customer name
        selectedCategory: 'all',
        searchQuery: '',
        scannerInstance: null,  // html5-qrcode instance
    };

    // ========================================================================
    // INITIALIZATION
    // ========================================================================
    async function initPOS() {
        await loadShiftStatus();
        await loadProducts();
        await loadCustomers();
        renderCart();

        // Mobile: default tampilan List
        if (window.innerWidth <= 768) {
            const grid = document.getElementById('pos-grid');
            if (grid && !grid.classList.contains('list-view')) {
                grid.classList.add('list-view');
                const iconGrid = document.getElementById('icon-grid');
                const iconList = document.getElementById('icon-list');
                if (iconGrid) iconGrid.style.display = 'block';
                if (iconList) iconList.style.display = 'none';
            }
        }
    }

    // ========================================================================
    // SHIFT MANAGEMENT
    // ========================================================================
    async function loadShiftStatus() {
        try {
            const allShifts = await OfflineService.cachedRead('Shift');
            const openShift = allShifts.find(s =>
                s.status && s.status.toLowerCase() === 'open' &&
                s.kasir === App.currentUser.username
            );
            POS.activeShift = openShift || null;
            updateShiftUI();
        } catch (e) {
            console.warn('[POS] Gagal cek shift:', e.message);
        }
    }

    function updateShiftUI() {
        const bar = document.getElementById('shift-bar');
        const statusText = document.getElementById('shift-status-text');
        const btnOpen = document.getElementById('btn-open-shift');
        const btnClose = document.getElementById('btn-close-shift');
        const btnCheckout = document.getElementById('btn-checkout');

        if (POS.activeShift) {
            bar.classList.remove('inactive');
            const openTime = formatDateTime(POS.activeShift.waktu_buka);
            statusText.innerHTML = '🟢 Shift Aktif — Dibuka: ' + openTime + ' | Modal: ' + formatCurrency(POS.activeShift.modal_awal);
            btnOpen.classList.add('hidden');
            btnClose.classList.remove('hidden');
        } else {
            bar.classList.add('inactive');
            statusText.innerHTML = '⚠️ Shift belum dibuka. Buka shift untuk memulai transaksi.';
            btnOpen.classList.remove('hidden');
            btnClose.classList.add('hidden');
        }
    }

    // Buka Shift
    document.getElementById('btn-open-shift').addEventListener('click', async () => {
        const { value: modal } = await Swal.fire({
            title: 'Buka Shift',
            html: '<p style="margin-bottom:0.75rem; color:var(--text-muted); font-size:0.875rem;">Masukkan jumlah uang tunai di laci sebagai modal awal.</p>',
            input: 'number',
            inputLabel: 'Modal Awal (Rp)',
            inputPlaceholder: 'Contoh: 200000',
            inputAttributes: { min: 0 },
            showCancelButton: true,
            confirmButtonText: 'Buka Shift',
            cancelButtonText: 'Batal',
            confirmButtonColor: '#6366F1',
            inputValidator: (val) => {
                if (!val || isNaN(val) || parseFloat(val) < 0) return 'Masukkan jumlah yang valid!';
            }
        });

        if (modal !== undefined) {
            showLoading('Membuka shift...');
            try {
                const shiftId = db.generateId('SHF_');
                await db.optimisticWrite('openShift', {
                    shift_id: shiftId,
                    kasir: App.currentUser.username,
                    modal_awal: parseFloat(modal)
                });
                POS.activeShift = {
                    id: shiftId,
                    kasir: App.currentUser.username,
                    modal_awal: parseFloat(modal),
                    waktu_buka: new Date().toISOString(),
                    status: 'open'   // ← tambahkan ini agar konsisten dengan cache
                };
                updateShiftUI();
                showToast('Shift berhasil dibuka (Offline Syncing)!', 'success');
            } catch (e) {
                showToast(e.message, 'error');
            }
            hideLoading();
        }
    });

    // Tutup Shift
    document.getElementById('btn-close-shift').addEventListener('click', async () => {
        if (!POS.activeShift) return;

        // Hitung uang diharapkan dari data shift aktif
        const modalAwal = parseFloat(POS.activeShift.modal_awal) || 0;
        const penjualanTunai = parseFloat(POS.activeShift.total_penjualan_tunai) || 0;
        const totalPengeluaran = parseFloat(POS.activeShift.total_pengeluaran) || 0;
        const uangDiharapkan = modalAwal + penjualanTunai - totalPengeluaran;

        const { value: uangAktual } = await Swal.fire({
            title: 'Tutup Shift',
            html: `<p style="color:var(--text-muted); font-size:0.875rem; margin-bottom:0.5rem;">Hitung uang tunai fisik di laci Anda.</p>
                   <div style="font-size:0.8125rem; line-height:1.8; text-align:left; margin-bottom:0.5rem;">
                       <div style="display:flex;justify-content:space-between;"><span>Modal Awal:</span><b>${formatCurrency(modalAwal)}</b></div>
                       <div style="display:flex;justify-content:space-between;"><span>Penjualan Tunai:</span><b style="color:var(--success);">+ ${formatCurrency(penjualanTunai)}</b></div>
                       <div style="display:flex;justify-content:space-between;"><span>Pengeluaran:</span><b style="color:var(--danger);">- ${formatCurrency(totalPengeluaran)}</b></div>
                       <hr style="margin:0.3rem 0;">
                       <div style="display:flex;justify-content:space-between; font-weight:700;"><span>Seharusnya:</span><b style="color:var(--primary);">${formatCurrency(uangDiharapkan)}</b></div>
                   </div>`,
            input: 'number',
            inputLabel: 'Uang Aktual di Laci (Rp)',
            inputPlaceholder: formatCurrency(uangDiharapkan).replace('Rp ', ''),
            inputValue: uangDiharapkan,
            inputAttributes: { min: 0 },
            showCancelButton: true,
            confirmButtonText: 'Tutup Shift',
            cancelButtonText: 'Batal',
            confirmButtonColor: '#EF4444',
            inputValidator: (val) => {
                if (val === '' || isNaN(val)) return 'Masukkan jumlah yang valid!';
            }
        });

        if (uangAktual !== undefined) {
            showLoading('Menutup shift...');
            try {
                const result = await db.optimisticWrite('closeShift', {
                    shiftId: POS.activeShift.id,
                    uang_aktual: parseFloat(uangAktual),
                    isAuto: false,
                    catatan: '',
                    kasir: App.currentUser.nama_lengkap || App.currentUser.username
                });

                POS.activeShift = null;
                updateShiftUI();
                showToast('Shift berhasil ditutup (Offline Syncing)!', 'success');
                hideLoading();

                // Tampilkan rekapitulasi secara optimistik (karena data di-sync ke background)
                const selisih = parseFloat(uangAktual) - uangDiharapkan;
                const selisihClass = selisih >= 0 ? 'color:var(--success)' : 'color:var(--danger)';
                await Swal.fire({
                    title: 'Shift Ditutup (Offline Sync)',
                    html: `
                        <div style="text-align:left; font-size:0.875rem; line-height:1.8;">
                            <div style="display:flex;justify-content:space-between;"><span>Modal Awal:</span><b>${formatCurrency(modalAwal)}</b></div>
                            <div style="display:flex;justify-content:space-between;"><span>Penjualan Tunai:</span><b>${formatCurrency(penjualanTunai)}</b></div>
                            <div style="display:flex;justify-content:space-between;"><span>Pengeluaran:</span><b>${formatCurrency(totalPengeluaran)}</b></div>
                            <hr style="margin:0.5rem 0;">
                            <div style="display:flex;justify-content:space-between;"><span>Uang Diharapkan:</span><b>${formatCurrency(uangDiharapkan)}</b></div>
                            <div style="display:flex;justify-content:space-between;"><span>Uang Aktual:</span><b>${formatCurrency(uangAktual)}</b></div>
                            <div style="display:flex;justify-content:space-between;"><span>Selisih:</span><b style="${selisihClass}">${formatCurrency(selisih)}</b></div>
                        </div>
                    `,
                    icon: selisih === 0 ? 'success' : 'warning',
                    confirmButtonColor: '#6366F1'
                });
            } catch (e) {
                hideLoading();
                showToast(e.message, 'error');
            }
        }
    });

    // ========================================================================
    // PRODUCT LOADING & RENDERING
    // ========================================================================
    async function loadProducts() {
        try {
            const result = await OfflineService.cachedBulkRead(['Produk', 'Kategori_Produk', 'Satuan_Produk', 'Toko']);
            POS.tokoSettings = (result.Toko && result.Toko.length > 0) ? result.Toko[0] : {};
            POS.products = result.Produk || [];
            POS.categories = result.Kategori_Produk || [];
            POS.units = result.Satuan_Produk || [];

            // Kalkulasi real-time stok dan cost produk turunan (Varian)
            _recalcVariants();

            renderCategories();
            renderProducts();
        } catch (e) {
            console.warn('[POS] Gagal load produk:', e.message);
            document.getElementById('pos-grid').innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><h4>Gagal memuat produk</h4><p>' + escapeHtml(e.message) + '</p></div>';
        }
    }

    // Recalculate variant products (stok & cost from parent)
    function _recalcVariants() {
        POS.products.forEach(p => {
            if (p.satuan && p.satuan !== 'Pcs' && p.satuan !== '' && p.related_product_id) {
                const parentItem = POS.products.find(parent => parent.id === p.related_product_id);
                const unitObj = POS.units.find(u => u.nama === p.satuan);
                if (parentItem && unitObj) {
                    const qty = parseInt(unitObj.jumlah) || 1;
                    p.cost = parseFloat(parentItem.cost || 0) * qty;
                    p.stok = Math.floor((parseInt(parentItem.stok) || 0) / qty);
                    p.deduct_multiplier = qty;
                }
            }
        });
    }

    // Listen for background data updates (Stale-While-Revalidate)
    function _onDataUpdated(e) {
        const tables = e.detail.tables || [];
        if (tables.some(t => ['Produk', 'Kategori_Produk', 'Satuan_Produk', 'Toko'].includes(t))) {
            // Re-load dari cache (sudah diupdate oleh OfflineService)
            OfflineService.cachedBulkRead(['Produk', 'Kategori_Produk', 'Satuan_Produk', 'Toko']).then(result => {
                POS.tokoSettings = (result.Toko && result.Toko.length > 0) ? result.Toko[0] : {};
                POS.products = result.Produk || [];
                POS.categories = result.Kategori_Produk || [];
                POS.units = result.Satuan_Produk || [];
                _recalcVariants();
                renderCategories();
                renderProducts();
            });
        }
        if (tables.includes('Pelanggan')) {
            OfflineService.cachedRead('Pelanggan').then(customers => {
                POS.customers = customers || [];
                _renderCustomerList();
            });
        }
    }
    window.addEventListener('data-updated', _onDataUpdated);

    function renderCategories() {
        const chipAll = document.querySelector('#pos-categories .pos-category-chip[data-cat="all"]');
        const chipFav = document.querySelector('#pos-categories .pos-category-chip[data-cat="fav"]');
        const dropWrap = document.getElementById('pos-cat-dropdown-wrap');
        const dropBtn = document.getElementById('pos-cat-dropdown-btn');
        const dropLabel = document.getElementById('pos-cat-dropdown-label');
        const dropMenu = document.getElementById('pos-cat-dropdown-menu');

        // Reset chip states
        [chipAll, chipFav].forEach(c => { if (c) c.classList.remove('active'); });

        // Isi dropdown menu dengan kategori
        if (POS.categories.length > 0) {
            dropWrap.style.display = '';
            dropMenu.innerHTML = POS.categories.map(c => {
                const catName = escapeHtml(c.nama_kategori || c.id);
                const catVal = c.nama_kategori || c.id;
                return `<button class="pos-cat-dropdown-item" data-cat="${catName}">${catName}</button>`;
            }).join('');

            // Bind click events pada setiap item dropdown
            dropMenu.querySelectorAll('.pos-cat-dropdown-item').forEach(item => {
                item.addEventListener('click', () => {
                    const cat = item.getAttribute('data-cat');
                    _setActiveCategory(cat);
                    // Tutup dropdown
                    dropMenu.classList.remove('open');
                    dropBtn.classList.remove('open');
                });
            });
        } else {
            dropWrap.style.display = 'none';
        }

        // Bind chip Semua & Favorit
        if (chipAll) chipAll.addEventListener('click', () => _setActiveCategory('all'));
        if (chipFav) chipFav.addEventListener('click', () => _setActiveCategory('fav'));

        // Toggle dropdown buka/tutup
        if (dropBtn) {
            // Hapus listener lama supaya tidak dobel
            const newBtn = dropBtn.cloneNode(true);
            dropBtn.parentNode.replaceChild(newBtn, dropBtn);
            newBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                dropMenu.classList.toggle('open');
                newBtn.classList.toggle('open');
            });
        }

        // Set active state sesuai POS.selectedCategory
        _syncCategoryUI();
    }

    /** Aktifkan kategori dan perbarui UI */
    function _setActiveCategory(cat) {
        POS.selectedCategory = cat;
        _syncCategoryUI();
        renderProducts();
    }

    /** Sinkronkan tampilan chip / dropdown label dengan POS.selectedCategory */
    function _syncCategoryUI() {
        const chipAll = document.querySelector('#pos-categories .pos-category-chip[data-cat="all"]');
        const chipFav = document.querySelector('#pos-categories .pos-category-chip[data-cat="fav"]');
        const dropBtn = document.getElementById('pos-cat-dropdown-btn');
        const dropLabel = document.getElementById('pos-cat-dropdown-label');
        const dropMenu = document.getElementById('pos-cat-dropdown-menu');
        const cat = POS.selectedCategory;

        // Reset semua
        if (chipAll) chipAll.classList.toggle('active', cat === 'all');
        if (chipFav) chipFav.classList.toggle('active', cat === 'fav');
        if (dropBtn) dropBtn.classList.remove('active');
        if (dropLabel) dropLabel.textContent = 'Kategori';

        // Highlight item dropdown
        if (dropMenu) {
            dropMenu.querySelectorAll('.pos-cat-dropdown-item').forEach(item => {
                const isActive = item.getAttribute('data-cat') === cat;
                item.classList.toggle('active', isActive);
                if (isActive && dropBtn && dropLabel) {
                    dropBtn.classList.add('active');
                    dropLabel.textContent = item.getAttribute('data-cat');
                }
            });
        }
    }

    function renderProducts() {
        const grid = document.getElementById('pos-grid');
        let filtered = POS.products;

        // Filter by category
        if (POS.selectedCategory === 'fav') {
            filtered = filtered.filter(p => p.favorit === true || p.favorit === 'true' || p.favorit === 'TRUE');
        } else if (POS.selectedCategory !== 'all') {
            filtered = filtered.filter(p => p.kategori === POS.selectedCategory);
        }

        if (POS.searchQuery) {
            const q = POS.searchQuery.toLowerCase();
            filtered = filtered.filter(p =>
                (p.nama || '').toLowerCase().includes(q) ||
                (p.sku || '').toLowerCase().includes(q) ||
                (p.barcode || '').toString().toLowerCase().includes(q) ||
                (p.deskripsi || '').toLowerCase().includes(q)
            );
        }

        if (filtered.length === 0) {
            grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;"><h4>Tidak ada produk</h4><p>Coba ubah filter atau tambahkan produk baru.</p></div>';
            return;
        }

        grid.innerHTML = filtered.map(p => {
            const imgSrc = p.foto_base64 || 'https://api.dicebear.com/7.x/shapes/svg?seed=' + encodeURIComponent(p.nama || p.id) + '&backgroundColor=6366F1';
            const stok = parseInt(p.stok) || 0;
            const stokClass = stok <= 0 ? 'text-danger' : (stok <= 5 ? 'text-warning' : 'text-muted');
            const favStar = (p.favorit === true || p.favorit === 'true') ? ' ⭐' : '';
            return `<div class="pos-product-card" data-pid="${p.id}" ${stok <= 0 ? 'style="opacity:0.5;"' : ''}>
                <img class="pos-product-img" src="${imgSrc}" alt="${escapeHtml(p.nama)}" loading="lazy" onerror="this.src='https://api.dicebear.com/7.x/shapes/svg?seed=noimg'">
                <div class="pos-product-details">
                    <div class="pos-product-info">
                        <div class="pos-product-name" title="${escapeHtml(p.nama)}">${escapeHtml(p.nama)}${favStar}</div>
                        <div class="pos-product-stock ${stokClass}">Stok: ${stok}</div>
                    </div>
                    <div class="pos-product-price">${formatCurrency(p.harga)}</div>
                </div>
            </div>`;
        }).join('');

        // Bind click to add to cart
        grid.querySelectorAll('.pos-product-card').forEach(card => {
            card.addEventListener('click', () => {
                const pid = card.getAttribute('data-pid');
                const product = POS.products.find(p => p.id === pid);
                if (product && parseInt(product.stok) > 0) {
                    addToCart(product);
                } else {
                    showToast('Stok produk habis!', 'warning');
                }
            });
        });
    }

    // Search handler
    document.getElementById('pos-search').addEventListener('input', (e) => {
        POS.searchQuery = e.target.value;
        renderProducts();
    });

    // ========================================================================
    // CUSTOMER AUTOCOMPLETE
    // ========================================================================
    async function loadCustomers() {
        try {
            POS.customers = await OfflineService.cachedRead('Pelanggan');
            _renderCustomerList();
        } catch (e) { /* abaikan, pelanggan opsional */ }
    }

    function _renderCustomerList() {
        const datalist = document.getElementById('customer-list');
        if (!datalist || !POS.customers) return;
        datalist.innerHTML = POS.customers.map(c =>
            `<option value="${escapeHtml(c.nama)}">${escapeHtml(c.nama)} — ${escapeHtml(c.telepon || '')}</option>`
        ).join('');
    }

    document.getElementById('pos-customer-input').addEventListener('change', (e) => {
        POS.selectedCustomer = e.target.value;
    });

    // ========================================================================
    // CART MANAGEMENT
    // ========================================================================
    function addToCart(product) {
        const existing = POS.cart.find(item => item.product_id === product.id);
        if (existing) {
            if (existing.qty >= parseInt(product.stok)) {
                showToast('Stok tidak mencukupi!', 'warning');
                return;
            }
            existing.qty++;
        } else {
            POS.cart.push({
                product_id: product.id,
                nama: product.nama,
                harga: parseFloat(product.harga) || 0,
                cost: parseFloat(product.cost) || 0,
                qty: 1,
                stok: parseInt(product.stok) || 0,
                deduct_id: (product.satuan && product.satuan !== 'Pcs' && product.related_product_id) ? product.related_product_id : product.id,
                deduct_qty_multiplier: product.deduct_multiplier || 1
            });
        }
        renderCart();
    }

    function removeFromCart(index) {
        POS.cart.splice(index, 1);
        renderCart();
    }

    function updateCartQty(index, newQty) {
        if (newQty <= 0) {
            removeFromCart(index);
            return;
        }
        const item = POS.cart[index];
        if (newQty > item.stok) {
            showToast('Stok hanya tersisa ' + item.stok + '!', 'warning');
            newQty = item.stok;
        }
        item.qty = newQty;
        renderCart();
    }

    function clearCart() {
        POS.cart = [];
        POS.discount = { type: 'amount', value: 0 };
        renderCart();
    }

    function renderCart() {
        const container = document.getElementById('cart-items');
        const countBadge = document.getElementById('cart-count');
        const btnCheckout = document.getElementById('btn-checkout');

        const totalItems = POS.cart.reduce((sum, i) => sum + i.qty, 0);
        countBadge.textContent = totalItems;

        if (POS.cart.length === 0) {
            container.innerHTML = '<div class="cart-empty"><svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg><p>Keranjang masih kosong.<br>Pilih produk untuk memulai.</p></div>';
            updateCartSummary();
            btnCheckout.disabled = true;
            return;
        }

        container.innerHTML = POS.cart.map((item, i) =>
            `<div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-name" title="${escapeHtml(item.nama)}">${escapeHtml(item.nama)}</div>
                    <div class="cart-item-price">${formatCurrency(item.harga)}</div>
                </div>
                <div class="cart-qty-control">
                    <button class="cart-qty-btn" onclick="window._posUpdateQty(${i}, ${item.qty - 1})">−</button>
                    <input class="cart-qty-input" type="number" value="${item.qty}" min="1" max="${item.stok}" onchange="window._posUpdateQty(${i}, parseInt(this.value)||1)">
                    <button class="cart-qty-btn" onclick="window._posUpdateQty(${i}, ${item.qty + 1})">+</button>
                </div>
                <div class="cart-item-subtotal">${formatCurrency(item.harga * item.qty)}</div>
                <button class="cart-remove" onclick="window._posRemoveItem(${i})" title="Hapus">
                    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>`
        ).join('');

        btnCheckout.disabled = !POS.activeShift;
        updateCartSummary();
    }

    function updateCartSummary() {
        const subtotal = POS.cart.reduce((sum, item) => sum + (item.harga * item.qty), 0);
        let discountAmount = 0;
        if (POS.discount.type === 'percent') {
            discountAmount = subtotal * (POS.discount.value / 100);
        } else {
            discountAmount = POS.discount.value;
        }
        const total = Math.max(0, subtotal - discountAmount);

        document.getElementById('cart-subtotal').textContent = formatCurrency(subtotal);
        document.getElementById('cart-discount').textContent = '- ' + formatCurrency(discountAmount);
        document.getElementById('cart-total').textContent = formatCurrency(total);

        // Update cart badge summary
        const totalItems = POS.cart.reduce((sum, i) => sum + i.qty, 0);
        const countBadge = document.getElementById('cart-count');
        if (countBadge) countBadge.textContent = totalItems;

        // Update mobile cart handle summary
        const mobTotal = document.getElementById('mobile-cart-total');
        if (mobTotal) mobTotal.textContent = formatCurrency(total);
        const mobCount = document.getElementById('mobile-cart-count');
        if (mobCount) mobCount.textContent = totalItems + ' Item';

        // Update checkout button status
        document.getElementById('btn-checkout').disabled = POS.cart.length === 0;
    }

    // Expose cart functions for inline onclick
    window._posUpdateQty = updateCartQty;
    window._posRemoveItem = removeFromCart;

    // Clear cart button
    document.getElementById('btn-clear-cart').addEventListener('click', () => {
        if (POS.cart.length === 0) return;
        Swal.fire({
            title: 'Kosongkan Keranjang?',
            text: 'Semua item akan dihapus.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Ya, Hapus',
            cancelButtonText: 'Batal',
            confirmButtonColor: '#EF4444'
        }).then(r => { if (r.isConfirmed) clearCart(); });
    });

    // Diskon
    document.getElementById('btn-set-discount').addEventListener('click', async () => {
        const { value: formValues } = await Swal.fire({
            title: 'Atur Diskon',
            html: `<div style="text-align:left;">
                <label style="font-size:0.8125rem; font-weight:500;">Jenis Diskon</label>
                <select id="swal-disc-type" class="swal2-input" style="width:100%; margin-bottom:0.75rem;">
                    <option value="amount" ${POS.discount.type === 'amount' ? 'selected' : ''}>Nominal (Rp)</option>
                    <option value="percent" ${POS.discount.type === 'percent' ? 'selected' : ''}>Persen (%)</option>
                </select>
                <label style="font-size:0.8125rem; font-weight:500;">Nilai Diskon</label>
                <input id="swal-disc-value" class="swal2-input" type="number" min="0" value="${POS.discount.value}" placeholder="0" style="width:100%;">
            </div>`,
            showCancelButton: true,
            confirmButtonText: 'Terapkan',
            cancelButtonText: 'Batal',
            confirmButtonColor: '#6366F1',
            preConfirm: () => ({
                type: document.getElementById('swal-disc-type').value,
                value: parseFloat(document.getElementById('swal-disc-value').value) || 0
            })
        });
        if (formValues) {
            POS.discount = formValues;
            updateCartSummary();
            showToast('Diskon diterapkan!', 'success');
        }
    });

    // ========================================================================
    // CHECKOUT
    // ========================================================================
    document.getElementById('btn-checkout').addEventListener('click', async () => {
        if (POS.cart.length === 0) return;
        if (!POS.activeShift) {
            showToast('Buka shift terlebih dahulu!', 'warning');
            return;
        }

        const subtotal = POS.cart.reduce((sum, i) => sum + (i.harga * i.qty), 0);
        let discountAmount = POS.discount.type === 'percent' ? subtotal * (POS.discount.value / 100) : POS.discount.value;
        const total = Math.max(0, subtotal - discountAmount);

        const { value: metode } = await Swal.fire({
            title: 'Metode Pembayaran',
            html: `<p style="font-size:1.25rem; font-weight:700; color:var(--primary); margin-bottom:1rem;">Total: ${formatCurrency(total)}</p>`,
            input: 'select',
            inputOptions: { 'TUNAI': '💵 Tunai', 'TRANSFER': '🏦 Transfer', 'QRIS': '📱 QRIS', 'HUTANG': '📋 Hutang' },
            inputValue: 'TUNAI',
            showCancelButton: true,
            confirmButtonText: 'Lanjutkan',
            cancelButtonText: 'Batal',
            confirmButtonColor: '#6366F1',
            inputValidator: (val) => { if (!val) return 'Pilih metode pembayaran!'; }
        });

        if (!metode) return;

        let bayar = total;
        let kembalian = 0;
        let jatuhTempo = '';

        if (metode === 'TUNAI') {
            let pecahan = [];
            try { pecahan = JSON.parse(POS.tokoSettings.pecahan_uang_json || '[]'); } catch (e) { }
            if (pecahan.length === 0) {
                pecahan = [{ label: 'Uang Pas', val: 'auto' }, { label: '10 Ribu', val: 10000 }, { label: '20 Ribu', val: 20000 }, { label: '50 Ribu', val: 50000 }, { label: '100 Ribu', val: 100000 }];
            }

            let btnHtml = pecahan.map(p => {
                const isAuto = p.val === 'auto';
                const style = isAuto ? 'background:var(--bg-surface-alt); border:1px solid var(--border-color); color:var(--text-color);' : 'background:var(--primary-light); color:var(--primary); font-weight:600; border:none;';
                const pVal = isAuto ? 'auto' : p.val;
                return `<button type="button" class="btn swal-pecahan-btn" data-val="${pVal}" style="padding:0.5rem; font-size:0.875rem; border-radius:0.5rem; cursor:pointer; ${style}">${escapeHtml(p.label)}</button>`;
            }).join('');

            const { value: inputBayar } = await Swal.fire({
                title: 'Pembayaran Tunai',
                html: `
                    <p style="margin-bottom:1rem; font-size:1.1rem; color:var(--text-muted);">Total Tagihan: <b style="color:var(--text-color);">${formatCurrency(total)}</b></p>
                    <div style="text-align:left; margin-bottom:0.5rem;"><small style="font-weight:600; color:var(--text-muted);">Jumlah Bayar (Rp)</small></div>
                    <input type="number" id="swal-bayar-input" class="swal2-input" value="${total}" style="margin:0; width:100%; font-size:1.25rem; font-weight:bold; height:3.5rem;">
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(80px, 1fr)); gap:0.5rem; margin-top:1rem;">
                        ${btnHtml}
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: 'Proses',
                confirmButtonColor: '#10B981',
                didOpen: () => {
                    const inp = document.getElementById('swal-bayar-input');
                    let isFirstClick = true;
                    document.querySelectorAll('.swal-pecahan-btn').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            let clickVal = e.target.getAttribute('data-val');
                            if (clickVal === 'auto') {
                                inp.value = total;
                                isFirstClick = true;
                            } else {
                                clickVal = parseFloat(clickVal);
                                if (isFirstClick) {
                                    inp.value = clickVal;
                                    isFirstClick = false;
                                } else {
                                    inp.value = (parseFloat(inp.value) || 0) + clickVal;
                                }
                            }
                        });
                    });
                    inp.addEventListener('input', () => { isFirstClick = false; });
                },
                preConfirm: () => {
                    const val = parseFloat(document.getElementById('swal-bayar-input').value);
                    if (!val || val < total) {
                        Swal.showValidationMessage('Jumlah bayar kurang dari total!');
                        return false;
                    }
                    return val;
                }
            });
            if (inputBayar === undefined) return;
            bayar = parseFloat(inputBayar);
            kembalian = bayar - total;
        }

        if (metode === 'HUTANG') {
            if (!POS.selectedCustomer) {
                showToast('Pilih pelanggan terlebih dahulu untuk metode Hutang!', 'warning');
                return;
            }
            const { value: tempo } = await Swal.fire({
                title: 'Jatuh Tempo',
                input: 'date',
                inputLabel: 'Tanggal Jatuh Tempo',
                showCancelButton: true,
                confirmButtonText: 'Proses',
                confirmButtonColor: '#6366F1'
            });
            if (tempo === undefined) return;
            jatuhTempo = tempo;
            bayar = 0;

            // Autocreate new customer if they do not exist
            const customerName = POS.selectedCustomer.trim();
            const customerExists = POS.customers && POS.customers.find(c => (c.nama || '').toLowerCase() === customerName.toLowerCase());

            if (!customerExists) {
                try {
                    const nid = await db.request('getNextId', { prefix: 'CST_' });
                    const newData = {
                        id: nid.id,
                        nama: customerName,
                        telepon: '',
                        alamat: ''
                    };
                    await db.request('insertRow', {
                        tableName: 'Pelanggan',
                        data: newData
                    });
                    if (!POS.customers) POS.customers = [];
                    POS.customers.push(newData);
                } catch (e) {
                    console.warn('[POS] Gagal membuat pelanggan otomatis:', e);
                }
            }
        }

        // Proses transaksi
        showLoading('Memproses transaksi...');
        try {
            const items = POS.cart.map(i => ({
                product_id: i.product_id,
                nama_produk: i.nama,
                qty: i.qty,
                price: i.harga,
                deduct_id: i.deduct_id,
                deduct_qty_multiplier: i.deduct_qty_multiplier
            }));

            const transactionPayload = {
                transaction: {
                    kasir: App.currentUser.username,
                    pelanggan: POS.selectedCustomer || 'Umum',
                    subtotal: subtotal,
                    diskon: discountAmount,
                    pajak: 0,
                    total: total,
                    metode: metode,
                    bayar: bayar,
                    kembalian: kembalian,
                    note: ''
                },
                items: items,
                shiftId: POS.activeShift ? POS.activeShift.id : '',
                jatuhTempo: jatuhTempo
            };

            // --- OPTIMISTIC WRITE ---
            // Simpan ke queue + update cache lokal, lalu UI langsung merespon
            const cartItemsCopy = [...POS.cart];
            await OfflineService.optimisticWrite('createTransaction', transactionPayload, {
                localUpdate: async (cache) => {
                    // Kurangi stok lokal secara optimistik
                    const products = (await cache.getItem('Produk')) || [];
                    cartItemsCopy.forEach(cartItem => {
                        const targetId = cartItem.deduct_id || cartItem.product_id;
                        const deductQty = (cartItem.deduct_qty_multiplier || 1) * cartItem.qty;
                        const prod = products.find(p => p.id === targetId);
                        if (prod) {
                            prod.stok = Math.max(0, (parseInt(prod.stok) || 0) - deductQty);
                        }
                    });
                    await cache.setItem('Produk', products);
                }
            });

            hideLoading();

            // Tampilkan kembalian (jika tunai)
            let successMsg = 'Transaksi berhasil!';
            if (metode === 'TUNAI' && kembalian > 0) {
                successMsg = `Transaksi berhasil!<br><span style="font-size:1.5rem; font-weight:700; color:var(--success);">Kembalian: ${formatCurrency(kembalian)}</span>`;
            }

            const receiptConfirm = await Swal.fire({
                title: '✅ Berhasil',
                html: `<p>${successMsg}</p><p style="font-size:0.8125rem; color:var(--text-muted);">Transaksi sedang disinkronkan...</p>`,
                icon: 'success',
                showCancelButton: true,
                confirmButtonText: '🖨️ Cetak Struk',
                cancelButtonText: 'Selesai',
                confirmButtonColor: '#6366F1'
            });

            if (receiptConfirm.isConfirmed) {
                printReceipt('PENDING', items, {
                    subtotal, discountAmount, total, metode, bayar, kembalian,
                    pelanggan: POS.selectedCustomer || 'Umum',
                    kasir: App.currentUser.nama_lengkap || App.currentUser.username
                });
            }

            // Reset cart & reload produk dari cache (stok sudah berkurang)
            clearCart();
            POS.selectedCustomer = '';
            document.getElementById('pos-customer-input').value = '';
            await loadProducts(); // Refresh dari cache yang sudah di-update

        } catch (e) {
            hideLoading();
            showToast(e.message, 'error');
        }
    });

    // ========================================================================
    // PRINT RECEIPT
    // ========================================================================
    function printReceipt(trxId, items, summary) {
        const printWindow = window.open('', '_blank', 'width=350,height=600');
        if (!printWindow) {
            showToast('Pop-up diblokir! Izinkan pop-up untuk cetak struk.', 'warning');
            return;
        }

        const now = formatDateTime(new Date().toISOString());
        const itemsHtml = items.map(i =>
            `<tr><td style="text-align:left;">${escapeHtml(i.nama_produk)}</td><td style="text-align:center;">${i.qty}</td><td style="text-align:right;">${formatCurrency(i.price * i.qty)}</td></tr>`
        ).join('');

        printWindow.document.write(`<!DOCTYPE html>
<html><head><title>Struk ${trxId}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Courier New',monospace; font-size:12px; padding:8px; width:280px; max-width:280px; color:#000; }
.center { text-align:center; }
.divider { border-top:1px dashed #000; margin:6px 0; }
table { width:100%; border-collapse:collapse; }
td { padding:2px 0; font-size:11px; vertical-align:top; }
.total-row { font-weight:bold; font-size:13px; }
.footer { margin-top:10px; text-align:center; font-size:10px; color:#666; }
</style></head>
<body>
<div class="center"><strong style="font-size:16px;">CANDOKIO</strong><br><span style="font-size:10px;">Struk Penjualan</span></div>
<div class="divider"></div>
<div style="font-size:11px;">
No: ${trxId}<br>
Tgl: ${now}<br>
Kasir: ${escapeHtml(summary.kasir)}<br>
Pelanggan: ${escapeHtml(summary.pelanggan)}<br>
</div>
<div class="divider"></div>
<table><thead><tr><td><b>Item</b></td><td style="text-align:center;"><b>Qty</b></td><td style="text-align:right;"><b>Total</b></td></tr></thead>
<tbody>${itemsHtml}</tbody></table>
<div class="divider"></div>
<table>
<tr><td>Subtotal</td><td style="text-align:right;">${formatCurrency(summary.subtotal)}</td></tr>
<tr><td>Diskon</td><td style="text-align:right;">- ${formatCurrency(summary.discountAmount)}</td></tr>
<tr class="total-row"><td>TOTAL</td><td style="text-align:right;">${formatCurrency(summary.total)}</td></tr>
<tr><td>Bayar (${summary.metode})</td><td style="text-align:right;">${formatCurrency(summary.bayar)}</td></tr>
${summary.kembalian > 0 ? `<tr class="total-row"><td>Kembalian</td><td style="text-align:right;">${formatCurrency(summary.kembalian)}</td></tr>` : ''}
</table>
<div class="divider"></div>
<div class="footer">Terima kasih atas kunjungan Anda!<br>— CANDOKIO POS —</div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`);
        printWindow.document.close();
    }

    // ========================================================================
    // BARCODE SCANNER
    // ========================================================================
    document.getElementById('btn-scan-barcode').addEventListener('click', () => {
        document.getElementById('scanner-modal').classList.add('active');
        startScanner();
    });

    // Event listener for view toggle (Grid / List)
    const btnViewToggle = document.getElementById('btn-view-toggle');
    if (btnViewToggle) {
        btnViewToggle.addEventListener('click', () => {
            const grid = document.getElementById('pos-grid');
            grid.classList.toggle('list-view');
            const isList = grid.classList.contains('list-view');
            document.getElementById('icon-grid').style.display = isList ? 'block' : 'none';
            document.getElementById('icon-list').style.display = isList ? 'none' : 'block';
        });
    }

    // Event listener for mobile cart handle
    const cartHandle = document.getElementById('pos-cart-handle');
    if (cartHandle) {
        cartHandle.addEventListener('click', () => {
            document.getElementById('pos-cart-panel').classList.toggle('expanded');
        });
    }

    document.getElementById('btn-close-scanner').addEventListener('click', () => {
        stopScanner();
        document.getElementById('scanner-modal').classList.remove('active');
    });

    async function startScanner() {
        const scannerDiv = document.getElementById('scanner-view');
        scannerDiv.innerHTML = '';

        // Cek apakah html5-qrcode tersedia
        if (typeof Html5Qrcode === 'undefined') {
            // Lazy load html5-qrcode
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
            script.onload = () => initScanner();
            script.onerror = () => {
                scannerDiv.innerHTML = '<p class="text-center text-muted" style="padding:2rem;">Gagal memuat scanner library</p>';
            };
            document.head.appendChild(script);
        } else {
            initScanner();
        }
    }

    function initScanner() {
        try {
            POS.scannerInstance = new Html5Qrcode('scanner-view');
            POS.scannerInstance.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 250, height: 150 } },
                (decodedText) => {
                    // Cari produk berdasarkan barcode
                    const product = POS.products.find(p => p.barcode && p.barcode.toString() === decodedText);
                    if (product) {
                        addToCart(product);
                        showToast('Produk ditambahkan: ' + product.nama, 'success');
                    } else {
                        showToast('Barcode tidak ditemukan: ' + decodedText, 'warning');
                    }
                    // Stop scanner setelah scan berhasil
                    stopScanner();
                    document.getElementById('scanner-modal').classList.remove('active');
                },
                () => { } // Error callback (per frame; diabaikan)
            ).catch(err => {
                document.getElementById('scanner-view').innerHTML =
                    '<p class="text-center text-danger" style="padding:2rem;">Gagal mengakses kamera: ' + err + '</p>';
            });
        } catch (e) {
            document.getElementById('scanner-view').innerHTML =
                '<p class="text-center text-muted" style="padding:2rem;">Scanner tidak tersedia</p>';
        }
    }

    function stopScanner() {
        if (POS.scannerInstance) {
            POS.scannerInstance.stop().catch(() => { });
            POS.scannerInstance.clear();
            POS.scannerInstance = null;
        }
    }

    // ========================================================================
    // CLEANUP
    // ========================================================================
    window._viewCleanup = function () {
        stopScanner();
        POS.cart = [];
        POS.products = [];
        window._posUpdateQty = null;
        window._posRemoveItem = null;
        window.removeEventListener('data-updated', _onDataUpdated);
    };

    // ========================================================================
    // CLOSE DROPDOWN ON OUTSIDE CLICK
    // ========================================================================
    document.addEventListener('click', (e) => {
        const dropWrap = document.getElementById('pos-cat-dropdown-wrap');
        const dropMenu = document.getElementById('pos-cat-dropdown-menu');
        if (dropWrap && !dropWrap.contains(e.target)) {
            const btn = document.getElementById('pos-cat-dropdown-btn');
            if (dropMenu) dropMenu.classList.remove('open');
            if (btn) btn.classList.remove('open');
        }
    });

    // ========================================================================
    // INIT
    // ========================================================================
    initPOS();

})();
