import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {_electron} from 'playwright';
const require=createRequire(import.meta.url);
const executablePath=process.env.STUDIO_ELECTRON_EXE||require('electron');
let app;
try{
 app=await _electron.launch({executablePath,args:process.env.STUDIO_ELECTRON_EXE?[]:['.'],cwd:process.cwd(),timeout:35000});
 const page=await app.firstWindow();
 await page.getByTestId('react-studio').waitFor({timeout:25000});
 await page.getByRole('navigation',{name:'Pages'}).getByRole('button',{name:'Render',exact:true}).click();
 await page.getByRole('button',{name:'Run Check layout'}).click();
 await page.waitForFunction(()=>/\[Exit |layout OK|Error:|Cannot find/.test(document.querySelector('[data-testid="task-output"]')?.textContent||''),null,{timeout:35000});
 const output=await page.getByTestId('task-output').textContent();
 console.log('PACKAGED_CHECK_OUTPUT',(output||'').slice(-1400));
 assert.match(output||'',/layout OK/i);
 console.log('PACKAGED_RENDER_ENGINE_CHECK_OK');
 if(process.env.STUDIO_ELECTRON_DRAFT==='1'){
  await page.getByRole('button',{name:'Run Draft render'}).click();
  await page.waitForFunction(()=>/\[Exit \d+\]/.test(document.querySelector('[data-testid="task-output"]')?.textContent||''),null,{timeout:120000});
  const rendered=await page.getByTestId('task-output').textContent();
  console.log('PACKAGED_DRAFT_OUTPUT',(rendered||'').slice(-2500));
  assert.match(rendered||'',/\[Exit 0\]/);
  assert.match(rendered||'',/PUBLISHED .*composition-demo\.mp4/i);
  console.log('PACKAGED_DRAFT_RENDER_OK');
 }
}catch(e){console.error('PACKAGED_RENDER_ENGINE_CHECK_FAILED',e);process.exitCode=1;}
finally{await app?.close();}
