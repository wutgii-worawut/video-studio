import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import { createStudioServer } from '../studio.mjs';

// End-to-end smoke: integrated project console produces a real MP4.
test('Studio task console renders composition-demo MP4 and records publish log', {timeout:45000},async()=>{
 const server=createStudioServer();
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 try {
   const started=await fetch(base+'/api/studio/task',{method:'POST',
     headers:{'Content-Type':'application/json',Origin:base},
     body:JSON.stringify({project:'composition-demo',command:'render 1 2'})});
   assert.equal(started.status,202);
   const {id}=await started.json();assert.ok(id);
   const deadline=Date.now()+30000;
   let job;
   while(Date.now()<deadline){
     const resp=await fetch(base+'/api/studio/task?id='+id);
     job=await resp.json();
     if(job?.status!=='running')break;
     await new Promise(resolve=>setTimeout(resolve,200));
   }
   assert.equal(job?.status,'complete',job?.output?.slice(-4000));
   assert.match(job?.output||'',/PUBLISHED .*composition-demo\.mp4/);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
