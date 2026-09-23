// Supabase stores the application state in one versioned JSONB row. The RPC
// compares versions inside PostgreSQL so concurrent requests cannot overwrite
// each other's ledger, stock, or approval changes.
export function createCloudStore({url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY,fetcher=fetch}={}){
  if(!url||!key)throw new Error('ตั้งค่า SUPABASE_URL และ SUPABASE_SECRET_KEY ก่อนเปิดเว็บ');
  const base=url.replace(/\/$/,'')+'/rest/v1/';
  async function request(path,options={}){
    const response=await fetcher(base+path,{...options,headers:{apikey:key,'Content-Type':'application/json',...options.headers}});
    if(!response.ok)throw new Error(`Supabase ${response.status}: ${(await response.text()).slice(0,250)}`);
    const body=await response.text();
    return body?JSON.parse(body):null;
  }
  async function snapshot(){
    const rows=await request('waste_bank_state?id=eq.1&select=version,value');
    if(!rows.length)throw new Error('ยังไม่ได้สร้างข้อมูล Supabase: รัน npm run migrate:supabase');
    return rows[0];
  }
  return {
    read:async()=>structuredClone((await snapshot()).value),
    async initialize(value){
      const rows=await request('waste_bank_state?id=eq.1&select=id');
      if(rows.length)return false;
      await request('waste_bank_state',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({id:1,version:0,value})});
      return true;
    },
    async transact(fn){
      for(let attempt=0;attempt<8;attempt++){
        const {version,value}=await snapshot();
        const next=structuredClone(value),result=fn(next);
        const saved=await request('rpc/waste_bank_commit',{method:'POST',body:JSON.stringify({expected_version:version,next_value:next})});
        if(saved===true)return result;
      }
      throw new Error('มีการบันทึกพร้อมกันมาก กรุณาลองใหม่');
    },
    async getSecret(name){const rows=await request(`waste_bank_secrets?name=eq.${encodeURIComponent(name)}&select=value`);return rows[0]?.value||null;},
    async setSecret(name,value){await request('waste_bank_secrets?on_conflict=name',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({name,value})});},
  };
}
