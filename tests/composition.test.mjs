import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateComposition, clipsAt, timelineManifest } from '../lib/composition.mjs';
import { parseVolumeDetect } from '../lib/audio-audit.mjs';

const spec={ id:'demo',duration:6,clips:[
  {id:'intro',start:0,duration:2,component:'title-card'},
  {id:'feature',start:2,duration:2,component:'callout'},
  {id:'outro',start:4,duration:2,component:'cta'},
] };
test('declarative composition handles accurate timed clips',()=>{
  const comp=validateComposition(spec);
  assert.equal(comp.duration,6);
  assert.deepEqual(clipsAt(comp,0).map(c=>c.id),['intro']);
  assert.deepEqual(clipsAt(comp,2).map(c=>c.id),['feature']);
  assert.deepEqual(clipsAt(comp,6),[]);
  assert.equal(timelineManifest(comp).clips.length,3);
  assert.throws(()=>validateComposition({...spec,clips:[...spec.clips,spec.clips[0]]}),/Duplicate/);
  assert.throws(()=>validateComposition({...spec,duration:3}),/Duration/);
  assert.throws(()=>validateComposition({...spec,clips:[{id:'bad',start:.13,duration:2}]}),/align/);
});

test('component registry contains working reusable factories',async()=>{
  const registry=JSON.parse(await readFile(new URL('../components/registry.json',import.meta.url)));
  assert.equal(registry.version,1);
  for(const name of ['title-card','callout','cta','counter']){
    const item=registry.components.find(c=>c.id===name);
    assert.ok(item?.factory?.startsWith('VideoComponents.'),name);
  }
});
test('volumedetect parsing for A/B audit',()=>{
  const log='[Parsed_volumedetect_0] mean_volume: -18.4 dB\n[Parsed_volumedetect_0] max_volume: -1.2 dB';
  assert.deepEqual(parseVolumeDetect(log),{meanDb:-18.4,peakDb:-1.2});
  assert.throws(()=>parseVolumeDetect(''),/parse/);
});
