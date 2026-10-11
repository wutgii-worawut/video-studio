import type {FileEntry} from './api';
// Workspace-relative path for an Explorer entry, keyed by the root label lib/studio-workspace.mjs gives it.
const PROJECT_ROOTS:Record<string,string>={'Source':'source','Source assets':'source','Project source notes':'source','Brand Kit':'brand','Brand media':'brand','Brand notes':'brand','Project Docs':'docs','Rendered output':'output'};
const SHARED_ROOTS:Record<string,string>={'Shared SFX':'sfx','Global docs':'docs','Issue logs':'issues','Video workflow':'.claude/skills','FX Engine':'lib','Style Packs':'styles','Components':'components','Models (metadata only)':'models'};
export function workspacePath(project:string,file:FileEntry){
 const base=file.root in PROJECT_ROOTS?'projects/'+project+'/'+PROJECT_ROOTS[file.root]:SHARED_ROOTS[file.root]||file.root;
 return [base,file.folder,file.name].filter(Boolean).join('/');
}
// Project files show as source/…, docs/…; shared ones keep their workspace path (lib/…, styles/…).
const DOT:Record<string,string>={html:'#F07A6A',htm:'#F07A6A',js:'#E8C66A',mjs:'#E8C66A',json:'#6EA8FE',css:'#C9B9F5'};
export const extColor=(name:string)=>DOT[name.split('.').at(-1)?.toLowerCase()||'']||'#B4B7BF';
export const relPath=(file:FileEntry)=>workspacePath('_',file).replace(/^projects\/_\//,'');
// Find the listed file a workspace path points at (Code/Library lists are keyed by group).
export function findEntry(lists:Record<string,FileEntry[]>,project:string,target:string){
 for(const [group,files] of Object.entries(lists)){
  const file=files.find(f=>workspacePath(project,f)===target);
  if(file)return {group,file};
 }
 return null;
}
