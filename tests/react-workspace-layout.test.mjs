import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import sharp from 'sharp';
import {createStudioServer,ROOT} from '../studio.mjs';

const name=()=>randomUUID().replaceAll('-','').slice(0,10);
const project='composition-demo';
async function serve(){
 const server=createStudioServer({modern:true,terminal:false});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 return {server,url:'http://127.0.0.1:'+server.address().port};
}
async function stop(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
async function chooseDemo(page){
 await page.goto('/');
 await page.getByTestId('react-studio').waitFor({timeout:15000});
 await page.getByRole('button',{name:/sword-of-coming-s2/}).first().click();
 await page.getByRole('menuitem',{name:/composition-demo/}).click();
 await page.getByRole('button',{name:'Switch project'}).click();
}
test('Terminal hide removes entire panel and Inspector expand preserves file browsing', {timeout:45000},async()=>{
 const {server,url}=await serve();let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.goto(url+'/');
  await page.getByTestId('react-studio').waitFor({timeout:15000});
  const height=await page.locator('.master-panels').boundingBox();
  assert.ok(height?.height);
  await page.locator('iframe[title="Project animation preview"]').waitFor();
  await page.locator('iframe[title="Project animation preview"]').evaluate(el=>el.dataset.persistence='kept');
  await page.getByRole('button',{name:'Hide terminal panel'}).click();
  await page.locator('.master-panels.terminal-hidden-workspace').waitFor();
  assert.equal(await page.locator('.studio-console').isVisible(),false,'PTY remains mounted while entire panel is hidden');
  assert.equal(await page.locator('.resize-handle.horizontal:visible').count(),1); // timeline only; terminal separator hidden
  const area=await page.locator('.master-panels.terminal-hidden-workspace').boundingBox();
  assert.ok(area.height>height.height*.90);
  await page.getByRole('button',{name:'Show terminal panel'}).click();
  await page.locator('.studio-console').waitFor({state:'visible'});
  assert.equal(await page.locator('iframe[title="Project animation preview"]').getAttribute('data-persistence'),'kept','Hide/show must not remount the Live Preview');
  await page.getByRole('button',{name:'Expand inspector'}).click();
  await page.locator('.inspector-focused').waitFor();
  await page.getByText('PROJECT EXPLORER',{exact:true}).waitFor();
  assert.equal(await page.locator('.preview-pane').count(),0);
  await page.getByRole('button',{name:'Source',exact:true}).click();
  await page.locator('button.file-row').filter({hasText:'index.html'}).first().click();
  await page.getByTestId('html-file-inspector').waitFor();
  await page.getByRole('button',{name:'Code',exact:true}).last().click();
  await page.getByTestId('monaco-editor').waitFor();
  await page.getByRole('button',{name:'Restore inspector'}).click();
  await page.locator('.preview-pane').waitFor();
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await stop(server);}
});
test('Inspector supports HTML visual/code and switching images without restoring Preview', {timeout:35000},async()=>{
 const {server,url}=await serve();let browser;
 const filename='inspector-'+name(),folder=join(ROOT,'projects',project,'source','img');
 await mkdir(folder,{recursive:true});
 const png=await sharp({create:{width:16,height:32,channels:4,background:{r:22,g:80,b:140,alpha:1}}}).png().toBuffer();
 await writeFile(join(folder,filename+'.png'),png);
 await writeFile(join(folder,filename+'.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="36" height="20"><rect width="36" height="20" fill="#ecf"/></svg>');
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1366,height:768}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/');
  await page.getByTestId('react-studio').waitFor();
  await page.getByRole('button',{name:/sword-of-coming-s2/}).first().click();
  await page.getByRole('menuitem',{name:/composition-demo/}).click();
  await page.getByRole('button',{name:'Switch project'}).click();
  await page.getByRole('button',{name:'Expand inspector'}).click();
  await page.getByRole('button',{name:'Assets',exact:true}).click();
  await page.locator('button.file-row').filter({hasText:filename+'.png'}).click();
  const image=page.locator('.inspect-image');
  await image.waitFor();
  await page.waitForFunction(()=>{const img=document.querySelector('.inspect-image');return img?.complete&&img.naturalWidth>0});
  await page.locator('button.file-row').filter({hasText:filename+'.svg'}).click();
  await page.waitForFunction(()=>{const img=document.querySelector('.inspect-image');return img?.complete&&img.naturalWidth>0});
  assert.equal(await page.locator('.inspector-focused .explorer').isVisible(),true);
  await page.getByRole('button',{name:'Source',exact:true}).click();
  await page.locator('button.file-row').filter({hasText:'index.html'}).first().click();
  const iframe=page.locator('iframe[title="Visual HTML preview index.html"]');
  await iframe.waitFor();
  assert.equal(await iframe.getAttribute('sandbox'),'allow-scripts');
  await page.getByRole('button',{name:'Code',exact:true}).last().click();
  await page.getByTestId('monaco-editor').waitFor();
  assert.deepEqual(errors,[]);
 }finally{
  await browser?.close();
  for(const ext of ['.png','.svg'])await rm(join(folder,filename+ext),{force:true});
  await stop(server);
 }
});
test('Extra image extensions are classified and TIFF is converted for browser preview', {timeout:15000},async()=>{
 const {server,url}=await serve();const tag='formats-'+name(),dir=join(ROOT,'projects',project,'source','img');
 await mkdir(dir,{recursive:true});
 const buffer=await sharp({create:{width:16,height:12,channels:3,background:'#83ade2'}}).png().toBuffer();
 const samples={
  '.avif':await sharp(buffer).avif().toBuffer(),
  '.tiff':await sharp(buffer).tiff().toBuffer(),
  '.apng':buffer,
  '.bmp':Buffer.alloc(54+16*12*3),
  '.svg':Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="12"><rect width="16" height="12" fill="red"/></svg>'),
 };
 samples['.bmp'].write('BM',0);samples['.bmp'].writeUInt32LE(samples['.bmp'].length,2);samples['.bmp'].writeUInt32LE(54,10);samples['.bmp'].writeUInt32LE(40,14);samples['.bmp'].writeInt32LE(16,18);samples['.bmp'].writeInt32LE(12,22);samples['.bmp'].writeUInt16LE(1,26);samples['.bmp'].writeUInt16LE(24,28);
 try{
  for(const [ext,data] of Object.entries(samples))await writeFile(join(dir,tag+ext),data);
  const entryResponse=await fetch(url+'/api/studio/entries?project='+project+'&group=assets');
  const listed=(await entryResponse.json()).entries;
  for(const ext of Object.keys(samples)){
    const file=listed.find(x=>x.name===tag+ext);
    assert.equal(file?.type,'image',ext);
    const response=await fetch(url+'/api/studio/media?'+new URLSearchParams({project,group:'assets',path:file.path}));
    assert.equal(response.status,200,ext+': '+await response.text().catch(()=>'')); // note: response consumed after status, okay
    assert.equal(response.headers.get('content-type'),ext==='.tiff'?'image/png':ext==='.bmp'?'image/bmp':ext==='.svg'?'image/svg+xml':ext==='.apng'?'image/apng':'image/avif');
    if(ext==='.svg')assert.match(response.headers.get('content-security-policy')||'',/script-src 'none'/);
    if(ext==='.tiff'){
      const original=await fetch(url+'/api/studio/media?'+new URLSearchParams({project,group:'assets',path:file.path,download:'1'}));
      assert.equal(original.status,200);
      assert.equal(original.headers.get('content-type'),'image/tiff');
      assert.match(original.headers.get('content-disposition')||'',/attachment/);
      assert.deepEqual(Buffer.from(await original.arrayBuffer()),samples[ext]);
    }

  }
  const malicious=await fetch(url+'/api/studio/files/upload?'+new URLSearchParams({project,location:'assets',name:tag+'-bad.svg'}),{
   method:'POST',headers:{Origin:url,'Content-Type':'application/octet-stream'},
   body:'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'});
  assert.notEqual(malicious.status,201);
 }finally{
  for(const ext of Object.keys(samples))await rm(join(dir,tag+ext),{force:true});
  await stop(server);
 }
});

test('Phone Inspector focus keeps Explorer selectable without overlaying it', {timeout:22000},async()=>{
 const {server,url}=await serve();let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(url+'/');
  await page.getByTestId('react-studio').waitFor();
  await page.getByRole('button',{name:'Open Inspector'}).click();
  await page.getByRole('button',{name:'Expand inspector'}).click();
  await page.locator('.compact-inspector-workspace').waitFor();
  assert.equal(await page.locator('.compact-inspector-explorer').isVisible(),true);
  assert.equal(await page.locator('.compact-inspector-details').isVisible(),true);
  await page.locator('.compact-inspector-explorer').getByRole('button',{name:'Source',exact:true}).click();
  await page.locator('.compact-inspector-explorer button.file-row').filter({hasText:'index.html'}).first().click();
  await page.getByTestId('html-file-inspector').waitFor();
  const width=await page.evaluate(()=>document.documentElement.scrollWidth);
  assert.ok(width<=390+2,width);
 }finally{await browser?.close();await stop(server);}
});
