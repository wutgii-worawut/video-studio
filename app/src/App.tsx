import {useShallow} from 'zustand/react/shallow';
import {useEffect,useState} from 'react';
import {Group,Panel,Separator,usePanelRef} from 'react-resizable-panels';
import {Check,ChevronDown,Clapperboard,FolderClosed,HardDrive,HelpCircle,PanelLeft,PanelRight,RefreshCw,Settings2,ShieldCheck,Plus,Layers3,PanelBottomOpen,Trash2,RotateCcw} from 'lucide-react';
import {toast} from 'sonner';
import {useStudio} from './lib/state';
import {studioApi} from './lib/api';
import {Input,Button,DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger,DropdownMenuSeparator,Dialog,DialogContent,DialogTitle,DialogDescription,AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogCancel,AlertDialogAction,DialogFooter,TooltipProvider} from './components/ui';
import {FileExplorer} from './components/FileExplorer';
import {Preview,Timeline} from './components/Preview';
import {Inspector} from './components/Inspector';
import {StudioConsole} from './components/Console';

function useCompact(){
 const [compact,setCompact]=useState(window.innerWidth<850);
 useEffect(()=>{const update=()=>setCompact(window.innerWidth<850);addEventListener('resize',update);return ()=>removeEventListener('resize',update)},[]);
 return compact;
}
export function App(){
 const {project,projects,workspaceMode}=useStudio(useShallow(s=>({project:s.project,projects:s.projects,workspaceMode:s.workspaceMode})));
 const set=useStudio(s=>s.set),switchProject=useStudio(s=>s.switchProject);
 const [pendingProject,setPendingProject]=useState<string|null>(null);
 const [mobileExplorer,setMobileExplorer]=useState(false),[mobileInspector,setMobileInspector]=useState(false);
 const [helpOpen,setHelpOpen]=useState(false);
 const [newOpen,setNewOpen]=useState(false),[newName,setNewName]=useState(''),
   [newTitle,setNewTitle]=useState(''),[newDuration,setNewDuration]=useState(12),
   [newTemplate,setNewTemplate]=useState<'blank'|'starter'>('blank'),
   [newCreating,setNewCreating]=useState(false);
 const [settingsOpen,setSettingsOpen]=useState(false),[workspacePath,setWorkspacePath]=useState(''),[changingWorkspace,setChangingWorkspace]=useState(false);
 const [layoutKey,setLayoutKey]=useState(0);
 const [deleteOpen,setDeleteOpen]=useState(false),[deleteConfirm,setDeleteConfirm]=useState(''),[deleting,setDeleting]=useState(false);
 const [trashOpen,setTrashOpen]=useState(false),[deletedProjects,setDeletedProjects]=useState<{id:string;name:string;deletedAt:string}[]>([]);
 const [terminalVisible,setTerminalVisible]=useState(()=>localStorage.getItem('vs-terminal-visible')!=='false');
 const terminalPanelRef=usePanelRef();
 useEffect(()=>{if(terminalVisible)terminalPanelRef.current?.expand();else terminalPanelRef.current?.collapse();},[terminalVisible,terminalPanelRef]);
 const compact=useCompact();
 useEffect(()=>{if(compact&&workspaceMode==='inspector')setMobileInspector(false);},[compact,workspaceMode]);
 const toggleTerminal=(visible:boolean)=>{setTerminalVisible(visible);localStorage.setItem('vs-terminal-visible',String(visible));};
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key==='`'){e.preventDefault();setTerminalVisible(v=>{localStorage.setItem('vs-terminal-visible',String(!v));return !v;});}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
 useEffect(()=>{if(settingsOpen)window.videoStudioDesktop?.getWorkspace().then(setWorkspacePath).catch(()=>{});},[settingsOpen]);
 const changeWorkspace=async()=>{if(!window.videoStudioDesktop?.setWorkspace)return;setChangingWorkspace(true);try{await window.videoStudioDesktop.setWorkspace(workspacePath)}catch(e){toast.error((e as Error).message);setChangingWorkspace(false)}};
 useEffect(()=>{
  let cancel=false;
  studioApi.projects().then(items=>{
   if(cancel)return;
   set({projects:items});
   const cached=localStorage.getItem('vs-last-project');
   const name=items.some(p=>p.name===cached)?cached:(items.find(p=>p.name==='sword-of-coming-s2')||items[0])?.name;
   if(name)switchProject(name);
  }).catch(e=>toast.error('Unable to load projects: '+e.message));
  return ()=>{cancel=true}
 },[set,switchProject]);
 useEffect(()=>{
  if(!project)return;
  localStorage.setItem('vs-last-project',project);
  window.videoStudioDesktop?.setTitle('Video Studio — '+project);
  let aborted=false;
  studioApi.composition(project).then(value=>{
   if(aborted)return;
   set({composition:value?.data||null,etag:value?.etag||''});
  }).catch(e=>toast.error('Composition: '+e.message));
  return ()=>{aborted=true};
 },[project,set]);
 const choose=(name:string)=>{if(name===project)return;setPendingProject(name)};
 const confirmSwitch=()=>{if(!pendingProject)return;switchProject(pendingProject);setPendingProject(null);setMobileExplorer(false);setMobileInspector(false)};
 const createProject=async()=>{
  if(newCreating)return;
  setNewCreating(true);
  try{
    const result=await studioApi.json<{name:string;hasVideo:boolean}>('/api/projects',{
      name:newName.trim(),title:newTitle.trim()||newName.trim(),
      duration:newDuration,template:newTemplate
    });
    set({projects:[...useStudio.getState().projects,result].sort((a,b)=>a.name.localeCompare(b.name))});
    switchProject(result.name);
    setNewOpen(false);setNewName('');setNewTitle('');setNewDuration(12);
    toast.success('Created '+result.name+' — edit your first clip in Composition');
  }catch(e){toast.error('Cannot create project: '+(e as Error).message)}
  finally{setNewCreating(false)}
 };
 const refreshTrash=async()=>{try{const res=await fetch('/api/studio/projects/trash');if(!res.ok)throw Error('Failed to load project Trash');setDeletedProjects((await res.json()).items)}catch(e){toast.error((e as Error).message)}};
 const archiveProject=async()=>{
  if(!project||deleteConfirm!==project||deleting)return;
  setDeleting(true);
  try{
   await studioApi.json('/api/studio/projects/trash',{project,confirm:deleteConfirm});
   const next=await studioApi.projects();
   set({projects:next});
   switchProject(next[0]?.name||'');
   toast.success('Project moved to Trash — it can be restored');
   setDeleteOpen(false);setDeleteConfirm('');
  }catch(e){toast.error((e as Error).message)}
  finally{setDeleting(false)}
 };
 const recoverProject=async(id:string)=>{
  try{
   const result=await studioApi.json<{name:string}>('/api/studio/projects/restore',{id});
   const next=await studioApi.projects();set({projects:next});switchProject(result.name);
   await refreshTrash();toast.success('Restored project '+result.name);
  }catch(e){toast.error((e as Error).message)}
 };
 const resetLayout=()=>{localStorage.removeItem('vs-layout-horizontal');localStorage.removeItem('vs-layout-vertical');set({workspaceMode:'normal'});setLayoutKey(x=>x+1);toast.success('Workspace layout reset')};
 const top=<header className="app-header">
   <div className="header-brand"><div className="brand-emblem"><Clapperboard size={19}/></div><span className="brand-name">VIDEO<span>STUDIO</span></span><span className="brand-version">DESKTOP</span></div>
   <div className="header-divider"/>
   {compact&&<Button variant="ghost" size="icon" aria-label="Open Project Explorer" onClick={()=>setMobileExplorer(true)}><PanelLeft size={19}/></Button>}
   <DropdownMenu><DropdownMenuTrigger asChild><Button className="project-picker" variant="secondary"><FolderClosed size={16}/><span>{project||'Choose a project'}</span><ChevronDown size={15}/></Button></DropdownMenuTrigger>
     <DropdownMenuContent align="start">{projects.map(p=><DropdownMenuItem key={p.name} onSelect={()=>choose(p.name)}><span className="project-menu-name">{p.name}</span>{p.name===project&&<Check size={15}/>}<span className={'project-state '+(p.hasVideo?'ready':'')}/></DropdownMenuItem>)}
      <DropdownMenuSeparator/>
      <DropdownMenuItem onSelect={()=>{void refreshTrash();setTrashOpen(true)}}><RotateCcw size={14}/> Project Trash / Restore</DropdownMenuItem>
      <DropdownMenuItem disabled={!project} onSelect={()=>{setDeleteConfirm('');setDeleteOpen(true)}}><Trash2 size={14}/> Move current project to Trash</DropdownMenuItem>
     </DropdownMenuContent></DropdownMenu>
   <Button size="sm" variant="secondary" className="new-project-trigger" aria-label="New Project" onClick={()=>setNewOpen(true)}><Plus size={16}/><span>New Project</span></Button>
   <div className="header-spacer"/>
   <div className="header-center">CREATIVE WORKSPACE <span className="header-subtitle">/ {project||'no project'}</span></div>
   <div className="header-spacer"/>
   {compact&&<Button variant="ghost" size="icon" aria-label="Open Inspector" onClick={()=>setMobileInspector(true)}><PanelRight size={19}/></Button>}
   {window.videoStudioDesktop&&<Button variant="ghost" size="icon" aria-label="Workspace settings" onClick={()=>setSettingsOpen(true)}><Settings2 size={17}/></Button>}
   <Button className="header-tool" variant="ghost" size="sm" onClick={resetLayout} title="Reset panel sizes"><RefreshCw size={15}/><span>Reset layout</span></Button>
   <Button className="header-tool" variant="ghost" size="icon" aria-label="Help" onClick={()=>setHelpOpen(true)}><HelpCircle size={17}/></Button>
   <div className="user-avatar">VS</div>
  </header>;
 const deskContent=workspaceMode==='preview'?<Preview/>:workspaceMode==='inspector'?
  <Group key={'expanded-inspector-'+layoutKey} orientation="horizontal" className="main-horizontal inspector-focused">
   <Panel id="explorer-expanded" defaultSize="24%" minSize="190px" maxSize="42%" className="panel-contained"><FileExplorer/></Panel>
   <Separator className="resize-handle" aria-label="Resize Project Explorer"/>
   <Panel id="inspector-expanded" defaultSize="76%" minSize="340px" className="panel-contained"><Inspector/></Panel>
  </Group>:<Group key={'h'+layoutKey} orientation="horizontal" className="main-horizontal" onLayoutChanged={l=>localStorage.setItem('vs-layout-horizontal',JSON.stringify(l))}>
   <Panel id="explorer" defaultSize="21%" minSize="190px" maxSize="33%" className="panel-contained"><FileExplorer/></Panel>
   <Separator className="resize-handle" aria-label="Resize Project Explorer"/>
   <Panel id="center" defaultSize="55%" minSize="360px" className="panel-contained">
    <Group orientation="vertical" className="preview-timeline">
     <Panel defaultSize="73%" minSize="280px" className="panel-contained"><Preview/></Panel>
     <Separator className="resize-handle horizontal" aria-label="Resize timeline"/>
     <Panel defaultSize="27%" minSize="120px" className="panel-contained"><Timeline/></Panel>
    </Group>
   </Panel>
   <Separator className="resize-handle" aria-label="Resize Inspector"/>
   <Panel id="inspector" defaultSize="24%" minSize="255px" maxSize="42%" className="panel-contained"><Inspector/></Panel>
  </Group>;
 const content=compact?(workspaceMode==='inspector'?
  <div className="compact-inspector-workspace"><div className="compact-inspector-explorer"><FileExplorer/></div><div className="compact-inspector-details"><Inspector/></div></div>:
  <div className="compact-workspace"><div className="compact-preview"><Preview/></div><div className="compact-timeline"><Timeline/></div></div>):deskContent;
 return <TooltipProvider delayDuration={350}>
 <div className="studio-app">
  {top}
  <main className="studio-main" data-testid="react-studio">
   <Group key={'v'+layoutKey} orientation="vertical" className={terminalVisible?'master-panels':'master-panels terminal-hidden-workspace'}>
    <Panel id="workspace-content" defaultSize={terminalVisible?'71%':'100%'} minSize="280px" className="panel-contained">{content}</Panel>
    <Separator className="resize-handle horizontal" aria-label="Resize terminal" disabled={!terminalVisible} style={{display:terminalVisible?undefined:'none'}}/>
    <Panel id="terminal" panelRef={terminalPanelRef} collapsible collapsedSize="0%" defaultSize={terminalVisible?'29%':'0%'} minSize="116px" maxSize="65%" className={'panel-contained'+(!terminalVisible?' terminal-collapsed':'')}>
      <StudioConsole onHide={()=>toggleTerminal(false)}/>
    </Panel>
   </Group>
   {!terminalVisible&&<div className="terminal-reopen-dock"><Button variant="ghost" size="sm" aria-label="Show terminal panel" onClick={()=>toggleTerminal(true)}><PanelBottomOpen size={16}/> Show Terminal</Button></div>}
  </main>
  <footer className="app-footer"><div><span className="status-indicator"/> <span>LOCAL WORKSPACE</span><span className="footer-delimiter">/</span><span>{project||'Not selected'}</span></div><div className="footer-right"><ShieldCheck size={13}/> Desktop-ready <span className="footer-delimiter">·</span> Playwright + FFmpeg <span className="footer-delimiter">·</span> 30 FPS</div></footer>
 </div>
 <Dialog open={mobileExplorer} onOpenChange={setMobileExplorer}><DialogContent className="mobile-dialog mobile-drawer-left"><DialogTitle className="visually-hidden">Project Explorer</DialogTitle><DialogDescription className="visually-hidden">Manage local project files</DialogDescription><FileExplorer/></DialogContent></Dialog>
 <Dialog open={mobileInspector} onOpenChange={setMobileInspector}><DialogContent className="mobile-dialog mobile-drawer-right"><DialogTitle className="visually-hidden">Inspector</DialogTitle><DialogDescription className="visually-hidden">Inspect project scenes and files</DialogDescription><Inspector/></DialogContent></Dialog>
 <Dialog open={newOpen} onOpenChange={v=>{if(!newCreating)setNewOpen(v)}}><DialogContent>
   <div className="dialog-eyebrow"><Layers3 size={17}/> PROJECT SETUP</div>
   <DialogTitle className="dialog-title">Create a new project</DialogTitle>
   <DialogDescription>Creates editable Composition clips and the project Source, Brand, Docs, Assets and Output folders. Existing projects will never be overwritten.</DialogDescription>
   <form className="new-project-form" onSubmit={e=>{e.preventDefault();void createProject()}}>
    <label className="form-label" htmlFor="new-project-name">Project folder name</label>
    <Input id="new-project-name" autoFocus required value={newName} onChange={e=>setNewName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,60))} placeholder="my-first-video" pattern="[a-z0-9]+(-[a-z0-9]+)*" aria-describedby="project-name-hint"/>
    <small id="project-name-hint">Lowercase letters, numbers, and hyphens. This becomes the project folder.</small>
    <label className="form-label" htmlFor="new-project-title">Video title</label>
    <Input id="new-project-title" value={newTitle} maxLength={90} onChange={e=>setNewTitle(e.target.value)} placeholder="My first video (optional)"/>
    <label className="form-label" htmlFor="new-project-duration">Duration (seconds)</label>
    <Input id="new-project-duration" type="number" min={2} max={180} step={1} required value={newDuration} onChange={e=>setNewDuration(Number(e.target.value))}/>
    <span className="form-label">Starting template</span>
    <div className="project-template-choices" role="group" aria-label="Starting template">
      <button className={newTemplate==='blank'?'selected':''} type="button" aria-pressed={newTemplate==='blank'} onClick={()=>setNewTemplate('blank')}><span>Blank canvas</span><small>One editable title clip</small></button>
      <button className={newTemplate==='starter'?'selected':''} type="button" aria-pressed={newTemplate==='starter'} onClick={()=>setNewTemplate('starter')}><span>3-scene starter</span><small>Intro, callout, outro</small></button>
    </div>
    <DialogFooter><Button type="button" variant="outline" disabled={newCreating} onClick={()=>setNewOpen(false)}>Cancel</Button><Button type="submit" disabled={newCreating||!newName.trim()}> {newCreating?'Creating…':'Create Project'} </Button></DialogFooter>
   </form>
  </DialogContent></Dialog>
 <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent>
  <div className="dialog-eyebrow"><HardDrive size={17}/> DESKTOP SETTINGS</div>
  <DialogTitle className="dialog-title">Project workspace</DialogTitle>
  <DialogDescription>Use your existing Video Studio folder containing projects/ and the Render Engine. Switching this path relaunches Electron; save open edits first. No Windows dialog is required.</DialogDescription>
  <label className="form-label" htmlFor="workspace-path">Workspace folder</label>
  <Input id="workspace-path" value={workspacePath} onChange={e=>setWorkspacePath(e.target.value)} placeholder="D:\\my_project\\video-studio"/>
  <DialogFooter><Button variant="outline" onClick={()=>setSettingsOpen(false)}>Cancel</Button><Button disabled={changingWorkspace||!workspacePath} onClick={()=>void changeWorkspace()}>Apply & Restart</Button></DialogFooter>
 </DialogContent></Dialog>
 <AlertDialog open={deleteOpen} onOpenChange={v=>{if(!deleting)setDeleteOpen(v)}}><AlertDialogContent>
   <AlertDialogTitle className="dialog-title"><Trash2 size={18}/> Move project to Trash?</AlertDialogTitle>
   <AlertDialogDescription>This will move the entire project folder (including Source, Assets, Brand, Docs and Output) to recoverable Project Trash. No files are permanently deleted. Stop active renders first.</AlertDialogDescription>
   <div className="delete-project-warning">Type <strong>{project}</strong> to confirm:</div>
   <Input aria-label="Confirm project name" value={deleteConfirm} autoComplete="off" onChange={e=>setDeleteConfirm(e.target.value)} placeholder={project}/>
   <DialogFooter><AlertDialogCancel asChild><Button variant="outline" disabled={deleting}>Cancel</Button></AlertDialogCancel>
    <Button variant="destructive" disabled={deleting||deleteConfirm!==project} onClick={()=>void archiveProject()}>{deleting?'Moving…':'Move Project to Trash'}</Button>
   </DialogFooter>
  </AlertDialogContent></AlertDialog>
 <Dialog open={trashOpen} onOpenChange={setTrashOpen}><DialogContent>
  <DialogTitle className="dialog-title">Project Trash</DialogTitle>
  <DialogDescription>Restore archived projects to their original names. Restore never overwrites an existing project.</DialogDescription>
  <div className="project-trash-list">{deletedProjects.length?deletedProjects.map(item=><div className="project-trash-row" key={item.id}>
    <div><strong>{item.name}</strong><small>{new Date(item.deletedAt).toLocaleString()}</small></div>
    <Button variant="secondary" size="sm" onClick={()=>void recoverProject(item.id)}><RotateCcw size={14}/> Restore</Button>
   </div>):<p className="inspector-note">No deleted projects.</p>}</div>
  <DialogFooter><Button variant="outline" onClick={()=>setTrashOpen(false)}>Close</Button></DialogFooter>
 </DialogContent></Dialog>
 <Dialog open={helpOpen} onOpenChange={setHelpOpen}><DialogContent><DialogTitle className="dialog-title">Welcome to Video Studio</DialogTitle><DialogDescription>Desktop workspace for HTML compositions, media resources and video render jobs.</DialogDescription>
  <div className="help-block"><h4>Project Explorer</h4><p>Import assets and documents. Open files with Monaco. Rename, duplicate or move project files to recoverable Trash.</p><h4>Preview & Timeline</h4><p>Play and seek current HTML frames. Audio is from the latest rendered MP4; re-render after changing audio timing.</p><h4>Terminal</h4><p>PowerShell supports local CLI tools and must be authenticated in the browser. Electron can unlock its own local instance. Render Tasks are restricted commands.</p><h4>Editing</h4><p>Composition JSON clips can be edited in Inspector. Legacy HTML sources can be edited with Monaco. Save before switching projects.</p></div>
  <DialogFooter><Button onClick={()=>setHelpOpen(false)}>Got it</Button></DialogFooter>
 </DialogContent></Dialog>
 <AlertDialog open={pendingProject!==null} onOpenChange={o=>{if(!o)setPendingProject(null)}}><AlertDialogContent>
  <AlertDialogTitle className="dialog-title">Switch project?</AlertDialogTitle>
  <AlertDialogDescription>The Preview and current file selection will close. Save any changes in the Inspector before switching to <strong>{pendingProject}</strong>.</AlertDialogDescription>
  <DialogFooter><AlertDialogCancel asChild><Button variant="outline">Stay here</Button></AlertDialogCancel><AlertDialogAction asChild><Button onClick={confirmSwitch}>Switch project</Button></AlertDialogAction></DialogFooter>
 </AlertDialogContent></AlertDialog>
 </TooltipProvider>;
}
