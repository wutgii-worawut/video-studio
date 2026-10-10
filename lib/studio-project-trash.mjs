import {readdir,mkdir,lstat,realpath,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {projectName} from './production.mjs';
import {isProcessAlive} from './recovery.mjs';
const folder=(root)=>join(root,'.studio-project-trash');
async function exists(path){return lstat(path).catch(e=>{if(e.code==='ENOENT')return null;throw e});}
export async function trashProject(root,name,{active}={}){
 projectName(name);
 if(active?.status==='running'&&active?.project===name)throw Error('This project has a running Studio task; stop it first');
 const base=await realpath(join(root,'projects'));
 const source=join(base,name),details=await lstat(source);
 if(!details.isDirectory()||details.isSymbolicLink())throw Error('Only regular project directories can be archived');
 const sourceReal=await realpath(source);
 if(sourceReal!==source)throw Error('Project path is not safe to move');
 const lock=join(source,'output','.'+name+'.render.lock');
 const raw=await readFile(lock,'utf8').catch(e=>e.code==='ENOENT'?null:Promise.reject(e));
 if(raw){try{const data=JSON.parse(raw);if(isProcessAlive(data.pid))throw Error('Project currently rendering; finish render before deleting');}catch(e){if(e.message.startsWith('Project currently'))throw e;}}
 const trash=folder(root);await mkdir(trash,{recursive:true});
 const id=randomUUID(),archive=join(trash,id),meta=join(trash,id+'.json');
 await rename(source,archive);
 try{await writeFile(meta,JSON.stringify({id,name,deletedAt:new Date().toISOString()})+'\n',{flag:'wx'})}
 catch(e){await rename(archive,source);throw e}
 return {ok:true,id,name};
}
export async function listDeletedProjects(root){
 const trash=folder(root);
 const files=await readdir(trash).catch(e=>e.code==='ENOENT'?[]:Promise.reject(e));
 const entries=[];
 for(const f of files){if(!/^[0-9a-f-]{36}\.json$/.test(f))continue;
  try{const info=JSON.parse(await readFile(join(trash,f),'utf8'));projectName(info.name);
   if((await lstat(join(trash,info.id))).isDirectory())entries.push(info);
  }catch{}
 }
 return {items:entries.sort((a,b)=>b.deletedAt.localeCompare(a.deletedAt))};
}
export async function restoreProject(root,id){
 if(typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id))throw Error('Invalid archived project id');
 const trash=folder(root),meta=join(trash,id+'.json'),info=JSON.parse(await readFile(meta,'utf8'));
 if(info.id!==id)throw Error('Mismatched project archive');
 projectName(info.name);
 const base=await realpath(join(root,'projects')),destination=join(base,info.name);
 if(await exists(destination))throw Error('Project name already exists; cannot overwrite on restore');
 const source=join(trash,id);
 const item=await lstat(source);
 if(!item.isDirectory()||item.isSymbolicLink())throw Error('Invalid project archive');
 await rename(source,destination);
 await rm(meta,{force:true});
 return {ok:true,name:info.name};
}
