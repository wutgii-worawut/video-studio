// Objective audio A/B measurements; loudness differences are NOT a listening test.
import { command } from './production.mjs';

export function parseVolumeDetect(log) {
  const mean = log.match(/mean_volume:\s*([-\d.]+)\s*dB/);
  const peak = log.match(/max_volume:\s*([-\d.]+)\s*dB/);
  if (!mean || !peak) throw new Error('Could not parse FFmpeg volumedetect');
  return { meanDb: Number(mean[1]), peakDb: Number(peak[1]) };
}

export async function inspectAudio(path, { signal } = {}) {
  const { stderr } = await command('ffmpeg', ['-nostdin','-hide_banner','-v','info','-i',path,
    '-map','0:a:0','-af','volumedetect','-f','null','-'],{timeoutMs:120000,signal});
  return parseVolumeDetect(stderr);
}

export async function compareAudio(beforePath, afterPath) {
  const before = await inspectAudio(beforePath);
  const after = await inspectAudio(afterPath);
  return { before, after, deltaMeanDb: +(after.meanDb-before.meanDb).toFixed(2),
    deltaPeakDb: +(after.peakDb-before.peakDb).toFixed(2),
    note: 'Numerical level comparison only: listening, voice intelligibility and timing still require QA' };
}
