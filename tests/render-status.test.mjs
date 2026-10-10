import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,readdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {readRenderStatus,writeRenderStatus,statusFile} from '../lib/render-status.mjs';
import {createStudioServer,ROOT} from '../studio.mjs';

test('render status: none when absent, atomic write, dead running process reported as failed',async()=>{
 const root=await mkdtemp(join(tmpdir(),'vs-status-'));
 try{
  const out=join(root,'projects','demo','output');await mkdir(out,{recursive:true});
  assert.deepEqual(await readRenderStatus(root,'demo'),{state:'none'});
  await writeRenderStatus(out,{state:'running',pid:process.pid,mode:'video'});
  assert.deepEqual(await readdir(out),['.render-status.json'],'no temp files left behind');
  const live=await readRenderStatus(root,'demo');
  assert.equal(live.state,'running');assert.match(live.updatedAt,/^\d{4}-/);
  await writeFile(statusFile(out),JSON.stringify({state:'running',pid:2147483646}));
  assert.deepEqual(await readRenderStatus(root,'demo'),{state:'failed',pid:2147483646,error:'process exited'});
  await writeFile(statusFile(out),'{not json');
  assert.deepEqual(await readRenderStatus(root,'demo'),{state:'none'});
  await assert.rejects(readRenderStatus(root,'../etc'));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('a draft render started outside Studio shows up in the top bar and Render page, then completes',{timeout:120000},async()=>{
 const server=createStudioServer({modern:true,terminal:false});server.listen(0,'127.0.0.1');await once(server,'listening');
 const url='http://127.0.0.1:'+server.address().port,name='test-status-'+randomUUID().slice(0,8);let browser,child;
 try{
  const created=await fetch(url+'/api/projects',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify({name,title:'Status',duration:6,template:'starter'})});
  assert.equal(created.status,201);
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.addInitScript(project=>{try{localStorage.setItem('vs-last-project',project);localStorage.setItem('vs-page','render')}catch{/* sandboxed preview */}},name);
  await page.goto(url+'/');await page.getByTestId('react-studio').waitFor();
  child=spawn(process.execPath,['render.mjs',name,'video','1','2'],{cwd:ROOT,stdio:'ignore'}); // what Claude would run in the terminal
  await page.getByTestId('external-render').waitFor({timeout:30000});
  await page.locator('.status-pill').filter({hasText:'Rendering draft'}).waitFor();
  assert.equal((await once(child,'close'))[0],0);
  await page.getByTestId('external-render').waitFor({state:'detached',timeout:10000});
  await page.locator('.mp4-card').filter({hasText:name+'.mp4'}).waitFor({timeout:10000});
  const status=JSON.parse(await readFile(join(ROOT,'projects',name,'output','.render-status.json'),'utf8'));
  assert.equal(status.state,'complete');assert.deepEqual(status.frames,{done:180,total:180});assert.equal(status.output,'output/'+name+'.mp4');
 }finally{child?.kill();await browser?.close();await rm(join(ROOT,'projects',name),{recursive:true,force:true});server.closeAllConnections();await new Promise(r=>server.close(r));}
});
