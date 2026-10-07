---
name: make-video
description: Make or edit a promo clip for a project in projects/<name> (motion graphic HTML → stills → mp4). Use when the user asks to make, edit, re-time, or render a clip.
argument-hint: <project-name> [extra wishes]
---

Project: `$ARGUMENTS` (first word is the project name; anything after it overrides the defaults below). Reply in the user's language.

1. **Brand.** Read everything in `projects/<name>/brand/`. If `brand.md` is missing, create it from `projects/skillz-promo/brand/brand.md` as a template with the facts blanked, ask the user to fill it in (plus product images in `brand/`), and **wait**. Done when every brand fact you put on screen comes from there.
2. **Write `projects/<name>/source/index.html`.** One file, 1080x1920, every frame a pure function of `render(t)`. Copy the skeleton from a finished project (stage + camera, `SCENES`, `ITEMS` timeline, scrubber, `?t=`, `?render`) and design the look fresh for this brand.
3. **Check.** `node render.mjs <name> check` prints `layout OK`.
4. **Stills.** `node render.mjs <name> stills`, look at all 4 yourself, fix what looks off, then show the user the story and stills and **wait for their go-ahead**. Each round of feedback: edit → check → stills → wait again.
5. **Render** only after the user approves: `node render.mjs <name> video`. Done when ffprobe shows 1080x1920, 30fps, 450 frames.

## Default story (15s, 9:16)

- 0-3s: the customer's problem, big type
- 3-10s: show the product, then each key point one at a time
- 10-15s: product name + "ลิงก์อยู่หน้าโปรไฟล์"

## Motion rules

- The camera pushes in slowly for the whole clip, so every frame moves.
- Every element slides in and eases to a soft stop (ease-out), listed in `ITEMS`.
- Scenes cross-fade into each other.
- Text stays inside the frame and its card, with clear space between lines. `check` enforces this.
