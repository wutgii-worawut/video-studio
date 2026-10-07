---
name: make-video
description: Make or edit a promo clip for a project in projects/<name> (motion graphic HTML → stills → mp4 with sound). Use when the user asks to make, edit, re-time, or render a clip.
argument-hint: <project-name> [extra wishes]
---

Project: `$ARGUMENTS` (first word is the project name; anything after it overrides the defaults below). Reply in the user's language.

1. **Brand.** Read everything in `projects/<name>/brand/`. If `brand.md` is missing, create it from `projects/skillz-promo/brand/brand.md` as a template with the facts blanked, ask the user to fill it in (plus product images, optional `music.mp3`, optional `sfx/`), and **wait**. Done when every brand fact you put on screen comes from there.
   **Style.** `brand.md` names a style (`สไตล์: <style>`): read `styles/<style>/style.md`, look at its `example.png` and reference project, and use its assets (e.g. `boil.js`). No style named → show the user the folders in `styles/` with their example images and ask which one, or whether this clip starts a new style. Done when the stills match the style's example in palette, fonts, lines and motion.
   **Pictures of real people or characters** (anime, film, a real product line-up): a picture goes on screen under a name only after you have matched it against a picture labelled with that name (MyAnimeList characters page, the official site, a wiki the user links). Write in `brand.md` which file shows whom and where each came from (`brand/web/SOURCES.txt`). When no verified picture exists, tell the user which one is missing and show a doodle or a picture of the scene instead; the user can send a link to fill the gap.
2. **Write `projects/<name>/source/index.html`.** One file, 1080x1920, every frame a pure function of `render(t)`. Start from a finished project's skeleton (stage + camera, `SCENES`, `ITEMS`, scrubber, `?t=`, `?render`) and design the look fresh for this brand. A length other than 15 s: set `window.DUR` (seconds) and `window.STILLS` (one preview time per scene) in the page; `render.mjs` reads both.
3. **Effects.** Read the catalogue at the top of `lib/fx.js` and pick what suits the brand's style: per-word text, highlight/strike, spring/back easing, scene transitions (zoom, whip, circle, wipe), camera shakes on impacts, SVG draw-on, confetti. Give every entrance and impact a sound (`sfx` in `ITEMS`, extra cues in `FX.cues`). Done when no transition repeats back to back and every big moment has motion plus sound.
4. **Check.** `node render.mjs <name> check` prints `layout OK` (frame, TikTok/Reels safe zone, cards, overlaps).
5. **Stills.** `node render.mjs <name> stills`, look at every still yourself, plus a few mid-transition frames (`render(t)` at in-between times), fix what looks off, then show the user and **wait for their go-ahead**. Each round of feedback: edit → check → stills → wait again.
6. **Render** only after the user approves: `node render.mjs <name> video` (motion blur 8 subframes; pass `1` as the last argument for a quick draft). Done when ffprobe shows 1080x1920, 30fps, DUR × 30 frames and the audio line in the log matches what you intended (sfx count, music or none).

## Default story (15s, 9:16)

- 0-3s: the customer's problem, big type
- 3-10s: show the product, then each key point one at a time
- 10-15s: product name + "ลิงก์อยู่หน้าโปรไฟล์"

## Motion rules

- The camera pushes in slowly for the whole clip, so every frame moves (about 8% for 15 s, 4% for 60 s, so late titles stay in the safe zone).
- Every element slides in and eases to a soft stop, listed in `ITEMS`.
- Scenes flow into each other through a transition, never a hard cut.
- Text stays inside the safe zone and its card, with clear space between lines. `check` enforces this.

## Voiceover

When the clip is narrated, write the Thai script first (facts from `brand.md` only), with ElevenLabs v3 audio tags in square brackets (`[excited]`, `[whispers]`, `[sighs]`), numbers spelled as Thai words and `...` for pauses; tell the user to pick the Eleven v3 model. The user makes the audio and drops it in `brand/`; copy it to `brand/voice.mp3`.

1. **Find the timing.** Transcribe with the Whisper filter built into ffmpeg, model in `models/` (download `ggml-large-v3-turbo-q5_0.bin` from huggingface.co/ggerganov/whisper.cpp if missing, after asking the user):
   `ffmpeg -i brand/voice.mp3 -af "aresample=16000,whisper=model=models/ggml-large-v3-turbo-q5_0.bin:language=th:queue=20:format=srt:max_len=40:destination=voice.srt" -f null -`
   Use the timestamps, not the words: Whisper misspells Thai. Done when every section start and every on-screen keyword has a time from the transcript.
2. **Sync.** Put section starts in one table (`AT`) and key every entrance to the word it illustrates. Set `window.DUR` to the voice length plus about 1.5 s.
3. **Lip-sync.** `node render.mjs <name> voice` writes `source/voice.js`; load it in the page and call `Mochi.talk(id, t)` with mouth `'talk'` (`styles/cute-doodle/mochi.js`).
4. Mention any word the transcript suggests was mispronounced, so the user can regenerate that line.

`render.mjs` plays `brand/voice.*` once at full level, drops the effects to half and ducks any music under it.

## Sound

Music is `brand/music.*` (mp3/m4a/wav, looped and faded to the clip length); without it the clip carries only the effects, and with no cues at all it renders silent. Built-in effects live in `sfx/` (whoosh tick pop impact ding, regenerate with `node sfx/make-sfx.mjs`); a file in `brand/sfx/<name>.wav` overrides or adds one for that project. Missing names are skipped and listed in the render log.
