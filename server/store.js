import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, randomInt, scryptSync, timingSafeEqual, randomUUID, createHash } from 'node:crypto';

export const categories = ['ขวดพลาสติก','แก้วพลาสติก','กระป๋องอะลูมิเนียม','กระดาษ','กระดาษลัง','แก้ว','ขยะอิเล็กทรอนิกส์','อื่น ๆ'];
export const hash = value => { const salt=randomBytes(16).toString('hex'); return salt+':'+scryptSync(value,salt,32).toString('hex'); };
export const verify = (value, encoded) => { if(!encoded || typeof value!=='string') return false; const [salt,key]=encoded.split(':'); return timingSafeEqual(scryptSync(value,salt,32),Buffer.from(key,'hex')); };
export const balance = (s,id) => s.ledger.filter(x=>x.student===id).reduce((n,x)=>n+x.amount,0);
const monthInSchoolZone=value=>new Date(value).toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'});
export const earned = (s,id,month=false) => s.ledger.filter(x=>x.student===id && ['recycle','adjustment','opening'].includes(x.type) && x.amount>0 && (!month || monthInSchoolZone(x.at)===monthInSchoolZone(Date.now()))).reduce((n,x)=>n+x.amount,0);
export const fail = (condition,message) => {if(!condition) throw new Error(message);};
const now=()=>new Date().toISOString();
const clean=(value,max=150)=>String(value??'').trim().slice(0,max);
const integer=(value,min=0,max=100000)=>{const n=Number(value); fail(Number.isSafeInteger(n)&&n>=min&&n<=max,'จำนวนไม่ถูกต้อง'); return n;};
function image(value,required=false){if(!value){fail(!required,'กรุณาเพิ่มรูปภาพ');return '';} if(/^drive:[A-Za-z0-9_-]+$/.test(value))return value;fail(typeof value==='string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value),'รองรับภาพ JPG, PNG หรือ WebP');const encoded=value.slice(value.indexOf(',')+1);fail(Buffer.from(encoded,'base64').length<=400*1024,'รูปภาพต้องไม่เกิน 400 KiB หลังบีบอัด');return value;}
export function seed(){
 const names=['ปุณณ์ สุขใจ','ณิชา ใจดี','ภัทร รักษ์โลก','มินตรา แสงดาว','ธีร์ พงษ์ไพร','พิมพ์ชนก สดใส','นที มีสุข','อิงฟ้า วัฒนะ','ธันวา แก้วใส','ชลธิชา พูนผล','ภูมิ พิทักษ์','แพรวา สีเขียว'];
 const students=names.map((name,i)=>({id:String(65001+i),name,number:i+1,grade:String(i%6+1),room:String(i%3+1),status:'Active'}));
 const staffPin=String(randomInt(100000,1000000));
 const s={students,staff:[{id:'teacher.mali',name:'ครูมะลิ',pin:hash(staffPin)}],rewards:[
 {id:'r1',name:'สมุดรักษ์โลก',description:'กระดาษรีไซเคิล สำหรับไอเดียใหม่ของเธอ',price:150,stock:24,enabled:true,icon:'notebook',color:'#eee3fa',image:''},
 {id:'r2',name:'กระบอกน้ำ Eco',description:'เติมน้ำ เติมพลัง ลดขวดพลาสติก',price:300,stock:8,enabled:true,icon:'bottle',color:'#dae9d9',image:''},
 {id:'r3',name:'ถุงผ้าพกพา',description:'เพื่อนคู่ใจ ใส่ได้ทุกวัน',price:250,stock:12,enabled:true,icon:'bag',color:'#f4e8c8',image:''},
 {id:'r4',name:'ปากกาโรงเรียน',description:'เขียนเรื่องดี ๆ ให้โลกของเรา',price:80,stock:3,enabled:true,icon:'pen',color:'#dce9fa',image:''},
 {id:'r5',name:'เข็มกลัด Eco Hero',description:'รางวัลสำหรับฮีโร่ตัวจริง',price:120,stock:0,enabled:true,icon:'badge',color:'#f5ded9',image:''}],ledger:[],submissions:[],redemptions:[],audit:[],requests:{},promotedYears:[]};
 const tx=(student,amount,type,reason,related)=>s.ledger.push({id:randomUUID(),student,amount,type,reason,related,staff:'teacher.mali',at:now()});
 students.forEach((student,i)=>{tx(student.id,1400-i*85,'opening','Coins สะสมจากกิจกรรมก่อนหน้า');let id=randomUUID();s.submissions.push({id,student:student.id,category:categories[i%8],note:'แยกและล้างเรียบร้อยแล้ว',status:i<4?'Pending':i===4?'Rejected':i===5?'Cancelled':'Approved',coins:i>5?50:0,weight:i>5?0.5:0,reason:i===4?'ภาพไม่ชัด กรุณาส่งใหม่':'',image:'',at:now()});if(i>5)tx(student.id,50,'recycle','รีไซเคิล '+categories[i%8],id);});
 ['Pending Pickup','Completed','Cancelled'].forEach((status,i)=>{let id=randomUUID();s.redemptions.push({id,student:students[i].id,reward:'r1',name:'สมุดรักษ์โลก',cost:150,status,code:'ECO-'+randomBytes(4).toString('hex').toUpperCase(),at:now(),staff:status==='Completed'?'teacher.mali':null,completedAt:status==='Completed'?now():null});tx(students[i].id,-150,'redemption','แลกสมุดรักษ์โลก',id);if(status==='Cancelled')tx(students[i].id,150,'refund','คืน Coins จากรายการยกเลิก',id);});
 s.audit.push({id:randomUUID(),staff:'ครูมะลิ',action:'เริ่มต้นระบบตัวอย่าง',target:'waste-bank',before:null,after:'พร้อมใช้งาน',reason:'ข้อมูลสมมติสำหรับทดสอบ',at:now()});
 return {s,staffPin};
}
export function createStore(directory){
 mkdirSync(directory,{recursive:true}); const db=new DatabaseSync(join(directory,'eco.sqlite'));db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)');
 if(!db.prepare('SELECT id FROM state').get()){const {s,staffPin}=seed();db.prepare('INSERT INTO state VALUES(1,?)').run(JSON.stringify(s));writeFileSync(join(directory,'demo-credentials.txt'),`DEMO ONLY — ไม่ใช้ข้อมูลนักเรียนจริง\nStaff: teacher.mali\nPIN: ${staffPin}\nStudent: 65001 (no PIN)\n`);}
 else {const s=JSON.parse(db.prepare('SELECT value FROM state WHERE id=1').get().value);let changed=false;for(const student of s.students){if('pin' in student){delete student.pin;changed=true;}if(!student.number&&/^650(0[1-9]|1[0-2])$/.test(student.id)){student.number=Number(student.id)-65000;changed=true;}}if(changed){db.prepare('UPDATE state SET value=? WHERE id=1').run(JSON.stringify(s));const credentials=join(directory,'demo-credentials.txt');if(existsSync(credentials)){const old=readFileSync(credentials,'utf8');writeFileSync(credentials,old.replace(/^Student:.*\r?\n(?:Students .*\r?\n)?/m,'Student: 65001 (no PIN)\n'));}}}
 return {read:()=>JSON.parse(db.prepare('SELECT value FROM state WHERE id=1').get().value), transact(fn){db.exec('BEGIN IMMEDIATE');try{let s=this.read();let result=fn(s);db.prepare('UPDATE state SET value=? WHERE id=1').run(JSON.stringify(s));db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}},close:()=>db.close()};
}
export function studentView(s,id){const p=s.students.find(x=>x.id===id);fail(p,'ไม่พบรหัสนักเรียน');const {pin,...profile}=p;return {...profile,balance:balance(s,id),earned:earned(s,id),rank:[...s.students].sort((a,b)=>earned(s,b.id)-earned(s,a.id)).findIndex(x=>x.id===id)+1,ledger:s.ledger.filter(x=>x.student===id).reverse(),submissions:s.submissions.filter(x=>x.student===id).reverse(),redemptions:s.redemptions.filter(x=>x.student===id).reverse()};}
export function registerStudent(s,p){
 const id=clean(p.id,10),name=clean(p.name,80);
 fail(/^\d{5,10}$/.test(id),'เลขประจำตัวนักเรียนต้องเป็นตัวเลข 5–10 หลัก');
 fail(!s.students.some(x=>x.id===id),'เลขประจำตัวนี้มีบัญชีแล้ว กรุณาใช้ทางเข้าสู่ระบบ');
 fail(name.length>=2,'กรุณากรอกชื่อ–นามสกุล');
 const number=integer(p.number,1,60);
 const grade=String(integer(p.grade,1,6));
 const room=String(integer(p.room,1,30));
 fail(!s.students.some(x=>x.status==='Active'&&x.grade===grade&&x.room===room&&x.number===number),'เลขที่นี้ถูกใช้แล้วในชั้น/ห้องเดียวกัน');
 const student={id,name,number,grade,room,status:'Active',joinedAt:now()};
 s.students.push(student);
 return student;
}
export function act(s,actor,body){
 const {action,payload:p={},key}=body;fail(typeof key==='string'&&key.length>=10&&key.length<=100,'คำขอไม่สมบูรณ์');
 const requestKey=actor.role+':'+actor.id+':'+key; if(s.requests[requestKey])return s.requests[requestKey];
 const staff=s.staff.find(x=>x.id===actor.id);const isStaff=actor.role==='staff'&&staff;
 const requireStaff=()=>fail(isStaff,'ต้องเข้าสู่ระบบเจ้าหน้าที่');
 const student=s.students.find(x=>x.id===actor.id);
 const requireStudent=()=>fail(actor.role==='student'&&student?.status==='Active','บัญชีไม่พร้อมใช้งาน');
 const log=(target,before,after,reason='')=>s.audit.unshift({id:randomUUID(),staff:isStaff?staff.name:'นักเรียน '+actor.id,action,target,before,after,reason,at:now()});
 const tx=(id,amount,type,reason,related)=>{fail(balance(s,id)+amount>=0,'Coins ไม่เพียงพอ');s.ledger.push({id:randomUUID(),student:id,amount,type,reason,related,staff:isStaff?staff.id:null,at:now()});};
 let result={ok:true};
 if(action==='submit'){
  requireStudent();image(p.image,true);fail(categories.includes(p.category),'เลือกประเภทขยะ');const digest=p.digest||createHash('sha256').update(p.image).digest('hex');fail(!s.submissions.some(x=>x.student===actor.id&&x.digest===digest&&['Pending','Approved'].includes(x.status)),'ภาพนี้เคยส่งแล้ว กรุณาตรวจสอบประวัติ');
  const item={id:randomUUID(),student:actor.id,category:p.category,note:clean(p.note),image:p.image,digest,status:'Pending',coins:0,at:now()};s.submissions.push(item);result={ok:true,id:item.id};
 }else if(action==='cancelSubmission'){
  requireStudent();const item=s.submissions.find(x=>x.id===p.id&&x.student===actor.id);fail(item?.status==='Pending','ยกเลิกได้เฉพาะรายการที่รอตรวจ');item.status='Cancelled';
 }else if(action==='redeem'){
  requireStudent();const reward=s.rewards.find(x=>x.id===p.id);fail(reward?.enabled&&reward.stock>0,'ของรางวัลหมดหรือไม่เปิดให้แลก');const id=randomUUID();tx(actor.id,-reward.price,'redemption','แลก '+reward.name,id);reward.stock--;const item={id,student:actor.id,reward:reward.id,name:reward.name,cost:reward.price,status:'Pending Pickup',code:'ECO-'+randomBytes(6).toString('hex').toUpperCase(),at:now()};s.redemptions.push(item);result={ok:true,code:item.code};
 }else if(action==='profile'){
  if(!isStaff)requireStudent();const item=s.students.find(x=>x.id===(isStaff?p.id:actor.id));fail(item,'ไม่พบนักเรียน');const before={name:item.name,number:item.number,grade:item.grade,room:item.room,status:item.status};fail(clean(p.name).length>=2,'กรุณากรอกชื่อ');const status=isStaff?p.status:item.status;fail(['Active','Alumni','Transferred','Inactive'].includes(status),'สถานะไม่ถูกต้อง');item.name=clean(p.name,80);item.number=integer(p.number,1,60);item.grade=String(integer(p.grade,1,6));item.room=String(integer(p.room,1,30));fail(status!=='Active'||!s.students.some(x=>x.id!==item.id&&x.status==='Active'&&x.grade===item.grade&&x.room===item.room&&x.number===item.number),'เลขที่นี้ถูกใช้แล้วในชั้น/ห้องเดียวกัน');item.status=status;log(item.id,before,{name:item.name,number:item.number,grade:item.grade,room:item.room,status:item.status});
 }else if(action==='review'){
  requireStaff();const item=s.submissions.find(x=>x.id===p.id);fail(item?.status==='Pending','รายการนี้ถูกดำเนินการแล้ว');fail(['Approved','Rejected'].includes(p.status),'สถานะไม่ถูกต้อง');if(p.status==='Approved'){const amount=integer(p.coins,1,10000);const weight=Number(p.weight);fail(Number.isFinite(weight)&&weight>0&&weight<=1000,'กรอกน้ำหนักที่ชั่งจริง');tx(item.student,amount,'recycle','รีไซเคิล '+item.category,item.id);item.coins=amount;item.weight=weight;}else{fail(clean(p.reason).length>=3,'กรุณาระบุเหตุผล');item.reason=clean(p.reason);}item.status=p.status;item.reviewedAt=now();item.staff=staff.id;log(item.id,'Pending',p.status,item.reason||`${item.coins} Coins`);
 }else if(action==='handover'||action==='cancelReward'){
  requireStaff();const item=s.redemptions.find(x=>x.id===p.id);fail(item?.status==='Pending Pickup','รายการนี้ดำเนินการแล้ว');if(action==='handover'){fail(p.verified===true,'กรุณาตรวจสอบตัวตนนักเรียน');item.status='Completed';item.completedAt=now();}else{fail(clean(p.reason).length>=3,'กรุณาระบุเหตุผล');tx(item.student,item.cost,'refund','คืน Coins: '+clean(p.reason),item.id);s.rewards.find(x=>x.id===item.reward).stock++;item.status='Cancelled';item.reason=clean(p.reason);}item.staff=staff.id;log(item.id,'Pending Pickup',item.status,clean(p.reason));
 }else if(action==='adjust'){
  requireStaff();fail(s.students.some(x=>x.id===p.id),'ไม่พบนักเรียน');const amount=integer(p.amount,-100000,100000);fail(amount!==0&&clean(p.reason).length>=3,'ระบุจำนวนและเหตุผล');if(Math.abs(amount)>=1000)fail(p.confirmLarge===true,'กรุณายืนยันการปรับ Coins จำนวนมาก');let before=balance(s,p.id);tx(p.id,amount,'adjustment',clean(p.reason));log(p.id,before,balance(s,p.id),clean(p.reason));
 }else if(action==='deleteStudents'){
  requireStaff();fail(p.confirm===true,'กรุณายืนยันการลบนักเรียน');fail(Array.isArray(p.ids)&&p.ids.length>0&&p.ids.length<=5000,'เลือกนักเรียน 1–5,000 คน');
  const ids=new Set(p.ids);fail(ids.size===p.ids.length&&[...ids].every(id=>typeof id==='string'&&s.students.some(x=>x.id===id)),'รายชื่อนักเรียนเปลี่ยน กรุณาโหลดข้อมูลใหม่');
  const submissions=s.submissions.filter(x=>ids.has(x.student));
  const redemptions=s.redemptions.filter(x=>ids.has(x.student));
  const related=new Set([...submissions,...redemptions].map(x=>x.id));
  const driveFiles=[...new Set(submissions.map(x=>x.image).filter(x=>x?.startsWith('drive:')).map(x=>x.slice(6)))];
  s.pendingDriveDeletes=[...new Set([...(s.pendingDriveDeletes||[]),...driveFiles])];
  for(const item of redemptions.filter(x=>x.status==='Pending Pickup')){const reward=s.rewards.find(x=>x.id===item.reward);if(reward)reward.stock++;}
  s.students=s.students.filter(x=>!ids.has(x.id));
  s.submissions=s.submissions.filter(x=>!ids.has(x.student));
  s.redemptions=s.redemptions.filter(x=>!ids.has(x.student));
  s.ledger=s.ledger.filter(x=>!ids.has(x.student));
  s.audit=s.audit.filter(x=>!ids.has(x.target)&&!related.has(x.target));
  for(const request of Object.keys(s.requests))if([...ids].some(id=>request.startsWith(`student:${id}:`)))delete s.requests[request];
  log('students',null,{deleted:ids.size},'ลบบัญชีและข้อมูลที่เกี่ยวข้อง');
  result={deleted:ids.size,driveFiles};
 }else if(action==='reward'){
  requireStaff();fail(clean(p.name).length>=2,'กรอกชื่อรางวัล');let existing=s.rewards.find(x=>x.id===p.id);const before=existing?{...existing}:null;const item={id:existing?.id||randomUUID(),name:clean(p.name,80),description:clean(p.description),price:integer(p.price,1),stock:integer(p.stock),enabled:!!p.enabled,icon:p.icon||'badge',color:'#e2ecd9',image:image(p.image)};if(existing)Object.assign(existing,item);else s.rewards.push(item);log(item.id,before?{name:before.name,stock:before.stock,price:before.price}:null,{name:item.name,stock:item.stock,price:item.price});
 }else if(action==='promote'){
  requireStaff();const year=integer(p.year,2026,2100);fail(!s.promotedYears.includes(year),'ปีการศึกษานี้เลื่อนชั้นไปแล้ว');fail(p.confirm===true&&Array.isArray(p.students),'กรุณายืนยัน Preview');const ids=new Set();for(const change of p.students){fail(!ids.has(change.id),'รายชื่อนักเรียนซ้ำ');ids.add(change.id);const item=s.students.find(x=>x.id===change.id&&x.status==='Active');fail(item,'รายชื่อนักเรียนเปลี่ยน กรุณาเปิด Preview ใหม่');const before={grade:item.grade,room:item.room,status:item.status};fail(['Active','Alumni','Transferred','Inactive'].includes(change.status),'สถานะไม่ถูกต้อง');item.grade=String(integer(change.grade,1,6));item.room=String(integer(change.room,1,30));item.status=change.status;log(item.id,before,{grade:item.grade,room:item.room,status:item.status},'ปีการศึกษา '+year);}s.promotedYears.push(year);
 }else throw new Error('ไม่พบการทำงานนี้');
 s.requests[requestKey]=result;return result;
}
