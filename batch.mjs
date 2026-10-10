// node batch.mjs <manifest.json> [--concurrency=2] [--dry-run] [--report=path]
import { resolve } from 'node:path';
import { batch } from './lib/batch.mjs';

const [manifest, ...args] = process.argv.slice(2);
if (!manifest) throw new Error('Usage: node batch.mjs manifest.json [--concurrency=2] [--dry-run] [--report=path]');
let concurrency = 1, dryRun = false, reportPath = 'batch-results.json';
for (const arg of args) {
  if (arg === '--dry-run') dryRun = true;
  else if (arg.startsWith('--concurrency=')) concurrency = arg.slice('--concurrency='.length);
  else if (arg.startsWith('--report=')) reportPath = arg.slice('--report='.length);
  else throw new Error('Unknown option: ' + arg);
}
const abort = new AbortController();
process.once('SIGINT', () => abort.abort());
process.once('SIGTERM', () => abort.abort());
const report = await batch(resolve(manifest), {
  concurrency, dryRun, reportPath: dryRun ? undefined : reportPath, signal: abort.signal,
  logger: (job, msg) => { if (msg.includes('PUBLISHED') || msg.includes('layout OK')) process.stdout.write(job.project + ': ' + msg); },
});
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
