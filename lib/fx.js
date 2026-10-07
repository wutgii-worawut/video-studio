// fx.js — shared motion toolkit for projects/*/source/index.html
// Include: <script src="../../../lib/fx.js"></script>
// Every call is a pure function of t (seconds): same t → same frame, so render.mjs can capture any instant.
//
// Catalogue
//   Easing     FX.ease.out | inOut | back | spring | linear          x = progress (0→1), safe below 0 / above 1
//   Items      FX.items(ITEMS, t)       ITEMS = [[selector, start, {x, y, r, scale, blur, dur, ease, sfx, vol}], ...]
//                                       x/y/r/scale/blur = where it comes FROM; it settles at its CSS position
//   Scenes     FX.scenes(SCENES, t)     SCENES = [[selector, in, out, {enter, exit, dur}], ...]
//                                       enter: fade | zoom | whip | circle | wipe     exit: fade | zoom | whip | hold
//                                       (use exit 'hold' when the next scene enters with circle/wipe)
//   Camera     FX.camera(el, t, DUR, {push, shakes: [[time, px], ...]})   slow push-in + impact shakes
//   Text       FX.words(el, t, start, {each, dur, y, ease})   word by word (Thai-aware), keeps inner markup
//              FX.chars(el, t, start, {...})                  letter by letter (keeps Thai vowels/tones on their letter)
//              FX.highlight(el, t, start, {dur, color, height})  marker swipe behind the text
//              FX.strike(el, t, start, {dur, color})          line drawn through the text
//   Drawing    FX.draw(svgPath, t, start, dur)                draws an SVG stroke on
//   Particles  FX.burst(layer, t, start, {n, seed, colors, x, y, speed, size, life})   confetti burst from (x, y)
//   Random     FX.rng(seed)                                   deterministic random: same numbers every render
//   Sound      FX.cues(ITEMS, extra)  publishes window.SFX for render.mjs; extra = [[time, name, volume], ...]
//              built-in names: whoosh tick pop impact ding (sfx/); brand/sfx/<name>.wav overrides or adds
(() => {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const $ = (s) => (typeof s === 'string' ? document.querySelector(s) : s);

  const ease = {
    linear: (x) => clamp(x),
    out: (x) => 1 - Math.pow(1 - clamp(x), 3),
    inOut: (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; },
    back: (x) => { x = clamp(x) - 1; return 1 + 2.7 * x * x * x + 1.7 * x * x; },          // overshoots ~10% then settles
    spring: (x) => (x <= 0 ? 0 : x >= 1.5 ? 1 : 1 - Math.exp(-8 * x) * Math.cos(12 * x)), // one ~12% bounce, settles by x≈1
  };

  function items(list, t) {
    for (const [sel, start, o = {}] of list) {
      const el = $(sel), x = (t - start) / (o.dur ?? 0.8), p = ease[o.ease || 'out'](x), q = 1 - p;
      el.style.opacity = ease.out(x * 1.6);
      el.style.transform = `translate(${(o.x || 0) * q}px, ${(o.y || 0) * q}px) rotate(${(o.r || 0) * q}deg) scale(${1 + ((o.scale ?? 1) - 1) * q})`;
      if (o.blur) el.style.filter = `blur(${Math.max(0, o.blur * q)}px)`;
    }
  }

  function scenes(list, t) {
    for (const [sel, tin, tout, o = {}] of list) {
      const el = $(sel), d = o.dur ?? 0.6;
      const p = ease.inOut((t - tin) / d), q = ease.inOut((t - tout) / d);
      let op = 1, tx = 0, ty = 0, sc = 1, bl = 0, clip = 'none';
      switch (o.enter || 'fade') {
        case 'fade': op *= p; break;
        case 'zoom': op *= p; sc *= 0.6 + 0.4 * p; bl += 24 * (1 - p); break;
        case 'whip': tx += 1080 * (1 - p); bl += 28 * Math.sin(Math.PI * p); break;
        case 'circle': clip = p >= 1 ? 'none' : `circle(${p * 75}% at 50% 50%)`; break;
        case 'wipe': { const w = p * 150; clip = p >= 1 ? 'none' : `polygon(0 0, ${w}% 0, ${w - 50}% 100%, 0 100%)`; break; }
      }
      switch (o.exit || 'fade') {
        case 'fade': op *= 1 - q; ty -= 90 * q; sc *= 1 - 0.04 * q; break;
        case 'zoom': op *= 1 - q; sc *= 1 + 0.8 * q; bl += 24 * q; break;
        case 'whip': tx -= 1080 * q; bl += 28 * Math.sin(Math.PI * q); break;
        case 'hold': if (q >= 1) op = 0; break;
      }
      el.style.opacity = op;
      el.style.visibility = op <= 0.001 ? 'hidden' : 'visible';
      el.style.transform = `translate(${tx}px, ${ty}px) scale(${sc})`;
      el.style.filter = bl > 0.05 ? `blur(${bl}px)` : 'none';
      el.style.clipPath = clip;
    }
  }

  function camera(el, t, dur, { push = 0.08, shakes = [] } = {}) {
    let dx = 0, dy = 0, rot = 0;
    for (const [at, px] of shakes) {
      const s = t - at;
      if (s < 0 || s > 0.7) continue;
      const k = px * Math.exp(-7 * s);
      dx += k * Math.sin(s * 71); dy += k * 0.8 * Math.cos(s * 53); rot += k * 0.06 * Math.sin(s * 61);
    }
    $(el).style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${1 + push * t / dur})`;
  }

  // Wrap each word/grapheme of every text node in an inline-block span (once), keeping nested markup.
  function split(el, granularity) {
    el = $(el);
    if (el.dataset.fxSplit === granularity) return el._fxParts;
    const seg = new Intl.Segmenter('th', { granularity }), parts = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), nodes = [];
    while (walk.nextNode()) nodes.push(walk.currentNode);
    for (const node of nodes) {
      const frag = document.createDocumentFragment();
      for (const { segment } of seg.segment(node.textContent)) {
        if (!segment.trim()) { frag.append(segment); continue; }
        const span = document.createElement('span');
        span.textContent = segment;
        span.style.display = 'inline-block';
        span.style.whiteSpace = 'pre';
        frag.append(span); parts.push(span);
      }
      node.replaceWith(frag);
    }
    el.dataset.fxSplit = granularity; el._fxParts = parts;
    return parts;
  }
  function stagger(el, t, start, granularity, { each = 0.07, dur = 0.6, y = 60, ease: e = 'back' } = {}) {
    split(el, granularity).forEach((s, i) => {
      const x = (t - start - i * each) / dur;
      s.style.opacity = clamp(x * 2.5);
      s.style.transform = `translateY(${y * (1 - ease[e](x))}px)`;
    });
  }
  const words = (el, t, start, o) => stagger(el, t, start, 'word', o);
  const chars = (el, t, start, o) => stagger(el, t, start, 'grapheme', { each: 0.035, ...o });

  function highlight(el, t, start, { dur = 0.5, color = '#ffd21f', height = 0.38 } = {}) {
    const s = $(el).style, p = ease.inOut((t - start) / dur);
    s.backgroundImage = `linear-gradient(${color}, ${color})`;
    s.backgroundRepeat = 'no-repeat';
    s.backgroundPosition = '0 90%';
    s.backgroundSize = `${p * 100}% ${height * 100}%`;
  }

  const css = document.createElement('style');
  css.textContent = '.fx-strike{position:relative}.fx-strike::after{content:"";position:absolute;left:-2%;top:54%;height:.1em;border-radius:.05em;width:calc(var(--fx-p,0)*104%);background:var(--fx-c,#ff4d6d)}';
  document.head.append(css);
  function strike(el, t, start, { dur = 0.4, color = '#ff4d6d' } = {}) {
    el = $(el);
    el.classList.add('fx-strike');
    el.style.setProperty('--fx-p', ease.inOut((t - start) / dur));
    el.style.setProperty('--fx-c', color);
  }

  function draw(path, t, start, dur) {
    path = $(path);
    const len = path.getTotalLength();
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len * (1 - ease.inOut((t - start) / dur));
  }

  function rng(seed) {                       // mulberry32
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function burst(layer, t, start, { n = 50, seed = 7, colors = ['#8b6cff', '#22d3ee', '#34d399', '#ffd21f', '#ff4d6d'], x = 540, y = 960, speed = 1100, size = 22, life = 2.4 } = {}) {
    layer = $(layer);
    if (!layer._fx) {
      const r = rng(seed);
      layer._fx = Array.from({ length: n }, () => {
        const el = document.createElement('i'), a = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.4, v = speed * (0.45 + r() * 0.55);
        el.style.cssText = `position:absolute;left:0;top:0;width:${size}px;height:${size * 0.55}px;border-radius:3px;background:${colors[Math.floor(r() * colors.length)]}`;
        layer.append(el);
        return { el, vx: Math.cos(a) * v, vy: Math.sin(a) * v, spin: (r() - 0.5) * 1440, wob: r() * 6 };
      });
    }
    const s = t - start;
    for (const p of layer._fx) {
      if (s < 0 || s > life) { p.el.style.opacity = 0; continue; }
      const drag = (1 - Math.exp(-2.2 * s)) / 2.2;            // air resistance
      const px = x + p.vx * drag, py = y + p.vy * drag + 700 * s * s;
      p.el.style.opacity = clamp((life - s) / 0.6);
      p.el.style.transform = `translate(${px}px, ${py}px) rotate(${p.spin * s}deg) scaleX(${Math.cos(s * 9 + p.wob)})`;
    }
  }

  function cues(list, extra = []) {
    window.SFX = [
      ...list.filter(([, , o = {}]) => o.sfx).map(([, start, o]) => [start, o.sfx, o.vol ?? 1]),
      ...extra,
    ].sort((a, b) => a[0] - b[0]);
  }

  window.FX = { ease, clamp, items, scenes, camera, split, words, chars, highlight, strike, draw, rng, burst, cues };
})();
