import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {trashProject,listDeletedProjects,restoreProject} from '../lib/studio-project-trash.mjs';
test('project trash move and restore does not lose media',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-trash-'));
 try{
  await mkdir(join(root,'projects','test-project','source'),{recursive:true});
  await writeFile(join(root,'projects','test-project','source','index.html'),'sample project');
  const archived=await trashProject(root,'test-project');
  await assert.rejects(stat(join(root,'projects','test-project')));
  assert.equal((await listDeletedProjects(root)).items[0].id,archived.id);
  await mkdir(join(root,'projects','test-project'));
  await assert.rejects(restoreProject(root,archived.id),/already exists/);
  await rm(join(root,'projects','test-project'),{recursive:true,force:true});
  await restoreProject(root,archived.id);
  assert.equal(await readFile(join(root,'projects','test-project','source','index.html'),'utf8'),'sample project');
  assert.equal((await listDeletedProjects(root)).items.length,0);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('project trash rejects active project and invalid names',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-lock-'));
 try{
  await mkdir(join(root,'projects','demo-project'),{recursive:true});
  await assert.rejects(trashProject(root,'demo-project',{active:{project:'demo-project',status:'running'}}));
  await assert.rejects(trashProject(root,'../other'));
 }finally{await rm(root,{recursive:true,force:true})}
});
