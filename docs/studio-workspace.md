# Video Studio — Project Workbench

## Why a Workbench instead of only a player?

`Play/Pause` with audio is **diagnostic**, not an automatic quality enhancer. It helps spot narration timing, transitions, SFX sync, pacing and frame-boundary problems. To improve the actual video, a human or agent still needs to edit Source/Brand/FX and rerender the result.

Before this change, Studio had passive sections with little utility. The new layout follows real work: **pick project → inspect source/brand/resources → preview/listen/seek → run check/render → inspect output**.

## Layout

| Area | Purpose |
|---|---|
| Project dropdown (top) | Select one of the local `projects/` compositions |
| Source tab | List HTML, JavaScript, composition JSON and source image resources |
| Assets tab | See project media in source+brand, plus shared SFX files |
| Brand tab | Read brand.md, inspect reference images, preview the voice/music/SFX |
| Docs tab | Browse project Markdown/script notes, docs/, issues/, workflow skills |
| FX tab | Inspect lib/fx.js, audio/render modules, style packs and component registry |
| Models tab | Inspect filename and size only; model binaries are never sent to the browser |
| Output tab | Inspect published MP4, subtitle SRT and stills |
| Center Preview | Scrub live `render(t)` image; audio follows the last rendered MP4 |
| Right Inspector | Read file content or view/play media. Scene entries seek. JSON composition editor retains existing Save behavior |
| Bottom Task Console | Run common project commands, watch process output, stop jobs |

## Console commands

```text
help
check
stills
render 1 2
render 8 2
voice
audio
probe
test
status
recovery
benchmark 1 2
clear
```

Commands are parsed and allowlisted by `lib/studio-tasks.mjs`; no shell is invoked and no arbitrary flags, pipe operators or redirects are accepted. This is an **integrated project task console**, not an unrestricted terminal emulator. `render` and `benchmark` may take many minutes; output is retained up to 100 KB per job. Only one task runs at a time in the local Studio instance. Stop attempts to terminate the child process tree.

## API

`studio.mjs` is bound to `127.0.0.1`. It provides read-only scoped file explorer routes:

- `GET /api/studio/entries?project=...&group=...`
- `GET /api/studio/text?project=...&group=...&path=...`
- `GET /api/studio/media?project=...&group=...&path=...`
- `POST /api/studio/task` (same-origin only)
- `GET /api/studio/task?id=...`
- `POST /api/studio/task/cancel` (same-origin only)

Paths are validated, symlink entries are skipped, text previews are capped at 512 KB, image/audio/video previews at a bounded size, and model files are metadata-only. Do not expose this service publicly or forward its port to other machines.

## Limits

- Existing HTML projects still require editing their JavaScript/HTML outside Studio (this release adds a file viewer, not a full code editor).
- Composition editing remains limited to projects with `composition.json` such as `composition-demo`.
- Tasks is allowlisted. Full interactive PowerShell is available in the separately enabled `studio:terminal` mode after local token authentication.
- Visual timing comes from current Source, but audible soundtrack comes from **published MP4**. Run `render 1 2` for fast feedback after editing, then `render 8 2` for final blur.
- Not a full NLE: drag/drop, trim/split, multitrack audio mixing and in-canvas property editing would require additional authoring/model integration.

## Acceptance

Automated tests cover categorized file listing, text/media authorization, path traversal prevention, metadata-only model listing, command allowlist and same-origin enforcement, console job lifecycle, browser tabs, scene seeking and integrated check.

Run:

```powershell
cd D:\my_project\video-studio
npm test
npm run studio
```

## Media Manager + Expandable Workspace + PowerShell (October 2026)

### Add and rename assets

Project Explorer → choose **Assets** or **Brand** → choose the **Upload to** destination → **+ Add media**, or drag files onto the Explorer:

- `Source images` saves to `projects/<name>/source/img/`
- `Brand media` saves to `projects/<name>/brand/`
- `Brand sound effects` saves to `projects/<name>/brand/sfx/`

Supported media include PNG/JPEG/WebP/GIF, MP3/WAV/M4A/OGG and MP4/WebM. Maximum 100 MB per file; existing files are not overwritten. Select an eligible uploaded media item in the Inspector and click **Rename media**. Renames retain the file extension and original directory. No arbitrary code upload.

**Important:** Adding a file does not automatically add it to HTML or the active render. You must reference the path in your source/composition. Renaming existing files can break references; update source paths accordingly.

### Expand and restore

- Inspector → **Expand** shows the selected asset or document across the main workspace and temporarily hides Live Preview; **Preview** restores it.
- Live Preview → **Expand** gives the video preview the workspace width; **Restore** returns the three-column layout.

### Fully interactive PowerShell (explicit opt-in)

Double-click `D:\my_project\video-studio\start-studio-terminal.cmd`, or execute:

```powershell
cd D:\my_project\video-studio
npm run studio:terminal
```

Open `http://127.0.0.1:4183`, choose a project, select **PowerShell / Claude / Codex**, and enter the one-time **Terminal access code** printed in the launcher/PowerShell window. The session starts in that project's folder. Example commands:

```powershell
Get-Location
Get-ChildItem
claude
codex
```

The machine has Claude Code 2.1.296 and Codex CLI 0.148.0 installed. WebSocket keyboard transport and the interactive PowerShell prompt have passed browser tests. The Claude/Codex full-screen UIs have not undergone exhaustive end-to-end validation.

**Security:** The embedded PowerShell is a full-permission terminal (same privileges as the Windows account running Studio). It is disabled in regular `npm run studio` and enabled only by `npm run studio:terminal`. The server binds to `127.0.0.1`, verifies Host/Origin and requires an ephemeral access token with an HttpOnly SameSite cookie for its WebSocket. Never share the access code or expose/forward the port.

**Limits:** An uploaded file is not inserted into the timeline automatically. The Model tab remains metadata-only. The PowerShell session does not elevate Windows permissions or bypass Claude/Codex authentication. Use Tasks for constrained render commands or PowerShell for general CLI development.

## Studio File Manager + default PowerShell (10 October 2026)

### File Manager operations

Select a project and use **+ Add files**. Choose the destination first:

- Source images → `projects/<project>/source/img` (media)
- Brand media → `projects/<project>/brand` (media)
- Brand sound effects → `projects/<project>/brand/sfx` (media)
- Project documents → `projects/<project>/docs` (documents)
- Brand notes → `projects/<project>/brand` (documents)

Documents supported: `.md`, `.txt`, `.csv`, `.srt`, `.vtt`, `.json`, `.pdf`, `.docx`, `.xlsx`, `.pptx`. Max 100MB per file (plain text max 5MB). PDFs may be previewed in the inspector, Office files downloaded. `brand.md`, script/source files, global docs, output, shared SFX and model files remain protected.

Select a managed file in **Project Explorer** to access **Rename**, **Duplicate**, **Move to Trash**; a deleted file is moved into `projects/<project>/.studio-trash`. The **Trash** tab lists deletions and offers **Restore**. Restore refuses to overwrite existing files, and duplicate creates `*-copy.ext`, `*-copy-2.ext`, etc. Files are never permanently deleted using the browser UI. Changing an asset filename may require updating its reference in HTML/JS.

### Terminal immediately visible

`npm run studio` now starts the PowerShell-enabled Studio on **127.0.0.1:4183**. The PowerShell tab appears automatically; **first use still needs the access code** shown by the process that launched Studio. Subsequent access during the same authenticated session uses the secure session cookie. The terminal supports PowerShell, Claude Code and Codex CLI and has the same privileges as the Windows user running the server.

```powershell
cd D:\my_project\video-studio
npm run studio
# Open http://127.0.0.1:4183
```

`npm run studio:safe` is the opt-out, task-only Studio at port 4177. `npm run studio:terminal` remains an alias for the standard terminal-enabled launch. Old Studio processes at 4177/4180 are not automatically upgraded—close old pages and open the new URL. The access code is deliberately not embedded in the web page, URL or JavaScript because the PowerShell terminal grants arbitrary local command execution.

### Testing status

Browser integration tests cover docs upload, rename, duplicate, trash and restore; file path traversal and no-overwrite rules; PowerShell authentication, PTY and browser keyboard input. On this machine `node-pty` under Node.js 26 may still print a harmless **AttachConsole failed** diagnostic when a session closes; this is not yet resolved and needs compatibility follow-up.
