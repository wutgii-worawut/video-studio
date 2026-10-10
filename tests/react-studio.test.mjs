import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {rm} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {createStudioServer,ROOT} from '../studio.mjs';

async function openServer(options={modern:true,terminal:true}){
 const server=createStudioServer(options);
 server.listen(0,'127.0.0.1');await once(server,'listening');
 return {server,url:'http://127.0.0.1:'+server.address().port};
}
async function close(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}

test('React desktop shell serves bundled app and isolates untrusted scene scripts', {timeout:30000},async()=>{
 const {server,url}=await openServer();let browser;
 try{
  const resp=await fetch(url+'/');
  assert.equal(resp.status,200);assert.match(await resp.text(),/app-assets/);
  assert.equal((await fetch(url+'/legacy')).status,200);
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',dialog=>{errors.push('NATIVE DIALOG: '+dialog.type());dialog.dismiss()});
  await page.goto(url+'/');
  await page.getByTestId('react-studio').waitFor({timeout:18000});
  await page.locator('.project-button').click();
  await page.getByRole('button',{name:'Open composition-demo'}).click();
  await page.waitForFunction(()=>document.querySelector('iframe[title="Project animation preview"]')?.getAttribute('src')?.includes('composition-demo'),null,{timeout:8000});
  const preview=page.locator('iframe[title="Project animation preview"]');
  assert.equal(await preview.getAttribute('sandbox'),'allow-scripts');
  await page.locator('.inline-status.connected').waitFor({timeout:12000});
  await page.getByRole('button',{name:'Play',exact:true}).waitFor({timeout:12000});
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await close(server);}
});
test('React file manager uses shadcn dialogs and recoverable project Trash', {timeout:45000},async()=>{
 const {server,url}=await openServer({modern:true,terminal:false});let browser;
 const name='react-file-'+randomUUID().slice(0,10)+'.md',filename=join(ROOT,'projects','composition-demo','docs',name);
 const copy=filename.replace(/\.md$/,'-copy.md');
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1460,height:900}});
  const dialogs=[];page.on('dialog',d=>{dialogs.push(d.type());d.dismiss()});
  await page.goto(url+'/');
  await page.locator('.project-button').click();
  await page.getByRole('button',{name:'Open composition-demo'}).click();
  await page.getByRole('navigation',{name:'Pages'}).getByRole('button',{name:'Library',exact:true}).click();
  await page.getByRole('button',{name:/^Documents/}).click();
  await page.getByRole('button',{name:'Import'}).click();
  await page.getByRole('dialog').getByLabel('Destination').selectOption('documents');
  await page.getByLabel('Choose files to import').setInputFiles({name,mimeType:'text/markdown',buffer:Buffer.from('# react workspace file')});
  await page.getByRole('button',{name:'Import 1 file(s)'}).click();
  const card=page.locator('button.media-card').filter({hasText:name});
  await card.waitFor({timeout:12000});
  await card.click();
  await page.getByRole('complementary',{name:'File details'}).getByRole('button',{name:'Duplicate'}).click();
  await page.locator('button.media-card').filter({hasText:name.replace('.md','-copy.md')}).waitFor();
  await page.getByRole('complementary',{name:'File details'}).getByRole('button',{name:'Move to Trash'}).click();
  await page.getByText('Move file to Trash?').waitFor();
  await page.getByRole('alertdialog').getByRole('button',{name:'Move to Trash'}).click();
  await page.getByRole('button',{name:/^Trash/}).click();
  await page.getByRole('button',{name:'Restore '+name}).click();
  await page.getByRole('button',{name:/^Documents/}).click();
  await page.locator('button.media-card').filter({hasText:name}).first().waitFor();
  assert.deepEqual(dialogs,[],'Use Radix dialogs, not native browser prompts');
 }finally{await browser?.close();await rm(filename,{force:true});await rm(copy,{force:true});await close(server);}
});
test('React responsive layout fits laptop, tablet and phone without horizontal overflow', {timeout:55000},async()=>{
 const {server,url}=await openServer({modern:true,terminal:false});let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  for(const [width,height] of [[1440,900],[1366,768],[920,680],[768,670],[390,844]]){
   const page=await browser.newPage({viewport:{width,height}});
   await page.goto(url+'/');
   await page.getByTestId('react-studio').waitFor({timeout:12000});
   const size=await page.evaluate(()=>({body:document.body.scrollWidth,root:document.documentElement.scrollWidth,view:innerWidth}));
   assert.ok(size.body<=width+2 && size.root<=width+2,JSON.stringify({width,size}));
   if(width<850)await page.getByRole('button',{name:'Open properties'}).click();
   if(width<850)await page.getByRole('dialog').getByRole('complementary',{name:'Properties'}).waitFor();
   await page.close();
  }
 }finally{await browser?.close();await close(server);}
});
