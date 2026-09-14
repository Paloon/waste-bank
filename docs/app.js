const API_URL = 'https://script.google.com/macros/s/AKfycbxNhfE6sPUcxCW-eMLyMPnvH6cXfTeEVa5XFJN0QbXgvODky8KAQgUeHi2WDm9TjQB-8Q/exec';

let appData = {
    members: [],
    transactions: [],
    rewards: [],
    redemptions: []
};

let adminPin = sessionStorage.getItem('adminPin') || null;
let verifiedShopStudent = null;
let currentStatusStudentId = null;

// UI Helpers
function showLoading() {
    const loader = document.getElementById('loadingOverlay');
    if (loader) loader.classList.remove('hidden');
}

function hideLoading() {
    const loader = document.getElementById('loadingOverlay');
    if (loader) loader.classList.add('hidden');
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white font-medium transition-all duration-300 z-50 ${type === 'success' ? 'bg-green-500' : 'bg-red-500'}`;
    toast.innerText = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// API Helper
async function apiPost(action, payload, requiresAdmin = false) {
    showLoading();
    try {
        const bodyData = { action, payload };
        if (requiresAdmin) {
            bodyData.pin = adminPin;
        } else {
            bodyData.pin = adminPin; // pass pin if exists
        }
        
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            },
            body: JSON.stringify(bodyData)
        });
        
        const data = await response.json();
        hideLoading();
        
        if (!data.success) {
            showToast(data.error || 'เกิดข้อผิดพลาด', 'error');
        }
        return data;
    } catch (error) {
        hideLoading();
        console.error('API Error:', error);
        showToast('การเชื่อมต่อเครือข่ายขัดข้อง', 'error');
        return { success: false, error: error.message };
    }
}

// Image Compression
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX = 800;
                let w = img.width, h = img.height;
                if (w > h) { if (w > MAX) { h *= MAX/w; w = MAX; } }
                else { if (h > MAX) { w *= MAX/h; h = MAX; } }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// SPA Navigation
function navigateTo(viewId) {
    document.querySelectorAll('.spa-view').forEach(view => {
        view.classList.add('hidden');
    });
    
    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.remove('hidden');
    }

    // Update active nav links if any exist
    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.dataset.target === viewId) {
            link.classList.add('active-nav-class'); // add your active class
        } else {
            link.classList.remove('active-nav-class');
        }
    });

    if (viewId === 'view-home') renderHome();
    else if (viewId === 'view-submit') {
        const form = document.getElementById('submitTrashForm');
        if (form) form.reset();
        const preview = document.getElementById('submitImagePreview');
        if (preview) preview.innerHTML = '';
        const nameBadge = document.getElementById('submitStudentName');
        if (nameBadge) nameBadge.innerHTML = '';
    }
    else if (viewId === 'view-status' && currentStatusStudentId) {
        searchStudentStatus(currentStatusStudentId);
    }
    else if (viewId === 'view-shop') renderShop();
    else if (viewId === 'view-leaderboard') renderLeaderboard();
    else if (viewId === 'view-admin') {
        if (!adminPin) {
            const adminModal = document.getElementById('adminPinModal');
            if (adminModal) adminModal.classList.remove('hidden');
        } else {
            renderAdminApprove(); // default tab
        }
    }
}
window.navigateTo = navigateTo;

// Data Fetching
async function fetchInitialData() {
    const res = await apiPost('getInitialData', {});
    if (res.success) {
        appData = res.data;
        renderHome();
        updateRoomDropdowns();
    }
}

function updateRoomDropdowns() {
    // Populate any necessary room dropdowns from appData
}

// View Logic & Handlers
function renderHome() {
    const totalMembers = appData.members.length;
    let totalCoins = 0;
    appData.members.forEach(m => {
        totalCoins += (m.Total_Coins_Earned || 0);
    });
    const totalTrash = appData.transactions.filter(t => t.Status === 'Approved').length; // or sum weight if field exists
    
    const statMembers = document.getElementById('statMembers');
    const statCoins = document.getElementById('statCoins');
    const statTrash = document.getElementById('statTrash');
    
    if (statMembers) statMembers.innerText = totalMembers;
    if (statCoins) statCoins.innerText = totalCoins;
    if (statTrash) statTrash.innerText = totalTrash;
}

window.registerStudent = async function(event) {
    event.preventDefault();
    const form = event.target;
    const formData = {
        Student_ID: form.Student_ID.value,
        Name: form.Name.value,
        Grade: form.Grade.value,
        Room: form.Room.value
    };
    const res = await apiPost('registerStudent', formData);
    if (res.success) {
        showToast('สมัครสมาชิกสำเร็จ', 'success');
        document.getElementById('registerModal')?.classList.add('hidden');
        fetchInitialData();
    }
};

let debounceTimer;
window.handleStudentIdInput = function(e) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        const studentId = e.target.value.trim();
        const badge = document.getElementById('submitStudentName');
        if (!studentId) {
            badge.innerText = '';
            badge.className = '';
            return;
        }
        const member = appData.members.find(m => m.Student_ID == studentId);
        if (member) {
            badge.innerText = `พบข้อมูล: ${member.Name}`;
            badge.className = 'text-green-600 font-bold mt-2 block';
        } else {
            badge.innerText = 'ไม่พบรหัสนักเรียน (กดสมัครสมาชิก)';
            badge.className = 'text-red-600 font-bold mt-2 block';
        }
    }, 500);
};

window.handleImageInput = async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const base64 = await compressImage(file);
        const preview = document.getElementById('submitImagePreview');
        preview.innerHTML = `<img src="${base64}" class="w-full h-auto rounded shadow mt-4 max-h-64 object-cover" />`;
        preview.dataset.base64 = base64;
    } catch (err) {
        showToast('ไม่สามารถประมวลผลรูปภาพได้', 'error');
    }
};

window.submitTrash = async function(event) {
    event.preventDefault();
    const form = event.target;
    const Student_ID = form.submitStudentId.value.trim();
    const preview = document.getElementById('submitImagePreview');
    const imageBase64 = preview.dataset.base64;
    
    if (!Student_ID || !imageBase64) {
        showToast('กรุณากรอกรหัสและอัปโหลดรูปภาพ', 'error');
        return;
    }
    
    const res = await apiPost('submitTrash', { Student_ID, imageBase64 });
    if (res.success) {
        showToast('ส่งรูปขยะเรียบร้อย! รอตรวจสอบ', 'success');
        form.reset();
        preview.innerHTML = '';
        delete preview.dataset.base64;
        document.getElementById('submitStudentName').innerText = '';
        setTimeout(() => navigateTo('view-home'), 3000);
    }
};

window.searchStudentStatus = async function(studentId = null) {
    if (!studentId) {
        const input = document.getElementById('searchStudentId');
        studentId = input ? input.value.trim() : null;
    }
    if (!studentId) return;
    currentStatusStudentId = studentId;
    
    const res = await apiPost('getStudentStatus', { Student_ID: studentId });
    if (res.success) {
        const data = res.data;
        const container = document.getElementById('statusResultContainer');
        if (container) {
            container.innerHTML = `
                <div class="bg-white p-4 rounded shadow mb-4">
                    <h3 class="text-xl font-bold">${data.member.Name}</h3>
                    <p>ชั้น/ห้อง: ${data.member.Grade}/${data.member.Room}</p>
                    <p>เหรียญสะสม: <span class="font-bold text-yellow-500">${data.member.Coins_Balance}</span></p>
                    <button onclick="openEditProfile()" class="mt-2 bg-blue-500 text-white px-4 py-2 rounded">แก้ไขข้อมูล</button>
                </div>
            `;
            // Add Pending Trash, Pending Rewards, History logic here
            // using data.transactions and data.redemptions
        }
    } else {
        currentStatusStudentId = null;
    }
};

window.openEditProfile = function() {
    const modal = document.getElementById('editProfileModal');
    if (modal && currentStatusStudentId) {
        const member = appData.members.find(m => m.Student_ID == currentStatusStudentId);
        if (member) {
            const form = document.getElementById('editProfileForm');
            if (form) {
                form.Student_ID.value = member.Student_ID;
                form.Name.value = member.Name;
                form.Grade.value = member.Grade;
                form.Room.value = member.Room;
            }
            modal.classList.remove('hidden');
        }
    }
};

window.updateStudentProfile = async function(event) {
    event.preventDefault();
    const form = event.target;
    const formData = {
        Student_ID: form.Student_ID.value,
        Name: form.Name.value,
        Grade: form.Grade.value,
        Room: form.Room.value
    };
    const res = await apiPost('updateStudentProfile', formData);
    if (res.success) {
        showToast('อัปเดตข้อมูลสำเร็จ', 'success');
        document.getElementById('editProfileModal')?.classList.add('hidden');
        await fetchInitialData();
        if (currentStatusStudentId) searchStudentStatus(currentStatusStudentId);
    }
};

function renderShop() {
    const container = document.getElementById('rewardsContainer');
    if (!container) return;
    
    container.innerHTML = appData.rewards.map(r => `
        <div class="bg-white p-4 rounded shadow">
            <h4 class="font-bold text-lg">${r.Reward_Name}</h4>
            <p>ใช้เหรียญ: ${r.Coins_Required}</p>
            <p>คงเหลือ: ${r.Stock}</p>
            <button onclick="redeemReward('${r.Reward_ID}', '${r.Reward_Name}', ${r.Coins_Required})" class="mt-2 bg-green-500 text-white px-4 py-2 rounded w-full">แลกของรางวัล</button>
        </div>
    `).join('');
}

window.verifyShopStudent = function() {
    const studentId = document.getElementById('shopStudentId').value.trim();
    if (!studentId) return;
    const member = appData.members.find(m => m.Student_ID == studentId);
    const info = document.getElementById('shopStudentInfo');
    if (member) {
        verifiedShopStudent = member;
        info.innerHTML = `<p class="text-green-600 font-bold">รหัสผ่าน: ${member.Name} (เหรียญ: ${member.Coins_Balance})</p>`;
    } else {
        verifiedShopStudent = null;
        info.innerHTML = `<p class="text-red-600 font-bold">ไม่พบข้อมูลนักเรียน</p>`;
    }
};

window.redeemReward = async function(rewardId, rewardName, coins) {
    if (!verifiedShopStudent) {
        showToast('กรุณายืนยันรหัสนักเรียนก่อน', 'error');
        return;
    }
    if (verifiedShopStudent.Coins_Balance < coins) {
        showToast('เหรียญไม่พอ', 'error');
        return;
    }
    if (confirm(`คุณต้องการแลก ${rewardName} ใช่หรือไม่?`)) {
        const res = await apiPost('redeemReward', { Student_ID: verifiedShopStudent.Student_ID, Reward_ID: rewardId });
        if (res.success) {
            const modal = document.getElementById('redeemSuccessModal');
            if (modal) {
                document.getElementById('redeemSuccessMessage').innerText = res.data.successMessage || 'แลกของรางวัลสำเร็จ';
                modal.classList.remove('hidden');
            }
            await fetchInitialData();
            verifyShopStudent(); // update coin balance in UI
        }
    }
};

function renderLeaderboard() {
    const container = document.getElementById('leaderboardContainer');
    if (!container) return;
    
    const search = document.getElementById('lbSearch')?.value.toLowerCase() || '';
    const grade = document.getElementById('lbGradeFilter')?.value || '';
    const room = document.getElementById('lbRoomFilter')?.value || '';
    
    let filtered = appData.members.filter(m => {
        if (search && !m.Name.toLowerCase().includes(search) && !m.Student_ID.toString().includes(search)) return false;
        if (grade && m.Grade !== grade) return false;
        if (room && m.Room !== room) return false;
        return true;
    });
    
    filtered.sort((a, b) => (b.Total_Coins_Earned || 0) - (a.Total_Coins_Earned || 0));
    
    container.innerHTML = filtered.map((m, i) => `
        <div class="flex justify-between items-center bg-white p-3 rounded shadow mb-2 ${i < 3 ? 'border-l-4 border-yellow-500' : ''}">
            <div class="flex items-center gap-3">
                <span class="font-bold text-lg w-6">${i+1}</span>
                <div>
                    <p class="font-bold">${m.Name}</p>
                    <p class="text-sm text-gray-500">${m.Grade}/${m.Room}</p>
                </div>
            </div>
            <div class="font-bold text-yellow-500">${m.Total_Coins_Earned || 0} เหรียญ</div>
        </div>
    `).join('');
}

window.filterLeaderboard = renderLeaderboard;

// Admin Logic
window.verifyAdminPin = async function() {
    const pin = document.getElementById('adminPinInput')?.value;
    if (!pin) return;
    const res = await apiPost('adminLogin', { pin });
    if (res.success) {
        adminPin = pin;
        sessionStorage.setItem('adminPin', pin);
        document.getElementById('adminPinModal')?.classList.add('hidden');
        navigateTo('view-admin');
        renderAdminApprove();
    } else {
        showToast('รหัสผ่านไม่ถูกต้อง', 'error');
    }
};

window.exitAdmin = function() {
    adminPin = null;
    sessionStorage.removeItem('adminPin');
    navigateTo('view-home');
};

function renderAdminApprove() {
    const container = document.getElementById('adminApproveContainer');
    if (!container) return;
    const pending = appData.transactions.filter(t => t.Status === 'Pending');
    container.innerHTML = pending.map(t => `
        <div class="bg-white p-4 rounded shadow mb-4">
            <p><strong>นักเรียน:</strong> ${t.Student_ID}</p>
            <img src="${t.Image_URL}" class="w-full h-auto max-h-48 object-cover mt-2 mb-2 rounded">
            <input type="number" id="coin_${t.Transaction_ID}" placeholder="จำนวนเหรียญ" class="w-full p-2 border rounded mb-2">
            <div class="flex gap-2">
                <button onclick="approveTrash('${t.Transaction_ID}')" class="bg-green-500 text-white px-4 py-2 rounded flex-1">อนุมัติ</button>
                <button onclick="rejectTrash('${t.Transaction_ID}')" class="bg-red-500 text-white px-4 py-2 rounded flex-1">ปฏิเสธ</button>
            </div>
        </div>
    `).join('') || '<p>ไม่มีรายการรอตรวจสอบ</p>';
}
window.renderAdminApprove = renderAdminApprove;

window.approveTrash = async function(txId) {
    const coinInput = document.getElementById(`coin_${txId}`);
    const coins = coinInput ? parseInt(coinInput.value) : 0;
    if (!coins || coins <= 0) {
        showToast('กรุณาระบุจำนวนเหรียญที่มากกว่า 0', 'error');
        return;
    }
    const res = await apiPost('approveTrash', { Transaction_ID: txId, Coins: coins }, true);
    if (res.success) {
        showToast('อนุมัติสำเร็จ', 'success');
        await fetchInitialData();
        renderAdminApprove();
    }
};

window.rejectTrash = async function(txId) {
    if (confirm('คุณต้องการปฏิเสธรายการนี้ใช่หรือไม่?')) {
        const res = await apiPost('rejectTrash', { Transaction_ID: txId }, true);
        if (res.success) {
            showToast('ปฏิเสธรายการสำเร็จ', 'success');
            await fetchInitialData();
            renderAdminApprove();
        }
    }
};

// Start
document.addEventListener('DOMContentLoaded', () => {
    fetchInitialData();
    
    // Attach event listeners for inputs
    const submitId = document.getElementById('submitStudentId');
    if(submitId) submitId.addEventListener('input', handleStudentIdInput);
    
    const imgInput = document.getElementById('submitImageInput');
    if(imgInput) imgInput.addEventListener('change', handleImageInput);
});
