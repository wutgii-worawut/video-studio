import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {chromium} from 'playwright';
import {terminalLaunchArgs} from '../lib/studio-terminal.mjs';
import {createStudioServer} from '../studio.mjs';

test('session tabs may start only claude or codex inside PowerShell',()=>{
 assert.match(terminalLaunchArgs('claude').at(-1),/; claude$/);
 assert.match(terminalLaunchArgs('codex').at(-1),/; codex$/);
 for(const other of [undefined,null,'powershell','claude; rm -rf C:\\','calc'])
  assert.equal(terminalLaunchArgs(other).at(-1),terminalLaunchArgs().at(-1),String(other));
});

async function unlocked(){
 const server=createStudioServer({modern:true,terminal:true});server.listen(0,'127.0.0.1');await once(server,'listening');
 const url='http://127.0.0.1:'+server.address().port;
 const r=await fetch(url+'/api/terminal/login',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify({token:server.terminalAccessCode})});
 const cookie=r.headers.get('set-cookie').split(';')[0];
 return {server,url,cookie};
}

test('server allows six PTY sessions and refuses the seventh',{timeout:60000,skip:process.platform!=='win32'},async()=>{
 const {server,url,cookie}=await unlocked();const sockets=[];
 const connect=()=>new Promise((resolve)=>{
  const ws=new WebSocket(url.replace(/^http/,'ws')+'/api/terminal/ws?project=composition-demo&cmd=powershell',{headers:{Origin:url,Cookie:cookie}});
  ws.once('open',()=>{sockets.push(ws);resolve('open')});
  ws.once('unexpected-response',(_req,res)=>resolve(res.statusCode));
  ws.once('error',()=>resolve('error'));
 });
 try{
  for(let i=0;i<6;i++)assert.equal(await connect(),'open','session '+(i+1));
  assert.equal(await connect(),429);
 }finally{for(const ws of sockets)ws.close();await new Promise(r=>setTimeout(r,500));server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('terminal tabs: each tab is its own shell, closing one keeps the others, tab kinds are remembered',{timeout:60000},async()=>{
 const {server,url}=await unlocked();let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/');
  await page.request.post(url+'/api/terminal/login',{headers:{Origin:url,'Content-Type':'application/json'},data:{token:server.terminalAccessCode}});
  await page.reload();await page.getByText('PowerShell connected',{exact:false}).waitFor({timeout:20000});
  const screen=page.getByTestId('powershell-screen');
  await screen.click();await page.keyboard.type('echo tab-one');await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'New terminal session'}).click();
  await page.getByRole('menuitem',{name:'PowerShell'}).click();
  const tabs=page.getByRole('tablist',{name:'Terminal sessions'}).getByRole('tab');
  assert.equal(await tabs.count(),2);
  await page.waitForFunction(()=>/PS .*>/.test(document.querySelector('[data-testid=powershell-screen]')?.textContent||''),null,{timeout:15000});
  assert.doesNotMatch(await screen.textContent()||'',/tab-one/,'new tab is a fresh shell');
  await screen.click();await page.keyboard.type('echo tab-two');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('[data-testid=powershell-screen]')?.textContent?.includes('tab-two'));
  await tabs.first().click();
  // xterm pauses drawing while a tab is hidden and redraws when it is shown again.
  await page.waitForFunction(()=>document.querySelector('[data-testid=powershell-screen]')?.textContent?.includes('tab-one'),null,{timeout:5000});
  assert.doesNotMatch(await screen.textContent()||'',/tab-two/);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('vs-terminal-sessions')||'[]')),['powershell','powershell']);
  await page.getByRole('button',{name:'Close PowerShell session'}).last().click();
  assert.equal(await tabs.count(),1);
  assert.match(await screen.textContent()||'',/tab-one/,'closing another tab leaves this shell alone');
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
