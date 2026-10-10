import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {_electron} from 'playwright';
import {WebSocket} from 'ws';
import {once} from 'node:events';
const require=createRequire(import.meta.url);
const exe=process.env.STUDIO_ELECTRON_EXE||require('electron');
let app,ws;
try{
 app=await _electron.launch({executablePath:exe,args:process.env.STUDIO_ELECTRON_EXE?[]:['.'],cwd:process.cwd(),timeout:35000});
 const page=await app.firstWindow();
 await page.getByTestId('react-studio').waitFor({timeout:20000});
 const endpoint=new URL(page.url());
 const cookie=(await page.context().cookies()).find(c=>c.name==='vs_terminal');
 assert.ok(cookie,'Electron should have its own authenticated terminal session');
 const origin=endpoint.origin;
 ws=new WebSocket(origin.replace(/^http:/,'ws:')+'/api/terminal/ws?project=composition-demo',{
  headers:{Origin:origin,Cookie:cookie.name+'='+cookie.value}
 });
 const logs=[];ws.on('message',b=>{const m=JSON.parse(b.toString());if(m.type==='data')logs.push(m.data)});
 await once(ws,'open');
 const until=Date.now()+12000;
 while(Date.now()<until&&!logs.join('').includes('PS '))await new Promise(r=>setTimeout(r,75));
 assert.match(logs.join(''),/PS /);
 ws.send(JSON.stringify({type:'input',data:"if (Get-Module PSReadLine) { Write-Output ('PACKAGED_' + 'PSREADLINE_' + 'OK') } else { Write-Output ('PACKAGED_' + 'PSREADLINE_' + 'FAIL') }\r"}));
 while(Date.now()<until&&!logs.join('').includes('PACKAGED_PSREADLINE_OK')&&!logs.join('').includes('PACKAGED_PSREADLINE_FAIL'))await new Promise(r=>setTimeout(r,90));
 assert.match(logs.join(''),/PACKAGED_PSREADLINE_OK/);
 assert.doesNotMatch(logs.join(''),/running scripts is disabled|Cannot load PSReadline module/i);
 console.log('PACKAGED_PSREADLINE_OK');
}catch(e){console.error('PACKAGED_PSREADLINE_FAILED',e);process.exitCode=1;}
finally{ws?.close();await app?.close();}
