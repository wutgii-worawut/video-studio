import {useState} from 'react';
import {useShallow} from 'zustand/react/shallow';
import {toast} from 'sonner';
import {Eraser,Plus} from 'lucide-react';
import {useStudio,useSceneItems} from '../lib/state';
import {QUICK_PROMPTS} from '../lib/prompts';
import {workspacePath,relPath} from '../lib/paths';
import {sendToTerminal,terminalReady} from './Console';
import {studioApi} from '../lib/api';

// 8.9 s → "00:08.90"
const centis=(t:number)=>{const c=Math.round(Math.max(0,t)*100);return String(Math.floor(c/6000)).padStart(2,'0')+':'+String(Math.floor(c/100)%60).padStart(2,'0')+'.'+String(c%100).padStart(2,'0')};
// Last meaningful log lines, one line, so it can sit in the prompt without pressing Enter.
const summary=(log:string)=>log.split('\n').map(l=>l.trim()).filter(l=>l&&!/^frame \d/.test(l)).slice(-8).join(' | ').slice(-1500);

export function InsertBar(){
 const {page,project,time,tabs,activeTab,codeLine,libraryFile,lastTaskLog,terminalKind}=useStudio(useShallow(s=>({page:s.page,project:s.project,time:s.time,tabs:s.tabs,activeTab:s.activeTab,codeLine:s.codeLine,libraryFile:s.libraryFile,lastTaskLog:s.lastTaskLog,terminalKind:s.terminalKind})));
 const scenes=useSceneItems();
 const [capturing,setCapturing]=useState(false);
 const chips:{label:string;text:string}[]=[];
 const at=(path:string)=>({label:'@'+path.replace('projects/'+project+'/',''),text:'@'+path});
 if(page==='director'&&project){
  chips.push({label:'เวลา '+centis(time),text:'ที่ '+centis(time)});
  const i=scenes.findIndex(s=>time>=s.start&&time<s.end);
  if(i>=0)chips.push({label:'ฉาก '+(i+1)+' '+scenes[i].label,text:'(ฉาก '+(i+1)+' '+scenes[i].label+')'});
  chips.push(at('projects/'+project+'/source/index.html'),at('projects/'+project+'/brand/brand.md'));
 }
 const tab=tabs.find(t=>t.key===activeTab);
 if(page==='code'&&tab){
  chips.push(at(workspacePath(project,tab.file)));
  chips.push({label:'line '+codeLine,text:'(บรรทัด '+codeLine+' ของ '+relPath(tab.file)+')'});
 }
 if(page==='library'&&libraryFile)chips.push(at(workspacePath(project,libraryFile)));
 if(page==='render'){
  if(lastTaskLog)chips.push({label:'last task output',text:'log ล่าสุด: '+summary(lastTaskLog)});
  if(project)chips.push(at('projects/'+project+'/output/'));
 }
 if(page==='projects')chips.push({label:'@projects/',text:'@projects/'});
 const insert=(text:string)=>sendToTerminal(text+' ');
 // Spec 8A: render the exact frame at the playhead to output/frames/ and hand Claude its path.
 const sendFrame=async()=>{
  if(!terminalReady()){toast.error('Terminal is locked or not connected — unlock it first');return;}
  useStudio.getState().set({playing:false});
  const at=Math.round(useStudio.getState().time*30)/30;
  setCapturing(true);
  try{const {path}=await studioApi.json<{path:string}>('/api/studio/frame',{project,time:at});insert('@'+path);}
  catch(e){toast.error('Frame capture: '+(e as Error).message);}
  finally{setCapturing(false);}
 };
 return <div className="insert-bar" aria-label="Insert into terminal">
  <span className="insert-label">Insert:</span>
  {page==='director'&&project&&<button className="insert-chip" disabled={capturing} title="Render this frame to output/frames/ and insert its @path" onClick={()=>void sendFrame()}><Plus size={12}/>{capturing?'กำลังถ่าย…':'ภาพเฟรม '+centis(time)}</button>}
  {chips.map(c=><button key={c.label} className="insert-chip" title={c.text} onClick={()=>insert(c.text)}><Plus size={12}/>{c.label}</button>)}
  {chips.length>0&&<span className="insert-divider"/>}
  {QUICK_PROMPTS[page].map(q=><button key={q.label} className="insert-prompt" title={q.text(project)} onClick={()=>insert(q.text(project))}>{q.label}</button>)}
  {/* Escape is PSReadLine's RevertLine; Ctrl+U (the spec's suggestion) inserts a stray character in PowerShell.
      Not offered on claude/codex tabs: their clear-line key hasn't been verified. */}
  {terminalKind==='powershell'&&<button className="insert-clear" title="Clear the line being typed (Esc)" onClick={()=>sendToTerminal('\u001b',{raw:true})}><Eraser size={13}/> Clear line</button>}
 </div>;
}
