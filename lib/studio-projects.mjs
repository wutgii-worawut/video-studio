// New source-backed project creation. The existing render engine is retained.
import {mkdir,rm,writeFile,stat,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {projectName} from './production.mjs';
import {validateComposition} from './composition.mjs';

const FPS=30;
function normalizeTitle(value){
  if(typeof value!=='string'||!value.trim()||value.trim().length>90||/[\x00-\x1f]/.test(value))
    throw Error('Project title must be 1–90 characters');
  return value.trim();
}
export function projectTemplate(input){
  const name=projectName(input?.name);
  const title=normalizeTitle(input?.title||name);
  const template=input?.template??'blank';
  if(!['blank','starter'].includes(template))throw Error('Unknown project template');
  const duration=Number(input?.duration??6);
  if(!Number.isInteger(duration)||duration<2||duration>180)
    throw Error('Duration must be a whole number between 2 and 180 seconds');
  const frames=duration*FPS;
  const lengths=template==='starter'?
    [Math.floor(frames/3),Math.floor(frames/3),frames-2*Math.floor(frames/3)]:[frames];
  const elements=template==='starter'?[
    {component:'title-card',props:{title,subtitle:'Your new Video Studio project'}},
    {component:'callout',props:{text:'Edit this clip in the Composition Inspector'}},
    {component:'cta',props:{text:'Start creating!'}},
  ]:[{component:'title-card',props:{title,subtitle:'Import media or edit this title in the Inspector'}}];
  let frame=0;
  const clips=elements.map((item,i)=>{
    const clip={id:['intro','middle','outro'][i],start:frame/FPS,duration:lengths[i]/FPS,track:0,...item};
    frame+=lengths[i];return clip;
  });
  const composition={id:name,fps:FPS,width:1080,height:1920,duration,clips};
  validateComposition(composition);
  return {name,title,template,composition};
}
export function htmlStarter(ids){
  const scenes=ids.map(id=>'<div class="scene" id="'+id+'"></div>').join('\n');
  return [
    '<!doctype html><html lang="th"><head><meta charset="utf-8">',
    '<title>Video Studio Project</title><style>',
    'html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#091122}',
    '#root{position:relative;width:1080px;height:1920px;overflow:hidden;background:radial-gradient(circle at 50% 35%,#273f75,#0a1021 72%)}',
    '.scene{position:absolute;inset:0;visibility:hidden;will-change:opacity}',
    '</style></head><body><div id="root">',
    scenes,'</div>',
    '<script src="../../../components/render.js"></script>',
    '<script src="../../../lib/compose-browser.js"></script>',
    '<script src="composition-data.js"></script>',
    '<script>',
    'try {',
    '  const spec=window.VIDEO_COMPOSITION;',
    "  if(!spec)throw Error('composition-data.js missing');",
    "  const names={'title-card':'titleCard',callout:'callout',cta:'cta',counter:'counter'};",
    '  for(const clip of spec.clips){',
    '    const el=document.getElementById(clip.id);',
    '    const factory=VideoComponents[names[clip.component]];',
    "    if(!el||!factory)throw Error('Missing clip component: '+clip.id);",
    '    el.replaceChildren(factory(clip.props));',
    '  }',
    '  VideoCompositor.make(spec);',
    '  window.STILLS=[.5,Math.min(spec.duration-1/30,spec.duration/2),spec.duration-1/30];',
    "  if(!location.search.includes('render')){",
    '    const started=performance.now();',
    '    const loop=(now)=>{window.render(((now-started)/1000)%window.DUR);requestAnimationFrame(loop)};',
    '    requestAnimationFrame(loop);',
    '  }',
    '  window.render(0);',
    '  window.__compositionReady=true;',
    '} catch(e){window.__compositionError=e.message;console.error(e)}',
    '</script></body></html>',
    '',
  ].join('\n');
}
export async function createStudioProject(root,input){
  const spec=projectTemplate(input);
  const parent=await realpath(join(root,'projects'));
  const dest=join(parent,spec.name);
  if(await stat(dest).catch(()=>null))throw Error('Project name already exists');
  await mkdir(dest); // atomic and fails if another process created the same name
  try{
    for(const sub of ['source','source/img','brand','brand/sfx','docs','output'])
      await mkdir(join(dest,...sub.split('/')),{recursive:true});
    await writeFile(join(dest,'source','composition.json'),JSON.stringify(spec.composition,null,2)+'\n',{flag:'wx'});
    await writeFile(join(dest,'source','composition-data.js'),'// Generated from composition.json by Video Studio\nwindow.VIDEO_COMPOSITION = '+JSON.stringify(spec.composition)+';\n',{flag:'wx'});
    await writeFile(join(dest,'source','index.html'),htmlStarter(spec.composition.clips.map(c=>c.id)),{flag:'wx'});
    await writeFile(join(dest,'brand','brand.md'),'# '+spec.title+'\n\n## Brand guidelines\n\n- Set your colors and typography here.\n- Source images: source/img/. Brand media: brand/.\n- Set voice, soundtrack and FX guidance for the project here.\n',{flag:'wx'});
    await writeFile(join(dest,'docs','README.md'),'# '+spec.title+'\n\nCreated with Video Studio ('+spec.template+').\n\nUse the Composition Inspector to edit clips, Project Explorer to import assets, and Render Tasks to create MP4.\n',{flag:'wx'});
    return {ok:true,name:spec.name,title:spec.title,template:spec.template,hasVideo:false};
  }catch(e){
    await rm(dest,{recursive:true,force:true});
    throw e;
  }
}
