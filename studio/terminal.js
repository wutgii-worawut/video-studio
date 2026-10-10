import {Terminal} from '/vendor/xterm.mjs';
import {FitAddon} from '/vendor/addon-fit.mjs';

const $=id=>document.getElementById(id);
let socket=null,terminal=null,fit=null,ready=false,activeProject=null;
const message=t=>$('terminal-message').textContent=t;
const shell=$('powershell-pane');
function cleanup(){
  if(socket){const prev=socket;socket=null;prev.close();}
  if(terminal){terminal.dispose();terminal=null;fit=null;}
  $('pty-screen').replaceChildren();
}
function send(obj){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(obj));}
function terminalResize(){
  if(!fit||!terminal)return;
  try{
    fit.fit();
    send({type:'resize',cols:terminal.cols,rows:terminal.rows});
  }catch{}
}
const observer=new ResizeObserver(()=>terminalResize());
observer.observe($('pty-screen'));
function displayTaskMode(){
  document.querySelector('.task-console').classList.remove('terminal-mode');
  $('mode-tasks').classList.add('selected');
  $('mode-powershell').classList.remove('selected');
}
async function displayPowerShell(){
  document.querySelector('.task-console').classList.add('terminal-mode');
  document.querySelector('.task-console').classList.remove('collapsed');
  $('mode-tasks').classList.remove('selected');
  $('mode-powershell').classList.add('selected');
  $('terminal-login').hidden=true;
  message('Checking secure terminal status…');
  let status;
  try{
    const res=await fetch('/api/terminal/status');
    status=await res.json();
    if(!res.ok)throw Error(status.error||'Unable to check terminal');
  }catch(e){message('Terminal unavailable: '+e.message);return;}
  if(!status.enabled){
    message('PowerShell is disabled. Restart Studio with: npm run studio:terminal');
    return;
  }
  if(!status.authenticated){
    $('terminal-login').hidden=false;
    message('Enter the one-time terminal access code shown when Studio starts.');
    return;
  }
  $('terminal-login').hidden=true;
  if(socket?.readyState===WebSocket.OPEN&&activeProject===$('project').value){terminal?.focus();return;}
  connect();
}
function connect(){
  cleanup();
  const project=$('project').value;
  if(!project){message('Select a project first.');return;}
  activeProject=project;
  terminal=new Terminal({
    cursorBlink:true,scrollback:5000,fontFamily:'Cascadia Mono, Consolas, monospace',
    fontSize:12,theme:{background:'#0b101a',foreground:'#dae8f4',cursor:'#97acff'},
    convertEol:false,allowTransparency:false,
  });
  fit=new FitAddon();terminal.loadAddon(fit);terminal.open($('pty-screen'));
  setTimeout(terminalResize,30);
  terminal.onData(data=>send({type:'input',data}));
  const schema=location.protocol==='https:'?'wss:':'ws:';
  const ws=new WebSocket(schema+'//'+location.host+'/api/terminal/ws?project='+encodeURIComponent(project));
  socket=ws;
  message('Connecting to PowerShell in projects/'+project+'…');
  ws.addEventListener('open',()=>{
    message('Connected · PowerShell has full access to your local user account.');
    terminalResize();terminal.focus();
  });
  ws.addEventListener('message',e=>{
    if(socket!==ws)return;
    let m;try{m=JSON.parse(e.data)}catch{return;}
    if(m.type==='data')terminal?.write(m.data);
    else if(m.type==='error'){message('Terminal error: '+m.message);terminal?.writeln('\r\n'+m.message);}
    else if(m.type==='exit')message('PowerShell exited ('+m.exitCode+'). Select the PowerShell tab to reconnect.');
  });
  ws.addEventListener('close',()=>{
    if(socket!==ws)return;
    socket=null;
    message('PowerShell disconnected · Click PowerShell tab to reconnect.');
  });
  ws.addEventListener('error',()=>message('Terminal WebSocket error: check local access code/server logs.'));
}
$('mode-tasks').addEventListener('click',displayTaskMode);
$('mode-powershell').addEventListener('click',displayPowerShell);
$('terminal-auth-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const token=$('terminal-access-code').value;
  if(!token)return;
  try{
    const res=await fetch('/api/terminal/login',{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
    const data=await res.json();
    if(!res.ok)throw Error(data.error||'Access denied');
    $('terminal-access-code').value='';
    await displayPowerShell();
  }catch(err){message('Cannot unlock PowerShell: '+err.message);}
});
$('project').addEventListener('change',()=>{
  if(socket){cleanup();message('Project changed. Reconnect to start PowerShell in the new project.');}
  if(document.querySelector('.task-console').classList.contains('terminal-mode'))displayPowerShell();
});
$('toggle-console').addEventListener('click',()=>setTimeout(terminalResize,50));
window.StudioTerminal={connect,cleanup,displayPowerShell};

// The default Studio launcher now explicitly enables the local PowerShell feature.
// Show the real terminal as the primary bottom panel, with first-use unlock if needed.
fetch('/api/terminal/status').then(r=>r.json()).then(status=>{
  if(status.enabled)displayPowerShell();
}).catch(()=>{});
