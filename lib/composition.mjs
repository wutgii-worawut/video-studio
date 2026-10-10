// Structured composition contract for new HTML videos.
// Existing hand-crafted render(t) projects continue to work unchanged.
const ID = /^[a-z][a-z0-9-]{0,79}$/;

export function validateComposition(input) {
  if (!input || typeof input !== 'object' || !ID.test(input.id || '')) throw new Error('Composition id is required');
  const fps = input.fps ?? 30, width = input.width ?? 1080, height = input.height ?? 1920;
  if (![fps,width,height].every(Number.isFinite) || fps <= 0 || fps > 120 || width < 1 || height < 1)
    throw new Error('Invalid composition dimensions or FPS');
  if (!Array.isArray(input.clips) || !input.clips.length || input.clips.length > 500)
    throw new Error('Composition requires between 1 and 500 clips');
  const ids = new Set();
  const clips = input.clips.map((clip, i) => {
    if (!clip || !ID.test(clip.id || '')) throw new Error('Invalid clip id ' + i);
    if (ids.has(clip.id)) throw new Error('Duplicate clip id: ' + clip.id);
    ids.add(clip.id);
    const start = clip.start, duration = clip.duration;
    if (!Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || duration <= 0)
      throw new Error('Invalid timing for ' + clip.id);
    if (![start * fps, duration * fps].every(n => Math.abs(n - Math.round(n)) < 1e-4))
      throw new Error('Clip times must align with FPS: ' + clip.id);
    const track = clip.track ?? 0;
    if (!Number.isSafeInteger(track) || track < 0 || track >= 100) throw new Error('Invalid track for ' + clip.id);
    return { id:clip.id, start, duration, end:start+duration, track,
      component:clip.component ?? 'custom', props:clip.props ?? {} };
  });
  const inferredDuration = Math.max(...clips.map(c=>c.end));
  const duration = input.duration ?? inferredDuration;
  if (!Number.isFinite(duration) || duration < inferredDuration-1e-6 || duration > 3600)
    throw new Error('Duration must contain every clip and be <= 3600s');
  return { id: input.id, fps, width, height, duration, clips: clips.sort((a,b)=>a.start-b.start||a.track-b.track) };
}

export function clipsAt(comp, time) {
  if (!Number.isFinite(time)) throw new Error('Invalid seek time');
  return comp.clips.filter(c => time >= c.start && time < c.end);
}

export function timelineManifest(comp) {
  return { protocolVersion:1, duration:comp.duration, fps:comp.fps, width:comp.width,
    height:comp.height, clips:comp.clips.map(({id,start,duration,track,component})=>({id,start,duration,track,component})) };
}
