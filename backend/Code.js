function getDatabase() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet(sheetName) {
  var db = getDatabase();
  var sheet = db.getSheetByName(sheetName);
  if (!sheet) throw new Error('ไม่พบแผ่นงาน: ' + sheetName);
  return sheet;
}

function outputJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doOptions(e) {
  return outputJSON({ success: true });
}

function getConfig() {
  var sheet = getSheet('Config');
  var data = sheet.getDataRange().getValues();
  var config = {};
  for (var i = 1; i < data.length; i++) {
    config[data[i][0]] = data[i][1];
  }
  return config;
}

function getPublicConfig() {
  return {};
}

function getSheetData(sheetName) {
  var sheet = getSheet(sheetName);
  var data = sheet.getDataRange().getValues();
  if (data.length < 1) return [];
  var headers = data[0];
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      row[headers[j]] = data[i][j];
    }
    result.push(row);
  }
  return result;
}

// Admin Token System
function createAdminSession(pin) {
  var config = getConfig();
  if (String(pin) !== String(config['admin_pin'])) {
    throw new Error('รหัสผ่านไม่ถูกต้อง');
  }
  var token = Utilities.getUuid();
  var cache = CacheService.getScriptCache();
  cache.put('admin_token_' + token, 'true', 1800);
  return token;
}

function requireAdmin(token) {
  if (!token) throw new Error('ไม่พบ Token ผู้ดูแลระบบ');
  var cache = CacheService.getScriptCache();
  var isValid = cache.get('admin_token_' + token);
  if (!isValid) throw new Error('เซสชันผู้ดูแลระบบหมดอายุหรือไม่ถูกต้อง โปรดเข้าสู่ระบบใหม่');
}

// Cache System
function invalidateInitialDataCache() {
  CacheService.getScriptCache().remove('initial-data-v2');
}

function getInitialData() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('initial-data-v2');
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      // Ignore parse error and fetch fresh
    }
  }
  var data = {
    config: getPublicConfig(),
    members: getSheetData('Members'),
    transactions: getSheetData('Transactions'),
    rewards: getSheetData('Rewards'),
    redemptions: getSheetData('Redemptions')
  };
  try {
    cache.put('initial-data-v2', JSON.stringify(data), 60);
  } catch (e) {
    // Ignore cache put error if data is too large
  }
  return data;
}

// Google Drive Integration
function getOrCreateImageFolder() {
  const folderName = 'WasteBank_Images';
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(folderName);
}

function saveImageToDrive(base64Data, fileName) {
  const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const blob = Utilities.newBlob(Utilities.base64Decode(base64Clean), 'image/jpeg', fileName);
  const folder = getOrCreateImageFolder();
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/uc?id=' + file.getId();
}

function doGet(e) {
  try {
    var action = e.parameter.action;
    if (action === 'getInitialData') {
      return outputJSON({ success: true, data: getInitialData() });
    }
    throw new Error('ไม่พบคำสั่ง (Action)');
  } catch (error) {
    return outputJSON({ success: false, error: error.message || String(error) });
  }
}

function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) {
      throw new Error('ไม่มีข้อมูลถูกส่งมา');
    }
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    var payload = body.payload || {};
    var adminToken = body.adminToken;
    var result = null;

    switch (action) {
      // Public Actions
      case 'verifyAdminPin':
        result = { token: createAdminSession(payload.pin) };
        break;
      case 'registerMember':
        result = registerMember(payload);
        break;
      case 'submitTrashImage':
        result = submitTrashImage(payload);
        break;
      case 'cancelTransaction':
        result = cancelTransaction(payload);
        break;
      case 'redeemReward':
        result = redeemReward(payload);
        break;
      case 'cancelRedemption':
        result = cancelRedemption(payload);
        break;

      // Admin Actions
      case 'approveTransaction':
        requireAdmin(adminToken);
        result = approveTransaction(payload);
        break;
      case 'rejectTransaction':
        requireAdmin(adminToken);
        result = rejectTransaction(payload);
        break;
      case 'confirmRedemption':
        requireAdmin(adminToken);
        result = confirmRedemption(payload);
        break;
      case 'addReward':
        requireAdmin(adminToken);
        result = addReward(payload);
        break;
      case 'updateReward':
        requireAdmin(adminToken);
        result = updateReward(payload);
        break;
      case 'deleteReward':
        requireAdmin(adminToken);
        result = deleteReward(payload);
        break;
      case 'promoteGrade':
        requireAdmin(adminToken);
        result = promoteGrade(payload);
        break;
      default:
        throw new Error('ไม่พบคำสั่ง (Action): ' + action);
    }
    return outputJSON({ success: true, data: result });
  } catch (error) {
    return outputJSON({ success: false, error: error.message || String(error) });
  }
}

// ----------------------------------------------------------------------
// Action Implementations
// ----------------------------------------------------------------------

function registerMember(payload) {
  var studentId = String(payload.Student_ID || '').trim();
  if (studentId.length < 3 || studentId.length > 20) throw new Error('รหัสนักเรียนต้องมีความยาว 3-20 ตัวอักษร');
  if (!payload.Full_Name) throw new Error('กรุณาระบุชื่อ-นามสกุล');
  if (!payload.Grade) throw new Error('กรุณาระบุระดับชั้น');
  
  var sheet = getSheet('Members');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === studentId) {
      throw new Error('รหัสนักเรียนนี้มีในระบบแล้ว');
    }
  }
  
  // [Student_ID, Full_Name, Grade, Room, Seat_No, Status, Coins_Balance]
  sheet.appendRow([studentId, payload.Full_Name, payload.Grade, payload.Room || '', payload.Seat_No || '', 'Active', 0]);
  invalidateInitialDataCache();
  return { success: true, message: 'ลงทะเบียนสำเร็จ' };
}

function submitTrashImage(payload) {
  var studentId = String(payload.Student_ID || '').trim();
  var imageBase64 = payload.imageBase64;
  if (!studentId || !imageBase64) throw new Error('ข้อมูลไม่ครบถ้วน (ต้องการ Student_ID และ imageBase64)');

  var sheet = getSheet('Members');
  var data = sheet.getDataRange().getValues();
  var found = false;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === studentId) {
      if (data[i][5] !== 'Active') throw new Error('สถานะบัญชีไม่สามารถดำเนินการได้');
      found = true;
      break;
    }
  }
  if (!found) throw new Error('ไม่พบรหัสนักเรียนในระบบ');

  var fileName = 'Trash_' + studentId + '_' + Date.now() + '.jpg';
  var imageUrl = saveImageToDrive(imageBase64, fileName);
  var txId = 'TX' + Date.now().toString().slice(-8);

  var txSheet = getSheet('Transactions');
  // [Tx_ID, Datetime, Student_ID, Image_URL, Status, Coins_Awarded]
  txSheet.appendRow([txId, new Date().toISOString(), studentId, imageUrl, 'Pending', 0]);
  
  invalidateInitialDataCache();
  return { success: true, txId: txId, message: 'ส่งรูปขยะสำเร็จ รอดำเนินการ' };
}

function cancelTransaction(payload) {
  var txId = payload.Tx_ID;
  var studentId = payload.Student_ID;
  if (!txId || !studentId) throw new Error('ข้อมูลไม่ครบถ้วน');

  var sheet = getSheet('Transactions');
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(txId)) {
      if (String(data[i][2]) !== String(studentId)) {
        throw new Error('รหัสนักเรียนไม่ตรงกับรายการนี้');
      }
      if (data[i][4] !== 'Pending') {
        throw new Error('สามารถยกเลิกได้เฉพาะรายการที่รอดำเนินการเท่านั้น');
      }
      rowIndex = i + 1;
      break;
    }
  }
  if (rowIndex === -1) throw new Error('ไม่พบรายการนี้');

  sheet.getRange(rowIndex, 5).setValue('Cancelled');
  invalidateInitialDataCache();
  return { success: true, message: 'ยกเลิกรายการสำเร็จ' };
}

function redeemReward(payload) {
  var studentId = payload.Student_ID;
  var rewardId = payload.Reward_ID;

  var memberSheet = getSheet('Members');
  var memberData = memberSheet.getDataRange().getValues();
  var memberRow = -1;
  var currentCoins = 0;
  for (var i = 1; i < memberData.length; i++) {
    if (String(memberData[i][0]) === String(studentId)) {
      if (memberData[i][5] !== 'Active') throw new Error('สถานะบัญชีไม่สามารถแลกของรางวัลได้');
      currentCoins = Number(memberData[i][6]) || 0;
      memberRow = i + 1;
      break;
    }
  }
  if (memberRow === -1) throw new Error('ไม่พบข้อมูลนักเรียน');

  var rewardSheet = getSheet('Rewards');
  var rewardData = rewardSheet.getDataRange().getValues();
  var rewardRow = -1;
  var coinCost = 0;
  var stock = 0;
  var successMessage = '';
  for (var j = 1; j < rewardData.length; j++) {
    if (String(rewardData[j][0]) === String(rewardId)) {
      coinCost = Number(rewardData[j][2]) || 0;
      stock = Number(rewardData[j][3]) || 0;
      successMessage = rewardData[j][5];
      rewardRow = j + 1;
      break;
    }
  }
  if (rewardRow === -1) throw new Error('ไม่พบของรางวัลนี้');

  if (currentCoins < coinCost) throw new Error('เหรียญไม่เพียงพอ');
  if (stock <= 0) throw new Error('ของรางวัลหมดแล้ว');

  // Deduct coins & stock
  memberSheet.getRange(memberRow, 7).setValue(currentCoins - coinCost);
  rewardSheet.getRange(rewardRow, 4).setValue(stock - 1);

  // [Redeem_ID, Datetime, Student_ID, Reward_ID, Coins_Used, Status]
  var redeemId = 'RD' + Date.now().toString().slice(-8);
  var redemptionSheet = getSheet('Redemptions');
  redemptionSheet.appendRow([redeemId, new Date().toISOString(), studentId, rewardId, coinCost, 'Pending_Pickup']);

  invalidateInitialDataCache();
  return { success: true, message: successMessage || 'แลกของรางวัลสำเร็จ' };
}

function cancelRedemption(payload) {
  var redeemId = payload.Redeem_ID;
  var studentId = payload.Student_ID;
  if (!redeemId || !studentId) throw new Error('ข้อมูลไม่ครบถ้วน');

  var sheet = getSheet('Redemptions');
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  var coinsUsed = 0;
  var rewardId = '';

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(redeemId)) {
      if (String(data[i][2]) !== String(studentId)) {
        throw new Error('รหัสนักเรียนไม่ตรงกับรายการนี้');
      }
      if (data[i][5] !== 'Pending_Pickup') {
        throw new Error('สามารถยกเลิกได้เฉพาะรายการที่รอรับของเท่านั้น');
      }
      rewardId = data[i][3];
      coinsUsed = Number(data[i][4]) || 0;
      rowIndex = i + 1;
      break;
    }
  }
  if (rowIndex === -1) throw new Error('ไม่พบรายการแลกของรางวัลนี้');

  // Refund member coins
  var memberSheet = getSheet('Members');
  var memberData = memberSheet.getDataRange().getValues();
  for (var m = 1; m < memberData.length; m++) {
    if (String(memberData[m][0]) === String(studentId)) {
      var currentCoins = Number(memberData[m][6]) || 0;
      memberSheet.getRange(m + 1, 7).setValue(currentCoins + coinsUsed);
      break;
    }
  }

  // Refund reward stock
  var rewardSheet = getSheet('Rewards');
  var rewardData = rewardSheet.getDataRange().getValues();
  for (var r = 1; r < rewardData.length; r++) {
    if (String(rewardData[r][0]) === String(rewardId)) {
      var currentStock = Number(rewardData[r][3]) || 0;
      rewardSheet.getRange(r + 1, 4).setValue(currentStock + 1);
      break;
    }
  }

  // Update redemption status
  sheet.getRange(rowIndex, 6).setValue('Cancelled');

  invalidateInitialDataCache();
  return { success: true, message: 'ยกเลิกการแลกของรางวัลสำเร็จ คืนเหรียญแล้ว' };
}

function approveTransaction(payload) {
  var txId = payload.Tx_ID;
  var coinsAwarded = Number(payload.Coins_Awarded) || 0;

  var txSheet = getSheet('Transactions');
  var txData = txSheet.getDataRange().getValues();
  var txRow = -1;
  var studentId = '';

  for (var i = 1; i < txData.length; i++) {
    if (String(txData[i][0]) === String(txId)) {
      if (txData[i][4] !== 'Pending') throw new Error('รายการนี้ไม่ได้อยู่ในสถานะรอดำเนินการ');
      studentId = String(txData[i][2]);
      txRow = i + 1;
      break;
    }
  }
  if (txRow === -1) throw new Error('ไม่พบรายการนี้');

  // Update Member Coins
  var memberSheet = getSheet('Members');
  var memberData = memberSheet.getDataRange().getValues();
  var memberFound = false;
  for (var m = 1; m < memberData.length; m++) {
    if (String(memberData[m][0]) === studentId) {
      var currentCoins = Number(memberData[m][6]) || 0;
      memberSheet.getRange(m + 1, 7).setValue(currentCoins + coinsAwarded);
      memberFound = true;
      break;
    }
  }
  if (!memberFound) throw new Error('ไม่พบรหัสนักเรียนผู้ทำรายการ');

  // Update Transaction
  txSheet.getRange(txRow, 5).setValue('Approved');
  txSheet.getRange(txRow, 6).setValue(coinsAwarded);

  invalidateInitialDataCache();
  return { success: true, message: 'อนุมัติรายการและเพิ่มเหรียญสำเร็จ' };
}

function rejectTransaction(payload) {
  var txId = payload.Tx_ID;
  var txSheet = getSheet('Transactions');
  var txData = txSheet.getDataRange().getValues();
  var txRow = -1;

  for (var i = 1; i < txData.length; i++) {
    if (String(txData[i][0]) === String(txId)) {
      if (txData[i][4] !== 'Pending') throw new Error('รายการนี้ไม่ได้อยู่ในสถานะรอดำเนินการ');
      txRow = i + 1;
      break;
    }
  }
  if (txRow === -1) throw new Error('ไม่พบรายการนี้');

  txSheet.getRange(txRow, 5).setValue('Rejected');
  invalidateInitialDataCache();
  return { success: true, message: 'ปฏิเสธรายการสำเร็จ' };
}

function confirmRedemption(payload) {
  var redeemId = payload.Redeem_ID;
  var sheet = getSheet('Redemptions');
  var data = sheet.getDataRange().getValues();
  var row = -1;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(redeemId)) {
      if (data[i][5] !== 'Pending_Pickup') throw new Error('รายการไม่ได้อยู่ในสถานะรอรับของ');
      row = i + 1;
      break;
    }
  }
  if (row === -1) throw new Error('ไม่พบรายการนี้');

  sheet.getRange(row, 6).setValue('Completed');
  invalidateInitialDataCache();
  return { success: true, message: 'ยืนยันการรับของรางวัลสำเร็จ' };
}

function addReward(payload) {
  var rewardId = 'RW' + Date.now().toString().slice(-8);
  var sheet = getSheet('Rewards');
  // [Reward_ID, Name, Coin_Cost, Stock, Description, Success_Message, Image_URL]
  sheet.appendRow([
    rewardId, 
    payload.Name, 
    Number(payload.Coin_Cost) || 0, 
    Number(payload.Stock) || 0, 
    payload.Description || '', 
    payload.Success_Message || '', 
    payload.Image_URL || ''
  ]);
  invalidateInitialDataCache();
  return { success: true, message: 'เพิ่มของรางวัลสำเร็จ' };
}

function updateReward(payload) {
  var rewardId = payload.Reward_ID;
  var sheet = getSheet('Rewards');
  var data = sheet.getDataRange().getValues();
  var row = -1;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(rewardId)) {
      row = i + 1;
      break;
    }
  }
  if (row === -1) throw new Error('ไม่พบของรางวัลนี้');

  sheet.getRange(row, 2).setValue(payload.Name);
  sheet.getRange(row, 3).setValue(Number(payload.Coin_Cost) || 0);
  sheet.getRange(row, 4).setValue(Number(payload.Stock) || 0);
  sheet.getRange(row, 5).setValue(payload.Description || '');
  sheet.getRange(row, 6).setValue(payload.Success_Message || '');
  sheet.getRange(row, 7).setValue(payload.Image_URL || '');

  invalidateInitialDataCache();
  return { success: true, message: 'อัปเดตของรางวัลสำเร็จ' };
}

function deleteReward(payload) {
  var rewardId = payload.Reward_ID;
  var sheet = getSheet('Rewards');
  var data = sheet.getDataRange().getValues();
  var row = -1;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(rewardId)) {
      row = i + 1;
      break;
    }
  }
  if (row === -1) throw new Error('ไม่พบของรางวัลนี้');

  sheet.deleteRow(row);
  invalidateInitialDataCache();
  return { success: true, message: 'ลบของรางวัลสำเร็จ' };
}

function promoteGrade(payload) {
  var sheet = getSheet('Members');
  var data = sheet.getDataRange().getValues();
  
  // Logic: ม.1->ม.2, ม.2->ม.3, ม.3->ม.4 (Pending_Class), ม.4->ม.5, ม.5->ม.6, ม.6->Graduated
  for (var i = 1; i < data.length; i++) {
    var currentGrade = String(data[i][2]);
    var currentStatus = String(data[i][5]);
    if (currentStatus === 'Graduated') continue;

    var newGrade = currentGrade;
    var newStatus = currentStatus;

    if (currentGrade === 'ม.1') newGrade = 'ม.2';
    else if (currentGrade === 'ม.2') newGrade = 'ม.3';
    else if (currentGrade === 'ม.3') {
      newGrade = 'ม.4';
      newStatus = 'Pending_Class';
    }
    else if (currentGrade === 'ม.4') newGrade = 'ม.5';
    else if (currentGrade === 'ม.5') newGrade = 'ม.6';
    else if (currentGrade === 'ม.6') {
      newStatus = 'Graduated';
    }

    if (newGrade !== currentGrade) {
      sheet.getRange(i + 1, 3).setValue(newGrade);
    }
    if (newStatus !== currentStatus) {
      sheet.getRange(i + 1, 6).setValue(newStatus);
    }
  }

  invalidateInitialDataCache();
  return { success: true, message: 'เลื่อนชั้นนักเรียนทั้งหมดเรียบร้อย' };
}
