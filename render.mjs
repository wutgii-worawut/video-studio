// node render.mjs <project> check | stills | video
//   reads  projects/<project>/source/index.html
//   writes projects/<project>/output/stills/*.png and output/<project>.mp4
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { once } from 'node:events';
import { pathToFileURL, fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('.', import.meta.url)));   // paths work from any folder
const [project, mode = 'video'] = process.argv.slice(2);
const src = `projects/${project}/source/index.html`, out = `projects/${project}/output`;
if (!project || !existsSync(src)) {
  console.error(`usage: node render.mjs <project> [check|stills|video]\nprojects: ${readdirSync('projects').join(', ')}`);
  process.exit(1);
}
const FPS = 30, DUR = 15;

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
  // Every visible .tx must sit inside the frame and not overlap another .tx of the same scene.
  const problems = await page.evaluate(() => {
    const out = [];
    const alpha = (e) => { let a = 1; for (; e; e = e.parentElement) a *= +getComputedStyle(e).opacity; return a; };
    for (let i = 0; i <= 150; i++) {
      const t = i / 10; render(t);
      const vis = [...document.querySelectorAll('.tx')].filter((e) => alpha(e) > 0.05)
        .map((e) => ({ e, r: e.getBoundingClientRect(), s: e.closest('.scene').id }));
      for (const { e, r } of vis) {
        if (r.left < 24 || r.right > 1056 || r.top < 24 || r.bottom > 1896) out.push(`t=${t} offscreen: ${e.textContent}`);
        const box = e.closest('.term, .card')?.getBoundingClientRect();   // keep text 24px inside its card
        if (box && (r.left < box.left + 24 || r.right > box.right - 24 || r.bottom > box.bottom - 12)) out.push(`t=${t} outside card: ${e.textContent}`);
      }
      for (const a of vis) for (const b of vis)
        if (a.e !== b.e && a.s === b.s && !a.e.contains(b.e) && !b.e.contains(a.e) && a.e.compareDocumentPosition(b.e) & 4 &&
            Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left) > 2 && Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top) > 2)
          out.push(`t=${t} overlap: "${a.e.textContent}" / "${b.e.textContent}"`);
    }
    return out;
  });
  console.log(problems.length ? problems.join('\n') : 'layout OK');
} else if (mode === 'stills') {
  mkdirSync(`${out}/stills`, { recursive: true });
  for (const t of [1, 5, 9, 14]) await shot(t, `${out}/stills/still-${String(t).padStart(2, '0')}s.png`);
  console.log(`stills saved to ${out}/stills`);
} else {
  mkdirSync(out, { recursive: true });
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', `${out}/${project}.mp4`], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < FPS * DUR; i++) {
    if (!ff.stdin.write(await shot(i / FPS))) await once(ff.stdin, 'drain');
  }
  ff.stdin.end();
  const [code] = await once(ff, 'close');
  if (code) throw new Error(`ffmpeg exited ${code}`);
  console.log(`saved ${out}/${project}.mp4`);
}
await browser.close();
