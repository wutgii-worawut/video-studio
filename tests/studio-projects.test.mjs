import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {readFile,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execFileAsync=promisify(execFile);
import {createStudioServer,ROOT} from '../studio.mjs';
import {projectTemplate} from '../lib/studio-projects.mjs';

const suffix=()=>randomUUID().replace(/-/g,'').slice(0,9);
async function open(){
  const server=createStudioServer({modern:true,terminal:false});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  return {server,url:'http://127.0.0.1:'+server.address().port};
}
async function shutdown(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
async function create(url,input){
 const r=await fetch(url+'/api/projects',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify(input)});
 return {status:r.status,body:await r.json()};
}
test('new project template validates paths, duration and clip timings',()=>{
 for(const name of ['../escape','bad_name','UPPER','.hidden',''])assert.throws(()=>projectTemplate({name,title:'Bad'}));
 assert.throws(()=>projectTemplate({name:'safe-name',duration:1}),/Duration/);
 assert.throws(()=>projectTemplate({name:'safe-name',duration:181}),/Duration/);
 const spec=projectTemplate({name:'good-project',title:'Hello world',template:'starter',duration:7});
 assert.equal(spec.composition.clips.length,3);
 assert.equal(spec.composition.clips.at(-1).start+spec.composition.clips.at(-1).duration,7);
});
test('new projects endpoint creates full editable workspace, never overwrites', {timeout:14000},async()=>{
 const {server,url}=await open(),name='test-new-'+suffix();
 const folder=join(ROOT,'projects',name);
 try{
  const response=await create(url,{name,title:'My Video',template:'starter',duration:9});
  assert.equal(response.status,201,JSON.stringify(response.body));
  const comp=JSON.parse(await readFile(join(folder,'source','composition.json'),'utf8'));
  assert.equal(comp.duration,9);assert.equal(comp.clips.length,3);
  for(const file of ['source/index.html','source/composition-data.js','brand/brand.md','docs/README.md']){
    assert.ok((await stat(join(folder,file))).isFile());
  }
  const names=await fetch(url+'/api/projects').then(r=>r.json());
  assert.ok(names.some(p=>p.name===name));
  const duplicate=await create(url,{name,title:'Should not overwrite'});
  assert.notEqual(duplicate.status,201);
  assert.equal(JSON.parse(await readFile(join(folder,'source','composition.json'),'utf8')).duration,9);
  const cross=await fetch(url+'/api/projects',{method:'POST',headers:{Origin:'https://evil.invalid','Content-Type':'application/json'},body:JSON.stringify({name:'untrusted'})});
  assert.notEqual(cross.status,201);
  const check=await fetch(url+'/api/studio/preview/'+name+'?render');
  assert.equal(check.status,200);
 }finally{await rm(folder,{recursive:true,force:true});await shutdown(server);}
});
test('created blank project passes real Playwright/FFmpeg render workflow', {timeout:60000},async()=>{
 const {server,url}=await open(),name='test-render-'+suffix(),folder=join(ROOT,'projects',name);
 try{
  const result=await create(url,{name,title:'New Studio Project',template:'blank',duration:2});
  assert.equal(result.status,201,JSON.stringify(result.body));
  const check=await execFileAsync(process.execPath,['render.mjs',name,'check'],{cwd:ROOT,timeout:35000});
  assert.match(check.stdout,/layout OK/);
  const draft=await execFileAsync(process.execPath,['render.mjs',name,'video','1','2'],{cwd:ROOT,timeout:55000,maxBuffer:5000000});
  assert.match(draft.stdout,/PUBLISHED /);
  const file=join(folder,'output',name+'.mp4');
  assert.ok((await stat(file)).size>5000);
 }finally{await rm(folder,{recursive:true,force:true});await shutdown(server);}
});
test('React New Project form creates playable project and frame fits full 1080x1920', {timeout:45000},async()=>{
 const {server,url}=await open(),name='test-ui-'+suffix();
 const folder=join(ROOT,'projects',name);
 let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1366,height:768}});
  const native=[];const errors=[];
  page.on('dialog',d=>{native.push(d.type());d.dismiss()});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/');
  await page.locator('.project-button').click();
  await page.getByRole('heading',{name:'New project'}).waitFor();
  await page.getByLabel('Project folder name').fill(name);
  await page.getByLabel('Video title').fill('ทดสอบ Video Studio');
  await page.getByLabel('Duration (seconds)').fill('6');
  await page.getByRole('button',{name:/3-scene starter/}).click();
  await page.getByRole('button',{name:'Create & open'}).click();
  await page.waitForFunction(project=>document.body.textContent?.includes(project),name,{timeout:10000});
  await page.locator('iframe[title="Project animation preview"]').waitFor();
  await page.locator('.inline-status.connected').waitFor({timeout:12000});
  await page.getByRole('radio',{name:'Preview-first'}).click();
  await page.locator('.inline-status.connected').waitFor({timeout:12000});
  const measure=async()=>page.locator('.video-frame').evaluate(holder=>{
    const iframe=holder.querySelector('iframe');const a=holder.getBoundingClientRect(),b=iframe.getBoundingClientRect();
    return {viewportWidth:iframe.clientWidth,viewportHeight:iframe.clientHeight,frameWidth:a.width,frameHeight:a.height,actualWidth:b.width,actualHeight:b.height,
      scale:Number.parseFloat(getComputedStyle(iframe).transform.match(/matrix\(([^,]+)/)?.[1]||'0')};
  });
  const before=await measure();
  assert.equal(before.viewportWidth,1080);
  assert.equal(before.viewportHeight,1920);
  assert.ok(Math.abs(before.actualWidth-before.frameWidth)<4,JSON.stringify(before));
  assert.ok(Math.abs(before.actualHeight-before.frameHeight)<4,JSON.stringify(before));
  await page.getByRole('button',{name:'Expand preview'}).click();
  const expanded=await measure();
  assert.ok(Math.abs(expanded.actualWidth-expanded.frameWidth)<4,JSON.stringify(expanded));
  assert.ok(Math.abs(expanded.actualHeight-expanded.frameHeight)<4,JSON.stringify(expanded));
  await page.getByRole('button',{name:'Restore workspace'}).click();
  await page.getByRole('navigation',{name:'Pages'}).getByRole('button',{name:'Code',exact:true}).click();
  await page.locator('button.tree-row').filter({hasText:'index.html'}).first().click();
  await page.getByTestId('monaco-editor').waitFor();
  await page.waitForTimeout(850);
  assert.deepEqual(errors,[],'Monaco workers and Source Inspector must not throw page errors');
  assert.deepEqual(native,[],'React dialogs only');
 }finally{await browser?.close();await rm(folder,{recursive:true,force:true});await shutdown(server);}
});
