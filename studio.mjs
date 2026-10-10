// Video Studio local browser server: loopback-only; no arbitrary filesystem access.
// Serves existing project HTML/assets without rewriting project files.
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat, writeFile, rename, lstat, realpath } from 'node:fs/promises';
import { extname, resolve, relative, sep, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectName } from './lib/production.mjs';
import { validateComposition } from './lib/composition.mjs';
import { createHash } from 'node:crypto';
import { isProcessAlive } from './lib/recovery.mjs';
import { workspaceEntries, readWorkspaceText, workspaceMediaFile, workspaceDocumentFile, workspaceEditableText } from './lib/studio-workspace.mjs';
import { createStudioTasks } from './lib/studio-tasks.mjs';
import { receiveAsset, renameAsset } from './lib/studio-assets.mjs';
import { attachLocalTerminal } from './lib/studio-terminal.mjs';
import { uploadManaged, operateManaged, listTrash, restoreManaged } from './lib/studio-files.mjs';
import { createStudioProject } from './lib/studio-projects.mjs';
import { trashProject, listDeletedProjects, restoreProject } from './lib/studio-project-trash.mjs';

export const APP_ROOT = fileURLToPath(new URL('.', import.meta.url));
export const ROOT = process.env.VIDEO_STUDIO_ROOT ? resolve(process.env.VIDEO_STUDIO_ROOT) : APP_ROOT;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.jpe':'image/jpeg', '.jfif':'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.avif':'image/avif', '.apng':'image/apng', '.bmp':'image/bmp', '.ico':'image/x-icon',
  '.tif':'image/tiff', '.tiff':'image/tiff', '.heic':'image/heic', '.heif':'image/heif',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4', '.webm':'video/webm', '.gif':'image/gif', '.ogg':'audio/ogg',
  '.pdf':'application/pdf', '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

function permitted(path) {
  const parts = path.split('/').filter(Boolean);
  if (parts.some(p => p === '.' || p === '..' || p.includes('\\') || p.startsWith('.'))) return false;
  if (parts[0] === 'studio') return parts.length === 2 && ['index.html','terminal.js','preview-bridge.js'].includes(parts[1]);
  if (parts[0] === 'lib') return parts.length === 2 && ['hf-adapter.js', 'fx.js', 'compose-browser.js'].includes(parts[1]);
  if (parts[0] === 'components') return parts.length === 2 && ['registry.json','render.js'].includes(parts[1]);
  if (parts[0] === 'styles') return parts.length >= 3 && parts.length <= 5;
  if (parts[0] === 'sfx') return parts.length === 2 && pAudio(parts[1]);
  if (parts[0] === 'projects') {
    if (parts.length < 4) return false;
    try { projectName(parts[1]); } catch { return false; }
    return (parts[2] === 'source' || parts[2] === 'output') && parts.length < 9;
  }
  return false;
}
function pAudio(name) { return /\.(mp3|m4a|wav|ogg)$/i.test(name); }
function sendJson(res, obj, code = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
  res.end(body);
}
async function safeStaticProjectFile(pathname,file) {
  if(!pathname.startsWith('/projects/'))return file;
  const parts=pathname.split('/').filter(Boolean);
  const project=parts[1],kind=parts[2];
  projectName(project);
  if(!['source','output'].includes(kind))throw Error('Invalid project file category');
  const projectDir=join(ROOT,'projects',project);
  const projectInfo=await lstat(projectDir);
  if(!projectInfo.isDirectory()||projectInfo.isSymbolicLink())
    throw Error('Project directory is a symlink');
  const rootDir=join(projectDir,kind);
  const rootInfo=await lstat(rootDir);
  if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink())
    throw Error('Project file root is a symlink');
  const realRoot=await realpath(rootDir);
  const realFile=await realpath(file);
  const pathWithin=relative(realRoot,realFile);
  if(pathWithin==='..'||pathWithin.startsWith('..'+sep)||isAbsolute(pathWithin))
    throw Error('Project file symlink escapes the workspace');
  return realFile;
}
function allowedPath(pathname) {
  const path = pathname === '/' ? '/studio/index.html' : pathname;
  if (!permitted(path)) return null;
  // Built-in Preview bridge belongs to the Electron app, not the writable workspace.
  // Projects and their imported assets still resolve against ROOT.
  const base = path.startsWith('/studio/') ? APP_ROOT : ROOT;
  const full = resolve(base, path.slice(1));
  const rel = relative(base, full);
  if (!rel || rel.startsWith('..') || rel.includes('..' + sep)) return null;
  return full;
}
export async function projects() {
  const entries = await readdir(join(ROOT, 'projects'), { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try { projectName(entry.name); } catch { continue; }
    const source = join(ROOT, 'projects', entry.name, 'source', 'index.html');
    if (!(await stat(source).catch(() => null))) continue;
    const video = join(ROOT, 'projects', entry.name, 'output', entry.name + '.mp4');
    result.push({ name: entry.name, hasVideo: Boolean(await stat(video).catch(() => null)) });
  }
  return result;
}

async function compositionApi(req, res, project, pathname) {
  try { projectName(project); } catch { return sendJson(res, { error:'Invalid project' }, 400); }
  const source = join(ROOT, 'projects', project, 'source', 'composition.json');
  const original = await readFile(source, 'utf8').catch(e => {
    if (e.code === 'ENOENT') return null;
    throw e;
  });
  if (original === null) return sendJson(res, { error:'This project is authored in HTML, not editable JSON' }, 404);
  // JSON compositions are writable; reject symlinks before writing their source
  // or generated JS sidecar outside a real project directory.
  await safeStaticProjectFile('/projects/'+project+'/source/composition.json',source);
  const etag = '"' + createHash('sha256').update(original).digest('hex') + '"';
  if (req.method === 'GET') {
    const comp = JSON.parse(original);
    const body = JSON.stringify(comp);
    res.writeHead(200, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', ETag: etag });
    res.end(body);
    return;
  }
  if (req.method !== 'PUT') return sendJson(res,{error:'Method not allowed'},405);
  const host = req.headers.host;
  if (req.headers.origin !== 'http://' + host) return sendJson(res,{error:'Origin rejected'},403);
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') return sendJson(res,{error:'JSON required'},415);
  if (req.headers['if-match'] !== etag) return sendJson(res,{error:'Composition has changed; reload before saving'},412);
  const lockFile=join(ROOT,'projects',project,'output','.'+project+'.render.lock');
  const lockText=await readFile(lockFile,'utf8').catch(()=>null);
  if(lockText){
    try {
      const lock=JSON.parse(lockText);
      if(isProcessAlive(lock.pid))return sendJson(res,{error:'Video is currently rendering; edit after it completes'},423);
    }catch{}
  }
  let bytes = 0, body = '';
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 64 * 1024) return sendJson(res,{error:'Composition too large'},413);
    body += chunk.toString();
  }
  let input;
  try { input = JSON.parse(body); } catch { return sendJson(res,{error:'Malformed JSON'},400); }
  if (input.id !== project) return sendJson(res,{error:'Composition ID cannot change'},400);
  try { validateComposition(input); } catch (e) { return sendJson(res,{error:e.message},422); }
  // Keep DOM element ids stable. Only time, track and component props may change
  // through this minimal editor (HTML structural editing is intentionally excluded).
  const oldIds = JSON.parse(original).clips.map(c=>c.id).sort().join(',');
  const newIds = input.clips.map(c=>c.id).sort().join(',');
  if (oldIds !== newIds) return sendJson(res,{error:'Clip IDs must match existing HTML elements'},422);
  const staging = source + '.stage-' + process.pid + '-' + Date.now();
  const jsfile = join(ROOT, 'projects', project, 'source', 'composition-data.js');
  const jsStage = jsfile + '.stage-' + process.pid + '-' + Date.now();
  const jsContent = '// Generated from composition.json by Video Studio\nwindow.VIDEO_COMPOSITION = ' +
    JSON.stringify(input) + ';\n';
  const priorJs = await readFile(jsfile, 'utf8').catch(() => null);
  try {
    await writeFile(staging,JSON.stringify(input,null,2)+'\n','utf8');
    await writeFile(jsStage,jsContent,'utf8');
    await rename(jsStage,jsfile);
    try { await rename(staging,source); }
    catch (error) {
      if (priorJs !== null) await writeFile(jsfile,priorJs,'utf8');
      throw error;
    }
  } finally {
    await (await import('node:fs/promises')).rm(staging,{force:true}).catch(()=>{});
    await (await import('node:fs/promises')).rm(jsStage,{force:true}).catch(()=>{});
  }
  return sendJson(res,{ok:true,updated:project});
}

export function createStudioServer(options={}) {
  const modern=Boolean(options.modern);
  const tasks=createStudioTasks(ROOT);
  // Serialize optimistic-concurrency writes. Checking If-Match outside a lock
  // lets simultaneous saves both observe an old ETag and silently overwrite.
  const pendingWrites=new Map();
  async function serialWrite(key,work){
    const previous=pendingWrites.get(key);
    let release;
    const current=new Promise(resolve=>{release=resolve});
    pendingWrites.set(key,current);
    if(previous)await previous;
    try{return await work()}
    finally{
      if(pendingWrites.get(key)===current)pendingWrites.delete(key);
      release();
    }
  }
  const sendError=(res,error)=>{
    const code=error.message==='Invalid project name: use lowercase letters, numbers and hyphens only'?400:
      error.code==='ENOENT'?404:400;
    sendJson(res,{error:error.message},code);
  };
  async function jsonPost(req,max=4096) {
    let chunks=[],bytes=0;
    for await (const b of req){bytes+=b.length;if(bytes>max)throw new Error('Request body too large');chunks.push(b);}
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
    catch{throw new Error('Expected valid JSON');}
  }
  function requireStudioOrigin(req){
    const host=req.headers.host||'';
    if (!/^((127\.0\.0\.1)|(localhost)):\d{2,5}$/.test(host))
      throw new Error('Studio API only accepts local Host headers');
    if (req.headers.origin!=='http://'+host)throw new Error('Origin rejected');
  }
  const server=http.createServer(async (req, res) => {
    try {
      const parsedUrl=new URL(req.url,'http://localhost');
      const pathname = parsedUrl.pathname;
      if(pathname.startsWith('/api/studio/preview/') && req.method==='GET'){
        const project=pathname.slice('/api/studio/preview/'.length);
        projectName(project);
        const file=join(ROOT,'projects',project,'source','index.html');
        const safeFile=await safeStaticProjectFile('/projects/'+project+'/source/index.html',file);
        let html=await readFile(safeFile,'utf8');
        const base='/projects/'+encodeURIComponent(project)+'/source/';
        const bridge='<script src="/studio/preview-bridge.js"></script>';
        const baseTag='<base href="'+base+'">';
        html=html.replace(/<\/head>/i,baseTag+'</head>');
        html=html.replace(/<\/body>/i,bridge+'</body>');
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
          'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
          'Content-Security-Policy':"default-src 'self' https: data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https:; img-src 'self' https: data: blob:; media-src 'self' blob: data:; frame-ancestors 'self'"});
        return res.end(html);
      }
      // React production build; original Studio remains available at root for rollback.
      if((pathname==='/app'||pathname==='/app/'||pathname.startsWith('/app/assets/')) &&
        (req.method==='GET'||req.method==='HEAD')){
        const local=pathname==='/app'||pathname==='/app/'?'index.html':pathname.slice('/app/'.length);
        if(!/^index\.html$|^assets\/[a-zA-Z0-9._-]+\.(?:js|css|svg|png|webp|woff2?)$/.test(local))
          return sendJson(res,{error:'Invalid frontend path'},403);
        const target=resolve(ROOT,'dist-ui',local);
        if(!target.startsWith(resolve(ROOT,'dist-ui')+sep))
          return sendJson(res,{error:'Forbidden'},403);
        const data=await readFile(target);
        res.writeHead(200,{'Content-Type':local.endsWith('.html')?'text/html; charset=utf-8':
          local.endsWith('.js')?'text/javascript; charset=utf-8':
          local.endsWith('.css')?'text/css; charset=utf-8':
          local.endsWith('.svg')?'image/svg+xml':
          'application/octet-stream','Content-Length':data.length,
          'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
        return req.method==='HEAD'?res.end():res.end(data);
      }
      if(pathname==='/api/studio/projects/trash'&&req.method==='GET')return sendJson(res,await listDeletedProjects(ROOT));
      if(pathname==='/api/studio/projects/trash'&&req.method==='POST'){
        requireStudioOrigin(req);
        const body=await jsonPost(req);
        if(body.confirm!==body.project)throw Error('Project name confirmation does not match');
        return sendJson(res,await trashProject(ROOT,body.project,{active:tasks.current()}));
      }
      if(pathname==='/api/studio/projects/restore'&&req.method==='POST'){
        requireStudioOrigin(req);
        const body=await jsonPost(req);
        return sendJson(res,await restoreProject(ROOT,body.id));
      }
      if(pathname==='/api/projects'&&req.method==='POST'){
        requireStudioOrigin(req);
        const details=await jsonPost(req);
        return sendJson(res,await createStudioProject(ROOT,details),201);
      }
      if(pathname==='/api/terminal/status'&&req.method==='GET')return terminal.status(req,res,sendJson);
      if(pathname==='/api/terminal/login'&&req.method==='POST')return await terminal.authenticate(req,res,sendJson);
      if(pathname.startsWith('/vendor/')&&(req.method==='GET'||req.method==='HEAD')){
        const files={
          '/vendor/xterm.mjs':'@xterm/xterm/lib/xterm.mjs',
          '/vendor/addon-fit.mjs':'@xterm/addon-fit/lib/addon-fit.mjs',
          '/vendor/xterm.css':'@xterm/xterm/css/xterm.css',
        };
        const source=files[pathname];
        if(!source)return sendJson(res,{error:'Unknown vendor asset'},404);
        const {createRequire}=await import('node:module');
        const path=await import('node:path');
        const pkg=createRequire(import.meta.url);
        const nodeModule=path.join(APP_ROOT,'node_modules',source);
        const body=await readFile(nodeModule);
        res.writeHead(200,{'Content-Type':pathname.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8',
          'Content-Length':String(body.length),'X-Content-Type-Options':'nosniff'});
        return req.method==='HEAD'?res.end():res.end(body);
      }


      if (pathname==='/api/studio/files/upload' && req.method==='POST'){
        requireStudioOrigin(req);
        if(req.headers['content-type']!=='application/octet-stream')
          return sendJson(res,{error:'Binary upload required'},415);
        const info=await uploadManaged(req,ROOT,{
          project:parsedUrl.searchParams.get('project'),
          location:parsedUrl.searchParams.get('location'),
          name:parsedUrl.searchParams.get('name'),
        });
        return sendJson(res,info,201);
      }
      if(pathname==='/api/studio/files/action'&&req.method==='POST'){
        requireStudioOrigin(req);
        return sendJson(res,await operateManaged(ROOT,await jsonPost(req)));
      }
      if(pathname==='/api/studio/files/trash'&&req.method==='GET'){
        const project=parsedUrl.searchParams.get('project');
        return sendJson(res,await listTrash(ROOT,project));
      }
      if(pathname==='/api/studio/files/restore'&&req.method==='POST'){
        requireStudioOrigin(req);
        return sendJson(res,await restoreManaged(ROOT,await jsonPost(req)));
      }
      if (pathname==='/api/studio/assets/upload' && req.method==='POST'){
        requireStudioOrigin(req);
        if(req.headers['content-type']!=='application/octet-stream')return sendJson(res,{error:'Binary media required'},415);
        const result=await receiveAsset(req,ROOT,{
          project:parsedUrl.searchParams.get('project'),
          location:parsedUrl.searchParams.get('location'),
          name:parsedUrl.searchParams.get('name'),
        });
        return sendJson(res,result,201);
      }
      if (pathname==='/api/studio/assets/rename' && req.method==='POST'){
        requireStudioOrigin(req);
        const body=await jsonPost(req);
        return sendJson(res,await renameAsset(ROOT,body));
      }
      if (pathname==='/api/studio/entries' && req.method==='GET'){
        const project=parsedUrl.searchParams.get('project'),group=parsedUrl.searchParams.get('group');
        return sendJson(res,await workspaceEntries(ROOT,project,group));
      }
      if (pathname==='/api/studio/source' && (req.method==='GET'||req.method==='PUT')){
        const runSource=async()=>{
        const project=parsedUrl.searchParams.get('project');
        const item=await workspaceEditableText(ROOT,project,parsedUrl.searchParams.get('group'),parsedUrl.searchParams.get('path'));
        const original=await readFile(item.absolute,'utf8');
        const etag='"'+createHash('sha256').update(original).digest('hex')+'"';
        if(req.method==='GET'){
          res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','ETag':etag,'Cache-Control':'no-store'});
          return res.end(JSON.stringify({text:original,etag}));
        }
        requireStudioOrigin(req);
        if(req.headers['if-match']!==etag)return sendJson(res,{error:'File changed on disk. Reload before saving.'},412);
        const renderLock=join(ROOT,'projects',project,'output','.'+project+'.render.lock');
        const lock=await readFile(renderLock,'utf8').catch(()=>null);
        if(lock){try{if(isProcessAlive(JSON.parse(lock).pid))return sendJson(res,{error:'Cannot save during active render'},423)}catch{}}
        let chunks=[],bytes=0;
        for await(const chunk of req){bytes+=chunk.length;if(bytes>512*1024)throw Error('Source exceeds 512 KB');chunks.push(chunk)}
        const textBody=Buffer.concat(chunks).toString('utf8');
        if(textBody.includes('\0'))throw Error('Invalid source text');
        const {randomUUID}=await import('node:crypto');
        const {rm}=await import('node:fs/promises');
        const stage=item.absolute+'.vs-edit-'+randomUUID();
        try{await writeFile(stage,textBody,{flag:'wx'});await rename(stage,item.absolute)}
        finally{await rm(stage,{force:true}).catch(()=>{})}
        return sendJson(res,{ok:true,etag:'"'+createHash('sha256').update(textBody).digest('hex')+'"'});
        };
        return req.method==='PUT'?await serialWrite('source:'+parsedUrl.searchParams.get('project'),runSource):await runSource();
      }
      if (pathname==='/api/studio/text' && req.method==='GET'){
        const project=parsedUrl.searchParams.get('project'),group=parsedUrl.searchParams.get('group');
        return sendJson(res,await readWorkspaceText(ROOT,project,group,parsedUrl.searchParams.get('path')));
      }
      let studioMedia=null;
      if (pathname==='/api/studio/document' && (req.method==='GET'||req.method==='HEAD')){
        studioMedia=await workspaceDocumentFile(ROOT,parsedUrl.searchParams.get('project'),
          parsedUrl.searchParams.get('group'),parsedUrl.searchParams.get('path'));
      }
      if (pathname==='/api/studio/media' && (req.method==='GET'||req.method==='HEAD')){
        studioMedia=await workspaceMediaFile(ROOT,parsedUrl.searchParams.get('project'),
          parsedUrl.searchParams.get('group'),parsedUrl.searchParams.get('path'));
      }
      if (pathname==='/api/studio/task' && req.method==='POST'){
        requireStudioOrigin(req);
        const body=await jsonPost(req);
        return sendJson(res,tasks.launch(body.project,body.command),202);
      }
      if (pathname==='/api/studio/task' && req.method==='GET'){
        const id=parsedUrl.searchParams.get('id');
        return sendJson(res,id?tasks.get(id):{active:tasks.current(),history:tasks.list()});
      }
      if (pathname==='/api/studio/task/cancel' && req.method==='POST'){
        requireStudioOrigin(req);
        const body=await jsonPost(req);
        return sendJson(res,{cancelRequested:tasks.stop(body.id)});
      }
      if (pathname.startsWith('/api/compositions/')) {
        const operation=()=>compositionApi(req,res,pathname.slice('/api/compositions/'.length),pathname);
        return req.method==='PUT'?
          await serialWrite('composition:'+pathname.slice('/api/compositions/'.length),operation):
          await operation();
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, { error: 'Method not allowed' }, 405);
      if (pathname === '/api/projects') return sendJson(res, await projects());
      let modernFile=null;
      if(modern){
        if(pathname==='/'||pathname==='/index.html')modernFile=join(APP_ROOT,'studio','dist','index.html');
        else if(/^\/app-assets\/[a-zA-Z0-9_.-]+$/.test(pathname))
          modernFile=join(APP_ROOT,'studio','dist',pathname.slice(1));
      }
      if(pathname==='/legacy')modernFile=join(APP_ROOT,'studio','index.html');
      const candidate = studioMedia?.absolute || modernFile || allowedPath(pathname);
      if (!candidate) return sendJson(res, { error: 'Forbidden path' }, 403);
      const file = await safeStaticProjectFile(pathname,candidate);
      const extension=extname(file).toLowerCase();
      const originalDownload=Boolean(pathname==='/api/studio/media'&&parsedUrl.searchParams.get('download')==='1');
      const convertImage=Boolean(studioMedia?.type==='image'&&!originalDownload&&['.tif','.tiff','.heic','.heif'].includes(extension));
      const mime = convertImage?'image/png':MIME[extension];
      if (!mime) return sendJson(res, { error: 'Unsupported file type' }, 403);
      const headers = {
        'Content-Type': mime,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self' https: data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https:; img-src 'self' https: data: blob:; media-src 'self' blob: data:; font-src 'self' https: data:; frame-ancestors 'self'",
      };
      if(originalDownload)headers['Content-Disposition']="attachment; filename*=UTF-8''"+encodeURIComponent(file.split(/[\\/]/).pop());
      if(pathname==='/api/studio/document' && extname(file).toLowerCase()!=='.pdf')
        headers['Content-Disposition']='attachment; filename="document'+extname(file).toLowerCase()+'"';
      // SVG is untrusted markup: keep it drawable in an <img>, but never runnable
      // as same-origin code when someone navigates directly to its URL.
      if(extension==='.svg'){
        headers['Content-Security-Policy']="sandbox; script-src 'none'; object-src 'none'; base-uri 'none'";
      }
      if(convertImage){
        const {default:sharp}=await import('sharp');
        let data;
        try{
          data=await sharp(file,{limitInputPixels:80*1024*1024,failOn:'error'})
            .rotate().resize({width:3000,height:4000,fit:'inside',withoutEnlargement:true})
            .png().toBuffer();
        }catch(error){
          return sendJson(res,{error:'This image codec cannot be decoded for preview: '+error.message},415);
        }
        res.writeHead(200,{...headers,'Content-Length':data.length});
        return req.method==='HEAD'?res.end():res.end(data);
      }

      // Browsers seek within an MP4 using HTTP byte ranges. Returning the entire
      // file from readFile() prevented reliable audio scrubbing and used excessive RAM.
      if (extname(file).toLowerCase() === '.mp4') {
        const info = await stat(file);
        const size = info.size;
        headers['Accept-Ranges'] = 'bytes';
        let start = 0, end = size - 1, code = 200;
        if (req.headers.range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
          if (!match || (!match[1] && !match[2])) {
            res.writeHead(416, { ...headers, 'Content-Range': 'bytes */' + size });
            return res.end();
          }
          if (match[1]) {
            start = Number(match[1]);
            end = match[2] ? Number(match[2]) : size - 1;
          } else {
            const suffix = Number(match[2]);
            start = Math.max(0, size - suffix);
            end = size - 1;
          }
          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
            start < 0 || start >= size || end < start || (size === 0)) {
            res.writeHead(416, { ...headers, 'Content-Range': 'bytes */' + size });
            return res.end();
          }
          end = Math.min(end, size - 1);
          code = 206;
          headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size;
        }
        headers['Content-Length'] = String(Math.max(0, end - start + 1));
        res.writeHead(code, headers);
        if (req.method === 'HEAD') return res.end();
        const stream = createReadStream(file, { start, end });
        stream.on('error', (error) => res.destroy(error));
        res.on('close', () => stream.destroy());
        stream.pipe(res);
        return;
      }
      const data = await readFile(file);
      res.writeHead(200, { ...headers, 'Content-Length': data.length });
      if (req.method === 'HEAD') res.end(); else res.end(data);
    } catch (error) {
      const api=req.url?.startsWith('/api/studio/');
      if(api)sendError(res,error);
      else sendJson(res, { error: error.code === 'ENOENT' ? 'Not found' : error.message }, error.code === 'ENOENT' ? 404 : 500);
    }
  });
  const terminal=attachLocalTerminal(server,{root:ROOT,enabled:Boolean(options.terminal)});
  server.terminalAccessCode=terminal.secret;
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv=process.argv.slice(2);
  const terminalEnabled=argv.includes('--terminal');
  const modern=argv.includes('--modern');
  const specified=argv.filter(a=>a!=='--terminal'&&a!=='--modern');
  const port=specified.length?Number(specified[0]):4177;
  if (specified.length>1||!Number.isSafeInteger(port)||port<1024||port>65535)
    throw new Error('Usage: node studio.mjs [port] [--terminal] [--modern]');
  const server=createStudioServer({terminal:terminalEnabled,modern});
  server.listen(port,'127.0.0.1',()=>{
    console.log('Video Studio: http://127.0.0.1:'+port);
    if(terminalEnabled){
      console.log('LOCAL POWERSHELL TERMINAL ENABLED (full user permissions).');
      console.log('Terminal access code: '+server.terminalAccessCode);
      console.log('Do not share this code or expose port '+port+' outside 127.0.0.1.');
    }
  });
}
