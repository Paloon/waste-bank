# ♻️ Waste Bank System (ระบบธนาคารขยะโรงเรียน)

ระบบบริหารจัดการธนาคารขยะสำหรับโรงเรียน พัฒนาด้วยแนวคิด Serverless โดยใช้ **HTML/Tailwind CSS** ในส่วนของ Frontend และ **Google Apps Script + Google Sheets** ในส่วนของ Backend และ Database

![Waste Bank System](https://img.shields.io/badge/Status-Active-brightgreen)
![Designed By](https://img.shields.io/badge/Designed%20by-Pragasit%20Suriya-blue)

## 🌟 ฟีเจอร์หลัก (Features)

*   **📊 แดชบอร์ดสรุปผล:** แสดงยอดรวมน้ำหนักขยะ (ขวด/กระป๋อง), รายได้ทั้งหมด, รายจ่าย และเงินคงเหลือ พร้อมระบบกรองตามวันที่
*   **🧑‍🎓 ระบบสมาชิก:** นักเรียนสามารถลงทะเบียนใช้งานได้ด้วยตัวเองผ่านหน้าเว็บ
*   **⚖️ ระบบขายขยะ (Self-Service):** นักเรียนสามารถทำรายการฝากขยะและระบบจะคำนวณเงินให้อัตโนมัติตามเรทราคา
*   **🔍 เช็กประวัติและยอดเงิน:** ค้นหารหัสนักเรียนเพื่อดูยอดเงินสะสมและประวัติการทำรายการล่าสุด
*   **🏆 กระดานผู้นำ (Leaderboard):** จัดอันดับนักเรียนที่นำขยะมาฝากเยอะที่สุด 10 อันดับแรก
*   **🔒 โหมดผู้ดูแลระบบ (Admin):** 
    *   ป้องกันด้วยระบบ PIN Code
    *   ระบบจ่ายเงินสด/ถอนเงินให้นักเรียน
    *   ระบบเลื่อนชั้นนักเรียนประจำปีอัตโนมัติ
    *   ตั้งค่าเรทราคารับซื้อขยะได้เอง

## 🛠️ เทคโนโลยีที่ใช้ (Tech Stack)

*   **Frontend:** HTML5, CSS3, JavaScript (Vanilla), Tailwind CSS (ผ่าน CDN), FontAwesome
*   **Backend & API:** Google Apps Script (GAS)
*   **Database:** Google Sheets

## 🚀 วิธีการติดตั้งและใช้งาน (Setup Guide)

### 1. ส่วนฐานข้อมูล (Backend)
1. สร้างไฟล์ **Google Sheets** ใหม่ และสร้างแท็บ (Sheet) ชื่อดังต่อไปนี้: `Config`, `Members`, `Transactions`, `Payouts`
2. ไปที่เมนู `ส่วนขยาย (Extensions) -> Apps Script`
3. คัดลอกโค้ดจากไฟล์ `backend/Code.js` ไปวางทับในหน้า Apps Script
4. กดบันทึก (Save)
5. กดปุ่ม `Deploy -> Manage deployments -> New version`
6. ตั้งค่าการเข้าถึง: `Execute as: Me` และ `Who has access: Anyone`
7. คัดลอก **Web app URL** ที่ได้รับมา

### 2. ส่วนแสดงผล (Frontend)
1. เปิดไฟล์ `frontend/app.js`
2. นำ **Web app URL** ที่คัดลอกไว้ ไปวางแทนที่ในบรรทัดแรก:
   ```javascript
   const API_URL = 'YOUR_WEB_APP_URL_HERE';
   ```
3. รันไฟล์ `index.html` บนเบราว์เซอร์เพื่อเริ่มใช้งานได้ทันที (หรือนำไป Host บน GitHub Pages ฟรี)

## 🛡️ ความปลอดภัย (Security)
* รหัส PIN ของ Admin จะถูกตั้งค่าไว้ที่ฝั่ง Google Sheets (`Config` tab) ทำให้ไม่สามารถเจาะดูจากฝั่ง Frontend ได้
* ตัวแปร SPREADSHEET_ID ไม่ได้ถูกเก็บไว้ในโค้ด ทำให้ไม่มีใครรู้ว่าฐานข้อมูลจริงอยู่ที่ไหน

---
💻 Designed & Developed with ❤️ by **Pragasit Suriya**
