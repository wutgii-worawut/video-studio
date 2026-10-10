import {useEffect,useRef,useState} from 'react';
import {useShallow} from 'zustand/react/shallow';
import {toast} from 'sonner';
import {useStudio,useSceneItems} from '../lib/state';
import {studioApi} from '../lib/api';
import {cn,formatTime} from '../lib/utils';
import {Button} from './ui';
import {Preview,Timeline} from './Preview';
import {CompositionInspector,ProjectDetails} from './Inspector';
import {TerminalSlot} from './Console';
import {relPath,extColor} from '../lib/paths';

const clock=(ms:number)=>new Date(ms).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
const short=(t:number)=>formatTime(t).slice(0,5);

export function SceneList(){
 const scenes=useSceneItems(),time=useStudio(s=>s.time),set=useStudio(s=>s.set);
 return <nav className="scene-list" aria-label="Scenes"><div className="scene-list-head">Scenes</div>
  {scenes.map((scene,i)=><button key={scene.id+i} className={cn('scene-row',time>=scene.start&&time<scene.end&&'active')} onClick={()=>set({time:scene.start,playing:false})}>
   <span className="scene-number">{String(i+1).padStart(2,'0')}</span><span className="scene-name">{scene.label||'Scene '+(i+1)}</span><span className="scene-time">{short(scene.start)}</span>
  </button>)}
  {!scenes.length&&<p className="scene-empty">No named scenes yet. The preview still plays.</p>}
 </nav>;
}

export function MiniTimeline(){
 const {time,duration,project,projects}=useStudio(useShallow(s=>({time:s.time,duration:s.duration,project:s.project,projects:s.projects})));
 const scenes=useSceneItems(),set=useStudio(s=>s.set),ref=useRef<HTMLDivElement>(null);
 const hasVideo=projects.find(p=>p.name===project)?.hasVideo;
 const seek=(x:number)=>{const r=ref.current?.getBoundingClientRect();if(r)set({time:Math.max(0,Math.min(duration,(x-r.left)/r.width*duration)),playing:false});};
 return <div className="mini-timeline" ref={ref} role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={time} tabIndex={-1} onClick={e=>seek(e.clientX)}>
  <div className="mini-scenes">{scenes.map((s,i)=><span key={s.id+i} className={cn(time>=s.start&&time<s.end&&'active')} style={{left:s.start/duration*100+'%',width:Math.max(.3,s.end-s.start)/duration*100+'%'}} title={s.label}/>)}</div>
  <div className={cn('mini-sound',hasVideo&&'ready')}/>
  <div className="mini-playhead" style={{left:Math.min(100,time/duration*100)+'%'}}/>
 </div>;
}

// Sound in the preview comes from the last rendered MP4, so say when it is missing or older than the source.
export function SoundNotice(){
 const {project,projects,taskRunning,set}=useStudio(useShallow(s=>({project:s.project,projects:s.projects,taskRunning:s.taskRunning,set:s.set})));
 const meta=projects.find(p=>p.name===project);
 const stale=Boolean(meta?.hasVideo&&meta.videoUpdatedAt&&meta.sourceUpdatedAt&&meta.sourceUpdatedAt>meta.videoUpdatedAt);
 if(!meta||(meta.hasVideo&&!stale))return null;
 const render=()=>{set({queuedTask:'render 1 2'});useStudio.getState().go('render');};
 return <div className="sound-notice" role="status">
  <p>{stale?<>Sound is from the MP4 rendered at {clock(meta.videoUpdatedAt!)} — older than the last change.</>:'ยังไม่มีเสียง — render draft เพื่อฟัง'}</p>
  <Button size="sm" disabled={taskRunning} onClick={render}>{stale?'Draft render to resync':'Draft render'}</Button>
 </div>;
}

// Spec 4.1 "Changed this session": files Claude (or anything) changed; click to open the text ones in Code.
const GROUP:Record<string,string>={source:'source',brand:'brand',docs:'documents'};
function ChangedFiles(){
 const changes=useStudio(s=>s.changes),[,tick]=useState(0);
 useEffect(()=>{const t=setInterval(()=>tick(x=>x+1),5000);return ()=>clearInterval(t)},[]);
 if(!changes.length)return null;
 const open=async(path:string)=>{
  const st=useStudio.getState(),group=GROUP[path.split('/')[0]];
  try{
   const file=(await studioApi.entries(st.project,group)).entries.find(f=>relPath(f)===path);
   if(!file)throw Error(path+' no longer exists');
   if(file.type!=='text'){st.go('library');return;}
   await st.openFile(group,file);st.go('code');
  }catch(e){toast.error((e as Error).message)}
 };
 const ago=(at:number)=>{const s=Math.round((Date.now()-at)/1000);return s<60?s+' s ago':Math.round(s/60)+' min ago'};
 return <section className="changed-files" aria-label="Changed this session"><h3>Changed this session</h3>
  {changes.map(c=><button key={c.path} className="changed-row" onClick={()=>void open(c.path)}><span className="ext-dot" style={{background:extColor(c.path)}}/><span className="mono truncate">{c.path}</span><small>{ago(c.at)}</small></button>)}
 </section>;
}
export function Properties(){
 const {project,composition,time}=useStudio(useShallow(s=>({project:s.project,composition:s.composition,time:s.time})));
 const scenes=useSceneItems();
 const index=scenes.findIndex(s=>time>=s.start&&time<s.end),scene=scenes[index];
 const openIndex=async()=>{
  try{
   const {entries}=await studioApi.entries(project,'source');
   const file=entries.find(f=>f.folder===''&&f.name==='index.html');
   if(!file)throw Error('source/index.html not found');
   void useStudio.getState().openFile('source',file);
   useStudio.getState().go('code');
  }catch(e){toast.error((e as Error).message)}
 };
 return <aside className="properties" aria-label="Properties">
  {scene?<div className="scene-heading"><span className="kicker">Scene {String(index+1).padStart(2,'0')}</span><h2>{scene.label}</h2><span className="mono">{formatTime(scene.start).slice(0,8)} – {formatTime(scene.end).slice(0,8)}</span></div>:
   <div className="scene-heading"><span className="kicker">Playhead</span><h2>{formatTime(time).slice(0,8)}</h2></div>}
  <SoundNotice/>
  {composition?<div className="properties-composition"><span className="kicker">COMPOSITION CLIP</span><CompositionInspector/></div>:
   <div className="legacy-note"><p>Timing lives in your HTML — Ask Claude in the terminal, or edit <code>source/index.html</code> yourself.</p>
    <Button size="sm" variant="outline" onClick={()=>void openIndex()}>Open index.html in Code</Button></div>}
  <details className="properties-project"><summary>Project details</summary><ProjectDetails/></details>
 </aside>;
}

export function DirectorPage({mode,compact}:{mode:'terminal'|'preview';compact:boolean}){
 const focused=useStudio(s=>s.workspaceMode==='preview'),set=useStudio(s=>s.set);
 const toggleFocus=()=>set({workspaceMode:focused?'normal':'preview'});
 if(mode==='terminal'&&!compact)return <div className="director terminal-first">
  <TerminalSlot className="director-terminal"/>
  <aside className="director-side" aria-label="Preview">
   <Preview className="preview-side" aside={<SceneList/>}/>
   <MiniTimeline/>
   <SoundNotice/>
   <ChangedFiles/>
  </aside>
 </div>;
 if(focused||compact)return <div className="director preview-first focused"><Preview onFocus={compact?undefined:toggleFocus} focused={focused}/>{compact&&<Timeline/>}</div>;
 return <div className="director preview-first">
  <div className="director-row"><SceneList/><Preview onFocus={toggleFocus}/><Properties/></div>
  <Timeline/>
 </div>;
}
