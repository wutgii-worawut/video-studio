import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium,_electron} from 'playwright';
const require=createRequire(import.meta.url);
const executablePath=process.env.STUDIO_ELECTRON_EXE||require('electron');
let app;
try{
 app=await _electron.launch({executablePath,args:process.env.STUDIO_ELECTRON_EXE?[]:['.'],cwd:process.cwd(),timeout:30000});
 const win=await app.firstWindow({timeout:20000});
 await win.getByTestId('react-studio').waitFor({timeout:15000});
 console.log('ELECTRON_APP_LOADED',await win.title());
 console.log('URL',win.url());
 await win.getByText('TERMINAL',{exact:true}).waitFor();
 const desktop=await win.evaluate(()=>({
  platform:window.videoStudioDesktop?.platform,
  hasNode:typeof window.require!=='undefined',
  hasDesktop:typeof window.videoStudioDesktop?.getWorkspace==='function',
 }));
 assert.equal(desktop.platform,'win32');assert.equal(desktop.hasNode,false);
 assert.equal(desktop.hasDesktop,true);
 console.log('DESKTOP_BRIDGE',desktop);
 await win.getByText('PowerShell connected',{exact:false}).waitFor({timeout:15000});
 console.log('TERMINAL_UNLOCKED_AUTOMATICALLY');
 console.log('ELECTRON_SMOKE_OK');
}catch(e){console.error('ELECTRON_SMOKE_FAILED',e);process.exitCode=1}
finally{await app?.close()}
