import {useShallow} from 'zustand/react/shallow';
import {lazy,Suspense,useEffect,useState} from 'react';
import {Group,Panel,Separator,usePanelRef} from 'react-resizable-panels';
import {ArrowLeft,Braces,ChevronDown,ChevronUp,Images,LayoutGrid,ListVideo,Play,ShieldCheck,SlidersHorizontal,SquareTerminal,Clapperboard} from 'lucide-react';
import {toast} from 'sonner';
import {useStudio,isDirty,type Page} from './lib/state';
import {RENDER_ACTIONS,renderLabel} from './lib/tasks';
import type {RenderStatus} from './lib/api';
import {studioApi} from './lib/api';
import {cn,typing} from './lib/utils';
import {Button,DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger,Dialog,DialogContent,DialogTitle,DialogDescription,TooltipProvider} from './components/ui';
import {TerminalPortal,TerminalSlot} from './components/Console';
import {LibraryPage} from './components/Library';
import {RenderPage} from './components/RenderPage';
import {ProjectsPage,ProjectBadge} from './components/Projects';
import {DirectorPage,SceneList,Properties} from './components/Director';

// Code pulls in Markdown rendering and Monaco; load it on first visit.
const CodePage=lazy(()=>import('./components/CodePage').then(m=>({default:m.CodePage})));
const RAIL:[Page,string,typeof SquareTerminal][]=[['director','Director',SquareTerminal],['code','Code',Braces],['library','Library',Images],['render','Render',Clapperboard]];
const lastPage=():Page=>{try{const p=localStorage.getItem('vs-page') as Page;return RAIL.some(([k])=>k===p)?p:'director'}catch{return 'director'}};
const mmss=(t:number)=>String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.floor(t%60)).padStart(2,'0');

function useCompact(){
 const [compact,setCompact]=useState(window.innerWidth<850);
 useEffect(()=>{const update=()=>setCompact(window.innerWidth<850);addEventListener('resize',update);return ()=>removeEventListener('resize',update)},[]);
 return compact;
}
export function App(){
 const {project,projects,workspaceMode,page,duration,taskRunning,directorMode,unsaved,renderStatus}=useStudio(useShallow(s=>({project:s.project,projects:s.projects,workspaceMode:s.workspaceMode,page:s.page,duration:s.duration,taskRunning:s.taskRunning,directorMode:s.directorMode,unsaved:s.tabs.filter(isDirty).length,renderStatus:s.renderStatus})));
 const set=useStudio(s=>s.set),switchProject=useStudio(s=>s.switchProject),go=useStudio(s=>s.go);
 const [pendingProject,setPendingProject]=useState<string|null>(null);
 const [scenesOpen,setScenesOpen]=useState(false),[propertiesOpen,setPropertiesOpen]=useState(false);
 const [layoutKey,setLayoutKey]=useState(0);
 const [terminalVisible,setTerminalVisible]=useState(()=>localStorage.getItem('vs-terminal-visible')!=='false');
 const compact=useCompact();
 // Terminal-first puts the terminal in the Director's left column; Focus hides it. Otherwise it is the bottom panel.
 const terminalFirst=page==='director'&&directorMode==='terminal'&&!compact;
 const focused=page==='director'&&directorMode==='preview'&&!compact&&workspaceMode==='preview';
 const bottomTerminal=!terminalFirst&&!focused,showBottom=bottomTerminal&&terminalVisible;
 const terminalPanelRef=usePanelRef();
 useEffect(()=>{if(showBottom)terminalPanelRef.current?.expand();else terminalPanelRef.current?.collapse();},[showBottom,terminalPanelRef]);
 const toggleTerminal=(visible:boolean)=>{setTerminalVisible(visible);localStorage.setItem('vs-terminal-visible',String(visible));};
 const setDirectorMode=(mode:'terminal'|'preview')=>{set({directorMode:mode,workspaceMode:'normal'});try{localStorage.setItem('vs-director-mode',mode)}catch{}};
 useEffect(()=>{const key=(e:KeyboardEvent)=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='`'){e.preventDefault();setTerminalVisible(v=>{localStorage.setItem('vs-terminal-visible',String(!v));return !v;});}
  else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&!typing(e.target)){e.preventDefault();useStudio.getState().go('projects');}
 };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
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
 const switchTo=(name:string)=>{switchProject(name);setPendingProject(null);setScenesOpen(false);setPropertiesOpen(false);go('director')};
 // Unsaved Code tabs would be lost on switch, so ask first (Projects page banner); otherwise switch straight away.
 // Spec 8B: follow output/.render-status.json so renders started from the terminal show up too.
 const rendering=renderStatus.state==='running';
 useEffect(()=>{
  if(!project)return;
  let stop=false,timer=0;
  const poll=async()=>{
   try{
    const next:RenderStatus=await (await fetch('/api/studio/render-status?project='+encodeURIComponent(project))).json();
    if(stop)return;
    const before=useStudio.getState().renderStatus;
    set({renderStatus:next});
    if(before.state==='running'&&next.state!=='running')studioApi.projects().then(items=>set({projects:items})).catch(()=>{});
   }catch{/* server restarting: try again next tick */}
   if(!stop)timer=window.setTimeout(poll,useStudio.getState().renderStatus.state==='running'?1000:3000);
  };
  void poll();
  return ()=>{stop=true;clearTimeout(timer)};
 },[project,set]);
 // Spec 8C: the server streams file changes under source/, brand/ and docs/.
 useEffect(()=>{
  if(!project)return;
  const events=new EventSource('/api/studio/events?project='+encodeURIComponent(project));
  events.onmessage=e=>{try{const {path,at}=JSON.parse(e.data);useStudio.getState().fileChanged(path,at)}catch{/* ignore malformed */}};
  return ()=>events.close();
 },[project]);
 const choose=(name:string)=>{if(name===project)return;if(useStudio.getState().tabs.some(isDirty))setPendingProject(name);else switchTo(name)};
 const saveAndSwitch=async()=>{const st=useStudio.getState();for(const t of st.tabs.filter(isDirty))if(!await st.saveTab(t.key))return;if(pendingProject)switchTo(pendingProject)};
 const resetLayout=()=>{localStorage.removeItem('vs-layout-horizontal');localStorage.removeItem('vs-layout-vertical');set({workspaceMode:'normal'});setLayoutKey(x=>x+1);toast.success('Workspace layout reset')};
 const runTask=(command:string)=>{set({queuedTask:command});go('render');};
 const hasVideo=projects.find(p=>p.name===project)?.hasVideo;
 const terminalButton=<Button variant="secondary" size="sm" className="topbar-terminal" aria-pressed={terminalFirst||showBottom} disabled={terminalFirst}
   onClick={()=>{if(focused){set({workspaceMode:'normal'});toggleTerminal(true)}else toggleTerminal(!terminalVisible)}} title={terminalFirst?'Always shown in Terminal-first layout':'Show or hide the terminal (Ctrl+`)'}><SquareTerminal size={15}/><span>Terminal</span></Button>;
 const top=page==='projects'?<header className="app-header">
   <div className="header-brand"><span className="brand-name">VIDEO<span>STUDIO</span></span><span className="header-crumb">/ Projects</span></div>
   <div className="header-spacer"/>
   {terminalButton}
   {project&&<Button size="sm" variant="outline" onClick={()=>go(lastPage())}><ArrowLeft size={15}/><span className="back-label">Back to {project}</span></Button>}
  </header>:<header className="app-header">
   <button className="project-button" onClick={()=>go('projects')} title="Projects (Ctrl+K)">
    {project&&<ProjectBadge name={project}/>}
    <span className="project-button-text"><strong>{project||'Choose a project'}</strong><small>{project?(hasVideo?mmss(duration)+' · MP4 ready':'ยังไม่ render'):'Ctrl K to open'}</small></span>
    <kbd>Ctrl K</kbd>
   </button>
   {page==='director'&&!compact&&<div className="mode-toggle" role="radiogroup" aria-label="Director layout">
    {([['terminal','Terminal-first'],['preview','Preview-first']] as const).map(([mode,label])=><button key={mode} role="radio" aria-checked={directorMode===mode} className={cn(directorMode===mode&&'active')} onClick={()=>setDirectorMode(mode)}>{label}</button>)}
   </div>}
   <div className="header-spacer"/>
   {unsaved>0&&<button className="status-pill warn" onClick={()=>go('code')}><span className="pill-dot"/>{unsaved} unsaved file{unsaved>1?'s':''}</button>}
   {rendering?<button className="status-pill warn" onClick={()=>go('render')}><span className="pill-dot"/>{renderLabel(renderStatus)}</button>:
    taskRunning&&<button className="status-pill warn" onClick={()=>go('render')}><span className="pill-dot"/>Task running</button>}
   {compact&&page==='director'&&<><Button variant="ghost" size="icon" aria-label="Open scenes" onClick={()=>setScenesOpen(true)}><ListVideo size={18}/></Button>
    <Button variant="ghost" size="icon" aria-label="Open properties" onClick={()=>setPropertiesOpen(true)}><SlidersHorizontal size={17}/></Button></>}
   {terminalButton}
   <div className="render-split">
    <Button size="sm" className="render-main" disabled={!project||taskRunning} onClick={()=>runTask('render 1 2')} title={taskRunning?'A task is already running':'render 1 2'}><Play size={14}/><span>Draft render</span></Button>
    <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" className="render-more" aria-label="More render tasks" disabled={!project}><ChevronDown size={15}/></Button></DropdownMenuTrigger>
     <DropdownMenuContent className="render-menu">
      {taskRunning&&<div className="render-menu-note">A task is running. Stop it on the Render page first.</div>}
      {RENDER_ACTIONS.map(a=><DropdownMenuItem key={a.command} disabled={taskRunning} onSelect={()=>runTask(a.command)} className="render-menu-item">
       <span><strong>{a.name}</strong><small>{a.menu}</small></span><code>{a.command}</code>
      </DropdownMenuItem>)}
     </DropdownMenuContent></DropdownMenu>
   </div>
  </header>;
 const rail=<nav className="app-rail" aria-label="Pages">
   {RAIL.map(([key,label,Icon])=><button key={key} aria-label={label} className={cn('rail-button',page===key&&'active')} aria-current={page===key?'page':undefined} onClick={()=>go(key)}><span className="rail-icon"><Icon size={17}/></span><span>{label}</span></button>)}
   <div className="rail-spacer"/>
   <button className="rail-button" aria-label="Projects" onClick={()=>go('projects')}><span className="rail-icon"><LayoutGrid size={17}/></span><span>Projects</span></button>
  </nav>;
 const content=page==='director'?<DirectorPage mode={directorMode} compact={compact}/>:page==='code'?<Suspense fallback={<div className="skeleton code-skeleton"/>}><CodePage/></Suspense>:page==='library'?<LibraryPage/>:page==='projects'?<ProjectsPage onOpen={choose} onResetLayout={resetLayout}
   pending={pendingProject} onStay={()=>setPendingProject(null)} onDiscard={()=>pendingProject&&switchTo(pendingProject)} onSave={()=>void saveAndSwitch()}/>:null;
 return <TooltipProvider delayDuration={350}>
 <div className={cn('studio-app',page==='projects'&&'no-rail')}>
  {top}
  {page!=='projects'&&rail}
  <main className="studio-main" data-testid="react-studio">
   {/* The Group stays mounted in every layout so the Render page (and its running task log) never remounts. */}
   <Group key={'v'+layoutKey} orientation="vertical" className={showBottom?'master-panels':'master-panels terminal-hidden-workspace'}>
    <Panel id="workspace-content" defaultSize={showBottom?'71%':'100%'} minSize="200px" className="panel-contained">
     {content}
     <div className="render-page" hidden={page!=='render'}><RenderPage/></div>
    </Panel>
    <Separator className="resize-handle horizontal terminal-handle" aria-label="Resize terminal" disabled={!showBottom} style={{display:showBottom?undefined:'none'}}/>
    <Panel id="terminal" panelRef={terminalPanelRef} collapsible collapsedSize="0%" defaultSize={showBottom?'29%':'0%'} minSize="190px" maxSize="65%" className={'panel-contained'+(!showBottom?' terminal-collapsed':'')}>
      {bottomTerminal&&<TerminalSlot className="bottom-terminal"/>}
    </Panel>
   </Group>
   {bottomTerminal&&!terminalVisible&&<div className="terminal-reopen-dock"><Button variant="ghost" size="sm" aria-label="Show terminal panel" onClick={()=>toggleTerminal(true)}>Show terminal <ChevronUp size={14}/></Button><kbd>Ctrl `</kbd></div>}
  </main>
  <footer className="app-footer"><div><span className="status-indicator"/> <span>LOCAL WORKSPACE</span><span className="footer-delimiter">/</span><span>{project||'Not selected'}</span></div><div className="footer-right"><ShieldCheck size={13}/> Desktop-ready <span className="footer-delimiter">·</span> Playwright + FFmpeg <span className="footer-delimiter">·</span> 30 FPS</div></footer>
 </div>
 <TerminalPortal onHide={terminalFirst?undefined:()=>toggleTerminal(false)}/>
 <Dialog open={scenesOpen} onOpenChange={setScenesOpen}><DialogContent className="mobile-dialog mobile-drawer-left"><DialogTitle className="visually-hidden">Scenes</DialogTitle><DialogDescription className="visually-hidden">Jump to a scene</DialogDescription><SceneList/></DialogContent></Dialog>
 <Dialog open={propertiesOpen} onOpenChange={setPropertiesOpen}><DialogContent className="mobile-dialog mobile-drawer-right"><DialogTitle className="visually-hidden">Properties</DialogTitle><DialogDescription className="visually-hidden">Scene, sound and composition details</DialogDescription><Properties/></DialogContent></Dialog>
 </TooltipProvider>;
}
