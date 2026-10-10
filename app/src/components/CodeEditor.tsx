import {useShallow} from 'zustand/react/shallow';
import {useEffect,useState} from 'react';
// Monaco's main entry registers dozens of languages and LSP features that this
// workspace never opens. Import the editor API plus only our file types.
import * as monaco from '../../../node_modules/monaco-editor/esm/vs/editor/editor.api.js';
import '../../../node_modules/monaco-editor/esm/vs/languages/definitions/javascript/register.js';
import '../../../node_modules/monaco-editor/esm/vs/languages/definitions/typescript/register.js';
import '../../../node_modules/monaco-editor/esm/vs/languages/definitions/html/register.js';
import '../../../node_modules/monaco-editor/esm/vs/languages/definitions/css/register.js';
import '../../../node_modules/monaco-editor/esm/vs/languages/definitions/markdown/register.js';
import '../../../node_modules/monaco-editor/esm/vs/languages/definitions/xml/register.js';
import '../../../node_modules/monaco-editor/esm/vs/languages/definitions/yaml/register.js';
import '../../../node_modules/monaco-editor/esm/vs/language/typescript/monaco.contribution.js';
import '../../../node_modules/monaco-editor/esm/vs/language/json/monaco.contribution.js';
import '../../../node_modules/monaco-editor/esm/vs/language/html/monaco.contribution.js';
import '../../../node_modules/monaco-editor/esm/vs/language/css/monaco.contribution.js';
import EditorWorker from '../../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker';
import JsonWorker from '../../../node_modules/monaco-editor/esm/vs/language/json/json.worker.js?worker';
import CssWorker from '../../../node_modules/monaco-editor/esm/vs/language/css/css.worker.js?worker';
import HtmlWorker from '../../../node_modules/monaco-editor/esm/vs/language/html/html.worker.js?worker';
import TypeScriptWorker from '../../../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js?worker';

import {Editor,loader} from '@monaco-editor/react';
import {AlertCircle,Code2,Save,Undo2} from 'lucide-react';
import {toast} from 'sonner';
import {useStudio} from '../lib/state';
import type {FileEntry} from '../lib/api';
import {studioApi} from '../lib/api';
import {Button,Badge} from './ui';
import {formatSize} from '../lib/utils';
// Explicit Vite worker bundle mapping. Default Monaco blob workers fail in packaged Electron.
(self as typeof self & {MonacoEnvironment?:{getWorker:(id:string,label:string)=>Worker}}).MonacoEnvironment={
 getWorker(_id,label){
  if(label==='json')return new JsonWorker();
  if(['css','scss','less'].includes(label))return new CssWorker();
  if(['html','handlebars','razor'].includes(label))return new HtmlWorker();
  if(['typescript','javascript'].includes(label))return new TypeScriptWorker();
  return new EditorWorker();
 }
};
loader.config({monaco});
function syntax(name:string){
 const e=name.split('.').at(-1)?.toLowerCase()||'';
 return ({md:'markdown',mdx:'markdown',js:'javascript',mjs:'javascript',ts:'typescript',tsx:'typescript',json:'json',html:'html',css:'css',yml:'yaml',yaml:'yaml',xml:'xml'} as Record<string,string>)[e]||'plaintext';
}
export function CodeInspector({file}:{file:FileEntry}){
 const {project,category}=useStudio(useShallow(s=>({project:s.project,category:s.category})));
 const [content,setContent]=useState(''),[original,setOriginal]=useState(''),[etag,setEtag]=useState(''),[editable,setEditable]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  let dead=false;setBusy(true);setError('');
  const query=new URLSearchParams({project,group:category,path:file.path});
  (async()=>{
   try{
    const r=await fetch('/api/studio/source?'+query);
    if(r.ok){
     const j=await r.json();
     if(!dead){setContent(j.text);setOriginal(j.text);setEtag(j.etag);setEditable(true);}
    }else{
     const j=await studioApi.text(project,category,file);
     if(!dead){setContent(j.text);setOriginal(j.text);setEditable(false);}
    }
   }catch(e){if(!dead)setError((e as Error).message)}
   finally{if(!dead)setBusy(false)}
  })();
  return ()=>{dead=true};
 },[file.path,category,project]);
 const save=async()=>{
  setBusy(true);
  try{
   const path=new URLSearchParams({project,group:category,path:file.path});
   const r=await fetch('/api/studio/source?'+path,{
    method:'PUT',headers:{'If-Match':etag,'Content-Type':'text/plain; charset=utf-8'},body:content
   });
   const j=await r.json();
   if(!r.ok)throw Error(j.error||'Unable to save');
   setOriginal(content);setEtag(j.etag);toast.success('Saved '+file.name+' · Preview can be reloaded to see changes');
  }catch(e){toast.error((e as Error).message)}
  finally{setBusy(false)}
 };
 const dirty=original!==content;
 return <div className="code-inspector">
  <div className="inspector-resource-meta"><Code2 size={16}/><span className="truncate">{file.name}</span><Badge>{editable?'EDITABLE':'READ ONLY'}</Badge></div>
  <div className="inspector-hint">{file.folder||file.root} · {formatSize(file.size)}</div>
  {error?<div className="error-state"><AlertCircle size={16}/>{error}</div>:busy&&!original?<div className="skeleton" style={{height:260}}/>:
  <div className="code-editor" data-testid="monaco-editor"><Editor theme="vs-dark" value={content} onChange={v=>setContent(v||'')} language={syntax(file.name)}
    options={{readOnly:!editable,minimap:{enabled:false},fontSize:12,lineNumbers:'on',scrollBeyondLastLine:false,wordWrap:'on',automaticLayout:true,padding:{top:12,bottom:12}}} loading={<div className="skeleton" style={{height:200}}/>}/></div>}
  <div className="inspector-bottom-actions">
   <span>{dirty?'● Unsaved changes':editable?'Ready to edit':'Source is read-only'}</span>
   {editable&&<><Button variant="ghost" size="sm" disabled={!dirty||busy} onClick={()=>setContent(original)}><Undo2 size={14}/> Revert</Button>
    <Button size="sm" disabled={!dirty||busy} onClick={()=>void save()}><Save size={14}/> Save</Button></>}
  </div>
 </div>;
}
