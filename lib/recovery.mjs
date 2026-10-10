// Crash-safe per-project render lease + targeted cleanup of interrupted staging artifacts.
// Inspired by HyperFrames' artifact ownership/transaction pattern; no dependencies.
import { open, readFile, rm, readdir, stat, access } from 'node:fs/promises';
import { basename, join } from 'node:path';

const MAX_LOCK_AGE_MS = 30 * 1000;
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;
const STAGING_SUFFIXES = ['video-only.mp4', 'complete.mp4', 'audio.m4a'];

export function isProcessAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}

export function parseStagingFile(name, project) {
  const prefix = '.' + project + '-';
  if (!name.startsWith(prefix)) return null;
  const rest = name.slice(prefix.length);
  const match = rest.match(/^([1-9]\d*)-(\d{10,})\.(video-only\.mp4|complete\.mp4|audio\.m4a)$/);
  if (!match) return null;
  return { pid: Number(match[1]), timestamp: Number(match[2]), kind: match[3] };
}

async function inspectLock(path) {
  try {
    const body = JSON.parse(await readFile(path, 'utf8'));
    const meta = await stat(path);
    const pid = Number(body.pid);
    return { exists: true, pid, alive: isProcessAlive(pid), ageMs: Date.now() - meta.mtimeMs };
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false };
    const meta = await stat(path).catch(() => null);
    return { exists: true, pid: null, alive: false, ageMs: meta ? Date.now() - meta.mtimeMs : 0 };
  }
}

export async function acquireProjectLock(out, project) {
  const path = join(out, '.' + project + '.render.lock');
  for (let attempt = 0; attempt < 3; attempt++) {
    let fh;
    try {
      fh = await open(path, 'wx');
      await fh.writeFile(JSON.stringify({ pid: process.pid, project, startedAt: new Date().toISOString() }));
      await fh.close();
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        // Do not delete somebody else's lock if the old process has been replaced.
        const now = await readFile(path, 'utf8').catch(() => '');
        try {
          const lock = JSON.parse(now);
          if (lock.pid === process.pid && lock.project === project) await rm(path, { force: true });
        } catch {}
      };
    } catch (error) {
      await fh?.close().catch(() => {});
      if (error.code !== 'EEXIST') throw error;
      const existing = await inspectLock(path);
      if (!existing.exists) continue;
      if (existing.alive || existing.ageMs < MAX_LOCK_AGE_MS) {
        throw new Error('Another render owns ' + path + ' (PID ' + (existing.pid ?? 'unknown') +
          '). A confirmed dead PID lock becomes eligible for recovery after 30 seconds.');
      }
      // A stale lock is no longer owned by a live process and is >30s old.
      await rm(path, { force: true });
    }
  }
  throw new Error('Could not obtain render lock for ' + project);
}

export async function inspectRecovery(out, project, { minAgeMs = ORPHAN_MIN_AGE_MS } = {}) {
  const files = await readdir(out).catch((e) => { if (e.code === 'ENOENT') return []; throw e; });
  const candidates = [];
  for (const file of files) {
    const details = parseStagingFile(file, project);
    if (!details) continue;
    const full = join(out, file);
    const stats = await stat(full).catch(() => null);
    if (!stats || !stats.isFile()) continue;
    const ageMs = Date.now() - stats.mtimeMs;
    candidates.push({ path: full, file, ...details, bytes: stats.size, ageMs,
      active: isProcessAlive(details.pid), removable: !isProcessAlive(details.pid) && ageMs >= minAgeMs });
  }
  return candidates;
}

export async function cleanOrphanedStages(out, project, options = {}) {
  const dryRun = options.dryRun !== false;
  const candidates = await inspectRecovery(out, project, options);
  const removed = [];
  if (!dryRun) {
    const lock = await inspectLock(join(out, '.' + project + '.render.lock'));
    if (lock.exists && lock.alive && lock.pid !== options.ownerPid)
      throw new Error('Active render owns this project; cleanup refused');
    for (const file of candidates.filter((f) => f.removable)) {
      await rm(file.path, { force: true });
      removed.push(file.file);
    }
  }
  return { dryRun, candidates, removed };
}
