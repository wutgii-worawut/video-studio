import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { encodeFrames } from '../lib/render-video.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  projectName, positiveInt, timeline, subframeTime,
  validateProbe, command, promoteFile,
} from '../lib/production.mjs';

test('project names reject traversal, separators, uppercase and flags', () => {
  assert.equal(projectName('sword-of-coming-s3'), 'sword-of-coming-s3');
  for (const bad of ['', '../abc', 'foo/bar', 'foo\\bar', '--help', 'UPPER', 'a..b'])
    assert.throws(() => projectName(bad));
});

test('integers and timeline metadata are strict', () => {
  assert.equal(positiveInt(undefined, 'workers', 3), 3);
  assert.equal(positiveInt('8', 'blur', 1), 8);
  for (const bad of ['0', '-1', '1.5', '1000', 'abc'])
    assert.throws(() => positiveInt(bad, 'blur', 8));
  assert.deepEqual(timeline(15, [1, 5, 9]).frameCount, 450);
  assert.throws(() => timeline(-1, []));
  assert.throws(() => timeline(15.001, []));
  assert.throws(() => timeline(15, [-1]));
  assert.throws(() => timeline(15, [15]));
});

test('motion blur samples stay on the timeline, even at first frame', () => {
  for (let i = 0; i < 16; i++) assert.ok(subframeTime(i, 8) >= 0);
  assert.equal(subframeTime(0, 1), 0);
  assert.equal(subframeTime(30, 1), 1);
  assert.ok(subframeTime(8, 8) > 0);
});

function fakeProbe() {
  return {
    streams: [
      { codec_type: 'video', width: 1080, height: 1920, avg_frame_rate: '30/1', nb_frames: '450' },
      { codec_type: 'audio' },
    ],
    format: { duration: '15.000' },
  };
}

test('probe rejects missing audio, wrong resolution, fps, count, duration', () => {
  const expected = { width: 1080, height: 1920, fps: 30, frames: 450, audio: true };
  assert.equal(validateProbe(fakeProbe(), expected).frames, 450);
  const wrong = [
    (p) => { p.streams.pop(); },
    (p) => { p.streams[0].width = 720; },
    (p) => { p.streams[0].nb_frames = '449'; },
    (p) => { p.streams[0].avg_frame_rate = '24/1'; },
    (p) => { p.format.duration = '14.0'; },
  ];
  for (const alter of wrong) {
    const p = fakeProbe();
    alter(p);
    assert.throws(() => validateProbe(p, expected));
  }
});

test('subprocess helper reports stdout and kills a hung process', async () => {
  const ok = await command(process.execPath, ['-e', 'console.log("ready")']);
  assert.match(ok.stdout, /ready/);
  await assert.rejects(command(process.execPath, ['-e', 'setInterval(()=>{},1000)'],
    { timeoutMs: 250 }), /timed out/);
});

test('publishing replaces only a complete staged file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'video-studio-publish-'));
  try {
    const final = join(dir, 'output.mp4');
    const staged = join(dir, 'staged.mp4');
    await writeFile(final, 'old version');
    await writeFile(staged, 'validated version');
    await promoteFile(staged, final);
    assert.equal(await readFile(final, 'utf8'), 'validated version');
    await assert.rejects(access(staged));
    const files = await import('node:fs/promises').then((m) => m.readdir(dir));
    assert.deepEqual(files, ['output.mp4']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('capture failure rejects promptly instead of hanging the encoder', { timeout: 10000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'video-studio-fail-'));
  try {
    await assert.rejects(encodeFrames({
      workers: [{}], frames: 4, fps: 30, blur: 1,
      dest: join(dir, 'incomplete.mp4'),
      shot: async () => { throw new Error('synthetic capture failure'); },
    }), /synthetic capture failure/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
