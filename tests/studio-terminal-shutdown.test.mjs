import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {WebSocket} from 'ws';
import {attachLocalTerminal} from '../lib/studio-terminal.mjs';

test('PTY exit closes socket without calling kill on an already-exited console',{timeout:7500},async()=>{
 const require=createRequire(import.meta.url);
 const modulePath=require.resolve('node-pty');
 const old=require.cache[modulePath];
 let kills=0,disposed=0;
 require.cache[modulePath]={id:modulePath,filename:modulePath,loaded:true,exports:{
  spawn(){return {
   onData(){return {dispose(){disposed++}}},
   onExit(callback){setTimeout(()=>callback({exitCode:0}),45)},
   write(){},resize(){},kill(){kills++}
  }}
 }};
 let api;
 const server=createServer((req,res)=>{
  if(req.url==='/login'&&req.method==='POST')return api.authenticate(req,res,(res,value,status=200)=>{
   res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));
  });
  res.writeHead(404);res.end();
 });
 api=attachLocalTerminal(server,{root:process.cwd(),enabled:true});
 let ws;
 try{
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const host='127.0.0.1:'+server.address().port,origin='http://'+host;
  const login=await fetch(origin+'/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token:api.secret})});
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  ws=new WebSocket('ws://'+host+'/api/terminal/ws?project=composition-demo',{headers:{Origin:origin,Host:host,Cookie:cookie}});
  await once(ws,'open');
  await once(ws,'close');
  assert.equal(kills,0,'Do not ask node-pty to kill a console after onExit');
  assert.equal(disposed,1,'Dispose PTY output listener once');
 }finally{
  ws?.terminate();
  api.shutdown();
  server.closeAllConnections();
  await new Promise(r=>server.close(r));
  if(old)require.cache[modulePath]=old;else delete require.cache[modulePath];
 }
});
