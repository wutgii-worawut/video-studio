import {lazy,Suspense,useEffect,useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import {Button} from './ui';
import {studioApi,type FileEntry} from '../lib/api';
const CodeInspector=lazy(()=>import('./CodeEditor').then(m=>({default:m.CodeInspector})));
export function MarkdownInspector({file,project,category}:{file:FileEntry;project:string;category:string}){
 const [mode,setMode]=useState<'read'|'edit'>('read'),[content,setContent]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let valid=true;setMode('read');setContent('');setError('');
  studioApi.text(project,category,file).then(x=>{if(valid)setContent(x.text)}).catch(e=>{if(valid)setError((e as Error).message)});
  return()=>{valid=false};
 },[project,category,file.path]);
 return <section className="markdown-inspector" data-testid="markdown-inspector">
  <div className="html-inspector-toolbar"><strong>{file.name}</strong><div className="html-inspector-tabs">
   <Button size="sm" variant="secondary" aria-pressed={mode==='read'} onClick={()=>setMode('read')}>Read</Button>
   <Button size="sm" variant="secondary" aria-pressed={mode==='edit'} onClick={()=>setMode('edit')}>Edit</Button>
  </div></div>
  {mode==='edit'?<Suspense fallback={<div className="skeleton"/>}><CodeInspector file={file}/></Suspense>:
   error?<div role="alert">{error}</div>:
   <article className="markdown-reading" data-testid="markdown-reading"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{content||'Loading document…'}</ReactMarkdown></article>}
 </section>;
}
