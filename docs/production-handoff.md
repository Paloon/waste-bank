# ระบบที่ติดตั้งจริง — 26 กันยายน 2569

- เว็บ: https://waste-bank-nine.vercel.app
- Supabase Table Editor: https://supabase.com/dashboard/project/jurpghyhxevfbspyyqtt/editor?schema=public
- Vercel: https://vercel.com/paloon/waste-bank
- GitHub main เป็นแหล่ง deploy; อย่า rollback ไปก่อน schema v2 โดยไม่กู้ฐานข้อมูลคู่กัน

ย้าย schema v1 เป็น v2 แล้ว โดยเทียบข้อมูลเดิมกับสำรองแบบเข้ารหัสครบทุกชุด: นักเรียน 13 คน รางวัล 6 รายการ ส่งขยะ 14 รายการ แลกรางวัล 4 รายการ และ ledger 26 รายการ ข้อมูลทดลองเดิมคงไว้ตามคำสั่งเจ้าของระบบ

บัญชีใช้งานจริงคือ `teacher.or` ชื่อแสดงผล **ครูอ้อ** ส่วนบัญชีทดลอง `teacher.mali` ถูกปิดการเข้าใช้งาน แต่ไม่ได้ลบประวัติ

PIN อยู่ใน `.backups/teacher-or-login.txt` เฉพาะเครื่องที่ติดตั้ง ไม่อยู่ใน Git ส่วน `.env.operations.local` เก็บค่าการเชื่อมต่อและ BACKUP_KEY ต้องรักษาทั้งสองไฟล์เป็นความลับและย้ายสำเนากู้คืนไปที่เก็บของโรงเรียนก่อนลบ worktree นี้

Vercel production ใช้ `WASTE_BANK_BASE_URL=https://waste-bank-nine.vercel.app` ชนิด Config ซึ่งมีลำดับเหนือ PUBLIC_BASE_URL เดิม เนื่องจาก Vercel ไม่อนุญาตแก้ตัวแปร prefix PUBLIC_ ที่เดิมถูกเก็บเป็น Secret

ตรวจเว็บจริงแล้ว: public API, login ครูอ้อ, admin API, รูปรางวัลใน Drive, cookie Secure/HttpOnly/SameSite, logout เพิกถอน session และ cron ที่ยืนยันตัวตนผ่าน RLS เปิดครบ 14 ตาราง และ anon/authenticated ไม่มีสิทธิ์อ่านตารางโดยตรง การทดสอบไม่ได้สร้างรายการแลกหรือหัก Coins ใน production

สำรองหลังย้ายพร้อมรูปไว้ใน `.backups/2026-09-26T03-57-33.114Z.wb` และทดลองกู้ใน `.backups/restore-check-2026-09-26` แล้ว กระทบยอดผ่าน

สำรองครั้งต่อไปจากเครื่องนี้:

```powershell
node --env-file=.env.operations.local scripts/backup.mjs
```

ยังไม่ได้ตั้ง Windows Task Scheduler ให้สำรองอัตโนมัติ ดูวิธีใน operations.md ส่วน cron ดูแลรูปบน Vercel ตั้งวันละครั้งใน vercel.json และเรียก endpoint จริงสำเร็จแล้ว

นักเรียนยังเข้าใช้ด้วยเลขประจำตัวเพียงอย่างเดียวตามข้อยกเว้นที่เจ้าของระบบกำหนด การรู้เลขประจำตัวผู้อื่นยังทำให้สวมบัญชีได้ ควรใช้งานผ่านจุดที่โรงเรียนดูแล
