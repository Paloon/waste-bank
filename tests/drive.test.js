import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDrive } from '../server/drive.js';

test('OAuth, private folder uploads, download, move and retention delete', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'waste-drive-'));
  const oldFetch = globalThis.fetch;
  const names = ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','DRIVE_EVIDENCE_FOLDER_ID','DRIVE_WASTE_FOLDER_ID','DRIVE_REWARDS_FOLDER_ID'];
  const old = Object.fromEntries(names.map(name => [name, process.env[name]]));
  Object.assign(process.env, { GOOGLE_CLIENT_ID:'test-client', GOOGLE_CLIENT_SECRET:'test-secret',
    DRIVE_EVIDENCE_FOLDER_ID:'evidence12345', DRIVE_WASTE_FOLDER_ID:'wastepicture12345',
    DRIVE_REWARDS_FOLDER_ID:'rewards12345' });
  const seen = [];
  globalThis.fetch = async (url, options = {}) => {
    seen.push({url: String(url), options});
    if(String(url).includes('oauth2.googleapis.com/token'))return Response.json({refresh_token:'refresh-test',access_token:'access-test',expires_in:3600});
    if(String(url).includes('uploadType=multipart'))return Response.json({id:'uploadedFile12345'});
    if(String(url).includes('alt=media'))return new Response(Buffer.from('photo'),{headers:{'content-type':'image/jpeg'}});
    if(options.method==='DELETE')return new Response(null,{status:204});
    if(options.method==='PATCH')return Response.json({id:'uploadedFile12345'});
    if(String(url).includes('uploadedFile12345'))return Response.json({parents:['evidence12345']});
    return Response.json({mimeType:'application/vnd.google-apps.folder'});
  };
  try {
    const drive=createDrive(dir);
    assert.equal(drive.configured,true);
    const url=new URL(drive.authUrl('teacher.mali'));
    assert.equal(url.searchParams.get('scope'),'https://www.googleapis.com/auth/drive');
    await drive.exchange('one-time-code',url.searchParams.get('state'));
    await drive.verifyFolders();
    const id=await drive.upload('evidence','data:image/jpeg;base64,cGhvdG8=','submission.jpg');
    assert.equal(id,'uploadedFile12345');
    assert.ok(seen.find(x=>x.url.includes('uploadType=multipart')).options.body.includes('evidence12345'));
    assert.equal(await (await drive.download(id)).text(),'photo');
    await drive.moveToWaste(id);
    assert.ok(seen.find(x=>x.options.method==='PATCH').url.includes('addParents=wastepicture12345'));
    await drive.remove(id);
    assert.ok(seen.some(x=>x.options.method==='DELETE'));
  } finally {
    globalThis.fetch=oldFetch;
    for(const name of names)old[name]===undefined?delete process.env[name]:process.env[name]=old[name];
    rmSync(dir,{recursive:true,force:true});
  }
});
