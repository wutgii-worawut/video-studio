import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,lstat,symlink,writeFile,rm,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {managedDestination} from '../lib/studio-files.mjs';
import {projectTemplate} from '../lib/studio-projects.mjs';
import {workspaceEntries,workspaceMediaFile,readWorkspaceText,within} from '../lib/studio-workspace.mjs';

async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'vs-path-audit-'));
 const project=join(root,'projects','valid');
 await mkdir(join(project,'source','img'),{recursive:true});
 await mkdir(join(project,'brand'),{recursive:true});
 await mkdir(join(project,'docs'),{recursive:true});
 await mkdir(join(root,'outside'),{recursive:true});
 await writeFile(join(project,'source','index.html'),'<!doctype html><title>Valid</title>');
 await writeFile(join(root,'outside','leak.html'),'<p>outside</p>');
 return {root,project,outside:join(root,'outside')};
}
test('Path boundary helper rejects cross-drive Windows targets and parent paths',()=>{
 assert.equal(within('C:\\workspace','D:\\outside'),false);
 assert.equal(within('C:\\workspace','C:\\workspace\\..\\outside'),false);
 assert.equal(within('C:\\workspace','C:\\workspace\\images\\logo.png'),true);
});
test('Managed media upload cannot create an unknown project',async()=>{
 const {root}=await fixture();
 try{
  await assert.rejects(managedDestination(root,{project:'ghost',location:'assets',name:'new.png'},{create:true}),/ENOENT|Project must/);
  await assert.rejects(lstat(join(root,'projects','ghost')),{code:'ENOENT'});
  const regular=await managedDestination(root,{project:'valid',location:'assets',name:'new.png'},{create:true});
  assert.equal(regular.filename,'new.png');
 }finally{await rm(root,{force:true,recursive:true})}
});
test('Managed media and file explorer reject linked project and asset folders',async()=>{
 const {root,project,outside}=await fixture();
 try{
  await symlink(outside,join(root,'projects','linked'),'junction');
  await assert.rejects(managedDestination(root,{project:'linked',location:'assets',name:'unsafe.png'},{create:true}),/real directory/);
  await assert.rejects(workspaceEntries(root,'linked','source'),/symlink/);
  await rm(join(project,'source','img'),{recursive:true});
  await symlink(outside,join(project,'source','img'),'junction');
  await assert.rejects(managedDestination(root,{project:'valid',location:'assets',name:'unsafe.png'},{create:true}),/Linked/);
  await assert.rejects(workspaceMediaFile(root,'valid','assets','0/img/leak.html'),/outside|symlink|Not allowed/);
  await rm(join(project,'brand'),{recursive:true});
  await symlink(outside,join(project,'brand'),'junction');
  const listing=await workspaceEntries(root,'valid','brand');
  assert.equal(listing.entries.length,0);
  await assert.rejects(readWorkspaceText(root,'valid','brand','0/leak.html'),/real directory/);
  assert.equal((await lstat(join(outside,'leak.html'))).isFile(),true);
 }finally{await rm(root,{force:true,recursive:true})}
});
test('HTTP static project files cannot follow directory links outside the project',async()=>{
 const {root,project,outside}=await fixture();
 let server;
 try{
  await symlink(outside,join(project,'source','external'),'junction');
  const prior=process.env.VIDEO_STUDIO_ROOT;
  process.env.VIDEO_STUDIO_ROOT=root;
  let create;
  try{({createStudioServer:create}=await import('../studio.mjs?path-audit='+randomUUID()))}
  finally{if(prior===undefined)delete process.env.VIDEO_STUDIO_ROOT;else process.env.VIDEO_STUDIO_ROOT=prior;}
  server=create();
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const url='http://127.0.0.1:'+server.address().port;
  const valid=await fetch(url+'/projects/valid/source/index.html');
  assert.equal(valid.status,200);
  const blocked=await fetch(url+'/projects/valid/source/external/leak.html');
  assert.notEqual(blocked.status,200,'linked static source must not serve outside files');
  const denied=await fetch(url+'/api/studio/text?project=valid&group=source&path=0/external/leak.html');
  assert.notEqual(denied.status,200);
  await writeFile(join(outside,'index.html'),'<p>disallowed index</p>');
  await rename(join(project,'source'),join(project,'source-backup'));
  await symlink(outside,join(project,'source'),'junction');
  const preview=await fetch(url+'/api/studio/preview/valid?render');
  assert.notEqual(preview.status,200,'project preview must not follow a linked source root');
 }finally{
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  await rm(root,{force:true,recursive:true});
 }
});

test('Two Source and Composition writes with the same ETag cannot both succeed',async()=>{
 const {root,project}=await fixture();
 let server;
 try{
  const comp=projectTemplate({name:'valid',duration:6,template:'starter'}).composition;
  await writeFile(join(project,'source','composition.json'),JSON.stringify(comp));
  await writeFile(join(project,'source','composition-data.js'),'window.VIDEO_COMPOSITION='+JSON.stringify(comp)+';');
  const oldEnv=process.env.VIDEO_STUDIO_ROOT;
  process.env.VIDEO_STUDIO_ROOT=root;
  let create;
  try{({createStudioServer:create}=await import('../studio.mjs?write-lock='+randomUUID()))}
  finally{if(oldEnv===undefined)delete process.env.VIDEO_STUDIO_ROOT;else process.env.VIDEO_STUDIO_ROOT=oldEnv;}
  server=create();
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const url='http://127.0.0.1:'+server.address().port;
  const sourcePath='/api/studio/source?project=valid&group=source&path=0/index.html';
  const sourceGet=await fetch(url+sourcePath);
  const sourceEtag=sourceGet.headers.get('etag');
  const putSource=text=>fetch(url+sourcePath,{method:'PUT',headers:{Origin:url,'If-Match':sourceEtag,'Content-Type':'text/plain'},body:text});
  const sourceResult=await Promise.all([putSource('<!doctype html><title>A</title>'),putSource('<!doctype html><title>B</title>')]);
  assert.deepEqual(sourceResult.map(r=>r.status).sort(),[200,412],'one source save must lose stale ETag');
  const compositionPath='/api/compositions/valid';
  const compGet=await fetch(url+compositionPath),tag=compGet.headers.get('etag');
  const saved=await compGet.json();
  const updates=['A','B'].map(letter=>{
    const data=structuredClone(saved);
    data.clips[0].props.subtitle='Writer '+letter;
    return fetch(url+compositionPath,{method:'PUT',
      headers:{Origin:url,'If-Match':tag,'Content-Type':'application/json'},
      body:JSON.stringify(data)});
  });
  const compResult=await Promise.all(updates);
  assert.deepEqual(compResult.map(r=>r.status).sort(),[200,412],'one composition save must lose stale ETag');
 }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await rm(root,{recursive:true,force:true});}
});

test('Composition API refuses symlinked source directories before returning or saving data',async()=>{
 const {root,project,outside}=await fixture();
 let server;
 try{
  const composition=projectTemplate({name:'valid',duration:6}).composition;
  await writeFile(join(outside,'composition.json'),JSON.stringify(composition));
  await rename(join(project,'source'),join(project,'original-source'));
  await symlink(outside,join(project,'source'),'junction');
  const prior=process.env.VIDEO_STUDIO_ROOT;
  process.env.VIDEO_STUDIO_ROOT=root;
  let create;
  try{({createStudioServer:create}=await import('../studio.mjs?comp-symlink='+randomUUID()))}
  finally{if(prior===undefined)delete process.env.VIDEO_STUDIO_ROOT;else process.env.VIDEO_STUDIO_ROOT=prior;}
  server=create();server.listen(0,'127.0.0.1');await once(server,'listening');
  const url='http://127.0.0.1:'+server.address().port;
  const get=await fetch(url+'/api/compositions/valid');
  assert.notEqual(get.status,200);
  const before=await import('node:fs/promises').then(m=>m.readFile(join(outside,'composition.json'),'utf8'));
  const update=await fetch(url+'/api/compositions/valid',{
    method:'PUT',headers:{Origin:url,'If-Match':'"'+randomUUID()+'"','Content-Type':'application/json'},
    body:JSON.stringify(composition)});
  assert.notEqual(update.status,200);
  const after=await import('node:fs/promises').then(m=>m.readFile(join(outside,'composition.json'),'utf8'));
  assert.equal(after,before,'outside composition must not be touched');
 }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await rm(root,{recursive:true,force:true});}
});
