// node audio-audit.mjs <project>
// Compare existing published audio with new PCM mix; no published video is modified.
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { projectName, command } from './lib/production.mjs';
import { compareAudio } from './lib/audio-audit.mjs';
const project=projectName(process.argv[2]), dir=join('projects',project,'output');
await mkdir(dir,{recursive:true});
const original=join(dir,project+'.mp4');
await command(process.execPath,['render.mjs',project,'audio'],{timeoutMs:180000});
const report=await compareAudio(original,join(dir,'.audio-test.m4a'));
const target=join(dir,'.audio-audit.json');
await writeFile(target,JSON.stringify({project,createdAt:new Date().toISOString(),...report},null,2)+'\n');
console.log(JSON.stringify(report,null,2));
console.log('Report: '+target);
