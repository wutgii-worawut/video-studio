// Read-only, path-scoped Project Workspace file explorer.
// Project assets are visible in Studio, but scripts are never executed by the explorer.
// No arbitrary filesystem route, no model blob downloads, no symlink traversal.
import { readdir, readFile, realpath, stat, lstat } from 'node:fs/promises';
import { resolve, relative, extname, join, sep, basename, isAbsolute } from 'node:path';
import { projectName } from './production.mjs';

const MAX_ENTRIES = 1000;
const MAX_TEXT_BYTES = 512 * 1024;
const MAX_MEDIA_BYTES = 200 * 1024 * 1024;
const EXT_DOC = new Set(['.pdf','.docx','.xlsx','.pptx']);
const EXT_TEXT = new Set(['.md','.mdx','.txt','.json','.js','.mjs','.ts','.tsx','.css','.html','.htm','.srt','.vtt','.yml','.yaml','.xml','.svg','.csv','.log']);
const EXT_IMAGE = new Set(['.png','.jpg','.jpeg','.jpe','.jfif','.webp','.gif','.svg','.avif','.apng','.bmp','.ico','.tif','.tiff','.heic','.heif']);
const EXT_AUDIO = new Set(['.mp3','.wav','.ogg','.m4a','.flac']);
const EXT_VIDEO = new Set(['.mp4','.webm']);
const EXCLUDED = new Set(['node_modules','.git','.cache','tmp','.next','dist']);
const ROOT_GROUPS = new Set(['source','assets','brand','documents','fx','models','output']);

export function classifyFile(name) {
  const ext = extname(name).toLowerCase();
  if (EXT_IMAGE.has(ext)) return 'image';
  if (EXT_AUDIO.has(ext)) return 'audio';
  if (EXT_VIDEO.has(ext)) return 'video';
  if (EXT_TEXT.has(ext)) return 'text';
  if (EXT_DOC.has(ext)) return 'document';
  return 'binary';
}

export function groupRoots(root, project, group) {
  projectName(project);
  if (!ROOT_GROUPS.has(group)) throw new Error('Invalid workspace group');
  const base = join(root, 'projects', project);
  switch (group) {
    case 'source': return [{ label:'Source', path:join(base,'source') }];
    case 'assets': return [
      { label:'Source assets', path:join(base,'source'), onlyMedia:true },
      { label:'Brand media', path:join(base,'brand'), onlyMedia:true },
      { label:'Shared SFX', path:join(root,'sfx'), onlyMedia:true },
    ];
    case 'brand': return [{ label:'Brand Kit', path:join(base,'brand') }];
    case 'documents': return [
      { label:'Project Docs', path:join(base,'docs'), onlyDocs:true },
      { label:'Brand notes', path:join(base,'brand'), onlyDocs:true },
      { label:'Project source notes', path:join(base,'source'), onlyDocs:true },
      { label:'Global docs', path:join(root,'docs'), onlyDocs:true },
      { label:'Issue logs', path:join(root,'issues'), onlyDocs:true },
      { label:'Video workflow', path:join(root,'.claude','skills'), onlyDocs:true },
    ];
    case 'fx': return [
      { label:'FX Engine', path:join(root,'lib') },
      { label:'Style Packs', path:join(root,'styles') },
      { label:'Components', path:join(root,'components') },
    ];
    case 'models': return [{ label:'Models (metadata only)',path:join(root,'models'), metadataOnly:true }];
    case 'output': return [{ label:'Rendered output',path:join(base,'output') }];
  }
}

function validPart(part) {
  return !!part && part !== '.' && part !== '..' && !part.includes('\\') &&
    !part.includes('/') && !part.includes('\0') && !part.startsWith('.');
}

export function parseExplorerPath(raw) {
  if (typeof raw!=='string'||raw.length>1024) throw new Error('Invalid explorer path');
  const parts = raw.split('/');
  if (parts.length < 2 || parts.length > 12 || parts.some(p=>!validPart(p))) throw new Error('Invalid explorer path');
  const [rootIndex,...subparts]=parts;
  if (!/^(0|[1-9]\d?)$/.test(rootIndex)) throw new Error('Invalid workspace root index');
  return { rootIndex:Number(rootIndex), subparts };
}
export function within(root, target) {
  const rel=relative(root,target);
  // On Windows, relative() between volumes can itself be an absolute path
  // (e.g. D:\\secret). Reject it as well as any parent traversal.
  return rel==='' || (rel!=='..' && !rel.startsWith('..'+sep) && !isAbsolute(rel));
}

function allowedType(type, rootInfo) {
  if (rootInfo.metadataOnly) return true;
  if (rootInfo.onlyDocs) return type==='text' || type==='document';
  if (rootInfo.onlyMedia) return ['image','audio','video'].includes(type);
  return true;
}

async function requireRealProject(root,project) {
  const projectDir=join(root,'projects',project);
  const entry=await lstat(projectDir);
  if(!entry.isDirectory()||entry.isSymbolicLink())
    throw Error('Project directory must not be a symlink');
}
async function safeFile(root, project, group, path) {
  const roots=groupRoots(root,project,group);
  await requireRealProject(root,project);
  const {rootIndex,subparts}=parseExplorerPath(path);
  const info=roots[rootIndex];
  if (!info) throw new Error('Unknown workspace root');
  const rootPath=resolve(info.path);
  let current=rootPath;
  for (const part of subparts) current=join(current,part);
  if(!within(rootPath,current)) throw new Error('Path outside workspace root');
  const infoRoot=await lstat(rootPath);
  if(!infoRoot.isDirectory()||infoRoot.isSymbolicLink())
    throw Error('Workspace root must be a real directory');
  const actualRoot=await realpath(rootPath);
  const actualFile=await realpath(current);
  if(!within(actualRoot,actualFile)) throw new Error('Symlinks outside workspace are forbidden');
  const s=await stat(actualFile);
  if(!s.isFile()) throw new Error('Not a file');
  const type=classifyFile(current);
  if (!allowedType(type,info)) throw new Error('Not allowed in this workspace group');
  return { absolute:actualFile, size:s.size, type, metadataOnly:Boolean(info.metadataOnly) };
}

export async function workspaceEntries(root, project, group) {
  const roots=groupRoots(root,project,group);
  await requireRealProject(root,project);
  const entries=[];
  let omitted=0;
  for(let i=0;i<roots.length;i++) {
    const rootInfo=roots[i];
    const base=resolve(rootInfo.path);
    // Skip nonexistent folders; project might not have any SFX/images, for example.
    const exists=await lstat(base).catch(()=>null);
    if(!exists?.isDirectory()||exists.isSymbolicLink())continue;
    async function walk(dir,parts,depth) {
      if (entries.length>=MAX_ENTRIES || depth>6){omitted++;return;}
      const names=await readdir(dir,{withFileTypes:true}).catch(()=>[]);
      names.sort((a,b)=>Number(b.isDirectory())-Number(a.isDirectory())||
        a.name.localeCompare(b.name,'en'));
      for(const entity of names){
        if(entries.length>=MAX_ENTRIES){omitted++;return;}
        if(!validPart(entity.name) || EXCLUDED.has(entity.name) || entity.isSymbolicLink())continue;
        const next=[...parts,entity.name];
        if(entity.isDirectory()) {
          if(depth<6)await walk(join(dir,entity.name),next,depth+1);
          continue;
        }
        if(!entity.isFile())continue;
        const type=classifyFile(entity.name);
        if(!allowedType(type,rootInfo))continue;
        const item=await stat(join(dir,entity.name)).catch(()=>null);
        if(!item)continue;
        entries.push({root:rootInfo.label,path:[i,...next].join('/'),
          name:entity.name,folder:parts.join('/'),type,size:item.size,
          previewable:!rootInfo.metadataOnly && (
            (type==='text'&&item.size<=MAX_TEXT_BYTES) ||
            (['image','audio','video'].includes(type)&&item.size<=MAX_MEDIA_BYTES)),
          metadataOnly:Boolean(rootInfo.metadataOnly)});
      }
    }
    await walk(base,[],0);
  }
  return {group,project,entries,omitted};
}

export async function readWorkspaceText(root,project,group,path) {
  const file=await safeFile(root,project,group,path);
  if(file.metadataOnly || file.type!=='text' || file.size>MAX_TEXT_BYTES)throw new Error('Text preview unavailable');
  return {path,text:await readFile(file.absolute,'utf8'),size:file.size,type:file.type};
}
export async function workspaceMediaFile(root,project,group,path) {
  const f=await safeFile(root,project,group,path);
  if(f.metadataOnly||!['image','audio','video'].includes(f.type)||f.size>MAX_MEDIA_BYTES)throw new Error('Media preview unavailable');
  return f;
}

export async function workspaceDocumentFile(root,project,group,path) {
  const f=await safeFile(root,project,group,path);
  if(f.metadataOnly || f.type!=='document' || f.size>MAX_MEDIA_BYTES)
    throw Error('Document preview unavailable');
  return f;
}

export async function workspaceEditableText(root,project,group,path){
  const {rootIndex,subparts}=parseExplorerPath(path);
  if(!(
    group==='source'&&rootIndex===0||
    group==='brand'&&rootIndex===0||
    group==='documents'&&(rootIndex===0||rootIndex===1)
  ))throw Error('Only project source and project documents can be edited');
  const file=await safeFile(root,project,group,path);
  if(file.type!=='text'||file.size>MAX_TEXT_BYTES)throw Error('Text file too large or unsupported');
  const filename=subparts[subparts.length-1];
  if(group==='source'&&['composition.json','composition-data.js'].includes(filename))
    throw Error('Edit structured compositions in the Composition tab to keep sidecar data in sync');
  if(!['.html','.htm','.js','.mjs','.css','.md','.mdx','.txt','.json','.srt','.vtt','.csv','.yml','.yaml'].includes(extname(filename).toLowerCase()))
    throw Error('This file is read-only');
  return file;
}
