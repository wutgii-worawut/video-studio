// Structured batch rendering. Same video pipeline, no parallel writes to one project.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectName, positiveInt } from './production.mjs';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MODES = new Set(['check', 'stills', 'audio', 'video']);

export function validateManifest(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.jobs) || data.jobs.length < 1 || data.jobs.length > 100)
    throw new Error('Expected version=1 and 1..100 batch jobs');
  const jobs = data.jobs.map((job, index) => {
    if (!job || typeof job !== 'object' || Array.isArray(job)) throw new Error('Invalid job ' + index);
    const project = projectName(job.project);
    const mode = job.mode ?? 'video';
    if (!MODES.has(mode)) throw new Error('Invalid mode in job ' + index);
    const blur = positiveInt(job.blur, 'blur', 8, 64);
    const workers = positiveInt(job.workers, 'workers', 2, 16);
    return { project, mode, blur, workers };
  });
  const duplicates = new Set();
  for (const job of jobs) {
    // Different modes of the same project could conflict through preview outputs.
    const id = job.project;
    if (duplicates.has(id)) throw new Error('Duplicate project "' + id + '" in batch; combine sequentially');
    duplicates.add(id);
  }
  return jobs;
}

export async function runBatchJob(job, { signal, timeoutMs = 60 * 60 * 1000, logger = () => {} } = {}) {
  const startedAt = new Date().toISOString();
  const args = [fileURLToPath(new URL('../render.mjs', import.meta.url)),
    job.project, job.mode, String(job.blur), String(job.workers)];
  const out = await new Promise((done) => {
    let child;
    try { child = spawn(process.execPath, args, { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], signal }); }
    catch (error) { done({ exitCode: null, error: error.message }); return; }
    let stdout = '', stderr = '', timeout = false;
    const timer = setTimeout(() => { timeout = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', (bytes) => { const s = bytes.toString(); stdout = (stdout + s).slice(-15000); logger(job, s); });
    child.stderr.on('data', (bytes) => { stderr = (stderr + bytes.toString()).slice(-15000); });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done(result);
    };
    child.on('error', (error) => finish({ exitCode: null, error: error.message }));
    child.on('close', (code) => finish({
      exitCode: code, error: timeout ? 'Job timed out' : code === 0 ? null : stderr || 'Job exited ' + code,
      outputTail: stdout.slice(-3000),
    }));
  });
  return { ...job, startedAt, finishedAt: new Date().toISOString(), ok: out.exitCode === 0, ...out };
}

export async function batch(manifestPath, { concurrency = 1, dryRun = false, reportPath, signal, logger } = {}) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const jobs = validateManifest(manifest);
  concurrency = positiveInt(concurrency, 'concurrency', 1, 8);
  if (dryRun) return { ok: true, dryRun: true, jobs };
  let cursor = 0;
  const results = Array(jobs.length);
  const worker = async () => {
    while (cursor < jobs.length) {
      if (signal?.aborted) break;
      const i = cursor++;
      results[i] = await runBatchJob(jobs[i], { signal, logger });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  const report = {
    version: 1, finishedAt: new Date().toISOString(),
    ok: results.length === jobs.length && results.every((x) => x?.ok),
    results: results.filter(Boolean),
  };
  if (reportPath) {
    await mkdir(dirname(resolve(reportPath)), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  }
  return report;
}
