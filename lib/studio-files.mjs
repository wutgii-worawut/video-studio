// Project-owned document and media manager with no-overwrite semantics and recoverable trash.
// Only approved paths inside the selected project can be changed.
import { createWriteStream } from 'node:fs';
import { constants } from 'node:fs';
import { mkdir, open, lstat, realpath, readFile, readdir, rename, rm, copyFile, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { extname, join, relative, sep, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { projectName } from './production.mjs';

const MEDIA=new Set(['.png','.jpg','.jpeg','.jpe','.jfif','.webp','.gif','.svg','.avif','.apng','.bmp','.ico','.tif','.tiff','.heic','.heif','.mp3','.wav','.ogg','.m4a','.mp4','.webm']);
const DOCS=new Set(['.md','.txt','.csv','.srt','.vtt','.json','.pdf','.docx','.xlsx','.pptx']);
const ALLOWED=new Set(['assets','brand','brand-sfx','documents','brand-docs']);
const LIMIT=100*1024*1024;
export function managedFilename(value,{document=false}={}){
  if(typeof value!=='string'||value.length===0||value.length>180||value==='.'||value==='..'||
      value.startsWith('.')||value.endsWith(' ')||value.endsWith('.')||
      /[/\\\x00-\x1F:*?"<>|]/.test(value)||
      /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i.test(value))throw Error('Invalid managed filename');
  const ext=extname(value).toLowerCase();
  if(!(document?DOCS:MEDIA).has(ext))throw Error('Unsupported document/media file type');
  if(document && value.toLowerCase()==='brand.md')throw Error('brand.md is a protected project control file');
  return value;
}
function rootPath(root,project,location){
  projectName(project);
  if(!ALLOWED.has(location))throw Error('Invalid managed location');
  const base=join(root,'projects',project);
  if(location==='assets')return join(base,'source','img');
  if(location==='brand-sfx')return join(base,'brand','sfx');
  if(location==='brand'||location==='brand-docs')return join(base,'brand');
  return join(base,'docs');
}
function validateFolder(folder=''){
  if(typeof folder!=='string'||folder.length>300)throw Error('Invalid folder');
  const parts=folder?folder.split('/'):[];
  if(parts.length>8||parts.some(p=>!p||p==='.'||p==='..'||p.startsWith('.')||
    /[/\\\x00-\x1f:*?"<>|]/.test(p)))throw Error('Invalid folder');
  return parts;
}
export async function managedDestination(root,params,{create=false}={}){
  const {project,location,name,folder=''}=params;
  const doc=location==='documents'||location==='brand-docs';
  const filename=managedFilename(name,{document:doc});
  const base=rootPath(root,project,location);
  const parts=validateFolder(folder);
  if(create && parts.length)throw Error('Uploads must use the selected destination root');
  // The project must already exist. Never allow an upload to silently create
  // a new project or follow a linked project/asset directory outside the workspace.
  const projectsDir=await realpath(join(root,'projects'));
  const projectDir=join(projectsDir,project);
  const projectStat=await lstat(projectDir);
  if(!projectStat.isDirectory()||projectStat.isSymbolicLink())
    throw Error('Project must be a real directory');
  const partsFromProject=relative(projectDir,base).split(sep).filter(Boolean);
  if(partsFromProject.some(part=>part==='..'))throw Error('Path escapes project');
  let current=projectDir;
  for(const part of partsFromProject){
    current=join(current,part);
    if(create){
      try{await mkdir(current)}
      catch(e){if(e.code!=='EEXIST')throw e}
    }
    const entry=await lstat(current);
    if(!entry.isDirectory()||entry.isSymbolicLink())
      throw Error('Linked or non-directory asset folders are forbidden');
  }
  // Only the validated project-owned path may be read or written.
  const actualBase=await realpath(base);
  const dir=join(base,...parts);
  const actualDir=await realpath(dir);
  const rel=relative(actualBase,actualDir);
  if(rel==='..'||rel.startsWith('..'+sep)||rel.includes('..'+sep))throw Error('Path escapes project');
  const path=join(actualDir,filename);
  if(await lstat(path).then(s=>s.isSymbolicLink()).catch(e=>e.code==='ENOENT'?false:Promise.reject(e)))
    throw Error('Symlink targets are not managed by Studio');
  return {path,dir:actualDir,filename,location,folder,project,document:doc};
}
function validMagic(ext,magic,fullData){
  if(ext==='.png'||ext==='.apng')return magic.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(ext==='.bmp')return magic.toString('ascii',0,2)==='BM';
  if(ext==='.ico')return magic.subarray(0,4).equals(Buffer.from([0,0,1,0]));
  if(ext==='.tif'||ext==='.tiff')return magic.subarray(0,4).equals(Buffer.from([73,73,42,0]))||magic.subarray(0,4).equals(Buffer.from([77,77,0,42]));
  if(ext==='.avif')return magic.toString('ascii',4,8)==='ftyp'&&['avif','avis','mif1'].includes(magic.toString('ascii',8,12));
  if(ext==='.heic'||ext==='.heif')return magic.toString('ascii',4,8)==='ftyp'&&['heic','heix','hevc','heim','heis','mif1','msf1'].includes(magic.toString('ascii',8,12));
  if(['.jpg','.jpeg','.jpe','.jfif'].includes(ext))return magic[0]===255&&magic[1]===216;
  if(ext==='.gif')return magic.toString('ascii',0,3)==='GIF';
  if(ext==='.webp')return magic.toString('ascii',0,4)==='RIFF'&&magic.toString('ascii',8,12)==='WEBP';
  if(ext==='.wav')return magic.toString('ascii',0,4)==='RIFF'&&magic.toString('ascii',8,12)==='WAVE';
  if(ext==='.ogg')return magic.toString('ascii',0,4)==='OggS';
  if(ext==='.mp3')return magic.toString('ascii',0,3)==='ID3'||magic[0]===255&&(magic[1]&224)===224;
  if(ext==='.mp4'||ext==='.m4a')return magic.toString('ascii',4,8)==='ftyp';
  if(ext==='.webm')return magic.subarray(0,4).equals(Buffer.from([26,69,223,163]));
  if(ext==='.pdf')return magic.toString('ascii',0,5)==='%PDF-';
  if(['.docx','.xlsx','.pptx'].includes(ext))return magic[0]===0x50&&magic[1]===0x4b;
  return true; // simple text formats are decoded below.
}
export async function uploadManaged(req,root,params){
  const dest=await managedDestination(root,params,{create:true});
  const stage=join(dest.dir,'.studio-upload-'+randomUUID()+'.tmp');
  let size=0;
  try{
    async function* bounded(){
      for await(const chunk of req){
        size+=chunk.length;
        if(size>LIMIT)throw Error('File exceeds the 100 MB upload limit');
        yield chunk;
      }
    }
    await pipeline(bounded(),createWriteStream(stage,{flags:'wx'}));
    if(!size)throw Error('Empty upload');
    const fh=await open(stage,'r'),magic=Buffer.alloc(16);
    try{await fh.read(magic,0,16,0)}finally{await fh.close()}
    const ext=extname(dest.filename).toLowerCase();
    if(!validMagic(ext,magic))throw Error('File content does not match extension');
    if(ext==='.svg'){
      if(size>5*1024*1024)throw Error('SVG image exceeds 5 MB limit');
      const svg=await readFile(stage,'utf8');
      if(!/<svg(?:\s|>)/i.test(svg)||/<(?:script|foreignObject|iframe|object|embed)\b/i.test(svg)||
       /\bon[a-z]+\s*=/i.test(svg)||/\b(?:href|src)\s*=\s*['"]\s*(?!#|data:image\/(?:png|jpeg|jpg|webp|gif);base64,)/i.test(svg)||
       /<!DOCTYPE|<!ENTITY|@import|url\s*\(\s*['"]?\s*(?!#)/i.test(svg))throw Error('Potentially unsafe SVG content');
    }
    if(['.md','.txt','.csv','.srt','.vtt','.json'].includes(ext)){
      if(size>5*1024*1024)throw Error('Text document exceeds 5 MB limit');
      const data=await readFile(stage);
      if(data.includes(0))throw Error('Text document cannot contain NUL bytes');
      new TextDecoder('utf-8',{fatal:true}).decode(data);
      if(ext==='.json')JSON.parse(data.toString('utf8'));
    }
    await copyFile(stage,dest.path,constants.COPYFILE_EXCL);
    return {ok:true,name:dest.filename,location:dest.location,size};
  }finally{await rm(stage,{force:true}).catch(()=>{})}
}
async function checkedExisting(root,params){
  const dest=await managedDestination(root,params);
  const stats=await lstat(dest.path);
  if(!stats.isFile()||stats.isSymbolicLink())throw Error('Not a regular managed file');
  return {...dest,size:stats.size};
}
function nameOfCopy(name,index){
  const ext=extname(name),base=name.slice(0,-ext.length);
  return base+'-copy'+(index>1?'-'+index:'')+ext;
}
export async function operateManaged(root,params){
  const {action,project,location,folder='',name}=params;
  if(!['rename','duplicate','delete'].includes(action))throw Error('Unknown managed file action');
  const src=await checkedExisting(root,{project,location,folder,name});
  if(action==='duplicate'){
    for(let i=1;i<=100;i++){
      const next=nameOfCopy(name,i);
      managedFilename(next,{document:src.document});
      try{
        const target=await managedDestination(root,{project,location,folder,name:next});
        await copyFile(src.path,target.path,constants.COPYFILE_EXCL);
        return {ok:true,action,original:name,name:next};
      }catch(err){if(err.code!=='EEXIST')throw err;}
    }
    throw Error('Too many copies');
  }
  if(action==='rename'){
    const next=params.newName;
    managedFilename(next,{document:src.document});
    if(extname(name).toLowerCase()!==extname(next).toLowerCase())throw Error('Renaming cannot change the extension');
    if(next===name)return {ok:true,action,name};
    const target=await managedDestination(root,{project,location,folder,name:next});
    // Copy exclusive first, then remove original, so no data is lost if copying fails.
    await copyFile(src.path,target.path,constants.COPYFILE_EXCL);
    try{await rm(src.path)}catch(err){
      await rm(target.path,{force:true}).catch(()=>{});throw err;
    }
    return {ok:true,action,oldName:name,name:next};
  }
  const trash=join(root,'projects',project,'.studio-trash');
  await mkdir(trash,{recursive:true});
  const id=randomUUID(),body=join(trash,id+'.data'),meta=join(trash,id+'.json');
  const info={id,project,location,folder,name,size:src.size,deletedAt:new Date().toISOString()};
  await writeFile(meta,JSON.stringify(info,null,2)+'\n',{flag:'wx'});
  try{await rename(src.path,body);}
  catch(err){await rm(meta,{force:true}).catch(()=>{});throw err;}
  return {ok:true,action,trashId:id,name,restorable:true};
}
function trashId(id){
  if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw Error('Invalid trash ID');
  return id;
}
export async function listTrash(root,project){
  projectName(project);
  const folder=join(root,'projects',project,'.studio-trash');
  const names=await readdir(folder).catch(e=>e.code==='ENOENT'?[]:Promise.reject(e));
  const items=[];
  for(const name of names.filter(n=>n.endsWith('.json')).slice(0,300)){
    try {
      const data=JSON.parse(await readFile(join(folder,name),'utf8'));
      if(data.project!==project||trashId(data.id)+'.json'!==name)continue;
      if(!(await lstat(join(folder,data.id+'.data')).catch(()=>null))?.isFile())continue;
      items.push(data);
    }catch{}
  }
  return {project,items:items.sort((a,b)=>b.deletedAt.localeCompare(a.deletedAt))};
}
export async function restoreManaged(root,{project,id}){
  projectName(project);trashId(id);
  const trash=join(root,'projects',project,'.studio-trash');
  const meta=join(trash,id+'.json'),body=join(trash,id+'.data');
  const data=JSON.parse(await readFile(meta,'utf8'));
  if(data.project!==project||data.id!==id)throw Error('Trash ownership mismatch');
  const dest=await managedDestination(root,data,{create:false});
  await copyFile(body,dest.path,constants.COPYFILE_EXCL);
  await rm(body);await rm(meta);
  return {ok:true,name:data.name,location:data.location,folder:data.folder};
}
