import {useCallback,useEffect,useRef,useState} from 'react';
import {Terminal as XTerminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {ChevronDown,Play,Square,TerminalSquare,LockKeyhole} from 'lucide-react';
import {toast} from 'sonner';
import {Copy,ClipboardPaste} from 'lucide-react';
import {useStudio} from '../lib/state';
import type {Task} from '../lib/api';
import {studioApi} from '../lib/api';
import {Button,Input,Dialog,DialogContent,DialogTitle,DialogDescription,DialogFooter,Badge} from './ui';

const quick=[['check','Check'],['stills','Stills'],['render 1 2','Draft'],['render 8 2','Render'],['test','Tests'],['probe','Probe']];
function PowerShell(){
 const project=useStudio(s=>s.project);
 const screen=useRef<HTMLDivElement>(null),terminal=useRef<XTerminal|null>(null),fit=useRef<FitAddon|null>(null),socket=useRef<WebSocket|null>(null);
 const [enabled,setEnabled]=useState(false),[unlocked,setUnlocked]=useState(false),[accessOpen,setAccessOpen]=useState(false);
 const [accessCode,setAccessCode]=useState(''),[status,setStatus]=useState('Checking terminal access…');
 const [connected,setConnected]=useState(false);
 const copyText=async()=>{
   const value=terminal.current?.getSelection()||'';
   if(!value){toast.info('Select terminal text to copy');return}
   try{
     if(window.videoStudioDesktop)await window.videoStudioDesktop.writeClipboard(value);
     else await navigator.clipboard.writeText(value);
     toast.success('Copied');
   }catch(e){toast.error('Clipboard copy failed: '+(e as Error).message)}
 };
 const pasteText=async()=>{
   try{
     const value=window.videoStudioDesktop?await window.videoStudioDesktop.readClipboard():await navigator.clipboard.readText();
     if(value&&socket.current?.readyState===WebSocket.OPEN)socket.current.send(JSON.stringify({type:'input',data:value}));
     terminal.current?.focus();
   }catch(e){toast.error('Clipboard paste failed: '+(e as Error).message)}
 };
 const check=useCallback(async()=>{
  try{
   const r=await fetch('/api/terminal/status'),j=await r.json();
   setEnabled(Boolean(j.enabled));setUnlocked(Boolean(j.authenticated));
   setStatus(!j.enabled?'Terminal is disabled — launch with npm run studio':j.authenticated?'Authenticated • Connecting…':'Unlock local PowerShell once to continue');
  }catch(e){setStatus('Terminal unavailable: '+(e as Error).message);}
 },[]);
 useEffect(()=>{void check();},[check]);
 useEffect(()=>{
  if(!project||!unlocked||!enabled||!screen.current)return;
  const el=screen.current;
  const t=new XTerminal({cursorBlink:true,scrollback:6000,fontFamily:'Cascadia Code, Consolas, monospace',fontSize:12,
   theme:{background:'#090f1b',foreground:'#d5e4f8',cursor:'#9baeff',selectionBackground:'#42599e88'},
   allowTransparency:false,convertEol:false});
  const addon=new FitAddon();t.loadAddon(addon);t.open(el);terminal.current=t;fit.current=addon;
  t.attachCustomKeyEventHandler(e=>{if(e.type!=='keydown')return true;const ctrl=e.ctrlKey||e.metaKey;if(ctrl&&e.key==='v'){e.preventDefault();void pasteText();return false}if(ctrl&&e.key==='c'&&t.hasSelection()){e.preventDefault();void copyText();return false}return true;});
  const url=(location.protocol==='https:'?'wss://':'ws://')+location.host+'/api/terminal/ws?project='+encodeURIComponent(project);
  const ws=new WebSocket(url);socket.current=ws;
  const resize=()=>{try{addon.fit();if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'resize',cols:t.cols,rows:t.rows}))}catch{}};
  const ro=new ResizeObserver(resize);ro.observe(el);
  const handle=t.onData(data=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'input',data}))});
  ws.addEventListener('open',()=>{setConnected(true);setStatus('PowerShell connected • '+project);resize();t.focus()});
  ws.addEventListener('message',e=>{try{const m=JSON.parse(e.data);if(m.type==='data')t.write(m.data);else if(m.type==='error')setStatus('Shell error: '+m.message);else if(m.type==='exit')setStatus('PowerShell exited ('+m.exitCode+')')}catch{}});
  ws.addEventListener('close',()=>{setConnected(false);setStatus('Terminal disconnected. Switch tabs to reconnect.')});
  ws.addEventListener('error',()=>setStatus('Terminal WebSocket could not connect.'));
  setTimeout(resize,100);
  return ()=>{ro.disconnect();handle.dispose();ws.close();t.dispose();socket.current=null;terminal.current=null;fit.current=null;setConnected(false)};
 },[project,enabled,unlocked]);
 const login=async()=>{
  try{
   const r=await fetch('/api/terminal/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:accessCode})});
   const j=await r.json();if(!r.ok)throw Error(j.error||'Invalid access code');
   setAccessOpen(false);setAccessCode('');toast.success('PowerShell unlocked');await check();
  }catch(e){toast.error((e as Error).message)}
 };
 return <div className="pty-panel">
  <div className="pty-bar"><span className={'terminal-led '+(connected?'green':'')}/><span className="truncate">{status}</span>
    {enabled&&!unlocked&&<Button size="sm" variant="secondary" onClick={()=>setAccessOpen(true)}><LockKeyhole size={14}/> Unlock terminal</Button>}
    {!enabled&&<Badge>Safe mode</Badge>}
    {enabled&&unlocked&&<div className="terminal-clipboard-actions"><Button size="sm" variant="ghost" aria-label="Copy selected terminal text" onClick={()=>void copyText()}><Copy size={14}/> Copy</Button><Button size="sm" variant="ghost" aria-label="Paste into terminal" onClick={()=>void pasteText()}><ClipboardPaste size={14}/> Paste</Button></div>}
  </div>
  {enabled&&unlocked?<div className="xterm-host" ref={screen} data-testid="powershell-screen" aria-label="Interactive PowerShell"/>:
  <div className="terminal-placeholder"><TerminalSquare size={29}/><h3>{enabled?'PowerShell requires local permission':'PowerShell disabled'}</h3>
   <p>{enabled?'Enter the access code printed by the Studio launcher. This grants full command-line permissions.':'Start Video Studio with npm run studio (Electron unlocks automatically).'}</p>
   {enabled&&<Button onClick={()=>setAccessOpen(true)}><LockKeyhole size={16}/> Enter access code</Button>}
  </div>}
  <Dialog open={accessOpen} onOpenChange={setAccessOpen}><DialogContent>
   <div className="dialog-eyebrow"><LockKeyhole size={17}/> LOCAL TERMINAL SECURITY</div>
   <DialogTitle className="dialog-title">Unlock PowerShell</DialogTitle>
   <DialogDescription>The terminal can modify files and run Claude Code or Codex with your Windows account permissions. Enter the startup code displayed in the Studio server window. Never share this code.</DialogDescription>
   <Input autoFocus type="password" autoComplete="off" value={accessCode} onChange={e=>setAccessCode(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void login()}} placeholder="One-time terminal access code" aria-label="Terminal access code"/>
   <DialogFooter><Button variant="outline" onClick={()=>setAccessOpen(false)}>Cancel</Button><Button disabled={!accessCode} onClick={()=>void login()}>Unlock Terminal</Button></DialogFooter>
  </DialogContent></Dialog>
 </div>;
}
function TaskShell(){
 const project=useStudio(s=>s.project);
 const [job,setJob]=useState<Task|null>(null),[command,setCommand]=useState(''),[output,setOutput]=useState('Select a project, then run Check, Stills, Draft, Render or Tests.\nThe task console uses a restricted command set. Switch to PowerShell for unrestricted commands.');
 const scroller=useRef<HTMLPreElement>(null);
 const [running,setRunning]=useState(false);
 useEffect(()=>{
  let cancel=false;
  fetch('/api/studio/task').then(r=>r.json()).then(({active})=>{if(!cancel&&active?.status==='running'){setJob(active);setRunning(true)}}).catch(()=>{});
  return ()=>{cancel=true}
 },[]);
 useEffect(()=>{
  if(!job?.id||!running)return;
  const poll=async()=>{
   try{
    const r=await fetch('/api/studio/task?id='+encodeURIComponent(job.id)),task:Task=await r.json();
    setOutput(task.output||'');setJob(task);
    if(task.status!=='running'){setRunning(false);if(task.status==='complete')toast.success('Task complete: '+task.command);else toast.error('Task failed: '+task.command)}
   }catch(e){setRunning(false);toast.error((e as Error).message)}
  };
  const t=setInterval(()=>void poll(),550);void poll();return ()=>clearInterval(t);
 },[job?.id,running]);
 const run=async(value:string)=>{
  const v=value.trim();if(!v||running)return;
  try{
   const data=await studioApi.json<{builtin?:string;output?:string;id?:string;status?:Task['status'];command?:string}>('/api/studio/task',{project,command:v});
   if(data.builtin){setOutput(data.output||'');return;}
   setJob(data as Task);setOutput(data.output||'> '+v);setRunning(data.status==='running');setCommand('');
  }catch(e){toast.error((e as Error).message)}
 };
 const cancel=async()=>{if(job?.id)await studioApi.json('/api/studio/task/cancel',{id:job.id});};
 useEffect(()=>{if(scroller.current)scroller.current.scrollTop=scroller.current.scrollHeight},[output]);
 return <div className="task-shell">
  <div className="task-actions">{quick.map(([value,name])=><Button key={value} variant="secondary" size="sm" disabled={running} onClick={()=>void run(value)}>{name}</Button>)}
   {running&&<Button variant="destructive" size="sm" onClick={()=>void cancel()}><Square size={12}/> Stop</Button>}
  </div>
  <pre ref={scroller} className="task-output" data-testid="task-output">{output}</pre>
  <form onSubmit={e=>{e.preventDefault();void run(command)}} className="task-entry"><span>{project || 'studio'} &gt;</span><Input value={command} onChange={e=>setCommand(e.target.value)} placeholder="help | check | render 1 2 | status" aria-label="Task console command"/><Button size="sm" type="submit" disabled={running}>Run <Play size={13}/></Button></form>
 </div>;
}
export function StudioConsole({onHide}:{onHide:()=>void}){
 const tab=useStudio(s=>s.terminalTab),set=useStudio(s=>s.set);
 return <section className="studio-console" aria-label="Integrated terminal">
  <div className="console-header"><div className="pane-heading"><TerminalSquare size={16}/><span>TERMINAL</span></div>
   <div className="console-tabs"><button className={tab==='powershell'?'active':''} onClick={()=>set({terminalTab:'powershell'})}>PowerShell <span className="cli-names">/ Claude / Codex</span></button>
    <button className={tab==='tasks'?'active':''} onClick={()=>set({terminalTab:'tasks'})}>Render Tasks</button></div>
   <Button size="icon" variant="ghost" aria-label="Hide terminal panel" title="Hide entire terminal panel (Ctrl+`)" onClick={onHide}><ChevronDown size={16}/></Button>
  </div>
  <div className="console-content">{tab==='powershell'?<PowerShell/>:<TaskShell/>}</div>
 </section>;
}
