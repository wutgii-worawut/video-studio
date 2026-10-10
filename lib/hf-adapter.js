// Optional HyperFrames-compatible seek bridge for existing window.render(t) compositions.
// Load after index.html scripts; does not rewrite the original composition.
(() => {
  const state = { installed: false, duration: 0, fps: 30, lastTime: 0 };
  function clamp(t) {
    if (!Number.isFinite(t)) throw new Error('Seek time must be finite');
    return Math.max(0, Math.min(state.duration, t));
  }
  function seek(t) {
    if (!state.installed) throw new Error('Seek adapter not installed');
    const time = clamp(Number(t));
    window.render(time);
    state.lastTime = time;
    return time;
  }
  function install({ duration = window.DUR || 15, fps = 30 } = {}) {
    if (typeof window.render !== 'function') throw new Error('window.render(t) is required');
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid duration');
    if (!Number.isFinite(fps) || fps <= 0) throw new Error('Invalid FPS');
    if (window.__hf && !window.__hf.__videoStudioAdapter) {
      throw new Error('A native HyperFrames runtime already owns window.__hf');
    }
    Object.assign(state, { duration, fps, installed: true });
    window.__hf = {
      __videoStudioAdapter: true, duration, seek,
    };
    window.__renderReady = true;
    seek(0);
    return window.__hf;
  }
  function sceneSnapshot() {
    if (!state.installed) throw new Error('Adapter not installed');
    const nodes = [...document.querySelectorAll('.scene')];
    return nodes.filter(el => {
      const rect = el.getBoundingClientRect();
      const css = getComputedStyle(el);
      let opacity = 1, cursor = el;
      while (cursor) { opacity *= Number(getComputedStyle(cursor).opacity); cursor = cursor.parentElement; }
      return css.visibility !== 'hidden' && css.display !== 'none' &&
        opacity >= 0.05 && rect.width > 0 && rect.height > 0;
    }).map(el => ({ id: el.id, label: el.getAttribute('data-label') || el.id }));
  }
  window.VideoStudioHF = { install, seek, sceneSnapshot, state };
})();
