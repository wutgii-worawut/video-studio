import {useShallow} from 'zustand/react/shallow';
import {useEffect,useRef,useState} from 'react';
import {MoreHorizontal,Plus,RotateCcw,Search,Trash2,RefreshCw} from 'lucide-react';
import {toast} from 'sonner';
import {useStudio,isDirty} from '../lib/state';
import {studioApi} from '../lib/api';
import {cn} from '../lib/utils';
import {Button,Input,DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem,AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogCancel,DialogFooter} from './ui';

// "sword-of-coming-s2" → "S2", "composition-demo" → "CD"
export const initials=(name:string)=>{const parts=name.split('-').filter(Boolean);const last=parts[parts.length-1]||'';return (last.length<=2&&parts.length>1?last:parts.slice(0,2).map(p=>p[0]).join('')).toUpperCase()||'?';};
const HUES=['#F0A23A','#6EA8FE','#8FD6AE','#C9B9F5','#F07A6A','#E8C66A'];
const hue=(name:string)=>HUES[[...name].reduce((a,c)=>a+c.charCodeAt(0),0)%HUES.length];
export function ProjectBadge({name}:{name:string}){return <span className="project-badge" style={{background:hue(name)}}>{initials(name)}</span>}

export function ProjectsPage({onOpen,onResetLayout,pending,onStay,onDiscard,onSave}:{onOpen:(name:string)=>void;onResetLayout:()=>void;pending:string|null;onStay:()=>void;onDiscard:()=>void;onSave:()=>void}){
 const dirty=useStudio(useShallow(s=>s.tabs.filter(isDirty).map(t=>t.file.name)));
 const projects=useStudio(s=>s.projects),project=useStudio(s=>s.project),set=useStudio(s=>s.set),switchProject=useStudio(s=>s.switchProject);
 const [query,setQuery]=useState('');
 const nameInput=useRef<HTMLInputElement>(null);
 const [newName,setNewName]=useState(''),[newTitle,setNewTitle]=useState(''),[newDuration,setNewDuration]=useState(12),
   [newTemplate,setNewTemplate]=useState<'blank'|'starter'>('blank'),[newCreating,setNewCreating]=useState(false);
 const [deleteTarget,setDeleteTarget]=useState<string|null>(null),[deleteConfirm,setDeleteConfirm]=useState(''),[deleting,setDeleting]=useState(false);
 const [deletedProjects,setDeletedProjects]=useState<{id:string;name:string;deletedAt:string}[]>([]);
 const [workspacePath,setWorkspacePath]=useState(''),[changingWorkspace,setChangingWorkspace]=useState(false);
 const refreshTrash=async()=>{try{const res=await fetch('/api/studio/projects/trash');if(!res.ok)throw Error('Failed to load project Trash');setDeletedProjects((await res.json()).items)}catch(e){toast.error((e as Error).message)}};
 useEffect(()=>{void refreshTrash();window.videoStudioDesktop?.getWorkspace().then(setWorkspacePath).catch(()=>{});},[]);
 const createProject=async()=>{
  if(newCreating)return;
  setNewCreating(true);
  try{
   const result=await studioApi.json<{name:string;hasVideo:boolean}>('/api/projects',{
     name:newName.trim(),title:newTitle.trim()||newName.trim(),duration:newDuration,template:newTemplate});
   set({projects:[...useStudio.getState().projects,result].sort((a,b)=>a.name.localeCompare(b.name))});
   switchProject(result.name);set({page:'director'});
   setNewName('');setNewTitle('');setNewDuration(12);
   toast.success('Created '+result.name+' — edit your first clip in Composition');
  }catch(e){toast.error('Cannot create project: '+(e as Error).message)}
  finally{setNewCreating(false)}
 };
 const archiveProject=async()=>{
  if(!deleteTarget||deleteConfirm!==deleteTarget||deleting)return;
  setDeleting(true);
  try{
   await studioApi.json('/api/studio/projects/trash',{project:deleteTarget,confirm:deleteConfirm});
   const next=await studioApi.projects();
   set({projects:next});
   if(deleteTarget===project)switchProject(next[0]?.name||'');
   toast.success('Project moved to Trash — it can be restored');
   setDeleteTarget(null);setDeleteConfirm('');await refreshTrash();
  }catch(e){toast.error((e as Error).message)}
  finally{setDeleting(false)}
 };
 const recoverProject=async(id:string)=>{
  try{
   const result=await studioApi.json<{name:string}>('/api/studio/projects/restore',{id});
   set({projects:await studioApi.projects()});
   await refreshTrash();toast.success('Restored project '+result.name);
  }catch(e){toast.error((e as Error).message)}
 };
 const changeWorkspace=async()=>{if(!window.videoStudioDesktop?.setWorkspace)return;setChangingWorkspace(true);try{await window.videoStudioDesktop.setWorkspace(workspacePath)}catch(e){toast.error((e as Error).message);setChangingWorkspace(false)}};
 const shown=projects.filter(p=>p.name.includes(query.trim().toLowerCase()));
 return <div className="projects-page">
  <section className="projects-main" aria-label="Projects">
   {pending&&<div className="switch-banner" role="alert"><p>Switching to <strong>{pending}</strong> closes the preview and current files. <strong>{dirty.join(', ')}</strong> in {project} has unsaved changes.</p>
    <div className="inline-form"><Button size="sm" variant="outline" onClick={onStay}>Stay here</Button><Button size="sm" variant="destructive" onClick={onDiscard}>Discard & switch</Button><Button size="sm" onClick={onSave}>Save & switch</Button></div></div>}
   <div className="projects-head"><h1>Projects</h1>
    <div className="projects-search"><Search size={15}/><Input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search projects (Ctrl K)" aria-label="Search projects"/></div></div>
   <div className="projects-grid">
    <button className="project-card new" onClick={()=>nameInput.current?.focus()}><Plus size={22}/><span>New project</span></button>
    {shown.map(p=><div key={p.name} className={cn('project-card',p.name===project&&'current')}>
     <div className="project-card-top"><ProjectBadge name={p.name}/>
      <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={'Actions for project '+p.name}><MoreHorizontal size={16}/></Button></DropdownMenuTrigger>
       <DropdownMenuContent><DropdownMenuItem className="text-danger" onSelect={()=>{setDeleteConfirm('');setDeleteTarget(p.name)}}><Trash2 size={14}/> Move to Trash</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
     <strong className="project-card-name">{p.name}</strong>
     <span className={cn('project-card-state',p.hasVideo&&'ready')}>{p.hasVideo?'● MP4 rendered':'○ Not rendered yet'}</span>
     {p.name===project?<span className="project-card-open">Open now</span>:<Button size="sm" variant="secondary" aria-label={'Open '+p.name} onClick={()=>onOpen(p.name)}>Open</Button>}
    </div>)}
   </div>
  </section>
  <aside className="projects-side">
   <section className="side-card"><h2>New project</h2>
    <form className="new-project-form" onSubmit={e=>{e.preventDefault();void createProject()}}>
     <label className="form-label" htmlFor="new-project-name">Project folder name</label>
     <Input ref={nameInput} id="new-project-name" className="mono" required value={newName} onChange={e=>setNewName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,60))} placeholder="my-first-video" pattern="[a-z0-9]+(-[a-z0-9]+)*" aria-describedby="project-name-hint"/>
     <small id="project-name-hint">lowercase, numbers, hyphens → projects/{newName||'<name>'}</small>
     <div className="property-two">
      <div><label className="form-label" htmlFor="new-project-title">Video title</label><Input id="new-project-title" value={newTitle} maxLength={90} onChange={e=>setNewTitle(e.target.value)} placeholder="optional"/></div>
      <div><label className="form-label" htmlFor="new-project-duration">Duration (seconds)</label><Input id="new-project-duration" type="number" min={2} max={180} step={1} required value={newDuration} onChange={e=>setNewDuration(Number(e.target.value))}/></div>
     </div>
     <span className="form-label">Start from</span>
     <div className="project-template-choices" role="group" aria-label="Starting template">
      <button className={newTemplate==='blank'?'selected':''} type="button" aria-pressed={newTemplate==='blank'} onClick={()=>setNewTemplate('blank')}><span>Blank</span><small>1 title clip</small></button>
      <button className={newTemplate==='starter'?'selected':''} type="button" aria-pressed={newTemplate==='starter'} onClick={()=>setNewTemplate('starter')}><span>3-scene starter</span><small>intro · callout · outro</small></button>
     </div>
     <Button type="submit" disabled={newCreating||!newName.trim()}>{newCreating?'Creating…':'Create & open'}</Button>
    </form>
   </section>
   <section className="side-card"><h2>Project Trash</h2>
    <div className="project-trash-list">{deletedProjects.length?deletedProjects.map(item=><div className="project-trash-row" key={item.id}>
     <div><strong className="mono">{item.name}</strong><small>deleted {new Date(item.deletedAt).toLocaleString()}</small></div>
     <Button variant="secondary" size="sm" onClick={()=>void recoverProject(item.id)}><RotateCcw size={14}/> Restore</Button>
    </div>):<p className="inspector-note">No deleted projects.</p>}</div>
    <small className="side-note">Restore never overwrites an existing project.</small>
   </section>
   {window.videoStudioDesktop&&<section className="side-card"><h2>Workspace folder</h2>
    <p className="side-note">Your Video Studio folder containing projects/ and the Render Engine. Applying relaunches the app; save open edits first.</p>
    <Input aria-label="Workspace folder" className="mono" value={workspacePath} onChange={e=>setWorkspacePath(e.target.value)} placeholder="D:\my_project\video-studio"/>
    <Button disabled={changingWorkspace||!workspacePath} onClick={()=>void changeWorkspace()}>Apply & restart</Button>
   </section>}
   <section className="side-card"><h2>How it fits together</h2>
    <dl className="fits-list">
     <dt>Terminal</dt><dd>Ask Claude Code or Codex to build and change the clip. Runs with your Windows account.</dd>
     <dt>Director</dt><dd>Watch the preview and scenes. Sound comes from the last rendered MP4.</dd>
     <dt>Code</dt><dd>Edit source, docs and brand notes yourself with Monaco.</dd>
     <dt>Library</dt><dd>Import, rename, duplicate and restore images, sound and documents.</dd>
     <dt>Render</dt><dd>Check layout, stills, draft and final renders with a live log.</dd>
    </dl>
    <Button variant="ghost" size="sm" onClick={onResetLayout} title="Reset panel sizes"><RefreshCw size={14}/> Reset layout</Button>
   </section>
  </aside>
  <AlertDialog open={deleteTarget!==null} onOpenChange={v=>{if(!deleting&&!v)setDeleteTarget(null)}}><AlertDialogContent>
   <AlertDialogTitle className="dialog-title"><Trash2 size={18}/> Move {deleteTarget} to Trash?</AlertDialogTitle>
   <AlertDialogDescription>The whole project folder (Source, Assets, Brand, Docs and Output) moves to recoverable Project Trash. Nothing is permanently deleted. Stop active renders first.</AlertDialogDescription>
   <Input aria-label="Type the project name to confirm" value={deleteConfirm} autoComplete="off" onChange={e=>setDeleteConfirm(e.target.value)} placeholder={deleteTarget||''}/>
   <DialogFooter><AlertDialogCancel asChild><Button variant="outline" disabled={deleting}>Cancel</Button></AlertDialogCancel>
    <Button variant="destructive" disabled={deleting||deleteConfirm!==deleteTarget} onClick={()=>void archiveProject()}>{deleting?'Moving…':'Move to Trash'}</Button>
   </DialogFooter>
  </AlertDialogContent></AlertDialog>
 </div>;
}
