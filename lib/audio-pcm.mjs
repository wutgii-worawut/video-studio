// Predictable audio mixing without giant FFmpeg filtergraphs.
// Decode inputs independently, mix bounded PCM in Node, encode one AAC track.
// This avoids FFmpeg's stalled many-way asplit/adelay/amix graph (issues/003,005).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import { extname } from 'node:path';

const RATE = 48000, CHANNELS = 2, MUSIC_GAIN = 0.55;
const SFX_WITH_VOICE = 0.5;
const EXTENSIONS = ['wav', 'mp3', 'm4a', 'ogg'];
const MAX_SECONDS = 600;

function findSound(stem) {
  return EXTENSIONS.map((e) => stem + '.' + e).find((f) => existsSync(f));
}

async function decode(file, duration, signal) {
  // Floating point stereo avoids clipping from intermediate decoding.
  const args = ['-nostdin', '-v', 'error', '-i', file, '-t', String(duration),
    '-ar', String(RATE), '-ac', String(CHANNELS), '-f', 'f32le', '-'];
  const child = spawn('ffmpeg', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], signal });
  let stderr = '', length = 0, chunks = [], closed = false, failError;
  const maxBytes = Math.ceil(duration * RATE * CHANNELS * 4) + 65536;
  const timer = setTimeout(() => child.kill('SIGKILL'), 60000);
  child.stderr.on('data', (data) => { stderr = (stderr + data.toString()).slice(-4000); });
  child.stdout.on('data', (data) => {
    length += data.length;
    if (length > maxBytes) {
      failError = new Error('Audio decode exceeded the expected length: ' + file);
      child.kill('SIGKILL');
      return;
    }
    chunks.push(data);
  });
  try {
    const [code] = await once(child, 'close');
    closed = true;
    if (failError) throw failError;
    if (code !== 0) throw new Error('Audio decode failed for ' + file + ': ' + stderr);
    const data = Buffer.concat(chunks, length);
    if (data.length % 4) throw new Error('Invalid PCM bytes for ' + file);
    const copy = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    return new Float32Array(copy);
  } finally {
    clearTimeout(timer);
    if (!closed) child.kill('SIGKILL');
    chunks = [];
  }
}

function addAt(output, samples, startSeconds, gain) {
  const frame = Math.max(0, Math.round(startSeconds * RATE));
  const startInSource = startSeconds < 0 ? Math.round(-startSeconds * RATE) : 0;
  const length = Math.min(output.length / CHANNELS - frame, samples.length / CHANNELS - startInSource);
  for (let i = 0; i < length; i++) {
    const p = (frame + i) * CHANNELS, q = (startInSource + i) * CHANNELS;
    output[p] += samples[q] * gain;
    output[p + 1] += samples[q + 1] * gain;
  }
}

function overlayMusic(output, music, voice, duration) {
  if (!music.length) return;
  const musicFrames = music.length / CHANNELS;
  const outputFrames = output.length / CHANNELS;
  let envelope = 0;
  const attack = Math.exp(-1 / (0.020 * RATE)), release = Math.exp(-1 / (0.400 * RATE));
  for (let i = 0; i < outputFrames; i++) {
    const v0 = voice && i * 2 < voice.length ? voice[i * 2] : 0;
    const v1 = voice && i * 2 + 1 < voice.length ? voice[i * 2 + 1] : 0;
    const level = Math.sqrt((v0 * v0 + v1 * v1) / 2);
    envelope = level > envelope ? attack * envelope + (1 - attack) * level :
      release * envelope + (1 - release) * level;
    const duck = voice && envelope > 0.02
      ? Math.pow(0.02 / envelope, 1 - 1 / 8) : 1;
    const t = i / RATE;
    const fadeIn = Math.min(1, t / 0.3);
    const fadeOut = Math.min(1, Math.max(0, duration - t) / 1.5);
    const gain = MUSIC_GAIN * duck * fadeIn * fadeOut;
    const pos = (i % musicFrames) * 2;
    output[2 * i] += music[pos] * gain;
    output[2 * i + 1] += music[pos + 1] * gain;
  }
}

function peakLimit(output) {
  let peak = 0;
  for (let i = 0; i < output.length; i++) peak = Math.max(peak, Math.abs(output[i]));
  const gain = peak > 0.9 ? 0.9 / peak : 1;
  if (gain < 1) for (let i = 0; i < output.length; i++) output[i] *= gain;
  return { peakBeforeLimit: peak, masterGain: gain };
}

async function encodePcm(output, filename, signal) {
  const child = spawn('ffmpeg', ['-nostdin', '-y', '-v', 'error',
    '-f', 'f32le', '-ar', String(RATE), '-ac', String(CHANNELS), '-i', 'pipe:0',
    '-c:a', 'aac', '-b:a', '192k', filename],
  { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'], signal });
  let stderr = '', settled = false, failure = null;
  child.stderr.on('data', (data) => { stderr = (stderr + data.toString()).slice(-4000); });
  child.stdin.on('error', (err) => { failure = err; });
  const completion = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      settled = true;
      if (code === 0) resolve();
      else reject(failure ?? new Error('Audio encode failed (exit ' + code + '): ' + stderr));
    });
  });
  completion.catch(() => {});
  const timer = setTimeout(() => child.kill('SIGKILL'), 60000);
  const bytes = Buffer.from(output.buffer, output.byteOffset, output.byteLength);
  try {
    const stride = 65536;
    for (let p = 0; p < bytes.length; p += stride) {
      if (settled) throw new Error('Audio encoder exited prematurely: ' + stderr);
      if (!child.stdin.write(bytes.subarray(p, p + stride))) {
        await Promise.race([
          once(child.stdin, 'drain'),
          completion.then(() => { throw new Error('Audio encoder ended before drain'); }),
        ]);
      }
    }
    child.stdin.end();
    await completion;
  } finally {
    clearTimeout(timer);
    if (!settled) {
      child.kill('SIGKILL');
      await completion.catch(() => {});
    }
  }
}

export async function mixToAac({ cues, brand, duration, output, signal }) {
  if (duration <= 0 || duration > MAX_SECONDS) {
    throw new Error('Audio PCM mix requires 0 < duration <= ' + MAX_SECONDS + ' seconds');
  }
  const voicePath = findSound(brand + '/voice');
  const musicPath = findSound(brand + '/music');
  const byFile = new Map(), missing = new Set();
  for (const [time, name, volume = 1] of cues) {
    if (!Number.isFinite(time) || time >= duration || typeof name !== 'string' || !/^[\w-]+$/.test(name))
      throw new Error('Invalid SFX cue: ' + JSON.stringify([time, name]));
    const file = findSound(brand + '/sfx/' + name) ?? findSound('sfx/' + name);
    if (!file) { missing.add(name); continue; }
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push([time, volume]);
  }
  if (!voicePath && !musicPath && byFile.size === 0) {
    return { hasAudio: false, missing: [...missing] };
  }
  const frames = Math.round(duration * RATE);
  const mixed = new Float32Array(frames * CHANNELS);
  const voice = voicePath ? await decode(voicePath, duration, signal) : null;
  if (musicPath) {
    const music = await decode(musicPath, duration, signal);
    overlayMusic(mixed, music, voice, duration);
  }
  if (voice) addAt(mixed, voice, 0, 1);
  let cueCount = 0;
  for (const [file, times] of byFile) {
    const sound = await decode(file, duration, signal);
    for (const [time, volume] of times) {
      if (!Number.isFinite(volume) || volume < 0 || volume > 10) throw new Error('Invalid SFX volume: ' + volume);
      addAt(mixed, sound, time, volume * (voice ? SFX_WITH_VOICE : 1));
      cueCount++;
    }
  }
  const levels = peakLimit(mixed);
  await encodePcm(mixed, output, signal);
  console.log('Audio mixed: ' + cueCount + ' SFX, voice=' + Boolean(voice) +
    ', music=' + Boolean(musicPath) + ', peak=' + levels.peakBeforeLimit.toFixed(2) +
    ', gain=' + levels.masterGain.toFixed(2) +
    (missing.size ? ', missing=' + [...missing].join(',') : ''));
  return { hasAudio: true, cueCount, ...levels, missing: [...missing] };
}
