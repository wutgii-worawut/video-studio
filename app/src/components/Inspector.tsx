import {useShallow} from 'zustand/react/shallow';
import {useEffect,useState} from 'react';
import {Maximize2,Save,Workflow} from 'lucide-react';
import {toast} from 'sonner';
import {useStudio} from '../lib/state';
import type {Clip} from '../lib/api';
import {studioApi} from '../lib/api';
import {Button,Badge,Input} from './ui';
import {formatTime} from '../lib/utils';
// Director → Properties panels: Composition clip editor and project details.
export function CompositionInspector(){
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
 if(!composition)return <div className="empty-state inspector-empty"><Workflow size={26}/><h3>Legacy HTML composition</h3><p>Scene timing is authored in HTML/JavaScript. Edit source/index.html on the Code page.</p></div>;
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
export function ProjectDetails(){
 const {project,duration,projects}=useStudio(useShallow(s=>({project:s.project,duration:s.duration,projects:s.projects})));const hasVideo=projects.find(p=>p.name===project)?.hasVideo;
 const [registry,setRegistry]=useState<{components:{label:string;category:string}[]} | null>(null);
 useEffect(()=>{fetch('/components/registry.json').then(r=>r.json()).then(setRegistry).catch(()=>{})},[]);
 return <div className="project-inspector"><div className="inspector-heading">{project}</div>
  <div className="inspector-note">Project status and available reusable components</div>
  {([['Canvas','1080 × 1920'],['Frame rate','30 FPS'],['Duration',formatTime(duration)],['Rendered MP4',hasVideo?'Available':'Not rendered']] as [string,string][]).map(([name,value])=><div className="detail-row" key={name}><span>{name}</span><strong>{value}</strong></div>)}
  {hasVideo&&<a className="output-link" href={'/projects/'+encodeURIComponent(project)+'/output/'+encodeURIComponent(project)+'.mp4'} target="_blank" rel="noreferrer">Open rendered MP4 <Maximize2 size={14}/></a>}
  <div className="property-section" style={{marginTop:24}}>REUSABLE COMPONENTS</div>
  {registry?.components?.map((x,i)=><div className="detail-row" key={i}><span>{x.label}</span><Badge>{x.category}</Badge></div>)}
  <p className="inspector-note">Components are reusable for declarative compositions. Existing HTML projects can be edited in the Code Editor.</p>
 </div>;
}
