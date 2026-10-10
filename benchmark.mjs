// Reproducible local end-to-end render benchmark.
// node benchmark.mjs <project> [blur=1] [workers=2]
import { stat, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { runBatchJob } from './lib/batch.mjs';
import { projectName, positiveInt, probeVideo, timeline } from './lib/production.mjs';
const project=projectName(process.argv[2]);
const blur=positiveInt(process.argv[3], 'blur',1,64);
const workers=positiveInt(process.argv[4], 'workers',2,16);
const job={project,mode:'video',blur,workers};
const start=performance.now();
const outcome=await runBatchJob(job,{timeoutMs:60*60*1000});
const seconds=(performance.now()-start)/1000;
const path=join('projects',project,'output',project+'.mp4');
const report={timestamp:new Date().toISOString(),system:process.platform,project,blur,workers,
  durationSeconds:+seconds.toFixed(2),successful:outcome.ok,stdout:outcome.outputTail,
  error:outcome.error ?? null};
if(outcome.ok){
  const {stdout}=await (await import('./lib/production.mjs')).command('ffprobe',[
    '-v','error','-show_entries','stream=codec_type,width,height,avg_frame_rate,nb_frames:format=duration',
    '-of','json',path]);
  const d=JSON.parse(stdout),v=d.streams.find(s=>s.codec_type==='video');
  const a=d.streams.some(s=>s.codec_type==='audio');
  report.outputBytes=(await stat(path)).size;
  report.video=await probeVideo(path,{frames:Number(v.nb_frames),audio:a,width:v.width,height:v.height,fps:30});
  report.renderFramesPerSecond=+(report.video.frames/seconds).toFixed(2);
}
const folder=join('projects',project,'output');
await mkdir(folder,{recursive:true});
await writeFile(join(folder,'.benchmark-'+blur+'-'+workers+'.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!outcome.ok)process.exitCode=1;
