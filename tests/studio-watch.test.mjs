import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {appendFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {watchProject} from '../lib/studio-watch.mjs';
import {createStudioServer,ROOT} from '../studio.mjs';
const wait=ms=>new Promise(r=>setTimeout(r,ms));

test('watchProject debounces edits, skips staging/temp files and never reports output/',async()=>{
 const root=await mkdtemp(join(tmpdir(),'vs-watch-'));
 const base=join(root,'projects','demo');
 for(const d of ['source','brand','output'])await mkdir(join(base,d),{recursive:true});
 const events=[];const close=watchProject(root,'demo',e=>events.push(e.path),{debounceMs:150});
 try{
  await wait(100);
  await writeFile(join(base,'source','index.html'),'a');await appendFile(join(base,'source','index.html'),'b');
  await writeFile(join(base,'source','index.html.vs-edit-1'),'x');await writeFile(join(base,'source','x.stage-1-2'),'x');
  await writeFile(join(base,'source','.hidden'),'x');await writeFile(join(base,'output','video.mp4'),'x');
  await writeFile(join(base,'brand','brand.md'),'x');
  await wait(600);
  assert.deepEqual([...new Set(events)].sort(),['brand/brand.md','source/index.html']);
  assert.equal(events.filter(p=>p==='source/index.html').length,1,'two quick writes → one event');
  assert.throws(()=>watchProject(root,'../x',()=>{}));
 }finally{close();await rm(root,{recursive:true,force:true});}
});

test('editing files on disk reloads the preview, lists the change and guards unsaved Code edits',{timeout:60000},async()=>{
 const server=createStudioServer({modern:true,terminal:false});server.listen(0,'127.0.0.1');await once(server,'listening');
 const url='http://127.0.0.1:'+server.address().port,name='test-watch-'+randomUUID().slice(0,8),dir=join(ROOT,'projects',name);let browser;
 try{
  const created=await fetch(url+'/api/projects',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify({name,title:'Watch',duration:3,template:'blank'})});
  assert.equal(created.status,201);
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(project=>{try{localStorage.setItem('vs-last-project',project);localStorage.setItem('vs-page','director');localStorage.setItem('vs-director-mode','terminal')}catch{/* sandboxed preview */}},name);
  await page.goto(url+'/');await page.locator('.inline-status.connected').waitFor({timeout:15000});
  await page.locator('iframe[title="Project animation preview"]').evaluate(el=>{el.dataset.old='1'});
  await appendFile(join(dir,'source','index.html'),'\n<!-- edited by Claude -->\n'); // what an agent edit looks like
  await page.getByText(/Reloaded · index\.html changed/).waitFor({timeout:10000});
  await page.locator('iframe[title="Project animation preview"]:not([data-old])').waitFor({timeout:10000});
  await page.getByRole('region',{name:'Changed this session'}).getByRole('button',{name:/source\/index\.html/}).click();
  await page.getByTestId('monaco-editor').waitFor();
  // Clean tab: follows the disk silently.
  await appendFile(join(dir,'source','index.html'),'<!-- second edit -->\n');
  // Monaco only renders visible lines: jump to the end, then look for the appended text.
  await page.waitForTimeout(800);
  await page.locator('.monaco-editor .view-lines').first().click();await page.keyboard.press('Control+End');
  await page.locator('.monaco-editor').getByText('second edit').waitFor({timeout:10000});
  // Dirty tab: ask instead of overwriting.
  await page.locator('.monaco-editor .view-lines').first().click();
  await page.keyboard.press('Control+End');await page.keyboard.type('<!-- mine -->');
  await appendFile(join(dir,'source','index.html'),'<!-- third edit -->\n');
  await page.getByRole('alert').filter({hasText:'File changed on disk'}).waitFor({timeout:10000});
  await page.getByRole('button',{name:'Keep mine'}).click();
  await page.locator('.monaco-editor .view-lines').first().click();
  await page.keyboard.press('Control+s');
  await page.getByText('Saved index.html').waitFor();
  const saved=await readFile(join(dir,'source','index.html'),'utf8');
  assert.match(saved,/<!-- mine -->/);assert.doesNotMatch(saved,/third edit/,'Keep mine overwrites deliberately');
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await rm(dir,{recursive:true,force:true});server.closeAllConnections();await new Promise(r=>server.close(r));}
});
