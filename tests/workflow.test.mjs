import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, stat, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireProjectLock, cleanOrphanedStages, parseStagingFile } from '../lib/recovery.mjs';
import { validateManifest, batch } from '../lib/batch.mjs';
import { jobFromEnvironment } from '../cloud/job.mjs';

test('project lock blocks overlap and removes itself on release', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'video-studio-lock-'));
  try {
    const unlock = await acquireProjectLock(tmp, 'skillz-promo');
    await assert.rejects(acquireProjectLock(tmp, 'skillz-promo'), /Another render owns/);
    await unlock();
    const other = await acquireProjectLock(tmp, 'skillz-promo');
    await other();
    await assert.rejects(stat(join(tmp, '.skillz-promo.render.lock')), /ENOENT/);
  } finally { await rm(tmp, { recursive: true, force: true }); }
});

test('cleanup only removes confirmed stale stage files from dead processes', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'video-studio-recover-'));
  try {
    const old = '.' + 'mochi-monday-9999999-1660000000000.video-only.mp4';
    const young = '.mochi-monday-9999999-' + Date.now() + '.audio.m4a';
    const protect = '.mochi-monday-' + process.pid + '-1660000000000.complete.mp4';
    const unrelated = '.other-project-9999999-1660000000000.complete.mp4';
    for (const name of [old, young, protect, unrelated]) await writeFile(join(tmp, name), 'data');
    const past = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(join(tmp, old), past, past);
    await utimes(join(tmp, protect), past, past);
    await utimes(join(tmp, unrelated), past, past);
    assert.deepEqual(parseStagingFile('not-a-stage', 'mochi-monday'), null);
    const dry = await cleanOrphanedStages(tmp, 'mochi-monday');
    assert.equal(dry.candidates.filter(x => x.removable).length, 1);
    assert.deepEqual(dry.removed, []);
    const cleaned = await cleanOrphanedStages(tmp, 'mochi-monday', { dryRun: false });
    assert.deepEqual(cleaned.removed, [old]);
    assert.ok((await stat(join(tmp, protect))).isFile());
    assert.ok((await stat(join(tmp, unrelated))).isFile());
    assert.ok((await stat(join(tmp, young))).isFile());
  } finally { await rm(tmp, { recursive: true, force: true }); }
});

test('batch validates inputs, limits and rejects same-project concurrency', () => {
  assert.equal(validateManifest({ version:1, jobs:[{ project:'mochi-monday' }] })[0].blur, 8);
  assert.throws(() => validateManifest({ version:1, jobs:[{ project:'mochi-monday' }, { project:'mochi-monday' }] }), /Duplicate/);
  assert.throws(() => validateManifest({ version:1, jobs:[{ project:'../secret' }] }), /project name/);
  assert.throws(() => validateManifest({ version:1, jobs:[{ project:'mochi-monday', mode:'remove' }] }), /mode/);
  assert.throws(() => validateManifest({ version:3, jobs:[] }), /version/);
});

test('batch dry-run returns expected immutable execution list', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'video-studio-batch-'));
  try {
    const name = join(tmp, 'batch.json');
    await writeFile(name, JSON.stringify({version:1,jobs:[{project:'skillz-promo',mode:'check'}]}));
    const report = await batch(name, {dryRun:true,concurrency:2});
    assert.equal(report.dryRun, true);
    assert.equal(report.jobs.length, 1);
  } finally { await rm(tmp, {recursive:true,force:true}); }
});

test('cloud worker validates isolated render job environment', () => {
  assert.equal(jobFromEnvironment({ VS_PROJECT:'composition-demo', VS_BLUR:'1' }).blur,1);
  assert.throws(()=>jobFromEnvironment({VS_PROJECT:'../../etc'}),/project name/);
  assert.throws(()=>jobFromEnvironment({VS_PROJECT:'composition-demo',VS_UPLOAD_URL:'http://example.com/artifact'}),/HTTPS/);
  const job=jobFromEnvironment({VS_PROJECT:'composition-demo',
    VS_UPLOAD_URL:'https://example.com/upload?signature=opaque'});
  assert.equal(job.workers,2);
});
