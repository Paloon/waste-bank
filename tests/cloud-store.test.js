import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudStore} from '../server/cloud-store.js';

test('Supabase state commits retry after concurrent version changes',async()=>{
  let row={version:0,value:{coins:0}},calls=0;
  const fetcher=async(url,options={})=>{
    if(url.includes('waste_bank_state?'))return Response.json([structuredClone(row)]);
    if(url.endsWith('rpc/waste_bank_commit')){
      const body=JSON.parse(options.body);calls++;
      if(calls===1){row={version:1,value:{coins:5}};return Response.json(false);}
      if(body.expected_version!==row.version)return Response.json(false);
      row={version:row.version+1,value:body.next_value};return Response.json(true);
    }
    throw new Error('Unexpected request '+url);
  };
  const store=createCloudStore({url:'https://example.supabase.co',key:'test',fetcher});
  const result=await store.transact(s=>{s.coins+=2;return s.coins;});
  assert.equal(result,7);
  assert.equal((await store.read()).coins,7);
  assert.equal(row.version,2);
});
