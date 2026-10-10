// Explicit opt-in, token-authenticated local PowerShell ConPTY via WebSocket.
// This grants arbitrary command execution on the user's PC: never expose it publicly.
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {WebSocketServer} from 'ws';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {projectName} from './production.mjs';

function equals(a,b){
 const x=Buffer.from(String(a)),y=Buffer.from(String(b));
 return x.length===y.length&&timingSafeEqual(x,y);
}
// RemoteSigned applies to this PowerShell PROCESS only, not to CurrentUser,
// LocalMachine or a domain-enforced execution policy. Never persist Bypass.
// A terminal tab may start one of these CLIs inside its PowerShell (-NoExit keeps the shell when it quits).
// Only these exact names are accepted, never client-supplied command text.
export const SESSION_COMMANDS=['claude','codex'];
export function terminalLaunchArgs(command){
 const start=SESSION_COMMANDS.includes(command)?'; '+command:'';
 return ['-NoLogo','-NoProfile','-ExecutionPolicy','RemoteSigned','-NoExit',
   '-Command',"try { Import-Module PSReadLine -ErrorAction Stop } catch { Write-Warning 'PSReadLine could not load; check Get-ExecutionPolicy -List for enforced policies' }"+start];
}
const MAX_SESSIONS=6; // one WebSocket = one PTY = one terminal tab
export function terminalExecutable(){
 if(process.platform!=='win32')return 'pwsh';
 const probe=spawnSync('where.exe',['pwsh.exe'],{windowsHide:true,timeout:2500,encoding:'utf8'});
 return probe.status===0?'pwsh.exe':'powershell.exe';
}
export function attachLocalTerminal(server,{root,enabled=false}={}){
 const password=randomBytes(24).toString('base64url');
 const session=randomBytes(30).toString('base64url');
 const sockets=new Set();
 const wsServer=new WebSocketServer({noServer:true,maxPayload:64*1024,perMessageDeflate:false});
 function localHost(req){
  const host=req.headers.host||'';
  return /^((127\.0\.0\.1)|(localhost)):\d{2,5}$/.test(host);
 }
 function authorized(req){
  const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('vs_terminal='));
  return enabled&&localHost(req)&&cookie&&equals(cookie.slice('vs_terminal='.length),session);
 }
 function originOK(req){
  return localHost(req)&&req.headers.origin==='http://'+req.headers.host;
 }
 async function readBody(req){
  let text='';
  for await(const c of req){text+=c.toString();if(text.length>4000)throw Error('Too large');}
  return JSON.parse(text);
 }
 const api={
  status(req,res,send){return send(res,{enabled,authenticated:Boolean(authorized(req))});},
  async authenticate(req,res,send){
   if(!enabled)return send(res,{error:'Terminal is disabled; run npm run studio:terminal'},403);
   if(!originOK(req))return send(res,{error:'Local origin required'},403);
   let input;try{input=await readBody(req)}catch{return send(res,{error:'Bad request'},400)}
   if(!equals(input.token||'',password))return send(res,{error:'Invalid terminal access code'},403);
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store',
     'Set-Cookie':'vs_terminal='+session+'; HttpOnly; SameSite=Strict; Path=/api/terminal'});
   res.end(JSON.stringify({ok:true}));
  },
  shutdown(){for(const socket of sockets)socket.close();wsServer.close();},
  secret:enabled?password:null,
 };
 server.on('upgrade',(req,socket,head)=>{
  let path;
  try{path=new URL(req.url,'http://localhost').pathname;}catch{socket.destroy();return;}
  if(path!=='/api/terminal/ws'){socket.destroy();return;}
  if(!originOK(req)||!authorized(req)){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
  if(sockets.size>=MAX_SESSIONS){socket.write('HTTP/1.1 429 Too Many Sessions\r\n\r\n');socket.destroy();return;}
  wsServer.handleUpgrade(req,socket,head,ws=>wsServer.emit('connection',ws,req));
 });
 wsServer.on('connection',(ws,req)=>{
  sockets.add(ws);
  let term;
  let exited=false;
  try{
   const params=new URL(req.url,'http://localhost').searchParams,project=params.get('project');
   projectName(project);
   const pty=createRequire(import.meta.url)('node-pty');
   // Use PowerShell; ConPTY is required for readline, cursor movement and Claude/Codex TUI.
   term=pty.spawn(terminalExecutable(),terminalLaunchArgs(params.get('cmd')),{
      cwd:join(root,'projects',project),cols:105,rows:28,
      name:'xterm-256color',env:{...process.env,TERM:'xterm-256color'},
   });
   const output=term.onData(data=>{if(ws.readyState===1)ws.send(JSON.stringify({type:'data',data}));});
   term.onExit(({exitCode})=>{
     // The WebSocket close handler runs after this. Killing a PTY that has
     // already exited invokes node-pty's ConPTY process-list helper against
     // a dead PID, emitting the noisy "AttachConsole failed" diagnostic.
     exited=true;
     output.dispose();
     if(ws.readyState===1)ws.send(JSON.stringify({type:'exit',exitCode}));
     ws.close();
   });
   ws.on('message',raw=>{
    let message;try{message=JSON.parse(String(raw))}catch{return;}
    if(message.type==='input'&&typeof message.data==='string'&&message.data.length<=16000)term.write(message.data);
    if(message.type==='resize'&&Number.isInteger(message.cols)&&Number.isInteger(message.rows))
      term.resize(Math.max(30,Math.min(300,message.cols)),Math.max(10,Math.min(100,message.rows)));
   });
  }catch(error){
   if(ws.readyState===1)ws.send(JSON.stringify({type:'error',message:error.message}));
   ws.close();
  }
  ws.on('close',()=>{
   sockets.delete(ws);
   // Don't kill a PTY whose onExit already fired: node-pty's ConPTY helper
   // emits AttachConsole failed when asked to inspect an exited process.
   if(term&&!exited){try{term.kill()}catch{}}
  });
 });
 return api;
}
