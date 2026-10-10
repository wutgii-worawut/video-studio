import test from 'node:test';import assert from 'node:assert/strict';import {once} from 'node:events';import {chromium} from 'playwright';import {createStudioServer} from '../studio.mjs';
test('Markdown supports Read/Edit, Terminal reopening stays at bottom, and project Trash uses shadcn confirmation',{timeout:25000},async()=>{
 const server=createStudioServer({modern:true,terminal:false});server.listen(0,'127.0.0.1');await once(server,'listening');
 const url='http://127.0.0.1:'+server.address().port;let browser;
 try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1366,height:768}});
 const native=[];page.on('dialog',d=>{native.push(d.type());d.dismiss()});
 await page.goto(url+'/');await page.getByTestId('react-studio').waitFor();
 await page.getByRole('button',{name:'Hide terminal panel'}).click();
 await page.getByRole('button',{name:'Show terminal panel'}).waitFor();
 assert.equal(await page.locator('.terminal-reopen-dock').isVisible(),true);
 await page.getByRole('button',{name:'Show terminal panel'}).click();
 await page.getByRole('button',{name:'Documents',exact:true}).click();
 await page.locator('button.file-row').filter({hasText:'.md'}).first().click();
 await page.getByTestId('markdown-inspector').waitFor();
 await page.getByRole('button',{name:'Read',exact:true}).click();
 await page.getByTestId('markdown-reading').waitFor();
 await page.getByRole('button',{name:'Edit',exact:true}).click();
 await page.getByTestId('monaco-editor').waitFor();
 await page.locator('.project-picker').click();
 await page.getByRole('menuitem',{name:'Move current project to Trash'}).click();
 await page.getByRole('alertdialog').waitFor();
 await page.getByRole('button',{name:'Move Project to Trash'}).isDisabled().then(v=>assert.equal(v,true));
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 assert.deepEqual(native,[]);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});