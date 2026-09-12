const API_URL = 'https://script.google.com/macros/s/AKfycbxNhfE6sPUcxCW-eMLyMPnvH6cXfTeEVa5XFJN0QbXgvODky8KAQgUeHi2WDm9TjQB-8Q/exec';

const LOCAL_DATA_CACHE_KEY = 'waste-bank-initial-data-v2';
const LOCAL_DATA_CACHE_TTL_MS = 2 * 60 * 1000;

let appData = {
    config: {},
    members: [],
    transactions: [],
    rewards: [],
    redemptions: []
};

let adminSessionToken = null;
let currentShopStudent = null;

// ==========================================
// 1. Core Infrastructure
// ==========================================

function getCachedInitialData() {
    try {
        const cached = localStorage.getItem(LOCAL_DATA_CACHE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.savedAt && (Date.now() - parsed.savedAt < LOCAL_DATA_CACHE_TTL_MS)) {
                return parsed.data;
            }
        }
    } catch (e) {
        console.error("Cache read error:", e);
    }
    return null;
}

function cacheInitialData(data) {
    try {
        localStorage.setItem(LOCAL_DATA_CACHE_KEY, JSON.stringify({
            savedAt: Date.now(),
            data: data
        }));
    } catch (e) {
        console.error("Cache write error:", e);
    }
}

function formatDate(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    if (isNaN(date)) return isoString;
    const pad = (n) => n.toString().padStart(2, '0');
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type === 'success' ? 'success' : type === 'error' ? 'danger' : 'primary'} border-0 mb-2`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');

    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                ${type === 'loading' ? '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>' : ''}
                ${message}
            </div>
            ${type !== 'loading' ? '<button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>' : ''}
        </div>
    `;

    container.appendChild(toast);
    
    // Using Bootstrap Toast API if available
    if (typeof bootstrap !== 'undefined' && bootstrap.Toast) {
        const bsToast = new bootstrap.Toast(toast, { autohide: type !== 'loading', delay: 3000 });
        bsToast.show();
        if (type !== 'loading') {
            toast.addEventListener('hidden.bs.toast', () => {
                toast.remove();
            });
        }
    } else {
        // Fallback if bootstrap is not globally available
        toast.classList.add('show');
        if (type !== 'loading') {
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 150);
            }, 3000);
        }
    }
    return toast;
}

async function apiPost(action, payload = {}, requiresAdmin = false) {
    let loadingToast = null;
    if (action !== 'getInitialData') {
        loadingToast = showToast('กำลังดำเนินการ...', 'loading');
    }

    try {
        const body = {
            action: action,
            payload: payload
        };
        
        if (requiresAdmin) {
            body.adminToken = adminSessionToken;
        }

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            },
            body: JSON.stringify(body)
        });

        const result = await response.json();
        
        if (loadingToast) {
            if (typeof bootstrap !== 'undefined' && bootstrap.Toast) {
                bootstrap.Toast.getInstance(loadingToast)?.hide();
            } else {
                loadingToast.remove();
            }
        }

        if (!result.success) {
            showToast(result.error || 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์', 'error');
            throw new Error(result.error);
        }

        return result;
    } catch (error) {
        if (loadingToast) {
            if (typeof bootstrap !== 'undefined' && bootstrap.Toast) {
                bootstrap.Toast.getInstance(loadingToast)?.hide();
            } else {
                loadingToast.remove();
            }
        }
        console.error(`API Error (${action}):`, error);
        throw error;
    }
}

async function fetchInitialData({ showLoading = false, showSuccess = false } = {}) {
    let loadingToast = null;
    if (showLoading) {
        loadingToast = showToast('กำลังโหลดข้อมูล...', 'loading');
    }
    try {
        const response = await fetch(`${API_URL}?action=getInitialData`);
        const result = await response.json();
        
        if (result.success) {
            appData = result.data;
            cacheInitialData(appData);
            updateRoomDropdowns();
            renderDashboard();
            renderLeaderboard();
            
            // Refresh current active view if needed
            const activePage = document.querySelector('.page-section:not(.d-none)');
            if (activePage) {
                if (activePage.id === 'page-shop') renderShop();
                if (activePage.id === 'page-status') performSearch(); // re-render search results
                if (activePage.id === 'page-admin') {
                    const activeAdminTab = document.querySelector('.admin-tab.active');
                    if (activeAdminTab) {
                        openAdminSection(activeAdminTab.getAttribute('data-target'));
                    }
                }
            }

            if (showSuccess) {
                showToast('โหลดข้อมูลสำเร็จ', 'success');
            }
        } else {
            showToast('ไม่สามารถโหลดข้อมูลได้', 'error');
        }
    } catch (e) {
        console.error("Fetch Initial Data Error:", e);
        showToast('การเชื่อมต่อมีปัญหา', 'error');
    } finally {
        if (loadingToast) {
            if (typeof bootstrap !== 'undefined' && bootstrap.Toast) {
                bootstrap.Toast.getInstance(loadingToast)?.hide();
            } else {
                loadingToast.remove();
            }
        }
    }
}

function updateRoomDropdowns() {
    const rooms = new Set();
    appData.members.forEach(m => {
        if (m.Room) rooms.add(m.Room);
    });
    
    const sortedRooms = Array.from(rooms).sort();
    
    const lbRoom = document.getElementById('lbFilterRoom');
    const adminRoom = document.getElementById('adminMemRoom');
    
    const createOptions = (selectElem) => {
        if (!selectElem) return;
        const currentVal = selectElem.value;
        selectElem.innerHTML = '<option value="">ทุกห้อง</option>';
        sortedRooms.forEach(room => {
            const opt = document.createElement('option');
            opt.value = room;
            opt.textContent = room;
            selectElem.appendChild(opt);
        });
        selectElem.value = currentVal;
    };
    
    createOptions(lbRoom);
    createOptions(adminRoom);
}

// ==========================================
// 2. SPA Navigation
// ==========================================

function navigateTo(targetId) {
    // Hide all pages
    document.querySelectorAll('.page-section').forEach(el => el.classList.add('d-none'));
    
    // Show target page
    const targetEl = document.getElementById(targetId);
    if (targetEl) targetEl.classList.remove('d-none');
    
    // Update nav links
    document.querySelectorAll('.nav-link').forEach(el => {
        if (el.getAttribute('data-target') === targetId) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });

    // Close mobile menu if open
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenu && !mobileMenu.classList.contains('d-none')) {
        mobileMenu.classList.add('d-none');
    }
    
    window.scrollTo(0, 0);

    // Render specific page data
    if (targetId === 'page-dashboard') renderDashboard();
    if (targetId === 'page-leaderboard') renderLeaderboard();
    if (targetId === 'page-shop') {
        currentShopStudent = null; // reset shop student
        document.getElementById('shopStudentId').value = '';
        document.getElementById('shopStudentInfo').classList.add('d-none');
        document.getElementById('rewardsGrid').innerHTML = '';
    }
    if (targetId === 'page-admin') {
        const activeAdminTab = document.querySelector('.admin-tab.active');
        if (activeAdminTab) {
            openAdminSection(activeAdminTab.getAttribute('data-target'));
        } else {
            openAdminSection('admin-approve'); // default
        }
    }
}

function openAdminSection(targetId) {
    // Update tabs
    document.querySelectorAll('.admin-tab').forEach(el => {
        if (el.getAttribute('data-target') === targetId) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });

    // Update content panels
    document.querySelectorAll('.admin-content').forEach(el => {
        if (el.id === targetId) {
            el.classList.remove('d-none');
        } else {
            el.classList.add('d-none');
        }
    });

    // Render logic
    if (targetId === 'admin-approve') renderPendingApprovals();
    if (targetId === 'admin-handover') renderPendingHandovers();
    if (targetId === 'admin-rewards') renderManageRewards();
    if (targetId === 'admin-members') renderAdminMembersTable();
}

// ==========================================
// 3. Image Compression
// ==========================================

function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_SIZE = 800;
                let width = img.width;
                let height = img.height;
                if (width > height) {
                    if (width > MAX_SIZE) { 
                        height *= MAX_SIZE / width; 
                        width = MAX_SIZE; 
                    }
                } else {
                    if (height > MAX_SIZE) { 
                        width *= MAX_SIZE / height; 
                        height = MAX_SIZE; 
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const base64 = canvas.toDataURL('image/jpeg', 0.7);
                resolve(base64);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ==========================================
// 4. Dashboard
// ==========================================

function renderDashboard() {
    const pendingImagesCount = appData.transactions.filter(t => t.Status === 'Pending').length;
    let totalCoinsAwarded = 0;
    appData.transactions.forEach(t => {
        if (t.Status === 'Approved') {
            totalCoinsAwarded += (parseFloat(t.Coins_Awarded) || 0);
        }
    });
    const totalRedeemed = appData.redemptions.filter(r => r.Status !== 'Cancelled').length;
    const totalMembers = appData.members.filter(m => m.Status === 'Active').length;

    const elemPending = document.getElementById('statPendingImages');
    const elemCoins = document.getElementById('statTotalCoins');
    const elemRedeemed = document.getElementById('statTotalRedeemed');
    const elemMembers = document.getElementById('statTotalMembers');

    if (elemPending) elemPending.textContent = pendingImagesCount;
    if (elemCoins) elemCoins.textContent = totalCoinsAwarded;
    if (elemRedeemed) elemRedeemed.textContent = totalRedeemed;
    if (elemMembers) elemMembers.textContent = totalMembers;
}

// ==========================================
// 5. Submit Trash Image
// ==========================================

function setupSubmitTrash() {
    const inputId = document.getElementById('submitStudentId');
    const inputName = document.getElementById('submitStudentName');
    const errorMsg = document.getElementById('submitStudentError');
    const imageInput = document.getElementById('submitImageInput');
    const imagePreview = document.getElementById('submitImagePreview');
    const submitBtn = document.getElementById('submitTrashBtn');
    const form = document.getElementById('submitTrashForm');

    if (!inputId || !form) return;

    inputId.addEventListener('input', () => {
        const val = inputId.value.trim();
        if (!val) {
            inputName.value = '';
            errorMsg.classList.add('d-none');
            return;
        }

        const member = appData.members.find(m => m.Student_ID == val);
        if (member) {
            inputName.value = member.Full_Name;
            errorMsg.classList.add('d-none');
            errorMsg.innerHTML = '';
        } else {
            inputName.value = '';
            errorMsg.classList.remove('d-none');
            errorMsg.innerHTML = `ไม่พบรหัสนักเรียน <a href="#" id="registerLink">คลิกเพื่อลงทะเบียน</a>`;
            document.getElementById('registerLink').addEventListener('click', (e) => {
                e.preventDefault();
                promptRegister(val);
            });
        }
    });

    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e2) => {
                imagePreview.src = e2.target.result;
                imagePreview.classList.remove('d-none');
            };
            reader.readAsDataURL(file);
            submitBtn.disabled = false;
        } else {
            imagePreview.classList.add('d-none');
            imagePreview.src = '';
            submitBtn.disabled = true;
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const studentId = inputId.value.trim();
        const file = imageInput.files[0];

        if (!studentId || !inputName.value) {
            showToast('กรุณากรอกรหัสนักเรียนที่ถูกต้อง', 'error');
            return;
        }

        if (!file) {
            showToast('กรุณาเลือกรูปภาพ', 'error');
            return;
        }

        try {
            submitBtn.disabled = true;
            const base64 = await compressImage(file);
            const base64Data = base64.split(',')[1]; // Remove data:image/jpeg;base64,
            
            await apiPost('submitTrashImage', { Student_ID: studentId, imageBase64: base64Data });
            showToast('ส่งรูปภาพสำเร็จ รอแอดมินตรวจสอบ', 'success');
            
            // Reset form
            form.reset();
            inputName.value = '';
            imagePreview.src = '';
            imagePreview.classList.add('d-none');
            submitBtn.disabled = true;
            
            await fetchInitialData();
        } catch (error) {
            submitBtn.disabled = false;
            // Error toast handled in apiPost
        }
    });
}

async function promptRegister(studentId) {
    const name = prompt(`ลงทะเบียนรหัส ${studentId}\nกรุณากรอกชื่อ-นามสกุล:`);
    if (!name) return;
    const grade = prompt('ระดับชั้น (เช่น ป.1, ม.1):');
    const room = prompt('ห้อง (เช่น 1, 2):');
    const seat = prompt('เลขที่:');

    try {
        await apiPost('registerMember', {
            Student_ID: studentId,
            Full_Name: name,
            Grade: grade || '-',
            Room: room || '-',
            Seat_No: seat || '-'
        });
        showToast('ลงทะเบียนสำเร็จ!', 'success');
        await fetchInitialData();
        // Trigger input event to refresh name
        document.getElementById('submitStudentId').dispatchEvent(new Event('input'));
    } catch (error) {
        // Error toast handled in apiPost
    }
}

// ==========================================
// 6. Status/History Page
// ==========================================

function setupStatusPage() {
    const form = document.getElementById('searchStudentForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            performSearch();
        });
    }
}

function performSearch() {
    const inputId = document.getElementById('searchStudentId');
    if (!inputId) return;
    const studentId = inputId.value.trim();
    if (!studentId) return;

    const member = appData.members.find(m => m.Student_ID == studentId);
    const resultDiv = document.getElementById('studentStatusResult');
    
    if (!member) {
        showToast('ไม่พบรหัสนักเรียน', 'error');
        resultDiv.classList.add('d-none');
        return;
    }

    // Populate info
    document.getElementById('statusStudentName').textContent = member.Full_Name;
    document.getElementById('statusStudentId').textContent = member.Student_ID;
    document.getElementById('statusCoinBalance').textContent = member.Coins_Balance || 0;

    // Pending Images
    const pendingImages = appData.transactions.filter(t => t.Student_ID == studentId && t.Status === 'Pending');
    const listPendingImgs = document.getElementById('statusPendingList');
    listPendingImgs.innerHTML = '';
    if (pendingImages.length === 0) {
        listPendingImgs.innerHTML = '<li class="list-group-item text-muted">ไม่มีรูปภาพรอตรวจ</li>';
    } else {
        pendingImages.forEach(img => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            li.innerHTML = `
                <div>
                    <img src="${img.Image_URL}" alt="Trash" style="width: 50px; height: 50px; object-fit: cover;" class="me-2 rounded">
                    <span>${formatDate(img.Datetime)}</span>
                </div>
                <button class="btn btn-sm btn-outline-danger" onclick="cancelStudentTransaction('${img.Tx_ID}', '${studentId}')">ยกเลิก</button>
            `;
            listPendingImgs.appendChild(li);
        });
    }

    // Pending Rewards
    const pendingRewards = appData.redemptions.filter(r => r.Student_ID == studentId && r.Status === 'Pending_Pickup');
    const listPendingRwds = document.getElementById('statusPendingRewardsList');
    listPendingRwds.innerHTML = '';
    if (pendingRewards.length === 0) {
        listPendingRwds.innerHTML = '<li class="list-group-item text-muted">ไม่มีของรางวัลรอมอบ</li>';
    } else {
        pendingRewards.forEach(r => {
            const reward = appData.rewards.find(rw => rw.Reward_ID == r.Reward_ID);
            const rName = reward ? reward.Name : 'ไม่ทราบชื่อ';
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            li.innerHTML = `
                <div>
                    <strong>${rName}</strong><br>
                    <small class="text-muted">${formatDate(r.Datetime)} (ใช้ ${r.Coins_Used} เหรียญ)</small>
                </div>
                <button class="btn btn-sm btn-outline-danger" onclick="cancelStudentRedemption('${r.Redeem_ID}', '${studentId}')">ยกเลิก</button>
            `;
            listPendingRwds.appendChild(li);
        });
    }

    // History Table
    const tbody = document.getElementById('statusHistoryTable');
    tbody.innerHTML = '';
    
    let history = [];
    appData.transactions.forEach(t => {
        if (t.Student_ID == studentId && t.Status !== 'Pending') {
            history.push({
                date: new Date(t.Datetime),
                dtStr: t.Datetime,
                type: 'ส่งรูปขยะ',
                detail: `สถานะ: ${t.Status === 'Approved' ? 'อนุมัติ' : 'ไม่อนุมัติ/ยกเลิก'}`,
                coinChange: t.Status === 'Approved' ? `+${t.Coins_Awarded}` : '0',
                color: t.Status === 'Approved' ? 'text-success' : 'text-secondary'
            });
        }
    });
    appData.redemptions.forEach(r => {
        if (r.Student_ID == studentId && r.Status !== 'Pending_Pickup') {
            const reward = appData.rewards.find(rw => rw.Reward_ID == r.Reward_ID);
            const rName = reward ? reward.Name : 'ของรางวัล';
            history.push({
                date: new Date(r.Datetime),
                dtStr: r.Datetime,
                type: 'แลกรางวัล',
                detail: `${rName} (สถานะ: ${r.Status === 'Completed' ? 'รับแล้ว' : 'ยกเลิก'})`,
                coinChange: r.Status === 'Completed' ? `-${r.Coins_Used}` : '0',
                color: r.Status === 'Completed' ? 'text-danger' : 'text-secondary'
            });
        }
    });

    history.sort((a, b) => b.date - a.date);
    history = history.slice(0, 20); // Last 20

    if (history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">ไม่มีประวัติ</td></tr>';
    } else {
        history.forEach(h => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${formatDate(h.dtStr)}</td>
                <td>${h.type}</td>
                <td>${h.detail}</td>
                <td class="${h.color} fw-bold">${h.coinChange}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    resultDiv.classList.remove('d-none');
}

window.cancelStudentTransaction = async function(txId, studentId) {
    if (!confirm('ต้องการยกเลิกการส่งรูปนี้หรือไม่?')) return;
    try {
        await apiPost('cancelTransaction', { Tx_ID: txId, Student_ID: studentId });
        showToast('ยกเลิกรายการสำเร็จ', 'success');
        await fetchInitialData();
    } catch (e) {}
};

window.cancelStudentRedemption = async function(redeemId, studentId) {
    if (!confirm('ต้องการยกเลิกการแลกรางวัลนี้หรือไม่? (เหรียญจะถูกคืน)')) return;
    try {
        await apiPost('cancelRedemption', { Redeem_ID: redeemId, Student_ID: studentId });
        showToast('ยกเลิกการแลกรางวัลสำเร็จ', 'success');
        await fetchInitialData();
    } catch (e) {}
};

// ==========================================
// 7. Reward Shop
// ==========================================

function setupShopPage() {
    const btn = document.getElementById('shopVerifyBtn');
    const input = document.getElementById('shopStudentId');
    if (!btn || !input) return;

    btn.addEventListener('click', () => {
        const val = input.value.trim();
        if (!val) {
            showToast('กรุณากรอกรหัสนักเรียน', 'error');
            return;
        }
        const member = appData.members.find(m => m.Student_ID == val);
        if (member) {
            currentShopStudent = member;
            document.getElementById('shopStudentInfo').classList.remove('d-none');
            document.getElementById('shopCoinBalance').textContent = member.Coins_Balance || 0;
            renderShop();
        } else {
            showToast('ไม่พบรหัสนักเรียน', 'error');
            document.getElementById('shopStudentInfo').classList.add('d-none');
            currentShopStudent = null;
        }
    });
}

function renderShop() {
    const grid = document.getElementById('rewardsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    // Sort rewards: available first, then by cost
    const sortedRewards = [...appData.rewards].sort((a, b) => {
        const aAvail = a.Stock > 0 ? 1 : 0;
        const bAvail = b.Stock > 0 ? 1 : 0;
        if (aAvail !== bAvail) return bAvail - aAvail;
        return a.Coin_Cost - b.Coin_Cost;
    });

    sortedRewards.forEach(r => {
        const isOutOfStock = parseInt(r.Stock) <= 0;
        const studentCoins = currentShopStudent ? (parseInt(currentShopStudent.Coins_Balance) || 0) : 0;
        const canAfford = studentCoins >= parseInt(r.Coin_Cost);
        
        let btnHtml = '';
        if (isOutOfStock) {
            btnHtml = `<button class="btn btn-secondary w-100" disabled>ของหมด</button>`;
        } else if (!currentShopStudent) {
            btnHtml = `<button class="btn btn-outline-primary w-100" disabled>ระบุรหัสนักเรียนก่อน</button>`;
        } else if (!canAfford) {
            btnHtml = `<button class="btn btn-outline-danger w-100" disabled>เหรียญไม่พอ</button>`;
        } else {
            btnHtml = `<button class="btn btn-primary w-100" onclick="redeemReward('${r.Reward_ID}')">แลกรางวัล</button>`;
        }

        const imgUrl = r.Image_URL || 'https://via.placeholder.com/150?text=Reward';

        const card = document.createElement('div');
        card.className = 'col-6 col-md-4 col-lg-3 mb-3';
        card.innerHTML = `
            <div class="card h-100 shadow-sm ${isOutOfStock ? 'opacity-75' : ''}">
                <img src="${imgUrl}" class="card-img-top" alt="${r.Name}" style="height: 120px; object-fit: contain; padding: 10px;">
                <div class="card-body d-flex flex-column text-center p-2">
                    <h6 class="card-title mb-1 text-truncate">${r.Name}</h6>
                    <p class="card-text small text-muted mb-2 text-truncate">${r.Description || '-'}</p>
                    <div class="mt-auto">
                        <span class="badge bg-warning text-dark mb-2 fs-6">🪙 ${r.Coin_Cost}</span>
                        ${btnHtml}
                        <div class="small text-muted mt-1">เหลือ: ${r.Stock}</div>
                    </div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

window.redeemReward = async function(rewardId) {
    if (!currentShopStudent) return;
    const reward = appData.rewards.find(r => r.Reward_ID == rewardId);
    if (!reward) return;

    if (!confirm(`ยืนยันการแลก "${reward.Name}" ใช้ ${reward.Coin_Cost} เหรียญ?`)) return;

    try {
        const result = await apiPost('redeemReward', {
            Student_ID: currentShopStudent.Student_ID,
            Reward_ID: rewardId
        });
        
        // Show success modal
        const msg = result.data.successMessage || 'แลกรางวัลสำเร็จ กรุณาติดต่อรับของรางวัล';
        document.getElementById('redeemSuccessMessage').textContent = msg;
        const modal = new bootstrap.Modal(document.getElementById('redeemSuccessModal'));
        modal.show();

        await fetchInitialData();
        
        // Update local state for UI before next render if needed
        const updatedMember = appData.members.find(m => m.Student_ID == currentShopStudent.Student_ID);
        if (updatedMember) {
            currentShopStudent = updatedMember;
            document.getElementById('shopCoinBalance').textContent = updatedMember.Coins_Balance || 0;
        }
        
    } catch (e) {}
};

// ==========================================
// 8. Leaderboard
// ==========================================

function setupLeaderboard() {
    const fGrade = document.getElementById('lbFilterGrade');
    const fRoom = document.getElementById('lbFilterRoom');
    const btn = document.getElementById('refreshLeaderboardBtn');

    if (fGrade) fGrade.addEventListener('change', renderLeaderboard);
    if (fRoom) fRoom.addEventListener('change', renderLeaderboard);
    if (btn) btn.addEventListener('click', () => fetchInitialData({ showSuccess: true }));
}

function renderLeaderboard() {
    const fGrade = document.getElementById('lbFilterGrade')?.value || '';
    const fRoom = document.getElementById('lbFilterRoom')?.value || '';
    
    // Calculate total earned
    let earnedMap = {};
    appData.transactions.forEach(t => {
        if (t.Status === 'Approved') {
            const sid = t.Student_ID;
            earnedMap[sid] = (earnedMap[sid] || 0) + (parseFloat(t.Coins_Awarded) || 0);
        }
    });

    let lbData = [];
    appData.members.forEach(m => {
        if (m.Status !== 'Active') return;
        if (fGrade && m.Grade != fGrade) return;
        if (fRoom && m.Room != fRoom) return;

        lbData.push({
            id: m.Student_ID,
            name: m.Full_Name,
            grade: m.Grade,
            room: m.Room,
            earned: earnedMap[m.Student_ID] || 0
        });
    });

    lbData.sort((a, b) => b.earned - a.earned);
    const top10 = lbData.slice(0, 10);

    const tbody = document.getElementById('leaderboardTable');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (top10.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">ไม่มีข้อมูล</td></tr>';
        return;
    }

    top10.forEach((item, index) => {
        let rankHtml = `${index + 1}`;
        if (index === 0) rankHtml = '🥇 1';
        else if (index === 1) rankHtml = '🥈 2';
        else if (index === 2) rankHtml = '🥉 3';

        const tr = document.createElement('tr');
        if (index < 3) tr.className = 'fw-bold';
        tr.innerHTML = `
            <td class="text-center">${rankHtml}</td>
            <td>${item.name}</td>
            <td class="text-center">${item.grade}/${item.room}</td>
            <td class="text-center text-warning fw-bold">${item.earned}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// 9. Admin PIN Flow
// ==========================================

function setupAdminPin() {
    const adminBtn = document.getElementById('adminNavBtn');
    const mobileBtn = document.getElementById('adminMobileBtn');
    const exitBtn = document.getElementById('exitAdminBtn');
    const verifyBtn = document.getElementById('verifyPinBtn');
    const pinInput = document.getElementById('adminPinInput');

    const requireLogin = () => {
        if (adminSessionToken) {
            navigateTo('page-admin');
        } else {
            showPinModal();
        }
    };

    if (adminBtn) adminBtn.addEventListener('click', requireLogin);
    if (mobileBtn) mobileBtn.addEventListener('click', requireLogin);
    if (exitBtn) exitBtn.addEventListener('click', () => {
        adminSessionToken = null;
        navigateTo('page-dashboard');
        showToast('ออกจากระบบแอดมินแล้ว', 'success');
    });

    if (verifyBtn) verifyBtn.addEventListener('click', verifyPin);
    if (pinInput) {
        pinInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') verifyPin();
        });
    }
}

function showPinModal() {
    document.getElementById('adminPinInput').value = '';
    document.getElementById('pinErrorMsg').classList.add('d-none');
    const modal = new bootstrap.Modal(document.getElementById('adminPinModal'));
    modal.show();
}

function hidePinModal() {
    const modalEl = document.getElementById('adminPinModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
}

async function verifyPin() {
    const pin = document.getElementById('adminPinInput').value;
    if (!pin) return;

    try {
        const result = await apiPost('verifyAdminPin', { pin: pin });
        if (result.success && result.data && result.data.token) {
            adminSessionToken = result.data.token;
            hidePinModal();
            navigateTo('page-admin');
        }
    } catch (e) {
        document.getElementById('pinErrorMsg').classList.remove('d-none');
    }
}

// ==========================================
// 10. Admin: Approve Trash Images
// ==========================================

function renderPendingApprovals() {
    const container = document.getElementById('approvalList');
    if (!container) return;
    container.innerHTML = '';

    const pending = appData.transactions.filter(t => t.Status === 'Pending');
    
    if (pending.length === 0) {
        container.innerHTML = '<div class="alert alert-info text-center">ไม่มีรูปรอตรวจ</div>';
        return;
    }

    pending.sort((a, b) => new Date(a.Datetime) - new Date(b.Datetime));

    pending.forEach(t => {
        const member = appData.members.find(m => m.Student_ID == t.Student_ID);
        const name = member ? member.Full_Name : 'ไม่ทราบชื่อ';

        const card = document.createElement('div');
        card.className = 'col-12 col-md-6 col-lg-4 mb-3';
        card.innerHTML = `
            <div class="card h-100">
                <img src="${t.Image_URL}" class="card-img-top" alt="Trash" loading="lazy" style="height: 200px; object-fit: cover;">
                <div class="card-body">
                    <h6 class="card-title">${name} (${t.Student_ID})</h6>
                    <p class="card-text small text-muted">เวลา: ${formatDate(t.Datetime)}</p>
                    
                    <div class="input-group mb-3">
                        <span class="input-group-text">ให้เหรียญ</span>
                        <input type="number" class="form-control" id="coinInput_${t.Tx_ID}" value="1" min="1" max="100">
                    </div>
                    
                    <div class="d-flex justify-content-between">
                        <button class="btn btn-success" onclick="approveTransaction('${t.Tx_ID}')">อนุมัติ</button>
                        <button class="btn btn-danger" onclick="rejectTransaction('${t.Tx_ID}')">ไม่อนุมัติ</button>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

window.approveTransaction = async function(txId) {
    const input = document.getElementById(`coinInput_${txId}`);
    const coins = input ? parseInt(input.value) : 1;
    if (isNaN(coins) || coins < 1) {
        showToast('กรุณาระบุจำนวนเหรียญให้ถูกต้อง', 'warning');
        return;
    }

    try {
        await apiPost('approveTransaction', { Tx_ID: txId, Coins_Awarded: coins }, true);
        showToast('อนุมัติสำเร็จ', 'success');
        await fetchInitialData();
    } catch (e) {}
};

window.rejectTransaction = async function(txId) {
    if (!confirm('ยืนยันการไม่อนุมัติภาพนี้?')) return;
    try {
        await apiPost('rejectTransaction', { Tx_ID: txId }, true);
        showToast('ปฏิเสธสำเร็จ', 'success');
        await fetchInitialData();
    } catch (e) {}
};

// ==========================================
// 11. Admin: Handover Rewards
// ==========================================

function renderPendingHandovers() {
    const container = document.getElementById('handoverList');
    if (!container) return;
    container.innerHTML = '';

    const pending = appData.redemptions.filter(r => r.Status === 'Pending_Pickup');
    
    if (pending.length === 0) {
        container.innerHTML = '<div class="alert alert-info text-center">ไม่มีรายการรอมอบ</div>';
        return;
    }

    pending.sort((a, b) => new Date(a.Datetime) - new Date(b.Datetime));

    pending.forEach(r => {
        const member = appData.members.find(m => m.Student_ID == r.Student_ID);
        const name = member ? member.Full_Name : 'ไม่ทราบชื่อ';
        const reward = appData.rewards.find(rw => rw.Reward_ID == r.Reward_ID);
        const rName = reward ? reward.Name : 'ไม่ทราบชื่อรางวัล';

        const card = document.createElement('div');
        card.className = 'col-12 col-md-6 mb-3';
        card.innerHTML = `
            <div class="card border-primary">
                <div class="card-body">
                    <h5 class="card-title text-primary">${rName}</h5>
                    <h6 class="card-subtitle mb-2 text-muted">ผู้แลก: ${name} (${r.Student_ID})</h6>
                    <p class="card-text mb-1">ใช้เหรียญ: ${r.Coins_Used} เหรียญ</p>
                    <p class="card-text small text-muted">เวลาแลก: ${formatDate(r.Datetime)}</p>
                    <button class="btn btn-primary mt-2" onclick="confirmHandover('${r.Redeem_ID}')">ยืนยันมอบของแล้ว</button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

window.confirmHandover = async function(redeemId) {
    if (!confirm('ยืนยันว่านักเรียนได้รับของรางวัลนี้แล้ว?')) return;
    try {
        await apiPost('confirmRedemption', { Redeem_ID: redeemId }, true);
        showToast('บันทึกการมอบสำเร็จ', 'success');
        await fetchInitialData();
    } catch (e) {}
};

// ==========================================
// 12. Admin: Manage Rewards
// ==========================================

function setupManageRewards() {
    const addBtn = document.getElementById('addRewardBtn');
    const form = document.getElementById('editRewardForm');
    
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            document.getElementById('editRewardTitle').textContent = 'เพิ่มของรางวัล';
            form.reset();
            document.getElementById('editRewardId').value = '';
            const modal = new bootstrap.Modal(document.getElementById('editRewardModal'));
            modal.show();
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('editRewardId').value;
            const payload = {
                Name: document.getElementById('editRewardName').value,
                Coin_Cost: document.getElementById('editRewardCost').value,
                Stock: document.getElementById('editRewardStock').value,
                Description: document.getElementById('editRewardDesc').value,
                Success_Message: document.getElementById('editRewardMsg').value,
                Image_URL: document.getElementById('editRewardImageUrl').value
            };

            try {
                if (id) {
                    payload.Reward_ID = id;
                    await apiPost('updateReward', payload, true);
                    showToast('แก้ไขสำเร็จ', 'success');
                } else {
                    await apiPost('addReward', payload, true);
                    showToast('เพิ่มสำเร็จ', 'success');
                }
                const modal = bootstrap.Modal.getInstance(document.getElementById('editRewardModal'));
                if (modal) modal.hide();
                await fetchInitialData();
            } catch (err) {}
        });
    }
}

function renderManageRewards() {
    const list = document.getElementById('rewardsManageList');
    if (!list) return;
    list.innerHTML = '';

    appData.rewards.forEach(r => {
        const div = document.createElement('div');
        div.className = 'list-group-item d-flex justify-content-between align-items-center';
        div.innerHTML = `
            <div class="d-flex align-items-center">
                <img src="${r.Image_URL || 'https://via.placeholder.com/50'}" alt="" style="width:50px; height:50px; object-fit:cover;" class="me-3 rounded">
                <div>
                    <h6 class="mb-0">${r.Name}</h6>
                    <small class="text-muted">ราคา: ${r.Coin_Cost} | สต๊อก: ${r.Stock}</small>
                </div>
            </div>
            <div>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="editReward('${r.Reward_ID}')"><i class="bi bi-pencil"></i> แก้ไข</button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteReward('${r.Reward_ID}')"><i class="bi bi-trash"></i></button>
            </div>
        `;
        list.appendChild(div);
    });
}

window.editReward = function(id) {
    const r = appData.rewards.find(x => x.Reward_ID == id);
    if (!r) return;
    
    document.getElementById('editRewardTitle').textContent = 'แก้ไขของรางวัล';
    document.getElementById('editRewardId').value = r.Reward_ID;
    document.getElementById('editRewardName').value = r.Name;
    document.getElementById('editRewardCost').value = r.Coin_Cost;
    document.getElementById('editRewardStock').value = r.Stock;
    document.getElementById('editRewardDesc').value = r.Description || '';
    document.getElementById('editRewardMsg').value = r.Success_Message || '';
    document.getElementById('editRewardImageUrl').value = r.Image_URL || '';

    const modal = new bootstrap.Modal(document.getElementById('editRewardModal'));
    modal.show();
};

window.deleteReward = async function(id) {
    if (!confirm('ยืนยันการลบรางวัลนี้?')) return;
    try {
        await apiPost('deleteReward', { Reward_ID: id }, true);
        showToast('ลบสำเร็จ', 'success');
        await fetchInitialData();
    } catch (e) {}
};

// ==========================================
// 13. Admin: Members
// ==========================================

function setupAdminMembers() {
    const sInp = document.getElementById('adminMemSearch');
    const gInp = document.getElementById('adminMemGrade');
    const rInp = document.getElementById('adminMemRoom');
    const proBtn = document.getElementById('promoteGradeBtn');

    if (sInp) sInp.addEventListener('input', renderAdminMembersTable);
    if (gInp) gInp.addEventListener('change', renderAdminMembersTable);
    if (rInp) rInp.addEventListener('change', renderAdminMembersTable);

    if (proBtn) {
        proBtn.addEventListener('click', async () => {
            if (!confirm('คำเตือน: การเลื่อนชั้นจะเปลี่ยน ป.1 เป็น ป.2, ม.1 เป็น ม.2, และตั้งสถานะผู้ที่เรียนจบเป็น Inactive\n\nต้องการดำเนินการต่อหรือไม่?')) return;
            try {
                await apiPost('promoteGrade', {}, true);
                showToast('เลื่อนชั้นสำเร็จ', 'success');
                await fetchInitialData();
            } catch (e) {}
        });
    }
}

function renderAdminMembersTable() {
    const tbody = document.getElementById('adminMembersTable');
    if (!tbody) return;
    tbody.innerHTML = '';

    const search = (document.getElementById('adminMemSearch')?.value || '').toLowerCase();
    const fGrade = document.getElementById('adminMemGrade')?.value || '';
    const fRoom = document.getElementById('adminMemRoom')?.value || '';

    let filtered = appData.members.filter(m => {
        if (search && !m.Student_ID.toLowerCase().includes(search) && !m.Full_Name.toLowerCase().includes(search)) return false;
        if (fGrade && m.Grade != fGrade) return false;
        if (fRoom && m.Room != fRoom) return false;
        return true;
    });

    filtered.forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${m.Student_ID}</td>
            <td>${m.Full_Name}</td>
            <td>${m.Grade}/${m.Room}</td>
            <td class="text-end">${m.Coins_Balance || 0}</td>
            <td>
                <span class="badge bg-${m.Status === 'Active' ? 'success' : 'secondary'}">${m.Status}</span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// 14. Initialization
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    // Setup Navigation
    document.querySelectorAll('.nav-link[data-target]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(link.getAttribute('data-target'));
        });
    });

    document.querySelectorAll('.admin-tab[data-target]').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            openAdminSection(tab.getAttribute('data-target'));
        });
    });

    // Mobile menu toggle
    const mBtn = document.getElementById('mobileMenuBtn');
    const mMenu = document.getElementById('mobileMenu');
    if (mBtn && mMenu) {
        mBtn.addEventListener('click', () => {
            mMenu.classList.toggle('d-none');
        });
    }

    // Initialize subsystems
    setupSubmitTrash();
    setupStatusPage();
    setupShopPage();
    setupLeaderboard();
    setupAdminPin();
    setupManageRewards();
    setupAdminMembers();

    // Try to load cached data first for immediate display
    const cachedData = getCachedInitialData();
    if (cachedData) {
        appData = cachedData;
        updateRoomDropdowns();
        renderDashboard();
        renderLeaderboard();
    }

    // Fetch fresh data in background
    fetchInitialData();
});
