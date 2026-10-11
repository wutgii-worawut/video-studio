# three.js (vendored, offline)

`three-0.170.0.js` = three@0.170.0 (MIT, see `LICENSE.txt`) + `RoundedBoxGeometry`, bundled as one classic script that sets `window.THREE`.
Projects load it with `<script src="../../../libs/three/three-0.170.0.js"></script>` and use `const THREE = window.THREE;`.

Why a bundle and not `three.module.js` + importmap: `render.mjs` opens projects over `file://`, and Chrome blocks
ES modules loaded from local files (CORS, origin `null`). A classic script works over `file://` and in the Studio preview.

**Not updated automatically.** There is no npm dependency; nothing upgrades this file. To update or add an addon, do it by hand:

1. Ask the user first (it downloads code). `npm pack three@<version> --pack-destination <scratch>/three`, extract to `<scratch>/three/x`.
2. `<scratch>/three-build/entry.js`:
   ```js
   export * from '<scratch>/three/x/package/build/three.module.js';
   export { RoundedBoxGeometry } from '<scratch>/three/x/package/examples/jsm/geometries/RoundedBoxGeometry.js';
   // add more addons here, e.g. export { OrbitControls } from '.../examples/jsm/controls/OrbitControls.js';
   ```
3. `<scratch>/three-build/rolldown.config.mjs`:
   ```js
   export default {
     input: '<scratch>/three-build/entry.js',
     resolve: { alias: { three: '<scratch>/three/x/package/build/three.module.js' } }, // addons import 'three'
     output: { file: '<scratch>/three-build/out/three-<version>.js', format: 'iife', name: 'THREE', minify: true },
   };
   ```
4. From the repo root: `node_modules/.bin/rolldown -c <scratch>/three-build/rolldown.config.mjs`, copy the output and the package `LICENSE` here, update the `<script src>` in each project that uses it, then compare stills before/after and run `npm test`.

Current build: 2026-10-11, rolldown 1.2.13, 684 672 bytes, sha256 `108e914ade4cb3f02da9f972a705aa35e297e41f8c7de10b4d4f7f25d463d0c1`.
Used by: `projects/mochi-monday-3d`.
