import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Terminal as XTerminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {ChevronDown,TerminalSquare,LockKeyhole,Plus,X} from 'lucide-react';
import {toast} from 'sonner';
import {Copy,ClipboardPaste} from 'lucide-react';
import {useStudio,type SessionKind} from '../lib/state';
import {cn} from '../lib/utils';
import {InsertBar} from './InsertBar';
import {Button,Input,Dialog,DialogContent,DialogTitle,DialogDescription,DialogFooter,Badge,DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from './ui';

// Spec 8D: each tab is its own PTY (one WebSocket each). claude/codex tabs start that CLI inside PowerShell.
interface Session {id:string;kind:SessionKind}
const KINDS:SessionKind[]=['claude','codex','powershell'];
const LABEL:Record<SessionKind,string>={claude:'claude',codex:'codex',powershell:'PowerShell'};
const MAX_SESSIONS=6; // matches lib/studio-terminal.mjs
const newSession=(kind:SessionKind):Session=>({id:crypto.randomUUID(),kind});
// The open tab kinds are remembered; reopening Studio starts fresh PTYs for them.
function savedSessions():Session[]{
 try{const kinds=JSON.parse(localStorage.getItem('vs-terminal-sessions')||'[]');
  const valid=Array.isArray(kinds)?kinds.filter((k:SessionKind)=>KINDS.includes(k)).slice(0,MAX_SESSIONS):[];
  if(valid.length)return valid.map(newSession);
 }catch{/* fall through */}
 return [newSession('powershell')];
}

// Connected PTYs by session id, so the Insert bar, Copy and Paste act on the visible tab without another socket.
const live=new Map<string,{socket:WebSocket;term:XTerminal}>();
let activeId='';
const MAX_INPUT=16000; // lib/studio-terminal.mjs drops larger input messages
const active=()=>live.get(activeId);
export const terminalReady=()=>active()?.socket.readyState===WebSocket.OPEN;
// Types text at the terminal cursor. Never sends Enter: newlines become spaces so the user reviews before running.
export function sendToTerminal(text:string,{raw=false}:{raw?:boolean}={}){
 const pty=active();
 if(pty?.socket.readyState!==WebSocket.OPEN){toast.error('Terminal is locked or not connected — unlock it first');return false;}
 const data=raw?text:text.replace(/[\r\n]+/g,' ');
 if(data.length>MAX_INPUT){toast.error('Too long to insert ('+data.length+' characters, limit '+MAX_INPUT+')');return false;}
 pty.socket.send(JSON.stringify({type:'input',data}));pty.term.focus();return true;
}
async function copyText(){
 const value=active()?.term.getSelection()||'';
 if(!value){toast.info('Select terminal text to copy');return}
 try{
  if(window.videoStudioDesktop)await window.videoStudioDesktop.writeClipboard(value);
  else await navigator.clipboard.writeText(value);
  toast.success('Copied');
 }catch(e){toast.error('Clipboard copy failed: '+(e as Error).message)}
}
async function pasteText(){
 try{
  const value=window.videoStudioDesktop?await window.videoStudioDesktop.readClipboard():await navigator.clipboard.readText();
  const pty=active();
  if(value&&pty?.socket.readyState===WebSocket.OPEN)pty.socket.send(JSON.stringify({type:'input',data:value}));
  pty?.term.focus();
 }catch(e){toast.error('Clipboard paste failed: '+(e as Error).message)}
}

function SessionScreen({session,visible,onStatus}:{session:Session;visible:boolean;onStatus:(id:string,text:string,connected:boolean)=>void}){
 const project=useStudio(s=>s.project);
 const screen=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!project||!screen.current)return;
  const el=screen.current,label=LABEL[session.kind];
  const t=new XTerminal({cursorBlink:true,scrollback:6000,fontFamily:'"IBM Plex Mono", Consolas, monospace',fontSize:12.5,
   theme:{background:'#090B10',foreground:'#D5E4F8',cursor:'#F0A23A',selectionBackground:'#4A6FA888'},
   allowTransparency:false,convertEol:false});
  const addon=new FitAddon();t.loadAddon(addon);t.open(el);
  t.attachCustomKeyEventHandler(e=>{if(e.type!=='keydown')return true;const ctrl=e.ctrlKey||e.metaKey;if(ctrl&&e.key==='v'){e.preventDefault();void pasteText();return false}if(ctrl&&e.key==='c'&&t.hasSelection()){e.preventDefault();void copyText();return false}return true;});
  const url=(location.protocol==='https:'?'wss://':'ws://')+location.host+'/api/terminal/ws?'+new URLSearchParams({project,session:session.id,cmd:session.kind});
  const ws=new WebSocket(url);live.set(session.id,{socket:ws,term:t});
  const resize=()=>{try{addon.fit();if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'resize',cols:t.cols,rows:t.rows}))}catch{}};
  const ro=new ResizeObserver(resize);ro.observe(el);
  const handle=t.onData(data=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'input',data}))});
  ws.addEventListener('open',()=>{onStatus(session.id,label+' connected • '+project,true);resize();if(session.id===activeId)t.focus()});
  ws.addEventListener('message',e=>{try{const m=JSON.parse(e.data);if(m.type==='data')t.write(m.data);else if(m.type==='error')onStatus(session.id,'Shell error: '+m.message,false);else if(m.type==='exit')onStatus(session.id,label+' exited ('+m.exitCode+')',false)}catch{}});
  ws.addEventListener('close',()=>onStatus(session.id,'Terminal disconnected. Switch tabs to reconnect.',false));
  ws.addEventListener('error',()=>onStatus(session.id,'Terminal WebSocket could not connect.',false));
  setTimeout(resize,100);
  return ()=>{ro.disconnect();handle.dispose();ws.close();t.dispose();if(live.get(session.id)?.socket===ws)live.delete(session.id)};
 },[project,session.id,session.kind,onStatus]);
 useEffect(()=>{if(visible)live.get(session.id)?.term.focus()},[visible,session.id]);
 return <div className="xterm-host" ref={screen} hidden={!visible} data-testid={visible?'powershell-screen':undefined} aria-label={'Interactive '+LABEL[session.kind]}/>;
}

export function StudioConsole({onHide}:{onHide?:()=>void}){
 const set=useStudio(s=>s.set);
 const [enabled,setEnabled]=useState(false),[unlocked,setUnlocked]=useState(false),[accessOpen,setAccessOpen]=useState(false);
 const [accessCode,setAccessCode]=useState(''),[gate,setGate]=useState('Checking terminal access…');
 const [sessions,setSessions]=useState<Session[]>(savedSessions),[current,setCurrent]=useState(()=>sessions[0].id);
 const [states,setStates]=useState<Record<string,{text:string;connected:boolean}>>({});
 const onStatus=useCallback((id:string,text:string,connected:boolean)=>setStates(s=>({...s,[id]:{text,connected}})),[]);
 activeId=current;
 const kind=sessions.find(s=>s.id===current)?.kind||'powershell';
 useEffect(()=>{set({terminalKind:kind})},[kind,set]);
 useEffect(()=>{try{localStorage.setItem('vs-terminal-sessions',JSON.stringify(sessions.map(s=>s.kind)))}catch{/* private mode */}},[sessions]);
 const check=useCallback(async()=>{
  try{
   const r=await fetch('/api/terminal/status'),j=await r.json();
   setEnabled(Boolean(j.enabled));setUnlocked(Boolean(j.authenticated));
   setGate(!j.enabled?'Terminal is disabled — launch with npm run studio':j.authenticated?'Authenticated • Connecting…':'Unlock local PowerShell once to continue');
  }catch(e){setGate('Terminal unavailable: '+(e as Error).message);}
 },[]);
 useEffect(()=>{void check();},[check]);
 const login=async()=>{
  try{
   const r=await fetch('/api/terminal/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:accessCode})});
   const j=await r.json();if(!r.ok)throw Error(j.error||'Invalid access code');
   setAccessOpen(false);setAccessCode('');toast.success('PowerShell unlocked');await check();
  }catch(e){toast.error((e as Error).message)}
 };
 const add=(k:SessionKind)=>{const s=newSession(k);setSessions(list=>[...list,s]);setCurrent(s.id);};
 const close=(id:string)=>{
  const i=sessions.findIndex(s=>s.id===id),next=sessions.filter(s=>s.id!==id);
  if(id===current&&next.length)setCurrent(next[Math.min(i,next.length-1)].id);
  setSessions(next);
 };
 const ready=enabled&&unlocked,state=states[current];
 return <section className="studio-console" aria-label="Integrated terminal">
  <div className="console-header"><div className="console-tabs" role="tablist" aria-label="Terminal sessions">
    {sessions.map(s=><div key={s.id} className={cn('console-tab',s.id===current&&'active')}>
     <button role="tab" aria-selected={s.id===current} onClick={()=>setCurrent(s.id)}><span className={cn('session-dot',s.kind)}/>{LABEL[s.kind]}</button>
     {sessions.length>1&&<button className="console-tab-close" aria-label={'Close '+LABEL[s.kind]+' session'} onClick={()=>close(s.id)}><X size={12}/></button>}
    </div>)}
    <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label="New terminal session" disabled={sessions.length>=MAX_SESSIONS} title={sessions.length>=MAX_SESSIONS?'Up to '+MAX_SESSIONS+' sessions':'New session'}><Plus size={15}/></Button></DropdownMenuTrigger>
     <DropdownMenuContent align="start">{KINDS.map(k=><DropdownMenuItem key={k} onSelect={()=>add(k)}><span><span className={cn('session-dot',k)}/> {LABEL[k]}</span></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
   </div>
   <span className={cn('console-state',ready?(state?.connected?'ok':''):'locked')}>● {!enabled?'disabled':ready?(state?.connected?'connected':'connecting'):'locked'}</span>
   {ready&&<div className="terminal-clipboard-actions"><Button size="sm" variant="ghost" aria-label="Copy selected terminal text" onClick={()=>void copyText()}><Copy size={14}/> Copy</Button><Button size="sm" variant="ghost" aria-label="Paste into terminal" onClick={()=>void pasteText()}><ClipboardPaste size={14}/> Paste</Button></div>}
   {onHide&&<Button size="sm" variant="ghost" className="console-hide" aria-label="Hide terminal panel" title="Hide entire terminal panel (Ctrl+`)" onClick={onHide}>Hide <ChevronDown size={14}/><kbd>Ctrl `</kbd></Button>}
  </div>
  <div className="console-content"><div className="pty-panel">
   <div className="pty-bar"><span className={'terminal-led '+(state?.connected?'green':'')}/><span className="truncate">{ready&&state?state.text:gate}</span>
    {enabled&&!unlocked&&<Button size="sm" variant="secondary" onClick={()=>setAccessOpen(true)}><LockKeyhole size={14}/> Unlock terminal</Button>}
    {!enabled&&<Badge>Safe mode</Badge>}
   </div>
   {ready?sessions.map(s=><SessionScreen key={s.id} session={s} visible={s.id===current} onStatus={onStatus}/>):
   <div className="terminal-placeholder"><TerminalSquare size={29}/><h3>{enabled?'PowerShell requires local permission':'PowerShell disabled'}</h3>
    <p>{enabled?'Enter the access code printed by the Studio launcher. This grants full command-line permissions.':'Start Video Studio with npm run studio (Electron unlocks automatically).'}</p>
    {enabled&&<Button onClick={()=>setAccessOpen(true)}><LockKeyhole size={16}/> Enter access code</Button>}
   </div>}
  </div></div>
  <InsertBar/>
  <Dialog open={accessOpen} onOpenChange={setAccessOpen}><DialogContent>
   <div className="dialog-eyebrow"><LockKeyhole size={17}/> LOCAL TERMINAL SECURITY</div>
   <DialogTitle className="dialog-title">Unlock PowerShell</DialogTitle>
   <DialogDescription>The terminal runs Claude Code, Codex and any command with your Windows account. Enter the access code printed by the Studio launcher. The desktop app unlocks this automatically. Never share this code.</DialogDescription>
   <Input autoFocus type="password" autoComplete="off" value={accessCode} onChange={e=>setAccessCode(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void login()}} placeholder="Access code" aria-label="Terminal access code"/>
   <DialogFooter><Button variant="outline" onClick={()=>setAccessOpen(false)}>Cancel</Button><Button disabled={!accessCode} onClick={()=>void login()}>Unlock terminal</Button></DialogFooter>
  </DialogContent></Dialog>
 </section>;
}
// One terminal panel for the whole app: React keeps it mounted in this detached host and
// whichever <TerminalSlot> is on screen adopts the DOM node, so PTYs and scrollback survive layout changes.
const host=document.createElement('div');
host.className='terminal-host';
export function TerminalPortal({onHide}:{onHide?:()=>void}){return createPortal(<StudioConsole onHide={onHide}/>,host);}
export function TerminalSlot({className}:{className?:string}){
 const slot=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{const el=slot.current!;el.appendChild(host);return ()=>{if(host.parentNode===el)el.removeChild(host)};},[]);
 return <div ref={slot} className={cn('terminal-slot',className)}/>;
}
