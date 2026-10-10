import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {rm} from 'node:fs/promises';
import {join} from 'node:path';
import {_electron} from 'playwright';
const require=createRequire(import.meta.url);
const exe=process.env.STUDIO_ELECTRON_EXE||require('electron');
const name='test-pack-'+randomUUID().slice(0,8);
let app,workspace;
try {
 app=await _electron.launch({executablePath:exe,args:process.env.STUDIO_ELECTRON_EXE?[]:['.'],cwd:process.cwd(),timeout:30000});
 const page=await app.firstWindow();
 page.on('pageerror',e=>console.log('PAGEERROR',e.message));
 page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE_ERR',m.text());});
 await page.getByTestId('react-studio').waitFor({timeout:25000});
 workspace=await page.evaluate(()=>window.videoStudioDesktop.getWorkspace());
 await page.getByRole('button',{name:'New Project'}).click();
 await page.getByLabel('Project folder name').fill(name);
 await page.getByLabel('Video title').fill('Packaged Project');
 await page.getByLabel('Duration (seconds)').fill('3');
 await page.getByRole('button',{name:'Create Project'}).click();
 await page.locator('iframe[title="Project animation preview"]').waitFor({timeout:15000});
 await page.waitForTimeout(2200);
 console.log('NEW_PROJECT_UI_STATUS',await page.locator('.inline-status').innerText(),await page.locator('.frame-overlay').innerText().catch(()=>''));
 console.log('NEW_PROJECT_SRC',await page.locator('iframe[title="Project animation preview"]').getAttribute('src'));
 await page.locator('.inline-status.connected').waitFor({timeout:15000});
 const dimensions=await page.locator('.video-frame').evaluate(el=>{
   const frame=el.querySelector('iframe');
   const outer=el.getBoundingClientRect(),inner=frame.getBoundingClientRect();
   return {w:frame.clientWidth,h:frame.clientHeight,outer:outer.width,rendered:inner.width};
 });
 assert.equal(dimensions.w,1080);assert.equal(dimensions.h,1920);
 assert.ok(Math.abs(dimensions.outer-dimensions.rendered)<5);
 await page.getByRole('button',{name:'Render Tasks'}).click();
 await page.getByRole('button',{name:'Check',exact:true}).last().click();
 await page.waitForFunction(()=>/\[Exit \d+\]/.test(document.querySelector('[data-testid="task-output"]')?.textContent||''),null,{timeout:25000});
 const log=await page.getByTestId('task-output').textContent();
 assert.match(log||'',/layout OK/);
 console.log('PACKAGED_NEW_PROJECT_OK',name,dimensions);
}catch(e){console.error('PACKAGED_NEW_PROJECT_FAILED',e);process.exitCode=1;}
finally{
 await app?.close();
 if(workspace)await rm(join(workspace,'projects',name),{recursive:true,force:true}).catch(e=>console.error(e));
}
