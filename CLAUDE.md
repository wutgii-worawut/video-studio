@README.md

# Claude Code operating guide — Video Studio (updated 2026-10-10)

Read the real source, `package.json`, and `git status -sb` before editing. Source and scripts override stale historical notes in README/docs. Answer in the user's language and distinguish verified tests from assumptions.

## Current architecture

- **UI:** `app/src/` is React + TypeScript + Vite, Zustand, and Radix/shadcn-style primitives. `app/src/components/CodeEditor.tsx` dynamically loads a selective Monaco build. Preserve TypeScript/HTML/CSS/JSON language workers when optimizing bundles.
- **Desktop:** `electron/main.cjs` and `electron/preload.cjs` host isolated Electron (`nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`). Never expose unrestricted Node, filesystem, or terminal IPC to the renderer.
- **Backend:** `studio.mjs` serves the loopback-only UI and scoped APIs. `lib/studio-files.mjs`, `lib/studio-workspace.mjs`, `lib/studio-projects.mjs` and `lib/studio-tasks.mjs` implement safe file operations, project creation, and allowlisted tasks. Preserve path/symlink boundaries, origin/terminal authentication, ETag/If-Match write conflicts, Trash/Restore and no-overwrite behavior.
- **Terminal:** `lib/studio-terminal.mjs` uses authenticated local PowerShell via `node-pty@1.1.0`. `scripts/patch-node-pty.mjs` applies a narrow, idempotent guard against a known Windows `AttachConsole failed` cleanup race in installed `node_modules`. Do not silently upgrade the pinned version, patch unrelated errors, commit `node_modules` or persistently change PowerShell execution policy.
- **Renderer:** `render.mjs`, `lib/render-video.mjs`, `lib/audio-pcm.mjs`, `lib/production.mjs` and `lib/recovery.mjs` retain `window.render(t)`, 1080×1920/30fps, Chrome/Playwright capture, FFmpeg/FFprobe, PCM/AAC mixing, stream-copy mux, project lock and validated staged publish. HyperFrames is a reference; Video Studio does not use it as a replacement engine.
- **Authoring:** Legacy `projects/<name>/source/index.html` remains supported. For a declarative project, `source/composition.json` is the editable source of truth, `source/composition-data.js` is its generated browser sidecar, and `lib/compose-browser.js` + `components/` implement supported clips. Arbitrary legacy HTML is not automatically a draggable multitrack timeline.

## Commands (from repo root)

| Task | Command |
| --- | --- |
| React/Electron desktop | `npm run electron` |
| Modern browser Studio with authenticated PTY | `npm run studio` → http://127.0.0.1:4183 |
| Task-only browser Studio | `npm run studio:safe` → http://127.0.0.1:4177 |
| Legacy browser Studio | `npm run studio:legacy` → http://127.0.0.1:4184 |
| Frontend type/build | `npm run ui:check` / `npm run ui:build` |
| Automated suite / Electron smoke | `npm test` / `npm run test:electron` |
| Windows unpacked build / installer | `npm run desktop:pack` / `npm run desktop:installer` |
| Render checks / stills / draft / final | `node render.mjs <name> check` / `stills` / `video 1 2` / `video 8 2` |

The configured builder output is `release/`; previously reviewed `release-*/` builds are generated local artifacts, not source. Installed Electron ships a demo seed, not private media/models; select existing projects through **Settings → Workspace folder**. A packaged smoke test is not proof of a clean-machine installation.

## Ground rules

- **Ask before installing/downloading anything.** State why, exact command and version; do not change dependencies just to bypass a failure.
- **Protect user data.** Do not delete, overwrite, rename, or stage unrelated `projects/*`, models, outputs, Trash, credentials or installers. Project names use lowercase letters/numbers/hyphens; never overwrite an existing project.
- MP4/stills/intermediate render files belong in `projects/<name>/output/`. Generated source exceptions are `source/composition-data.js` (sync from JSON) and `source/voice.js` (generated lip-sync). Do not hand-edit sidecars as the source of truth.
- Preserve the user's original narration (e.g. `brand/ElevenLabs_….mp3`) while working. For a user-requested commit/push, stage the intended `brand/voice.mp3`, not duplicate originals; do not silently delete an original local recording.
- **Git:** Work on the user-selected branch (currently `upgrade-feature-and-engine`), never casually modify/merge `main`, force-push or stage unrelated untracked projects. Commit/push only when requested.
- **Quality:** Inspect stills and transition frames, wait for user approval before final video render, verify output with FFprobe, and listen/watch when appropriate. `layout OK` and a passing suite do not prove creative quality.
- **Tests:** Run focused tests plus `npm run ui:check` and `npm test` after app/engine changes. Run Electron/packaged smoke when desktop behavior changes. Report actual exit status; historical pass counts are not fresh runs.

## Skills and reference docs

- `.claude/skills/make-video/SKILL.md`: brand → legacy HTML or supported Composition → checks/stills → approval → final video.
- `.claude/skills/check-computer/SKILL.md`: toolchain diagnosis and consent-based setup.
- Consult `docs/electron-migration.md`, `docs/terminal-monaco-optimization.md`, `docs/production-readiness.md`, `docs/hyperframes-integration.md`. Some old sections document previous ports or pre-fix limitations; verify against source.

## Issue log (`issues/`)

Keep every issue as the next numbered `issues/NNN-short-slug.md`. On any bug/error/hang/wrong output: first search `issues/` for related `tags:` and read previous fixes. After a fix, record date, tags (render, ffmpeg, audio, voice, page, layout, picture, chrome, git, electron, terminal, editor, etc.), project, `ref:` for repeats, and ปัญหา / สาเหตุ / วิธีแก้ที่ได้ผล in Thai. Label unproven causes `น่าจะ`; never erase earlier entries. Record the issue before declaring the bug fixed.
