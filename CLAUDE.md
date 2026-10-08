@README.md

## Ground rules

- Ask the user before installing anything; say what and with which command.
- Generated files go in `projects/<name>/output/`; `source/` and `brand/` hold only hand-edited files.
- Voiceover: keep the user's original (e.g. `brand/ElevenLabs_….mp3`) while working on the clip; when the clip is done and the user asks to commit/push, delete the original so only `brand/voice.mp3` is committed.

## Issue log (`issues/`)

Every problem gets a numbered entry, kept forever: `issues/NNN-short-slug.md`, NNN = next number.

- **Hit a problem** (error, hang, wrong output, user reports a bug): first `grep -ri "tags:.*<tag>" issues/` and read matching entries; try the fix that worked before.
- **After fixing it**, write the entry before reporting to the user: date, `tags:` (render, ffmpeg, audio, voice, page, layout, picture, chrome, git — add a new tag when none fits), project, `ref:` the earlier entries it repeats, then ปัญหา / สาเหตุ / วิธีแก้ที่ได้ผล, in Thai. A repeat still gets its own new number with `ref: NNN`. Mark a cause you have not proven as "น่าจะ".
