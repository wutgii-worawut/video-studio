# Video Studio — React + Electron Migration

## Result (Windows)

**Architecture:** React 19 + TypeScript + Vite 8 + shadcn-style Radix primitives + Zustand + Electron. Rendering still runs through the original Node.js + Playwright + FFmpeg modules; no Rust rewrite.

### Run it

- Desktop development: `npm run electron` (builds React then opens Electron).
- React web Studio: `npm run studio` then `http://127.0.0.1:4183/`. PowerShell in web mode needs the access code printed by the launcher.
- Safe browser Studio: `npm run studio:safe` (port 4177, PTY disabled).
- Legacy Studio fallback: `npm run studio:legacy` (port 4184).
- Desktop build folder: `npm run desktop:pack`, opens `release/win-unpacked/Video Studio.exe`.
- Installer: `npm run desktop:installer`, produces `release/Video-Studio-1.0.0-x64.exe`.

### Open all existing projects from installed Electron

Installer ships a small composition demo as a seed workspace, not your personal media/library and 500 MB model. In the app open **Settings → Workspace folder**, enter `D:\my_project\video-studio`, and apply. Electron validates the location (requires `projects/` and `render.mjs`), persists it in its userData profile and restarts. Your original projects stay in their original directory; there is no migration of personal media.

### Main implementation

- `app/src`: React/TypeScript source organized into Project Explorer, source/Monaco editor, Preview + soundtrack, Timeline, Inspector, Tasks/PowerShell, state stores and Radix shadcn-style primitives.
- `app/src/components/ui.tsx`: shared Dialog, AlertDialog, Context Menu, Dropdown, inputs/buttons and accessible focus behavior. **No** `window.alert`, `window.confirm` or `window.prompt` in React source.
- `studio/dist`: generated React assets, served locally by `studio.mjs` when `modern:true` or `--modern`.
- `electron/main.cjs`: starts loopback-only HTTP API, authenticates local terminal via HttpOnly cookie internally, and creates an isolated BrowserWindow. `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`.
- `electron/preload.cjs`: narrow allowlisted IPC for window title and workspace selection; no general filesystem/node APIs are exposed to React.
- `studio/preview-bridge.js`: injects into an opaque-origin sandboxed iframe to isolate project-specific HTML/JS; live preview requests and scene timing are coordinated by postMessage.
- `lib/studio-files.mjs`: document/media upload, rename, duplicate, recoverable deletion with confirmation UI and safe project scoping.
- `lib/studio-tasks.mjs`: allowlisted project commands; packaged Electron uses `ELECTRON_RUN_AS_NODE` and an external workspace copy of `render.mjs`. Playwright dependencies are provisioned outside ASAR.
- `lib/studio-terminal.mjs`: authenticated local Windows PTY for PowerShell/Claude/Codex.

### Responsive behavior

Desktop workspace supports resizable/collapsible Explorer, Preview, Inspector, Timeline and Console. For narrower windows the Explorer and Inspector use mobile-style overlay panels. Browser E2E checks 1440×900, 1366×768, 920×680, 768×670, and 390×844 for horizontal overflow.

### Verification performed

- `npm run ui:check` — TypeScript successful.
- `npm run ui:build` — Vite production build successful.
- `npm run test:ui` — Chrome responsive, Dialog/File Manager and sandbox preview suite passes.
- `npm test` — existing render/workflow + React tests pass (41 total at verification time).
- `npm run test:electron` — real Electron window opens, Node.js isn't directly exposed, PowerShell auto-authenticates.
- `npm run desktop:pack` — packaged Windows executable generated and launched successfully.
- `tests/electron-render-smoke.spec.mjs` — against packaged `release/win-unpacked/Video Studio.exe`, actual task `check composition-demo` succeeds; `STUDIO_ELECTRON_DRAFT=1` tested MP4 draft: 180 frames, 6.00 seconds, successful publish.
- `npm run desktop:installer` — NSIS installer generated. **Installation on a fresh Windows account has not been separately tested.**

### Limits and follow-up work

- This is a responsive project workspace with source-backed editing and composition controls, **not** yet full Premiere-style nonlinear editing. Complex legacy HTML animations are not all transformable into draggable, editable clips. Multi-track trim/split and property editing across arbitrary JS require deeper authoring-model work.
- PowerShell runs with Windows-user privileges. Use only on trusted local workspaces. Old terminal PTY may show a `conpty_console_list_agent` / `AttachConsole failed` warning at shutdown under Node.js 26.
- An installed PC still needs a suitable Chrome/Playwright browser and FFmpeg/FFprobe accessible to the render engine; we have not bundled licensed FFmpeg binaries or the browser into the installer.
- Built frontend may be several MB because Monaco editor language workers are included; loaded editor chunks are split.
- Electron installer has not received a custom icon or independently verified commercial code-signing identity.
- Be mindful of changing source media filenames: existing HTML references are not automatically rewritten.

## New Project + full-frame Live Preview (October 2026)

**Preview fix:** Existing HTML compositions are authored for a 1080×1920 browser viewport. A responsive iframe with width/height `100%` changes that viewport and clips content. The React Preview now keeps the iframe at 1080×1920 CSS pixels and scales its rendered rectangle through a `ResizeObserver`, so the entire 9:16 canvas fits the available space in normal and expanded modes.

**Create a project in React/Electron:** Click **New Project** next to the project switcher → enter a project folder name (lowercase letters/digits/hyphens), optional video title, duration 2–180 seconds, and choose **Blank canvas** (1 editable title clip) or **3-scene starter** (title/callout/outro) → **Create Project**. Studio creates `projects/<name>/source/index.html`, `source/composition.json`, `source/composition-data.js`, `source/img`, `brand/brand.md`, `brand/sfx`, `docs/README.md`, and `output/`, then automatically switches to the new project. Existing project directories are never overwritten.

**After creation:** Open **Inspector → Composition** to edit text and clip timing, use **Import** in Explorer for visuals/music, then **Render Tasks → Check**, **Draft** or **Render** to create your MP4. Importing a file does not automatically place it into a scene: HTML/Composition must reference it.

**Tests:** `tests/studio-projects.test.mjs` checks valid/invalid names, non-overwrite API behavior, React's New Project dialog without native prompt, fit-to-frame in both normal/expanded modes, and actual Playwright+FFmpeg `check` and MP4 draft from a freshly created blank project.

## Workspace usability fixes (October 2026)

- **Entire terminal panel hide/show:** The down-arrow in the Terminal toolbar removes the entire bottom panel and returns its space to the Preview/Explorer/Inspector. **Show Terminal** appears in the top toolbar; `Ctrl+`` toggles. Live Preview stays mounted to avoid losing the current playback frame. Visibility persists between launches.
- **Inspector Focus without obscuring Explorer:** Inspector → Expand now shows **Project Explorer | Expanded Inspector** as two resizable columns, leaving the file list visible and selectable. Restore returns to Preview/Timeline. On phone widths the expanded Explorer appears above the Inspector rather than behind a modal.
- **HTML inspector:** `.html` / `.htm` has **Visual** and **Code** views. The main `source/index.html` can run in a sandboxed, opaque-origin 1080×1920 preview and follow the playhead. Other HTML files receive a static iframe preview with scripts disabled. Code opens in the existing Monaco editor; rendering untrusted HTML is never injected into React's own DOM.
- **Image inspector:** PNG, JPEG, WebP, GIF, SVG, AVIF, APNG, BMP, and ICO are previewable directly. TIFF/TIF and HEIC/HEIF are converted for preview to PNG by Sharp when the codec is supported. Original files are kept untouched. Files not supported by the runtime show an error and a link to the original. Explorer import accepts these extensions; SVG upload rejects script, event handlers, foreign objects and external resource references. RAW/camera-specific codecs cannot universally be guaranteed.
- **Tests:** `tests/react-workspace-layout.test.mjs` covers terminal layout restoration, persistent iframe, desktop/phone expanded Inspector, HTML Visual/Code, switching SVG/PNG without restoring Preview, and AVIF/BMP/APNG/SVG/TIFF media response.

## PowerShell execution policy / PSReadLine (October 2026)

The Studio PTY now prefers `pwsh.exe` (PowerShell 7) when available and falls back to `powershell.exe`. It passes `-ExecutionPolicy RemoteSigned` **only to that PowerShell process** and explicitly initializes PSReadLine, avoiding the `running scripts is disabled` startup error caused by the older Restricted setting. It does not use Bypass and does not persist any changes to CurrentUser/LocalMachine policy. Organization-enforced MachinePolicy/UserPolicy always takes precedence; inspect via `Get-ExecutionPolicy -List` if PSReadLine remains blocked. Existing sessions must be closed and a new Studio/Terminal process opened to pick up the fix. A regression test runs the real node-pty ConPTY and confirms PSReadLine loads. The unrelated node-pty `AttachConsole failed` shutdown warning under Node.js 26 still needs separate compatibility work.
