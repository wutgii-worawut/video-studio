// Local Studio task console. Commands are allowlisted and spawned WITHOUT a shell.
// This is deliberately not an arbitrary remote-code-execution / PowerShell endpoint.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const APP_ROOT=fileURLToPath(new URL('../',import.meta.url));
import { projectName, positiveInt } from './production.mjs';

const MAX_LOG = 100_000;
const MAX_HISTORY = 20;
const DEFAULT_TIMEOUT = 90*60*1000;

function tokens(s) {
  if(typeof s!=='string'||s.length>180)throw new Error('Command must be <= 180 characters');
  if(/[&|;<>\r\n\x60$"'\\]/.test(s))throw new Error('Shell operators, quotes and redirects are not supported');
  return s.trim().split(/\s+/).filter(Boolean);
}
export function parseStudioCommand(project,input) {
  projectName(project);
  const tok=tokens(input);
  if(!tok.length)throw new Error('Enter a command. Type help for available commands');
  const cmd=tok[0].toLowerCase(),rest=tok.slice(1);
  const render=(mode,remaining) => {
    const usage='render [blur [workers]] | check | stills | voice | audio';
    if(mode==='video'){
      if(remaining.length>2)throw new Error(usage);
      const blur=positiveInt(remaining[0],'blur',8,64);
      const workers=positiveInt(remaining[1],'workers',2,16);
      return {label:'render '+project+' '+blur+' '+workers,executable:process.execPath,
        args:['render.mjs',project,'video',String(blur),String(workers)],timeoutMs:DEFAULT_TIMEOUT};
    }
    if(remaining.length)throw new Error('Unexpected arguments for '+mode);
    return {label:mode+' '+project,executable:process.execPath,args:['render.mjs',project,mode],timeoutMs:mode==='stills'?300_000:DEFAULT_TIMEOUT};
  };
  if(cmd==='help'&&!rest.length)return {builtin:'help',label:'help'};
  if(cmd==='clear'&&!rest.length)return {builtin:'clear',label:'clear'};
  if(cmd==='check'||cmd==='stills'||cmd==='voice'||cmd==='audio')return render(cmd,rest);
  if(cmd==='render')return render('video',rest);
  if(cmd==='test'&&!rest.length)return {label:'npm test',executable:process.execPath,
    args:['--test','--test-concurrency=1','tests/audio.test.mjs','tests/composition.test.mjs','tests/production.test.mjs','tests/studio.test.mjs','tests/studio-workbench.test.mjs','tests/studio-task-render.test.mjs','tests/workflow.test.mjs'],timeoutMs:300_000};
  if(cmd==='status'&&!rest.length)return {label:'git status --short',executable:'git',args:['status','--short'],timeoutMs:15_000};
  if(cmd==='recovery'&&!rest.length)return {label:'recovery '+project,executable:process.execPath,args:['recovery.mjs',project],timeoutMs:20_000};
  if(cmd==='benchmark'&&rest.length<=2){
    const blur=positiveInt(rest[0],'blur',1,64),workers=positiveInt(rest[1],'workers',2,16);
    return {label:'benchmark '+project,executable:process.execPath,args:['benchmark.mjs',project,String(blur),String(workers)],timeoutMs:DEFAULT_TIMEOUT};
  }
  if(cmd==='probe'&&!rest.length)return {label:'probe '+project,executable:'ffprobe',
    args:['-v','error','-show_entries','stream=codec_name,codec_type,avg_frame_rate,width,height,nb_frames:format=duration,size',
      '-of','json',join('projects',project,'output',project+'.mp4')],timeoutMs:20_000};
  throw new Error('Command not supported. Type help for available commands. Arbitrary shell execution is disabled for safety.');
}
export const HELP = [
  'Video Studio • Project Task Console',
  'help                  show this list',
  'check                 check text bounds/overlaps',
  'stills                export preview stills',
  'render [blur] [workers]   export MP4 (default blur 8, workers 2)',
  'voice                 generate lip-sync voice.js',
  'audio                 create temporary audio mix',
  'probe                 inspect last MP4 with ffprobe',
  'test                  run automated tests',
  'status                show git status --short',
  'recovery              inspect interrupted render stages',
  'benchmark [blur] [workers]   run timed render',
  'clear                 clear the console output',
  'The console runs known project commands only. It cannot execute arbitrary PowerShell.',
].join('\n');

export function createStudioTasks(root) {
  const jobs=new Map();
  let activeId=null;
  function details(job) {
    return {id:job.id,project:job.project,command:job.command,status:job.status,
      output:job.output,startedAt:job.startedAt,finishedAt:job.finishedAt??null,
      code:job.code??null};
  }
  function launch(project, raw) {
    const parsed=parseStudioCommand(project,raw);
    if(parsed.builtin==='help')return {builtin:'help',output:HELP};
    if(parsed.builtin==='clear')return {builtin:'clear',output:''};
    if(activeId&&jobs.get(activeId)?.status==='running')
      throw new Error('A task is already running. Wait for it to finish before starting another.');
    const job={id:randomUUID(),project,command:parsed.label,
      status:'running',startedAt:new Date().toISOString(),output:'> '+parsed.label+'\n'};
    jobs.set(job.id,job);activeId=job.id;
    while(jobs.size>MAX_HISTORY)jobs.delete(jobs.keys().next().value);
    const append=(value)=>{
      job.output=(job.output+String(value).replace(/\r(?!\n)/g,'\n')).slice(-MAX_LOG);
    };
    let child;
    const args=[...parsed.args];
    if(process.env.VIDEO_STUDIO_ROOT&&process.versions.electron && args[0]?.endsWith('.mjs'))args[0]=join(root,args[0]);
    try{child=spawn(parsed.executable,args,{
      cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],shell:false,
      env:{...process.env,NO_COLOR:'1',...(process.versions.electron?{ELECTRON_RUN_AS_NODE:'1'}:{})}
    });}catch(error){
      job.status='failed';job.finishedAt=new Date().toISOString();append(error.message);activeId=null;
      return details(job);
    }
    job.pid=child.pid;
    job.child=child;
    child.stdout.on('data',b=>append(b.toString()));
    child.stderr.on('data',b=>append(b.toString()));
    const timeout=setTimeout(()=>{
      append('\n[Task exceeded time limit]\n');
      if(process.platform==='win32'){
        const killer=spawn('taskkill',['/T','/F','/PID',String(child.pid)],{windowsHide:true,stdio:'ignore'});
        killer.on('error',()=>child.kill());
      }else child.kill('SIGTERM');
    },parsed.timeoutMs);
    let settled=false;
    function done(code,error){
      if(settled)return;
      settled=true;clearTimeout(timeout);
      job.code=code;
      job.status=code===0?'complete':'failed';
      job.finishedAt=new Date().toISOString();
      if(error)append('\n'+error+'\n');
      append('\n[Exit '+String(code)+']\n');
      delete job.child;
      if(activeId===job.id)activeId=null;
    }
    child.once('error',error=>done(null,error.message));
    child.once('close',code=>done(code));
    return details(job);
  }
  return {
    launch, current:()=>activeId?details(jobs.get(activeId)):null,
    get:(id)=>{const j=jobs.get(id);return j?details(j):null},
    list:()=>[...jobs.values()].map(details).reverse(),
    stop:(id)=>{
      const j=jobs.get(id);
      if(!j||j.status!=='running'||!j.child)return false;
      j.output+='\n[Cancellation requested]\n';
      if(process.platform==='win32'){
        const killer=spawn('taskkill',['/T','/F','/PID',String(j.pid)],{windowsHide:true,stdio:'ignore'});
        killer.on('error',()=>j.child?.kill());
      } else j.child.kill('SIGTERM');
      return true;
    }
  };
}
