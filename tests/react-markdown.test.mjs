import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {createStudioServer,ROOT} from '../studio.mjs';

// 1×1 PNG
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');

test('Markdown viewer: Source/Split/Preview, outline, front matter, callouts, links, images and Library preview',{timeout:90000},async()=>{
 const id=randomUUID().slice(0,8),project='composition-demo',base=join(ROOT,'projects',project);
 const doc='md-view-'+id+'.md',other='md-other-'+id+'.md',image='md-img-'+id+'.png';
 const files=[join(base,'docs',doc),join(base,'docs',other),join(base,'brand',image)];
 await writeFile(files[0],['---','title: secret-fm','tags: a, b','---','# ภาษาไทย หัวข้อ','intro','## ภาษาไทย หัวข้อ','> [!WARNING]','> careful now','',
  '<blockquote class="evil">raw html</blockquote>','','[other](./'+other+'#deep-part) [bad](javascript:alert(1)) [web](https://example.com) [jump](#last-heading)','',
  '![logo](../brand/'+image+')','','![missing](img/nope.png)','',...Array.from({length:60},(_,i)=>'filler line '+i+'\n'),'### Last heading','end'].join('\n'));
 await writeFile(files[1],'# Other doc\n\n'+Array.from({length:80},(_,i)=>'para '+i+'\n').join('\n')+'\n## Deep part\n\nbottom\n');
 await writeFile(files[2],PNG);
 const server=createStudioServer({modern:true,terminal:false});server.listen(0,'127.0.0.1');await once(server,'listening');
 const url='http://127.0.0.1:'+server.address().port;let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const problems=[];page.on('dialog',d=>{problems.push('dialog '+d.type());void d.dismiss()});page.on('pageerror',e=>problems.push(e.message));
  await page.goto(url+'/');
  await page.locator('.project-button').click();
  await page.getByRole('button',{name:'Open '+project}).click();
  await page.getByRole('navigation',{name:'Pages'}).getByRole('button',{name:'Code',exact:true}).click();
  await page.locator('button.tree-row').filter({hasText:doc}).click();
  const reading=page.getByTestId('markdown-reading'),modes=page.getByRole('radiogroup',{name:'Markdown view'});
  // Split is the default: Monaco and the rendered pane side by side.
  await reading.waitFor();await page.getByTestId('monaco-editor').waitFor();
  assert.equal(await modes.getByRole('radio',{name:'Split'}).getAttribute('aria-checked'),'true');
  // A2 unique Thai ids, A3 front matter hidden, A4 callout + raw HTML dropped.
  assert.deepEqual(await reading.locator('h1,h2,h3').evaluateAll(hs=>hs.map(h=>h.id)),['user-content-ภาษาไทย-หัวข้อ','user-content-ภาษาไทย-หัวข้อ-1','user-content-last-heading']);
  assert.doesNotMatch(await reading.innerText(),/secret-fm/);
  await page.getByRole('button',{name:'Front matter (2)'}).click();
  await page.locator('.md-front th',{hasText:'title'}).waitFor();
  assert.equal(await reading.locator('blockquote.callout.callout-warning').count(),1);
  assert.doesNotMatch(await reading.locator('blockquote.callout').innerText(),/\[!WARNING\]/);
  assert.equal(await page.locator('.evil').count(),0);
  // A6 brand image loads through the media API; docs/img explains why it can't show.
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-testid=markdown-reading] img')].some(i=>i.naturalWidth>0));
  await reading.getByRole('note').filter({hasText:'outside source/ and brand/'}).waitFor();
  // A5 links: https opens a new window, javascript: is inert, .md opens a Code tab.
  assert.equal(await reading.getByRole('link',{name:'web'}).getAttribute('target'),'_blank');
  const before=page.url();
  await reading.getByRole('link',{name:'bad'}).click({force:true});
  assert.equal(page.url(),before);
  // A1 unsaved edit survives mode switches; Ctrl+S still saves from Split.
  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.press('Control+End');await page.keyboard.type('\nunsaved marker zz');
  for(let i=0;i<3;i++)for(const mode of ['Source','Preview','Split']){
   await modes.getByRole('radio',{name:mode}).click();
   if(mode==='Source')assert.equal(await reading.count(),0);
   if(mode==='Preview'){assert.equal(await page.getByTestId('monaco-editor').count(),0);await reading.getByText('unsaved marker zz').waitFor();}
  }
  await page.getByTestId('monaco-editor').waitFor();await reading.getByText('unsaved marker zz').waitFor();
  await page.locator('.monaco-editor .view-lines').click();await page.keyboard.press('Control+S');
  await page.waitForFunction(()=>!document.querySelector('.code-tab.active .unsaved-dot'));
  assert.match(await readFile(files[0],'utf8'),/unsaved marker zz/);
  // Ctrl+Shift+V toggles Preview ↔ previous mode, also from inside Monaco.
  await page.keyboard.press('Control+Shift+V');
  assert.equal(await modes.getByRole('radio',{name:'Preview'}).getAttribute('aria-checked'),'true');
  await page.locator('.md-preview-page').click({position:{x:2,y:2}});await page.keyboard.press('Control+Shift+V');
  assert.equal(await modes.getByRole('radio',{name:'Split'}).getAttribute('aria-checked'),'true');
  // A2 outline in Preview: click scrolls the heading into the reading area and highlights it.
  await modes.getByRole('radio',{name:'Preview'}).click();
  const outline=page.getByRole('navigation',{name:'Outline'});
  await outline.getByRole('button',{name:'Last heading'}).click();
  await page.waitForFunction(()=>{const h=document.getElementById('user-content-last-heading'),s=document.querySelector('.md-preview-scroll');
   if(!h||!s)return false;const a=h.getBoundingClientRect(),b=s.getBoundingClientRect();return a.top>=b.top-1&&a.top<b.bottom;});
  await outline.locator('.outline-row.active',{hasText:'Last heading'}).waitFor();
  await reading.getByRole('link',{name:'jump'}).click();
  // Ctrl+F (no native find bar in Electron): counts matches, Enter steps, Escape closes.
  await page.locator('.md-preview-page').click({position:{x:2,y:2}});await page.keyboard.press('Control+F');
  const find=page.getByRole('search');await find.getByLabel('Find in rendered Markdown').fill('filler line 5');
  await find.getByText('1/11').waitFor();
  assert.equal(await page.evaluate(()=>CSS.highlights.get('md-find')?.size),11);
  await page.keyboard.press('Enter');await find.getByText('2/11').waitFor();
  await page.keyboard.press('Escape');assert.equal(await find.count(),0);
  assert.equal(await page.evaluate(()=>CSS.highlights.has('md-find')),false);
  // Narrow window keeps the outline next to the text.
  await page.setViewportSize({width:1000,height:800});
  assert.equal(await outline.isVisible(),true);
  assert.ok((await outline.boundingBox()).x>(await reading.boundingBox()).x+(await reading.boundingBox()).width-1,'outline sits beside the text');
  await page.setViewportSize({width:1440,height:900});
  // other.md#deep-part opens the tab and scrolls to that heading.
  await reading.getByRole('link',{name:'other'}).click();
  await page.getByRole('tab').filter({hasText:other}).waitFor();
  await page.waitForFunction(()=>{const h=document.getElementById('user-content-deep-part'),s=document.querySelector('.md-preview-scroll');
   if(!h||!s||s.scrollTop<50)return false;const a=h.getBoundingClientRect(),b=s.getBoundingClientRect();return a.top>=b.top-1&&a.top<b.bottom;});
  // Mode is remembered after reload.
  await page.reload();await page.getByRole('navigation',{name:'Pages'}).getByRole('button',{name:'Code',exact:true}).click();
  await page.locator('button.tree-row').filter({hasText:doc}).click();
  await reading.waitFor();assert.equal(await page.getByTestId('monaco-editor').count(),0);
  // A8 Library renders the .md and opens it in Code Preview.
  await modes.getByRole('radio',{name:'Source'}).click();
  await page.getByRole('navigation',{name:'Pages'}).getByRole('button',{name:'Library',exact:true}).click();
  await page.getByRole('button',{name:/^Documents/}).click();
  await page.locator('.media-card',{hasText:doc}).click();
  await page.locator('.detail-markdown [data-testid=markdown-reading] h1').waitFor();
  await page.getByRole('button',{name:'Open in Code'}).click();
  await page.locator('.md-preview-scroll [data-testid=markdown-reading]').waitFor();
  assert.equal(await modes.getByRole('radio',{name:'Preview'}).getAttribute('aria-checked'),'true');
  assert.deepEqual(problems,[]);
 }finally{
  await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  await Promise.all(files.map(f=>rm(f,{force:true})));
 }
});

test('Markdown viewer part B: highlighted code, offline KaTeX math and optional line breaks',{timeout:60000},async()=>{
 const doc='md-b-'+randomUUID().slice(0,8)+'.md',file=join(ROOT,'projects','composition-demo','docs',doc);
 await writeFile(file,['# Part B','```js','const answer = 42; // comment','```','','Inline $E=mc^2$ math.','','$$','\int_0^1 x\,dx','$$','',
  'Bad $\href{javascript:alert(1)}{x}$ link','','first line','second line'].join('\n'));
 const server=createStudioServer({modern:true,terminal:false});server.listen(0,'127.0.0.1');await once(server,'listening');
 const url='http://127.0.0.1:'+server.address().port;let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  // Offline: anything not served by the local Studio is refused.
  const remote=[];await context.route('**/*',route=>{const u=route.request().url();if(u.startsWith(url))return route.continue();remote.push(u);return route.abort();});
  const page=await context.newPage();
  const problems=[];page.on('dialog',d=>{problems.push('dialog '+d.type());void d.dismiss()});page.on('pageerror',e=>problems.push(e.message));
  await page.goto(url+'/');
  await page.locator('.project-button').click();
  await page.getByRole('button',{name:'Open composition-demo'}).click();
  await page.getByRole('navigation',{name:'Pages'}).getByRole('button',{name:'Code',exact:true}).click();
  await page.locator('button.tree-row').filter({hasText:doc}).click();
  const reading=page.getByTestId('markdown-reading');await reading.waitFor();
  await reading.locator('pre code.hljs .hljs-keyword',{hasText:'const'}).waitFor();
  assert.equal(await reading.locator('pre code .hljs-comment').count(),1);
  await reading.locator('.katex').first().waitFor();
  assert.equal(await reading.locator('.katex-display').count(),1);
  assert.equal(await reading.locator('a[href^="javascript"]').count(),0);
  // KaTeX fonts come from the app bundle, not a CDN.
  await page.waitForFunction(async()=>{await document.fonts.ready;return [...document.fonts].some(f=>f.family.replace(/"/g,'')==='KaTeX_Main'&&f.status==='loaded');},null,{timeout:10000});
  // Line breaks: off by default (standard Markdown), on → <br>, remembered after reload.
  const breaks=()=>reading.locator('p',{hasText:'first line'}).locator('br').count();
  assert.equal(await breaks(),0);
  await page.getByRole('button',{name:'Line breaks'}).click();
  assert.equal(await page.getByRole('button',{name:'Line breaks'}).getAttribute('aria-pressed'),'true');
  await page.waitForFunction(()=>document.querySelector('[data-testid=markdown-reading] p br'));
  assert.equal(await breaks(),1);
  await page.reload();await page.getByRole('navigation',{name:'Pages'}).getByRole('button',{name:'Code',exact:true}).click();
  await page.locator('button.tree-row').filter({hasText:doc}).click();
  await reading.locator('p br').first().waitFor({state:'attached'});
  // The project's own preview iframe may ask for its web fonts; nothing for KaTeX/highlight may leave the machine.
  assert.deepEqual(problems,[]);assert.deepEqual(remote.filter(u=>/katex|highlight|hljs/i.test(u)),[]);
 }finally{
  await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  await rm(file,{force:true});
 }
});
