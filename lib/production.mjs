// Production safeguards shared by render.mjs and the test suite.
// No dependency on a particular composition or browser.
import { spawn } from 'node:child_process';
import { stat, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export function projectName(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(value) || value.length > 100) {
    throw new Error('Invalid project name: use lowercase letters, numbers and hyphens only');
  }
  return value;
}

export function positiveInt(value, label, fallback, max = 64) {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(String(value))) throw new Error(label + ' must be a positive integer');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n > max) throw new Error(label + ' must be <= ' + max);
  return n;
}

export function timeline(duration, stills, fps = FPS) {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 3600) {
    throw new Error('window.DUR must be a number between 0 and 3600 seconds');
  }
  const frameCount = Math.round(duration * fps);
  if (Math.abs(frameCount - duration * fps) > 1e-4) {
    throw new Error('window.DUR must resolve to an exact video frame at ' + fps + ' fps');
  }
  const previewTimes = stills ?? [1, 5, 9, 14].filter((n) => n < duration);
  if (!Array.isArray(previewTimes) || previewTimes.some((t) => !Number.isFinite(t) || t < 0 || t >= duration)) {
    throw new Error('window.STILLS must be an array of times from 0 to less than DUR');
  }
  return { duration, frameCount, stills: previewTimes };
}

export function subframeTime(index, blur, fps = FPS, shutter = 0.5) {
  const frame = Math.floor(index / blur);
  if (blur === 1) return frame / fps;
  const sample = index % blur;
  // First shutter interval must not request negative time (see issues/002).
  return Math.max(0, (frame + ((sample + 0.5) / blur - 0.5) * shutter) / fps);
}

export function validateProbe(metadata, { width = WIDTH, height = HEIGHT, fps = FPS, frames, audio }) {
  const streams = metadata?.streams;
  if (!Array.isArray(streams)) throw new Error('ffprobe returned no streams');
  const video = streams.find((s) => s.codec_type === 'video');
  const sound = streams.find((s) => s.codec_type === 'audio');
  if (!video) throw new Error('Rendered file has no video stream');
  if (video.width !== width || video.height !== height) {
    throw new Error('Wrong video resolution: ' + video.width + 'x' + video.height);
  }
  const [num, den] = String(video.avg_frame_rate ?? '0/1').split('/').map(Number);
  if (!Number.isFinite(num / den) || Math.abs(num / den - fps) > 0.001) {
    throw new Error('Wrong video frame rate: ' + video.avg_frame_rate);
  }
  if (Number(video.nb_frames) !== frames) {
    throw new Error('Wrong video frame count: got ' + video.nb_frames + ', expected ' + frames);
  }
  if (Boolean(sound) !== Boolean(audio)) {
    throw new Error(audio ? 'Expected an audio stream' : 'Unexpected audio stream');
  }
  const duration = Number(metadata.format?.duration);
  if (!Number.isFinite(duration) || Math.abs(duration - frames / fps) > Math.max(0.12, 2 / fps)) {
    throw new Error('Wrong file duration: ' + duration + ', expected ' + frames / fps);
  }
  return { width, height, fps, frames, duration, hasAudio: Boolean(sound) };
}

export async function command(executable, args, { timeoutMs = 120000, signal, maxBytes = 1024 * 1024 } = {}) {
  return await new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], signal });
    } catch (error) { reject(error); return; }
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    const take = (part, chunk) => {
      if (part === 'stdout') stdout = (stdout + chunk.toString()).slice(-maxBytes);
      else stderr = (stderr + chunk.toString()).slice(-maxBytes);
    };
    child.stdout.on('data', (v) => take('stdout', v));
    child.stderr.on('data', (v) => take('stderr', v));
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };
    child.on('error', (error) => finish(error));
    child.on('close', (code, killed) => {
      if (timedOut) finish(new Error(executable + ' timed out after ' + timeoutMs + 'ms; ' + stderr.slice(-2000)));
      else if (code !== 0) finish(new Error(executable + ' failed (exit ' + code + ', signal ' + killed + '): ' + stderr.slice(-4000)));
      else finish(null, { stdout, stderr });
    });
  });
}

export async function probeVideo(file, expected, options = {}) {
  const { stdout } = await command('ffprobe', [
    '-v', 'error', '-show_entries',
    'stream=codec_type,width,height,avg_frame_rate,nb_frames:format=duration',
    '-of', 'json', file,
  ], { timeoutMs: options.timeoutMs ?? 30000, signal: options.signal });
  const stats = await stat(file);
  if (stats.size < 1024) throw new Error('Rendered output is suspiciously small: ' + stats.size + ' bytes');
  return validateProbe(JSON.parse(stdout), expected);
}

// A validated staging file is promoted only after it is known to be complete.
// If replacement fails the prior published file is restored.
export async function promoteFile(stagedFile, destinationFile) {
  const backup = join(dirname(destinationFile), '.' + basename(destinationFile) + '.backup-' + process.pid + '-' + Date.now());
  let backedUp = false;
  try {
    try {
      await rename(destinationFile, backup);
      backedUp = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    try { await rename(stagedFile, destinationFile); }
    catch (error) {
      if (backedUp) await rename(backup, destinationFile);
      throw error;
    }
    if (backedUp) await rm(backup, { force: true });
  } catch (error) {
    throw new Error('Unable to publish validated output: ' + error.message, { cause: error });
  }
}
