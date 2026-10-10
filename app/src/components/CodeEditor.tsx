// Monaco's main entry registers dozens of languages and LSP features that this
// workspace never opens. Import the editor API plus only our file types.
import * as monaco from '../../../node_modules/monaco-editor/esm/vs/editor/editor.api.js';
// Editor contributions (find, folding, suggest, code lens…) and their services. Monaco otherwise pulls this in lazily
// with the first language worker, after its services are frozen, so every later editor instance threw
// "depends on UNKNOWN service". Loading it up front registers them before the first editor is created.
import '../../../node_modules/monaco-editor/esm/vs/internal/common/workers.js';
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

import {useRef} from 'react';
import {Editor,loader} from '@monaco-editor/react';
import {useStudio,type Tab} from '../lib/state';
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
// Monaco for the active Code tab. Text lives in the store so switching tabs or pages keeps unsaved edits.
export function MonacoPane({tab,onLine}:{tab:Tab;onLine?:(line:number)=>void}){
 const editTab=useStudio(s=>s.editTab),saveTab=useStudio(s=>s.saveTab);
 const active=useRef(tab.key);active.current=tab.key; // one editor instance swaps models per tab
 return <div className="code-editor" data-testid="monaco-editor"><Editor theme="vs-dark" path={tab.key} value={tab.content} language={syntax(tab.file.name)}
  onChange={v=>{if(tab.editable)editTab(tab.key,v||'')}}
  onMount={(editor,api)=>{
   editor.addCommand(api.KeyMod.CtrlCmd|api.KeyCode.KeyS,()=>void saveTab(active.current));
   editor.onDidChangeCursorPosition(e=>onLine?.(e.position.lineNumber));
  }}
  options={{readOnly:!tab.editable,minimap:{enabled:false},fontSize:13,fontFamily:'"IBM Plex Mono",Consolas,monospace',lineNumbers:'on',scrollBeyondLastLine:false,wordWrap:'on',automaticLayout:true,padding:{top:12,bottom:12}}}
  loading={<div className="skeleton" style={{height:200}}/>}/></div>;
}
