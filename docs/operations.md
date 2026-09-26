# ใช้งานบน Free Plan และย้ายระบบเดิม

## ขอบเขตที่ตั้งใจคงไว้

นักเรียนยังเข้าใช้ด้วยเลขประจำตัว ไม่มี PIN สมัครเอง ดูข้อมูลสาธารณะ แก้โปรไฟล์ และแลกรางวัลได้ตามเดิมตามข้อกำหนดของเจ้าของระบบ การทราบเลขนักเรียนจึงยังทำให้สวมบัญชีได้ การแก้รอบนี้ไม่ได้รับรองว่าความเสี่ยงข้อนี้หมดไป ควรใช้คีออสก์ภายใต้การดูแลของโรงเรียน

## ออกแบบสำหรับ Free Plan

- ใช้ Supabase เดิมสำหรับข้อมูล, opaque sessions, rate limit และสถานะงาน ไม่ต้องเพิ่ม Redis/Sentry/บริการเสียเงิน
- ตารางแยกตาม entity ผ่าน PostgreSQL partitions มี indexes ตามนักเรียน/สถานะ/เวลา และ commit เฉพาะ records ที่เปลี่ยน ใช้ revision เดียวเพื่อรักษาความสอดคล้องของ Coins/สต็อก มี retry/backoff
- session idle 90 วินาที, absolute 8 ชั่วโมง, heartbeat 20 วินาทีเมื่อมีการใช้งาน ถอนสิทธิ์ด้วย authVersion และลบ session ฝั่ง Server
- public summary cache ใน instance 15 วินาที ประวัติ/ตารางเจ้าหน้าที่ครั้งละ 50 รายการ การค้นหาทำก่อนแบ่งหน้า
- cron Vercel วันละครั้ง งานที่เหลือทำต่อรอบถัดไปหรือปุ่มเจ้าหน้าที่/คำสั่งจากเครื่องโรงเรียน งานล็อกกันซ้ำ 120 วินาที จำกัดเวลาทำงานแต่ละรอบ
- backup ทำบนเครื่องโรงเรียน พร้อมรูปแบบ incremental/deduplicated และเข้ารหัส AES-256-GCM ไม่ใช้พื้นที่ Drive เพิ่มสำหรับ backup
- เก็บ ledger ทั้งหมดเพื่อรักษายอด ไม่ล้างประวัติการเงินจริงเพื่อหลบ quota

ข้อจำกัด ณ วันที่ตรวจ 25 ก.ย. 2026: [Supabase Free](https://supabase.com/pricing) ระบุฐานข้อมูล 500 MB และ [Vercel Hobby cron](https://vercel.com/docs/cron-jobs/usage-and-pricing) เรียกได้วันละครั้ง ไม่รับประกันเวลาระดับนาที Free Plan มี quota และเงื่อนไขที่เปลี่ยนได้ ต้องตรวจ dashboard ของบัญชีจริง ไม่มีแผนฟรีที่รับประกันการโตไม่จำกัด

หน้าครูแสดงขนาด DB (เตือนเมื่อเกิน 400 MiB), quota บัญชี Drive (เตือนเกิน 80%), งานลบค้าง, การกระทบยอด, ข้อผิดพลาดล่าสุด และเวลาสำรองข้อมูล รูปจำนวน 100 รูป/วัน ที่ 400 KiB และเก็บ 365 วัน ใช้ประมาณ 14 GiB โดยยังไม่รวมไฟล์อื่นของบัญชี จึงควรตั้ง APPROVED_RETENTION_DAYS ให้เหมาะกับปริมาณจริง เช่น 180 วัน และติดตาม quota

## ย้าย deployment เดิมจาก schema v1

การเปลี่ยน schema ครั้งนี้ **ไม่เข้ากับโค้ดเก่า** ห้ามรัน migration ระหว่างที่ deployment เก่ายังรับรายการ

1. เปิด maintenance/deployment protection ที่หน้า hosting เพื่อหยุดรับรายการ ทดสอบทั้ง URL หลักและ deployment เก่าที่เข้าถึงได้
2. สำรองฐานข้อมูลเดิมด้วย [Supabase CLI dump](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) และสำรองรูปใน Drive แยกไว้ พร้อมเก็บค่า environment อย่างปลอดภัย สคริปต์ backup ใหม่ต้องใช้ schema v2 จึงยังใช้แทนขั้นตอนนี้ไม่ได้
3. ทดลองกู้สำเนานี้ใน staging ก่อน จากนั้นรัน `supabase/schema.sql` ใน SQL Editor ของ staging และตรวจ counts, ยอด Coins, stock, ภาพ และประวัติ ตัว migration ย้าย JSON เดิมใน transaction เดียว แล้วล้าง JSON สำเนาเดิม เมื่อรันซ้ำจะไม่ย้ายซ้ำ
4. รัน SQL เดียวกันใน production ขณะปิดรับรายการ Deploy โค้ดใหม่ **ใน maintenance window เดียวกัน** อย่า rollback เฉพาะโค้ดเก่า เพราะ RPC เก่าถูกถอดออกแล้ว
5. คง SUPABASE_URL, SUPABASE_SECRET_KEY และ Drive OAuth token เดิม ตรวจ SESSION_SECRET สุ่มอย่างน้อย 32 ไบต์, CRON_SECRET และ PUBLIC_BASE_URL เป็น HTTPS ห้ามใช้ VITE_ กับ secrets
6. สร้างบัญชีเจ้าหน้าที่จริงอย่างน้อยหนึ่งคนก่อน disable `teacher.mali` ตัวอย่าง คำสั่งด้านล่างทำให้ session เดิมของบัญชีที่เปลี่ยนข้อมูลหมดสิทธิ์
7. ทดสอบ login/logout, ใช้ cookie เก่าหลัง logout ต้องได้ 401, student flow ตามข้อยกเว้น, แลก/คืน, stale form, รูปและ cron จาก deployment จริง แล้วจึงเปิดรับรายการ

ถ้า migration หรือ verification ล้มเหลว ให้คง maintenance ไว้ กู้ DB **และ** โค้ดคู่เวอร์ชันที่ตรงกัน อย่าเปิดรับรายการบนข้อมูลที่กู้ไม่ครบ การกู้คืนต้องพิจารณารูปที่ถูกลบไปหลังเวลาของ backup ด้วย

## ตั้งระบบใหม่

1. `npm ci` และ `npm run dev` สำหรับทดลองด้วยข้อมูลสมมติในเครื่อง
2. สำหรับระบบจริง กำหนด `NODE_ENV=production`, `DEMO_MODE=0`, `PUBLIC_BASE_URL=https://...`, secrets และ proxy ที่เชื่อถือได้ให้ถูกต้อง ห้ามเปิดพอร์ต Node โดยตรงเมื่อ TRUST_PROXY=1
3. รัน schema.sql และสร้างเจ้าหน้าที่ผ่านคำสั่ง `staff` หรือเตรียม SQLite ใหม่ด้วย `DEMO_MODE=0 NODE_ENV=production` แล้ว import ด้วย `npm run migrate:supabase` หากมีข้อมูลเริ่มต้น
4. `.env.cloud.local` สำหรับ migration ต้องมี DATA_DIR, Supabase และ Drive config ที่จำเป็น สคริปต์ไม่สร้าง demo และไม่เขียนทับ cloud ที่มีข้อมูลอยู่แล้ว รูป inline จะถูกตรวจและย้ายไป Drive ก่อน import
5. เชื่อม Google Drive ผ่านหน้าเจ้าหน้าที่ ตรวจว่าโฟลเดอร์ทั้งสามไม่แชร์ anyone/domain งาน maintenance ตรวจซ้ำด้วย ควรใช้บัญชีเฉพาะงานโรงเรียน เพราะโฟลเดอร์เดิมที่สร้างด้วยมือยังต้องใช้ OAuth scope `drive` การเปลี่ยนเป็น `drive.file` ทันทีจะทำให้สิทธิ์โฟลเดอร์เดิมขาด

## จัดการเจ้าหน้าที่

คำสั่งอ่าน `.env` หรือ environment ของ process ห้ามส่ง PIN เป็น argument ใน command line และลบ STAFF_PIN ออกจาก environment หลังใช้:

```text
npm run staff -- create teacher.real "ครูผู้ดูแล"
npm run staff -- reset teacher.real
npm run staff -- disable teacher.old
npm run staff -- enable teacher.old
```

create/reset ต้องตั้ง STAFF_PIN ตัวเลข 8–12 หลัก คำสั่งไม่พิมพ์ PIN ไม่ยอม disable เจ้าหน้าที่ Active คนสุดท้าย การลบนักเรียนผ่านเว็บต้องกรอก PIN ซ้ำ แต่สิทธิ์นักเรียนไม่ได้เปลี่ยน

## Backup ที่กู้พร้อมรูปได้

ตั้งค่าในไฟล์ environment ที่ไม่เข้า Git บนเครื่องที่โรงเรียนควบคุม:

- SUPABASE_URL / SUPABASE_SECRET_KEY และ Drive config ที่อ่านระบบจริงได้
- BACKUP_DIR เป็นที่เก็บในดิสก์โรงเรียน ไม่อยู่ใน repo และไม่ใช่โฟลเดอร์เปิดแชร์
- BACKUP_KEY สุ่ม 32 ไบต์ เขียนเป็น hex 64 ตัว เก็บสำเนาคีย์แยกจาก backup หากคีย์หายจะกู้ไม่ได้
- BACKUP_KEEP_DAYS ค่าเริ่มต้น 7 วัน รับได้ 1–30 วัน

```text
npm run backup
npm run restore -- C:/school-backups/2026-09-25T00-00-00.000Z.wb C:/school-restore-check
```

backup อ่าน snapshot ครั้งเดียว ดาวน์โหลดไฟล์ที่ถูกอ้างอิง ตรวจ checksum เก็บ blobs ตาม SHA-256 และเขียน manifest เข้ารหัส เฉพาะเมื่อสร้างครบจึงบันทึกว่าสำรองสำเร็จ การ prune จะรักษา blobs ที่ backup ที่ยังไม่หมดอายุใช้อยู่ ห้ามลบโฟลเดอร์ blobs แยกจาก manifests

restore ยอมเฉพาะโฟลเดอร์ที่ยังไม่มี eco.sqlite และฐานข้อมูลว่าง คืนรูปเป็น inline ใน SQLite สำหรับตรวจสอบ จึงไม่ต้องมีสิทธิ์ Drive ระหว่างซ้อมกู้ ไม่กู้ session, request receipts, งานลบเก่า หรือ OAuth tokens และไม่คืนรูปหลักฐานที่เลย retention แล้ว

เมื่อต้องกู้ใช้งานจริง: ตรวจข้อมูลใน SQLite ที่กู้ใหม่ก่อน เชื่อม Drive ในระบบกู้ใหม่ แล้ว import ไป Supabase **เป้าหมายว่าง** ด้วย migrate:supabase ซึ่งย้ายรูปกลับ Drive การกลับไปใช้โดเมนจริงและการสลับ environment ต้องทำใน maintenance window

แนะนำ RPO เริ่มต้น 24 ชั่วโมงจาก backup รายวัน ส่วน RTO ต้องวัดด้วยข้อมูล/อินเทอร์เน็ตโรงเรียนจริง ซ้อมกู้รายเดือนและก่อนเปลี่ยน schema ใช้ `scripts/backup-task.ps1` ใน Windows Task Scheduler วันละครั้งโดยเรียก Node ที่ติดตั้งจริง ตั้ง Run whether user is logged on และจำกัดสิทธิ์อ่านไฟล์ environment เฉพาะบัญชีที่รันงาน เปิดเครื่องให้ถึงเวลาสำรองและตรวจ Last Run Result หน้าครูเตือนเมื่อไม่พบ backup ภายใน 48 ชั่วโมง

Backup เก็บข้อมูลย้อนหลังตามอายุของ snapshot แม้ลบจากระบบใช้งานแล้ว ต้องแจ้งนโยบายนี้และทำลาย backup ที่หมดอายุ การเข้ารหัสไม่ใช่การลบข้อมูล

## Retention และงานผิดพลาด

| ข้อมูล | ค่าเริ่มต้น |
|---|---:|
| รูป Rejected/Cancelled | 30 วันจากเวลาตรวจ/ยกเลิก |
| รูป Pending | 90 วันจากเวลาส่ง |
| รูป Approved | 180 วันจากเวลาตรวจ |
| Audit | 365 วัน |
| Request receipts | 7 วัน + เผื่อเวลาเครื่องคลาดเคลื่อน 5 นาที และ Server ปฏิเสธ key ที่เก่ากว่า 7 วัน |
| รูปอัปโหลดที่ไม่มีรายการอ้างอิง | รออย่างน้อย 24 ชั่วโมงก่อนลบ |

การหมดอายุรูปจะตัดการเข้าถึงจากแอปและเข้าคิวลบ ไฟล์ Drive อาจยังอยู่จนกว่างานลบจะสำเร็จ ถ้า Drive ล้มเหลว งานไม่ถูกทิ้งและหน้าครูแสดงค้างอยู่ ส่วนไฟล์เก่าที่สร้างก่อนมีระบบติดตามรหัสไฟล์ต้องตรวจ inventory ของโฟลเดอร์ด้วยมือก่อนลบ ไม่ลบไฟล์ที่ไม่รู้ที่มาโดยอัตโนมัติ

คำสั่ง `npm run check:operations` ตรวจสิทธิ์โฟลเดอร์ กระทบยอด และทำงาน cleanup ได้จากเครื่องโรงเรียน ใช้เมื่อ cron มี backlog หรือเพื่อทดสอบการเชื่อมต่อจริง การตรวจ sharing ในโค้ดไม่แทนการตรวจสิทธิ์บัญชี/สมาชิก shared drive ของผู้ดูแล

## ทดสอบก่อนเปิดใช้

```text
npm run test:all
npm run test:load
```

CI รัน unit/API, SQL จริงผ่าน PGlite และ Chromium browser flow; ไม่ต้องมี production secrets ไม่อัปโหลด screenshot หรือ backup ของเด็กขึ้น CI

ผล load จำลองในเครื่องพัฒนา: 3,000 นักเรียน + 100,000 ledger entries ใช้เวลารวมยอดประมาณ 93 ms / heap 19 MiB นี่เป็นการวัด aggregation เท่านั้น ไม่ใช่ SLA หรือ load test บน Supabase/Vercel ต้องวัด latency/quotas บน staging ของโรงเรียนก่อนเพิ่มจำนวน kiosk

PGlite ตรวจ PostgreSQL functions, migration, CAS และ RLS/permissions ที่จำลองไว้ได้ แต่ไม่แทนการทดสอบ network, connection limits และหลาย Vercel instances จริง
