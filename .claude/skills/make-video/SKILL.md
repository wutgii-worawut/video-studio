---
name: make-video
description: สร้างหรือแก้คลิปใน Video Studio ด้วย Brand + HTML render(t) หรือ Composition JSON, ตรวจภาพและเสียงก่อนเรนเดอร์ MP4
argument-hint: <project-name> [extra wishes]
---

Project: `$ARGUMENTS` (first word is the existing/new project name; the rest is the user's brief). Reply in the user's language. Follow `CLAUDE.md`, the actual `render.mjs`/`package.json`, and current project files, not stale assumptions in older README sections.

## 1. Understand before editing

1. Inspect `git status -sb` and the project folder. Accept only project names matching lowercase letters, digits and hyphens. Do not overwrite or reinitialize an existing project.
2. Read `projects/<name>/brand/brand.md`, relevant project `docs/` and the assets in `brand/`, `source/` and `output/`. If brand facts are missing, use `projects/skillz-promo/brand/brand.md` only as a blank template, then ask for facts and **stop**; do not invent claims, prices or identities.
3. Use the style specified by `สไตล์: <style>` in `brand.md`: read `styles/<style>/style.md` and inspect `example.png`, code and reference project. If no style exists, present actual available styles for selection rather than choosing silently.
4. For identifiable real people, products or fictional characters, verify each picture against a labelled/authoritative reference and record provenance in `brand/web/SOURCES.txt`. Do not infer a person's identity from appearance.

## 2. Choose the existing authoring model; do not mix contracts accidentally

**Legacy HTML / motion-graphics project:** Work in `projects/<name>/source/index.html`. Keep `window.render(t)` deterministic, 1080×1920, scene timing via `SCENES` / `ITEMS` / `window.DUR` / `window.STILLS`, with optional `lib/fx.js` effects. Reuse patterns from a finished project but make the creative design fit the brand. Changing legacy HTML does **not** make all clips editable in the Composition Inspector.

**Declarative Composition project:** If `source/composition.json` exists and the page consumes `window.VIDEO_COMPOSITION`, edit the JSON as the source of truth using the supported schema in `lib/composition.mjs` and the factories in `components/render.js`. Keep clip timing, ids and `composition.duration` valid (30fps frame alignment). After direct JSON edits, run `node compose-sync.mjs <name>` to regenerate `source/composition-data.js`; the browser's `file://` render cannot fetch the JSON directly. When editing through Video Studio's Composition Inspector, use its Save operation, which also syncs the sidecar and rejects conflicting ETags. Do not hand-edit generated `composition-data.js` as the primary source.

**Creating a project:** The React/Electron **New Project** flow offers Blank canvas or 3-scene starter and creates `source/index.html`, `source/composition.json`, `source/composition-data.js`, `source/img/`, `brand/brand.md`, `brand/sfx/`, `docs/README.md` and `output/`. Follow `lib/studio-projects.mjs` for its actual accepted fields/rules (currently 2–180 seconds). Do not claim all arbitrary imported HTML is converted to editable clips.

## 3. Design and media

- Use the brief and verified brand facts to outline scenes, copy and timing. A default 15s promo may progress from problem (0–3s) to benefits (3–10s) to a CTA (10–15s), but follow the requested duration/style.
- Choose motion/effects from `lib/fx.js` compatible with the style. Animate text entrances, transitions, highlights, camera movement, SVG, etc. Check that important text fits the TikTok/Reels safe zone and that SFX emphasize meaningful changes.
- Media belongs in `source/img/`, `brand/` and `brand/sfx/`. Video Studio's Explorer can import, rename, duplicate, move to Trash and restore supported assets, but **uploading does not insert an asset into a scene**, and renaming can break HTML/JSON references. Keep assets referenced by source in sync.
- Write source/brand facts carefully; rendered MP4s, stills and temporary audio belong in `output/`. Do not delete existing output or original uploads simply to save space.

## 4. Voice and sound (if used)

1. Draft any narration from `brand.md` facts and obtain user approval before costly voice generation. For ElevenLabs v3, optional direction tags like `[excited]` or `[whispers]` and Thai-spelled numbers can aid the script; the user supplies the generated recording in `brand/`.
2. Keep the original recording. Use a canonical `brand/voice.mp3` (or supported `voice.wav` / `voice.m4a` / `voice.ogg`) for the renderer. Music may be `brand/music.*`; cues can use built-in `sfx/` or project `brand/sfx/`. Do not invent missing audio sources.
3. If aligning words, get real timestamps from the audio. The FFmpeg Whisper filter is optional and may not be available in every binary. Confirm its availability and model path before relying on it; ask before downloading a model. Check the transcript manually for Thai spelling/errors. Set scene timings to the actual voice and allow an appropriate ending.
4. For supported lip-sync, `node render.mjs <name> voice` generates `source/voice.js` from the canonical recording; include/load it only for animations that consume `window.VOICE` (e.g. Mochi). The source file is a generated sidecar.
5. Rendering uses PCM mixing and ducking (voice, music, SFX), one AAC encode and stream-copy mux. `node render.mjs <name> audio` can check mixing without a full video, but the output/test is not a substitute for listening. Audio mixing currently has a duration limit; consult `lib/audio-pcm.mjs`.

## 5. Validate, preview, request approval

From the repository root:

~~~powershell
node render.mjs <name> check
node render.mjs <name> stills
~~~

- Require a successful `layout OK` with exit code 0, then **look at** every generated still in `projects/<name>/output/stills/` and inspect additional in-between transition frames. Correct typography, crop, movement, images and timing; redo check/stills after each change.
- Studio UI: `npm run electron` for desktop, or `npm run studio` for React web on `http://127.0.0.1:4183`. Its terminal requires the launch access code; `npm run studio:safe` provides task-only mode on port 4177. Pages: Director (preview + scenes), Code (Monaco tabs, Save/Revert with ETag), Library (media/docs, Trash), Render (tasks, log, outputs). Studio reloads its preview by itself when you edit `source/`.
- When the user inserts `@projects/<name>/output/frames/frame-MM-SS-CC.png` from Studio, that PNG is the exact frame they are looking at (`node render.mjs <name> frame <seconds>` makes the same file). Read it before answering.
- Preview shows **current HTML frames**, but soundtrack playback uses the **most recently rendered MP4**. Changing voice/music/SFX/timing may require a new draft render before preview audio matches the edit.
- Show the user the stills and relevant findings, then **wait for approval** before the final render. Repeat the cycle when feedback arrives.

## 6. Render only after approval

~~~powershell
node render.mjs <name> video 1 2  # quick draft: 1 sample/frame, 2 workers
node render.mjs <name> video 8 2  # final: 8 motion-blur samples/frame, 2 workers
~~~

**Before starting a render, and to follow one, read `projects/<name>/output/.render-status.json`** (written by `render.mjs` for check, stills, audio and video; Studio shows the same file). Fields: `state` (`running` | `complete` | `failed`), `mode`, `args`, `pid`, `startedAt`, `updatedAt`, `frames` (`{done,total}` for video), `error`, `output`. If `state` is `running`, a render is already in progress — possibly one the user started from Studio — so wait instead of starting another; if its `pid` is no longer alive, it died without finishing. After your own render, `complete` plus FFprobe below confirms the result; `failed` carries the error message.

Omitting blur/workers uses the engine's validated defaults. Use only resource limits appropriate to the machine. The renderer acquires a per-project lock, stages files, verifies via FFprobe, then publishes `projects/<name>/output/<name>.mp4` without prematurely replacing the prior MP4. Avoid concurrent renders of the same project.

Confirm FFprobe metadata: 1080×1920, 30fps, expected `DUR × 30` frames, duration and appropriate audio stream; check the actual audio/visual result and disclose any unverified concerns. If a render fails, inspect logs and `issues/` first. Do not remove recovery/staging files while another render runs; `node recovery.mjs <name>` is a dry run by default.

## Engineering changes

If this task also modifies app/renderer behavior, run focused tests and `npm run ui:check` plus `npm test`; for Electron changes, run appropriate desktop smoke tests. Document real results and known limitations rather than reusing historical pass counts. Do not include installers, models, user media, generated outputs or unrelated test projects in Git.
