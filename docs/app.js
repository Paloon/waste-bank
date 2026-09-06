const API_URL = 'https://script.google.com/macros/s/AKfycbxNhfE6sPUcxCW-eMLyMPnvH6cXfTeEVa5XFJN0QbXgvODky8KAQgUeHi2WDm9TjQB-8Q/exec';

// ==========================================
// Application State (Replaces Mock Data)
// ==========================================
let appData = {
    config: {},
    members: [],
    transactions: [],
    payouts: []
};

const LOCAL_DATA_CACHE_KEY = 'waste-bank-initial-data-v1';
const LOCAL_DATA_CACHE_TTL_MS = 2 * 60 * 1000;

function getCachedInitialData() {
    try {
        const cached = JSON.parse(localStorage.getItem(LOCAL_DATA_CACHE_KEY));
        if (cached && cached.data && Date.now() - cached.savedAt < LOCAL_DATA_CACHE_TTL_MS) return cached.data;
    } catch (error) {}
    return null;
}

function cacheInitialData(data) {
    try {
        localStorage.setItem(LOCAL_DATA_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
    } catch (error) {}
}

// ==========================================
// Helper Functions
// ==========================================
const formatMoney = (amount) => Number(amount).toFixed(2);
const formatWeight = (weight) => Number(weight).toFixed(2);
const formatDate = (isoString) => {
    if(!isoString) return '-';
    const d = new Date(isoString);
    return d.toLocaleDateString('th-TH') + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
};

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');

    let bgColor = 'bg-blue-600';
    let icon = 'fa-circle-info';
    
    if (type === 'success') {
        bgColor = 'bg-green-600';
        icon = 'fa-circle-check';
    } else if (type === 'error') {
        bgColor = 'bg-red-600';
        icon = 'fa-circle-exclamation';
    } else if (type === 'loading') {
        bgColor = 'bg-gray-700';
        icon = 'fa-spinner fa-spin';
    }

    toast.className = `${bgColor} text-white px-4 py-3 rounded-lg shadow-xl transform transition-all duration-300 translate-x-full opacity-0 pointer-events-auto flex items-center border border-white/20`;
    toast.innerHTML = `<i class="fa-solid ${icon} text-xl mr-3"></i> <span class="font-medium">${message}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.remove('translate-x-full', 'opacity-0');
    }, 10);

    if (type !== 'loading') {
        setTimeout(() => {
            toast.classList.add('translate-x-full', 'opacity-0');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    
    return toast; // return element so we can remove it manually (for loading state)
}

function getStudentBalanceData(studentId) {
    const earned = appData.transactions
        .filter(tx => tx.Student_ID.toString() === studentId.toString())
        .reduce((sum, tx) => sum + parseFloat(tx.Amount || 0), 0);
    
    const paid = appData.payouts
        .filter(po => po.Student_ID.toString() === studentId.toString())
        .reduce((sum, po) => sum + parseFloat(po.Amount_Paid || 0), 0);
        
    return {
        earned,
        paid,
        balance: earned - paid
    };
}

// ==========================================
// API Communication
// ==========================================

// โหลดข้อมูลเริ่มต้น
async function fetchInitialData({ showLoading = true, showSuccess = true } = {}) {
    const loadingToast = showLoading ? showToast('กำลังเชื่อมต่อฐานข้อมูล...', 'loading') : null;
    try {
        const response = await fetch(`${API_URL}?action=getInitialData`);
        const result = await response.json();
        
        if (loadingToast) loadingToast.remove();
        
        if (result.success) {
            appData = result.data;
            cacheInitialData(appData);
            
            // Format dates from string
            appData.transactions.forEach(tx => {
               if(!tx.Datetime || tx.Datetime === "") tx.Datetime = new Date().toISOString(); 
            });
            appData.payouts.forEach(po => {
               if(!po.Datetime || po.Datetime === "") po.Datetime = new Date().toISOString();
            });

            renderDashboard();
            renderLeaderboard();
            if (showSuccess) showToast('อัปเดตข้อมูลล่าสุดเรียบร้อย', 'success');
        } else {
            showToast('เซิร์ฟเวอร์: ' + (result.message || 'เกิดข้อผิดพลาด'), 'error');
            console.error("Server Error:", result);
        }
    } catch (err) {
        if (loadingToast) loadingToast.remove();
        if (showLoading) showToast('การเชื่อมต่อล้มเหลว', 'error');
        console.error(err);
    }
}

// ส่ง Request แบบ POST ทั่วไป
let adminSessionToken = null;

async function apiPost(action, payload, requiresAdmin = false) {
    const loadingToast = showToast('กำลังประมวลผล...', 'loading');
    try {
        // ใช้ text/plain เพื่อเลี่ยง Preflight CORS Request (ข้อจำกัดของ Google Apps Script)
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            },
            body: JSON.stringify({
                action,
                payload,
                adminToken: requiresAdmin ? adminSessionToken : undefined
            })
        });
        
        const result = await response.json();
        loadingToast.remove();
        return result;
    } catch (err) {
        loadingToast.remove();
        showToast('การเชื่อมต่อขัดข้อง กรุณาลองใหม่', 'error');
        console.error(err);
        return { success: false, message: 'Connection Error' };
    }
}

// โหลดข้อมูลตอนเปิดหน้าเว็บ
document.addEventListener('DOMContentLoaded', () => {
    const cachedData = getCachedInitialData();
    if (cachedData) {
        appData = cachedData;
        renderDashboard();
        renderLeaderboard();
    }
    fetchInitialData({ showLoading: !cachedData, showSuccess: !cachedData });
});

// ==========================================
// SPA Navigation & Mobile Menu
// ==========================================
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileMenu = document.getElementById('mobileMenu');
const navLinks = document.querySelectorAll('.nav-link');
const pageSections = document.querySelectorAll('.page-section');

mobileMenuBtn.addEventListener('click', () => {
    mobileMenu.classList.toggle('hidden');
    mobileMenuBtn.setAttribute('aria-expanded', (!mobileMenu.classList.contains('hidden')).toString());
});

function navigateTo(targetId) {
    pageSections.forEach(section => {
        section.classList.add('hidden');
        section.classList.remove('block');
    });
    
    const targetPage = document.getElementById(targetId);
    if(targetPage) {
        targetPage.classList.remove('hidden');
        targetPage.classList.add('block');
    }
    
    navLinks.forEach(link => {
        if(link.getAttribute('data-target') === targetId) {
            link.classList.add('active-nav', 'bg-green-700');
        } else {
            link.classList.remove('active-nav', 'bg-green-700');
        }
    });
    
    mobileMenu.classList.add('hidden');
    mobileMenuBtn.setAttribute('aria-expanded', 'false');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (targetId === 'page-dashboard') renderDashboard();
    if (targetId === 'page-leaderboard') renderLeaderboard();
}

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        const targetId = e.currentTarget.getAttribute('data-target');
        navigateTo(targetId);
    });
});

navigateTo('page-dashboard');


// ==========================================
// 1. Dashboard Logic
// ==========================================
function renderDashboard() {
    const filter = document.getElementById('dateFilter').value;
    const customDateRange = document.getElementById('customDateRange');
    
    if (filter === 'custom') {
        customDateRange.classList.remove('hidden');
    } else {
        customDateRange.classList.add('hidden');
    }

    let startDate, endDate;
    const now = new Date();
    
    switch (filter) {
        case 'today':
            startDate = new Date(now.setHours(0,0,0,0));
            endDate = new Date(now.setHours(23,59,59,999));
            break;
        case 'this_week':
            const firstDay = new Date(now.setDate(now.getDate() - now.getDay()));
            startDate = new Date(firstDay.setHours(0,0,0,0));
            endDate = new Date();
            break;
        case 'this_month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            break;
        case 'three_months':
            startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
            endDate = new Date();
            break;
        case 'this_year':
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
            break;
        case 'all':
            startDate = new Date(2000, 0, 1);
            endDate = new Date(2100, 0, 1);
            break;
        case 'custom':
            const startInput = document.getElementById('startDate').value;
            const endInput = document.getElementById('endDate').value;
            if (startInput && endInput) {
                startDate = new Date(startInput + 'T00:00:00');
                endDate = new Date(endInput + 'T23:59:59');
            } else {
                startDate = new Date(2000, 0, 1);
                endDate = new Date(2100, 0, 1);
            }
            break;
    }

    let totalBottle = 0;
    let totalCan = 0;
    let totalMoney = 0;
    let totalPayout = 0;

    appData.transactions.forEach(tx => {
        const txDate = new Date(tx.Datetime);
        if (txDate >= startDate && txDate <= endDate) {
            if (tx.Waste_Type === 'ขวด') totalBottle += parseFloat(tx.Weight_kg || 0);
            if (tx.Waste_Type === 'กระป๋อง') totalCan += parseFloat(tx.Weight_kg || 0);
            totalMoney += parseFloat(tx.Amount || 0);
        }
    });

    appData.payouts.forEach(po => {
        const poDate = new Date(po.Datetime);
        if (poDate >= startDate && poDate <= endDate) {
            totalPayout += parseFloat(po.Amount_Paid || 0);
        }
    });

    const netBalance = totalMoney - totalPayout;

    document.getElementById('totalBottleWeight').innerText = formatWeight(totalBottle);
    document.getElementById('totalCanWeight').innerText = formatWeight(totalCan);
    document.getElementById('totalMoney').innerText = formatMoney(totalMoney);
    document.getElementById('totalPayout').innerText = formatMoney(totalPayout);
    document.getElementById('netBalance').innerText = formatMoney(netBalance);
    document.getElementById('bottlePriceHint').innerText = `ขวดพลาสติก ${formatMoney(appData.config.price_bottle || 0)} บาท/กก.`;
    document.getElementById('canPriceHint').innerText = `กระป๋อง ${formatMoney(appData.config.price_can || 0)} บาท/กก.`;
}

document.getElementById('dateFilter').addEventListener('change', renderDashboard);
document.getElementById('applyCustomDateBtn').addEventListener('click', renderDashboard);


// ==========================================
// 2. Register Logic (API Connected)
// ==========================================
const regForm = document.getElementById('registerForm');
const regStudentId = document.getElementById('regStudentId');
const regErrorId = document.getElementById('regErrorId');

regStudentId.addEventListener('input', () => {
    const id = regStudentId.value.trim();
    if (appData.members.some(m => m.Student_ID.toString() === id)) {
        regErrorId.classList.remove('hidden');
        regStudentId.classList.add('border-red-500', 'focus:ring-red-500');
    } else {
        regErrorId.classList.add('hidden');
        regStudentId.classList.remove('border-red-500', 'focus:ring-red-500');
    }
});

regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = regStudentId.value.trim();
    
    if (appData.members.some(m => m.Student_ID.toString() === id)) {
        showToast('รหัสนักเรียนนี้ซ้ำกับในระบบ', 'error');
        regStudentId.focus();
        return;
    }

    const payload = {
        Student_ID: id,
        Full_Name: document.getElementById('regFullName').value.trim(),
        Grade: document.getElementById('regGrade').value,
        Room: document.getElementById('regRoom').value || '',
        Seat_No: document.getElementById('regSeat').value || ''
    };

    const res = await apiPost('registerMember', payload);
    
    if (res.success) {
        showToast(`✅ ลงทะเบียนสำเร็จ! ยินดีต้อนรับ ${payload.Full_Name}`);
        
        // Update local state without refreshing everything
        payload.Status = 'Active';
        appData.members.push(payload);
        
        regForm.reset();
        
        navigateTo('page-lookup');
        document.getElementById('searchStudentId').value = id;
        performSearch();
    } else {
        showToast('เซิร์ฟเวอร์: ' + res.message, 'error');
    }
});


// ==========================================
// 2.5 Sell Waste (Self Service) (API Connected)
// ==========================================
const selfSellForm = document.getElementById('selfSellForm');
const selfStudentId = document.getElementById('selfStudentId');
const selfStudentNameBox = document.getElementById('selfStudentNameBox');
const selfErrorId = document.getElementById('selfErrorId');
const selfRegisterCta = document.getElementById('selfRegisterCta');
const selfWasteType = document.getElementById('selfWasteType');
const selfWeight = document.getElementById('selfWeight');
const selfCalculatedAmount = document.getElementById('selfCalculatedAmount');
const selfSubmitBtn = document.getElementById('selfSubmitBtn');

let isSelfStudentValid = false;
let isSelfSubmitting = false;

selfStudentId.addEventListener('input', (e) => {
    const id = e.target.value.trim();
    const member = appData.members.find(m => m.Student_ID.toString() === id);
    if (member) {
        selfStudentNameBox.innerHTML = `<i class="fa-solid fa-user-check mr-1"></i> พบชื่อผู้ฝาก: <strong>${member.Full_Name}</strong> (${member.Grade})`;
        selfStudentNameBox.classList.remove('hidden');
        selfErrorId.classList.add('hidden');
        selfRegisterCta.classList.add('hidden');
        selfStudentId.classList.remove('border-red-500', 'focus:ring-red-500');
        selfStudentId.classList.add('border-green-500', 'focus:ring-green-500');
        isSelfStudentValid = true;
        
        if(parseFloat(selfWeight.value) > 0) {
            enableSelfSubmitBtn();
        }
    } else {
        selfStudentNameBox.classList.add('hidden');
        if (id.length > 0) {
            selfErrorId.classList.remove('hidden');
            selfRegisterCta.classList.remove('hidden');
            selfStudentId.classList.add('border-red-500', 'focus:ring-red-500');
            selfStudentId.classList.remove('border-green-500', 'focus:ring-green-500');
        } else {
            selfErrorId.classList.add('hidden');
            selfRegisterCta.classList.add('hidden');
            selfStudentId.classList.remove('border-red-500', 'focus:ring-red-500', 'border-green-500', 'focus:ring-green-500');
        }
        isSelfStudentValid = false;
        disableSelfSubmitBtn();
    }
});

function calculateSelfAmount() {
    const type = selfWasteType.value;
    const weight = parseFloat(selfWeight.value) || 0;
    const price = type === 'ขวด' ? parseFloat(appData.config.price_bottle || 0) : parseFloat(appData.config.price_can || 0);
    const amount = weight * price;
    selfCalculatedAmount.innerHTML = `${formatMoney(amount)} <span class="text-xl font-normal text-gray-500">฿</span>`;
    document.getElementById('selfUnitPriceHint').innerText = `เรทราคาปัจจุบัน: ${formatMoney(price)} บาท/กก.`;
    
    if(weight > 0 && isSelfStudentValid) {
        enableSelfSubmitBtn();
    } else {
        disableSelfSubmitBtn();
    }
}

function enableSelfSubmitBtn() {
    if (isSelfSubmitting) return;
    selfSubmitBtn.disabled = false;
    selfSubmitBtn.classList.remove('bg-gray-400', 'cursor-not-allowed');
    selfSubmitBtn.classList.add('bg-green-600', 'hover:bg-green-700');
}

function disableSelfSubmitBtn() {
    selfSubmitBtn.disabled = true;
    selfSubmitBtn.classList.add('bg-gray-400', 'cursor-not-allowed');
    selfSubmitBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
}

selfWasteType.addEventListener('change', calculateSelfAmount);
selfWeight.addEventListener('input', calculateSelfAmount);

selfSellForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!isSelfStudentValid || isSelfSubmitting) return;

    const id = selfStudentId.value.trim();
    const member = appData.members.find(m => m.Student_ID.toString() === id);
    const type = selfWasteType.value;
    const weight = parseFloat(selfWeight.value);
    const price = type === 'ขวด' ? parseFloat(appData.config.price_bottle || 0) : parseFloat(appData.config.price_can || 0);
    const amount = weight * price;

    const payload = {
        Student_ID: id,
        Waste_Type: type,
        Weight_kg: weight,
        Unit_Price: price,
        Amount: amount
    };

    isSelfSubmitting = true;
    selfSubmitBtn.disabled = true;
    selfSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> กำลังบันทึก...';
    const res = await apiPost('addTransaction', payload);
    isSelfSubmitting = false;
    selfSubmitBtn.innerHTML = '<i class="fa-solid fa-check-circle mr-2"></i> ยืนยันการฝากขยะ';

    if (res.success) {
        const confirmedAmount = Number(res.data.Amount);
        const confirmedPrice = Number(res.data.Unit_Price);
        
        // Update local state
        appData.transactions.push({
            Tx_ID: res.data.Tx_ID,
            Datetime: res.data.Datetime,
            ...payload,
            Unit_Price: confirmedPrice,
            Amount: confirmedAmount
        });

        // Reset Form
        selfSellForm.reset();
        selfStudentNameBox.classList.add('hidden');
        selfStudentId.classList.remove('border-green-500', 'focus:ring-green-500');
        selfCalculatedAmount.innerHTML = `0.00 <span class="text-xl font-normal text-gray-500">฿</span>`;
        isSelfStudentValid = false;
        disableSelfSubmitBtn();
        showTransactionSuccess(member, type, weight, confirmedAmount, id);
    } else {
        showToast(res.message, 'error');
        calculateSelfAmount();
    }
});

function showTransactionSuccess(member, type, weight, amount, studentId) {
    const balance = getStudentBalanceData(studentId).balance;
    document.getElementById('successTransactionDetail').innerText = `${member.Full_Name} • ${type} ${formatWeight(weight)} กก.`;
    document.getElementById('successTransactionAmount').innerText = `+${formatMoney(amount)} ฿`;
    document.getElementById('successTransactionBalance').innerText = `ยอดเงินคงเหลือของคุณ: ${formatMoney(balance)} ฿`;

    const modal = document.getElementById('transactionSuccessModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    document.getElementById('successDepositMoreBtn').onclick = () => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        navigateTo('page-sell');
        selfStudentId.focus();
    };
    document.getElementById('successViewHistoryBtn').onclick = () => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        navigateTo('page-lookup');
        document.getElementById('searchStudentId').value = studentId;
        performSearch();
    };
}


// ==========================================
// 3. Member Lookup Logic
// ==========================================
const searchForm = document.getElementById('searchStudentForm');

searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    performSearch();
});

function performSearch() {
    const id = document.getElementById('searchStudentId').value.trim();
    if (!id) return;

    const member = appData.members.find(m => m.Student_ID.toString() === id);
    const resultDiv = document.getElementById('studentInfoResult');
    const notFoundDiv = document.getElementById('studentNotFound');

    if (member) {
        notFoundDiv.classList.add('hidden');
        resultDiv.classList.remove('hidden');

        document.getElementById('studentName').innerText = member.Full_Name;
        document.getElementById('studentIdDisplay').innerText = member.Student_ID;
        document.getElementById('studentGradeDisplay').innerText = member.Grade;
        document.getElementById('studentRoomDisplay').innerText = member.Room ? member.Room : '-';
        document.getElementById('studentSeatDisplay').innerText = member.Seat_No ? member.Seat_No : '-';
        
        const badge = document.getElementById('studentStatusBadge');
        badge.innerText = member.Status;
        if (member.Status === 'Active') {
            badge.className = 'inline-block px-3 py-1 rounded-full text-sm font-bold bg-green-100 text-green-700';
        } else if (member.Status === 'Graduated') {
            badge.className = 'inline-block px-3 py-1 rounded-full text-sm font-bold bg-purple-100 text-purple-700';
        } else {
            badge.className = 'inline-block px-3 py-1 rounded-full text-sm font-bold bg-orange-100 text-orange-700';
        }

        const balData = getStudentBalanceData(id);
        document.getElementById('studentTotalEarned').innerHTML = `${formatMoney(balData.earned)} <span class="text-base text-gray-500 font-normal">฿</span>`;
        document.getElementById('studentTotalPaid').innerHTML = `${formatMoney(balData.paid)} <span class="text-base text-gray-500 font-normal">฿</span>`;
        document.getElementById('studentBalance').innerHTML = `${formatMoney(balData.balance)} <span class="text-base text-green-700 font-normal">฿</span>`;

        const historyTbody = document.getElementById('studentHistoryTable');
        const historyCards = document.getElementById('studentHistoryCards');
        const allHistory = [
            ...appData.transactions.filter(tx => tx.Student_ID.toString() === id).map(tx => ({ type: 'earn', date: tx.Datetime, item: `ฝากขยะ (${tx.Waste_Type}) ${tx.Weight_kg}kg`, amount: tx.Amount })),
            ...appData.payouts.filter(po => po.Student_ID.toString() === id).map(po => ({ type: 'pay', date: po.Datetime, item: `ถอนเงิน (${po.Admin_Note})`, amount: po.Amount_Paid }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

        historyTbody.innerHTML = '';
        historyCards.innerHTML = '';
        if (allHistory.length === 0) {
            historyTbody.innerHTML = '<tr><td colspan="3" class="px-5 py-8 text-center text-gray-500 italic bg-gray-50/50">ยังไม่มีประวัติการทำรายการ</td></tr>';
            historyCards.innerHTML = '<p class="px-5 py-8 text-center text-sm text-gray-500 italic">ยังไม่มีประวัติการทำรายการ</p>';
        } else {
            allHistory.forEach(row => {
                const isEarn = row.type === 'earn';
                historyTbody.innerHTML += `
                    <tr class="hover:bg-gray-50 transition-colors">
                        <td class="px-5 py-3 whitespace-nowrap text-sm text-gray-600">${formatDate(row.date)}</td>
                        <td class="px-5 py-3 whitespace-nowrap text-sm font-medium ${isEarn ? 'text-gray-800' : 'text-blue-600'}">${row.item}</td>
                        <td class="px-5 py-3 whitespace-nowrap text-sm text-right font-bold ${isEarn ? 'text-green-600' : 'text-red-500'}">
                            ${isEarn ? '+' : '-'}${formatMoney(row.amount)}
                        </td>
                    </tr>
                `;
                historyCards.innerHTML += `
                    <article class="p-4 flex items-center justify-between gap-3">
                        <div>
                            <p class="font-semibold text-sm ${isEarn ? 'text-gray-800' : 'text-blue-600'}">${row.item}</p>
                            <p class="text-xs text-gray-500 mt-1">${formatDate(row.date)}</p>
                        </div>
                        <p class="font-bold whitespace-nowrap ${isEarn ? 'text-green-600' : 'text-red-500'}">${isEarn ? '+' : '-'}${formatMoney(row.amount)} ฿</p>
                    </article>
                `;
            });
        }
    } else {
        resultDiv.classList.add('hidden');
        notFoundDiv.classList.remove('hidden');
    }
}


// ==========================================
// 4. Leaderboard Logic
// ==========================================
document.getElementById('refreshLeaderboardBtn').addEventListener('click', async () => {
    // ดึงข้อมูลใหม่จาก Server เลยเพื่อความ Real-time
    await fetchInitialData();
});

function renderLeaderboard() {
    const memberStats = {};
    
    appData.transactions.forEach(tx => {
        if (!memberStats[tx.Student_ID]) {
            memberStats[tx.Student_ID] = 0;
        }
        memberStats[tx.Student_ID] += parseFloat(tx.Weight_kg || 0);
    });

    const leaderboard = Object.keys(memberStats)
        .map(id => {
            const member = appData.members.find(m => m.Student_ID.toString() === id.toString());
            return {
                id,
                name: member ? member.Full_Name : 'ไม่ทราบชื่อ',
                grade: member ? member.Grade : '-',
                weight: memberStats[id]
            };
        })
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 10);

    const tbody = document.getElementById('leaderboardTable');
    tbody.innerHTML = '';

    if (leaderboard.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-8 text-center text-sm text-gray-500 italic">ยังไม่มีข้อมูลการฝากขยะในระบบ</td></tr>';
        return;
    }

    leaderboard.forEach((entry, index) => {
        let rankBadge = `<span class="text-gray-500 font-bold">${index + 1}</span>`;
        let rowClass = 'hover:bg-gray-50 transition-colors';
        
        if (index === 0) {
            rankBadge = `<div class="bg-yellow-100 text-yellow-600 w-8 h-8 rounded-full flex items-center justify-center mx-auto border-2 border-yellow-300 shadow-sm"><i class="fa-solid fa-trophy"></i></div>`;
            rowClass = 'bg-yellow-50/30 hover:bg-yellow-50 transition-colors';
        } else if (index === 1) {
            rankBadge = `<div class="bg-gray-100 text-gray-400 w-8 h-8 rounded-full flex items-center justify-center mx-auto border-2 border-gray-300 shadow-sm font-bold">2</div>`;
        } else if (index === 2) {
            rankBadge = `<div class="bg-orange-100 text-orange-500 w-8 h-8 rounded-full flex items-center justify-center mx-auto border-2 border-orange-300 shadow-sm font-bold">3</div>`;
        }

        tbody.innerHTML += `
            <tr class="${rowClass}">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-center">${rankBadge}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-800">${entry.name}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden sm:table-cell">${entry.grade}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right font-black text-green-600">${formatWeight(entry.weight)} <span class="text-xs text-gray-500 font-normal">กก.</span></td>
            </tr>
        `;
    });
}


// ==========================================
// 5. Admin Authentication & UI
// ==========================================
const adminNavBtn = document.getElementById('adminNavBtn');
const adminMobileBtn = document.getElementById('adminMobileBtn');
const adminPinModal = document.getElementById('adminPinModal');
const closePinModal = document.getElementById('closePinModal');
const verifyPinBtn = document.getElementById('verifyPinBtn');
const adminPinInput = document.getElementById('adminPinInput');
const pinErrorMsg = document.getElementById('pinErrorMsg');

function showPinModal() {
    adminPinModal.classList.remove('hidden');
    adminPinModal.classList.add('flex');
    adminPinInput.value = '';
    pinErrorMsg.classList.add('hidden');
    mobileMenu.classList.add('hidden');
    
    setTimeout(() => adminPinInput.focus(), 100);
}

function hidePinModal() {
    adminPinModal.classList.add('hidden');
    adminPinModal.classList.remove('flex');
}

adminNavBtn.addEventListener('click', showPinModal);
adminMobileBtn.addEventListener('click', showPinModal);
closePinModal.addEventListener('click', hidePinModal);

async function verifyPin() {
    const pin = adminPinInput.value;
    const res = await apiPost('verifyAdminPin', { pin });

    if (res.success) {
        adminSessionToken = res.data.token;
        hidePinModal();
        navigateTo('page-admin');
        openAdminSection('admin-waste'); // Default tab
        updateAdminDisplay();
    } else {
        pinErrorMsg.innerText = res.message || 'PIN ไม่ถูกต้อง ลองอีกครั้ง';
        pinErrorMsg.classList.remove('hidden');
        adminPinInput.value = '';
        adminPinInput.focus();
    }
}

verifyPinBtn.addEventListener('click', verifyPin);
adminPinInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') verifyPin();
});

document.getElementById('exitAdminBtn').addEventListener('click', () => {
    adminSessionToken = null;
    navigateTo('page-dashboard');
    showToast('ออกจากระบบจัดการแล้ว', 'success');
});

// Admin Sub-tabs
const adminTabs = document.querySelectorAll('.admin-tab');
const adminTabContents = document.querySelectorAll('.admin-tab-content');

function openAdminSection(targetId) {
    adminTabContents.forEach(c => c.classList.add('hidden', 'block'));
    adminTabContents.forEach(c => c.classList.remove('block'));
    document.getElementById(targetId).classList.add('block');
    document.getElementById(targetId).classList.remove('hidden');

    adminTabs.forEach(t => {
        if(t.getAttribute('data-target') === targetId) {
            t.classList.add('border-red-500', 'text-red-600', 'active');
            t.classList.remove('border-transparent', 'text-gray-500');
        } else {
            t.classList.remove('border-red-500', 'text-red-600', 'active');
            t.classList.add('border-transparent', 'text-gray-500');
        }
    });

    if (targetId === 'admin-members') renderAdminMembersTable();
}

adminTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
        openAdminSection(e.currentTarget.getAttribute('data-target'));
    });
});

function updateAdminDisplay() {
    document.getElementById('priceBottleDisplay').innerText = appData.config.price_bottle || 0;
    document.getElementById('priceCanDisplay').innerText = appData.config.price_can || 0;
    document.getElementById('setPriceBottle').value = appData.config.price_bottle || 0;
    document.getElementById('setPriceCan').value = appData.config.price_can || 0;
}


// ==========================================
// 5.1 Admin: Record Waste (API Connected)
// ==========================================
const rwStudentId = document.getElementById('rwStudentId');
const rwStudentName = document.getElementById('rwStudentName');
const rwWasteType = document.getElementById('rwWasteType');
const rwWeight = document.getElementById('rwWeight');
const rwCalculatedAmount = document.getElementById('rwCalculatedAmount');

rwStudentId.addEventListener('input', (e) => {
    const id = e.target.value.trim();
    const member = appData.members.find(m => m.Student_ID.toString() === id);
    if (member) {
        rwStudentName.innerText = `พบชื่อ: ${member.Full_Name} (${member.Grade})`;
        rwStudentName.classList.remove('text-red-500');
        rwStudentName.classList.add('text-green-600');
    } else {
        rwStudentName.innerText = id.length > 0 ? 'ไม่พบข้อมูลนักเรียน' : '';
        rwStudentName.classList.remove('text-green-600');
        rwStudentName.classList.add('text-red-500');
    }
});

function calculateWasteAmount() {
    const type = rwWasteType.value;
    const weight = parseFloat(rwWeight.value) || 0;
    const price = type === 'ขวด' ? parseFloat(appData.config.price_bottle) : parseFloat(appData.config.price_can);
    const amount = weight * price;
    rwCalculatedAmount.innerHTML = `${formatMoney(amount)} <span class="text-lg font-normal text-gray-500">฿</span>`;
}

rwWasteType.addEventListener('change', calculateWasteAmount);
rwWeight.addEventListener('input', calculateWasteAmount);

document.getElementById('recordWasteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = rwStudentId.value.trim();
    const member = appData.members.find(m => m.Student_ID.toString() === id);
    
    if (!member) {
        showToast('ไม่พบรหัสนักเรียนนี้', 'error');
        return;
    }

    const type = rwWasteType.value;
    const weight = parseFloat(rwWeight.value);
    const price = type === 'ขวด' ? parseFloat(appData.config.price_bottle) : parseFloat(appData.config.price_can);
    const amount = weight * price;

    const payload = {
        Student_ID: id,
        Waste_Type: type,
        Weight_kg: weight,
        Unit_Price: price,
        Amount: amount
    };

    const res = await apiPost('addTransaction', payload);

    if (res.success) {
        showToast(`บันทึกขยะสำเร็จ (+${formatMoney(amount)}฿)`);
        
        // Update local state
        appData.transactions.push({
            Tx_ID: res.data.Tx_ID,
            Datetime: res.data.Datetime,
            ...payload
        });

        const recentList = document.getElementById('rwRecentList');
        if (document.getElementById('rwEmptyState')) {
            recentList.innerHTML = '';
        }
        
        const li = document.createElement('li');
        li.className = 'p-3 border-b flex justify-between items-center hover:bg-gray-100 transition-colors';
        li.innerHTML = `
            <div>
                <p class="font-bold text-sm text-gray-800">${member.Full_Name}</p>
                <p class="text-xs text-gray-500">${type} ${weight} กก.</p>
            </div>
            <div class="font-black text-green-600">+${formatMoney(amount)}฿</div>
        `;
        recentList.prepend(li);

        rwStudentId.value = '';
        rwStudentName.innerText = '';
        rwWeight.value = '';
        rwCalculatedAmount.innerHTML = `0.00 <span class="text-lg font-normal text-gray-500">฿</span>`;
        rwStudentId.focus();
    } else {
        showToast(res.message, 'error');
    }
});


// ==========================================
// 5.2 Admin: Payout (API Connected)
// ==========================================
const poStudentId = document.getElementById('poStudentId');
const poStudentDetails = document.getElementById('poStudentDetails');
const poErrorMsg = document.getElementById('poErrorMsg');

poStudentId.addEventListener('input', (e) => {
    const id = e.target.value.trim();
    const member = appData.members.find(m => m.Student_ID.toString() === id);
    if (member) {
        poErrorMsg.classList.add('hidden');
        poStudentDetails.classList.remove('hidden');
        document.getElementById('poName').innerText = member.Full_Name;
        
        const balData = getStudentBalanceData(id);
        document.getElementById('poBalance').innerText = formatMoney(balData.balance);
    } else {
        poStudentDetails.classList.add('hidden');
        if (id.length > 0) poErrorMsg.classList.remove('hidden');
        else poErrorMsg.classList.add('hidden');
    }
});

document.getElementById('recordPayoutForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = poStudentId.value.trim();
    const amount = parseFloat(document.getElementById('poAmount').value);
    const note = document.getElementById('poNote').value.trim() || 'ถอนเงิน';
    
    const member = appData.members.find(m => m.Student_ID.toString() === id);
    if (!member) {
        showToast('ไม่พบรหัสนักเรียน', 'error');
        return;
    }

    const balData = getStudentBalanceData(id);
    if (amount > balData.balance) {
        showToast('ยอดเงินคงเหลือไม่พอให้ถอน', 'error');
        return;
    }

    const payload = {
        Student_ID: id,
        Amount_Paid: amount,
        Admin_Note: note
    };

    const res = await apiPost('recordPayout', payload, true);

    if (res.success) {
        showToast(`จ่ายเงินให้ ${member.Full_Name} สำเร็จ (-${formatMoney(amount)}฿)`);
        
        // Update local state
        appData.payouts.push({
            Payout_ID: res.data.Payout_ID,
            Datetime: res.data.Datetime,
            ...payload
        });

        poStudentId.value = '';
        document.getElementById('poAmount').value = '';
        document.getElementById('poNote').value = '';
        poStudentDetails.classList.add('hidden');
    } else {
        showToast(res.message, 'error');
    }
});


// ==========================================
// 5.3 Admin: Manage Members & Promote (API Connected)
// ==========================================
function renderAdminMembersTable() {
    const tbody = document.getElementById('adminMembersTable');
    tbody.innerHTML = '';
    
    appData.members.forEach(m => {
        let statusHtml = '';
        if (m.Status === 'Active') statusHtml = `<span class="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-bold">Active</span>`;
        else if (m.Status === 'Pending_Class') statusHtml = `<span class="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full font-bold">Pending</span>`;
        else statusHtml = `<span class="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded-full font-bold">Graduated</span>`;

        tbody.innerHTML += `
            <tr class="hover:bg-gray-50">
                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 font-medium">${m.Student_ID}</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-bold">${m.Full_Name}</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-center">${m.Grade} ${m.Room ? '/ '+m.Room : ''}</td>
                <td class="px-4 py-3 whitespace-nowrap text-center">${statusHtml}</td>
            </tr>
        `;
    });
}

document.getElementById('promoteGradeBtn').addEventListener('click', async () => {
    if(!confirm('⚠️ ยืนยันการเลื่อนชั้นประจำปี?\n- ม.1-ม.5 จะถูกเลื่อนขึ้น 1 ชั้น\n- ม.3 ขึ้น ม.4 จะถูกตั้งเป็น Pending รอระบุห้อง\n- ม.6 จะถูกปรับสถานะเป็น จบการศึกษา')) {
        return;
    }

    const res = await apiPost('promoteGrade', {}, true);
    
    if (res.success) {
        showToast('ดำเนินการเลื่อนชั้นประจำปีในฐานข้อมูลเสร็จสิ้น', 'success');
        // Reload all data to get fresh grades
        await fetchInitialData();
    } else {
        showToast(res.message, 'error');
    }
});


// ==========================================
// 5.4 Admin: Settings (API Connected)
// ==========================================
document.getElementById('updatePricesForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pBottle = parseFloat(document.getElementById('setPriceBottle').value);
    const pCan = parseFloat(document.getElementById('setPriceCan').value);

    const payload = {
        price_bottle: pBottle,
        price_can: pCan
    };

    const res = await apiPost('updatePrices', payload, true);

    if (res.success) {
        appData.config.price_bottle = pBottle;
        appData.config.price_can = pCan;

        updateAdminDisplay();
        showToast('บันทึกเรทราคาใหม่สำเร็จ', 'success');
        
        if (rwWeight.value) calculateWasteAmount();
        if (selfWeight.value) calculateSelfAmount();
    } else {
        showToast(res.message, 'error');
    }
});
