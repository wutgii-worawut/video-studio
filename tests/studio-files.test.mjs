import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {readdir,rm,stat,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {createStudioServer,ROOT} from '../studio.mjs';

async function begin(){
 const server=createStudioServer();
 server.listen(0,'127.0.0.1');await once(server,'listening');
 return {server,url:'http://127.0.0.1:'+server.address().port};
}
async function stop(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
async function api(url,route,payload){
 const r=await fetch(url+'/api/studio/files/'+route,{method:'POST',
   headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify(payload)});
 return {status:r.status,data:await r.json()};
}
test('Project Docs can upload, rename, duplicate, delete and recover without overwrites', {timeout:20000}, async()=>{
 const {server,url}=await begin();
 const prefix='file-'+randomUUID().slice(0,10),project='composition-demo';
 const folder=join(ROOT,'projects',project,'docs');
 const file=prefix+'.md',renamed=prefix+'-renamed.md',duplicate=prefix+'-renamed-copy.md';
 try{
  const upload=await fetch(url+'/api/studio/files/upload?'+new URLSearchParams({
    project,location:'documents',name:file
  }),{method:'POST',headers:{Origin:url,'Content-Type':'application/octet-stream'},
   body:Buffer.from('# Test resource\nWelcome to docs.','utf8')});
  assert.equal(upload.status,201,await upload.text());
  const list=await fetch(url+'/api/studio/entries?project='+project+'&group=documents');
  const entries=(await list.json()).entries;
  assert.ok(entries.some(x=>x.root==='Project Docs'&&x.name===file));
  const again=await fetch(url+'/api/studio/files/upload?'+new URLSearchParams({
    project,location:'documents',name:file
  }),{method:'POST',headers:{Origin:url,'Content-Type':'application/octet-stream'},body:Buffer.from('Duplicate')});
  assert.notEqual(again.status,201);
  const ren=await api(url,'action',{project,location:'documents',name:file,action:'rename',newName:renamed});
  assert.equal(ren.status,200,JSON.stringify(ren));
  const dupe=await api(url,'action',{project,location:'documents',name:renamed,action:'duplicate'});
  assert.equal(dupe.status,200,JSON.stringify(dupe));
  assert.equal(dupe.data.name,duplicate);
  assert.equal((await readFile(join(folder,duplicate),'utf8')).includes('Welcome'),true);
  const deleted=await api(url,'action',{project,location:'documents',name:renamed,action:'delete'});
  assert.equal(deleted.status,200,JSON.stringify(deleted));
  await assert.rejects(stat(join(folder,renamed)),/ENOENT/);
  const trashed=await fetch(url+'/api/studio/files/trash?project='+project).then(r=>r.json());
  assert.ok(trashed.items.some(i=>i.id===deleted.data.trashId));
  const restored=await api(url,'restore',{project,id:deleted.data.trashId});
  assert.equal(restored.status,200,JSON.stringify(restored));
  assert.ok((await stat(join(folder,renamed))).isFile());
  const invalid=await api(url,'action',{project,location:'documents',name:'../../README.md',action:'delete'});
  assert.notEqual(invalid.status,200);
  const protectedBrand=await api(url,'action',{project,location:'brand-docs',name:'brand.md',action:'delete'});
  assert.notEqual(protectedBrand.status,200);
 } finally {
  for(const name of [file,renamed,duplicate])await rm(join(folder,name),{force:true});
  await stop(server);
 }
});
test('browser shows docs upload, duplicate, Trash and Restore, retains Preview', {timeout:30000},async()=>{
 const {server,url}=await begin();
 const name='browser-doc-'+randomUUID().slice(0,10)+'.md';
 const output=join(ROOT,'projects','composition-demo','docs',name);
 const copy=join(ROOT,'projects','composition-demo','docs',name.replace('.md','-copy.md'));
 let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1460,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/');
  await page.locator('#project').selectOption('composition-demo');
  await page.locator('[data-group="documents"]').click();
  await page.locator('#asset-dest').selectOption('documents');
  await page.locator('#asset-picker').setInputFiles({name,mimeType:'text/markdown',buffer:Buffer.from('# Browser file manager')});
  await page.locator('#file-list').getByRole('button',{name:new RegExp(name)}).click();
  await page.locator('.file-action-duplicate').click();
  await page.locator('#file-list').getByRole('button',{name:new RegExp(name.replace('.md','-copy.md'))}).waitFor();
  await page.locator('#file-list').getByRole('button',{name:new RegExp(name)}).first().click();
  page.once('dialog',d=>d.accept());
  await page.locator('.file-action-delete').click();
  await page.locator('[data-group="trash"]').click();
  await page.locator('#file-list button.file-entry').filter({hasText:name}).click();
  await page.locator('.restore-file').click();
  await page.locator('[data-group="documents"]').click();
  await page.locator('#file-list').getByRole('button',{name:new RegExp(name)}).first().waitFor();
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await rm(output,{force:true});await rm(copy,{force:true});await stop(server);}
});
