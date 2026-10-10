// Packaged Windows Electron smoke test for complete Terminal panel, Inspector, and TIFF.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {_electron} from 'playwright';
import sharp from 'sharp';
const require=createRequire(import.meta.url);
const executablePath=process.env.STUDIO_ELECTRON_EXE||require('electron');
let app,file;
try{
 app=await _electron.launch({executablePath,args:process.env.STUDIO_ELECTRON_EXE?[]:['.'],cwd:process.cwd(),timeout:35000});
 const page=await app.firstWindow();const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.getByTestId('react-studio').waitFor({timeout:25000});
 const workspace=await page.evaluate(()=>window.videoStudioDesktop.getWorkspace());
 const folder=join(workspace,'projects','composition-demo','source','img');
 await mkdir(folder,{recursive:true});
 const name='inspector-pack-'+randomUUID().slice(0,8)+'.tiff';
 file=join(folder,name);
 const image=await sharp({create:{width:36,height:22,channels:3,background:'#ff9900'}}).tiff().toBuffer();
 await writeFile(file,image);
 const projectButton=page.getByRole('button',{name:/sword-of-coming-s2|composition-demo|skillz-promo/}).first();
 if(!(await projectButton.innerText()).includes('composition-demo')){
  await projectButton.click();
  await page.getByRole('button',{name:'Open composition-demo'}).click();
 }
 await page.getByRole('navigation',{name:'Pages'}).getByRole('button',{name:'Library',exact:true}).click();
 await page.getByRole('button',{name:'Hide terminal panel'}).click();
 await page.locator('.master-panels.terminal-hidden-workspace').waitFor();
 assert.equal(await page.locator('.studio-console').isVisible(),false);
 await page.getByRole('button',{name:'Show terminal panel'}).click();
 await page.locator('.studio-console').waitFor({state:'visible'});
 await page.getByRole('button',{name:/^Source images/}).click();
 await page.locator('button.media-card').filter({hasText:name}).click();
 await page.waitForFunction(()=>{const img=document.querySelector('.library-detail img');return img?.complete&&img.naturalWidth===36;},null,{timeout:15000});
 console.log('PACKAGED_IMAGE_PREVIEW_OK',name);
 await page.getByRole('navigation',{name:'Pages'}).getByRole('button',{name:'Code',exact:true}).click();
 await page.locator('button.tree-row').filter({hasText:'index.html'}).first().click();
 await page.getByTestId('monaco-editor').waitFor({timeout:15000});
 await page.locator('.monaco-editor').first().waitFor({timeout:15000});
 await page.waitForTimeout(600);
 assert.deepEqual(errors,[],'selective Monaco bundle should not throw in packaged Electron');
 console.log('PACKAGED_LAYOUT_HTML_MONACO_OK');
}catch(e){console.error('PACKAGED_LAYOUT_FAILED',e);process.exitCode=1;}
finally{await app?.close();if(file)await rm(file,{force:true}).catch(()=>{});}
