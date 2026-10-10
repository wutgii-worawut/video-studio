const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('videoStudioDesktop',Object.freeze({
 platform:process.platform,
 version:process.versions.electron,
 setTitle:(title)=>{if(typeof title==='string')ipcRenderer.send('vs:setTitle',title);},
 getWorkspace:()=>ipcRenderer.invoke('vs:getWorkspace'),
 readClipboard:()=>ipcRenderer.invoke('vs:clipboard-read'),
 writeClipboard:(text)=>ipcRenderer.invoke('vs:clipboard-write',text),
 setWorkspace:(value)=>ipcRenderer.invoke('vs:setWorkspace',value),
}));
