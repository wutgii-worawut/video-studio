// node recovery.mjs <project> [--clean]
// Dry-run by default; --clean removes only stale stage files from dead PIDs.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { projectName } from './lib/production.mjs';
import { cleanOrphanedStages } from './lib/recovery.mjs';
const [arg, mode] = process.argv.slice(2);
const project = projectName(arg);
if (mode && mode !== '--clean') throw new Error('Usage: node recovery.mjs <project> [--clean]');
const out = join('projects', project, 'output');
const result = await cleanOrphanedStages(out, project, { dryRun: mode !== '--clean' });
console.log(JSON.stringify(result, null, 2));
