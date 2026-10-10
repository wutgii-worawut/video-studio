import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {createStudioServer,ROOT} from '../studio.mjs';

async function serve(terminal=false){
 const server=createStudioServer({modern:true,terminal});server.listen(0,'127.0.0.1');await once(server,'listening');
 return {server,url:'http://127.0.0.1:'+server.address().port};
}
const stop=server=>{server.closeAllConnections();return new Promise(r=>server.close(r));};
const post=(url,body,origin=url)=>fetch(url+'/api/studio/frame',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
async function tempProject(url){
 const name='test-frame-'+randomUUID().slice(0,8);
 const r=await fetch(url+'/api/projects',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify({name,title:'Frame',duration:3,template:'blank'})});
 assert.equal(r.status,201);return name;
}

test('frame API rejects bad input, unknown projects and foreign origins',async()=>{
 const {server,url}=await serve();
 try{
  assert.equal((await post(url,{project:'no-such-project-xyz',time:1})).status,404);
  assert.equal((await post(url,{project:'Bad Name',time:1})).status,400);
  assert.equal((await post(url,{project:'composition-demo',time:-1})).status,400);
  assert.equal((await post(url,{project:'composition-demo',time:'1'})).status,400);
  const foreign=await post(url,{project:'composition-demo',time:1},'http://evil.example');
  assert.ok(foreign.status>=400&&foreign.status<500,String(foreign.status));
 }finally{await stop(server);}
});

test('frame API renders one PNG into output/frames and rejects times past the end',{timeout:60000},async()=>{
 const {server,url}=await serve();let name;
 try{
  name=await tempProject(url);
  const r=await post(url,{project:name,time:1.5});
  const body=await r.json();
  assert.equal(r.status,200,JSON.stringify(body));
  assert.equal(body.path,'projects/'+name+'/output/frames/frame-00-01-50.png');
  assert.ok((await stat(join(ROOT,body.path))).size>1000);
  const late=await post(url,{project:name,time:99});
  assert.equal(late.status,422);
  assert.match((await late.json()).error,/past the end/);
 }finally{if(name)await rm(join(ROOT,'projects',name),{recursive:true,force:true});await stop(server);}
});

test('Director frame chip inserts the captured @path into the terminal without Enter',{timeout:60000},async()=>{
 const {server,url}=await serve(true);let name,browser;
 try{
  name=await tempProject(url);
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.addInitScript(project=>{try{localStorage.setItem('vs-last-project',project);localStorage.setItem('vs-page','director')}catch{/* sandboxed preview */}},name);
  await page.goto(url+'/');
  await page.request.post(url+'/api/terminal/login',{headers:{Origin:url,'Content-Type':'application/json'},data:{token:server.terminalAccessCode}});
  await page.reload();await page.getByText('PowerShell connected',{exact:false}).waitFor({timeout:20000});
  await page.locator('.inline-status.connected').waitFor({timeout:15000});
  await page.locator('.insert-chip').filter({hasText:/^ภาพเฟรม/}).click();
  await page.waitForFunction(p=>document.querySelector('[data-testid=powershell-screen]')?.textContent?.includes('@projects/'+p+'/output/frames/frame-00-00-00.png'),name,{timeout:30000});
  assert.ok(await stat(join(ROOT,'projects',name,'output','frames','frame-00-00-00.png')));
 }finally{await browser?.close();if(name)await rm(join(ROOT,'projects',name),{recursive:true,force:true});await stop(server);}
});
