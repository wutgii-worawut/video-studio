// Runs in an opaque-origin sandboxed preview iframe. The parent never accesses the DOM.
// Send only scene metadata and timings via postMessage.
(() => {
 let ready=false;
 const snapshot=()=>{
  const nodes=[...document.querySelectorAll('.scene')];
  return nodes.filter(el=>{
   let opacity=1,cursor=el;
   const rect=el.getBoundingClientRect();
   while(cursor){opacity*=Number(getComputedStyle(cursor).opacity)||0;cursor=cursor.parentElement;}
   const style=getComputedStyle(el);
   return rect.width>0&&rect.height>0&&opacity>=.06&&style.visibility!=='hidden'&&style.display!=='none';
  }).map(el=>({id:el.id||'scene',label:el.getAttribute('data-label')||el.id||'Scene'}));
 };
 const send=(kind,body={})=>parent.postMessage({studioPreview:true,type:kind,...body},'*');
 function scan(){
  const duration=Number(window.DUR)||15;
  const step=Math.max(.5,duration/110);
  const scenes=[];
  let previous='',opened=null;
  for(let t=0;t<=duration;t+=step){
   try{window.render(Math.min(t,Math.max(0,duration-1/30)));}catch{continue;}
   const items=snapshot(),signature=items.map(s=>s.id).join('|');
   if(previous!==signature){
    if(opened){opened.end=t;scenes.push(opened);}
    opened=items.length?{id:signature||'scene',label:items.map(s=>s.label).join(', '),start:t,end:duration}:null;
    previous=signature;
   }
  }
  if(opened){opened.end=duration;scenes.push(opened);}
  window.render(0);
  send('VS_SCENES',{scenes});
 }
 let attempts=0;
 const timer=setInterval(()=>{
  if(typeof window.render==='function'&&(window.__compositionReady!==false||attempts>=25)){
   clearInterval(timer);
   ready=true;
   window.render(0);
   send('VS_READY',{duration:Number(window.DUR)||15,fps:30,scenes:snapshot()});
   setTimeout(scan,100);
  }else if(++attempts>190){clearInterval(timer);send('VS_ERROR',{error:window.__compositionError||'Preview render(t) unavailable'});}
 },45);
 addEventListener('message',(event)=>{
  if(event.source!==parent||!ready||!event.data||!event.data.studioParent)return;
  if(event.data.type==='SEEK'){
   const t=Number(event.data.time);
   if(!Number.isFinite(t))return;
   try{window.render(Math.max(0,Math.min(t,Number(window.DUR)||15)));}
   catch(error){send('VS_ERROR',{error:String(error)})}
  }
 });
})();
