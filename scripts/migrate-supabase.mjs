import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createStore } from '../server/store.js';
import { createCloudStore } from '../server/cloud-store.js';

const directory=resolve(process.env.DATA_DIR||'data');
const local=createStore(directory),cloud=createCloudStore();
try{
  const imported=await cloud.initialize(local.read());
  const oauth=join(directory,'drive-oauth.json');
  if(existsSync(oauth))await cloud.setSecret('drive_oauth',JSON.parse(readFileSync(oauth,'utf8')));
  console.log(imported?'ย้ายข้อมูลและการเชื่อม Google Drive ไป Supabase แล้ว':'ข้อมูล Supabase มีอยู่แล้ว ไม่เขียนทับ; ตรวจและย้ายการเชื่อม Google Drive แล้ว');
}finally{local.close();}
