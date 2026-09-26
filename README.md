# waste-bank

ธนาคารขยะโรงเรียน React/Vite + Express ใช้ SQLite ในเครื่อง และ Supabase PostgreSQL + Google Drive บน Vercel

นักเรียนยังใช้เลขประจำตัวโดยไม่มี PIN สมัครเอง แก้โปรไฟล์และใช้ Coins ได้ตามข้อกำหนด การรู้เลขนักเรียนจึงยังสวมบัญชีได้ ระบบไม่อ้างว่าตรวจตัวตนนักเรียนได้อย่างน่าเชื่อถือ

## ทดลองในเครื่อง

ใช้ Node.js 22.13+:

```sh
npm ci
npm run dev
```

เปิด http://localhost:3000 ข้อมูลสมมติสร้างเฉพาะโหมดพัฒนา เจ้าหน้าที่ตัวอย่างอยู่ใน `data/demo-credentials.txt` อย่านำบัญชีสาธิตไปใช้กับข้อมูลจริง

```sh
npm run test:all
npm run test:load
```

Browser test ใช้ Edge ใน Windows และ Chromium ใน CI โดยแยกฐานข้อมูลชั่วคราวทั้งหมด `npm start` เป็น production server ต้องตั้ง HTTPS, secrets และ reverse proxy ตามคู่มือก่อน

## สิ่งที่ระบบตรวจฝั่ง Server

- Opaque session ที่เพิกถอนได้, idle/absolute expiry, ตรวจสถานะบัญชีทุกครั้ง
- Rate limit ตาม IP และบัญชี เก็บร่วมกันใน DB ไม่ผูกกับ Vercel instance
- Ledger/สต็อกใน transaction, version check ของฟอร์มรางวัล, request fingerprint และ key หมดอายุ
- Preview เลื่อนชั้นที่ตรวจข้อมูลล่าสุด รายชื่อครบ ปี และเลขที่ไม่ซ้ำ
- Schema validation, decode/re-encode รูปด้วย Sharp และลบ metadata
- คิวลบ/ย้ายรูปที่ retry ได้ ไม่ลบรูปทันทีเมื่อไม่แน่ใจว่า commit สำเร็จหรือไม่
- Audit สำหรับธุรกรรมสำคัญ, การกระทบยอด, health dashboard และ backup เข้ารหัสพร้อมรูป
- ตาราง/ประวัติแบบแบ่งหน้า, เตือนก่อน idle logout และป้องกัน response เก่าคืนข้อมูลหลังล้างหน้าจอ

## เปิดใช้จริง / อัปเกรดระบบเดิม

อ่าน [คู่มือ Free Plan, migration, backup/restore และ retention](docs/operations.md) ก่อน deploy การอัปเกรด schema v1 → v2 ต้องใช้ maintenance window พร้อม backup และเปลี่ยนโค้ดกับ SQL คู่กัน ไม่รัน SQL ใหม่ขณะโค้ดเก่ายังรับรายการ

ระบบใหม่ใช้ `supabase/schema.sql` และ `.env.example` ทุก secret อยู่ฝั่ง Server ห้ามใช้ prefix `VITE_` ไม่ต้องเพิ่มบริการเสียเงิน แต่ต้องติดตาม quota และซ้อมกู้คืนจริง

## โครงสร้างหลัก

- `server/app.js` — HTTP routes และ response ที่ปลอดภัย
- `server/security.js`, `credentials.js`, `validation.js` — session, PIN และ schema
- `server/store.js`, `actions.js` — กติกาธุรกิจและ transaction
- `server/cloud-store.js`, `state.js`, `supabase/schema.sql` — scoped reads, delta commits, relational partitions
- `server/maintenance.js`, `reconcile.js`, `backup.js` — งานดูแลระบบ
- `src/api.js`, `components.jsx`, `main.jsx` — request lifecycle, components และหน้าจอ
- `shared/` — policy และเวลาโรงเรียนที่ใช้ร่วมกัน
- `scripts/` — เจ้าหน้าที่, migration, backup/restore, ตรวจระบบ และ load จำลอง
- `tests/` — unit/API/PostgreSQL/browser regression tests

การตั้งค่าในบัญชี Vercel/Supabase/Drive จริง การรัน migration การติดตั้งงานสำรองรายวัน และการซ้อมกู้คืนบนข้อมูลโรงเรียนต้องทำตามคู่มือ การแก้ source code ไม่ได้ทำขั้นตอนเหล่านั้นให้อัตโนมัติ
