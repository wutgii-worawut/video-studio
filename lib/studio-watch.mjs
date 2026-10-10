// Watches a project's source/, brand/ and docs/ so Studio can reload the preview when Claude (or anything) edits them (spec 8C).
// output/ is never watched: renders write there constantly.
import { watch } from 'node:fs';
import { join } from 'node:path';
import { projectName } from './production.mjs';

const FOLDERS = ['source', 'brand', 'docs'];
// Hidden files, Studio's own staging files (.stage-*, .vs-edit-*), temp and editor swap files.
const IGNORED = /(^|\/)\.|\.stage-|\.vs-edit-|\.tmp$|~$/;

export function watchProject(root, project, onChange, { debounceMs = 300 } = {}) {
  projectName(project);
  const pending = new Set();
  let timer = null;
  const flush = () => { timer = null; const at = Date.now(); for (const path of pending) onChange({ type: 'changed', path, at }); pending.clear(); };
  const watchers = [];
  for (const folder of FOLDERS) {
    try {
      const w = watch(join(root, 'projects', project, folder), { recursive: true }, (_event, name) => {
        if (!name) return;
        const path = folder + '/' + String(name).replaceAll('\\', '/');
        if (IGNORED.test(path)) return;
        pending.add(path);
        timer ??= setTimeout(flush, debounceMs);
      });
      w.on('error', () => w.close()); // folder deleted or project moved to Trash
      watchers.push(w);
    } catch { /* folder doesn't exist (e.g. no docs/) */ }
  }
  return () => { clearTimeout(timer); for (const w of watchers) w.close(); };
}
