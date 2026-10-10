// Single-job runner suitable for AWS Batch or Google Cloud Run Jobs.
// VS_PROJECT is required, optional VS_UPLOAD_URL is a pre-signed HTTPS PUT URL.
// No direct cloud credentials are stored in this repository.
import { createReadStream } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectName, positiveInt } from '../lib/production.mjs';
import { runBatchJob } from '../lib/batch.mjs';

export function jobFromEnvironment(env) {
  const project=projectName(env.VS_PROJECT);
  const blur=positiveInt(env.VS_BLUR,'VS_BLUR',8,64);
  const workers=positiveInt(env.VS_WORKERS,'VS_WORKERS',2,16);
  const upload=env.VS_UPLOAD_URL || null;
  if(upload){
    const url=new URL(upload);
    if(url.protocol!=='https:')throw new Error('VS_UPLOAD_URL requires a pre-signed HTTPS endpoint');
  }
  return { project,mode:'video',blur,workers,upload };
}

export async function runCloudJob(env=process.env) {
  const cfg=jobFromEnvironment(env);
  const result=await runBatchJob(cfg,{ timeoutMs:3*60*60*1000 });
  if(!result.ok)throw new Error('Cloud render failed: '+(result.error||result.exitCode));
  const video=join('projects',cfg.project,'output',cfg.project+'.mp4');
  const info=await stat(video);
  if(info.size<1024)throw new Error('Cloud render output is empty');
  let uploaded=false;
  if(cfg.upload){
    const response=await fetch(cfg.upload,{method:'PUT',headers:{
      'Content-Type': env.VS_UPLOAD_CONTENT_TYPE || 'video/mp4',
      'Content-Length': String(info.size),
    },body:createReadStream(video),duplex:'half',signal:AbortSignal.timeout(5*60*1000)});
    if(!response.ok)throw new Error('Signed upload failed: HTTP '+response.status);
    uploaded=true;
  }
  return {ok:true,project:cfg.project,bytes:info.size,uploaded};
}
if(process.argv[1] && process.argv[1].replace(/\\/g,'/').endsWith('/cloud/job.mjs')){
  try {console.log(JSON.stringify(await runCloudJob(),null,2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
