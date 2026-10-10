// Allow-listed Studio tasks (lib/studio-tasks.mjs). Top bar menu and Render page share this list.
export const RENDER_ACTIONS=[
 {name:'Draft render',menu:'Fast, no motion blur — hear sound in sync',page:'Fast, no motion blur. Use it to hear sound in sync.',command:'render 1 2'},
 {name:'Final render',menu:'Motion blur, 8 subframes',page:'Motion blur, 8 subframes. Slow.',command:'render 8 2'},
 {name:'Check layout',menu:'Overflow, overlap, safe zone',page:'Overflow, overlaps, TikTok/Reels safe zone',command:'check'},
 {name:'Stills',menu:'One frame per scene',page:'One frame per scene → output/stills',command:'stills'},
 {name:'Probe',menu:'Verify the MP4 with ffprobe',page:'Verify the MP4 with ffprobe',command:'probe'},
 {name:'Tests',menu:'Run the test suite',page:'Run the project test suite',command:'test'},
] as const;
// Server labels look like "render <project> 1 2", "check <project>", "npm test"; map them back to the typed command.
export const typedCommand=(label:string,project:string)=>label==='npm test'?'test':label.replace(' '+project,'');
// "Rendering draft · 59%" for the top bar, from output/.render-status.json.
export function renderLabel(s:import('./api').RenderStatus){
 const what=s.mode==='video'?(s.args?.[0]==='1'?'Rendering draft':'Rendering final'):s.mode==='check'?'Checking layout':s.mode==='stills'?'Saving stills':s.mode==='audio'?'Mixing audio':'Rendering';
 return s.frames?.total?what+' · '+Math.floor(s.frames.done/s.frames.total*100)+'%':what;
}
export const taskName=(command:string)=>RENDER_ACTIONS.find(a=>a.command===command)?.name||command;
