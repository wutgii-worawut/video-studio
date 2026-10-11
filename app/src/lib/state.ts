import {create} from 'zustand';
import {toast} from 'sonner';
import type {Project,FileEntry,Scene,Composition,RenderStatus} from './api';
import {studioApi} from './api';
import {relPath} from './paths';
export type SessionKind='claude'|'codex'|'powershell';
export type MdMode='source'|'split'|'preview';
export type Page='director'|'code'|'library'|'render'|'projects';
const PAGES:Page[]=['director','code','library','render','projects'];
const saved=(key:string)=>{try{return localStorage.getItem(key)}catch{return null}};
const savedPage=():Page=>{const p=saved('vs-page') as Page;return PAGES.includes(p)&&p!=='projects'?p:'director'};
// An open file on the Code page. `group` is the workspace group the file was listed in (source, documents, …).
export interface Tab {key:string;group:string;file:FileEntry;content:string;original:string;etag:string;editable:boolean;loading:boolean;error:string;diskChanged?:boolean}
export const isDirty=(t:Tab)=>t.content!==t.original;
interface StudioState {
 projects:Project[];project:string;scenes:Scene[];duration:number;time:number;
 playing:boolean;mute:boolean;volume:number;composition:Composition|null;etag:string;
 page:Page;taskRunning:boolean;queuedTask:string;directorMode:'terminal'|'preview';
 workspaceMode:'normal'|'preview';previewRevision:number;libraryLocation:string;
 tabs:Tab[];activeTab:string;
 // How .md/.mdx tabs show on the Code page; one setting for every Markdown tab, saved as vs-md-mode.
 mdMode:MdMode;setMdMode:(mode:MdMode)=>void;
 // remark-breaks: a single newline becomes <br> (off = standard Markdown). Saved as vs-md-breaks.
 mdBreaks:boolean;setMdBreaks:(on:boolean)=>void;
 // Heading to scroll to once the rendered view of tab `key` is shown (link to other.md#heading).
 mdAnchor:{key:string;id:string}|null;
 // Context for the terminal Insert bar: Monaco cursor line, Library selection, latest task log.
 codeLine:number;libraryFile:FileEntry|null;lastTaskLog:string;
 renderStatus:RenderStatus;terminalKind:SessionKind;
 // Spec 8C: files changed on disk this session (newest first) and the last one that reloaded the preview.
 changes:{path:string;at:number}[];lastReload:{path:string;at:number}|null;
 set:(data:Partial<StudioState>)=>void;
 go:(page:Page)=>void;
 switchProject:(name:string)=>void;
 openFile:(group:string,file:FileEntry)=>Promise<void>;
 editTab:(key:string,content:string)=>void;
 saveTab:(key:string)=>Promise<boolean>;
 closeTab:(key:string)=>void;
 reloadTab:(key:string,keep:'disk'|'mine')=>Promise<void>;
 fileChanged:(path:string,at:number)=>void;
}
const sourceUrl=(project:string,group:string,file:FileEntry)=>'/api/studio/source?'+new URLSearchParams({project,group,path:file.path});
export const useStudio=create<StudioState>((set,get)=>{
 const patch=(key:string,values:Partial<Tab>)=>set(s=>({tabs:s.tabs.map(t=>t.key===key?{...t,...values}:t)}));
 // A Code save also arrives as a file-change event; reload the preview once, not twice.
 let lastBump=0;
 const bumpPreview=()=>{if(Date.now()-lastBump<1500)return;lastBump=Date.now();set(s=>({previewRevision:s.previewRevision+1}));};
 return {
 projects:[],project:'',scenes:[],duration:15,time:0,playing:false,mute:false,volume:1,composition:null,etag:'',
 page:savedPage(),taskRunning:false,queuedTask:'',directorMode:saved('vs-director-mode')==='preview'?'preview':'terminal',
 workspaceMode:'normal',previewRevision:0,libraryLocation:'images',tabs:[],activeTab:'',mdMode:(['source','split','preview'] as const).find(m=>m===saved('vs-md-mode'))||'split',mdBreaks:saved('vs-md-breaks')==='true',mdAnchor:null,codeLine:1,libraryFile:null,lastTaskLog:'',renderStatus:{state:'none'},terminalKind:'powershell',changes:[],lastReload:null,
 set:(data)=>set(data),
 setMdBreaks:(on)=>{try{localStorage.setItem('vs-md-breaks',String(on))}catch{}set({mdBreaks:on});},
 setMdMode:(mode)=>{try{localStorage.setItem('vs-md-mode',mode)}catch{}set({mdMode:mode});},
 go:(page)=>{try{if(page!=='projects')localStorage.setItem('vs-page',page)}catch{}set({page});},
 switchProject:(name)=>set({project:name,time:0,playing:false,scenes:[],composition:null,etag:'',workspaceMode:'normal',tabs:[],activeTab:'',libraryFile:null,lastTaskLog:'',renderStatus:{state:'none'},changes:[],lastReload:null}),
 // Editable files load through /api/studio/source (ETag); anything else opens read-only as plain text.
 openFile:async(group,file)=>{
  const key=group+'|'+file.path,project=get().project;
  if(get().tabs.some(t=>t.key===key)){set({activeTab:key});return;}
  set(s=>({tabs:[...s.tabs,{key,group,file,content:'',original:'',etag:'',editable:false,loading:true,error:''}],activeTab:key}));
  try{
   const r=await fetch(sourceUrl(project,group,file));
   if(r.ok){const j=await r.json();patch(key,{content:j.text,original:j.text,etag:j.etag,editable:true,loading:false});}
   else{const j=await studioApi.text(project,group,file);patch(key,{content:j.text,original:j.text,editable:false,loading:false});}
  }catch(e){patch(key,{loading:false,error:(e as Error).message});}
 },
 editTab:(key,content)=>patch(key,{content}),
 saveTab:async(key)=>{
  const tab=get().tabs.find(t=>t.key===key);
  if(!tab||!tab.editable)return false;
  try{
   const r=await fetch(sourceUrl(get().project,tab.group,tab.file),{method:'PUT',headers:{'If-Match':tab.etag,'Content-Type':'text/plain; charset=utf-8'},body:tab.content});
   const j=await r.json();
   if(!r.ok)throw Error(j.error||'Unable to save');
   patch(key,{original:tab.content,etag:j.etag});
   if(tab.group==='source')bumpPreview();
   toast.success('Saved '+tab.file.name);return true;
  }catch(e){toast.error((e as Error).message);return false;}
 },
 // 'disk' takes the file as it is now; 'mine' keeps the edits but adopts the new ETag so the next save overwrites on purpose.
 reloadTab:async(key,keep)=>{
  const tab=get().tabs.find(t=>t.key===key);if(!tab)return;
  try{
   const r=await fetch(sourceUrl(get().project,tab.group,tab.file));
   const j=r.ok?await r.json():{text:(await studioApi.text(get().project,tab.group,tab.file)).text,etag:''};
   patch(key,keep==='mine'?{etag:j.etag,diskChanged:false}:{content:j.text,original:j.text,etag:j.etag,diskChanged:false});
  }catch(e){toast.error((e as Error).message);}
 },
 fileChanged:(path,at)=>{
  set(s=>({changes:[{path,at},...s.changes.filter(c=>c.path!==path)].slice(0,20)}));
  if(path.startsWith('source/')){set({lastReload:{path,at}});bumpPreview();}
  for(const tab of get().tabs.filter(t=>relPath(t.file)===path)){
   if(isDirty(tab))patch(tab.key,{diskChanged:true});else void get().reloadTab(tab.key,'disk');
  }
 },
 closeTab:(key)=>set(s=>{
  const index=s.tabs.findIndex(t=>t.key===key),tabs=s.tabs.filter(t=>t.key!==key);
  return {tabs,activeTab:s.activeTab===key?(tabs[Math.min(index,tabs.length-1)]?.key||''):s.activeTab};
 }),
 };
});
// Scenes for lists and timelines: detected HTML scenes, or Composition clips when a project has no named scenes.
export function useSceneItems():Scene[]{
 const scenes=useStudio(s=>s.scenes),composition=useStudio(s=>s.composition);
 if(scenes.length||!composition)return scenes;
 return [...composition.clips].sort((a,b)=>a.start-b.start).map(c=>({id:c.id,label:c.id,start:c.start,end:c.start+c.duration}));
}
