import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { createStudioServer } from '../studio.mjs';

async function startServer() {
  const server = createStudioServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, url: 'http://127.0.0.1:' + server.address().port };
}
test('Studio HTTP serves projects but blocks private/traversal files', { timeout: 20000 }, async () => {
  const { server, url } = await startServer();
  try {
    const r = await fetch(url + '/api/projects');
    assert.equal(r.status, 200);
    const items = await r.json();
    assert.ok(items.some(x => x.name === 'skillz-promo'));
    for (const path of ['/package.json', '/projects/skillz-promo/brand/voice.mp3', '/.git/config']) {
      const response = await fetch(url + path);
      assert.equal(response.status, 403, path);
    }
    const good = await fetch(url + '/projects/skillz-promo/source/index.html?render');
    assert.equal(good.status, 200);
    assert.match(await good.text(), /<!doctype html>/i);
    const adapter = await fetch(url + '/lib/hf-adapter.js');
    assert.equal(adapter.status, 200);
  } finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
});
test('Studio iframe installs HyperFrames-compatible seek and scrubs frames', { timeout: 45000 }, async () => {
  const { server, url } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ channel:'chrome', headless:true });
    const page = await browser.newPage();
    await page.goto(url + '/');
    await page.waitForFunction(() => document.getElementById('protocol')?.textContent === '__hf ✓', null, { timeout: 15000 });
    const state = await page.evaluate(() => {
      const frame = document.getElementById('preview');
      const api = frame.contentWindow.__hf;
      api.seek(2);
      return { hasSeek: typeof api.seek === 'function', duration: api.duration, time: frame.contentWindow.VideoStudioHF.state.lastTime, scenes: frame.contentWindow.VideoStudioHF.sceneSnapshot().length };
    });
    assert.equal(state.hasSeek, true);
    assert.equal(state.duration, 15);
    assert.equal(state.time, 2);
    assert.ok(state.scenes >= 1);
    await page.evaluate(() => update(2));
    await page.locator('#next').click();
    assert.match(await page.locator('#clock').textContent(), /00:02/);
  } finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
});

test('JSON composition editor protects concurrent changes and synchronizes file-render sidecar', { timeout:20000 }, async () => {
  const {server,url}=await startServer();
  try{
    assert.equal((await fetch(url+'/api/compositions/skillz-promo')).status,404);
    const get=await fetch(url+'/api/compositions/composition-demo');
    assert.equal(get.status,200);
    const etag=get.headers.get('etag'),original=await get.json();
    assert.equal(original.duration,6);
    const headers={'Content-Type':'application/json','If-Match':etag,'Origin':url};
    const wrong=await fetch(url+'/api/compositions/composition-demo',{
      method:'PUT',headers:{...headers,'Origin':'https://evil.invalid'},body:JSON.stringify(original)});
    assert.equal(wrong.status,403);
    const edited=structuredClone(original);
    edited.clips[0].props.subtitle += ' [TEST]';
    try {
      const update=await fetch(url+'/api/compositions/composition-demo',{
        method:'PUT',headers,body:JSON.stringify(edited)});
      assert.equal(update.status,200);
      const script=await fetch(url+'/projects/composition-demo/source/composition-data.js');
      assert.equal(script.status,200);
      assert.match(await script.text(),/\[TEST\]/);
      const stale=await fetch(url+'/api/compositions/composition-demo',{
        method:'PUT',headers,body:JSON.stringify(original)});
      assert.equal(stale.status,412);
    } finally {
      const now=await fetch(url+'/api/compositions/composition-demo');
      const restored=await fetch(url+'/api/compositions/composition-demo',{
        method:'PUT',headers:{...headers,'If-Match':now.headers.get('etag')},
        body:JSON.stringify(original)});
      assert.equal(restored.status,200);
    }
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('Studio can open declarative timeline editing controls in Chrome', {timeout:30000}, async()=>{
  const {server,url}=await startServer();
  let browser;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});
    const page=await browser.newPage();
    await page.goto(url+'/');
    await page.locator('#project').selectOption('composition-demo');
    await page.waitForFunction(()=>document.getElementById('protocol')?.textContent==='__hf ✓' &&
      document.querySelector('#clip-editor')?.children.length===3,{timeout:15000});
    assert.equal(await page.locator('#clip-editor').locator('input[type=number]').count(),6);
    assert.equal(await page.locator('#save').isEnabled(),true);
    assert.match(await page.locator('#status').textContent(),/composition-demo ready/);
  }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});


test('MP4 playback endpoint supports HTTP byte ranges for scrubbing audio', { timeout: 20000 }, async () => {
  const { server, url } = await startServer();
  const file = '/projects/sword-of-coming-s2/output/sword-of-coming-s2.mp4';
  try {
    const head = await fetch(url + file, { method:'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('accept-ranges'), 'bytes');
    const size = Number(head.headers.get('content-length'));
    assert.ok(size > 10000);
    const first = await fetch(url + file, { headers: { Range:'bytes=0-31' } });
    assert.equal(first.status, 206);
    assert.equal(first.headers.get('content-range'), 'bytes 0-31/' + size);
    assert.equal((await first.arrayBuffer()).byteLength, 32);
    const last = await fetch(url + file, { headers: { Range:'bytes=-16' } });
    assert.equal(last.status, 206);
    assert.equal((await last.arrayBuffer()).byteLength, 16);
    const invalid = await fetch(url + file, { headers: { Range:'bytes=' + size + '-' } });
    assert.equal(invalid.status, 416);
  } finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
});

test('Studio Play plays MP4 audio clock, pauses, seeks, mutes and switches projects', { timeout: 45000 }, async () => {
  const { server, url } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ channel:'chrome', headless:true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url + '/');
    await page.locator('#project').selectOption('sword-of-coming-s2');
    await page.waitForFunction(() => document.getElementById('protocol')?.textContent === '__hf ✓' &&
      state.project === 'sword-of-coming-s2' && state.audioReady, null, { timeout: 20000 });
    const source = await page.locator('#soundtrack').getAttribute('src');
    assert.match(source, /sword-of-coming-s2\.mp4/);
    await page.locator('#play').click();
    await page.waitForFunction(() => document.getElementById('soundtrack').currentTime > .35,
      null, { timeout: 12000 });
    let playback = await page.evaluate(() => ({
      playing:state.playing, paused:document.getElementById('soundtrack').paused,
      audioTime:document.getElementById('soundtrack').currentTime, sceneTime:state.time,
    }));
    assert.equal(playback.playing, true);
    assert.equal(playback.paused, false);
    assert.ok(Math.abs(playback.audioTime-playback.sceneTime) < .3, JSON.stringify(playback));
    await page.locator('#play').click();
    const paused = await page.evaluate(() => ({
      paused:document.getElementById('soundtrack').paused, time:state.time,
    }));
    assert.equal(paused.paused, true);
    await page.waitForTimeout(220);
    assert.ok(Math.abs((await page.evaluate(() => state.time))-paused.time) < .07);
    await page.locator('#seek').evaluate((el) => {
      el.value='5.5';el.dispatchEvent(new Event('input',{bubbles:true}));
    });
    await page.waitForFunction(() => Math.abs(document.getElementById('soundtrack').currentTime-5.5) < .12,
      null, { timeout: 8000 });
    await page.locator('#mute').click();
    assert.equal(await page.locator('#soundtrack').evaluate(el=>el.muted), true);
    await page.locator('#mute').click();
    assert.equal(await page.locator('#soundtrack').evaluate(el=>el.muted), false);
    await page.locator('#play').click();
    await page.waitForFunction(() => document.getElementById('soundtrack').currentTime > 5.85,
      null, { timeout: 12000 });
    await page.locator('#project').selectOption('luffy-fanart-test');
    await page.waitForFunction(() => state.project === 'luffy-fanart-test' &&
      document.getElementById('protocol').textContent === '__hf ✓', null, { timeout:15000 });
    assert.equal(await page.locator('#soundtrack').evaluate(el=>el.paused), true);
    assert.equal(await page.evaluate(()=>state.audioAvailable), false);
    assert.match(await page.locator('#audio-status').textContent(),/silent preview/);
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
});
