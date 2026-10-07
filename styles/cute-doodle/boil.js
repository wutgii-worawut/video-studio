// Line boil for the cute-doodle style: the hand-drawn wobble of a cartoon redrawn a few times a second.
// Include right after <body>:  <script src="../../../styles/cute-doodle/boil.js"></script>
// Put class="boil" on drawings and class="boilT" on text (gentler, stays readable), then call Boil.update(t) in render(t).
(() => {
  const PER_SECOND = 8, SEEDS = 6;
  const filter = (id, freq, octaves, scale) =>
    `<filter id="${id}" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${octaves}" seed="1"/>`
    + `<feDisplacementMap in="SourceGraphic" scale="${scale}"/></filter>`;
  document.head.insertAdjacentHTML('beforeend', '<style>.boil{filter:url(#boil)}.boilT{filter:url(#boilT)}</style>');
  document.body.insertAdjacentHTML('afterbegin',
    `<svg width="0" height="0" style="position:absolute">${filter('boil', 0.03, 2, 6)}${filter('boilT', 0.04, 1, 3)}</svg>`);
  const noise = [...document.querySelectorAll('#boil feTurbulence, #boilT feTurbulence')];
  window.Boil = {
    update(t) {
      const seed = (Math.floor(t * PER_SECOND) % SEEDS) + 1;
      for (const n of noise) n.setAttribute('seed', seed);
    },
  };
})();
