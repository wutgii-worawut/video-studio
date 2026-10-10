export interface Project {name:string;hasVideo:boolean}
export interface FileEntry {root:string;path:string;name:string;folder:string;size:number;type:'text'|'document'|'image'|'audio'|'video'|'binary';previewable:boolean;metadataOnly?:boolean}
export interface DeletedEntry {id:string;project:string;location:string;folder:string;name:string;size:number;deletedAt:string}
export interface Scene {id:string;label:string;start:number;end:number}
export interface Clip {id:string;start:number;duration:number;track:number;component:string;props:Record<string,unknown>}
export interface Composition {id:string;fps:number;width:number;height:number;duration:number;clips:Clip[]}
export interface Task {id:string;project:string;command:string;status:'running'|'complete'|'failed';output:string;code:number|null}
async function response<T>(url:string, options?:RequestInit):Promise<T>{const r=await fetch(url,options);if(!r.ok){let message='HTTP '+r.status;try{const b=await r.json();message=b.error||message}catch{}throw Error(message);}return r.json();}
const qs=(values:Record<string,string>)=>new URLSearchParams(values).toString();
export const urlFor=(kind:'media'|'document',project:string,group:string,file:FileEntry)=>'/api/studio/'+kind+'?'+qs({project,group,path:file.path});
export const studioApi={
  projects:()=>response<Project[]>('/api/projects'),
  entries:(project:string,group:string)=>response<{entries:FileEntry[]}>('/api/studio/entries?'+qs({project,group})),
  trash:(project:string)=>response<{items:DeletedEntry[]}>('/api/studio/files/trash?'+qs({project})),
  text:(project:string,group:string,file:FileEntry)=>response<{text:string}>('/api/studio/text?'+qs({project,group,path:file.path})),
  json:<T>(route:string,data:unknown)=>response<T>(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),
  upload:(project:string,location:string,file:File)=>response<{ok:boolean}>('/api/studio/files/upload?'+qs({project,location,name:file.name}),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file}),
  composition:async(project:string)=>{const r=await fetch('/api/compositions/'+encodeURIComponent(project));if(r.status===404)return null;if(!r.ok)throw Error('Composition not available');return {data:await r.json() as Composition,etag:r.headers.get('etag')||''};},
  saveComposition:async(project:string,data:Composition,etag:string)=>{const r=await fetch('/api/compositions/'+encodeURIComponent(project),{method:'PUT',headers:{'Content-Type':'application/json','If-Match':etag},body:JSON.stringify(data)});if(!r.ok){const j=await r.json().catch(()=>({}));throw Error(j.error||'Save failed');}return r.json();}
};
