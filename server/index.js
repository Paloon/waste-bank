import express from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { createStore, act, balance, earned, verify, studentView, registerStudent, categories } from './store.js';
import { createDrive } from './drive.js';

const directory=resolve(process.env.DATA_DIR||'data');
const app=express(),store=createStore(directory),drive=createDrive(directory),sessions=new Map(),attempts=new Map();
app.disable('x-powered-by');
app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','same-origin');if(req.path.startsWith('/api')){res.set('Cache-Control','no-store');if(req.method==='POST'&&req.headers.origin&&req.headers.origin!==`${req.protocol}://${req.get('host')}`)return res.status(403).json({error:'แหล่งที่มาของคำขอไม่ถูกต้อง'});}next();});
app.use(express.json({limit:'3mb'}));
const publicStudent=p=>({id:p.id,name:p.name,number:p.number,grade:p.grade,room:p.room,status:p.status});
const media=(value,type,id)=>value?.startsWith('drive:')?`/api/media/${type}/${encodeURIComponent(id)}`:value;
const rewardView=r=>({...r,image:media(r.image,'reward',r.id)});
const submissionView=s=>({...s,image:media(s.image,'submission',s.id)});
const studentMedia=p=>({...p,submissions:p.submissions.map(submissionView)});
function session(req){const cookie=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('eco_session='))?.slice(12);let s=sessions.get(cookie);if(s&&s.expires>Date.now()){s.expires=Date.now()+120000;return s;}if(cookie)sessions.delete(cookie);return null;}
function login(res,actor){let token=randomBytes(32).toString('hex');sessions.set(token,{...actor,expires:Date.now()+120000});res.cookie('eco_session',token,{httpOnly:true,sameSite:'strict',secure:process.env.SECURE_COOKIE==='1',maxAge:120000,path:'/'});}
function limited(req,key){const id=req.ip+':'+key;let a=attempts.get(id);if(!a||a.until<Date.now()){a={count:0,until:Date.now()+60000};attempts.set(id,a);}a.count++;if(a.count>10)throw new Error('ลองหลายครั้งเกินไป กรุณารอ 1 นาที');}
app.get('/api/public',(req,res)=>{const s=store.read();const leaderboard=s.students.filter(x=>x.status==='Active').map(p=>({name:p.name.split(' ')[0]+' '+p.name.split(' ')[1]?.slice(0,1)+'.',grade:p.grade,room:p.room,earned:earned(s,p.id),monthly:earned(s,p.id,true)})).sort((a,b)=>b.earned-a.earned);res.json({categories,rewards:s.rewards.filter(x=>x.enabled).map(rewardView),leaderboard,stats:{weight:s.submissions.reduce((n,x)=>n+(x.weight||0),0),coins:s.ledger.filter(x=>x.type==='recycle').reduce((n,x)=>n+x.amount,0),students:s.students.filter(x=>x.status==='Active').length,submissions:s.submissions.filter(x=>x.status==='Approved').length}});});
app.post('/api/identify',(req,res)=>{limited(req,'identify');const p=store.read().students.find(x=>x.id===String(req.body.id));if(!p||p.status!=='Active')return res.status(404).json({error:'ไม่พบรหัสนักเรียน หรือบัญชีไม่พร้อมใช้งาน'});login(res,{role:'student',id:p.id});res.json(publicStudent(p));});
app.post('/api/register',(req,res)=>{limited(req,'register');const p=store.transact(s=>registerStudent(s,req.body||{}));login(res,{role:'student',id:p.id});res.status(201).json(publicStudent(p));});
app.post('/api/login',(req,res)=>{limited(req,'staff');const p=store.read().staff.find(x=>x.id===req.body.id);if(!p||!verify(req.body.pin,p.pin))return res.status(401).json({error:'ชื่อบัญชีหรือ PIN ไม่ถูกต้อง'});login(res,{role:'staff',id:p.id,name:p.name});res.json({name:p.name});});
app.post('/api/logout',(req,res)=>{const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('eco_session='))?.slice(12);sessions.delete(token);res.clearCookie('eco_session',{path:'/'});res.json({ok:true});});
app.post('/api/session',(req,res)=>{const actor=session(req);if(!actor)return res.status(401).json({error:'หมดเวลาใช้งาน'});const token=req.headers.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('eco_session=')).slice(12);res.cookie('eco_session',token,{httpOnly:true,sameSite:'strict',secure:process.env.SECURE_COOKIE==='1',maxAge:120000,path:'/'});res.json({ok:true});});
app.get('/api/student',(req,res)=>{const actor=session(req);if(!actor)return res.status(401).json({error:'หมดเวลาใช้งาน กรุณาระบุตัวตนใหม่'});res.json(studentMedia(studentView(store.read(),actor.role==='staff'?req.query.id:actor.id)));});
app.get('/api/admin',(req,res)=>{const actor=session(req);if(actor?.role!=='staff')return res.status(401).json({error:'กรุณาเข้าสู่ระบบเจ้าหน้าที่'});const s=store.read();res.json({...s,staff:undefined,requests:undefined,rewards:s.rewards.map(rewardView),submissions:s.submissions.map(submissionView),students:s.students.map(p=>({...publicStudent(p),balance:balance(s,p.id)})),name:actor.name,drive:{configured:drive.configured,connected:drive.connected()}});});
app.get('/api/rank',(req,res)=>{limited(req,'rank');const s=store.read();const q=String(req.query.q||'').trim();const monthly=req.query.period==='month';let list=s.students.filter(x=>x.status==='Active'&&(!req.query.grade||x.grade===req.query.grade)&&(!req.query.room||x.room===req.query.room)).sort((a,b)=>earned(s,b.id,monthly)-earned(s,a.id,monthly));res.json(list.map((x,i)=>({name:x.name.split(' ')[0],grade:x.grade,room:x.room,earned:earned(s,x.id,monthly),rank:i+1,match:x.id===q||x.name.includes(q)})).filter(x=>q&&x.match).map(({match,...p})=>p));});
app.get('/api/drive/status',(req,res)=>{if(session(req)?.role!=='staff')return res.status(401).json({error:'กรุณาเข้าสู่ระบบเจ้าหน้าที่'});res.json({configured:drive.configured,connected:drive.connected()});});
app.get('/api/drive/connect',(req,res)=>{const actor=session(req);if(actor?.role!=='staff')return res.status(401).json({error:'กรุณาเข้าสู่ระบบเจ้าหน้าที่'});try{res.redirect(drive.authUrl(actor.id));}catch(error){res.status(400).json({error:error.message});}});
app.get('/api/drive/callback',async(req,res)=>{try{if(req.query.error)throw new Error('ไม่ได้อนุญาต Google Drive');await drive.exchange(String(req.query.code||''),String(req.query.state||''));await drive.verifyFolders();res.redirect('/?drive=connected');}catch(error){res.status(400).type('text/plain').send(`เชื่อม Google Drive ไม่สำเร็จ: ${error.message}`);}});
app.get('/api/media/:type/:id',async(req,res)=>{try{const s=store.read();let ref;if(req.params.type==='reward')ref=s.rewards.find(x=>x.id===req.params.id&&x.enabled)?.image;else if(req.params.type==='submission'){const actor=session(req);const item=s.submissions.find(x=>x.id===req.params.id);if(!actor||!item||(actor.role!=='staff'&&item.student!==actor.id))return res.sendStatus(403);ref=item.image;}else return res.sendStatus(404);if(!ref?.startsWith('drive:'))return res.sendStatus(404);const response=await drive.download(ref.slice(6));res.set('Content-Type',response.headers.get('content-type')||'image/jpeg');res.set('Cache-Control','private, no-store');res.send(Buffer.from(await response.arrayBuffer()));}catch(error){res.status(502).json({error:error.message});}});
app.post('/api/action',async(req,res)=>{const actor=session(req);if(!actor)return res.status(401).json({error:'หมดเวลาใช้งาน กรุณาระบุตัวตนใหม่'});if(req.body.payload?.pin)limited(req,'confirmation');
 let uploaded=null;
 try{
  const body=structuredClone(req.body),p=body.payload||{};
  delete p.digest;
  if(typeof body.key==='string'){const prior=store.read().requests[`${actor.role}:${actor.id}:${body.key}`];if(prior)return res.json(prior);}
  if(body.action==='reward'){
    const existing=store.read().rewards.find(x=>x.id===p.id);
    if(existing&&p.image===`/api/media/reward/${encodeURIComponent(p.id)}`)p.image=existing.image;
  }
  if(typeof p.image==='string'&&p.image.startsWith('drive:')){
    const existing=body.action==='reward'?store.read().rewards.find(x=>x.id===p.id):null;
    if(!existing||existing.image!==p.image)throw new Error('รูปภาพไม่ถูกต้อง');
  }
  act(structuredClone(store.read()),actor,body);
  if(drive.configured&&['submit','reward'].includes(body.action)){
    if(!drive.connected())throw new Error('ยังไม่ได้เชื่อม Google Drive กรุณาให้เจ้าหน้าที่เชื่อมก่อน');
    if(p.image?.startsWith('data:')){
      const original=p.image;
      const kind=body.action==='reward'?'rewards':'evidence';
      uploaded=await drive.upload(kind,original,`${body.action}-${Date.now()}-${randomBytes(6).toString('hex')}.jpg`);
      p.image=`drive:${uploaded}`;
      if(body.action==='submit')p.digest=createHash('sha256').update(original).digest('hex');
    }
  }
  if(drive.configured&&body.action==='review'&&p.status==='Approved'){
    const item=store.read().submissions.find(x=>x.id===p.id);
    if(item?.image?.startsWith('drive:'))await drive.moveToWaste(item.image.slice(6));
  }
  const result=store.transact(s=>act(s,actor,body));
  res.json(result);
 }catch(error){if(uploaded)drive.remove(uploaded).catch(()=>{});res.status(400).json({error:error.message});}
});
app.use('/api',(req,res)=>res.status(404).json({error:'ไม่พบ API'}));
app.use((err,req,res,next)=>res.status(400).json({error:err.type==='entity.too.large'?'รูปภาพใหญ่เกินไป':err.message||'เกิดข้อผิดพลาด'}));
const retention=Math.max(1,Number(process.env.RETENTION_DAYS)||30);
async function prune(){for(const item of store.read().submissions){if(['Rejected','Cancelled'].includes(item.status)&&item.image&&Date.now()-Date.parse(item.reviewedAt||item.at)>retention*86400000){try{if(item.image.startsWith('drive:'))await drive.remove(item.image.slice(6));store.transact(s=>{const current=s.submissions.find(x=>x.id===item.id);if(current?.image===item.image){current.image='';current.evidenceRemovedAt=new Date().toISOString();}});}catch(error){console.error('Evidence retention:',error.message);}}}for(const [key,s] of sessions)if(s.expires<Date.now())sessions.delete(key);for(const [key,a] of attempts)if(a.until<Date.now())attempts.delete(key);}
prune().catch(console.error);setInterval(()=>prune().catch(console.error),3600000).unref();
if(process.argv.includes('--production')){app.use(express.static(resolve('dist')));app.get('/{*path}',(req,res)=>res.sendFile(resolve('dist/index.html')));}else{const {createServer}=await import('vite');const vite=await createServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}
const port=Number(process.env.PORT)||3000;app.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`waste-bank: http://localhost:${port} — demo credentials: data/demo-credentials.txt`));
