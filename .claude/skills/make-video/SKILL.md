---
name: make-video
description: Make or edit a promo clip for a project in projects/<name> (motion graphic HTML → stills → mp4 with sound). Use when the user asks to make, edit, re-time, or render a clip.
argument-hint: <project-name> [extra wishes]
---

Project: `$ARGUMENTS` (first word is the project name; anything after it overrides the defaults below). Reply in the user's language.

1. **Brand.** Read everything in `projects/<name>/brand/`. If `brand.md` is missing, create it from `projects/skillz-promo/brand/brand.md` as a template with the facts blanked, ask the user to fill it in (plus product images, optional `music.mp3`, optional `sfx/`), and **wait**. Done when every brand fact you put on screen comes from there.
2. **Write `projects/<name>/source/index.html`.** One file, 1080x1920, every frame a pure function of `render(t)`. Start from a finished project's skeleton (stage + camera, `SCENES`, `ITEMS`, scrubber, `?t=`, `?render`) and design the look fresh for this brand.
3. **Effects.** Read the catalogue at the top of `lib/fx.js` and pick what suits the brand's style: per-word text, highlight/strike, spring/back easing, scene transitions (zoom, whip, circle, wipe), camera shakes on impacts, SVG draw-on, confetti. Give every entrance and impact a sound (`sfx` in `ITEMS`, extra cues in `FX.cues`). Done when no two scenes use the same transition and every big moment has motion plus sound.
4. **Check.** `node render.mjs <name> check` prints `layout OK` (frame, TikTok/Reels safe zone, cards, overlaps).
5. **Stills.** `node render.mjs <name> stills`, look at all 4 yourself, plus a few mid-transition frames (`render(t)` at in-between times), fix what looks off, then show the user and **wait for their go-ahead**. Each round of feedback: edit → check → stills → wait again.
6. **Render** only after the user approves: `node render.mjs <name> video` (motion blur 8 subframes; pass `1` as the last argument for a quick draft). Done when ffprobe shows 1080x1920, 30fps, 450 frames and the audio line in the log matches what you intended (sfx count, music or none).

## Default story (15s, 9:16)

- 0-3s: the customer's problem, big type
- 3-10s: show the product, then each key point one at a time
- 10-15s: product name + "ลิงก์อยู่หน้าโปรไฟล์"

## Motion rules

- The camera pushes in slowly for the whole clip, so every frame moves.
- Every element slides in and eases to a soft stop, listed in `ITEMS`.
- Scenes flow into each other through a transition, never a hard cut.
- Text stays inside the safe zone and its card, with clear space between lines. `check` enforces this.

## Sound

Music is `brand/music.*` (mp3/m4a/wav, looped and faded to 15s); without it the clip carries only the effects, and with no cues at all it renders silent. Built-in effects live in `sfx/` (whoosh tick pop impact ding, regenerate with `node sfx/make-sfx.mjs`); a file in `brand/sfx/<name>.wav` overrides or adds one for that project. Missing names are skipped and listed in the render log.
