import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { createStudioServer } from '../studio.mjs';
import { parseStudioCommand } from '../lib/studio-tasks.mjs';
import { workspaceEntries, readWorkspaceText, parseExplorerPath } from '../lib/studio-workspace.mjs';
import { ROOT } from '../studio.mjs';

async function serverForTest() {
 const server=createStudioServer();
 server.listen(0,'127.0.0.1');
 await once(server,'listening');
 return {server,url:'http://127.0.0.1:'+server.address().port};
}
async function close(server) {
 server.closeAllConnections();
 await new Promise(resolve=>server.close(resolve));
}
test('workspace explorer groups list local brand, shared FX, docs and model metadata',async()=>{
 const proj='sword-of-coming-s2';
 const brand=await workspaceEntries(ROOT,proj,'brand');
 assert.ok(brand.entries.some(x=>x.name==='brand.md'));
 assert.ok(brand.entries.some(x=>x.name==='voice.mp3'));
 const fx=await workspaceEntries(ROOT,proj,'fx');
 assert.ok(fx.entries.some(x=>x.name==='fx.js'));
 const docs=await workspaceEntries(ROOT,proj,'documents');
 assert.ok(docs.entries.some(x=>x.name==='brand.md'));
 assert.ok(docs.entries.some(x=>x.name==='production-readiness.md'));
 const models=await workspaceEntries(ROOT,proj,'models');
 assert.ok(models.entries.some(x=>x.name.endsWith('.bin')&&x.metadataOnly&&!x.previewable));
 const entry=brand.entries.find(x=>x.name==='brand.md');
 const text=await readWorkspaceText(ROOT,proj,'brand',entry.path);
 assert.match(text.text,/./);
 assert.throws(()=>parseExplorerPath('0/../escape'),/Invalid/);
 await assert.rejects(readWorkspaceText(ROOT,proj,'brand','0/voice.mp3'),/Text preview/);
});
test('task parser allows render workflow but forbids arbitrary shell execution',()=>{
 const project='sword-of-coming-s2';
 assert.deepEqual(parseStudioCommand(project,'help'),{builtin:'help',label:'help'});
 assert.deepEqual(parseStudioCommand(project,'render 1 2').args.slice(0,3),['render.mjs',project,'video']);
 assert.equal(parseStudioCommand(project,'check').args[2],'check');
 assert.equal(parseStudioCommand(project,'probe').executable,'ffprobe');
 assert.throws(()=>parseStudioCommand(project,'del C:/Users'),/not supported/);
 assert.throws(()=>parseStudioCommand(project,'check & format C:'),/operators/);
 assert.throws(()=>parseStudioCommand(project,'render 0 2'),/positive/);
 assert.throws(()=>parseStudioCommand('../../oops','check'),/project name/);
});
test('explorer API exposes text/media but not arbitrary files or mutable endpoints', {timeout:20000},async()=>{
 const {server,url}=await serverForTest();
 try {
   const list=await fetch(url+'/api/studio/entries?project=sword-of-coming-s2&group=brand');
   assert.equal(list.status,200);
   const body=await list.json();
   const md=body.entries.find(x=>x.name==='brand.md');
   const voice=body.entries.find(x=>x.name==='voice.mp3');
   assert.ok(md&&voice);
   const docs=await fetch(url+'/api/studio/text?'+new URLSearchParams({
     project:'sword-of-coming-s2',group:'brand',path:md.path}));
   assert.equal(docs.status,200);
   assert.ok((await docs.json()).text.length>100);
   const sound=await fetch(url+'/api/studio/media?'+new URLSearchParams({
     project:'sword-of-coming-s2',group:'brand',path:voice.path}),{method:'HEAD'});
   assert.equal(sound.status,200);
   assert.equal(sound.headers.get('content-type'),'audio/mpeg');
   const sneaky=await fetch(url+'/api/studio/text?'+new URLSearchParams({
     project:'sword-of-coming-s2',group:'brand',path:'0/../source/index.html'}));
   assert.notEqual(sneaky.status,200);
   const forbidden=await fetch(url+'/api/studio/media?'+new URLSearchParams({
     project:'sword-of-coming-s2',group:'models',path:'0/ggml-large-v3-turbo-q5_0.bin'}));
   assert.notEqual(forbidden.status,200);
   const invalid=await fetch(url+'/api/studio/task',{method:'POST',
     headers:{'Origin':'https://outside.invalid','Content-Type':'application/json'},
     body:JSON.stringify({project:'sword-of-coming-s2',command:'status'})});
   assert.notEqual(invalid.status,202);
 }finally{await close(server);}
});
test('task console runs git status without shell and exposes result log', {timeout:30000},async()=>{
 const {server,url}=await serverForTest();
 try{
   const req=await fetch(url+'/api/studio/task',{method:'POST',headers:{
     'Content-Type':'application/json',Origin:url
   },body:JSON.stringify({project:'sword-of-coming-s2',command:'status'})});
   assert.equal(req.status,202);
   const started=await req.json();assert.ok(started.id);
   let job;
   const deadline=Date.now()+12000;
   while(Date.now()<deadline){
     const r=await fetch(url+'/api/studio/task?id='+encodeURIComponent(started.id));
     job=await r.json();
     if(job.status!=='running')break;
     await new Promise(resolve=>setTimeout(resolve,80));
   }
   assert.equal(job.status,'complete',job?.output);
   assert.match(job.output,/M README.md|M studio.mjs|\?\? studio|Exit 0/);
 }finally{await close(server);}
});
test('Chrome workbench browses brand/docs/assets/fx/models and runs check in console', {timeout:50000},async()=>{
 const {server,url}=await serverForTest();
 let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1460,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/');
  await page.locator('#project').selectOption('sword-of-coming-s2');
  await page.waitForFunction(()=>state.project==='sword-of-coming-s2' &&
      document.getElementById('file-count').textContent.includes('files'),null,{timeout:15000});
  assert.equal(await page.locator('#file-preview').locator('.file-heading').textContent(),'brand.md');
  await page.locator('[data-group="fx"]').click();
  await page.locator('#file-list').getByRole('button',{name:/fx\.js/}).click();
  assert.match(await page.locator('#file-preview pre').textContent(),/function|const|FX/);
  await page.locator('[data-group="models"]').click();
  await page.locator('#file-list').getByText(/ggml-large-v3-turbo/).waitFor();
  assert.match(await page.locator('#file-list').textContent(),/ggml-large-v3-turbo/);
  await page.locator('#file-list button.file-entry').first().click();
  assert.match(await page.locator('#file-preview').textContent(),/metadata only/i);
  await page.locator('[data-group="assets"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-group="assets"]').classList.contains('active') && !document.getElementById('file-list').textContent.includes('Loading files'));
  assert.match(await page.locator('#file-count').textContent(),/files/);
  await page.locator('[data-group="documents"]').click();
  await page.locator('#file-list').getByText(/production-readiness\.md/).waitFor();
  assert.match(await page.locator('#file-list').textContent(),/production-readiness\.md/);
  await page.locator('[data-panel="scenes"]').click();
  await page.waitForFunction(()=>document.getElementById('segments').children.length>0);
  const sceneCount=await page.locator('#segments button').count();
  assert.ok(sceneCount>0);
  await page.locator('[data-panel="file"]').click();
  await page.locator('#console-command').fill('check');
  await page.locator('#console-form button[type="submit"]').click();
  await page.waitForFunction(()=>document.getElementById('console-state').textContent.toLowerCase()==='complete',
    null,{timeout:20000});
  assert.match(await page.locator('#console-output').textContent(),/layout OK/);
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await close(server);}
});
