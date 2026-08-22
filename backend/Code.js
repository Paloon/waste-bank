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
    
    switch (action) {
      case 'addTransaction': return outputJSON(addTransaction(payload));
      case 'recordPayout': return outputJSON(recordPayout(payload));
      case 'updatePrices': return outputJSON(updatePrices(payload));
      case 'promoteGrade': return outputJSON(promoteGrade());
      case 'registerMember': return outputJSON(registerMember(payload));
      default: return outputJSON({ success: false, message: 'Invalid action for POST' });
    }
  } catch (error) {
    return outputJSON({ success: false, message: error.toString() });
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

// =========================================================================
// 4. Business Logic Functions
// =========================================================================

function getInitialData() {
  return {
    config: getConfig(),
    members: getSheetData('Members'),
    transactions: getSheetData('Transactions'),
    payouts: getSheetData('Payouts')
  };
}

function addTransaction(payload) {
  const { Student_ID, Waste_Type, Weight_kg, Unit_Price, Amount } = payload;
  const sheet = getSheet('Transactions');
  const Tx_ID = 'TX' + Date.now().toString().slice(-6); 
  const Datetime = new Date().toISOString();
  
  sheet.appendRow([Tx_ID, Datetime, Student_ID, Waste_Type, Weight_kg, Unit_Price, Amount]);
  return { success: true, message: 'บันทึกขยะสำเร็จ', data: { Tx_ID, Datetime } };
}

function recordPayout(payload) {
  const { Student_ID, Amount_Paid, Admin_Note } = payload;
  const sheet = getSheet('Payouts');
  const Payout_ID = 'PO' + Date.now().toString().slice(-6);
  const Datetime = new Date().toISOString();
  
  sheet.appendRow([Payout_ID, Datetime, Student_ID, Amount_Paid, Admin_Note]);
  return { success: true, message: 'บันทึกการจ่ายเงินสำเร็จ', data: { Payout_ID, Datetime } };
}

function updatePrices(payload) {
  const { price_bottle, price_can } = payload;
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
  return { success: true, message: 'ดำเนินการเลื่อนชั้นสำเร็จ' };
}

function registerMember(payload) {
  const { Student_ID, Full_Name, Grade, Room, Seat_No } = payload;
  const sheet = getSheet('Members');
  
  const members = getSheetData('Members');
  const isDuplicate = members.some(m => String(m.Student_ID) === String(Student_ID));
  
  if (isDuplicate) {
    return { success: false, message: 'รหัสนักเรียนนี้มีการลงทะเบียนแล้ว' };
  }
  
  sheet.appendRow([Student_ID, Full_Name, Grade, Room, Seat_No, 'Active']);
  return { success: true, message: 'ลงทะเบียนสำเร็จ' };
}
