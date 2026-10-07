// Manga-action toolkit: the reusable effects of the manga-action style. Pure functions of t, like lib/fx.js.
// Include after fx.js:  <script src="../../../styles/manga-action/manga.js"></script>
//
//   Manga.focusLines(svg, t, {cx, cy, n, inner, outer, color, perSecond, seed})   radial speed lines, redrawn like hand-drawn smears
//   Manga.windLines(svg, t, {n, x, y, w, h, color, perSecond, seed})              short diagonal wind streaks
//   Manga.impact(el, t, [[start, end], ...])                                       impact frames: inverted black-and-white flashes
//   Manga.flash(el, t, at, {width, max})                                           white pop centred on `at`
// CSS classes it adds: .an (Japanese/English SFX caption) · .th (Thai caption) · .prop (lettering that is part of a picture;
// the caption check skips it, e.g. text printed on a poster the camera zooms through)
(() => {
  document.head.insertAdjacentHTML('beforeend', `<style>
    .an { font-family:'Dela Gothic One', 'Kanit', sans-serif; color:#fff;
          text-shadow: -6px -6px 0 #111, 6px -6px 0 #111, -6px 6px 0 #111, 6px 6px 0 #111, 0 -8px 0 #111, 0 8px 0 #111, -8px 0 0 #111, 8px 0 0 #111, 12px 14px 0 #d9332b; }
    .th { font-family:'Kanit', sans-serif; font-weight:800; color:#fff;
          text-shadow: -4px -4px 0 #111, 4px -4px 0 #111, -4px 4px 0 #111, 4px 4px 0 #111, 0 -5px 0 #111, 0 5px 0 #111, -5px 0 0 #111, 5px 0 0 #111; }
    .prop { display:inline-block; line-height:1.25; }
  </style>`);

  function focusLines(svg, t, { cx = 540, cy = 980, n = 110, inner = [260, 520], outer = 1500, color = '#fff', perSecond = 12, seed = 99 } = {}) {
    const r = FX.rng(Math.floor(t * perSecond) + seed);
    svg.innerHTML = Array.from({ length: n }, () => {
      const a = r() * Math.PI * 2, w = 0.004 + r() * 0.012, r0 = inner[0] + r() * (inner[1] - inner[0]);
      const p = (rad, ang) => `${cx + Math.cos(ang) * rad} ${cy + Math.sin(ang) * rad}`;
      return `<path d="M${p(r0, a)} L ${p(outer, a - w)} L ${p(outer, a + w)} Z" fill="${color}" opacity="${0.5 + r() * 0.5}"/>`;
    }).join('');
  }

  function windLines(svg, t, { n = 10, x = 0, y = 300, w = 900, h = 1100, color = '#fff', perSecond = 12, seed = 3 } = {}) {
    const r = FX.rng(Math.floor(t * perSecond) + seed);
    svg.innerHTML = Array.from({ length: n }, () => {
      const py = y + r() * h, px = x + r() * w, len = 160 + r() * 260;
      return `<path d="M${px} ${py} L ${px + len} ${py - 14}" stroke="${color}" stroke-width="${3 + r() * 4}" stroke-linecap="round" opacity=".75"/>`;
    }).join('');
  }

  const impact = (el, t, windows) =>
    { el.style.filter = windows.some(([a, b]) => t >= a && t < b) ? 'invert(1) grayscale(1) contrast(4)' : 'none'; };

  const flash = (el, t, at, { width = 0.08, max = 0.8 } = {}) =>
    { el.style.opacity = Math.max(0, 1 - Math.abs(t - at) / width) * max; };

  window.Manga = { focusLines, windLines, impact, flash };
})();
