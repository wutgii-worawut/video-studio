# Terminal Reliability + Monaco Bundle Optimization — 2026-10-10

## Scope

Applies to `D:\my_project\video-studio`; renderer/Playwright/FFmpeg/FX remain unchanged. User projects and installed models are untouched. Changes have not been committed or pushed.

## PowerShell and node-pty

- Pinned `node-pty` to **1.1.0** in `package.json` rather than shipping experimental `1.2.0-beta.15` (beta Native Module failed the local runtime experiment and npm install scripts were restricted).
- An upstream Windows ConPTY race occurs when `node-pty` forks its `conpty_console_list_agent.js` to attach to a pseudo-console that `kill()` tears down immediately. The helper's native `AttachConsole` may throw; because the error was uncaught the user saw a stack trace or Electron dialog. Reference: [microsoft/node-pty#952](https://github.com/microsoft/node-pty/issues/952).
- `scripts/patch-node-pty.mjs` installs a narrow, idempotent guard in the **installed node_modules copy** of that exact helper. It catches only `AttachConsole failed` and uses node-pty's existing `[shellPid]` fallback; unexpected errors still propagate. The script runs on `postinstall`, `pretest`, `preui:build` and `pretest:electron`. If npm blocks install scripts, the latter explicit scripts still apply the patch before a build/test. No third-party package source is committed as a binary.
- `lib/studio-terminal.mjs` no longer calls `term.kill()` if `onExit` was already observed, avoiding an unnecessary second cleanup attempt on a dead console. Active sockets still terminate their spawned shell when the WebSocket is deliberately closed.
- `tests/studio-terminal-shutdown.test.mjs` mocks an already-exited PTY and verifies no second kill. Real ConPTY, PSReadLine and WebSocket terminal tests have been run against this mitigation.
- The guard prevents the noisy uncaught exception and timeout when the helper discovers the known Windows race. It does **not** solve all upstream process-tree orphaning scenarios when a shell spawned extra descendants; confirm behavior with Claude/Codex sessions before considering a guaranteed process-tree fix.

## Monaco / Vite

- Changed `app/src/components/CodeEditor.tsx` from the `monaco-editor` root import (registers many unused languages) to `editor.api.js` plus the specific language definitions and editor feature contributions the Studio uses: JavaScript, TypeScript, HTML, CSS, JSON, Markdown, XML and YAML.
- TypeScript/JavaScript, HTML, CSS and JSON workers remain enabled and bundled, so syntax/IntelliSense features are not deliberately removed to shrink the package. Code Editor remains dynamically loaded by the React Inspector.
- Measured against the previous packaged build `release-psreadline/win-unpacked/resources/app.asar`: CodeEditor entry **1,347,714 → 29,559 bytes** (−97.8% for that one chunk), generated JS/CSS files **100 → 26**.
- Measured **total gzipped JS/CSS assets**: **3,720,600 → 3,545,182 bytes** (−175,418 bytes, ≈4.7%). The 6.9 MB TypeScript worker and 2.77 MB Monaco core still account for most of the package's uncompressed size. Do not confuse the large reduction in one entry chunk with a 97.8% reduction in the entire app.

## Herdr evaluation

- [Herdr](https://herdr.dev/) is an independent agent/terminal session manager with Windows support and a CLI and local socket API. It can manage persistent Claude Code/Codex/OpenCode sessions and report agent states.
- **Not installed or connected in this change.** It is an optional future integration for persistent AI agent workspaces, not required to fix Monaco's JavaScript bundle or the `node-pty` cleanup race. Avoid migrating Studio's PTY silently because Herdr owns its own terminal server, authentication and lifecycle.
- Integration idea: opt-in agent sidebar linking to existing Herdr workspaces, communicating through an allowlisted CLI/socket adapter in Electron's privileged backend. Keep the main Video Studio Terminal available as a fallback.

## Local verification

- **Passed:** `npm run ui:check`, `npm run ui:build`, `npm test` (**61/61**), `npm run test:electron`, ConPTY/PSReadLine regression tests (**6/6**), and packaged Windows application smoke tests for Monaco Code mode, TIFF Inspector and PSReadLine.
- New packaged installer: `D:\\my_project\\video-studio\\release-optimized\\Video-Studio-1.0.0-x64.exe` (132,719,885 bytes). New unpacked binary: `release-optimized/win-unpacked/Video Studio.exe`. Both older installers and personal workspaces were retained.
- Packaging uses a fresh output directory and does not overwrite the prior installed executables during testing.

## Application installer execution

The new EXE was launched through Playwright. `tests/electron-layout-smoke.spec.mjs` verified the responsive Inspector, TIFF conversion and Monaco HTML Code Editor; `tests/electron-psreadline-smoke.spec.mjs` verified actual PowerShell session authentication and module import from the packaged Electron app. A clean-room install on a different machine is not independently tested. Native ConPTY races are platform-sensitive; the focused patch is best-effort and may need review on subsequent Node/Electron/Windows releases.
