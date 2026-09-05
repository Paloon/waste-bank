// =========================================================================
// 1. วิธีตั้งค่า: คุณไม่จำเป็นต้องใส่ ID ใดๆ เลย 
// ขอแค่เอาโค้ดนี้ไปใส่โดยกดจากเมนู "ส่วนขยาย (Extensions) -> Apps Script" ในหน้า Google Sheets ของคุณ
// =========================================================================

// ฟังก์ชันสำหรับดึงไฟล์ Google Sheets อัตโนมัติ
function getDatabase() {
  try {
    // ดึงไฟล์ Sheets ที่สคริปต์นี้ถูกฝังอยู่ (ไม่ต้องใช้ ID)
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;
  } catch (e) {
    throw new Error("เกิดข้อผิดพลาด: สคริปต์นี้ไม่ได้ผูกกับ Google Sheets กรุณาเปิด Apps Script จากเมนู 'ส่วนขยาย' ในหน้า Sheets");
  }
}

function getSheet(sheetName) {
  const ss = getDatabase();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("ไม่พบชีตชื่อ: " + sheetName + " กรุณาสร้างแท็บชื่อนี้ใน Google Sheets");
  return sheet;
}

// =========================================================================
// 2. HTTP Request Handlers (doGet / doPost) & CORS
// =========================================================================

function outputJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doOptions(e) {
  return ContentService.createTextOutput("").setMimeType(ContentService.MimeType.TEXT);
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'getInitialData') {
      return outputJSON({ success: true, data: getInitialData() });
    }
    return outputJSON({ success: false, message: 'Invalid action for GET' });
  } catch (error) {
    return outputJSON({ success: false, message: error.toString() });
  }
}

function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const action = postData.action;
    const payload = postData.payload || {};
    const adminToken = postData.adminToken || '';
    
    switch (action) {
      case 'verifyAdminPin': return outputJSON(createAdminSession(payload.pin));
      case 'addTransaction': return outputJSON(addTransaction(payload));
      case 'recordPayout': requireAdmin(adminToken); return outputJSON(recordPayout(payload));
      case 'updatePrices': requireAdmin(adminToken); return outputJSON(updatePrices(payload));
      case 'promoteGrade': requireAdmin(adminToken); return outputJSON(promoteGrade());
      case 'registerMember': return outputJSON(registerMember(payload));
      default: return outputJSON({ success: false, message: 'Invalid action for POST' });
    }
  } catch (error) {
    return outputJSON({ success: false, message: error.toString() });
  }
}

// อ่าน PIN จากชีต Config (Key: admin_pin) เพื่อตรวจสอบบนเซิร์ฟเวอร์เท่านั้น
// ห้ามส่งค่า admin_pin กลับไปที่ browser
function createAdminSession(pin) {
  const expectedPin = String(getConfig().admin_pin || '').trim();
  if (!expectedPin) throw new Error('ผู้ดูแลยังไม่ได้ตั้งค่า admin_pin ในชีต Config');
  if (String(pin || '').trim() !== expectedPin) return { success: false, message: 'PIN ไม่ถูกต้อง' };
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('admin-token-' + token, '1', 1800);
  return { success: true, data: { token: token }, message: 'ยืนยันตัวตนสำเร็จ' };
}

function requireAdmin(token) {
  if (!token || CacheService.getScriptCache().get('admin-token-' + token) !== '1') {
    throw new Error('ไม่มีสิทธิ์ใช้งาน Admin หรือ session หมดอายุ');
  }
}

// =========================================================================
// 3. Database Helper Functions
// =========================================================================

function getSheetData(sheetName) {
  const sheet = getSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; 
  
  const headers = data[0];
  const result = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    result.push(obj);
  }
  
  return result;
}

function getConfig() {
  const data = getSheetData('Config');
  const config = {};
  data.forEach(row => {
    if(row.Key) config[row.Key] = row.Value;
  });
  return config;
}

function getPublicConfig() {
  const config = getConfig();
  return { price_bottle: Number(config.price_bottle || 0), price_can: Number(config.price_can || 0) };
}

// =========================================================================
// 4. Business Logic Functions
// =========================================================================

function getInitialData() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('initial-data-v1');
  if (cached) return JSON.parse(cached);

  const data = {
    config: getPublicConfig(),
    members: getSheetData('Members'),
    transactions: getSheetData('Transactions'),
    payouts: getSheetData('Payouts')
  };
  // ลดเวลาตอบสนองระหว่างที่ไม่มีรายการใหม่; หากข้อมูลใหญ่เกิน Cache จะข้ามได้โดยไม่ทำให้ระบบล้ม
  try { cache.put('initial-data-v1', JSON.stringify(data), 60); } catch (error) {}
  return data;
}

function invalidateInitialDataCache() {
  CacheService.getScriptCache().remove('initial-data-v1');
}

function addTransaction(payload) {
  const Student_ID = String(payload.Student_ID || '').trim();
  const Waste_Type = String(payload.Waste_Type || '').trim();
  const Weight_kg = Number(payload.Weight_kg);
  if (!Student_ID || !['ขวด', 'กระป๋อง'].includes(Waste_Type)) return { success: false, message: 'ข้อมูลประเภทขยะหรือรหัสนักเรียนไม่ถูกต้อง' };
  if (!Number.isFinite(Weight_kg) || Weight_kg <= 0 || Weight_kg > 100) return { success: false, message: 'น้ำหนักต้องมากกว่า 0 และไม่เกิน 100 กก.' };
  const member = getSheetData('Members').find(function(row) { return String(row.Student_ID) === Student_ID && String(row.Status) === 'Active'; });
  if (!member) return { success: false, message: 'ไม่พบสมาชิกที่ใช้งานได้' };
  // ไม่เชื่อราคาและจำนวนเงินจาก browser
  const config = getPublicConfig();
  const Unit_Price = Waste_Type === 'ขวด' ? config.price_bottle : config.price_can;
  const Amount = Weight_kg * Unit_Price;
  const sheet = getSheet('Transactions');
  const Tx_ID = 'TX' + Date.now().toString().slice(-6); 
  const Datetime = new Date().toISOString();
  
  sheet.appendRow([Tx_ID, Datetime, Student_ID, Waste_Type, Weight_kg, Unit_Price, Amount]);
  invalidateInitialDataCache();
  return { success: true, message: 'บันทึกขยะสำเร็จ', data: { Tx_ID, Datetime, Unit_Price, Amount } };
}

function recordPayout(payload) {
  const Student_ID = String(payload.Student_ID || '').trim();
  const Amount_Paid = Number(payload.Amount_Paid);
  const Admin_Note = String(payload.Admin_Note || '').trim().slice(0, 200);
  if (!Student_ID || !Number.isFinite(Amount_Paid) || Amount_Paid <= 0) return { success: false, message: 'ข้อมูลการจ่ายเงินไม่ถูกต้อง' };
  const earned = getSheetData('Transactions').filter(function(tx) { return String(tx.Student_ID) === Student_ID; }).reduce(function(sum, tx) { return sum + Number(tx.Amount || 0); }, 0);
  const paid = getSheetData('Payouts').filter(function(po) { return String(po.Student_ID) === Student_ID; }).reduce(function(sum, po) { return sum + Number(po.Amount_Paid || 0); }, 0);
  if (Amount_Paid > earned - paid) return { success: false, message: 'ยอดเงินคงเหลือไม่พอให้ถอน' };
  const sheet = getSheet('Payouts');
  const Payout_ID = 'PO' + Date.now().toString().slice(-6);
  const Datetime = new Date().toISOString();
  
  sheet.appendRow([Payout_ID, Datetime, Student_ID, Amount_Paid, Admin_Note]);
  invalidateInitialDataCache();
  return { success: true, message: 'บันทึกการจ่ายเงินสำเร็จ', data: { Payout_ID, Datetime } };
}

function updatePrices(payload) {
  const price_bottle = Number(payload.price_bottle);
  const price_can = Number(payload.price_can);
  if (!Number.isFinite(price_bottle) || !Number.isFinite(price_can) || price_bottle < 0 || price_can < 0) return { success: false, message: 'เรทราคาไม่ถูกต้อง' };
  const sheet = getSheet('Config');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'price_bottle') {
      sheet.getRange(i + 1, 2).setValue(price_bottle);
    }
    if (data[i][0] === 'price_can') {
      sheet.getRange(i + 1, 2).setValue(price_can);
    }
  }
  invalidateInitialDataCache();
  return { success: true, message: 'อัปเดตราคาสำเร็จ' };
}

function promoteGrade() {
  const sheet = getSheet('Members');
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { success: false, message: 'ไม่มีข้อมูลนักเรียน' };
  
  const headers = data[0];
  const gradeIdx = headers.indexOf('Grade');
  const roomIdx = headers.indexOf('Room');
  const seatIdx = headers.indexOf('Seat_No');
  const statusIdx = headers.indexOf('Status');
  
  if (gradeIdx === -1 || statusIdx === -1) {
    return { success: false, message: 'ไม่พบคอลัมน์ที่จำเป็นในชีต Members' };
  }
  
  for (let i = 1; i < data.length; i++) {
    let status = data[i][statusIdx];
    let grade = data[i][gradeIdx];
    if (status === 'Graduated') continue; 
    
    let match = String(grade).match(/ม\.(\d)/);
    if (match) {
      let gradeNum = parseInt(match[1]);
      if (gradeNum === 6) {
        sheet.getRange(i + 1, statusIdx + 1).setValue('Graduated');
      } else if (gradeNum === 3) {
        sheet.getRange(i + 1, gradeIdx + 1).setValue('ม.4');
        sheet.getRange(i + 1, roomIdx + 1).setValue('');
        sheet.getRange(i + 1, seatIdx + 1).setValue('');
        sheet.getRange(i + 1, statusIdx + 1).setValue('Pending_Class');
      } else if (gradeNum < 6) {
        sheet.getRange(i + 1, gradeIdx + 1).setValue(`ม.${gradeNum + 1}`);
      }
    }
  }
  invalidateInitialDataCache();
  return { success: true, message: 'ดำเนินการเลื่อนชั้นสำเร็จ' };
}

function registerMember(payload) {
  const Student_ID = String(payload.Student_ID || '').trim();
  const Full_Name = String(payload.Full_Name || '').trim();
  const Grade = String(payload.Grade || '').trim();
  const Room = String(payload.Room || '').trim();
  const Seat_No = String(payload.Seat_No || '').trim();
  if (!/^\d{3,20}$/.test(Student_ID) || !Full_Name || !/^ม\.[1-6]$/.test(Grade)) return { success: false, message: 'กรุณากรอกรหัส ชื่อ และระดับชั้นให้ถูกต้อง' };
  const sheet = getSheet('Members');
  
  const members = getSheetData('Members');
  const isDuplicate = members.some(m => String(m.Student_ID) === String(Student_ID));
  
  if (isDuplicate) {
    return { success: false, message: 'รหัสนักเรียนนี้มีการลงทะเบียนแล้ว' };
  }
  
  sheet.appendRow([Student_ID, Full_Name, Grade, Room, Seat_No, 'Active']);
  invalidateInitialDataCache();
  return { success: true, message: 'ลงทะเบียนสำเร็จ' };
}
