// Deliberate project-only media mutation endpoints.
// No edits of source code, brand.md, or model binaries.
import { createWriteStream } from 'node:fs';
import { createReadStream } from 'node:fs';
import { mkdir, stat, lstat, realpath, rm, rename, copyFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { extname, join, relative, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { projectName } from './production.mjs';
const MAX_BYTES = 100 * 1024 * 1024;
const EXT = new Set(['.png','.jpg','.jpeg','.webp','.gif','.mp3','.m4a','.wav','.ogg','.mp4','.webm']);
const MIME = new Set(['image','audio','video']);
const locations = new Set(['assets','brand','brand-sfx']);
function destination(root,project,location) {
  projectName(project);
  if(!locations.has(location))throw new Error('Invalid asset destination');
  const base=join(root,'projects',project);
  if(location==='assets')return join(base,'source','img');
  if(location==='brand-sfx')return join(base,'brand','sfx');
  return join(base,'brand');
}
export function assetFilename(name) {
  if(typeof name!=='string'||name.length<1||name.length>180 ||
    name==='.'||name==='..'||name.startsWith('.')||name.endsWith(' ')||name.endsWith('.')||
    /[/\\\x00-\x1F:*?"<>|]/.test(name) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i.test(name))
    throw new Error('Invalid filename');
  if(!EXT.has(extname(name).toLowerCase()))throw new Error('Upload only image, audio, video media files');
  return name;
}
export async function receiveAsset(req,root,{project,location,name}) {
  const filename=assetFilename(name);
  const destDir=destination(root,project,location);
  await mkdir(destDir,{recursive:true});
  const target=join(destDir,filename);
  const temp=join(destDir,'.vs-upload-'+randomUUID()+'.tmp');
  let size=0;
  try {
    async function* limited(){
      for await(const chunk of req){
        size+=chunk.length;
        if(size>MAX_BYTES)throw new Error('Asset exceeds 100MB limit');
        yield chunk;
      }
    }
    await pipeline(limited(),createWriteStream(temp,{flags:'wx'}));
    if(size===0)throw new Error('Empty media file');
    // File content signature check on common image types prevents spoofed HTML/SVG upload.
    const {open}=await import('node:fs/promises');
    const handle=await open(temp,'r');
    let magic=Buffer.alloc(16);
    try { await handle.read(magic,0,16,0); } finally {await handle.close();}
    const ext=extname(filename).toLowerCase();
    const signature = (ext==='.png' ? magic.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
      (ext==='.jpg'||ext==='.jpeg') ? magic[0]===255&&magic[1]===216 :
      ext==='.gif' ? magic.toString('ascii',0,3)==='GIF' :
      ext==='.webp' ? magic.toString('ascii',0,4)==='RIFF'&&magic.toString('ascii',8,12)==='WEBP' :
      ext==='.wav' ? magic.toString('ascii',0,4)==='RIFF'&&magic.toString('ascii',8,12)==='WAVE' :
      ext==='.ogg' ? magic.toString('ascii',0,4)==='OggS' :
      ext==='.mp3' ? magic.toString('ascii',0,3)==='ID3'||(magic[0]===255&&(magic[1]&224)===224) :
      ext==='.mp4'||ext==='.m4a' ? magic.toString('ascii',4,8)==='ftyp' :
      ext==='.webm' ? magic.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])) : false);
    if(!signature)throw new Error('Media signature does not match filename');
    await copyFile(temp,target,constants.COPYFILE_EXCL);
    return {ok:true,project,location,name:filename,size};
  } finally {await rm(temp,{force:true}).catch(()=>{});}
}
export async function renameAsset(root,{project,location,oldName,newName,folder=''}){
  if(typeof folder!=='string'||folder.length>260)throw new Error('Invalid media folder');
  const parts=folder?folder.split('/'):[];
  if(parts.some(s=>!s||s==='.'||s==='..'||s.startsWith('.')||/[\\:\x00-\x1f*?"<>|]/.test(s)))
    throw new Error('Invalid media folder');
  const base=destination(root,project,location);
  const dir=join(base,...parts);
  const resolvedBase=await realpath(base),resolvedDir=await realpath(dir);
  const rel=relative(resolvedBase,resolvedDir);
  if(rel==='..'||rel.startsWith('..'+sep)||relative(base,dir).startsWith('..'))
    throw new Error('Media folder escapes project');
  const oldFile=join(dir,assetFilename(oldName));
  const next=join(dir,assetFilename(newName));
  if(oldName===newName)return {ok:true,name:newName};
  if(extname(oldName).toLowerCase()!==extname(newName).toLowerCase())throw new Error('Renaming cannot change the media file extension');
  const source=await lstat(oldFile);
  if(!source.isFile()||source.isSymbolicLink())throw new Error('Not a regular media file');
  if(await stat(next).catch(()=>null))throw new Error('Target filename already exists');
  await rename(oldFile,next);
  return {ok:true,project,location,oldName,newName};
}
