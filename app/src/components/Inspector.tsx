import {useShallow} from 'zustand/react/shallow';
import {useEffect,useMemo,useState,useRef,lazy,Suspense} from 'react';
import {FileText,Film,FolderOpen,Image,Info,Maximize2,Minimize2,Save,Volume2,Workflow} from 'lucide-react';
import {toast} from 'sonner';
import {useStudio,type InspectorTab} from '../lib/state';
import type {Clip,FileEntry} from '../lib/api';
import {studioApi,urlFor} from '../lib/api';
import {Button,Badge,Input} from './ui';
import {formatSize,formatTime,cn} from '../lib/utils';
const MarkdownInspector=lazy(()=>import('./MarkdownInspector').then(m=>({default:m.MarkdownInspector})));
const CodeInspector=lazy(()=>import('./CodeEditor').then(module=>({default:module.CodeInspector})));

const tabs:{key:InspectorTab;label:string;icon:typeof Image}[]=[
 {key:'file',label:'File',icon:FileText},{key:'scenes',label:'Scenes',icon:Film},{key:'composition',label:'Composition',icon:Workflow},{key:'project',label:'Project',icon:Info}
];
function ImageInspector({file,src}:{file:FileEntry;src:string}){
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[src]);
 return failed?<div className="image-preview-fallback" role="status">
  <Image size={28}/><strong>Image preview unavailable</strong>
  <span>This image codec may not be supported by the installed renderer.</span>
  <a href={src+'&download=1'} download={file.name}>Download original image</a>
 </div>:<img key={src} className="inspect-image" src={src} alt={file.name} onError={()=>setFailed(true)}/>;
}
function HtmlFileInspector({file,project,category}:{file:FileEntry;project:string;category:string}){
 const [view,setView]=useState<'visual'|'code'>('visual');
 const [html,setHtml]=useState(''),[loadError,setLoadError]=useState('');
 const holder=useRef<HTMLDivElement>(null),preview=useRef<HTMLIFrameElement>(null);
 const time=useStudio(s=>s.time);
 const live=file.root==='Source'&&file.folder===''&&file.name.toLowerCase()==='index.html'&&category==='source';
 const path='/projects/'+encodeURIComponent(project)+'/source/'+(file.folder?file.folder.split('/').map(encodeURIComponent).join('/')+'/':'');
 useEffect(()=>{setHtml('');setLoadError('');setView('visual');if(live)return;
  let active=true;
  studioApi.text(project,category,file).then(data=>{if(active)setHtml(data.text)}).catch(e=>{if(active)setLoadError((e as Error).message)});
  return()=>{active=false};
 },[project,category,file.path,live]);
 useEffect(()=>{if(view!=='visual'||!live)return;
  const el=holder.current;if(!el)return;
  const fit=()=>{const bounds=el.getBoundingClientRect();
    el.style.setProperty('--html-preview-scale',String(Math.min(bounds.width/1080,bounds.height/1920)))};
  const observer=new ResizeObserver(fit);observer.observe(el);fit();
  return()=>observer.disconnect();
 },[view,live]);
 useEffect(()=>{if(view==='visual'&&live)preview.current?.contentWindow?.postMessage({
   studioParent:true,type:'SEEK',time
 },'*')},[view,live,time]);
 useEffect(()=>{if(view!=='visual'||!live)return;
  const ready=(event:MessageEvent)=>{if(event.source===preview.current?.contentWindow&&event.data?.studioPreview&&event.data?.type==='VS_READY')
    preview.current?.contentWindow?.postMessage({studioParent:true,type:'SEEK',time:useStudio.getState().time},'*')};
  window.addEventListener('message',ready);return()=>window.removeEventListener('message',ready);
 },[view,live]);
 // srcDoc is opaque-origin + script-disabled. It is never injected into React's DOM.
 const staticHtml=useMemo(()=>{
  const base=file.root==='Source'?'<base href="'+path+'">':'';
  return base+html;
 },[html,path,file.root]);
 return <div className="html-inspector" data-testid="html-file-inspector">
  <div className="html-inspector-toolbar"><div><strong>{file.name}</strong><div className="inspector-hint">{file.folder||file.root} · {formatSize(file.size)}</div></div>
   <div className="html-inspector-tabs" aria-label="HTML inspection mode">
    <Button size="sm" variant="secondary" aria-pressed={view==='visual'} onClick={()=>setView('visual')}>Visual</Button>
    <Button size="sm" variant="secondary" aria-pressed={view==='code'} onClick={()=>setView('code')}>Code</Button>
   </div></div>
  {view==='code'?<Suspense fallback={<div className="skeleton" style={{height:250}}/>}><CodeInspector key={project+category+file.path} file={file}/></Suspense>:
   <><div className="html-inspector-note">{live?'Live HTML render in an isolated frame. Shows the currently selected playhead time.':'Static HTML preview (scripts disabled). Choose Code to view or edit its source.'}</div>
   {loadError?<div className="error-state">{loadError}</div>:live?
    <div className="html-visual-viewport"><div className="html-visual-frame" ref={holder}>
     <iframe key={project+file.path} ref={preview} title={'Visual HTML preview '+file.name}
      sandbox="allow-scripts" src={'/api/studio/preview/'+encodeURIComponent(project)+'?render'}/>
    </div></div>:
    <div className="html-static-viewport">{html?<iframe title={'Static HTML preview '+file.name} sandbox="" srcDoc={staticHtml}/>:<div className="empty-state">Loading HTML…</div>}</div>}
   </>}
 </div>;
}
function FileDetails(){
 const {selected,project,category}=useStudio(useShallow(s=>({selected:s.selected,project:s.project,category:s.category})));
 if(!selected)return <div className="empty-state inspector-empty"><FolderOpen size={29}/><h3>No file selected</h3><p>Select any file on the left to see code, documentation, images, video or audio.</p></div>;
 if(selected.type==='text' && /\.html?$/i.test(selected.name))return <HtmlFileInspector key={project+category+selected.path} file={selected} project={project} category={category}/>;
 if(selected.type==='text' && selected.name.endsWith('.md'))return <MarkdownInspector file={selected} project={project} category={category}/>;
 if(selected.type==='text')return <Suspense fallback={<div className="skeleton" style={{height:260}}/>}><CodeInspector key={project+category+selected.path} file={selected}/></Suspense>;
 const src=urlFor(selected.type==='document'?'document':'media',project,category,selected);
 return <div className="resource-inspector">
   <div className="resource-title">{selected.name}</div><div className="inspector-hint">{selected.folder||selected.root} · {formatSize(selected.size)}</div>
   {selected.type==='image'?<ImageInspector file={selected} src={src}/>:
   selected.type==='audio'?<div className="audio-preview"><Volume2 size={25}/><audio controls src={src} preload="metadata" aria-label={'Audio preview '+selected.name}/></div>:
   selected.type==='video'?<video controls src={src} className="inspect-video" preload="metadata" aria-label={'Video preview '+selected.name}/>:
   selected.type==='document'?<div className="document-preview">
    {selected.name.endsWith('.pdf')&&<iframe title={selected.name} src={src} className="inspect-pdf"/>}
    <a className="ui-button button-secondary button-default download-button" href={src} download={selected.name}>Open / Download {selected.name}</a>
   </div>:
   <div className="empty-state"><Info size={23}/><p>Binary model / file metadata only.</p><small>{formatSize(selected.size)} • Stored in project directory</small></div>}
 </div>;
}
function ScenesInspector(){
 const {scenes,time}=useStudio();const set=useStudio(s=>s.set);
 return <div className="scene-inspector"><div className="inspector-heading">Scene navigation <Badge>{scenes.length} detected</Badge></div>
  <p className="inspector-note">Scenes are sampled from the live HTML runtime. Select a scene to jump directly to its start.</p>
  {scenes.map((scene,index)=><button key={scene.id+index} className={cn('scene-row',time>=scene.start&&time<scene.end&&'active')} onClick={()=>set({time:scene.start,playing:false})}>
    <span className="scene-number">{String(index+1).padStart(2,'0')}</span><span className="scene-name">{scene.label||'Scene '+(index+1)}</span><span className="scene-time">{formatTime(scene.start).slice(0,5)}</span>
   </button>)}
  {!scenes.length&&<div className="empty-state"><Film size={25}/><p>No detectable scene classes yet</p><small>Preview still works; legacy HTML may not expose named scenes.</small></div>}
 </div>;
}
function CompositionInspector(){
 const {project,composition,etag}=useStudio(useShallow(s=>({project:s.project,composition:s.composition,etag:s.etag})));const set=useStudio(s=>s.set);
 const [selectedClip,setSelectedClip]=useState(0),[dirty,setDirty]=useState(false),[saving,setSaving]=useState(false);
 const clips=composition?.clips||[];
 useEffect(()=>{setSelectedClip(0);setDirty(false)},[project,etag]);
 const changeClip=(i:number,values:Partial<Clip>)=>{
  if(!composition)return;
  const changed=structuredClone(composition);
  changed.clips[i]={...changed.clips[i],...values};
  set({composition:changed});setDirty(true);
 };
 const changeProp=(i:number,key:string,value:string)=>{
  if(!composition)return;
  const changed=structuredClone(composition);
  changed.clips[i].props={...changed.clips[i].props,[key]:value};
  set({composition:changed});setDirty(true);
 };
 const save=async()=>{
  if(!composition)return;
  setSaving(true);
  try{
   await studioApi.saveComposition(project,composition,etag);
   const result=await studioApi.composition(project);
   if(result)set({composition:result.data,etag:result.etag,previewRevision:useStudio.getState().previewRevision+1});
   setDirty(false);toast.success('Composition saved — preview updated');
  }catch(e){toast.error((e as Error).message)}finally{setSaving(false)}
 };
 if(!composition)return <div className="empty-state inspector-empty"><Workflow size={26}/><h3>Legacy HTML composition</h3><p>Scene timing is authored in HTML/JavaScript. Open Source in the Explorer and edit it with Monaco.</p></div>;
 const clip=clips[selectedClip];
 return <div className="composition-inspector"><div className="inspector-heading">Composition editor <Badge>{clips.length} clips</Badge></div>
   <div className="inspector-note">{composition.width}×{composition.height} / {composition.fps} FPS / {formatTime(composition.duration)}</div>
   <div className="clip-picker">{clips.map((x,i)=><button key={x.id} className={selectedClip===i?'active':''} onClick={()=>setSelectedClip(i)}>{x.id}</button>)}</div>
   {clip&&<div className="property-grid"><div className="property-section">TIMING & PROPERTIES</div>
    <label className="form-label">Component</label><Input readOnly value={clip.component}/>
    <div className="property-two"><label className="form-label">Start (s)<Input type="number" min={0} step={1/30} value={clip.start} onChange={e=>changeClip(selectedClip,{start:Number(e.target.value)})}/></label>
    <label className="form-label">Duration (s)<Input type="number" min={1/30} step={1/30} value={clip.duration} onChange={e=>changeClip(selectedClip,{duration:Number(e.target.value)})}/></label></div>
    <label className="form-label">Track<Input type="number" min={0} max={99} value={clip.track} onChange={e=>changeClip(selectedClip,{track:Number(e.target.value)})}/></label>
    {Object.entries(clip.props).map(([key,value])=><label className="form-label" key={key}>{key}<Input value={String(value??'')} onChange={e=>changeProp(selectedClip,key,e.target.value)}/></label>)}
   </div>}
   <div className="inspector-bottom-actions"><span>{dirty?'● Pending edits':'Changes are saved to JSON'}</span><Button size="sm" disabled={!dirty||saving} onClick={()=>void save()}><Save size={14}/> Save composition</Button></div>
 </div>;
}
function ProjectDetails(){
 const {project,duration,projects,files}=useStudio(useShallow(s=>({project:s.project,duration:s.duration,projects:s.projects,files:s.files})));const hasVideo=projects.find(p=>p.name===project)?.hasVideo;
 const [registry,setRegistry]=useState<{components:{label:string;category:string}[]} | null>(null);
 useEffect(()=>{fetch('/components/registry.json').then(r=>r.json()).then(setRegistry).catch(()=>{})},[]);
 return <div className="project-inspector"><div className="inspector-heading">{project}</div>
  <div className="inspector-note">Project status and available reusable components</div>
  {([['Canvas','1080 × 1920'],['Frame rate','30 FPS'],['Duration',formatTime(duration)],['Files in category',String(files.length)],['Rendered MP4',hasVideo?'Available':'Not rendered']] as [string,string][]).map(([name,value])=><div className="detail-row" key={name}><span>{name}</span><strong>{value}</strong></div>)}
  {hasVideo&&<a className="output-link" href={'/projects/'+encodeURIComponent(project)+'/output/'+encodeURIComponent(project)+'.mp4'} target="_blank" rel="noreferrer">Open rendered MP4 <Maximize2 size={14}/></a>}
  <div className="property-section" style={{marginTop:24}}>REUSABLE COMPONENTS</div>
  {registry?.components?.map((x,i)=><div className="detail-row" key={i}><span>{x.label}</span><Badge>{x.category}</Badge></div>)}
  <p className="inspector-note">Components are reusable for declarative compositions. Existing HTML projects can be edited in the Code Editor.</p>
 </div>;
}
export function Inspector(){
 const {inspector,workspaceMode}=useStudio(useShallow(s=>({inspector:s.inspector,workspaceMode:s.workspaceMode})));const set=useStudio(s=>s.set);
 return <aside className="inspector surface-panel" aria-label="Inspector">
  <div className="section-head inspector-toolbar"><span className="kicker">INSPECTOR</span><Button size="sm" variant="ghost" onClick={()=>set({workspaceMode:workspaceMode==='inspector'?'normal':'inspector'})} aria-label={workspaceMode==='inspector'?'Restore inspector':'Expand inspector'}>
   {workspaceMode==='inspector'?<Minimize2 size={15}/>:<Maximize2 size={15}/>} {workspaceMode==='inspector'?'Restore':'Expand'}
  </Button></div>
  <div className="inspector-tabs">{tabs.map(t=><button key={t.key} className={inspector===t.key?'active':''} onClick={()=>set({inspector:t.key})}><t.icon size={14}/><span>{t.label}</span></button>)}</div>
  <div className="inspector-scroll" key={inspector}>{inspector==='file'?<FileDetails/>:inspector==='scenes'?<ScenesInspector/>:inspector==='composition'?<CompositionInspector/>:<ProjectDetails/>}</div>
 </aside>;
}
