// Regenerates the built-in sound effects with ffmpeg (synthesized, royalty-free).
// node sfx/make-sfx.mjs   — tweak an expression below and re-run to change a sound.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const SOUNDS = {
  // airy swoosh for things sliding in
  whoosh: { d: 0.5, expr: '(random(0)*2-1)*sin(PI*t/0.5)^2*0.5', post: 'bandpass=f=1400:width_type=o:w=2.5,highpass=f=250' },
  // short click per typed character
  tick:   { d: 0.04, expr: '(random(0)*2-1)*exp(-260*t)*0.5', post: 'highpass=f=2500' },
  // bubbly pop for small reveals
  pop:    { d: 0.15, expr: 'sin(2*PI*t*(1200-3000*t))*exp(-25*t)*0.7' },
  // low boom for big text landing
  impact: { d: 0.8, expr: 'sin(2*PI*t*(110-60*t))*exp(-6*t)*0.9+(random(0)*2-1)*exp(-40*t)*0.35', post: 'lowpass=f=3500' },
  // bright two-note chime for success / logo
  ding:   { d: 1.0, expr: '0.45*sin(2*PI*1568*t)*exp(-5*t)+0.25*sin(2*PI*2349*t)*exp(-7*t)' },
};

for (const [name, { d, expr, post }] of Object.entries(SOUNDS)) {
  const af = ['afade=t=out:st=' + (d * 0.85).toFixed(3) + ':d=' + (d * 0.15).toFixed(3), post].filter(Boolean).join(',');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `aevalsrc=${expr}:d=${d}:s=44100`,
    '-af', af, '-ac', '2', `${dir}${name}.wav`]);
  console.log(`sfx/${name}.wav`);
}
