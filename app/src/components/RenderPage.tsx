import {useCallback,useEffect,useRef,useState} from 'react';
import {useShallow} from 'zustand/react/shallow';
import {Play,Square} from 'lucide-react';
import {toast} from 'sonner';
import {useStudio} from '../lib/state';
import {studioApi,urlFor,type FileEntry,type Task} from '../lib/api';
import {RENDER_ACTIONS,taskName,typedCommand,renderLabel} from '../lib/tasks';
import {cn,formatSize,formatTime} from '../lib/utils';
import {Button,Input,Dialog,DialogContent,DialogTitle,DialogDescription} from './ui';

const clock=(iso:string)=>new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
const elapsed=(from:string,to?:string|null)=>formatTime(((to?Date.parse(to):Date.now())-Date.parse(from))/1000).slice(0,5);
type Job=Task&{startedAt?:string;finishedAt?:string|null};

function OutputColumn({revision}:{revision:string}){
 const {project,set}=useStudio(useShallow(s=>({project:s.project,set:s.set})));
 const [files,setFiles]=useState<FileEntry[]>([]),[meta,setMeta]=useState(''),[still,setStill]=useState<FileEntry|null>(null);
 useEffect(()=>{if(!project)return;let live=true;
  studioApi.entries(project,'output').then(r=>{if(live)setFiles(r.entries)}).catch(()=>{});
  return ()=>{live=false};},[project,revision]);
 const mp4=files.find(f=>f.folder===''&&f.name===project+'.mp4');
 const stills=files.filter(f=>f.folder==='stills'&&f.type==='image');
 const srt=files.find(f=>f.name.endsWith('.srt'));
 const meta4=useStudio(s=>s.projects.find(p=>p.name===project));
 const src=(f:FileEntry)=>urlFor('media',project,'output',f);
 return <aside className="render-output" aria-label="Output">
  <h2>Output</h2>
  {mp4?<div className="mp4-card">
   <div className="mp4-thumb"><video src={src(mp4)+'#t=0.1'} preload="metadata" muted playsInline onLoadedMetadata={e=>{const v=e.currentTarget;setMeta(formatTime(v.duration).slice(0,5)+' · '+formatSize(mp4.size)+' · '+v.videoWidth+'×'+v.videoHeight)}}/></div>
   <div className="mp4-info"><strong className="mono">{mp4.name}</strong><span className="side-note">{meta||formatSize(mp4.size)}</span>
    {meta4?.videoUpdatedAt&&<span className="side-note">rendered {new Date(meta4.videoUpdatedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>}
    <a className="side-link" href={src(mp4)} target="_blank" rel="noreferrer">Open MP4</a></div>
  </div>:<p className="side-note">No MP4 yet. Run a draft render.</p>}
  <h3>Stills</h3>
  {stills.length?<div className="stills-grid">{stills.map(f=><button key={f.path} onClick={()=>setStill(f)} aria-label={'Open still '+f.name}><img src={src(f)} alt="" loading="lazy"/></button>)}</div>:<p className="side-note">No stills yet. Run Stills.</p>}
  {srt&&<button className="side-link" onClick={()=>{set({libraryLocation:'output'});useStudio.getState().go('library')}}>{srt.name} → Library</button>}
  <Dialog open={still!==null} onOpenChange={o=>{if(!o)setStill(null)}}><DialogContent className="still-dialog">
   <DialogTitle className="dialog-title">{still?.name}</DialogTitle><DialogDescription className="visually-hidden">Still frame</DialogDescription>
   {still&&<img src={src(still)} alt={still.name}/>}
  </DialogContent></Dialog>
 </aside>;
}

// Stays mounted (hidden) on other pages so a running task keeps polling and its log survives navigation.
export function RenderPage(){
 const {project,queued,set,go,status}=useStudio(useShallow(s=>({project:s.project,queued:s.queuedTask,set:s.set,go:s.go,status:s.renderStatus})));
 const [job,setJob]=useState<Job|null>(null),[command,setCommand]=useState(''),[typed,setTyped]=useState('');
 const [output,setOutput]=useState('Run a task on the left. Commands are allow-listed; use the Terminal for anything else.');
 const [running,setRunning]=useState(false),[revision,setRevision]=useState(0),[,tick]=useState(0);
 const scroller=useRef<HTMLPreElement>(null);
 useEffect(()=>{let cancel=false;
  fetch('/api/studio/task').then(r=>r.json()).then(({active})=>{if(!cancel&&active?.status==='running'){setJob(active);setTyped(typedCommand(active.command,active.project));setRunning(true)}}).catch(()=>{});
  return ()=>{cancel=true}},[]);
 useEffect(()=>{
  if(!job?.id||!running)return;
  const poll=async()=>{
   try{
    const task:Job=await (await fetch('/api/studio/task?id='+encodeURIComponent(job.id))).json();
    setOutput(task.output||'');setJob(task);tick(x=>x+1);set({lastTaskLog:task.output||''});
    if(task.status!=='running'){
     setRunning(false);setRevision(r=>r+1);
     studioApi.projects().then(projects=>set({projects})).catch(()=>{}); // MP4 state/time for the top bar and Director
     if(task.status==='complete')toast.success('Task complete: '+task.command);else toast.error('Task failed: '+task.command);
    }
   }catch(e){setRunning(false);toast.error((e as Error).message)}
  };
  const t=setInterval(()=>void poll(),550);void poll();return ()=>clearInterval(t);
 },[job?.id,running,set]);
 const run=useCallback(async(value:string)=>{
  const v=value.trim();if(!v||useStudio.getState().taskRunning)return;
  try{
   const data=await studioApi.json<Job&{builtin?:string}>('/api/studio/task',{project,command:v});
   if(data.builtin){setOutput(data.output||'');setJob(null);return;}
   setJob(data);setTyped(v);setOutput(data.output||'> '+v);setRunning(data.status==='running');setCommand('');
  }catch(e){toast.error((e as Error).message)}
 },[project]);
 const cancel=async()=>{if(job?.id)await studioApi.json('/api/studio/task/cancel',{id:job.id});};
 useEffect(()=>{set({taskRunning:running})},[running,set]);
 // The top bar Render menu queues a command here so log, Stop and errors stay in one place.
 useEffect(()=>{if(!queued)return;set({queuedTask:''});void run(queued);},[queued,run,set]);
 useEffect(()=>{if(scroller.current)scroller.current.scrollTop=scroller.current.scrollHeight},[output]);
 const progress=running?[...output.matchAll(/frame (\d+(?:\.\d+)?)\/(\d+)/g)].at(-1):null;
 const percent=progress?Math.min(100,Number(progress[1])/Number(progress[2])*100):null;
 const name=job?taskName(typed):'';
 // A render.mjs run this page didn't start (e.g. Claude in the terminal), seen through output/.render-status.json.
 const external=!running&&status.state==='running';
 const extPercent=status.frames?.total?status.frames.done/status.frames.total*100:null;
 return <div className="render-layout">
  <section className="render-run" aria-label="Run">
   <h2>Run</h2>
   {RENDER_ACTIONS.map(a=><div key={a.command} className={cn('task-card',running&&typed===a.command&&'running')}>
    <div><strong>{a.name}</strong><span className="side-note">{a.page}</span><code>{a.command}</code></div>
    <Button size="sm" variant="secondary" disabled={running||!project} aria-label={'Run '+a.name} onClick={()=>void run(a.command)}>Run</Button>
   </div>)}
   <form className="other-command" onSubmit={e=>{e.preventDefault();void run(command)}}>
    <label className="form-label" htmlFor="other-command">Other command</label>
    <div className="inline-form"><Input id="other-command" className="mono" value={command} onChange={e=>setCommand(e.target.value)} placeholder="voice · audio · status · recovery · benchmark 1 2" aria-label="Task console command"/>
     <Button size="sm" type="submit" disabled={running||!command.trim()}>Run <Play size={13}/></Button></div>
    <small className="side-note">Allow-listed commands only · type help to list them. One task at a time.</small>
   </form>
  </section>
  <section className="render-current" aria-label="Current task">
   {external&&<><div className="task-status" data-testid="external-render">
    <span className="task-dot running"/>
    <div className="task-title"><strong>{renderLabel(status)} — started outside Studio</strong>
     <span className="side-note mono">render.mjs {project} {status.mode} {(status.args||[]).join(' ')}{status.startedAt?' · '+elapsed(status.startedAt)+' elapsed':''}</span></div>
    <span className="side-note">Log and Stop are in the terminal that started it.</span>
   </div>
   <div className={cn('progress',extPercent===null&&'indeterminate')}><span style={extPercent===null?undefined:{width:extPercent+'%'}}/></div></>}
   {job?<div className="task-status">
    <span className={cn('task-dot',job.status)}/>
    <div className="task-title"><strong>{name}{job.status==='complete'?' — complete':job.status==='failed'?' — failed':''}</strong>
     <span className="side-note mono">{job.status==='running'?typed+' · '+(job.startedAt?elapsed(job.startedAt):'')+' elapsed':job.finishedAt?'finished '+clock(job.finishedAt)+(job.status==='complete'?' · output updated':''):''}</span></div>
    {running&&<Button variant="destructive" size="sm" onClick={()=>void cancel()}><Square size={12}/> Stop</Button>}
    {job.status==='complete'&&<button className="side-link" onClick={()=>go('director')}>Back to Director to listen →</button>}
   </div>:<div className="task-status"><span className="task-dot"/><strong>No task yet</strong></div>}
   {running&&<div className={cn('progress',percent===null&&'indeterminate')}><span style={percent===null?undefined:{width:percent+'%'}}/></div>}
   <pre ref={scroller} className="task-output" data-testid="task-output">{output}</pre>
  </section>
  <OutputColumn revision={revision+':'+(status.state==='running'?'running':status.updatedAt||'')}/>
 </div>;
}
