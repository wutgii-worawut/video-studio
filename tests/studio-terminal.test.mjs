import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {chromium} from 'playwright';
import {createStudioServer} from '../studio.mjs';

test('full local terminal is opt-in, rejects unauthenticated cross-origin access', {timeout:12000},async()=>{
 const server=createStudioServer({terminal:true});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const url='http://127.0.0.1:'+server.address().port;
 try{
  const status=await fetch(url+'/api/terminal/status');assert.equal((await status.json()).enabled,true);
  const invalid=await fetch(url+'/api/terminal/login',{method:'POST',headers:{
    Origin:url,'Content-Type':'application/json'},body:JSON.stringify({token:'bad'})});
  assert.equal(invalid.status,403);
  const wrongOrigin=await fetch(url+'/api/terminal/login',{method:'POST',headers:{
    Origin:'https://evil.invalid','Content-Type':'application/json'},body:JSON.stringify({token:server.terminalAccessCode})});
  assert.equal(wrongOrigin.status,403);
  const correct=await fetch(url+'/api/terminal/login',{method:'POST',headers:{
    Origin:url,'Content-Type':'application/json'},body:JSON.stringify({token:server.terminalAccessCode})});
  assert.equal(correct.status,200);
  const cookie=correct.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie?.startsWith('vs_terminal='));
  const authed=await fetch(url+'/api/terminal/status',{headers:{Cookie:cookie}});
  assert.equal((await authed.json()).authenticated,true);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('websocket PowerShell receives real interactive keyboard input', {timeout:25000,skip:process.platform!=='win32'},async()=>{
 const server=createStudioServer({terminal:true});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const url='http://127.0.0.1:'+server.address().port;
 let socket;
 try{
  const login=await fetch(url+'/api/terminal/login',{method:'POST',headers:{
   Origin:url,'Content-Type':'application/json'},body:JSON.stringify({token:server.terminalAccessCode})});
  const cookie=login.headers.get('set-cookie')?.split(';')[0];
  socket=new WebSocket(url.replace(/^http:/,'ws:')+'/api/terminal/ws?project=composition-demo',{
   headers:{Origin:url,Cookie:cookie}});
  const transcript=[];
  socket.on('message',raw=>{const m=JSON.parse(String(raw));if(m.type==='data')transcript.push(m.data);});
  await Promise.race([once(socket,'open'),new Promise((_,rej)=>setTimeout(()=>rej(Error('No WebSocket')),4000))]);
  // Wait for real shell prompt before sending commands to ConPTY.
  const deadline=Date.now()+14000;
  while(Date.now()<deadline&&!transcript.join('').includes('PS ')) await new Promise(res=>setTimeout(res,60));
  assert.match(transcript.join(''),/PS /);
  socket.send(JSON.stringify({type:'input',data:'Write-Output STUDIO_TERMINAL_INTERACTIVE\r'}));
  while(Date.now()<deadline&&!transcript.join('').includes('STUDIO_TERMINAL_INTERACTIVE')) await new Promise(res=>setTimeout(res,70));
  assert.match(transcript.join(''),/STUDIO_TERMINAL_INTERACTIVE/);
 }finally{
  socket?.close();
  await new Promise(resolve=>setTimeout(resolve,400));
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
 }
});


test('Chrome Terminal tab unlocks PowerShell and accepts terminal keystrokes', {timeout:30000,skip:process.platform!=='win32'},async()=>{
 const server=createStudioServer({terminal:true});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const url='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1380,height:930}});
  await page.goto(url+'/');
  await page.waitForFunction(()=>document.querySelector('.task-console')?.classList.contains('terminal-mode'));
  await page.locator('#mode-powershell').click();
  await page.locator('#terminal-login').waitFor({state:'visible'});
  await page.locator('#terminal-access-code').fill(server.terminalAccessCode);
  await page.locator('#terminal-auth-form button').click();
  await page.waitForFunction(()=>document.getElementById('terminal-message').textContent.includes('Connected'),
    null,{timeout:12000});
  await page.locator('#pty-screen').click();
  await page.keyboard.type('Write-Output BROWSER_PTY_OK');
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.getElementById('pty-screen').textContent.includes('BROWSER_PTY_OK'),
    null,{timeout:12000});
  assert.equal(await page.locator('#terminal-login').isVisible(),false);
  assert.equal(await page.locator('.task-console').evaluate(e=>e.classList.contains('terminal-mode')),true);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
