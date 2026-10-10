import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mixToAac } from '../lib/audio-pcm.mjs';
import { command } from '../lib/production.mjs';

test('PCM mixer emits nothing when every audio source is absent', async () => {
  const result = await mixToAac({
    cues: [], brand: join(tmpdir(), 'nonexistent-video-studio-brand'),
    duration: 1, output: join(tmpdir(), 'nonexistent-video-studio-output.m4a'),
  });
  assert.equal(result.hasAudio, false);
});

test('PCM mixer produces one AAC file from voice + music + 2 effects', { timeout: 30000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'video-studio-audio-'));
  try {
    const brand = join(dir, 'brand');
    await mkdir(brand);
    for (const [kind, frequency] of [['voice', '500'], ['music', '240']]) {
      await command('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-f', 'lavfi',
        '-i', 'sine=frequency=' + frequency + ':duration=1',
        '-ac', '2', '-ar', '48000', join(brand, kind + '.wav')],
      { timeoutMs: 10000 });
    }
    const out = join(dir, 'mixed.m4a');
    const result = await mixToAac({
      cues: [[0.1, 'pop', 0.3], [0.7, 'ding', 0.2]],
      brand, duration: 1, output: out,
    });
    assert.equal(result.hasAudio, true);
    assert.equal(result.cueCount, 2);
    assert.ok((await stat(out)).size > 2000);
    const probe = await command('ffprobe', ['-v', 'error',
      '-select_streams', 'a:0', '-show_entries', 'stream=codec_name',
      '-of', 'default=noprint_wrappers=1:nokey=1', out]);
    assert.match(probe.stdout, /aac/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
