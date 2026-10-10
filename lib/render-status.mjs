// projects/<project>/output/.render-status.json — what render.mjs is doing right now (spec 8B).
// Studio polls it so renders started from the terminal (Claude) show up; Claude can read it too.
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectName } from './production.mjs';
import { isProcessAlive } from './recovery.mjs';

let writes = 0;
export const statusFile = (out) => join(out, '.render-status.json');

// Atomic replace (temp file + rename) so a reader never sees half a JSON document.
export async function writeRenderStatus(out, status) {
  const tmp = statusFile(out) + '.' + process.pid + '.' + (++writes) + '.tmp';
  await writeFile(tmp, JSON.stringify({ ...status, updatedAt: new Date().toISOString() }, null, 2));
  await rename(tmp, statusFile(out));
}

export async function readRenderStatus(root, project) {
  projectName(project);
  const text = await readFile(statusFile(join(root, 'projects', project, 'output')), 'utf8').catch(() => null);
  if (!text) return { state: 'none' };
  let status;
  try { status = JSON.parse(text); } catch { return { state: 'none' }; }
  // A killed render can't record its own failure.
  if (status.state === 'running' && !isProcessAlive(status.pid)) return { ...status, state: 'failed', error: 'process exited' };
  return status;
}
