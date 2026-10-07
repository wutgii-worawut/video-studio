// Mochi — the cute-doodle mascot, drawn in a 400×400 SVG box (sits on y≈372, centre x=200).
// Include: <script src="../../../styles/cute-doodle/mochi.js"></script>, then put Mochi.svg(...) inside an <svg viewBox="0 0 400 400">.
//
//   Mochi.svg(eyes, mouth, { wave, arm, alt, outfit, id })
//     eyes:   sleep · tired · sparkle · happy · determined · shock
//     mouth:  sleep · w · open · wobble · o · talk (opens with the voice, see Mochi.talk)
//     wave:   right paw raised            → #<id>-wave (rotate it to wave)
//     arm:    right paw down + hidden raised arm → #<id>-paw / #<id>-arm (toggle opacity to lift something)
//     alt:    {eyes, mouth} second face, hidden → #<id>-face2 (swap with #<id>-face)
//     outfit: none · wuxia (topknot + ribbon, cross-collar robe, sash, sword on the back)
//   Mochi.talk(id, t, levels)   open the 'talk' mouth by the voice loudness at time t (levels = window.VOICE.level)
//   Mochi.blink(id, t)          close the eyes for a moment every few seconds (deterministic)
(() => {
  const EYES = {
    sleep:   '<path class="o" d="M140 242 Q160 256 180 242 M220 242 Q240 256 260 242" fill="none"/>',
    tired:   '<path class="o" d="M143 234 H177 M223 234 H257" fill="none"/><path d="M146 236 A14 13 0 0 0 174 236 Z M226 236 A14 13 0 0 0 254 236 Z" fill="#2b2b2b"/>',
    sparkle: '<circle cx="160" cy="236" r="23" fill="#2b2b2b"/><circle cx="240" cy="236" r="23" fill="#2b2b2b"/><circle cx="168" cy="227" r="8" fill="#fff"/><circle cx="153" cy="245" r="4" fill="#fff"/><circle cx="248" cy="227" r="8" fill="#fff"/><circle cx="233" cy="245" r="4" fill="#fff"/>',
    happy:   '<path class="o" d="M142 246 Q160 224 178 246 M222 246 Q240 224 258 246" fill="none"/>',
    determined: '<path class="o" d="M140 226 L180 234 M260 226 L220 234" fill="none" stroke-width="9"/><circle cx="160" cy="246" r="15" fill="#2b2b2b"/><circle cx="240" cy="246" r="15" fill="#2b2b2b"/><circle cx="165" cy="240" r="5" fill="#fff"/><circle cx="245" cy="240" r="5" fill="#fff"/>',
    shock:   '<circle cx="160" cy="240" r="20" fill="#fff" stroke="#2b2b2b" stroke-width="7"/><circle cx="240" cy="240" r="20" fill="#fff" stroke="#2b2b2b" stroke-width="7"/><circle cx="160" cy="242" r="7" fill="#2b2b2b"/><circle cx="240" cy="242" r="7" fill="#2b2b2b"/>',
  };
  const MOUTH = {
    sleep:  '<path class="o" d="M192 276 Q200 284 208 276" fill="none" stroke-width="6"/>',
    w:      '<path class="o" d="M184 268 Q192 280 200 268 Q208 280 216 268" fill="none" stroke-width="6"/>',
    open:   '<path class="o" d="M180 264 Q200 306 220 264 Z" fill="#ff7a8a" stroke-width="6"/>',
    wobble: '<path class="o" d="M180 276 Q190 266 200 276 Q210 286 220 276" fill="none" stroke-width="6"/>',
    o:      '<ellipse class="o" cx="200" cy="278" rx="14" ry="18" fill="#ff7a8a" stroke-width="6"/>',
    talk:   (id) => `<ellipse id="${id}-talk" class="o" cx="200" cy="272" rx="17" ry="4" fill="#ff7a8a" stroke-width="6"/>`,
  };
  const mouthOf = (m, id) => (typeof MOUTH[m] === 'function' ? MOUTH[m](id) : MOUTH[m]);

  // sword sheathed on the back, one continuous line from behind the body up past the right shoulder:
  // scabbard (dark wood) → gold guard → wrapped grip → gold pommel with a red tassel
  const WUXIA_BACK = `<path class="o" d="M110 330 L 298 98" fill="none" stroke-width="34"/><path d="M110 330 L 298 98" stroke="#5a3b2a" stroke-width="20" stroke-linecap="round"/>
      <path d="M262 142 L 280 120" stroke="#c9a46a" stroke-width="20"/>
      <path class="o" d="M280 70 L 324 106" stroke-width="22"/><path d="M280 70 L 324 106" stroke="#c9a46a" stroke-width="10" stroke-linecap="round"/>
      <path class="o" d="M302 88 L 336 46" stroke-width="26"/><path d="M302 88 L 336 46" stroke="#8a4a2b" stroke-width="14" stroke-linecap="butt"/>
      <path d="M306 72 L 318 82 M316 60 L 328 70" stroke="#2b2b2b" stroke-width="4" stroke-linecap="round"/>
      <circle cx="340" cy="40" r="11" fill="#c9a46a" stroke="#2b2b2b" stroke-width="6"/>
      <path d="M342 50 C 356 72, 340 90, 356 110" stroke="#d9332b" stroke-width="7" fill="none" stroke-linecap="round"/>`;
  const WUXIA_FRONT = `<circle class="o" cx="200" cy="128" r="26" fill="#2b2b2b" stroke-width="6"/>
      <path class="o" d="M176 146 C 190 156, 210 156, 224 146" fill="none" stroke="#3e6fb0" stroke-width="12"/>
      <path d="M224 146 C 246 150, 252 168, 262 176 M224 146 C 240 160, 238 176, 246 190" stroke="#3e6fb0" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path class="o" d="M168 112 L 238 96" stroke="#c9a46a" stroke-width="7"/>
      <path class="o" d="M86 300 C 96 270, 130 262, 160 274 L 200 324 L 240 274 C 270 262, 304 270, 314 300 C 322 340, 300 372, 200 372 C 100 372, 78 340, 86 300 Z" fill="#3e6fb0"/>
      <path class="o" d="M150 272 L 200 330 L 250 272" fill="none" stroke="#fff" stroke-width="14"/><path d="M150 272 L 200 330 L 250 272" fill="none" stroke="#2b2b2b" stroke-width="4"/>
      <path class="o" d="M92 336 C 160 350, 240 350, 308 336 L 306 356 C 240 368, 160 368, 94 356 Z" fill="#d9332b" stroke-width="6"/>
      <path class="o" d="M196 346 L 186 384 M204 346 L 214 384" stroke="#d9332b" stroke-width="8"/>`;

  function svg(eyes, mouth, { wave = false, arm = false, alt = null, outfit = 'none', id = '' } = {}) {
    const wuxia = outfit === 'wuxia', sleeve = wuxia ? '#3e6fb0' : '#fffdf8';
    const paw = (x, y, pid = '') => `<ellipse ${pid ? `id="${pid}"` : ''} class="o" cx="${x}" cy="${y}" rx="28" ry="19" fill="#fffdf8"/>`;
    const raised = (gid, hidden) => `<g id="${gid}" style="transform-origin:0% 100%" ${hidden ? 'opacity="0"' : ''}>
          <path class="o" d="M290 300 C 316 276, 330 250, 334 222" fill="none" stroke-width="34"/>
          <path d="M290 300 C 316 276, 330 250, 334 222" fill="none" stroke="${sleeve}" stroke-width="19" stroke-linecap="round"/>
          <ellipse class="o" cx="336" cy="214" rx="24" ry="22" fill="#fffdf8"/></g>`;
    const face = `<g id="${id}-face"><g id="${id}-eyes">${EYES[eyes]}</g>${mouthOf(mouth, id)}</g>`
      + (alt ? `<g id="${id}-face2" opacity="0">${EYES[alt.eyes]}${mouthOf(alt.mouth, id + '2')}</g>` : '');
    const right = wave ? raised(`${id}-wave`, false) : arm ? paw(250, 340, `${id}-paw`) + raised(`${id}-arm`, true) : paw(250, 340);
    return `${wuxia ? WUXIA_BACK : ''}
      <path class="o" d="M310 320 C 382 312, 392 236, 350 214" fill="none" stroke-width="30"/>
      <path d="M310 320 C 382 312, 392 236, 350 214" fill="none" stroke="#fffdf8" stroke-width="15" stroke-linecap="round"/>
      <path class="o" d="M112 196 L118 106 L182 158 Z M288 196 L282 106 L218 158 Z" fill="#fffdf8"/>
      <path d="M126 170 L128 132 L156 156 Z M274 170 L272 132 L244 156 Z" fill="#ff9eb5"/>
      <path class="o" d="M80 330 C 58 228, 110 148, 200 148 C 290 148, 342 228, 320 330 C 300 372, 100 372, 80 330 Z" fill="#fffdf8"/>
      ${wuxia ? WUXIA_FRONT : ''}
      <ellipse cx="128" cy="272" rx="20" ry="12" fill="#ff9eb5" opacity=".85"/><ellipse cx="272" cy="272" rx="20" ry="12" fill="#ff9eb5" opacity=".85"/>
      <path class="o" d="M96 258 L60 250 M96 270 L58 274 M304 258 L340 250 M304 270 L342 274" fill="none" stroke-width="5"/>
      ${face}
      ${wuxia ? (wave || arm ? right.replace(/^<ellipse[^>]*\/>/, '') : '') : paw(150, 340) + right}`;
  }

  // Voice loudness 0..1 sampled at window.VOICE.fps (made by `node render.mjs <project> voice`).
  function talk(id, t, levels = window.VOICE?.level, fps = window.VOICE?.fps || 30) {
    const el = document.getElementById(`${id}-talk`);
    if (!el) return;
    const v = levels ? levels[Math.max(0, Math.min(levels.length - 1, Math.floor(t * fps)))] || 0 : 0;
    el.setAttribute('ry', 4 + 18 * v);
    el.setAttribute('cy', 272 + 8 * v);
  }
  function blink(id, t, every = 3.3) {
    const el = document.getElementById(`${id}-eyes`);
    if (!el) return;
    const ph = (t + (id.length % 3) * 0.7) % every;
    el.style.transformBox = 'view-box';
    el.style.transformOrigin = '200px 238px';
    el.style.transform = ph < 0.12 ? `scaleY(${0.15 + Math.abs(ph - 0.06) * 14})` : 'none';
  }

  window.Mochi = { svg, talk, blink, EYES, MOUTH };
})();
