import {defaultSchema} from 'rehype-sanitize';

// Markdown helpers for MarkdownView: front matter, callouts, heading ids, links and images. No extra packages.
type Node={type:string;value?:string;tagName?:string;children?:Node[];properties?:Record<string,unknown>;data?:{hProperties?:Record<string,unknown>}};

// Leading `---` block is shown separately (raw key: value, no YAML parsing); the file itself is never changed.
export function splitFrontMatter(text:string){
 const m=/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
 if(!m)return {body:text,entries:[] as [string,string][]};
 const entries:[string,string][]=[];
 for(const line of m[1].split(/\r?\n/)){
  const kv=/^([\w.-]+):\s?(.*)$/.exec(line);
  if(kv)entries.push([kv[1],kv[2]]);else if(line.trim()&&entries.length)entries[entries.length-1][1]+='\n'+line;
 }
 return {body:text.slice(m[0].length),entries};
}

// GitHub-style ids: lowercase, punctuation dropped, spaces → '-'. \p{M} keeps Thai vowels and tone marks.
export function slugify(text:string){return text.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s_-]/gu,'').replace(/\s/g,'-');}
export const ID_PREFIX='user-content-';
const textOf=(n:Node):string=>n.type==='text'?n.value||'':(n.children||[]).map(textOf).join('');
// rehype plugin, runs after sanitize: unique id on every h1–h6 from the text that is actually rendered.
// Prefixed like sanitize's clobberPrefix so a heading can never reuse an id the app itself uses (e.g. "destination").
export function rehypeHeadingIds(){
 return (tree:Node)=>{
  const seen=new Map<string,number>();
  const walk=(n:Node)=>{
   if(n.type==='element'&&/^h[1-6]$/.test(n.tagName||'')){
    const base=slugify(textOf(n))||'section',count=seen.get(base)||0;
    seen.set(base,count+1);n.properties={...n.properties,id:ID_PREFIX+(count?base+'-'+count:base)};
   }
   n.children?.forEach(walk);
  };
  walk(tree);
 };
}

export const CALLOUTS=['note','tip','important','warning','caution'] as const;
// remark plugin: `> [!WARNING]` blockquote → <blockquote class="callout callout-warning">, marker removed.
export function remarkCallouts(){
 return (tree:Node)=>{
  const walk=(n:Node)=>{
   if(n.type==='blockquote'){
    const p=n.children?.[0],t=p?.type==='paragraph'?p.children?.[0]:undefined;
    const m=t?.type==='text'&&/^\[!(note|tip|important|warning|caution)\][ \t]*(\r?\n)?/i.exec(t.value||'');
    if(m&&p&&t){
     t.value=t.value!.slice(m[0].length);
     if(!t.value)p.children!.shift();
     if(!p.children!.length)n.children!.shift();
     n.data={...n.data,hProperties:{className:['callout','callout-'+m[1].toLowerCase()]}};
    }
   }
   n.children?.forEach(walk);
  };
  walk(tree);
 };
}
// Default GitHub schema plus callout classes on blockquote and remark-math classes on code; any other class written in the file is dropped.
export const sanitizeSchema={...defaultSchema,attributes:{...defaultSchema.attributes,
 blockquote:[...(defaultSchema.attributes?.blockquote||[]),['className','callout',...CALLOUTS.map(c=>'callout-'+c)]],
 code:[['className',/^language-./,'math-inline','math-display']]}};

// Resolve a relative link/image against the open file's workspace path. null = escapes the workspace.
export function resolveWorkspaceLink(from:string,href:string){
 const parts=from.split('/').slice(0,-1);
 let decoded;try{decoded=decodeURIComponent(href)}catch{return null}
 for(const part of decoded.split(/[\\/]/)){
  if(part==='..'){if(!parts.length)return null;parts.pop();}
  else if(part&&part!=='.')parts.push(part);
 }
 return parts.join('/');
}
export type LinkKind={kind:'external'|'anchor'|'doc'|'blocked';target:string;hash?:string;reason?:string};
export function classifyLink(href:string|undefined,from:string):LinkKind{
 if(!href)return {kind:'blocked',target:'',reason:'Link removed: unsafe or empty address'};
 if(/^https?:\/\//i.test(href))return {kind:'external',target:href};
 if(href.startsWith('#'))return {kind:'anchor',target:href.slice(1)};
 if(/^[a-z][a-z0-9+.-]*:/i.test(href)||href.startsWith('/')||href.startsWith('\\'))return {kind:'blocked',target:href,reason:'Only web links and links to other .md files open from here'};
 const [path,hash]=href.split('#');
 if(!/\.mdx?$/i.test(path))return {kind:'blocked',target:href,reason:'Only links to other .md files open from here'};
 const target=resolveWorkspaceLink(from,path);
 return target?{kind:'doc',target,hash}:{kind:'blocked',target:href,reason:'Points outside the workspace'};
}
// Relative image → /api/studio/media (group "assets": root 0 = source/, 1 = brand/). null = can't be served.
export function imageUrl(src:string|undefined,from:string,project:string){
 if(!src)return null;
 if(/^(https:|blob:|data:image\/)/i.test(src))return src;
 if(/^[a-z][a-z0-9+.-]*:/i.test(src)||src.startsWith('/'))return null;
 const target=resolveWorkspaceLink(from,src.split(/[?#]/)[0]),prefix='projects/'+project+'/';
 if(!project||!target?.startsWith(prefix))return null;
 const [root,...sub]=target.slice(prefix.length).split('/'),index=['source','brand'].indexOf(root);
 if(index<0||!sub.length)return null;
 return '/api/studio/media?'+new URLSearchParams({project,group:'assets',path:index+'/'+sub.join('/')});
}
