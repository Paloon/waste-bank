# waste-bank

เว็บธนาคารขยะโรงเรียนภาษาไทย สร้างใหม่แทน Google Apps Script เดิม เหมาะกับแท็บเล็ตและคีออสก์

## เปิดใช้งานในเครื่อง

ใช้ Node.js 22.13+ (แนะนำรุ่น LTS ที่ยังได้รับการดูแล)

```sh
npm install
npm run dev
```

เปิด http://localhost:3000 — เซิร์ฟเวอร์สร้างข้อมูลสาธิตเมื่อเปิดครั้งแรก

- นักเรียนตัวอย่าง: เลขประจำตัว `65001`–`65012` ไม่ใช้ PIN
- นักเรียนใหม่สมัครเองด้วยชื่อ–นามสกุล เลขที่ เลขประจำตัว ระดับชั้น ม.1–ม.6 และห้อง (เก็บระดับชั้นกับห้องแยกกัน)
- เจ้าหน้าที่: `teacher.mali` / PIN สุ่มเฉพาะการติดตั้ง อยู่ใน `data/demo-credentials.txt`
- เจ้าหน้าที่ใช้ PIN ที่ผ่าน scrypt; ฝั่งนักเรียนเข้าด้วยเลขประจำตัวโดยไม่มีรหัสผ่าน และ session ใช้ HttpOnly cookie
- ข้อมูลรายการ/Coins อยู่ที่ `data/eco.sqlite` คงอยู่หลังปิดโปรแกรม ไม่ใช่ localStorage
- `.env.example` มีการตั้งค่า port, ที่เก็บข้อมูล, อายุหลักฐาน และ HTTPS cookie

```sh
npm test
npm run build
npm start
```

`npm start` ให้บริการ build ที่สร้างแล้ว ส่วน `npm run dev` ใช้ Vite ผ่าน Node server เดียวกัน

ทดสอบ browser workflow: หลัง build แล้วรัน `node tests/browser.mjs` (ใช้ Microsoft Edge ที่ติดตั้งในเครื่อง) แยกฐานข้อมูลทดสอบชั่วคราวจากข้อมูลใช้งาน

## ฟีเจอร์

- ส่งขยะพร้อมถ่ายรูป/อัปโหลด ย่อและบีบอัดให้ไม่เกิน 400 KiB ต่อภาพ เลือกประเภทและหมายเหตุ ตรวจภาพซ้ำ
- สมัครบัญชีเอง ดู Coins และประวัติขยะ/Coins/รางวัล แก้โปรไฟล์และยกเลิกเฉพาะรายการรอตรวจโดยไม่ใช้รหัสผ่าน
- แลกรางวัลตรวจ Coins/สต็อก สร้างรหัสรับของ สถานะรอรับ
- เจ้าหน้าที่อนุมัติ/ปฏิเสธพร้อมเหตุผลและน้ำหนัก ตรวจบัตรก่อนส่งมอบ ยกเลิกและคืน Coins/สต็อก
- ค้นหานักเรียน แก้ข้อมูล/สถานะ เลือกหลายคนเพื่อลบบัญชีพร้อมประวัติและรูป ปรับ Coins พร้อมเหตุผลและยืนยันจำนวนมาก
- เพิ่ม/แก้รางวัลพร้อมรูปได้สูงสุด 5 รูป จัดกรอบด้วยการลากและซูม เลื่อนดู/เปิดภาพเต็ม ราคา สต็อก และเปิด/ปิดการแลก
- อันดับรวม รายเดือน ชั้น/ห้อง และค้นหาอันดับ ไม่แสดงรหัสนักเรียนบนตารางสาธารณะ
- Preview เลื่อนชั้น แก้ข้อยกเว้นรายคน ป้องกันเลื่อนซ้ำในปีเดียวกัน
- Audit log เก็บผู้ทำ เวลา ค่าเดิม/ใหม่ และเหตุผล ค้นหาและกรองได้
- ล้างหน้าจอหลังไม่มีการใช้งาน 90 วินาที หรือ 12 วินาทีหลังทำรายการสำเร็จ
- หลักฐานที่ถูกปฏิเสธลบหลัง `RETENTION_DAYS` (เริ่มต้น 30 วัน ตรวจทุกชั่วโมง)

## ความถูกต้องของข้อมูล

ยอด Coins มาจาก ledger ไม่มี API เขียนทับยอดโดยตรง การแลก/คืนของ/อนุมัติทำพร้อม ledger ใน SQLite transaction ใช้ request key ป้องกันคำขอเดิมซ้ำ และตรวจสถานะล่าสุดฝั่งเซิร์ฟเวอร์

ข้อมูลตัวอย่างเป็นข้อมูลสมมติ ภาพหลักฐานเก่าแสดงป้ายข้อมูลตัวอย่าง ส่วนภาพที่อัปโหลดจริงแสดงในหน้าตรวจและประวัติ รูปรางวัลเริ่มต้นใช้ไอคอนและสามารถเปลี่ยนเป็นภาพจริงได้

## เชื่อม Google Drive

รูปใหม่จะส่งไป Drive เมื่อกำหนด OAuth และเชื่อมบัญชีแล้ว: `evidence` เก็บภาพที่รอตรวจ/ไม่ผ่าน, ภาพที่อนุมัติย้ายไป `waste picture`, `rewards` เก็บรูปรางวัล ภาพใน Drive ไม่ได้เปิด public; เว็บอ่านผ่าน API ที่ตรวจ session (รูปรางวัลอ่านได้สาธารณะ) รูปเก่าใน SQLite ยังคงอ่านได้และยังไม่ได้ย้าย

1. ใน Google Cloud Console ของบัญชีที่ต้องการ เปิด **Google Drive API** และสร้าง **OAuth Client ID ประเภท Web application** ตั้ง redirect URI เป็น `http://localhost:3000/api/drive/callback` และตั้ง OAuth consent screen โดยเพิ่มบัญชีโรงเรียนเป็น test user หากแอปยังอยู่ในโหมด Testing อย่าเปิด billing หรือ Free Trial เพื่อทำขั้นตอนนี้
2. คัดลอก `.env.example` เป็น `.env` แล้วใส่ `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` และ ID โฟลเดอร์ทั้งสาม ห้าม commit `.env` หรือ `data/drive-oauth.json` ขึ้น GitHub
3. รีสตาร์ต `npm run dev` เข้าระบบเจ้าหน้าที่ แล้วเปิด `/api/drive/connect` ในเบราว์เซอร์เดียวกัน เลือกบัญชี Drive ที่เป็นเจ้าของโฟลเดอร์ Google จะขอสิทธิ์ **ดูและจัดการไฟล์ทั้งหมดใน Drive** เพราะโฟลเดอร์ถูกสร้างด้วยมือก่อนเชื่อมแอป; ให้ตัดสินใจเรื่องสิทธิ์นี้เอง
4. หลังกลับมาที่เว็บ ตรวจ `/api/drive/status` (ต้องล็อกอินเจ้าหน้าที่) ว่า `configured` และ `connected` เป็น `true` แล้วทดลองส่งรูปและตรวจใน Drive

**สถานะ:** เครื่องพัฒนาใช้ SQLite ใน `data/eco.sqlite`; Vercel ใช้ Supabase และเก็บ OAuth token ของ Google Drive ในตาราง `waste_bank_secrets` รูปอยู่ใน Google Drive เท่านั้น

## ขึ้นเว็บ Vercel + Supabase

1. สร้าง Supabase โปรเจกต์ แล้วรัน [supabase/schema.sql](supabase/schema.sql) ใน SQL Editor ตารางเปิด RLS และอนุญาตเฉพาะ service role
2. สร้าง `.env.cloud.local` (Git ไม่ติดตาม) ใส่ `SUPABASE_URL`, `SUPABASE_SECRET_KEY` และ `DATA_DIR=./data`; รัน `npm run migrate:supabase` เพื่อย้าย SQLite และ Drive OAuth token จากเครื่อง **หนึ่งครั้ง** ถ้าตารางมีข้อมูลแล้ว สคริปต์ไม่เขียนทับ
3. Import GitHub Repo นี้เข้า Vercel เลือก Vite และตั้ง Environment Variables: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SESSION_SECRET` (ค่าสุ่มยาวอย่างน้อย 32 ไบต์), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DRIVE_WASTE_FOLDER_ID`, `DRIVE_REWARDS_FOLDER_ID`, `DRIVE_EVIDENCE_FOLDER_ID`, `CRON_SECRET`, และ `PUBLIC_BASE_URL=https://<โดเมนจริง>`; ค่า secret ทั้งหมดอยู่ฝั่งเซิร์ฟเวอร์ ไม่ใส่ `VITE_` นำหน้า
4. Deploy แล้วตรวจ `/api/public`, สมัคร/เข้าสู่ระบบ, ส่งรูป, อนุมัติ และแลกรางวัล หากต้องเชื่อม Google Drive ใหม่ ให้เพิ่ม `https://<โดเมนจริง>/api/drive/callback` ใน Authorized redirect URIs ของ Google OAuth Client เดิม

Vercel ใช้ `api/index.js` สำหรับ Express Functions, ส่วนหน้าเว็บเป็นไฟล์ Vite ใน `dist` Session ลงลายเซ็นด้วย `SESSION_SECRET` และอยู่ได้ 2 นาที ข้อมูล Coins/สต็อกบันทึกแบบตรวจ version ใน PostgreSQL เพื่อไม่ให้คำขอพร้อมกันเขียนทับกัน Cron ลบหลักฐานที่หมดอายุวันละครั้ง

Repo: https://github.com/Paloon/waste-bank ควรใช้ GitHub Free แบบ Private สำหรับโค้ด โดยไม่ใส่ข้อมูลนักเรียนหรือคีย์ลง repo

ก่อนใช้งานจริงต้องตั้ง HTTPS, ระบบสิทธิ์เจ้าหน้าที่, private images, rate limit ข้าม instance, backup/restore และนโยบายเก็บรักษาข้อมูลนักเรียน ห้ามใช้บัญชีสาธิตกับข้อมูลจริง

## โครงสร้าง

- `src/main.jsx`, `src/style.css` — React SPA และ responsive UI
- `server/store.js` — กติกาธุรกิจ ledger / สต็อก / SQLite สำหรับเครื่องพัฒนา
- `server/cloud-store.js`, `supabase/schema.sql` — Supabase และการบันทึกแบบตรวจ version
- `server/index.js` — API, sessions, PIN verification, retention, Vite/static hosting
- `tests/store.test.js` — ทดสอบ invariants ของ Coins, สิทธิ์ และข้อมูล

แพ็กเกจ: https://supabase.com/pricing · https://developers.cloudflare.com/r2/pricing/ · https://github.com/pricing
