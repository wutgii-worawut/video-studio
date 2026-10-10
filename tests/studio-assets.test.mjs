import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {readFile,rm,stat,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {createStudioServer,ROOT} from '../studio.mjs';
import {assetFilename} from '../lib/studio-assets.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64');
async function begin(){
 const server=createStudioServer();
 server.listen(0,'127.0.0.1'); await once(server,'listening');
 return {server,url:'http://127.0.0.1:'+server.address().port};
}
async function close(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
test('media filenames cannot escape project folders or change file types',()=>{
 for(const name of ['../oops.png','foo/bar.png','CON.jpg','.staged.png','evil.svg','a:b.png','image.png.exe'])
  assert.throws(()=>assetFilename(name),/Invalid|only image/);
 assert.equal(assetFilename('ภาพตัวละคร 01.png'),'ภาพตัวละคร 01.png');
});
test('project media upload and rename do not replace existing files', {timeout:25000},async()=>{
 const {server,url}=await begin(),tag=randomUUID().slice(0,12);
 const names=[tag+'.png',tag+'-renamed.png'],brandName=tag+'-brand.png';
 const project='composition-demo',base=join(ROOT,'projects',project);
 const dest=join(base,'source','img'),brand=join(base,'brand');
 try{
  const send=async(location,name,body=png)=>fetch(url+'/api/studio/assets/upload?'+new URLSearchParams({
    project,location,name}),{method:'POST',headers:{'Content-Type':'application/octet-stream',Origin:url},body});
  const create=await send('assets',names[0]);assert.equal(create.status,201,await create.text());
  assert.equal((await stat(join(dest,names[0]))).size,png.length);
  const again=await send('assets',names[0]);assert.notEqual(again.status,201);
  const bad=await send('assets',tag+'bad.png',Buffer.from('<script>'));
  assert.notEqual(bad.status,201);
  const wrong=await send('assets','../escape.png');assert.notEqual(wrong.status,201);
  const branded=await send('brand',brandName);assert.equal(branded.status,201,await branded.text());
  const moved=await fetch(url+'/api/studio/assets/rename',{method:'POST',headers:{
    'Content-Type':'application/json',Origin:url},body:JSON.stringify({project,location:'assets',
    oldName:names[0],newName:names[1]})});
  assert.equal(moved.status,200,await moved.text());
  assert.equal((await stat(join(dest,names[1]))).size,png.length);
  await assert.rejects(stat(join(dest,names[0])),/ENOENT/);
  const list=await fetch(url+'/api/studio/entries?project='+project+'&group=assets');
  const items=(await list.json()).entries;
  assert.ok(items.some(x=>x.name===names[1]));
  assert.ok(items.some(x=>x.name===brandName));
 }finally{
   for(const n of names)await rm(join(dest,n),{force:true});
   await rm(join(brand,brandName),{force:true});
   await close(server);
 }
});
test('Chrome UI upload, preview expansion and return to live preview', {timeout:45000},async()=>{
 const {server,url}=await begin(),tag=randomUUID().slice(0,10),name='visual-'+tag+'.png';
 let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1480,height:930}});
  const errors=[];page.on('pageerror',e=>errors.push(e.stack));
  await page.goto(url+'/');await page.locator('#project').selectOption('composition-demo');
  await page.locator('#asset-dest').selectOption('assets');
  await page.locator('#asset-picker').setInputFiles({name,mimeType:'image/png',buffer:png});
  await page.locator('#file-list').getByRole('button',{name:new RegExp(name)}).waitFor({timeout:12000});
  await page.locator('#file-list').getByRole('button',{name:new RegExp(name)}).click();
  await page.locator('#file-preview img').waitFor();
  page.once('dialog',dialog=>dialog.accept('renamed-'+name));
  await page.locator('.rename-file').click();
  await page.locator('#file-list').getByRole('button',{name:new RegExp('renamed-'+name)}).waitFor();
  await page.locator('#inspector-full').click();
  assert.equal(await page.locator('.workbench').evaluate(el=>el.classList.contains('inspector-expanded')),true);
  await page.locator('#inspector-back').click();
  assert.equal(await page.locator('.workbench').evaluate(el=>el.classList.contains('inspector-expanded')),false);
  await page.locator('#preview-full').click();
  assert.equal(await page.locator('.workbench').evaluate(el=>el.classList.contains('preview-expanded')),true);
  await page.locator('#preview-full').click();
  assert.equal(await page.locator('.workbench').evaluate(el=>el.classList.contains('preview-expanded')),false);
  assert.deepEqual(errors,[]);
 }finally{
  await browser?.close();
  await rm(join(ROOT,'projects','composition-demo','source','img',name),{force:true});
  await rm(join(ROOT,'projects','composition-demo','source','img','renamed-'+name),{force:true});
  await close(server);
 }
});

test('nested brand media rename works only inside approved project tree', {timeout:10000},async()=>{
 const {server,url}=await begin(),folder='web-test-'+randomUUID().slice(0,8);
 const brand=join(ROOT,'projects','composition-demo','brand'),dir=join(brand,folder);
 await mkdir(dir);
 try{
   await writeFile(join(dir,'before.png'),png);
   const rename=await fetch(url+'/api/studio/assets/rename',{method:'POST',
     headers:{Origin:url,'Content-Type':'application/json'},
     body:JSON.stringify({project:'composition-demo',location:'brand',folder,
       oldName:'before.png',newName:'after.png'})});
   assert.equal(rename.status,200,await rename.text());
   assert.ok((await stat(join(dir,'after.png'))).isFile());
   const escape=await fetch(url+'/api/studio/assets/rename',{method:'POST',
     headers:{Origin:url,'Content-Type':'application/json'},
     body:JSON.stringify({project:'composition-demo',location:'brand',folder:'../source',
       oldName:'after.png',newName:'bad.png'})});
   assert.notEqual(escape.status,200);
 }finally{await rm(dir,{recursive:true,force:true});await close(server);}
});
