const {app,BrowserWindow,ipcMain,shell,session,clipboard}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
let server,win,port=0;
const host='127.0.0.1';
const preferenceFile=path.join(app.getPath('userData'),'workspace-path.txt');
const preferredWorkspace=fs.existsSync(preferenceFile)?fs.readFileSync(preferenceFile,'utf8').trim():'';
const startWorkspace=process.env.VIDEO_STUDIO_ROOT||preferredWorkspace||path.resolve(__dirname,'..');
const defaultWorkspace=app.isPackaged?path.join(app.getPath('userData'),'workspace'):startWorkspace;
function ensureWorkspace(){
 const target=app.isPackaged?((startWorkspace!==path.resolve(__dirname,'..'))?startWorkspace:defaultWorkspace):startWorkspace;
 if(app.isPackaged){
  const seed=path.join(process.resourcesPath,'workspace-seed');
  if(!fs.existsSync(path.join(target,'projects'))){
   fs.mkdirSync(target,{recursive:true});
   if(fs.existsSync(seed))fs.cpSync(seed,target,{recursive:true,force:false});
  }
  // Native Node subprocesses cannot import NPM ESM packages directly from app.asar.
  // Seed Playwright outside the archive. Existing workspaces are upgraded safely.
  for(const p of ['playwright','playwright-core']){
   const pkg=path.join(target,'node_modules',p);
   if(!fs.existsSync(pkg)){
    const source=path.join(seed,'node_modules',p);
    if(fs.existsSync(source)){fs.mkdirSync(path.dirname(pkg),{recursive:true});fs.cpSync(source,pkg,{recursive:true,force:false});}
   }
  }
  for(const file of ['render.mjs']){
   if(!fs.existsSync(path.join(target,file))&&fs.existsSync(path.join(seed,file)))
    fs.copyFileSync(path.join(seed,file),path.join(target,file));
  }
 }
 if(!fs.existsSync(path.join(target,'projects')))throw Error('Workspace must contain a projects folder');
 return target;
}
let workspace='';
function trusted(event){
 if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)return false;
 try{const u=new URL(event.senderFrame.url);return u.hostname===host&&Number(u.port)===port&&u.pathname==='/';}catch{return false}
}
const requireTrusted=(event)=>{if(!trusted(event))throw Error('Invalid desktop IPC caller');};
function title(value){return String(value).replace(/[\r\n]/g,' ').slice(0,100);}
ipcMain.on('vs:setTitle',(e,value)=>{if(trusted(e))win.setTitle(title(value));});
ipcMain.handle('vs:getWorkspace',e=>{requireTrusted(e);return workspace;});
ipcMain.handle('vs:clipboard-read',e=>{requireTrusted(e);return clipboard.readText()});
ipcMain.handle('vs:clipboard-write',(e,text)=>{requireTrusted(e);if(typeof text!=='string'||text.length>1024*1024)throw Error('Clipboard text invalid');clipboard.writeText(text);return true});
ipcMain.handle('vs:setWorkspace',(e,next)=>{
 requireTrusted(e);
 if(typeof next!=='string'||!path.isAbsolute(next)||!fs.existsSync(path.join(next,'projects'))||!fs.existsSync(path.join(next,'render.mjs')))
  throw Error('Select an existing Video Studio folder that contains projects/ and render.mjs');
 // Reboot the app rather than switching the render engine's cwd during live work.
 fs.mkdirSync(path.dirname(preferenceFile),{recursive:true});
 fs.writeFileSync(preferenceFile,next,'utf8');
 app.relaunch({args:process.argv.slice(1),execPath:process.execPath});
 app.exit(0);
 return true;
});
async function authenticateRenderer(){
 const origin='http://'+host+':'+port;
 const result=await fetch(origin+'/api/terminal/login',{method:'POST',
  headers:{Origin:origin,'Content-Type':'application/json'},
  body:JSON.stringify({token:server.terminalAccessCode})});
 if(!result.ok)throw Error('Terminal authentication failed');
 const cookie=result.headers.get('set-cookie')?.split(';')[0];
 if(!cookie)throw Error('No terminal cookie');
 const [name,value]=cookie.split('=');
 await session.defaultSession.cookies.set({url:origin+'/api/terminal/status',name,value,path:'/api/terminal',httpOnly:true,sameSite:'strict'});
}
async function start(){
 workspace=ensureWorkspace();
 process.env.VIDEO_STUDIO_ROOT=workspace;
 const {createStudioServer}=await import('../studio.mjs');
 server=createStudioServer({modern:true,terminal:true});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,host,resolve);});
 port=server.address().port;
 await authenticateRenderer();
 win=new BrowserWindow({width:1500,height:930,minWidth:780,minHeight:540,backgroundColor:'#0b101a',
  webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 win.setMenuBarVisibility(false);
 win.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\//.test(url))void shell.openExternal(url);return {action:'deny'};});
 win.webContents.on('will-navigate',(e,url)=>{if(url!=='http://'+host+':'+port+'/')e.preventDefault();});
 win.webContents.on('will-attach-webview',e=>e.preventDefault());
 await win.loadURL('http://'+host+':'+port+'/');
}
app.whenReady().then(start).catch(error=>{console.error('Failed to start desktop Studio:',error);app.exit(1);});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{try{server?.closeAllConnections();server?.close();}catch{}});
