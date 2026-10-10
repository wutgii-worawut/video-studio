import {useShallow} from 'zustand/react/shallow';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArchiveRestore,BookOpen,Box,Clapperboard,Copy,FileArchive,FileText,FolderClosed,Image,MoreHorizontal,Music2,Palette,Plus,RefreshCw,Search,Settings2,Trash2,Upload,Video,Workflow,Check} from 'lucide-react';
import {toast} from 'sonner';
import {useStudio,type Category} from '../lib/state';
import type {FileEntry,DeletedEntry} from '../lib/api';
import {studioApi} from '../lib/api';
import {Button,Input,Dialog,DialogContent,DialogTitle,DialogDescription,DialogFooter,AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogCancel,AlertDialogAction,DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger,DropdownMenuSeparator,Badge,ContextMenu,ContextMenuTrigger,ContextMenuContent,ContextMenuItem,ContextMenuSeparator} from './ui';
import {formatSize,cn} from '../lib/utils';

const sections:{key:Category;icon:typeof Image;label:string}[]=[
 {key:'source',icon:Workflow,label:'Source'},{key:'assets',icon:Image,label:'Assets'},
 {key:'brand',icon:Palette,label:'Brand Kit'},{key:'documents',icon:BookOpen,label:'Documents'},
 {key:'fx',icon:Settings2,label:'FX & Styles'},{key:'models',icon:Box,label:'Models'},
 {key:'output',icon:Clapperboard,label:'Output'},{key:'trash',icon:Trash2,label:'Trash'}
];
const iconFor:Record<string,typeof Image>={image:Image,audio:Music2,video:Video,text:FileText,document:FileArchive,binary:Box};
const DOC_EXT=['.md','.txt','.csv','.srt','.vtt','.json','.pdf','.docx','.xlsx','.pptx'];
function managed(file:FileEntry):{location:string;folder:string}|null{
 if(file.metadataOnly)return null;
 const folder=file.folder||'',isMedia=['image','audio','video'].includes(file.type);
 if(isMedia){
  if(['Brand Kit','Brand media'].includes(file.root)){
   if(folder==='sfx'||folder.startsWith('sfx/'))return {location:'brand-sfx',folder:folder==='sfx'?'':folder.slice(4)};
   return {location:'brand',folder};
  }
  if(['Source','Source assets'].includes(file.root)&&(folder==='img'||folder.startsWith('img/')))
   return {location:'assets',folder:folder==='img'?'':folder.slice(4)};
 }
 if(file.type==='text'||file.type==='document'){
  if(file.name.toLowerCase()==='brand.md')return null;
  if(file.root==='Project Docs')return {location:'documents',folder};
  if(['Brand notes','Brand Kit'].includes(file.root))return {location:'brand-docs',folder};
 }
 return null;
}
const destinations=[
 {value:'assets',label:'Source Images'},
 {value:'brand',label:'Brand Media'},
 {value:'brand-sfx',label:'Brand Sound Effects'},
 {value:'documents',label:'Project Documents'},
 {value:'brand-docs',label:'Brand Documents'}
];

export function FileExplorer(){
 const {project,category,files,trash:trashItems,selected,search}=useStudio(useShallow(s=>({project:s.project,category:s.category,files:s.files,trash:s.trash,selected:s.selected,search:s.search})));
 const set=useStudio(s=>s.set);
 const [busy,setBusy]=useState(false),[importOpen,setImportOpen]=useState(false);
 const [uploadTo,setUploadTo]=useState('assets'),[staged,setStaged]=useState<File[]>([]);
 const [action,setAction]=useState<{type:'rename'|'duplicate'|'delete';file:FileEntry}|null>(null),[renameTo,setRenameTo]=useState('');
 const [trashSelected,setTrashSelected]=useState<DeletedEntry|null>(null);
 const picker=useRef<HTMLInputElement>(null);
 const [loading,setLoading]=useState(false);
 const reload=useCallback(async()=>{
  if(!project)return;
  setLoading(true);
  try{
   if(category==='trash'){const result=await studioApi.trash(project);if(useStudio.getState().project===project)set({trash:result.items});}
   else {const result=await studioApi.entries(project,category);if(useStudio.getState().project===project&&useStudio.getState().category===category)set({files:result.entries});}
  }catch(e){toast.error((e as Error).message)}finally{setLoading(false)}
 },[project,category,set]);
 useEffect(()=>{void reload();},[reload]);
 useEffect(()=>{
  if(category==='documents')setUploadTo('documents');
  else if(category==='brand')setUploadTo('brand');
  else if(category==='assets')setUploadTo('assets');
 },[category]);
 const shown=useMemo(()=>files.filter(f=>(f.name+' '+f.folder+' '+f.root).toLowerCase().includes(search.toLowerCase())),[files,search]);
 const groups=useMemo(()=>{
  const map=new Map<string,FileEntry[]>();
  for(const f of shown){const key=f.root;if(!map.has(key))map.set(key,[]);map.get(key)!.push(f);}
  return [...map.entries()];
 },[shown]);
 const perform=async()=>{
  if(!action||!project)return;
  setBusy(true);
  const where=managed(action.file);
  if(!where){toast.error('This project file is read-only');setBusy(false);return;}
  try{
   await studioApi.json('/api/studio/files/action',{
    action:action.type,project,...where,name:action.file.name,
    ...(action.type==='rename'?{newName:renameTo.trim()}:{}),
   });
   toast.success(action.type==='delete'?'Moved to Trash':action.type==='duplicate'?'Duplicated successfully':'Renamed successfully');
   if(selected?.path===action.file.path)set({selected:null});
   setAction(null);await reload();
  }catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
 };
 const importFiles=async()=>{
  if(!staged.length){toast.error('Select or drop files to import');return;}
  setBusy(true);let imported=0;
  for(const file of staged){
   const isDoc=DOC_EXT.some(ext=>file.name.toLowerCase().endsWith(ext));
   if(isDoc!==['documents','brand-docs'].includes(uploadTo)){
    toast.error(file.name+': choose a matching media/documents destination');continue;
   }
   try{await studioApi.upload(project,uploadTo,file);imported++}catch(e){toast.error(file.name+': '+(e as Error).message);}
  }
  setBusy(false);
  if(imported){toast.success(imported+' file(s) imported');setImportOpen(false);setStaged([]);await reload();}
 };
 const onDrop=(event:React.DragEvent)=>{
  if(!event.dataTransfer.files.length)return;
  event.preventDefault();setStaged(Array.from(event.dataTransfer.files));setImportOpen(true);
 };
 const restore=async(item:DeletedEntry)=>{
  setBusy(true);
  try{await studioApi.json('/api/studio/files/restore',{project,id:item.id});toast.success('Restored '+item.name);setTrashSelected(null);await reload();}
  catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
 };
 return <aside className="explorer surface-panel" aria-label="Project Explorer">
  <div className="section-head"><span className="kicker">PROJECT EXPLORER</span><Button variant="ghost" size="icon" onClick={()=>void reload()} aria-label="Refresh files"><RefreshCw size={15} className={loading?'spin':''}/></Button></div>
  <div className="side-categories" aria-label="File categories">{sections.map(s=><button key={s.key} className={cn('category-link',category===s.key&&'active')} onClick={()=>set({category:s.key,selected:null,files:[],search:''})}>
   <s.icon size={16}/><span>{s.label}</span>{category===s.key&&<span className="category-dot"/>}
  </button>)}</div>
  <div className="explorer-search"><Search size={15}/><Input value={search} onChange={e=>set({search:e.target.value})} placeholder="Search project files..." aria-label="Search files"/></div>
  <div className="explorer-tools"><span>{category==='trash'?trashItems.length:shown.length} files</span><Button size="sm" onClick={()=>{setStaged([]);setImportOpen(true)}} disabled={category==='trash'||category==='models'||category==='fx'||category==='output'}><Plus size={14}/> Import</Button></div>
  <div className="explorer-content" onDragOver={e=>e.preventDefault()} onDrop={onDrop} data-testid="file-list">
   {category==='trash'?trashItems.map(f=><button key={f.id} className={cn('file-row',trashSelected?.id===f.id&&'selected')} onClick={()=>setTrashSelected(f)}>
    <Trash2 size={15}/><span className="file-name">{f.name}<small>{f.location} • {formatSize(f.size)}</small></span><ArchiveRestore size={15} onClick={e=>{e.stopPropagation();void restore(f)}}/>
   </button>):groups.map(([root,items])=><div key={root} className="file-group"><div className="file-group-head"><FolderClosed size={14}/>{root}</div>
    {items.map(file=>{const Icon=iconFor[file.type]||FileText;const isManaged=managed(file);
     const row=<div key={file.path} className={cn('file-row-wrap',selected?.path===file.path&&'selected')}>
      <button className="file-row" title={file.folder+'/'+file.name} onClick={()=>set({selected:file,inspector:'file'})} onContextMenu={e=>{if(!isManaged)return;e.preventDefault();set({selected:file,inspector:'file'});}}>
       <Icon size={16} className="file-icon"/><span className="file-name">{file.name}<small>{file.folder||'root'} · {formatSize(file.size)}</small></span>
      </button>
      {isManaged&&<DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="row-actions" aria-label={'Actions for '+file.name}><MoreHorizontal size={15}/></Button></DropdownMenuTrigger>
       <DropdownMenuContent>
        <DropdownMenuItem onSelect={()=>{setRenameTo(file.name);setAction({type:'rename',file});}}>Rename</DropdownMenuItem>
        <DropdownMenuItem onSelect={()=>setAction({type:'duplicate',file})}>Duplicate</DropdownMenuItem>
        <DropdownMenuSeparator/>
        <DropdownMenuItem className="text-danger" onSelect={()=>setAction({type:'delete',file})}>Move to Trash</DropdownMenuItem>
       </DropdownMenuContent></DropdownMenu>}
     </div>;
     return isManaged?<ContextMenu key={file.path}><ContextMenuTrigger asChild>{row}</ContextMenuTrigger><ContextMenuContent>
      <ContextMenuItem onSelect={()=>{setRenameTo(file.name);setAction({type:'rename',file})}}>Rename</ContextMenuItem>
      <ContextMenuItem onSelect={()=>setAction({type:'duplicate',file})}>Duplicate</ContextMenuItem>
      <ContextMenuSeparator/>
      <ContextMenuItem className="text-danger" onSelect={()=>setAction({type:'delete',file})}>Move to Trash</ContextMenuItem>
     </ContextMenuContent></ContextMenu>:row;
    })}</div>)}
   {category!=='trash'&&!shown.length&&<div className="empty-state"><FolderClosed size={26}/><p>No matching files</p><small>Try another category or import resources.</small></div>}
   {category==='trash'&&!trashItems.length&&<div className="empty-state"><ArchiveRestore size={25}/><p>Trash is empty</p><small>Deleted project files appear here for recovery.</small></div>}
  </div>
  {trashSelected&&category==='trash'&&<div className="trash-restore"><div className="truncate">{trashSelected.name}</div><Button size="sm" disabled={busy} onClick={()=>void restore(trashSelected)}><ArchiveRestore size={14}/> Restore file</Button></div>}
  <div className="sidebar-bottom"><span className="status-indicator"/>Local project files <Badge>Synced</Badge></div>

  <Dialog open={importOpen} onOpenChange={setImportOpen}><DialogContent>
   <div className="dialog-eyebrow"><Upload size={17}/> IMPORT RESOURCES</div>
   <DialogTitle className="dialog-title">Add files to project</DialogTitle>
   <DialogDescription>Select a destination, then drag files here or browse. Existing files will never be overwritten.</DialogDescription>
   <label className="form-label" htmlFor="destination">Destination</label>
   <select id="destination" className="ui-input" value={uploadTo} onChange={e=>setUploadTo(e.target.value)}>{destinations.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}</select>
   <div className="drop-area" role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')picker.current?.click()}} onClick={()=>picker.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();e.stopPropagation();setStaged(Array.from(e.dataTransfer.files));}}>
    <Upload size={26}/><strong>Drop files here</strong><small>or click to choose files • 100 MB maximum per file</small>
   </div>
   <input ref={picker} type="file" multiple className="visually-hidden" onChange={e=>setStaged(Array.from(e.target.files||[]))} aria-label="Choose files to import"/>
   {staged.length>0&&<div className="file-staging">{staged.map((f,i)=><span key={i}><Check size={13}/>{f.name} <small>{formatSize(f.size)}</small></span>)}</div>}
   <DialogFooter><Button variant="outline" onClick={()=>setImportOpen(false)}>Cancel</Button><Button disabled={busy||!staged.length} onClick={()=>void importFiles()}>{busy?'Importing…':'Import '+staged.length+' file(s)'}</Button></DialogFooter>
  </DialogContent></Dialog>
  <Dialog open={action!==null&&action.type!=='delete'} onOpenChange={o=>{if(!o)setAction(null)}}>
   <DialogContent><div className="dialog-eyebrow"><Copy size={16}/> FILE MANAGER</div>
    <DialogTitle className="dialog-title">{action?.type==='rename'?'Rename file':'Duplicate file'}</DialogTitle>
    <DialogDescription>{action?.type==='rename'?'The file stays in its current folder. Keep the original extension.':'A new copy is created in the same folder without replacing the original.'}</DialogDescription>
    {action?.type==='rename'?<Input autoFocus aria-label="New file name" value={renameTo} onChange={e=>setRenameTo(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void perform()}}/>:<div className="operation-file">{action?.file.name}</div>}
    <DialogFooter><Button variant="outline" onClick={()=>setAction(null)}>Cancel</Button><Button disabled={busy||action?.type==='rename'&&!renameTo.trim()} onClick={()=>void perform()}>{action?.type==='rename'?'Save name':'Create copy'}</Button></DialogFooter>
   </DialogContent>
  </Dialog>
  <AlertDialog open={action?.type==='delete'} onOpenChange={o=>{if(!o)setAction(null)}}>
   <AlertDialogContent><div className="dialog-icon-danger"><Trash2 size={23}/></div>
    <AlertDialogTitle className="dialog-title">Move file to Trash?</AlertDialogTitle>
    <AlertDialogDescription>You are about to remove <strong>{action?.file.name}</strong> from this project. Scenes referencing this file may stop rendering correctly. You can restore it later from Trash.</AlertDialogDescription>
    <DialogFooter><AlertDialogCancel asChild><Button variant="outline" disabled={busy}>Cancel</Button></AlertDialogCancel><AlertDialogAction asChild><Button variant="destructive" disabled={busy} onClick={e=>{e.preventDefault();void perform()}}><Trash2 size={15}/> Move to Trash</Button></AlertDialogAction></DialogFooter>
   </AlertDialogContent>
  </AlertDialog>
 </aside>;
}
