// Browser counterpart of lib/composition.mjs.
// Pure seek from numeric t; no timers; compatible with HyperFrames adapter.
(() => {
  function make(spec) {
    if (!spec || !Array.isArray(spec.clips) || !Number.isFinite(spec.duration)) {
      throw new Error('Composition requires clips[] and duration');
    }
    const clips = spec.clips.map((clip) => {
      const el = document.getElementById(clip.id);
      if (!el) throw new Error('Composition DOM element not found: ' + clip.id);
      el.setAttribute('data-start', String(clip.start));
      el.setAttribute('data-duration', String(clip.duration));
      el.setAttribute('data-track-index', String(clip.track ?? 0));
      return { ...clip, el };
    });
    function seek(time) {
      if (!Number.isFinite(time)) throw new Error('Invalid timeline time');
      for (const clip of clips) {
        const local = time - clip.start;
        const active = local >= 0 && local < clip.duration;
        clip.el.style.visibility = active ? 'visible' : 'hidden';
        clip.el.style.pointerEvents = active ? 'auto' : 'none';
        clip.el.style.opacity = active ?
          String(Math.max(0, Math.min(1, local / 0.25, (clip.duration - local) / 0.25))) : '0';
        if (active && clip.animate) clip.animate(local, clip.el);
      }
    }
    window.DUR = spec.duration;
    window.render = seek;
    return { seek, clips, duration: spec.duration };
  }
  window.VideoCompositor = { make };
})();
