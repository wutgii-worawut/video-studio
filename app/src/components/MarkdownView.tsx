import {useDeferredValue,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {ChevronDown,ChevronUp,X} from 'lucide-react';
import ReactMarkdown,{type Components} from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/dist/katex.min.css'; // fonts are bundled next to it, so math renders offline in Electron
import {useStudio} from '../lib/state';
import {cn,typing} from '../lib/utils';
import {splitFrontMatter,remarkCallouts,rehypeHeadingIds,sanitizeSchema,classifyLink,imageUrl,slugify,ID_PREFIX} from '../lib/markdown';

export type Heading={id:string;text:string;level:number};
const BIG=1_000_000; // ponytail: plain size gate (Orca-style); a worker renderer if real docs get this big

// Heading and footnote ids carry ID_PREFIX; authors write #heading, #Heading or the full id.
function findAnchor(root:HTMLElement|null,id:string){
 if(!root)return null;
 let raw=id;try{raw=decodeURIComponent(id)}catch{/* keep raw */}
 const name=raw.startsWith(ID_PREFIX)?raw.slice(ID_PREFIX.length):raw;
 const byId=(v:string)=>root.querySelector<HTMLElement>('#'+CSS.escape(ID_PREFIX+v));
 return byId(name)||byId(slugify(name))||
  [...root.querySelectorAll<HTMLElement>('[id]')].find(el=>el.id.toLowerCase()===(ID_PREFIX+name).toLowerCase())||null;
}
function MdImage({src,alt,from,project}:{src?:string;alt?:string;from:string;project:string}){
 const [failed,setFailed]=useState(false),url=imageUrl(src,from,project);
 if(!url)return <span className="md-image-note" role="note">{/^[a-z][a-z0-9+.-]*:/i.test(src||'')?<>Image “{alt||src}” isn’t shown — only https:// images load here.</>:
  <>Image “{alt||src}” is outside source/ and brand/ — Studio can’t show it yet.</>}</span>;
 if(failed)return <span className="md-image-note" role="note">Image “{alt||src}” could not be loaded.</span>;
 return <img src={url} alt={alt||''} loading="lazy" onError={()=>setFailed(true)}/>;
}

// Ctrl+F inside the rendered view (Electron has no find bar). Marks matches with the CSS Custom Highlight API, so the DOM
// React owns is never touched. ponytail: matches within one text node; a phrase split by **bold** markup isn't found.
function FindBar({root,version,onClose}:{root:HTMLElement|null;version:string;onClose:()=>void}){
 const [query,setQuery]=useState(''),[index,setIndex]=useState(0),[ranges,setRanges]=useState<Range[]>([]);
 useEffect(()=>{
  const out:Range[]=[],needle=query.toLowerCase();
  if(root&&needle){
   const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
   for(let node=walker.nextNode();node;node=walker.nextNode()){
    if(node.parentElement?.closest('.katex-mathml'))continue; // KaTeX's hidden copy of each formula
    const text=(node.nodeValue||'').toLowerCase();
    for(let at=text.indexOf(needle);at>=0;at=text.indexOf(needle,at+needle.length)){const r=new Range();r.setStart(node,at);r.setEnd(node,at+needle.length);out.push(r);}
   }
  }
  setRanges(out);setIndex(0);
 },[root,query,version]);
 useEffect(()=>{
  CSS.highlights.set('md-find',new Highlight(...ranges));
  const current=ranges[index];
  if(current){CSS.highlights.set('md-find-current',new Highlight(current));current.startContainer.parentElement?.scrollIntoView({block:'center'});}
  else CSS.highlights.delete('md-find-current');
 },[ranges,index]);
 useEffect(()=>()=>{CSS.highlights.delete('md-find');CSS.highlights.delete('md-find-current');},[]);
 const step=(by:number)=>{if(ranges.length)setIndex(i=>(i+by+ranges.length)%ranges.length);};
 return <div className="md-find" role="search">
  <input autoFocus aria-label="Find in rendered Markdown" placeholder="Find…" value={query} onChange={e=>setQuery(e.target.value)}
   onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();step(e.shiftKey?-1:1);}else if(e.key==='Escape'){e.preventDefault();onClose();}}}/>
  <span className="mono" aria-live="polite">{query?(ranges.length?index+1+'/'+ranges.length:'0/0'):''}</span>
  <button aria-label="Previous match" onClick={()=>step(-1)}><ChevronUp size={14}/></button>
  <button aria-label="Next match" onClick={()=>step(1)}><ChevronDown size={14}/></button>
  <button aria-label="Close find" onClick={onClose}><X size={14}/></button>
 </div>;
}

// Rendered Markdown for Code (Split/Preview) and Library. Raw HTML is never rendered; links never navigate the app.
export function MarkdownView({content,from,project,compact,onHeadings,onOpenDoc,scrollTo,onScrolled}:{content:string;from:string;project:string;compact?:boolean;
 onHeadings?:(h:Heading[])=>void;onOpenDoc?:(target:string,hash?:string)=>void;scrollTo?:string;onScrolled?:()=>void}){
 const text=useDeferredValue(content);
 const [force,setForce]=useState(false),[showFront,setShowFront]=useState(false);
 const article=useRef<HTMLElement>(null),breaks=useStudio(s=>s.mdBreaks);
 const {body,entries}=useMemo(()=>splitFrontMatter(text),[text]);
 const tooBig=text.length>BIG&&!force;
 const [finding,setFinding]=useState(false);
 // Ctrl+F opens the find bar unless Monaco (its own find), the terminal or a form field has focus.
 useEffect(()=>{
  if(compact)return;
  const key=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='f'&&!typing(e.target)){e.preventDefault();setFinding(true);}};
  window.addEventListener('keydown',key);return ()=>window.removeEventListener('keydown',key);
 },[compact]);
 // Link to other.md#heading: scroll once this file's rendered view exists.
 useEffect(()=>{
  if(!scrollTo||tooBig)return;
  findAnchor(article.current,scrollTo)?.scrollIntoView({block:'start'});onScrolled?.();
 },[scrollTo,body,tooBig,onScrolled]);
 useEffect(()=>{
  if(!onHeadings)return;
  onHeadings([...(article.current?.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')||[])].map(h=>({id:h.id,text:h.textContent||'',level:Number(h.tagName[1])})));
 },[body,tooBig,onHeadings]);
 const components=useMemo<Components>(()=>({
  a:({href,children})=>{
   const link=classifyLink(href,from);
   if(link.kind==='external')return <a href={link.target} target="_blank" rel="noopener noreferrer" title={link.target}>{children}</a>;
   const click=(e:React.MouseEvent)=>{e.preventDefault();
    if(link.kind==='anchor')findAnchor(article.current,link.target)?.scrollIntoView({block:'start'});
    else if(link.kind==='doc')onOpenDoc?.(link.target,link.hash);};
   if(link.kind==='blocked')return <a className="md-link-blocked" role="link" aria-disabled="true" title={link.reason} onClick={click}>{children}</a>;
   return <a href={href} title={link.kind==='doc'?link.target:undefined} onClick={click}>{children}</a>;
  },
  img:({src,alt})=><MdImage src={typeof src==='string'?src:undefined} alt={alt} from={from} project={project}/>,
 }),[from,project,onOpenDoc]);
 if(tooBig)return <div className="readonly-box" role="status">This file is over 1 MB, so it isn’t rendered automatically. Use Source mode, or
  <button className="link-button" onClick={()=>setForce(true)}>render it anyway</button>.</div>;
 return <>
  {finding&&<FindBar root={article.current} version={body} onClose={()=>setFinding(false)}/>}
  {entries.length>0&&<div className="md-front">
   <button className="link-button" aria-expanded={showFront} onClick={()=>setShowFront(v=>!v)}>Front matter ({entries.length})</button>
   {showFront&&<table><tbody>{entries.map(([k,v],i)=><tr key={i}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>}
  </div>}
  <article ref={article} className={cn('markdown-reading',compact&&'compact')} data-testid="markdown-reading">
   {/* KaTeX and highlight build markup from already-sanitized nodes; KaTeX runs first so math blocks aren't highlighted. */}
   <ReactMarkdown remarkPlugins={breaks?[remarkGfm,remarkMath,remarkBreaks,remarkCallouts]:[remarkGfm,remarkMath,remarkCallouts]}
    rehypePlugins={[[rehypeSanitize,sanitizeSchema],rehypeKatex,rehypeHighlight,rehypeHeadingIds]} components={components}>{body}</ReactMarkdown>
  </article>
 </>;
}

// Table of contents for Preview mode; highlights the heading currently at the top of `scroller`.
export function Outline({headings,scroller}:{headings:Heading[];scroller:HTMLElement|null}){
 const [active,setActive]=useState(''),[all,setAll]=useState(false);
 useEffect(()=>{
  if(!scroller)return;
  // At the very bottom the last headings can't reach the top, so the lowest visible one counts as current.
  const update=()=>{const box=scroller.getBoundingClientRect(),end=scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-2;
   const top=end?box.bottom-1:box.top+48;let current=headings[0]?.id||'';
   for(const h of headings){const el=findAnchor(scroller,h.id);if(el&&el.getBoundingClientRect().top<=top)current=h.id;}
   setActive(current);};
  update();scroller.addEventListener('scroll',update,{passive:true});return ()=>scroller.removeEventListener('scroll',update);
 },[scroller,headings]);
 const deep=headings.some(h=>h.level>3),shown=all?headings:headings.filter(h=>h.level<=3);
 const items:ReactNode=shown.map((h,i)=><button key={h.id+i} className={cn('outline-row','level-'+h.level,active===h.id&&'active')} aria-current={active===h.id?'location':undefined}
  onClick={()=>{findAnchor(scroller,h.id)?.scrollIntoView({block:'start'});setActive(h.id);}}>{h.text}</button>);
 return <nav className="md-outline" aria-label="Outline">
  <div className="outline-head"><h3>Outline</h3>{deep&&<button className="link-button" onClick={()=>setAll(v=>!v)}>{all?'H1–H3 only':'All levels'}</button>}</div>
  {headings.length?items:<p className="side-note">No headings in this file.</p>}
 </nav>;
}
