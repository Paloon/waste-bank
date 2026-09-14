// Google Apps Script Backend for Waste Bank System

function doPost(e) {
  try {
    const requestData = JSON.parse(e.postData.contents);
    const { action, payload, pin } = requestData;
    
    // Check if it's an admin action
    const adminActions = [
      'adminLogin', 'getPendingTrash', 'approveTrash', 'rejectTrash',
      'getPendingRedemptions', 'confirmHandover', 'getRewardsAdmin',
      'addReward', 'editReward', 'deleteReward', 'getMembers',
      'updateMemberAdmin', 'deleteMember', 'promoteGrades'
    ];
    
    if (adminActions.includes(action)) {
      if (!validateAdminPin(pin)) {
        return outputJSON({ success: false, error: 'PIN ผู้ดูแลระบบไม่ถูกต้อง' });
      }
    }
    
    switch (action) {
      case 'registerStudent': return registerStudent(payload);
      case 'updateStudentProfile': return updateStudentProfile(payload);
      case 'getStudent': return getStudent(payload);
      case 'submitTrash': return submitTrash(payload);
      case 'getStudentStatus': return getStudentStatus(payload);
      case 'cancelTrash': return cancelTrash(payload);
      case 'getRewards': return getRewards();
      case 'redeemReward': return redeemReward(payload);
      case 'cancelRedemption': return cancelRedemption(payload);
      case 'getLeaderboard': return getLeaderboard();
      case 'getInitialData': return getInitialData();
      
      case 'adminLogin': return outputJSON({ success: true, message: 'เข้าสู่ระบบสำเร็จ' });
      case 'getPendingTrash': return getPendingTrash();
      case 'approveTrash': return approveTrash(payload);
      case 'rejectTrash': return rejectTrash(payload);
      case 'getPendingRedemptions': return getPendingRedemptions();
      case 'confirmHandover': return confirmHandover(payload);
      case 'getRewardsAdmin': return getRewardsAdmin();
      case 'addReward': return addReward(payload);
      case 'editReward': return editReward(payload);
      case 'deleteReward': return deleteReward(payload);
      case 'getMembers': return getMembers();
      case 'updateMemberAdmin': return updateMemberAdmin(payload);
      case 'deleteMember': return deleteMember(payload);
      case 'promoteGrades': return promoteGrades();
      
      default: return outputJSON({ success: false, error: 'ไม่พบ Action ที่ระบุ' });
    }
  } catch (error) {
    return outputJSON({ success: false, error: error.message });
  }
}

function outputJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error('ไม่พบแผ่นงาน: ' + sheetName);
  return sheet;
}

function validateAdminPin(pin) {
  const sheet = getSheet('Config');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'admin_pin') {
      return String(data[i][1]) === String(pin);
    }
  }
  return false;
}

// ---------------- Public Actions ----------------

function registerStudent(payload) {
  const { Student_ID, Full_Name, Grade, Room, Seat_No } = payload;
  if (!Student_ID || !Full_Name || !Grade) throw new Error('ข้อมูลไม่ครบถ้วน');
  
  const sheet = getSheet('Members');
  const data = sheet.getDataRange().getValues();
  
  // Check duplicate
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(Student_ID)) {
      throw new Error('รหัสนักเรียนนี้ลงทะเบียนแล้ว');
    }
  }
  
  sheet.appendRow([Student_ID, Full_Name, Grade, Room || '', Seat_No || '', 'Active', 0, 0]);
  return outputJSON({ success: true, message: 'ลงทะเบียนสำเร็จ' });
}

function updateStudentProfile(payload) {
  const { Student_ID, Full_Name, Grade, Room, Seat_No } = payload;
  const sheet = getSheet('Members');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(Student_ID)) {
      sheet.getRange(i + 1, 2).setValue(Full_Name);
      sheet.getRange(i + 1, 3).setValue(Grade);
      sheet.getRange(i + 1, 4).setValue(Room || '');
      sheet.getRange(i + 1, 5).setValue(Seat_No || '');
      return outputJSON({ success: true, message: 'อัปเดตโปรไฟล์สำเร็จ' });
    }
  }
  throw new Error('ไม่พบข้อมูลนักเรียน');
}

function getStudent(payload) {
  const { Student_ID } = payload;
  const sheet = getSheet('Members');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(Student_ID)) {
      return outputJSON({
        success: true,
        data: {
          Student_ID: data[i][0],
          Full_Name: data[i][1],
          Grade: data[i][2],
          Room: data[i][3],
          Seat_No: data[i][4],
          Status: data[i][5],
          Coins_Balance: data[i][6],
          Total_Coins_Earned: data[i][7]
        }
      });
    }
  }
  throw new Error('ไม่พบข้อมูลนักเรียน');
}

function submitTrash(payload) {
  const { Student_ID, imageBase64 } = payload;
  if (!Student_ID || !imageBase64) throw new Error('ข้อมูลไม่ครบถ้วน');
  
  const txId = 'TX' + Date.now().toString().slice(-8);
  const { url, fileId } = saveImageToDrive(imageBase64, txId + '_' + Student_ID);
  
  const sheet = getSheet('Transactions');
  const datetime = new Date().toISOString();
  sheet.appendRow([txId, datetime, Student_ID, url, fileId, 'Pending', 0]);
  
  return outputJSON({ success: true, message: 'ส่งรายการขยะสำเร็จ', data: { Tx_ID: txId } });
}

function getStudentStatus(payload) {
  const { Student_ID } = payload;
  
  const memberRes = getStudent({ Student_ID });
  const memberJson = JSON.parse(memberRes.getContent());
  if (!memberJson.success) throw new Error(memberJson.error);
  const memberData = memberJson.data;
  
  const txSheet = getSheet('Transactions');
  const txData = txSheet.getDataRange().getValues();
  const history = [];
  const pendingTransactions = [];
  
  for (let i = 1; i < txData.length; i++) {
    if (String(txData[i][2]) === String(Student_ID)) {
      const tx = {
        Tx_ID: txData[i][0],
        Datetime: txData[i][1],
        Student_ID: txData[i][2],
        Image_URL: txData[i][3],
        Drive_File_ID: txData[i][4],
        Status: txData[i][5],
        Coins_Awarded: txData[i][6]
      };
      history.push(tx);
      if (tx.Status === 'Pending') pendingTransactions.push(tx);
    }
  }
  
  const redSheet = getSheet('Redemptions');
  const redData = redSheet.getDataRange().getValues();
  const pendingRedemptions = [];
  
  for (let i = 1; i < redData.length; i++) {
    if (String(redData[i][2]) === String(Student_ID)) {
      const red = {
        Redeem_ID: redData[i][0],
        Datetime: redData[i][1],
        Student_ID: redData[i][2],
        Reward_ID: redData[i][3],
        Coins_Used: redData[i][4],
        Status: redData[i][5]
      };
      if (red.Status === 'Pending_Pickup') pendingRedemptions.push(red);
    }
  }
  
  return outputJSON({
    success: true,
    data: {
      member: memberData,
      history,
      pendingTransactions,
      pendingRedemptions
    }
  });
}

function cancelTrash(payload) {
  const { Tx_ID, Student_ID } = payload;
  const sheet = getSheet('Transactions');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(Tx_ID) && String(data[i][2]) === String(Student_ID)) {
      if (data[i][5] === 'Pending') {
        sheet.getRange(i + 1, 6).setValue('Cancelled');
        const fileId = data[i][4];
        if (fileId) deleteImageFromDrive(fileId);
        return outputJSON({ success: true, message: 'ยกเลิกรายการสำเร็จ' });
      } else {
        throw new Error('ไม่สามารถยกเลิกรายการนี้ได้ เนื่องจากสถานะไม่ใช่ Pending');
      }
    }
  }
  throw new Error('ไม่พบรายการขยะที่ระบุ');
}

function getRewards() {
  const sheet = getSheet('Rewards');
  const data = sheet.getDataRange().getValues();
  const rewards = [];
  for (let i = 1; i < data.length; i++) {
    rewards.push({
      Reward_ID: data[i][0],
      Name: data[i][1],
      Coin_Cost: data[i][2],
      Stock: data[i][3],
      Description: data[i][4],
      Success_Message: data[i][5],
      Image_URL: data[i][6]
    });
  }
  return outputJSON({ success: true, data: rewards });
}

function redeemReward(payload) {
  const { Student_ID, Reward_ID } = payload;
  
  const mSheet = getSheet('Members');
  const mData = mSheet.getDataRange().getValues();
  let mRow = -1;
  let balance = 0;
  for (let i = 1; i < mData.length; i++) {
    if (String(mData[i][0]) === String(Student_ID)) {
      mRow = i + 1;
      balance = Number(mData[i][6]);
      break;
    }
  }
  if (mRow === -1) throw new Error('ไม่พบข้อมูลนักเรียน');
  
  const rSheet = getSheet('Rewards');
  const rData = rSheet.getDataRange().getValues();
  let rRow = -1;
  let cost = 0;
  let stock = 0;
  let successMsg = '';
  for (let i = 1; i < rData.length; i++) {
    if (String(rData[i][0]) === String(Reward_ID)) {
      rRow = i + 1;
      cost = Number(rData[i][2]);
      stock = Number(rData[i][3]);
      successMsg = rData[i][5];
      break;
    }
  }
  if (rRow === -1) throw new Error('ไม่พบของรางวัลที่ระบุ');
  
  if (balance < cost) throw new Error('เหรียญไม่เพียงพอ');
  if (stock <= 0) throw new Error('ของรางวัลหมดสต็อก');
  
  const redSheet = getSheet('Redemptions');
  const redData = redSheet.getDataRange().getValues();
  for (let i = 1; i < redData.length; i++) {
    if (String(redData[i][2]) === String(Student_ID) && String(redData[i][3]) === String(Reward_ID) && redData[i][5] !== 'Cancelled' && redData[i][5] !== 'Completed') {
      throw new Error('คุณมีรายการแลกของรางวัลนี้ที่ยังไม่ได้รับ');
    }
  }
  
  // Deduct
  mSheet.getRange(mRow, 7).setValue(balance - cost);
  rSheet.getRange(rRow, 4).setValue(stock - 1);
  
  // Append
  const redeemId = 'RD' + Date.now().toString().slice(-8);
  redSheet.appendRow([redeemId, new Date().toISOString(), Student_ID, Reward_ID, cost, 'Pending_Pickup']);
  
  return outputJSON({ success: true, data: { successMessage: successMsg }, message: 'แลกของรางวัลสำเร็จ' });
}

function cancelRedemption(payload) {
  const { Redeem_ID, Student_ID } = payload;
  const redSheet = getSheet('Redemptions');
  const redData = redSheet.getDataRange().getValues();
  
  let redRow = -1;
  let rewardId = '';
  let coinsUsed = 0;
  for (let i = 1; i < redData.length; i++) {
    if (String(redData[i][0]) === String(Redeem_ID) && String(redData[i][2]) === String(Student_ID)) {
      if (redData[i][5] !== 'Pending_Pickup') throw new Error('ไม่สามารถยกเลิกได้ เนื่องจากสถานะไม่ใช่ Pending_Pickup');
      redRow = i + 1;
      rewardId = redData[i][3];
      coinsUsed = Number(redData[i][4]);
      break;
    }
  }
  if (redRow === -1) throw new Error('ไม่พบรายการแลกรางวัล');
  
  const mSheet = getSheet('Members');
  const mData = mSheet.getDataRange().getValues();
  for (let i = 1; i < mData.length; i++) {
    if (String(mData[i][0]) === String(Student_ID)) {
      const balance = Number(mData[i][6]);
      mSheet.getRange(i + 1, 7).setValue(balance + coinsUsed);
      break;
    }
  }
  
  const rSheet = getSheet('Rewards');
  const rData = rSheet.getDataRange().getValues();
  for (let i = 1; i < rData.length; i++) {
    if (String(rData[i][0]) === String(rewardId)) {
      const stock = Number(rData[i][3]);
      rSheet.getRange(i + 1, 4).setValue(stock + 1);
      break;
    }
  }
  
  redSheet.getRange(redRow, 6).setValue('Cancelled');
  return outputJSON({ success: true, message: 'ยกเลิกการแลกของรางวัลสำเร็จ คืนเหรียญแล้ว' });
}

function getLeaderboard() {
  const sheet = getSheet('Members');
  const data = sheet.getDataRange().getValues();
  let members = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][5] === 'Active') {
      members.push({
        Student_ID: data[i][0],
        Full_Name: data[i][1],
        Grade: data[i][2],
        Room: data[i][3],
        Total_Coins_Earned: Number(data[i][7])
      });
    }
  }
  
  members.sort((a, b) => b.Total_Coins_Earned - a.Total_Coins_Earned);
  return outputJSON({ success: true, data: members });
}

function getInitialData() {
  const mSheet = getSheet('Members');
  const mData = mSheet.getDataRange().getValues();
  const members = [];
  for (let i = 1; i < mData.length; i++) {
    members.push({
      Student_ID: mData[i][0],
      Full_Name: mData[i][1],
      Grade: mData[i][2],
      Room: mData[i][3],
      Seat_No: mData[i][4],
      Status: mData[i][5],
      Coins_Balance: mData[i][6],
      Total_Coins_Earned: mData[i][7]
    });
  }
  
  const rSheet = getSheet('Rewards');
  const rData = rSheet.getDataRange().getValues();
  const rewards = [];
  for (let i = 1; i < rData.length; i++) {
    rewards.push({
      Reward_ID: rData[i][0],
      Name: rData[i][1],
      Coin_Cost: rData[i][2],
      Stock: rData[i][3],
      Description: rData[i][4],
      Success_Message: rData[i][5],
      Image_URL: rData[i][6]
    });
  }
  
  const txSheet = getSheet('Transactions');
  const txData = txSheet.getDataRange().getValues();
  const transactions = [];
  for (let i = 1; i < txData.length; i++) {
    transactions.push({
      Tx_ID: txData[i][0],
      Datetime: txData[i][1],
      Student_ID: txData[i][2],
      Image_URL: txData[i][3],
      Drive_File_ID: txData[i][4],
      Status: txData[i][5],
      Coins_Awarded: txData[i][6]
    });
  }
  
  const redSheet = getSheet('Redemptions');
  const redData = redSheet.getDataRange().getValues();
  const redemptions = [];
  for (let i = 1; i < redData.length; i++) {
    redemptions.push({
      Redeem_ID: redData[i][0],
      Datetime: redData[i][1],
      Student_ID: redData[i][2],
      Reward_ID: redData[i][3],
      Coins_Used: redData[i][4],
      Status: redData[i][5]
    });
  }
  
  return outputJSON({ success: true, data: { members, rewards, transactions, redemptions } });
}


// ---------------- Admin Actions ----------------

function getRewardsAdmin() {
  return getRewards();
}

function getPendingTrash() {
  const txSheet = getSheet('Transactions');
  const txData = txSheet.getDataRange().getValues();
  const mSheet = getSheet('Members');
  const mData = mSheet.getDataRange().getValues();
  
  const memberMap = {};
  for (let i = 1; i < mData.length; i++) {
    memberMap[String(mData[i][0])] = {
      Full_Name: mData[i][1],
      Grade: mData[i][2],
      Room: mData[i][3]
    };
  }
  
  const pending = [];
  for (let i = 1; i < txData.length; i++) {
    if (txData[i][5] === 'Pending') {
      const stuId = String(txData[i][2]);
      pending.push({
        Tx_ID: txData[i][0],
        Datetime: txData[i][1],
        Student_ID: stuId,
        Image_URL: txData[i][3],
        Drive_File_ID: txData[i][4],
        Status: txData[i][5],
        Full_Name: memberMap[stuId] ? memberMap[stuId].Full_Name : 'Unknown',
        Grade: memberMap[stuId] ? memberMap[stuId].Grade : '',
        Room: memberMap[stuId] ? memberMap[stuId].Room : ''
      });
    }
  }
  return outputJSON({ success: true, data: pending });
}

function approveTrash(payload) {
  const { Tx_ID, Coins_Awarded } = payload;
  const coins = Number(Coins_Awarded) || 0;
  if (coins <= 0) throw new Error('จำนวนเหรียญต้องมากกว่า 0');
  
  const txSheet = getSheet('Transactions');
  const txData = txSheet.getDataRange().getValues();
  let txRow = -1;
  let stuId = '';
  
  for (let i = 1; i < txData.length; i++) {
    if (String(txData[i][0]) === String(Tx_ID)) {
      if (txData[i][5] !== 'Pending') throw new Error('รายการไม่ได้อยู่ในสถานะ Pending');
      txRow = i + 1;
      stuId = String(txData[i][2]);
      break;
    }
  }
  if (txRow === -1) throw new Error('ไม่พบรายการขยะ');
  
  txSheet.getRange(txRow, 6).setValue('Approved');
  txSheet.getRange(txRow, 7).setValue(coins);
  
  const mSheet = getSheet('Members');
  const mData = mSheet.getDataRange().getValues();
  for (let i = 1; i < mData.length; i++) {
    if (String(mData[i][0]) === stuId) {
      const balance = Number(mData[i][6]) || 0;
      const totalEarned = Number(mData[i][7]) || 0;
      mSheet.getRange(i + 1, 7).setValue(balance + coins);
      mSheet.getRange(i + 1, 8).setValue(totalEarned + coins);
      break;
    }
  }
  return outputJSON({ success: true, message: 'อนุมัติรายการสำเร็จ' });
}

function rejectTrash(payload) {
  const { Tx_ID } = payload;
  const txSheet = getSheet('Transactions');
  const txData = txSheet.getDataRange().getValues();
  
  for (let i = 1; i < txData.length; i++) {
    if (String(txData[i][0]) === String(Tx_ID)) {
      if (txData[i][5] !== 'Pending') throw new Error('รายการไม่ได้อยู่ในสถานะ Pending');
      txSheet.getRange(i + 1, 6).setValue('Rejected');
      const fileId = txData[i][4];
      if (fileId) deleteImageFromDrive(fileId);
      return outputJSON({ success: true, message: 'ปฏิเสธรายการสำเร็จ' });
    }
  }
  throw new Error('ไม่พบรายการขยะ');
}

function getPendingRedemptions() {
  const redSheet = getSheet('Redemptions');
  const redData = redSheet.getDataRange().getValues();
  
  const mSheet = getSheet('Members');
  const mData = mSheet.getDataRange().getValues();
  const memberMap = {};
  for (let i = 1; i < mData.length; i++) {
    memberMap[String(mData[i][0])] = mData[i][1];
  }
  
  const rSheet = getSheet('Rewards');
  const rData = rSheet.getDataRange().getValues();
  const rewardMap = {};
  for (let i = 1; i < rData.length; i++) {
    rewardMap[String(rData[i][0])] = rData[i][1];
  }
  
  const pending = [];
  for (let i = 1; i < redData.length; i++) {
    if (redData[i][5] === 'Pending_Pickup') {
      const stuId = String(redData[i][2]);
      const rewId = String(redData[i][3]);
      pending.push({
        Redeem_ID: redData[i][0],
        Datetime: redData[i][1],
        Student_ID: stuId,
        Full_Name: memberMap[stuId] || 'Unknown',
        Reward_ID: rewId,
        Reward_Name: rewardMap[rewId] || 'Unknown',
        Coins_Used: redData[i][4],
        Status: redData[i][5]
      });
    }
  }
  return outputJSON({ success: true, data: pending });
}

function confirmHandover(payload) {
  const { Redeem_ID } = payload;
  const redSheet = getSheet('Redemptions');
  const redData = redSheet.getDataRange().getValues();
  
  for (let i = 1; i < redData.length; i++) {
    if (String(redData[i][0]) === String(Redeem_ID)) {
      if (redData[i][5] !== 'Pending_Pickup') throw new Error('รายการไม่ได้อยู่ในสถานะรอรับของ');
      redSheet.getRange(i + 1, 6).setValue('Completed');
      return outputJSON({ success: true, message: 'ยืนยันการส่งมอบสำเร็จ' });
    }
  }
  throw new Error('ไม่พบรายการแลกรางวัล');
}

function addReward(payload) {
  const { Name, Coin_Cost, Stock, Description, Success_Message, Image_URL } = payload;
  const sheet = getSheet('Rewards');
  const rewardId = 'RW' + Date.now().toString().slice(-6);
  sheet.appendRow([rewardId, Name, Coin_Cost, Stock, Description || '', Success_Message || '', Image_URL || '']);
  return outputJSON({ success: true, message: 'เพิ่มของรางวัลสำเร็จ' });
}

function editReward(payload) {
  const { Reward_ID, Name, Coin_Cost, Stock, Description, Success_Message, Image_URL } = payload;
  const sheet = getSheet('Rewards');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(Reward_ID)) {
      sheet.getRange(i + 1, 2).setValue(Name);
      sheet.getRange(i + 1, 3).setValue(Coin_Cost);
      sheet.getRange(i + 1, 4).setValue(Stock);
      sheet.getRange(i + 1, 5).setValue(Description || '');
      sheet.getRange(i + 1, 6).setValue(Success_Message || '');
      sheet.getRange(i + 1, 7).setValue(Image_URL || '');
      return outputJSON({ success: true, message: 'แก้ไขของรางวัลสำเร็จ' });
    }
  }
  throw new Error('ไม่พบของรางวัลที่ต้องการแก้ไข');
}

function deleteReward(payload) {
  const { Reward_ID } = payload;
  const sheet = getSheet('Rewards');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(Reward_ID)) {
      sheet.deleteRow(i + 1);
      return outputJSON({ success: true, message: 'ลบของรางวัลสำเร็จ' });
    }
  }
  throw new Error('ไม่พบของรางวัลที่ต้องการลบ');
}

function getMembers() {
  const sheet = getSheet('Members');
  const data = sheet.getDataRange().getValues();
  const members = [];
  
  for (let i = 1; i < data.length; i++) {
    members.push({
      Student_ID: data[i][0],
      Full_Name: data[i][1],
      Grade: data[i][2],
      Room: data[i][3],
      Seat_No: data[i][4],
      Status: data[i][5],
      Coins_Balance: data[i][6],
      Total_Coins_Earned: data[i][7]
    });
  }
  return outputJSON({ success: true, data: members });
}

function updateMemberAdmin(payload) {
  const { Student_ID, Full_Name, Grade, Room, Seat_No, Coins_Balance } = payload;
  const sheet = getSheet('Members');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(Student_ID)) {
      sheet.getRange(i + 1, 2).setValue(Full_Name);
      sheet.getRange(i + 1, 3).setValue(Grade);
      sheet.getRange(i + 1, 4).setValue(Room || '');
      sheet.getRange(i + 1, 5).setValue(Seat_No || '');
      if (Coins_Balance !== undefined) {
        sheet.getRange(i + 1, 7).setValue(Number(Coins_Balance));
      }
      return outputJSON({ success: true, message: 'อัปเดตข้อมูลนักเรียนสำเร็จ' });
    }
  }
  throw new Error('ไม่พบข้อมูลนักเรียน');
}

function deleteMember(payload) {
  const { Student_ID } = payload;
  const sheet = getSheet('Members');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(Student_ID)) {
      sheet.deleteRow(i + 1);
      return outputJSON({ success: true, message: 'ลบข้อมูลนักเรียนสำเร็จ' });
    }
  }
  throw new Error('ไม่พบข้อมูลนักเรียนที่ต้องการลบ');
}

function promoteGrades() {
  const sheet = getSheet('Members');
  const data = sheet.getDataRange().getValues();
  
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    const grade = String(data[i][2]);
    let newGrade = grade;
    if (grade === 'ม.1') newGrade = 'ม.2';
    else if (grade === 'ม.2') newGrade = 'ม.3';
    else if (grade === 'ม.3') newGrade = 'ม.4';
    else if (grade === 'ม.4') newGrade = 'ม.5';
    else if (grade === 'ม.5') newGrade = 'ม.6';
    else if (grade === 'ม.6') newGrade = 'Graduated';
    
    if (newGrade !== grade) {
      sheet.getRange(i + 1, 3).setValue(newGrade);
      count++;
    }
  }
  return outputJSON({ success: true, message: `เลื่อนชั้นนักเรียนสำเร็จทั้งหมด ${count} คน` });
}

// ---------------- Drive Functions ----------------

function getOrCreateImageFolder() {
  const folderName = 'WasteBank_Images';
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return DriveApp.createFolder(folderName);
  }
}

function saveImageToDrive(base64Data, fileName) {
  const folder = getOrCreateImageFolder();
  const contentType = base64Data.substring(5, base64Data.indexOf(';'));
  const b64 = base64Data.split(',')[1];
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), contentType, fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return {
    url: file.getUrl(),
    fileId: file.getId()
  };
}

function deleteImageFromDrive(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    file.setTrashed(true);
  } catch (e) {
    console.error('Error deleting file: ' + e.message);
  }
}
