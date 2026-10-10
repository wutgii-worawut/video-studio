# Code and Build Cleanup — 2026-10-10

## Scope and safety

Audited `D:\my_project\video-studio` as an **uncommitted working tree**. No `git clean`, reset, project deletion or media/model deletion was performed. The current React + TypeScript + Electron UI, older explicitly supported Studio fallback, Node.js + Playwright + FFmpeg render engine, automation/batch/cloud tools, tests and documents are kept.

## Cleanup performed

1. **Removed six unused direct development dependencies**: `@radix-ui/react-scroll-area`, `@radix-ui/react-select`, `@radix-ui/react-slot`, `@radix-ui/react-tabs`, `concurrently`, `wait-on`. `npm uninstall --save-dev` removed 35 installed dependency packages including their now-unneeded transitive packages. Updated `package.json` and `package-lock.json`. Packages still required transitively remain managed by npm.
2. **Pruned unused TypeScript imports/variables** in the React workspace (`app/src/App.tsx`, `app/src/components/{Console,FileExplorer,Inspector,Preview}.tsx`). Enabled `noUnusedLocals` and `noUnusedParameters` in `tsconfig.json` so unused symbols now cause a typecheck failure.
3. **Deleted ONLY reproducible obsolete Electron build artifacts** `release/` (78 files, approx. 536 MiB) and `release-oct10/` (500 files, approx. 585 MiB), after confirming no `Video Studio.exe` process was running and verifying that the newer `release-psreadline/Video-Studio-1.0.0-x64.exe` exists. Roughly **1.1 GiB** of obsolete build copies reclaimed.
4. **Expanded `.gitignore`** to ignore `release-*/`, project `.studio-trash/`, coverage and cache paths. `studio/dist/`, `node_modules/`, `models/` and generated project `output/` were already ignored.
5. **Updated README installer paths** to the retained latest build at `release-psreadline/`. Future `npm run desktop:installer` continues to recreate `release/` as configured and it will be ignored by Git.

## Deliberately NOT removed

- **Any** `projects/` folder (including `projects/test-new-project` and `projects/composition-demo`) — some are untracked and may contain user-authored source. No `brand/`, `source/`, `output/`, `docs/`, SFX or media were touched.
- `models/` (~547 MiB) — contains local model data and is ignored by Git.
- The **latest** Windows installer and unpacked build under `release-psreadline/` — kept for installation and rollback.
- `studio/index.html`, `studio/terminal.js`, `lib/hf-adapter.js`, `lib/studio-assets.mjs`, and other legacy/fallback modules — still referenced by explicit fallback commands, APIs or regression tests.
- Docker/Cloud, `styles/`, `examples/`, `sfx/`, `.claude/skills/`, source and documentation — intentional project resources.
- The explicit `dompurify` dependency/override — retained because Monaco uses it transitively and the override pins the safe resolved version.

## Verification

- `npm run ui:check` **passed**, now enforcing TypeScript strict unused-symbol detection.
- `npm run ui:build` **passed**, compiling the production UI.
- `npm test` **passed 54/54** covering project operations, real MP4 rendering, terminal PTY, legacy fallback and React browser UX.
- `npm run test:electron` **passed**, including the desktop bridge and automatic terminal unlock.
- `npm audit --omit=dev --audit-level=high` reported **0 known production vulnerabilities** at audit time.
- `git diff --check` **passed**; Git may print harmless CRLF line-ending warnings.

## Remaining engineering concerns

- **Git baseline is not committed.** Many React/Electron/server/test files still show as `??` and should be reviewed and added to version control in a separate, deliberate change; this cleanup does not automatically commit or push them.
- Monaco's code editor currently creates large production chunks. Code splitting/bundle profiling is a performance optimization, not safe dead-file removal.
- Do not automatically purge `projects/` or `models/` based on Git tracking status.
- The PowerShell `node-pty`/Node 26 `AttachConsole failed` shutdown warning remains separate from unused-code cleanup.
