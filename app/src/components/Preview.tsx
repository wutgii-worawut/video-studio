import {useEffect,useRef,useState,useCallback} from 'react';
import {Clapperboard,ArrowLeft,Maximize2,Minimize2,Pause,Play,SkipBack,SkipForward,Volume2,VolumeX,Film,Headphones} from 'lucide-react';
import {useStudio} from '../lib/state';
import {formatTime} from '../lib/utils';
import {Button,Badge} from './ui';

export function Preview(){
 const {project,projects,duration,time,playing,mute,volume,workspaceMode}=useStudio();
 const set=useStudio(s=>s.set);
 const iframe=useRef<HTMLIFrameElement>(null),audio=useRef<HTMLVideoElement>(null);
 const frame=useRef<HTMLDivElement>(null);
 const raf=useRef<number>(0),last=useRef(0),timeNow=useRef(0);
 const [ready,setReady]=useState(false),[frameStatus,setFrameStatus]=useState('Loading scene runtime…');
 const [soundStatus,setSoundStatus]=useState('Checking audio…'),[audioReady,setAudioReady]=useState(false);
 const hasVideo=projects.find(x=>x.name===project)?.hasVideo??false;
 // Source HTML is authored for a fixed 1080×1920 viewport. Scale the *whole
 // document*, not the iframe viewport, or the browser clips its top-left corner.
 useEffect(()=>{
   const holder=frame.current;
   if(!holder)return;
   const fit=()=>{
     const {width,height}=holder.getBoundingClientRect();
     holder.style.setProperty('--preview-scale',String(Math.min(width/1080,height/1920)));
   };
   const observer=new ResizeObserver(fit);
   observer.observe(holder);
   fit();
   return ()=>observer.disconnect();
 },[workspaceMode]);
 useEffect(()=>{timeNow.current=time},[time]);
 useEffect(()=>{
  setReady(false);setFrameStatus('Loading scene runtime…');setAudioReady(false);
  if(!project)return;
  setSoundStatus(hasVideo?'Loading latest rendered soundtrack…':'No rendered MP4 (silent preview)');
  const onMessage=(e:MessageEvent)=>{
   if(e.source!==iframe.current?.contentWindow||!e.data?.studioPreview)return;
   if(e.data.type==='VS_READY'){
    setReady(true);setFrameStatus('Scene runtime connected');
    set({duration:Number(e.data.duration)||15,scenes:[],time:0,playing:false});
   }
   if(e.data.type==='VS_SCENES'&&Array.isArray(e.data.scenes)){
    set({scenes:e.data.scenes.filter((s:unknown)=>s&&typeof s==='object').slice(0,240)});
    iframe.current?.contentWindow?.postMessage({studioParent:true,type:'SEEK',time:timeNow.current},'*');
   }
   if(e.data.type==='VS_ERROR')setFrameStatus('Preview issue: '+e.data.error);
  };
  window.addEventListener('message',onMessage);
  return ()=>window.removeEventListener('message',onMessage);
 },[project,hasVideo,set]);
 useEffect(()=>{
  if(ready)iframe.current?.contentWindow?.postMessage({studioParent:true,type:'SEEK',time},'*');
  const player=audio.current;
  if(player&&!playing&&audioReady&&Math.abs(player.currentTime-time)>.085){
   try{player.currentTime=Math.max(0,time)}catch{}
  }
 },[time,ready,playing,audioReady]);
 useEffect(()=>{
  const player=audio.current;
  if(!player)return;
  player.muted=mute;player.volume=volume;
 },[mute,volume]);
 useEffect(()=>{
  const player=audio.current;
  if(!player)return;
  player.pause();player.removeAttribute('src');player.load();setAudioReady(false);
  if(hasVideo&&project){player.src='/projects/'+encodeURIComponent(project)+'/output/'+encodeURIComponent(project)+'.mp4';player.load();}
 },[project,hasVideo]);
 useEffect(()=>{
  if(!playing){cancelAnimationFrame(raf.current);audio.current?.pause();return;}
  last.current=performance.now();
  const loop=(now:number)=>{
   const player=audio.current,hasClock=Boolean(hasVideo&&audioReady&&player&&!player.paused);
   let next=hasClock?player!.currentTime:timeNow.current+Math.min(.08,Math.max(0,(now-last.current)/1000));
   last.current=now;
   if(hasVideo&&audioReady&&player?.paused&& !player.ended){raf.current=requestAnimationFrame(loop);return;}
   if(next>=duration-.0001){
    next=Math.max(0,duration-1/30);
    set({time:next,playing:false});
    player?.pause();return;
   }
   timeNow.current=next;
   set({time:next});
   raf.current=requestAnimationFrame(loop);
  };
  raf.current=requestAnimationFrame(loop);
  return ()=>cancelAnimationFrame(raf.current);
 },[playing,hasVideo,audioReady,duration,set]);
 const seek=useCallback((t:number)=>{
  const next=Math.max(0,Math.min(duration-1/30,t));
  timeNow.current=next;set({time:next});
  const player=audio.current;
  if(player&&audioReady){try{player.currentTime=next}catch{}}
 },[duration,audioReady,set]);
 const togglePlay=()=>{
  if(playing){set({playing:false});audio.current?.pause();return;}
  if(timeNow.current>=duration-.035)seek(0);
  if(hasVideo&&audioReady&&audio.current){
   const promise=audio.current.play();
   promise?.catch(()=>{setSoundStatus('Audio unavailable — click Play again or use silent preview');setAudioReady(false);});
  }
  last.current=performance.now();set({playing:true});
 };
 const mode=workspaceMode==='preview';
 return <section className="preview-pane" aria-label="Live Preview">
  <div className="pane-toolbar"><div className="pane-heading"><Film size={16}/><span>LIVE PREVIEW</span><Badge>1080 × 1920</Badge></div><div className="pane-actions">
   <span className={'inline-status '+(ready?'connected':'')}>{ready?'● READY':'○ LOADING'}</span>
   <Button size="sm" variant="ghost" onClick={()=>set({workspaceMode:mode?'normal':'preview'})} aria-label={mode?'Restore workspace':'Expand preview'}>{mode?<Minimize2 size={15}/>:<Maximize2 size={15}/>}<span>{mode?'Restore':'Expand'}</span></Button>
  </div></div>
  <div className="preview-content">
   <div className="video-monitor"><div className="video-frame" ref={frame}>
    {project&&<iframe key={project} ref={iframe} title="Project animation preview" sandbox="allow-scripts" src={'/api/studio/preview/'+encodeURIComponent(project)+'?render'} />}
    {!ready&&<div className="frame-overlay"><div className="spinner"/><span>{frameStatus}</span></div>}
   </div></div>
   <div className="transport"><div className="transport-left"><Button variant="ghost" size="icon" aria-label="First frame" onClick={()=>{set({playing:false});seek(0)}}><SkipBack size={17}/></Button>
     <Button variant="ghost" size="icon" aria-label="Previous frame" onClick={()=>{set({playing:false});seek(Math.round(time*30-1)/30)}}><ArrowLeft size={16}/></Button>
     <Button size="icon" className="play-button" onClick={togglePlay} aria-label={playing?'Pause':'Play'} disabled={!ready}>{playing?<Pause size={17} fill="currentColor"/>:<Play size={17} fill="currentColor"/>}</Button>
     <Button variant="ghost" size="icon" aria-label="Next frame" onClick={()=>{set({playing:false});seek(Math.round(time*30+1)/30)}}><SkipForward size={16}/></Button>
    </div>
    <div className="timecode" aria-label="Playback time">{formatTime(time)} <span>/ {formatTime(duration)}</span></div>
    <div className="transport-right"><Button variant="ghost" size="icon" aria-label={mute?'Unmute':'Mute'} onClick={()=>set({mute:!mute})}>{mute?<VolumeX size={18}/>:<Volume2 size={18}/>}</Button>
     <input type="range" className="volume-range" aria-label="Volume" min="0" max="1" step=".05" value={volume} onChange={e=>set({volume:Number(e.target.value)})}/>
    </div>
   </div>
   <div className="audio-hint"><Headphones size={13}/><span>{soundStatus}</span><span className="hint-right">{hasVideo?'Audio from latest MP4':'Render to enable audio'}</span></div>
   <video ref={audio} style={{display:'none'}} preload="metadata" playsInline onLoadedMetadata={()=>{setAudioReady(true);setSoundStatus('Soundtrack ready · synced to rendered MP4')}} onError={()=>{setAudioReady(false);if(hasVideo)setSoundStatus('Could not load rendered MP4 soundtrack');}} onWaiting={()=>{if(playing)setSoundStatus('Buffering audio…')}} aria-hidden="true"/>
  </div>
 </section>;
}
export function Timeline(){
 const {time,duration,scenes,composition}=useStudio();
 const set=useStudio(s=>s.set);
 const ref=useRef<HTMLDivElement>(null);
 const percent=duration?Math.min(100,time/duration*100):0;
 const jump=(t:number)=>set({time:Math.max(0,t),playing:false});
 const stops=Array.from({length:6},(_,i)=>i*duration/5);
 return <section className="timeline-pane" aria-label="Timeline editor">
  <div className="timeline-head"><div className="pane-heading"><Clapperboard size={16}/><span>TIMELINE</span><Badge>{composition?'Editable composition':'Read-only scene mapping'}</Badge></div><div className="timeline-help">30 FPS <span>·</span> Click track to seek</div></div>
  <div className="timeline-body">
   <div className="track-labels"><div className="track-ruler-label">TRACKS</div><div className="track-label"><Film size={14}/> Visual</div><div className="track-label"><Headphones size={14}/> Soundtrack</div></div>
   <div className="timeline-tracks" ref={ref} onClick={e=>{if(e.target instanceof HTMLElement&&e.target.closest('button'))return;const rect=ref.current?.getBoundingClientRect();if(rect)jump(Math.max(0,Math.min(duration,((e.clientX-rect.left)/rect.width)*duration)));}}>
    <div className="track-ruler">{stops.map((n,i)=><span key={i} style={{left:(i/5*100)+'%'}}>{formatTime(n).slice(0,5)}</span>)}</div>
    <div className="track-lane visual-lane">{composition?composition.clips.map((c,i)=><button key={c.id} className={'timeline-clip clip-'+i%4} style={{left:(c.start/duration*100)+'%',width:(c.duration/duration*100)+'%'}} onClick={()=>jump(c.start)} title={c.id+' · '+c.component}>{c.id}</button>):
      scenes.length?scenes.map((s,i)=><button key={s.id+'-'+i} className={'timeline-clip clip-'+i%4} style={{left:(s.start/duration*100)+'%',width:(Math.max(.3,s.end-s.start)/duration*100)+'%'}} title={s.label} onClick={()=>jump(s.start)}>{s.label}</button>):
      <div className="track-placeholder">Detected scene clips will appear here</div>}
    </div>
    <div className="track-lane audio-lane"><div className="audio-strip"><Headphones size={13}/> Rendered MP4 soundtrack</div></div>
    <div className="playhead" style={{left:percent+'%'}}><span/></div>
   </div>
  </div>
 </section>;
}
