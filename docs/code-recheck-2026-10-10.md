# Recheck and Fix Report — 2026-10-10

## Purpose

Second-pass inspection of the real Windows workspace `D:\my_project\video-studio`, emphasizing actual integrity/security bugs in project file operations, web resource isolation, and concurrent source editing. Render Engine (Node.js + Playwright + FFmpeg), React/Electron UI and existing project media were preserved.

## Bugs found and fixed

1. **Upload into nonexistent projects** (`lib/studio-files.mjs`). Before the fix, recursively creating a destination could create a phantom `projects/<name>/source/img` or Docs folder, even though the project was not created through New Project. Now uploads and operations require a pre-existing normal project directory and validate each ancestor before creating subdirectories.
2. **Directory symlink traversal** (`lib/studio-files.mjs`, `lib/studio-workspace.mjs`, `studio.mjs`). The project explorer, upload destination and HTTP project resource routes now reject project/source roots that are symlinks and ensure resolved media/text/static paths stay inside permitted directory boundaries. Project preview and Composition API now validate source paths too.
3. **Cross-drive path boundary bypass on Windows** (`lib/studio-workspace.mjs`). Node `path.relative(C:,D:)` can return an *absolute* path. The old boundary helper did not reject this. It now explicitly rejects absolute relative results and parent traversal.
4. **Lost updates under simultaneous Save operations** (`studio.mjs`). Two overlapping Source PUT or Composition PUT requests could both accept the same original `If-Match` ETag and overwrite one another. Writes are serialized per project; after the first succeeds, a second request sees the new ETag and returns HTTP 412 instead of silently overwriting work.

## New automated tests

`tests/studio-path-audit.test.mjs`: six tests covering unknown project upload, linked project/asset roots, static and Inspector path access, linked Preview/Composition APIs, Windows cross-drive boundary checking, and concurrent writes with the same ETag. Test fixtures are created in a temporary OS directory and removed in finally blocks; no user's project is used or deleted.

## Validation commands

- `npm run ui:check` — TypeScript **PASS**
- `npm run ui:build` — Vite production React **PASS**
- `npm test` — **60/60 PASS**: browser/UI, file-manager, PowerShell, project, actual MP4 rendering and regression suite
- `npm run test:electron` — **PASS**: Electron window and IPC terminal handshake
- `npm audit --omit=dev --audit-level=high` — **0 known vulnerabilities**
- `git diff --check` — **PASS**: whitespace in tracked changes, with harmless CRLF notices

## Intentionally retained and remaining considerations

- All `projects/`, `models/`, brand media, source and published videos remain untouched.
- Existing generated installers are not automatically replaced until a new package is built and verified.
- Project files still change if a user intentionally edits them through Studio; the new safety checks do not eliminate all time-of-check/time-of-use races if another local process maliciously swaps symlinks *while* a file operation is in progress.
- A `node-pty` ConPTY helper may still log `AttachConsole failed` at shutdown under Node.js 26. No third-party native library was patched.
- The Monaco editor creates large JS chunks; optimization would be a separate performance project.
- There are many existing uncommitted and untracked source files; this inspection does not commit/push them.

## Windows installer rebuilt and checked

New installer: `D:\my_project\video-studio\release-reviewed\Video-Studio-1.0.0-x64.exe`.
New unpacked executable: `D:\my_project\video-studio\release-reviewed\win-unpacked\Video Studio.exe`.
Packaged Electron tests: `tests/electron-layout-smoke.spec.mjs` (HTML inspector and actual TIFF preview) and `tests/electron-render-smoke.spec.mjs` (`check composition-demo`, **layout OK, Exit 0**) both passed. Previous installers under `release-psreadline/` were retained for rollback.
Fresh-machine installer installation and signing trust checks have not been independently tested.
