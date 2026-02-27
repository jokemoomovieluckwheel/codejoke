const STORAGE_KEY = 'wheel_codes';
        const TRASH_KEY = 'wheel_codes_trash';
        const DEFAULT_EXPIRY_DAYS = 7;
        const TRASH_EXPIRY_MS = 24 * 60 * 60 * 1000; // 1 วัน แล้วลบถาวร
        let selectedCodes = new Set();
        var codesCache = [];
        var trashCache = [];
        var lastApiLoadTime = 0;
        var API_CACHE_MS = 400;

        function apiBase() {
            return (typeof window.WHEEL_API_BASE === 'string' && window.WHEEL_API_BASE.trim()) ? window.WHEEL_API_BASE.trim() : '';
        }
        function apiGet(params) {
            var q = Object.keys(params).map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
            return fetch(apiBase() + '?' + q).then(function(r) { return r.json(); });
        }
        function setListLoading(loading) {
            var el = document.getElementById('codeList');
            if (!el) return;
            if (loading) {
                el.setAttribute('data-loading', '1');
                el.innerHTML = '<div class="empty-state loading-state"><div class="icon">⏳</div><p>กำลังโหลด...</p></div>';
            } else {
                el.removeAttribute('data-loading');
            }
        }
        function loadFromApi(force) {
            if (!apiBase()) return Promise.resolve();
            if (!force && (Date.now() - lastApiLoadTime) < API_CACHE_MS) {
                renderCodeList();
                renderTrashList();
                updateStats();
                return Promise.resolve();
            }
            setListLoading(true);
            return apiGet({ action: 'list' }).then(function(res) {
                codesCache = res.codes || [];
                trashCache = res.trash || [];
                lastApiLoadTime = Date.now();
                setListLoading(false);
                renderCodeList();
                renderTrashList();
                updateStats();
            }).catch(function() {
                codesCache = [];
                trashCache = [];
                setListLoading(false);
                renderCodeList();
                renderTrashList();
                updateStats();
            });
        }

        function showConfirm(message, title = 'ยืนยันการดำเนินการ', icon = '⚠️', isDanger = true) {
            return new Promise((resolve) => {
                const modal = document.getElementById('confirmModal');
                const titleEl = document.getElementById('confirmTitle');
                const messageEl = document.getElementById('confirmMessage');
                const iconEl = document.getElementById('confirmIcon');
                const okBtn = document.getElementById('confirmOk');
                const cancelBtn = document.getElementById('confirmCancel');

                titleEl.textContent = title;
                messageEl.textContent = message;
                iconEl.textContent = icon;
                
                if (isDanger) {
                    okBtn.classList.remove('primary');
                } else {
                    okBtn.classList.add('primary');
                }

                modal.classList.add('show');

                const handleOk = () => {
                    modal.classList.remove('show');
                    cleanup();
                    resolve(true);
                };

                const handleCancel = () => {
                    modal.classList.remove('show');
                    cleanup();
                    resolve(false);
                };

                const handleBackdrop = (e) => {
                    if (e.target === modal) {
                        handleCancel();
                    }
                };

                const cleanup = () => {
                    okBtn.removeEventListener('click', handleOk);
                    cancelBtn.removeEventListener('click', handleCancel);
                    modal.removeEventListener('click', handleBackdrop);
                };

                okBtn.addEventListener('click', handleOk);
                cancelBtn.addEventListener('click', handleCancel);
                modal.addEventListener('click', handleBackdrop);
            });
        }

        function getCodes() {
            if (apiBase()) return codesCache;
            var data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        }

        function saveCodes(codes) {
            if (apiBase()) { codesCache = codes; return; }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
        }

        function getTrash() {
            if (apiBase()) return trashCache;
            var data = localStorage.getItem(TRASH_KEY);
            return data ? JSON.parse(data) : [];
        }

        function saveTrash(trash) {
            if (apiBase()) { trashCache = trash; return; }
            localStorage.setItem(TRASH_KEY, JSON.stringify(trash));
        }

        function purgeExpiredTrash() {
            if (apiBase()) return 0;
            var trash = getTrash();
            var now = new Date().getTime();
            var stillValid = trash.filter(function(item) {
                var movedAt = item.movedToTrashAt ? new Date(item.movedToTrashAt).getTime() : 0;
                return (now - movedAt) < TRASH_EXPIRY_MS;
            });
            if (stillValid.length !== trash.length) {
                saveTrash(stillValid);
                return trash.length - stillValid.length;
            }
            return 0;
        }

        function getTrashTimeLeft(movedToTrashAt) {
            if (!movedToTrashAt) return { ms: 0, text: '', class: 'expired' };
            const now = new Date().getTime();
            const movedAt = new Date(movedToTrashAt).getTime();
            const expiresAt = movedAt + TRASH_EXPIRY_MS;
            let ms = expiresAt - now;
            if (ms <= 0) return { ms: 0, text: 'ลบถาวรแล้ว', class: 'expired' };
            const seconds = Math.floor((ms / 1000) % 60);
            const minutes = Math.floor((ms / (1000 * 60)) % 60);
            const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
            const days = Math.floor(ms / (1000 * 60 * 60 * 24));
            const parts = [];
            if (days > 0) parts.push(days + ' วัน');
            parts.push(hours + ' ชม.');
            parts.push(minutes + ' นาที');
            parts.push(seconds + ' วินาที');
            const text = 'ลบถาวรใน ' + parts.join(' ');
            const class_ = ms < 60 * 60 * 1000 ? 'soon' : '';
            return { ms, text, class: class_ };
        }

        function moveExpiredToTrash() {
            if (apiBase()) return 0;
            var codes = getCodes();
            var now = new Date().getTime();
            var stillValid = [];
            var trash = getTrash();
            var moved = 0;
            codes.forEach(function(c) {
                var expiresAt = c.expiresAt ? new Date(c.expiresAt).getTime() : null;
                if (expiresAt && expiresAt < now) {
                    trash.push({
                        code: c.code,
                        spins: c.spins,
                        maxSpins: c.maxSpins,
                        history: c.history || [],
                        createdAt: c.createdAt,
                        expiresAt: c.expiresAt,
                        movedToTrashAt: new Date().toISOString(),
                        restoredOnce: c.restoredOnce || false
                    });
                    moved++;
                } else {
                    stillValid.push(c);
                }
            });
            if (moved > 0) {
                saveCodes(stillValid);
                saveTrash(trash);
            }
            return moved;
        }

        function restoreFromTrash(code) {
            if (apiBase()) {
                var trash = getTrash();
                var item = trash.find(function(t) { return t.code === code; });
                apiGet({ action: 'restore', code: code }).then(function(res) {
                    if (res.ok && item) {
                        trashCache = trashCache.filter(function(t) { return t.code !== code; });
                        var exp = new Date();
                        exp.setDate(exp.getDate() + 7);
                        codesCache.push({
                            code: item.code,
                            spins: item.spins,
                            maxSpins: item.maxSpins,
                            history: item.history || [],
                            createdAt: item.createdAt,
                            expiresAt: exp.toISOString(),
                            restoredOnce: true
                        });
                        renderCodeList();
                        renderTrashList();
                        updateStats();
                        showToast('✅ กู้คืนโค้ด ' + code + ' แล้ว');
                    } else if (!res.ok) {
                        showToast(res.error === 'already_restored' ? 'โค้ดนี้กู้คืนได้เพียง 1 ครั้ง' : 'กู้คืนไม่สำเร็จ', 'error');
                    }
                }).catch(function() { showToast('เชื่อมต่อ API ไม่ได้', 'error'); });
                return;
            }
            var trash = getTrash();
            var item = trash.find(function(t) { return t.code === code; });
            if (!item) return;
            if (item.restoredOnce) {
                showToast('โค้ดนี้กู้คืนได้เพียง 1 ครั้ง', 'error');
                return;
            }
            var codes = getCodes();
            var expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + DEFAULT_EXPIRY_DAYS);
            codes.push({
                code: item.code,
                spins: item.spins,
                maxSpins: item.maxSpins,
                history: item.history || [],
                createdAt: item.createdAt,
                expiresAt: expiresAt.toISOString(),
                restoredOnce: true,
                firstUsedAt: item.firstUsedAt || null,
                lastUsedAt: item.lastUsedAt || null
            });
            saveCodes(codes);
            saveTrash(trash.filter(function(t) { return t.code !== code; }));
            renderCodeList();
            renderTrashList();
            updateStats();
            showToast('✅ กู้คืนโค้ด ' + code + ' แล้ว');
        }

        function deleteFromTrash(code) {
            if (apiBase()) {
                apiGet({ action: 'deletetrash', code: code }).then(function() {
                    trashCache = trashCache.filter(function(t) { return t.code !== code; });
                    renderTrashList();
                    showToast('🗑️ ลบออกจากถังขยะแล้ว');
                }).catch(function() { showToast('เชื่อมต่อ API ไม่ได้', 'error'); });
                return;
            }
            var trash = getTrash().filter(function(t) { return t.code !== code; });
            saveTrash(trash);
            renderTrashList();
            showToast('🗑️ ลบออกจากถังขยะแล้ว');
        }

        function generateRandomCode(length) {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let code = '';
            for (let i = 0; i < length; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return code;
        }

        function generateCodes() {
            var length = parseInt(document.getElementById('codeLength').value, 10);
            var spins = parseInt(document.getElementById('spinCount').value, 10);
            var count = parseInt(document.getElementById('codeCount').value, 10);
            var expiryDays = parseInt(document.getElementById('expiryDays').value, 10) || DEFAULT_EXPIRY_DAYS;

            if (spins < 1 || count < 1) {
                showToast('กรุณากรอกข้อมูลให้ถูกต้อง', 'error');
                return;
            }

            if (apiBase()) {
                apiGet({ action: 'create', spins: spins, count: count, length: length, expiryDays: expiryDays }).then(function(res) {
                    var created = res.created || [];
                    if (created.length > 0) {
                        created.forEach(function(c) { codesCache.push(c); });
                        renderCodeList();
                        updateStats();
                        var textToCopy = created.map(function(c) { return c.code; }).join('\n');
                        navigator.clipboard.writeText(textToCopy).then(function() {
                            showToast(created.length === 1
                                ? '✅ สร้างโค้ดสำเร็จ และคัดลอกแล้ว: ' + created[0].code
                                : '✅ สร้างโค้ดสำเร็จ ' + created.length + ' รายการ และคัดลอกแล้ว');
                        }).catch(function() {
                            showToast('✅ สร้างโค้ดสำเร็จ ' + created.length + ' รายการ');
                        });
                    } else {
                        showToast('ไม่สามารถสร้างโค้ดใหม่ได้ (อาจซ้ำกับที่มีอยู่)', 'error');
                    }
                }).catch(function() { showToast('เชื่อมต่อ API ไม่ได้: เปิดจาก https:// และใน Apps Script ตั้ง Deploy = Anyone', 'error'); });
                return;
            }

            var codes = getCodes();
            var existingCodes = {};
            codes.forEach(function(c) { existingCodes[c.code] = true; });
            var newCodes = [];

            for (var i = 0; i < count; i++) {
                var newCode;
                var attempts = 0;
                do {
                    newCode = generateRandomCode(length);
                    attempts++;
                } while (existingCodes[newCode] && attempts < 100);

                if (!existingCodes[newCode]) {
                    var expiresAt = new Date();
                    expiresAt.setDate(expiresAt.getDate() + Math.max(1, Math.min(365, expiryDays)));
                    
                    // สร้างข้อมูล history ตัวอย่างสำหรับวงล้อ
                    var sampleHistory = [];
                    var prizes = ['🎁 โทรศัพท์', '🎮 เกมคอนโซล', '🎧 หูฟัง', '💎 สร้อย', '🏆 รางวัลที่ 1', 'Miss'];
                    
                    // สร้าง 2-3 รายการสุ่ม
                    var historyCount = Math.floor(Math.random() * 3) + 0;
                    for (var j = 0; j < historyCount; j++) {
                        var prize = prizes[Math.floor(Math.random() * prizes.length)];
                        var now = new Date();
                        now.setHours(now.getHours() - Math.floor(Math.random() * 24));
                        sampleHistory.push({
                            prize: prize,
                            date: now.toISOString(),
                            time: now.toISOString(),
                            result: { prize: prize }
                        });
                    }
                    
                    codes.push({
                        code: newCode,
                        spins: spins,
                        maxSpins: spins,
                        history: sampleHistory,
                        createdAt: new Date().toISOString(),
                        expiresAt: expiresAt.toISOString(),
                        restoredOnce: false,
                        firstUsedAt: null,
                        lastUsedAt: null
                    });
                    existingCodes[newCode] = true;
                    newCodes.push(newCode);
                }
            }

            saveCodes(codes);
            renderCodeList();
            updateStats();

            if (newCodes.length > 0) {
                var textToCopy = newCodes.join('\n');
                navigator.clipboard.writeText(textToCopy).then(function() {
                    showToast(newCodes.length === 1
                        ? '✅ สร้างโค้ดสำเร็จ และคัดลอกแล้ว: ' + newCodes[0]
                        : '✅ สร้างโค้ดสำเร็จ ' + newCodes.length + ' รายการ และคัดลอกแล้ว');
                }).catch(function() {
                    showToast('✅ สร้างโค้ดสำเร็จ ' + newCodes.length + ' รายการ');
                });
            } else {
                showToast('ไม่สามารถสร้างโค้ดใหม่ได้ (อาจซ้ำกับที่มีอยู่)', 'error');
            }
        }

        function deleteCode(code) {
            showConfirm(
                'ต้องการลบโค้ด ' + code + ' หรือไม่? โค้ดจะย้ายไปถังขยะและกู้คืนได้ 1 ครั้ง',
                'ยืนยันการลบ',
                '🗑️'
            ).then(function(confirmed) {
                if (!confirmed) return;
                if (apiBase()) {
                    var codes = getCodes();
                    var item = codes.find(function(c) { return c.code === code; });
                    apiGet({ action: 'delete', code: code }).then(function(res) {
                        if (res.ok && item) {
                            selectedCodes.delete(code);
                            codesCache = codesCache.filter(function(c) { return c.code !== code; });
                            item.movedToTrashAt = new Date().toISOString();
                            item.restoredOnce = item.restoredOnce || false;
                            trashCache.push(item);
                            renderCodeList();
                            renderTrashList();
                            updateStats();
                            showToast('🗑️ ย้ายโค้ดไปถังขยะแล้ว');
                        } else if (!res.ok) {
                            showToast('ลบไม่สำเร็จ', 'error');
                        }
                    }).catch(function() { showToast('เชื่อมต่อ API ไม่ได้', 'error'); });
                    return;
                }
                var codes = getCodes();
                var item = codes.find(function(c) { return c.code === code; });
                if (item) {
                    var trash = getTrash();
                    trash.push({
                        code: item.code,
                        spins: item.spins,
                        maxSpins: item.maxSpins,
                        history: item.history || [],
                        createdAt: item.createdAt,
                        expiresAt: item.expiresAt,
                        movedToTrashAt: new Date().toISOString(),
                        restoredOnce: item.restoredOnce || false,
                        firstUsedAt: item.firstUsedAt || null,
                        lastUsedAt: item.lastUsedAt || null
                    });
                    saveTrash(trash);
                    saveCodes(codes.filter(function(c) { return c.code !== code; }));
                }
                selectedCodes.delete(code);
                renderCodeList();
                renderTrashList();
                updateStats();
                showToast('🗑️ ย้ายโค้ดไปถังขยะแล้ว');
            });
        }

        function deleteAllCodes() {
            var codes = getCodes();
            if (codes.length === 0) {
                showToast('ไม่มีโค้ดให้ลบ', 'error');
                return;
            }
            showConfirm(
                'ต้องการลบโค้ดทั้งหมด ' + codes.length + ' รายการหรือไม่? โค้ดจะย้ายไปถังขยะ',
                'ลบโค้ดทั้งหมด',
                '⚠️'
            ).then(function(confirmed) {
                if (!confirmed) return;
                if (apiBase()) {
                    var tr = getTrash();
                    codes.forEach(function(c) {
                        tr.push({
                            code: c.code,
                            spins: c.spins,
                            maxSpins: c.maxSpins,
                            history: c.history || [],
                            createdAt: c.createdAt,
                            expiresAt: c.expiresAt,
                            movedToTrashAt: new Date().toISOString(),
                            restoredOnce: c.restoredOnce || false,
                            firstUsedAt: c.firstUsedAt || null,
                            lastUsedAt: c.lastUsedAt || null
                        });
                    });
                    codesCache = [];
                    trashCache = tr;
                    selectedCodes.clear();
                    renderCodeList();
                    renderTrashList();
                    updateStats();
                    showToast('🗑️ ย้ายโค้ดทั้งหมดไปถังขยะแล้ว');
                    codes.forEach(function(c) {
                        apiGet({ action: 'delete', code: c.code }).catch(function() {});
                    });
                    return;
                }
                var trash = getTrash();
                codes.forEach(function(c) {
                    trash.push({
                        code: c.code,
                        spins: c.spins,
                        maxSpins: c.maxSpins,
                        history: c.history || [],
                        createdAt: c.createdAt,
                        expiresAt: c.expiresAt,
                        movedToTrashAt: new Date().toISOString(),
                        restoredOnce: c.restoredOnce || false,
                        firstUsedAt: c.firstUsedAt || null,
                        lastUsedAt: c.lastUsedAt || null
                    });
                });
                saveTrash(trash);
                saveCodes([]);
                selectedCodes.clear();
                renderCodeList();
                renderTrashList();
                updateStats();
                showToast('🗑️ ย้ายโค้ดทั้งหมดไปถังขยะแล้ว');
            });
        }

        function deleteSelectedCodes() {
            if (selectedCodes.size === 0) {
                showToast('กรุณาเลือกโค้ดที่ต้องการลบ', 'error');
                return;
            }
            var toDelete = Array.from(selectedCodes);
            showConfirm(
                'ต้องการลบโค้ดที่เลือก ' + toDelete.length + ' รายการหรือไม่? โค้ดจะย้ายไปถังขยะ',
                'ลบโค้ดที่เลือก',
                '🗑️'
            ).then(function(confirmed) {
                if (!confirmed) return;
                if (apiBase()) {
                    var codes = getCodes();
                    var tr = getTrash();
                    var toMove = codes.filter(function(c) { return selectedCodes.has(c.code); });
                    toMove.forEach(function(c) {
                        tr.push({
                            code: c.code,
                            spins: c.spins,
                            maxSpins: c.maxSpins,
                            history: c.history || [],
                            createdAt: c.createdAt,
                            expiresAt: c.expiresAt,
                            movedToTrashAt: new Date().toISOString(),
                            restoredOnce: c.restoredOnce || false,
                            firstUsedAt: c.firstUsedAt || null,
                            lastUsedAt: c.lastUsedAt || null
                        });
                    });
                    codesCache = codes.filter(function(c) { return !selectedCodes.has(c.code); });
                    trashCache = tr;
                    selectedCodes.clear();
                    renderCodeList();
                    renderTrashList();
                    updateStats();
                    showToast('🗑️ ย้ายโค้ดที่เลือกไปถังขยะแล้ว');
                    toMove.forEach(function(c) {
                        apiGet({ action: 'delete', code: c.code }).catch(function() {});
                    });
                    return;
                }
                var codes = getCodes();
                var trash = getTrash();
                codes.forEach(function(c) {
                    if (selectedCodes.has(c.code)) {
                        trash.push({
                            code: c.code,
                            spins: c.spins,
                            maxSpins: c.maxSpins,
                            history: c.history || [],
                            createdAt: c.createdAt,
                            expiresAt: c.expiresAt,
                            movedToTrashAt: new Date().toISOString(),
                            restoredOnce: c.restoredOnce || false,
                            firstUsedAt: c.firstUsedAt || null,
                            lastUsedAt: c.lastUsedAt || null
                        });
                    }
                });
                codes = codes.filter(function(c) { return !selectedCodes.has(c.code); });
                saveTrash(trash);
                saveCodes(codes);
                selectedCodes.clear();
                renderCodeList();
                renderTrashList();
                updateStats();
                showToast('🗑️ ย้ายโค้ดที่เลือกไปถังขยะแล้ว');
            });
        }

        function toggleCodeSelection(code, checkbox) {
            if (checkbox.checked) {
                selectedCodes.add(code);
            } else {
                selectedCodes.delete(code);
            }
            updateSelectedUI();
        }

        function toggleSelectAll() {
            const selectAllCheckbox = document.getElementById('selectAll');
            const codes = getCodes();
            
            if (selectAllCheckbox.checked) {
                codes.forEach(c => selectedCodes.add(c.code));
            } else {
                selectedCodes.clear();
            }
            
            document.querySelectorAll('.code-checkbox-item').forEach(cb => {
                cb.checked = selectAllCheckbox.checked;
            });
            
            updateSelectedUI();
        }

        function updateSelectedUI() {
            const count = selectedCodes.size;
            document.getElementById('selectedCount').textContent = count;
            const btn = document.getElementById('btnDeleteSelected');
            if (count > 0) {
                btn.classList.add('show');
            } else {
                btn.classList.remove('show');
            }
            
            document.querySelectorAll('.code-card').forEach(card => {
                const code = card.dataset.code;
                if (selectedCodes.has(code)) {
                    card.classList.add('selected');
                } else {
                    card.classList.remove('selected');
                }
            });
        }

        function copyCode(code) {
            navigator.clipboard.writeText(code).then(() => {
                showToast('📋 คัดลอกโค้ดแล้ว: ' + code);
            });
        }

        function viewHistory(code) {
            const codes = getCodes();
            const codeData = codes.find(c => c.code === code);
            if (!codeData) return;

            document.getElementById('modalCode').textContent = codeData.code;
            document.getElementById('modalSpinsUsed').textContent = codeData.maxSpins - codeData.spins;
            document.getElementById('modalSpinsLeft').textContent = codeData.spins;
            document.getElementById('modalCreated').textContent = formatDateTime(codeData.createdAt);

            // แสดงสถานะการใช้งาน: ถ้ายังไม่ถูกใช้ => '-' , ถ้าใช้แล้วให้แสดงวันที่/เวลา
            const lastUsedElement = document.getElementById('modalLastUsed');
            const spinsUsed = codeData.maxSpins - codeData.spins;
            // if history entries exist, use the last one as lastUsed time
            let derivedLast = codeData.lastUsedAt;
            if (!derivedLast && spinsUsed > 0 && Array.isArray(codeData.history) && codeData.history.length > 0) {
                const lastHist = codeData.history[codeData.history.length - 1];
                derivedLast = lastHist.time || lastHist.date || null;
            }
            if (derivedLast) {
                lastUsedElement.textContent = formatDateTime(derivedLast);
            } else {
                lastUsedElement.textContent = 'ยังไม่ใช้';
            }

            // แสดงวันหมดอายุ (วันที่/เวลา) และ countdown
            const expiresEl = document.getElementById('modalExpires');
            if (expiresEl) {
                if (codeData.expiresAt) {
                    expiresEl.textContent = formatDateTime(codeData.expiresAt) + ' (' + getCountdownString(codeData.expiresAt) + ')';
                } else {
                    expiresEl.textContent = 'ไม่มีกำหนด';
                }
            }

            const historyContainer = document.getElementById('modalHistory');
            const history = codeData.history || [];

            if (history.length === 0) {
                historyContainer.innerHTML = '<div class="no-history">ยังไม่มีประวัติการสุ่ม</div>';
            } else {
                historyContainer.innerHTML = history.map(item => {
                    const isMiss = item.prize.toLowerCase().includes('miss');
                    const date = new Date(item.time).toLocaleString('th-TH', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    return `
                        <div class="modal-history-item">
                            <div class="prize">
                                <span class="dot ${isMiss ? 'miss' : 'win'}"></span>
                                ${item.prize}
                            </div>
                            <div class="time">${date}</div>
                        </div>
                    `;
                }).reverse().join('');
            }

            document.getElementById('historyModal').classList.add('show');
        }

        function closeModal() {
            document.getElementById('historyModal').classList.remove('show');
        }

        function getExpiryText(item) {
            if (!item.expiresAt) return { text: 'ไม่มีกำหนด', class: '' };
            const now = new Date();
            const exp = new Date(item.expiresAt);
            if (exp.getTime() <= now.getTime()) return { text: 'หมดอายุ', class: 'expired' };
            const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
            if (daysLeft <= 1) return { text: 'หมดอายุภายใน 1 วัน', class: 'soon' };
            return { text: 'หมดอายุใน ' + daysLeft + ' วัน', class: '' };
        }

        function getCountdownString(expiresAt) {
            if (!expiresAt) return 'ไม่มีกำหนด';
            var now = new Date().getTime();
            var exp = new Date(expiresAt).getTime();
            var ms = exp - now;
            if (ms <= 0) return 'หมดอายุ';
            var seconds = Math.floor((ms / 1000) % 60);
            var minutes = Math.floor((ms / (1000 * 60)) % 60);
            var hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
            var days = Math.floor(ms / (1000 * 60 * 60 * 24));
            var parts = [];
            if (days > 0) parts.push(days + ' วัน');
            parts.push(hours + ' ชม.');
            parts.push(minutes + ' นาที');
            // always show seconds for precise realtime countdown
            parts.push(seconds + ' วินาที');
            return 'เหลืออีก ' + parts.join(' ');
        }

        function updateAllCountdowns() {
            if (document.visibilityState === 'hidden') return;
            var elements = document.querySelectorAll('.countdown-text[data-expires]');
            if (elements.length === 0) return;
            var anyExpired = false;
            var now = new Date().getTime();
            for (var i = 0; i < elements.length; i++) {
                var el = elements[i];
                var expiresAt = el.getAttribute('data-expires');
                if (!expiresAt) continue;
                var exp = new Date(expiresAt).getTime();
                if (exp <= now) {
                    anyExpired = true;
                    el.textContent = 'หมดอายุ';
                    el.classList.add('expired');
                    continue;
                }
                el.textContent = getCountdownString(expiresAt);
                el.classList.remove('expired');
                if ((exp - now) < 24 * 60 * 60 * 1000) el.classList.add('soon');
                else el.classList.remove('soon');
            }
            if (anyExpired) {
                moveExpiredToTrash();
                renderCodeList();
                updateStats();
            }
        }

        function renderCodeList() {
            moveExpiredToTrash();
            const codes = getCodes();
            const container = document.getElementById('codeList');
            const selectAllRow = document.getElementById('selectAllRow');

            if (codes.length === 0) {
                selectAllRow.style.display = 'none';
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="icon">🎫</div>
                        <p>ยังไม่มีโค้ด กรุณาสร้างโค้ดใหม่</p>
                    </div>
                `;
                selectedCodes.clear();
                updateSelectedUI();
                renderTrashList();
                return;
            }

            selectAllRow.style.display = 'flex';
            const sortedCodes = [...codes].reverse();

            function getLastUsedTime(item) {
                if (!item) return null;
                if (item.lastUsedAt) return item.lastUsedAt;
                const h = item.history || [];
                if (h.length === 0) return null;
                const last = h[h.length - 1];
                return last.time || last.date || last.timestamp || null;
            }

            container.innerHTML = sortedCodes.map(item => {
                const history = item.history || [];
                const recentHistory = history.slice(-3);
                const expiry = getExpiryText(item);
                
                let badgeClass = '';
                if (item.spins === 0) badgeClass = 'empty';
                else if (item.spins === item.maxSpins) badgeClass = 'full';

                const date = formatDateTime(item.createdAt);
                const expiresAtStr = item.expiresAt ? new Date(item.expiresAt).toLocaleDateString('th-TH', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                }) : '';
                const lastUsedTime = getLastUsedTime(item);
                const statusText = lastUsedTime ? formatDateTime(lastUsedTime) : '-';
                const statusClass = lastUsedTime ? 'used' : 'ready';

                const isSelected = selectedCodes.has(item.code);

                return `
                    <div class="code-card ${isSelected ? 'selected' : ''}" data-code="${item.code}">
                        <div class="code-card-header">
                            <div class="code-left">
                                <input type="checkbox" class="code-checkbox code-checkbox-item" 
                                    ${isSelected ? 'checked' : ''} 
                                    onchange="toggleCodeSelection('${item.code}', this)">
                                <div>
                                    <span class="code-value">${item.code}</span>
                                    <span class="date-badge">📅 สร้างโค้ดเมื่อ: ${date}</span>
                                    <span class="expiry-badge ${expiry.class}">⏱ <span class="countdown-text" data-expires="${item.expiresAt || ''}">${item.expiresAt ? getCountdownString(item.expiresAt) : 'ไม่มีกำหนด'}</span>${expiresAtStr ? ' (' + expiresAtStr + ')' : ''}</span>
                                </div>
                            </div>
                            <div class="code-meta">
                                <span class="spins-badge ${badgeClass}">
                                    🎯 ${item.spins} / ${item.maxSpins} ครั้ง
                                </span>
                                <div class="code-actions">
                                    <button class="btn-icon btn-view" onclick="viewHistory('${item.code}')" title="ดูประวัติ">📊</button>
                                    <button class="btn-icon btn-copy" onclick="copyCode('${item.code}')" title="คัดลอก">📋</button>
                                    <button class="btn-icon btn-delete" onclick="deleteCode('${item.code}')" title="ลบ">🗑️</button>
                                </div>
                            </div>
                        </div>
                        ${recentHistory.length > 0 ? `
                            <div class="history-section">
                                <div class="history-title">🎁 รางวัลล่าสุด (${history.length} ครั้ง)</div>
                                <div class="history-list">
                                    ${recentHistory.map(h => {
                                        const isMiss = h.prize.toLowerCase().includes('miss');
                                        return `<span class="history-item ${isMiss ? 'miss' : 'win'}">${h.prize}</span>`;
                                    }).reverse().join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');

            // add status badges after rendering (fallback / visual indicator)
            const allCodes = getCodes();
            container.querySelectorAll('.code-card').forEach(card => {
                const code = card.getAttribute('data-code');
                const item = allCodes.find(c => c.code === code);
                if (item && !card.querySelector('.status-badge')) {
                    const lastUsedTime = getLastUsedTime(item);
                    const span = document.createElement('span');
                    span.className = 'status-badge ' + (lastUsedTime ? 'used' : 'ready');
                    span.textContent = lastUsedTime ? 'ใช้งานเมื่อ : ' + formatDateTime(lastUsedTime) : 'ยังไม่ใช้';
                    const meta = card.querySelector('.code-meta');
                    if (meta) meta.prepend(span);
                }
            });

            document.getElementById('selectAll').checked = selectedCodes.size === codes.length && codes.length > 0;
            renderTrashList();
        }

        function renderTrashList() {
            purgeExpiredTrash();
            const trash = getTrash();
            const container = document.getElementById('trashList');
            if (!container) return;
            const wrap = document.getElementById('trashSection');
            if (trash.length === 0) {
                if (wrap) wrap.style.display = 'none';
                return;
            }
            if (wrap) wrap.style.display = 'block';
            container.innerHTML = trash.map(item => {
                const canRestore = !item.restoredOnce;
                const movedDate = item.movedToTrashAt ? new Date(item.movedToTrashAt).toLocaleString('th-TH', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                }) : '';
                const timeLeft = getTrashTimeLeft(item.movedToTrashAt);
                return `
                    <div class="trash-card" data-code="${item.code}">
                        <div class="trash-card-main">
                            <span class="code-value">${item.code}</span>
                            <span class="trash-meta">🎯 ${item.spins}/${item.maxSpins} ครั้ง · ย้ายเมื่อ ${movedDate}</span>
                            <span class="trash-countdown ${timeLeft.class}" data-moved="${item.movedToTrashAt || ''}">⏱ ${timeLeft.text}</span>
                            ${item.restoredOnce ? '<span class="trash-no-restore">กู้คืนได้เพียง 1 ครั้ง</span>' : ''}
                        </div>
                        <div class="trash-actions">
                            ${canRestore ? `<button class="btn-sm btn-restore" onclick="restoreFromTrash('${item.code}')">กู้คืน</button>` : ''}
                            <button class="btn-sm btn-delete-all" onclick="deleteFromTrash('${item.code}')">ลบถาวร</button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function updateTrashCountdowns() {
            if (document.visibilityState === 'hidden') return;
            var elements = document.querySelectorAll('.trash-countdown[data-moved]');
            var anyExpired = false;
            for (var i = 0; i < elements.length; i++) {
                var el = elements[i];
                var movedAt = el.getAttribute('data-moved');
                if (!movedAt) continue;
                var left = getTrashTimeLeft(movedAt);
                el.textContent = '⏱ ' + left.text;
                el.className = 'trash-countdown ' + (left.class || '');
                if (left.ms <= 0) anyExpired = true;
            }
            if (anyExpired) {
                purgeExpiredTrash();
                renderTrashList();
            }
        }

        var countdownTimeout = null;
        function tickCountdowns() {
            if (countdownTimeout) clearTimeout(countdownTimeout);
            requestAnimationFrame(function() {
                updateAllCountdowns();
                updateTrashCountdowns();
            });
        }

        function formatDateTime(isoString) {
            if (!isoString) return 'ยังไม่ได้ใช้';
            const date = new Date(isoString);
            const datePart = date.toLocaleDateString('th-TH', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });
            const timePart = date.toLocaleTimeString('th-TH', {
                hour: '2-digit',
                minute: '2-digit'
            });
            return datePart + ' ' + timePart;
        }

        function filterCodes() {
            const searchInput = document.getElementById('searchInput');
            const searchValue = searchInput.value.toLowerCase().trim();
            const codes = getCodes();
            const container = document.getElementById('codeList');
            
            if (!searchValue) {
                renderCodeList();
                document.getElementById('searchCount').textContent = '';
                return;
            }
            
            const filtered = codes.filter(item => {
                const code = item.code.toLowerCase();
                return code.includes(searchValue);
            });
            
            document.getElementById('searchCount').textContent = 'พบ ' + filtered.length + ' รายการ';
            // hide select-all when searching
            const selectAllRow = document.getElementById('selectAllRow');
            if (selectAllRow) selectAllRow.style.display = 'none';
            
            if (filtered.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="icon">🔍</div>
                        <p>ไม่พบโค้ด "${searchValue}"</p>
                    </div>
                `;
                return;
            }
            
            const sortedCodes = [...filtered].reverse();
            
            container.innerHTML = sortedCodes.map(item => {
                const history = item.history || [];
                const recentHistory = history.slice(-3);
                const expiry = getExpiryText(item);
                
                let badgeClass = '';
                if (item.spins === 0) badgeClass = 'empty';
                else if (item.spins === item.maxSpins) badgeClass = 'full';

                const date = formatDateTime(item.createdAt);
                const expiresAtStr = item.expiresAt ? new Date(item.expiresAt).toLocaleDateString('th-TH', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                }) : '';
                const statusText = item.lastUsedAt ? 'ใช้งานแล้ว' : 'พร้อมใช้งาน';
                const statusClass = item.lastUsedAt ? 'used' : 'ready';

                const isSelected = selectedCodes.has(item.code);

                return `
                    <div class="code-card ${isSelected ? 'selected' : ''}" data-code="${item.code}">
                        <div class="code-card-header">
                            <div class="code-left">
                                <input type="checkbox" class="code-checkbox code-checkbox-item" 
                                    ${isSelected ? 'checked' : ''} 
                                    onchange="toggleCodeSelection('${item.code}', this)">
                                <div>
                                    <span class="code-value">${item.code}</span>
                                    <span class="date-badge">📅 สร้าง: ${date}</span>
                                    <span class="expiry-badge ${expiry.class}">⏱ <span class="countdown-text" data-expires="${item.expiresAt || ''}">${item.expiresAt ? getCountdownString(item.expiresAt) : 'ไม่มีกำหนด'}</span>${expiresAtStr ? ' (' + expiresAtStr + ')' : ''}</span>
                                </div>
                            </div>
                            <div class="code-meta">
                                <span class="spins-badge ${badgeClass}">
                                    🎯 ${item.spins} / ${item.maxSpins} ครั้ง
                                </span>
                                <div class="code-actions">
                                    <button class="btn-icon btn-view" onclick="viewHistory('${item.code}')" title="ดูประวัติ">📊</button>
                                    <button class="btn-icon btn-copy" onclick="copyCode('${item.code}')" title="คัดลอก">📋</button>
                                    <button class="btn-icon btn-delete" onclick="deleteCode('${item.code}')" title="ลบ">🗑️</button>
                                </div>
                            </div>
                        </div>
                        ${recentHistory.length > 0 ? `
                            <div class="history-section">
                                <div class="history-title">🎁 รางวัลล่าสุด (${history.length} ครั้ง)</div>
                                <div class="history-list">
                                    ${recentHistory.map(h => {
                                        const isMiss = h.prize.toLowerCase().includes('miss');
                                        return `<span class="history-item ${isMiss ? 'miss' : 'win'}">${h.prize}</span>`;
                                    }).reverse().join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');
            // add status badges for search results
            const allCodes = getCodes();
            container.querySelectorAll('.code-card').forEach(card => {
                const code = card.getAttribute('data-code');
                const item = allCodes.find(c => c.code === code);
                if (item && !card.querySelector('.status-badge')) {
                    const statusText = item.lastUsedAt ? 'ใช้งานแล้ว' : 'พร้อมใช้งาน';
                    const statusClass = item.lastUsedAt ? 'used' : 'ready';
                    const span = document.createElement('span');
                    const val = card.querySelector('.code-value');
                    if (val) val.after(span);
                }
            });
        }

        function updateStats() {
            const codes = getCodes();
            const activeCodes = codes.filter(c => c.spins > 0);
            const totalSpins = codes.reduce((sum, c) => sum + c.spins, 0);
            const totalWins = codes.reduce((sum, c) => {
                const history = c.history || [];
                return sum + history.filter(h => !h.prize.toLowerCase().includes('miss')).length;
            }, 0);

            document.getElementById('totalCodes').textContent = codes.length;
            document.getElementById('activeCodes').textContent = activeCodes.length;
            document.getElementById('totalSpins').textContent = totalSpins;
            document.getElementById('totalWins').textContent = totalWins;
            // if dashboard is currently visible, refresh its contents
            if (document.getElementById('dashboardModal').classList.contains('show')) {
                updateDashboardContent();
            }
        }

        function showToast(message, type = 'success') {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.className = 'toast show' + (type === 'error' ? ' error' : '');
            setTimeout(() => toast.classList.remove('show'), 3000);
        }

        function refreshData() {
            selectedCodes.clear();
            document.getElementById('searchInput').value = '';
            document.getElementById('searchCount').textContent = '';
            if (apiBase()) {
                apiGet({ action: 'purgetrash' }).then(function() { return loadFromApi(true); }).then(function() { showToast('🔄 รีเฟรชข้อมูลแล้ว'); });
                return;
            }
            renderCodeList();
            updateStats();
            showToast('🔄 รีเฟรชข้อมูลแล้ว');
        }

        document.getElementById('historyModal').addEventListener('click', function(e) {
            if (e.target === this) closeModal();
        }, { passive: true });

        window.addEventListener('focus', function() {
            if (apiBase()) { loadFromApi(); return; }
            renderCodeList();
            updateStats();
        }, { passive: true });

        if (apiBase()) {
            loadFromApi();
        } else {
            renderCodeList();
            updateStats();
        }
        var countdownInterval = 1000; // update every second for real‑time countdown
        var countdownIntervalId = setInterval(tickCountdowns, countdownInterval);
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') {
                tickCountdowns();
            } else {
                if (countdownTimeout) clearTimeout(countdownTimeout);
            }
        }, { passive: true });

        if (typeof window.LINK_WHEEL === 'string' && window.LINK_WHEEL) {
            var el = document.getElementById('linkToWheel');
            if (el) el.setAttribute('href', window.LINK_WHEEL);
        }

        // ========== Dashboard Functions ==========
        var dashboardCurrentDate = 'today';
        var dashboardChart = null;
        var dashboardPieChart = null;

        function openDashboard() {
            // when reopening keep the last selected range
            // highlight the appropriate button and toggle custom field
            var modal = document.getElementById('dashboardModal');
            modal.classList.add('show');

            var customInput = document.getElementById('customDate');
            if (customInput) {
                customInput.style.display = dashboardCurrentDate === 'custom' ? 'block' : 'none';
            }

            // make sure the button state matches the current selection
            modal.querySelectorAll('.date-btn').forEach(btn => btn.classList.remove('active'));
            if (dashboardCurrentDate !== 'custom') {
                modal.querySelector('[data-date="' + dashboardCurrentDate + '"]')?.classList.add('active');
            }

            // update content after modal is visible so charts can size correctly
            setTimeout(updateDashboardContent, 0);
        }

        function closeDashboard() {
            document.getElementById('dashboardModal').classList.remove('show');
        }

        function selectDashboardDate(type) {
            // change range and refresh data immediately
            dashboardCurrentDate = type;
            var modal = document.getElementById('dashboardModal');
            var customInput = document.getElementById('customDate');

            // update button states inside modal
            modal.querySelectorAll('.date-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            if (type !== 'custom') {
                modal.querySelector('[data-date="' + type + '"]')?.classList.add('active');
            }

            // show/hide custom field
            if (customInput) {
                if (type === 'custom') {
                    customInput.style.display = 'block';
                    customInput.value = '';
                } else {
                    customInput.style.display = 'none';
                }
            }

            updateDashboardContent();
        }

        function getDateRangeForDashboard() {
            var today = new Date();
            today.setHours(0, 0, 0, 0);
            var startDate = new Date(today);
            var endDate = new Date(today);
            endDate.setHours(23, 59, 59, 999);
            
            if (dashboardCurrentDate === 'today') {
                startDate = new Date(today);
            } else if (dashboardCurrentDate === '7days') {
                startDate.setDate(startDate.getDate() - 6);
                startDate.setHours(0, 0, 0, 0);
            } else if (dashboardCurrentDate === '30days') {
                startDate.setDate(startDate.getDate() - 29);
                startDate.setHours(0, 0, 0, 0);
            } else if (dashboardCurrentDate === 'custom') {
                var customInputValue = document.getElementById('customDate').value;
                if (customInputValue) {
                    startDate = new Date(customInputValue + 'T00:00:00');
                    endDate = new Date(customInputValue + 'T23:59:59');
                }
            }
            
            return { startDate: startDate, endDate: endDate };
        }

        function aggregateDashboardData() {
            var codes = getCodes();
            var dateRange = getDateRangeForDashboard();
            var startDate = dateRange.startDate;
            var endDate = dateRange.endDate;
            
            var totalWins = 0;
            var totalSpins = 0;
            var historyItems = [];
            var prizeStats = {};
            
            codes.forEach(function(code) {
                var codeHistory = code.history || [];
                codeHistory.forEach(function(item) {
                    // ตรวจสอบว่ามี date property และเป็น valid date
                    var itemDate = item.date ? new Date(item.date) : (item.time ? new Date(item.time) : null);
                    if (!itemDate || isNaN(itemDate.getTime())) return;
                    
                    if (itemDate >= startDate && itemDate <= endDate) {
                        totalSpins++;
                        
                        // ตรวจสอบ result property
                        var prizeName = '-';
                        var isWin = false;
                        
                        if (item.result && item.result.prize) {
                            prizeName = item.result.prize;
                            isWin = !prizeName.toLowerCase().includes('miss');
                        } else if (item.prize) {
                            prizeName = item.prize;
                            isWin = !prizeName.toLowerCase().includes('miss');
                        }
                        
                        if (isWin) {
                            totalWins++;
                        }
                        
                        prizeStats[prizeName] = (prizeStats[prizeName] || 0) + 1;
                        historyItems.push({
                            code: code.code,
                            prize: prizeName,
                            date: item.date || item.time,
                            status: isWin ? 'win' : 'miss'
                        });
                    }
                });
            });
            
            return {
                totalWins: totalWins,
                totalSpins: totalSpins,
                successRate: totalSpins > 0 ? Math.round((totalWins / totalSpins) * 100) : 0,
                prizeStats: prizeStats,
                historyItems: historyItems.sort((a, b) => new Date(b.date) - new Date(a.date))
            };
        }

        function getPrizeColorMap(prizeStats) {
            var colors = [
                'rgba(255, 159, 67, 0.25)',     // orange
                'rgba(255, 107, 107, 0.25)',    // red
                'rgba(66, 165, 245, 0.25)',     // blue
                'rgba(102, 187, 106, 0.25)',    // green
                'rgba(171, 71, 188, 0.25)',     // purple
                'rgba(255, 193, 7, 0.25)',      // yellow
                'rgba(76, 175, 80, 0.25)',      // darker green
                'rgba(233, 30, 99, 0.25)'       // pink
            ];
            
            var borderColors = [
                'rgba(255, 159, 67, 0.8)',      // orange
                'rgba(255, 107, 107, 0.8)',     // red
                'rgba(66, 165, 245, 0.8)',      // blue
                'rgba(102, 187, 106, 0.8)',     // green
                'rgba(171, 71, 188, 0.8)',      // purple
                'rgba(255, 193, 7, 0.8)',       // yellow
                'rgba(76, 175, 80, 0.8)',       // darker green
                'rgba(233, 30, 99, 0.8)'        // pink
            ];
            
            var prizeLabels = Object.keys(prizeStats);
            var colorMap = {};
            
            prizeLabels.forEach(function(prize, index) {
                colorMap[prize] = {
                    bg: colors[index % colors.length],
                    border: borderColors[index % borderColors.length]
                };
            });
            
            return colorMap;
        }

        function updateDashboardContent() {
            var data = aggregateDashboardData();
            
            // อัปเดตข้อมูลสรุป
            document.getElementById('dashTotalWins').textContent = data.totalWins;
            document.getElementById('dashTotalSpins').textContent = data.totalSpins;
            document.getElementById('dashSuccessRate').textContent = data.successRate + '%';
            
            // อัปเดตกราฟ (Bar + Pie) inside rAF to reduce main-thread spikes
            requestAnimationFrame(function() {
                updateDashboardCharts(data.prizeStats, data.totalWins, data.totalSpins);
            });
            
            // สร้าง color map สำหรับแต่ละรางวัล
            var prizeColorMap = getPrizeColorMap(data.prizeStats);
            
            // อัปเดตรายการประวัติ
            var historyContainer = document.getElementById('dashboardHistoryItems');
            if (data.historyItems.length === 0) {
                historyContainer.innerHTML = '<div class="empty-state"><p>ไม่มีข้อมูลในช่วงวันที่นี้</p></div>';
            } else {
                historyContainer.innerHTML = data.historyItems.map(function(item) {
                    var dateObj = new Date(item.date);
                    var timeStr = dateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                    var statusEmoji = item.status === 'win' ? '✅' : '❌';
                    var prizeColor = prizeColorMap[item.prize];
                    var bgColor = prizeColor ? prizeColor.bg : 'rgba(0,0,0,0.15)';
                    var borderColor = prizeColor ? prizeColor.border : 'rgba(255,255,255,0.3)';
                    var styleAttr = 'style="background: ' + bgColor + '; border: 1px solid ' + borderColor + ';"';
                    
                    return '<div class="dashboard-history-item ' + item.status + '" ' + styleAttr + '>' +
                        '<div class="item-code">' + item.code + ' <span class="status-dot">' + statusEmoji + '</span></div>' +
                        '<div class="item-prize">' + item.prize + '</div>' +
                        '<div class="item-time">' + timeStr + '</div>' +
                        '</div>';
                }).join('');
            }
        }

        function updateDashboardCharts(prizeStats, totalWins, totalSpins) {
            var labels = Object.keys(prizeStats);
            var data = Object.values(prizeStats);
            
            if (labels.length === 0) {
                document.getElementById('dashboardChart').style.display = 'none';
                document.getElementById('dashboardPieChart').style.display = 'none';
                return;
            }
            
            // Bar Chart
            updateDashboardBarChart(labels, data);
            
            // Pie Chart now shows prize breakdown instead of success/fail
            updateDashboardPieChart(labels, data);
        }

        function updateDashboardBarChart(labels, data) {
            var canvasEl = document.getElementById('dashboardChart');
            if (!canvasEl) return;
            
            canvasEl.style.display = 'block';
            
            // ล้างกราฟเก่า
            if (dashboardChart && typeof dashboardChart.destroy === 'function') {
                dashboardChart.destroy();
            }
            
            // ตรวจสอบว่ามี Chart.js หรือไม่
            if (typeof Chart !== 'undefined') {
                dashboardChart = new Chart(canvasEl, {
                    type: 'bar',
                    data: {
                        labels: labels.length > 10 ? labels.map((l, i) => i % 2 === 0 ? l : '') : labels,
                        datasets: [{
                            label: 'จำนวนรางวัล',
                            data: data,
                            backgroundColor: [
                                'rgba(255, 159, 67, 0.85)',
                                'rgba(255, 107, 107, 0.85)',
                                'rgba(66, 165, 245, 0.85)',
                                'rgba(102, 187, 106, 0.85)',
                                'rgba(171, 71, 188, 0.85)',
                                'rgba(255, 193, 7, 0.85)',
                                'rgba(76, 175, 80, 0.85)',
                                'rgba(233, 30, 99, 0.85)',
                                'rgba(0, 188, 212, 0.85)',
                                'rgba(156, 39, 176, 0.85)',
                                'rgba(255, 87, 34, 0.85)',
                                'rgba(63, 81, 181, 0.85)',
                            ],
                            borderColor: [
                                'rgba(255, 159, 67, 1)',
                                'rgba(255, 107, 107, 1)',
                                'rgba(66, 165, 245, 1)',
                                'rgba(102, 187, 106, 1)',
                                'rgba(171, 71, 188, 1)',
                                'rgba(255, 193, 7, 1)',
                                'rgba(76, 175, 80, 1)',
                                'rgba(233, 30, 99, 1)',
                                'rgba(0, 188, 212, 1)',
                                'rgba(156, 39, 176, 1)',
                                'rgba(255, 87, 34, 1)',
                                'rgba(63, 81, 181, 1)',
                            ],
                            borderWidth: 2,
                            borderRadius: 6
                        }]
                    },
                    options: {
                        indexAxis: data.length > 5 ? 'y' : 'x',
                        responsive: true,
                        maintainAspectRatio: false,
                        animation: { duration: window.innerWidth <= 768 ? 0 : 400 },
                        plugins: {
                            legend: {
                                display: true,
                                labels: {
                                    color: 'rgba(255, 255, 255, 0.8)',
                                    font: { size: 12, weight: 'bold' }
                                }
                            },
                            tooltip: {
                                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                                titleColor: '#fff',
                                bodyColor: '#fff',
                                borderColor: 'rgba(255, 255, 255, 0.3)',
                                borderWidth: 1
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    color: 'rgba(255, 255, 255, 0.6)',
                                    font: { size: 11 }
                                },
                                grid: {
                                    color: 'rgba(255, 255, 255, 0.08)'
                                }
                            },
                            x: {
                                ticks: {
                                    color: 'rgba(255, 255, 255, 0.6)',
                                    font: { size: 11 }
                                },
                                grid: {
                                    display: false
                                }
                            }
                        }
                    }
                });
            }
        }

        function updateDashboardPieChart(labels, data) {
            var canvasEl = document.getElementById('dashboardPieChart');
            if (!canvasEl) return;
            
            canvasEl.style.display = 'block';
            
            if (dashboardPieChart && typeof dashboardPieChart.destroy === 'function') {
                dashboardPieChart.destroy();
            }
            
            if (typeof Chart !== 'undefined') {
                dashboardPieChart = new Chart(canvasEl, {
                    type: 'doughnut',
                    data: {
                        labels: labels,
                        datasets: [{
                            data: data,
                            backgroundColor: [
                                'rgba(255, 159, 67, 0.85)',
                                'rgba(255, 107, 107, 0.85)',
                                'rgba(66, 165, 245, 0.85)',
                                'rgba(102, 187, 106, 0.85)',
                                'rgba(171, 71, 188, 0.85)',
                                'rgba(255, 193, 7, 0.85)',
                                'rgba(76, 175, 80, 0.85)',
                                'rgba(233, 30, 99, 0.85)'
                            ],
                            borderColor: [
                                'rgba(255, 159, 67, 1)',
                                'rgba(255, 107, 107, 1)',
                                'rgba(66, 165, 245, 1)',
                                'rgba(102, 187, 106, 1)',
                                'rgba(171, 71, 188, 1)',
                                'rgba(255, 193, 7, 1)',
                                'rgba(76, 175, 80, 1)',
                                'rgba(233, 30, 99, 1)'
                            ],
                            borderWidth: 2,
                            hoverOffset: 10
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        animation: { duration: window.innerWidth <= 768 ? 0 : 400 },
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: {
                                    color: 'rgba(255, 255, 255, 0.8)',
                                    font: { size: 12, weight: 'bold' },
                                    padding: 16
                                }
                            },
                            tooltip: {
                                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                                titleColor: '#fff',
                                bodyColor: '#fff',
                                borderColor: 'rgba(255, 255, 255, 0.3)',
                                borderWidth: 1,
                                callbacks: {
                                    label: function(context) {
                                        var label = context.label || '';
                                        var value = context.parsed;
                                        var total = data.reduce((a,b)=>a+b,0);
                                        var percent = total > 0 ? Math.round((value/total)*100) : 0;
                                        return label + ': ' + value + ' (' + percent + '%)';
                                    }
                                }
                            }
                        }
                    }
                });
            }
        }

        document.getElementById('dashboardModal').addEventListener('click', function(e) {
            if (e.target === this) closeDashboard();
        });