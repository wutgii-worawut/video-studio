import test from 'node:test';import assert from 'node:assert/strict';import {once} from 'node:events';import {chromium} from 'playwright';import {createStudioServer,ROOT} from '../studio.mjs';import {readFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
test('Rail pages, Render menu task hand-off and Ctrl+K respect focused inputs',{timeout:40000},async()=>{
 const server=createStudioServer({modern:true,terminal:false});server.listen(0,'127.0.0.1');await once(server,'listening');
 const url='http://127.0.0.1:'+server.address().port;let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1366,height:768}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/');await page.getByTestId('react-studio').waitFor();
  await page.locator('iframe[title="Project animation preview"]').waitFor();
  await page.getByRole('navigation',{name:'Pages'}).getByRole('button',{name:'Library',exact:true}).click();
  assert.equal(await page.getByRole('navigation',{name:'Pages'}).getByRole('button',{name:'Library',exact:true}).getAttribute('aria-current'),'page');
  assert.equal(await page.locator('.preview-pane').count(),0);
  // Ctrl+K typed inside a field must stay in the field.
  await page.getByLabel('Search files').focus();
  await page.keyboard.press('Control+k');
  assert.equal(await page.getByRole('heading',{name:'Projects'}).count(),0);
  await page.getByRole('button',{name:'More render tasks'}).click();
  await page.getByRole('menuitem',{name:/Probe/}).click();
  await page.waitForFunction(()=>/\[Exit \d+\]/.test(document.querySelector('[data-testid="task-output"]')?.textContent||''),null,{timeout:25000});
  assert.equal(await page.getByRole('navigation',{name:'Pages'}).getByRole('button',{name:'Render',exact:true}).getAttribute('aria-current'),'page');
  // The terminal panel is shared by every page and only hosts the PTY.
  assert.equal(await page.locator('.studio-console').count(),1);
  await page.getByRole('navigation',{name:'Pages'}).getByRole('button',{name:'Director',exact:true}).click();
  await page.locator('.preview-pane').waitFor();
  assert.match(await page.getByTestId('task-output').textContent()||'',/\[Exit \d+\]/,'task log survives page switches');
  await page.locator('body').click({position:{x:5,y:5}});
  await page.keyboard.press('Control+k');
  await page.getByRole('heading',{name:'Projects'}).waitFor();
  assert.equal(await page.locator('.app-rail').count(),0);
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('One PowerShell session survives Director layout and page switches',{timeout:60000},async()=>{
 const server=createStudioServer({modern:true,terminal:true});server.listen(0,'127.0.0.1');await once(server,'listening');
 const url='http://127.0.0.1:'+server.address().port;let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});
  let sockets=0;page.on('websocket',()=>sockets++);
  await page.goto(url+'/');
  const login=await page.request.post(url+'/api/terminal/login',{headers:{Origin:url,'Content-Type':'application/json'},data:{token:server.terminalAccessCode}});
  assert.equal(login.status(),200);
  await page.reload();await page.getByText('PowerShell connected',{exact:false}).waitFor({timeout:20000});
  const screen=page.getByTestId('powershell-screen'),has=text=>page.waitForFunction(t=>document.querySelector('[data-testid=powershell-screen]')?.textContent?.includes(t),text,{timeout:15000});
  await screen.click();await page.keyboard.type('echo first-$((1+1))');await page.keyboard.press('Enter');await has('first-2');
  const rail=name=>page.getByRole('navigation',{name:'Pages'}).getByRole('button',{name,exact:true});
  await page.getByRole('radio',{name:'Preview-first'}).click();
  await page.getByRole('button',{name:'Expand preview'}).click();
  await page.getByRole('button',{name:'Restore workspace'}).click();
  await rail('Library').click();await rail('Director').click();
  await page.getByRole('radio',{name:'Terminal-first'}).click();
  // xterm only renders visible rows; scroll up so earlier scrollback is drawn before checking it survived.
  await screen.hover();await page.mouse.wheel(0,-20000);
  await has('first-2');
  await screen.click();await page.keyboard.type('echo second-$((2+2))');await page.keyboard.press('Enter');await has('second-4');
  assert.equal(sockets,1,'layout changes must not reconnect the PTY');
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('Projects API reports MP4 and source times so Director can flag stale sound',async()=>{
 const server=createStudioServer({modern:true,terminal:false});server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const list=await (await fetch('http://127.0.0.1:'+server.address().port+'/api/projects')).json();
  for(const p of list){
   assert.equal(typeof p.sourceUpdatedAt,'number',p.name);
   assert.equal(p.hasVideo,typeof p.videoUpdatedAt==='number',p.name);
  }
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('Unsaved Code tabs block a silent project switch and Ctrl+S saves to disk',{timeout:60000},async()=>{
 const server=createStudioServer({modern:true,terminal:false});server.listen(0,'127.0.0.1');await once(server,'listening');
 const url='http://127.0.0.1:'+server.address().port,name='test-tabs-'+randomUUID().slice(0,8),folder=join(ROOT,'projects',name);let browser;
 try{
  const created=await fetch(url+'/api/projects',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify({name,title:'Tabs',duration:3,template:'blank'})});
  assert.equal(created.status,201);
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(project=>{try{localStorage.setItem('vs-last-project',project)}catch{/* sandboxed preview iframes */}},name);
  await page.goto(url+'/');await page.getByTestId('react-studio').waitFor();
  const rail=label=>page.getByRole('navigation',{name:'Pages'}).getByRole('button',{name:label,exact:true});
  await rail('Code').click();
  await page.locator('button.tree-row').filter({hasText:'index.html'}).first().click();
  await page.locator('.monaco-editor .view-lines').first().click();
  await page.keyboard.press('Control+End');await page.keyboard.type('<!-- tab-test -->');
  await page.getByRole('button',{name:'1 unsaved file'}).waitFor();
  await page.locator('.project-button').click();
  await page.getByRole('button',{name:'Open composition-demo'}).click();
  await page.getByRole('alert').filter({hasText:'unsaved changes'}).waitFor();
  await page.getByRole('button',{name:'Stay here'}).click();
  await page.getByRole('button',{name:/^Back to /}).click();
  await page.locator('.monaco-editor .view-lines').first().click();
  await page.keyboard.press('Control+s');
  await page.getByRole('button',{name:'1 unsaved file'}).waitFor({state:'detached'});
  assert.match(await readFile(join(folder,'source','index.html'),'utf8'),/<!-- tab-test -->/);
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await rm(folder,{recursive:true,force:true});server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('Insert bar types context into the PowerShell line without pressing Enter; Clear line empties it',{timeout:60000},async()=>{
 const server=createStudioServer({modern:true,terminal:true});server.listen(0,'127.0.0.1');await once(server,'listening');
 const url='http://127.0.0.1:'+server.address().port;let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/');
  await page.request.post(url+'/api/terminal/login',{headers:{Origin:url,'Content-Type':'application/json'},data:{token:server.terminalAccessCode}});
  await page.reload();await page.getByText('PowerShell connected',{exact:false}).waitFor({timeout:20000});
  const project=await page.evaluate(()=>localStorage.getItem('vs-last-project'));
  const screen=page.getByTestId('powershell-screen');
  const lastLine=()=>page.evaluate(()=>{const rows=[...document.querySelectorAll('[data-testid=powershell-screen] .xterm-rows > div')].map(r=>r.textContent.trimEnd()).filter(Boolean);return rows.at(-1)||''});
  await page.waitForFunction(()=>/PS .*>/.test(document.querySelector('[data-testid=powershell-screen]')?.textContent||''),null,{timeout:15000});
  await page.locator('.insert-chip').filter({hasText:'@source/index.html'}).click();
  await page.locator('.insert-chip').filter({hasText:/^เวลา/}).click();
  await page.waitForFunction(p=>document.querySelector('[data-testid=powershell-screen]')?.textContent?.includes('@projects/'+p+'/source/index.html ที่ 00:00.00'),project,{timeout:8000});
  assert.match(await lastLine(),/^PS .*>\s*@projects\/.*index\.html ที่ 00:00\.00\s*$/,'text sits on the prompt line, not executed');
  await page.getByRole('button',{name:/Clear line/}).click();
  await page.waitForFunction(()=>{const rows=[...document.querySelectorAll('[data-testid=powershell-screen] .xterm-rows > div')].map(r=>r.textContent.trimEnd()).filter(Boolean);return /^PS .*>$/.test(rows.at(-1)||'')},null,{timeout:8000});
  assert.doesNotMatch(await screen.textContent()||'',/is not recognized/,'nothing was executed');
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
