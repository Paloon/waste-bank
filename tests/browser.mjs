import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'eco-browser-'));
const server=spawn(process.execPath,['server/index.js','--production'],{env:{...process.env,PORT:'3011',DATA_DIR:dir},stdio:'pipe'});
let browser;
try{
 for(let i=0;i<40;i++){try{let r=await fetch('http://127.0.0.1:3011/api/public');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
 const pin=readFileSync(join(dir,'demo-credentials.txt'),'utf8').match(/PIN: (\d+)/)[1];
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install();await page.goto('http://127.0.0.1:3011');assert.match(await page.title(),/waste-bank/);
 const byName=name=>page.getByRole('button',{name,exact:true}).first();
 const identify=async()=>{await page.getByLabel('เลขประจำตัวนักเรียน',{exact:true}).fill('65001');await byName('ใช่ นี่คือบัญชีของฉัน').waitFor();await byName('ใช่ นี่คือบัญชีของฉัน').click();};
 const login=async()=>{await byName('เจ้าหน้าที่').click();await page.getByLabel('บัญชีเจ้าหน้าที่',{exact:true}).fill('teacher.mali');await page.getByLabel('PIN ส่วนตัว',{exact:true}).fill(pin);await byName('เข้าสู่ระบบ').click();await page.getByText('STAFF WORKSPACE').waitFor();};
 console.log('Testing self-registration');await byName('Coins ของฉัน').click();await byName('สมัครสมาชิกใหม่').click();await page.getByLabel('ชื่อ–นามสกุล').fill('ดารา ใจดี');await page.getByLabel('เลขที่',{exact:true}).fill('14');await page.getByLabel('เลขประจำตัวนักเรียน',{exact:true}).fill('70001');await page.getByLabel('ระดับชั้น').selectOption('2');await page.getByLabel('ห้อง',{exact:true}).fill('3');await byName('สมัครสมาชิก').click();await page.getByRole('heading',{name:'Coins ของฉัน',exact:true}).waitFor();await page.getByText('ดารา ใจดี').waitFor();await byName('หน้าหลัก').click();
 console.log('Testing submission');await byName('ส่งขยะ').click();await identify();
 await page.locator('input[type=file]').last().setInputFiles({name:'evidence.png',mimeType:'image/png',buffer:await page.screenshot()});
 await page.getByAltText('ภาพที่เลือก').waitFor();assert.ok(await page.getByAltText('ภาพที่เลือก').evaluate(el=>Math.floor(el.src.split(',')[1].length*3/4)<=400*1024));await byName('ส่งขยะให้คุณครูตรวจ').click();await page.getByRole('heading',{name:'ส่งขยะเรียบร้อย!'}).waitFor();await byName('กลับหน้าหลัก').click();
 console.log('Testing approval');await login();await page.getByRole('button',{name:/^ตรวจขยะ/}).click();await byName('อนุมัติ').last().click();await page.getByLabel('น้ำหนักที่ชั่งจริง (กก.)').fill('0.75');await byName('ยืนยันผลการตรวจ').click();await page.getByText('บันทึกผลตรวจแล้ว').waitFor();await byName('ออกจากระบบ').click();
 await byName('ร้านรางวัล').click();await byName('แลกรางวัล').first().click();await identify();await byName('ยืนยันแลก 150 Coins').click();await page.getByRole('heading',{name:'จองรางวัลแล้ว!'}).waitFor();await byName('กลับหน้าหลัก').click();
 await byName('Coins ของฉัน').click();await identify();await byName('ประวัติ Coins').click();assert.ok(await page.getByText('แลก สมุดรักษ์โลก',{exact:true}).count());await byName('ประวัติรางวัล').click();assert.ok(await page.locator('code').count());await byName('หน้าหลัก').click();
 await login();await byName('ส่งมอบรางวัล').click();await byName('ยกเลิกและคืน Coins').last().click();await page.getByLabel('เหตุผล',{exact:true}).fill('คืนรายการทดสอบ');await byName('ยืนยัน').click();await page.getByText('บันทึกรายการแล้ว',{exact:true}).waitFor();await byName('นักเรียน').click();await byName('ปรับ Coins').first().click();await page.getByLabel('จำนวน (+ เพิ่ม / − ลด)').fill('100');await page.getByLabel('เหตุผล',{exact:true}).fill('กิจกรรมโรงเรียน');await byName('ยืนยันและบันทึกในบัญชี').click();await page.getByText('สร้างรายการปรับ Coins แล้ว').waitFor();
 await byName('เลื่อนชั้น').click();await page.getByRole('button',{name:/ตรวจสอบครบแล้ว/}).click();await byName('ยืนยันเลื่อนชั้น').click();await page.getByText('เลื่อนชั้นเรียบร้อย ประวัติและ Coins คงเดิม').waitFor();await byName('ออกจากระบบ').click();
 for(const width of [390,768,1280]){await page.setViewportSize({width,height:900});for(const target of ['ร้านรางวัล','อันดับ','หน้าหลัก']){await byName(target).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow ${target} at ${width}`);}}
 await byName('Coins ของฉัน').click();await identify();await page.getByRole('heading',{name:'Coins ของฉัน',exact:true}).waitFor();await page.clock.fastForward(91000);await page.getByRole('heading',{name:'ขยะของเธอ'}).waitFor();assert.equal(await page.getByText('ปุณณ์ สุขใจ',{exact:true}).count(),0);
 await byName('ส่งขยะ').click();await page.getByLabel('เลขประจำตัวนักเรียน',{exact:true}).fill('65001');await byName('ใช่ นี่คือบัญชีของฉัน').waitFor();await page.clock.fastForward(91000);await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.getByText('ปุณณ์ สุขใจ',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: self-registration → upload → approve → redeem without PIN → history → refund → adjustment → promotion → responsive → privacy timeout; no browser errors');
}finally{await browser?.close();server.kill();await new Promise(r=>server.once('exit',r));rmSync(dir,{recursive:true,force:true});}
