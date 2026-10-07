// node render.mjs <project> check | stills | video [blur]
//   reads  projects/<project>/source/index.html (+ brand/music.*, brand/sfx/, sfx/)
//   writes projects/<project>/output/stills/*.png and output/<project>.mp4
//   blur = motion-blur subframes per frame (default 8, 1 = off for a quick draft)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { once } from 'node:events';
import { pathToFileURL, fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('.', import.meta.url)));   // paths work from any folder
const [project, mode = 'video', blurArg = '8'] = process.argv.slice(2);
const src = `projects/${project}/source/index.html`, out = `projects/${project}/output`, brand = `projects/${project}/brand`;
if (!project || !existsSync(src)) {
  console.error(`usage: node render.mjs <project> [check|stills|video] [blur]\nprojects: ${readdirSync('projects').join(', ')}`);
  process.exit(1);
}
const FPS = 30, DUR = 15;
const BLUR = Math.max(1, parseInt(blurArg, 10) || 1);
const SHUTTER = 0.5;            // fraction of a frame the "shutter" stays open (0.5 = film-like 180°)
const MUSIC_VOLUME = 0.55;      // music sits under the sound effects
// TikTok/Reels cover the top tabs, the right-hand buttons and the bottom caption. Text stays inside this box.
const SAFE = { left: 60, right: 960, top: 150, bottom: 1500 };

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto(pathToFileURL(src).href + '?render');
// Load every font weight/subset and every image (incl. CSS backgrounds) before the first frame,
// so no frame is captured with a fallback font or a missing picture.
const failed = await page.evaluate(async () => {
  const fonts = await Promise.all([...document.fonts].map((f) => f.load().then(() => null, () => `${f.family} ${f.weight}`)));
  const urls = new Set([...document.images].map((i) => i.src));
  for (const el of document.querySelectorAll('*'))
    for (const [, u] of getComputedStyle(el).backgroundImage.matchAll(/url\("?(.+?)"?\)/g)) urls.add(u);
  const imgs = await Promise.all([...urls].map((u) => { const i = new Image(); i.src = u; return i.decode().then(() => null, () => u); }));
  return [...fonts, ...imgs].filter(Boolean);
});
if (failed.length) { console.error('failed to load:\n  ' + failed.join('\n  ')); process.exit(1); }
const shot = async (t, path) => { await page.evaluate((t) => render(t), t); return page.screenshot({ path }); };

if (mode === 'check') {
  // Every readable .tx (visible and settled, i.e. not mid-transition) must sit inside the safe zone and its card,
  // and not overlap another .tx of the same scene. Text flying in or zooming through is checked once it lands.
  const problems = await page.evaluate((SAFE) => {
    const out = [];
    const alpha = (e) => { let a = 1; for (; e; e = e.parentElement) a *= +getComputedStyle(e).opacity; return a; };
    const all = [...document.querySelectorAll('.tx')];
    for (let i = 0; i <= 150; i++) {
      const t = i / 10;
      render(t + 0.05);
      const later = all.map((e) => e.getBoundingClientRect());
      render(t);
      const vis = all.map((e, j) => ({ e, r: e.getBoundingClientRect(), r2: later[j], s: e.closest('.scene').id }))
        // moved < 15px in 0.05s (300px/s): gentle pulses and the camera push still count as readable
        .filter(({ e, r, r2 }) => alpha(e) > 0.5 && Math.abs(r.left - r2.left) + Math.abs(r.top - r2.top) + Math.abs(r.width - r2.width) < 15);
      for (const { e, r } of vis) {
        if (r.left < SAFE.left || r.right > SAFE.right || r.top < SAFE.top || r.bottom > SAFE.bottom)
          out.push(`t=${t} outside safe zone (${Math.round(r.left)},${Math.round(r.top)})-(${Math.round(r.right)},${Math.round(r.bottom)}): ${e.textContent}`);
        const box = e.closest('.term, .card')?.getBoundingClientRect();   // keep text 24px inside its card
        if (box && (r.left < box.left + 24 || r.right > box.right - 24 || r.bottom > box.bottom - 12)) out.push(`t=${t} outside card: ${e.textContent}`);
      }
      for (const a of vis) for (const b of vis)
        if (a.e !== b.e && a.s === b.s && !a.e.contains(b.e) && !b.e.contains(a.e) && a.e.compareDocumentPosition(b.e) & 4 &&
            Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left) > 2 && Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top) > 2)
          out.push(`t=${t} overlap: "${a.e.textContent}" / "${b.e.textContent}"`);
    }
    return out;
  }, SAFE);
  console.log(problems.length ? problems.join('\n') : 'layout OK');
  if (problems.length) process.exitCode = 1;
} else if (mode === 'stills') {
  mkdirSync(`${out}/stills`, { recursive: true });
  for (const t of [1, 5, 9, 14]) await shot(t, `${out}/stills/still-${String(t).padStart(2, '0')}s.png`);
  console.log(`stills saved to ${out}/stills`);
} else {
  mkdirSync(out, { recursive: true });
  const audio = buildAudio(await page.evaluate(() => window.SFX || []));
  const video = BLUR > 1   // average BLUR subframes into each output frame
    ? `[0:v]tmix=frames=${BLUR},select=not(mod(n+1\\,${BLUR})),setpts=N/(${FPS}*TB),format=yuv420p[vout]`
    : '[0:v]format=yuv420p[vout]';
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS * BLUR), '-i', '-',
    ...audio.inputs, '-filter_complex', [video, ...audio.graph].join(';'), '-map', '[vout]', ...audio.map,
    '-r', String(FPS), '-c:v', 'libx264', '-crf', '18', '-movflags', '+faststart', `${out}/${project}.mp4`],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = FPS * DUR;
  for (let i = 0; i < frames; i++) {
    for (let k = 0; k < BLUR; k++) {
      const t = BLUR > 1 ? (i + ((k + 0.5) / BLUR - 0.5) * SHUTTER) / FPS : i / FPS;
      if (!ff.stdin.write(await shot(t))) await once(ff.stdin, 'drain');
    }
    if (i % 30 === 29) process.stdout.write(`\rframe ${i + 1}/${frames}`);
  }
  ff.stdin.end();
  const [code] = await once(ff, 'close');
  if (code) throw new Error(`ffmpeg exited ${code}`);
  console.log(`\nsaved ${out}/${project}.mp4 (motion blur ${BLUR > 1 ? BLUR + ' subframes' : 'off'})`);
}
await browser.close();

// Mix the page's SFX cues (window.SFX = [[time, name, volume], ...]) and optional brand/music.* into one track.
// Anything missing is skipped with a note; with no sounds at all the clip renders silent.
function buildAudio(cues) {
  const find = (base) => ['wav', 'mp3', 'm4a', 'ogg'].map((e) => `${base}.${e}`).find((f) => existsSync(f));
  const byFile = new Map(), missing = new Set();
  for (const [t, name, vol = 1] of cues) {
    const f = find(`${brand}/sfx/${name}`) ?? find(`sfx/${name}`);
    if (!f) { missing.add(name); continue; }
    byFile.set(f, [...(byFile.get(f) ?? []), [t, vol]]);
  }
  const music = find(`${brand}/music`);
  const inputs = [], graph = [], mix = [];
  let idx = 1;
  for (const [f, list] of byFile) {
    inputs.push('-i', f);
    graph.push(`[${idx}:a]asplit=${list.length}${list.map((_, k) => `[s${idx}_${k}]`).join('')}`);
    list.forEach(([t, vol], k) => {
      graph.push(`[s${idx}_${k}]adelay=${Math.max(0, Math.round(t * 1000))}:all=1,volume=${vol}[c${idx}_${k}]`);
      mix.push(`[c${idx}_${k}]`);
    });
    idx++;
  }
  if (music) {
    inputs.push('-stream_loop', '-1', '-i', music);
    graph.push(`[${idx}:a]atrim=0:${DUR},afade=t=in:d=0.3,afade=t=out:st=${DUR - 1.5}:d=1.5,volume=${MUSIC_VOLUME}[mus]`);
    mix.push('[mus]');
  }
  console.log(`audio: ${[...byFile.values()].reduce((n, l) => n + l.length, 0)} sfx cues, ${music ? 'music ' + music : `no music (add ${brand}/music.mp3)`}`
    + (missing.size ? `, missing sfx skipped: ${[...missing].join(', ')}` : ''));
  if (!mix.length) return { inputs, graph, map: [] };
  graph.push(`${mix.join('')}amix=inputs=${mix.length}:normalize=0:duration=longest,alimiter=limit=0.9,apad,atrim=0:${DUR}[aout]`);
  return { inputs, graph, map: ['-map', '[aout]', '-c:a', 'aac', '-b:a', '192k'] };
}
