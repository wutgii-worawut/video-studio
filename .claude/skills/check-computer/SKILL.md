---
name: check-computer
description: ตรวจสภาพแวดล้อม Video Studio (Node, Chrome/Playwright, FFmpeg/FFprobe, React/Electron, Windows PTY) และทดสอบตามจริงก่อนสร้างคลิปหรือแพ็กแอป
disable-model-invocation: true
---

Inspect, diagnose and validate the actual machine for Video Studio. Reply in the user's language. Follow `CLAUDE.md`. **Never install, download, upgrade, alter machine-wide policies or replace binaries without the user's explicit approval.** Do not treat historical documentation as a current test result.

## 1. Determine platform and intended task

- Read `package.json` for current scripts/dependencies and confirm the workspace root. Report the OS, Node/npm versions, Git branch and any local changes. Do not reset/clean the working tree.
- Ask what they intend only if genuinely unclear: **render existing clips**, **develop React/Electron**, or **build/test a Windows installer**. You can diagnose all categories without asking when the task is explicit.
- The Electron builder targets Windows NSIS (`desktop:installer`). Do not claim macOS/Linux installer support. Do not assume that an older Node 18 runtime satisfies the current Vite/Electron toolchain; verify package/engine compatibility by actual build checks.

## 2. Inventory (report a table with state + evidence)

| Dependency/capability | Check / evidence |
| --- | --- |
| Node and npm | `node --version`, `npm --version`; verify suitability for installed toolchain |
| FFmpeg and FFprobe | `ffmpeg -version`, `ffprobe -version`, both callable on PATH; test actual H.264/AAC encode and probe if needed |
| Chrome or supported Playwright Chromium | Playwright package is local, not global; launch real browser. `render.mjs` uses Chrome channel by default, or bundled Chromium when `VIDEO_STUDIO_BROWSER=chromium` |
| Playwright dependency and browsers | Inspect local `node_modules/playwright` and confirm the selected browser can actually launch |
| React/Vite/TypeScript | Local `npm run ui:check` and `npm run ui:build` succeed; output `studio/dist/` is generated |
| Electron | Installed local Electron binary can launch when the OS has a desktop session; `npm run test:electron` checks the real app |
| Windows PowerShell terminal | Windows: check `pwsh.exe` (preferred) or `powershell.exe`, `node-pty@1.1.0`, real ConPTY and PSReadLine import; check the actual regression tests |
| Windows packaging (when requested) | `electron-builder` availability, prerequisites, disk space, signing status and whether a build/installer actually launches |

Use statuses **ready / missing / blocked / not tested / not applicable**, not blanket "ready" when an item was only found on PATH. Chrome/FFmpeg working on one machine does not prove installer portability to another.

## 3. Install/repair plan — only when needed

For each missing dependency, explain the purpose, exact command, scope and version (if pinned), and wait for approval before changing anything. Prefer restoring the lockfile-resolved local dependencies with `npm ci` after approval, not arbitrary global `npm install -g` or unsupported upgrades. Platform package managers may include Windows `winget`, macOS `brew`, Linux package management, but select the exact command only after detecting the platform and available packages.

**Windows native module caution:** `node-pty` is pinned to `1.1.0`. `scripts/patch-node-pty.mjs` guards only the known ConPTY `AttachConsole failed` cleanup race in the installed dependency. The script runs on `postinstall`, `pretest`, `preui:build` and `pretest:electron`. Do not edit vendored source manually, suppress all errors, or update the pin without code review and real PTY tests. Never change machine/user PowerShell execution policy persistently; the app uses session-scoped `RemoteSigned`, subject to organization policy.

**Browser caution:** The renderer defaults to the installed Chrome channel. The alternative bundled Playwright Chromium requires its browser executable and `VIDEO_STUDIO_BROWSER=chromium` in the process environment. Installing browser binaries or FFmpeg is a separate consented action.

## 4. Non-destructive verification (after environment is ready)

From repo root, and recording exit codes:

~~~powershell
npm run ui:check
npm run ui:build
npm test
~~~

- `npm test` runs the current Node unit/integration regression suite; confirm the actual test count/results from output, not older docs. Tests include source/file safety, project creation, render tasks and Windows PTY when supported.
- For the requested render capability, run `node render.mjs skillz-promo check` only when that sample project exists. Require `layout OK` and exit code 0. Preview generated stills only with consent if an output would be overwritten.
- When Electron is in scope and a graphical desktop is available, run `npm run test:electron`. Windows-specific focused PTY tests can be invoked with `node --test tests/studio-psreadline.test.mjs tests/studio-terminal-shutdown.test.mjs`; do not assume availability on other operating systems.
- If a generic FFmpeg/Playwright smoke needs throwaway files, put them in an OS temp directory, use a unique name and delete only those files created by the test. Verify with FFprobe rather than trusting exit code alone.
- When packaging is explicitly in scope, use `npm run desktop:pack` or `npm run desktop:installer` only after confirming output path and whether existing `release/` artifacts may be replaced. Check a real packaged Electron executable with the appropriate smoke suites, not merely that an installer file exists. A smoke test on the current PC is **not** a clean-machine install test.

## 5. Report

Give a compact evidence table showing versions, commands, pass/fail/not-run, actual errors and what remains. Distinguish render-ready from desktop-ready and installer-tested. Link to relevant issue logs under `issues/` when diagnosing known problems. Explain any required approved next step before running it; do not make silent system changes or edit the user's project media/models.
