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
node --env-file=C:/school/backup.env scripts/verify-recovery.mjs C:/school-backups/2026-09-25T00-00-00.000Z.wb
```

backup อ่าน snapshot ครั้งเดียว ดาวน์โหลดไฟล์ที่ถูกอ้างอิง ตรวจ checksum เก็บ blobs ตาม SHA-256 และเขียน manifest เข้ารหัส เฉพาะเมื่อสร้างครบจึงบันทึกว่าสำรองสำเร็จ การ prune จะรักษา blobs ที่ backup ที่ยังไม่หมดอายุใช้อยู่ ห้ามลบโฟลเดอร์ blobs แยกจาก manifests

restore ยอมเฉพาะโฟลเดอร์ที่ยังไม่มี eco.sqlite และฐานข้อมูลว่าง คืนรูปเป็น inline ใน SQLite สำหรับตรวจสอบ จึงไม่ต้องมีสิทธิ์ Drive ระหว่างซ้อมกู้ ไม่กู้ session, request receipts, งานลบเก่า หรือ OAuth tokens และไม่คืนรูปหลักฐานที่เลย retention แล้ว

เมื่อต้องกู้ใช้งานจริง: ตรวจข้อมูลใน SQLite ที่กู้ใหม่ก่อน เชื่อม Drive ในระบบกู้ใหม่ แล้ว import ไป Supabase **เป้าหมายว่าง** ด้วย migrate:supabase ซึ่งย้ายรูปกลับ Drive การกลับไปใช้โดเมนจริงและการสลับ environment ต้องทำใน maintenance window

การ import รองรับทั้ง `image` และ `disposalImage` ของหลักฐาน รวมถึงรูป gallery รางวัล โดยใช้รหัสใหม่ใน Drive และแก้ reference เฉพาะ field ที่ถูกต้อง การ retry ใช้ reference ที่ย้ายสำเร็จแล้วใน SQLite เดิม ไม่อัปโหลดภาพเดิมซ้ำ Target ที่ initialized แล้วจะถูกปฏิเสธก่อนอัปโหลด และตรวจซ้ำก่อนแต่ละ upload; initialization ของฐานข้อมูลเป็น atomic หากมีอีก process แทรกระหว่างตรวจและ initialize งานจะหยุด ไม่เขียนทับ target ส่วนภาพที่อัปโหลดไปแล้วคงติดตามใน SQLite ต้นทางเพื่อให้ตรวจ/cleanup ภายหลัง

`health:recovery-import.cloudRestoreVerified=true` หมายถึงอ่านข้อมูลจาก target แล้วเทียบ records/ledger/stock และดาวน์โหลดรูปที่อ้างอิงได้ครบ (ภาพที่เพิ่ง upload ตรวจ checksum ด้วย) ค่า `scope=isolated-rehearsal` ในการทดสอบ PGlite เป็นการซ้อมในเครื่องเท่านั้น ไม่รับรอง production ส่วน `scope=target` จาก migration จริงยังไม่ยืนยัน OAuth ของ deployment, URL, login หรือเวลาสลับระบบ และไม่กู้ sessions, receipts หรืองานลบเก่า การซ้อมแบบครบ encrypted backup → SQLite ใหม่ → PostgreSQL เปล่า + Drive จำลองอยู่ใน `tests/recovery-import.test.js` ไม่ใช้ production secrets และไม่เขียน cloud จริง

แนะนำ RPO เริ่มต้น 24 ชั่วโมงจาก backup รายวัน ส่วน RTO ต้องวัดด้วยข้อมูล/อินเทอร์เน็ตโรงเรียนจริง ซ้อมกู้รายเดือนและก่อนเปลี่ยน schema ตัวติดตั้ง `scripts/install-backup-task.ps1` เตรียม runtime/env ที่จำกัดสิทธิ์ไว้นอก worktree และตั้งสำรองวันละครั้ง โดยใช้ Node ที่ติดตั้งจริง หน้าครูเตือนเมื่อไม่พบ backup ภายใน 36 ชั่วโมง

เครื่องปัจจุบันใช้ `-StartupScheduler` เนื่องจาก Task Scheduler เรียกโปรแกรมไม่สำเร็จทั้งที่เรียกตรงได้ ตัวติดตั้งจะปิดเฉพาะงานเดิมที่ตรวจเจ้าของ/คำสั่งตรงกัน แล้วติดตั้ง `WBS-WasteBankBackup.vbs` ใน Startup ของผู้ใช้เพื่อเปิด Node แบบซ่อนหน้าต่างเมื่อ login สำรองทันทีเมื่อเริ่มต้นและวันละครั้ง 08:00 Asia/Bangkok มี retry 15 นาทีและตรวจงานที่พลาดหลัง resume ต้องล็อกอินและเครื่องตื่น ไม่ใช้สิทธิ์ admin ตรวจ `.scheduled.backup.scheduler.status.json` ใน runtime รวม PID, updatedAt, lastVerified และ nextDue ควบคู่กับ health:backup และการอ่านไฟล์สำรองจริง

หากใช้โหมด Task Scheduler ให้ตรวจ LastTaskResult กับ `scheduled.backup.status.json` และไฟล์สำรอง ไม่ใช้ log ของ wrapper PowerShell เก่าเป็นหลักฐานของ VBS launcher ใหม่ `-PrepareOnly` เตรียมไฟล์โดยไม่ลงทะเบียนงานหรือ Startup และไม่เรียกสำรอง

Backup เก็บข้อมูลย้อนหลังตามอายุของ snapshot แม้ลบจากระบบใช้งานแล้ว ต้องแจ้งนโยบายนี้และทำลาย backup ที่หมดอายุ การเข้ารหัสไม่ใช่การลบข้อมูล

`verify-recovery.mjs` ตรวจคีย์/ความครบของ blobs และ checksum กู้ลง SQLite ชั่วคราวที่สร้างใหม่ ตรวจจำนวนรายการ ledger ยอด/stock และรูปสองประเภท แล้วลบเฉพาะโฟลเดอร์ชั่วคราวนั้น ค่าเริ่มต้นไม่เชื่อม cloud และไม่เปลี่ยน backup ผล `recoveryMs` เป็นเวลาซ้อมในเครื่อง ไม่รวมเวลาสลับ deployment หรือย้ายรูปกลับ Drive การรันผ่านยังไม่รับรอง RTO ของ production

เมื่อผู้ดูแลต้องการบันทึกผลซ้อมที่ผ่านลงหน้า health ให้เติม `--record-health` หลังชื่อไฟล์ โดยใช้ environment ของระบบที่ต้องการบันทึก สคริปต์เขียนเฉพาะ `health:restore` หลังผ่านการตรวจทั้งหมด ไม่คืนข้อมูลลง cloud และระบุ `method=isolated-sqlite`, `cloudRestoreVerified=false` ชัดเจน

## ตรวจสถานะแบบอ่านอย่างเดียว

`npm run check:status` อ่านเฉพาะผลสำรอง งานดูแลรูป ผลซ้อมกู้คืน และข้อผิดพลาดล่าสุด ไม่เรียก maintenance และไม่ลบรูป ต่างจาก `check:operations` ที่ทำงาน maintenance จริง หากพบผลสำรอง/ดูแลรูปเก่ากว่า 36 ชั่วโมง หรือผลซ้อมกู้คืนเก่ากว่า 90 วัน จะคืน exit code 1 พร้อมเหตุผล หน้าเจ้าหน้าที่แสดงคำเตือนเดียวกัน คำเตือนเหล่านี้ไม่ส่งข้อความออกไปบริการภายนอก

ผลสำเร็จครั้งเดียวไม่ได้ยืนยันว่าติดตั้ง scheduler แล้ว ผู้ดูแลต้องตรวจ Task Scheduler และการเก็บสำเนาสำรองแยกจากเครื่องจริงด้วย

## อัปเดตฟังก์ชันประวัตินักเรียน

`supabase/schema.sql` เพิ่ม index `wb_student_status_history` และฟังก์ชันอ่าน `wb_student_history` แบบ security invoker ให้สิทธิ์เฉพาะ service_role ต้องนำส่วนเพิ่มเติมนี้ไปใช้ก่อนจึงได้เส้นทางอ่านที่ส่งเฉพาะนักเรียนคนเดียว โค้ดยังรองรับ schema เดิมโดยนับสถานะจากชุดข้อมูลที่ไม่รวมรูปและตรวจ version ก่อน/หลัง แต่การอ่านอันดับยังใช้ summary เดิม ห้ามอ้างว่า production ใช้ฟังก์ชันใหม่จนตรวจว่าติดตั้งแล้ว

Backup บันทึก `health:backup` เมื่ออ่านกลับและตรวจ retention สำเร็จเท่านั้น ส่วน `health:backupAttempt` บันทึกผลครั้งล่าสุดแยกกัน ความล้มเหลวจะไม่เขียนทับเวลาสำเร็จเดิม ค่าตั้ง scheduler/retention อย่างเดียวไม่ใช่หลักฐานว่ามีงานรันจริง ต้องตรวจ status/PID/health ล่าสุด และซ้อมกู้ด้วย backup จริง วันที่ 14 ตุลาคม 2569 ตรวจการสำรองในเครื่องและโฟลเดอร์ Drive จริงผ่าน แต่ยังไม่มีสำเนานอกเครื่องตามตัวเลือกเจ้าของระบบ

## Retention และงานผิดพลาด

| ข้อมูล                          |                                                                        ค่าเริ่มต้น |
| ------------------------------- | ---------------------------------------------------------------------------------: |
| รูป Rejected/Cancelled          |                                                           30 วันจากเวลาตรวจ/ยกเลิก |
| รูป Pending                     |                                                                   90 วันจากเวลาส่ง |
| รูป Approved                    |                                                                 180 วันจากเวลาตรวจ |
| Audit                           |                                                                            365 วัน |
| Request receipts                | 7 วัน + เผื่อเวลาเครื่องคลาดเคลื่อน 5 นาที และ Server ปฏิเสธ key ที่เก่ากว่า 7 วัน |
| รูปอัปโหลดที่ไม่มีรายการอ้างอิง |                                                       รออย่างน้อย 24 ชั่วโมงก่อนลบ |

การหมดอายุรูปจะตัดการเข้าถึงจากแอปและเข้าคิวลบ ไฟล์ Drive อาจยังอยู่จนกว่างานลบจะสำเร็จ ถ้า Drive ล้มเหลว งานไม่ถูกทิ้งและหน้าครูแสดงค้างอยู่ ส่วนไฟล์เก่าที่สร้างก่อนมีระบบติดตามรหัสไฟล์ต้องตรวจ inventory ของโฟลเดอร์ด้วยมือก่อนลบ ไม่ลบไฟล์ที่ไม่รู้ที่มาโดยอัตโนมัติ

`evidenceDetachedAt` คือเวลาตัดภาพทั้ง image/disposalImage ออกจากแอป `evidenceDeletionPending` เก็บรหัส Drive ที่ยังรอลบ และ `evidenceDeletedAt` บันทึกเมื่อ Drive ยืนยัน DELETE ครบทุกรหัส งานลบที่ล้มเหลวเก็บ attempts/lastFailedAt และ retry รอบถัดไป health มี deletionPending/deletionFailed `evidenceRemovedAt` ของข้อมูลเก่าหมายถึงการตัดภาพเท่านั้น ห้ามใช้รับรองว่าลบไฟล์จริงแล้ว รายการ Pending ที่ภาพหลักขาดหรือหมดอายุ 90 วัน (ภาพทิ้งขยะเป็นตัวเลือก)จะอนุมัติไม่ได้และไม่เพิ่ม Coins ต้องส่งหลักฐานใหม่เป็นรายการใหม่

คำสั่ง `npm run check:operations` ตรวจสิทธิ์โฟลเดอร์ กระทบยอด และทำงาน cleanup ได้จากเครื่องโรงเรียน ใช้เมื่อ cron มี backlog หรือเพื่อทดสอบการเชื่อมต่อจริง การตรวจ sharing ในโค้ดไม่แทนการตรวจสิทธิ์บัญชี/สมาชิก shared drive ของผู้ดูแล

## ทดสอบก่อนเปิดใช้

```text
npm run test:all
npm run test:load
```

CI รัน unit/API, SQL จริงผ่าน PGlite และ Chromium browser flow; ไม่ต้องมี production secrets ไม่อัปโหลด screenshot หรือ backup ของเด็กขึ้น CI

ผล load จำลองในเครื่องพัฒนา: 3,000 นักเรียน + 100,000 ledger entries ใช้เวลารวมยอดประมาณ 93 ms / heap 19 MiB นี่เป็นการวัด aggregation เท่านั้น ไม่ใช่ SLA หรือ load test บน Supabase/Vercel ต้องวัด latency/quotas บน staging ของโรงเรียนก่อนเพิ่มจำนวน kiosk

PGlite ตรวจ PostgreSQL functions, migration, CAS และ RLS/permissions ที่จำลองไว้ได้ แต่ไม่แทนการทดสอบ network, connection limits และหลาย Vercel instances จริง
