---
name: check-computer
description: เช็กและเตรียมเครื่องให้พร้อมทำคลิป (Node, ffmpeg, Chrome, Playwright) แล้วทดสอบจริง
disable-model-invocation: true
---

Check this machine can render clips, install what's missing with the user's consent, and prove it works end to end. Reply in the user's language.

1. **Inspect.** Detect the OS, then check:
   - Node.js 18 or newer
   - ffmpeg on PATH
   - Google Chrome installed
   - Playwright in this repo's `node_modules` (local, never global)

   Report a table: item · ready / not ready · version or what's missing. Done when all 4 rows have a status.

2. **Propose installs.** For each missing item, list the exact command: Windows `winget`, Mac `brew`, Linux `apt`. Playwright: `npm install` (restores it from `package.json`). Linux without Chrome: `npx playwright install --with-deps chromium` and drop `channel: 'chrome'` in `render.mjs`. Then **stop and wait** until the user answers "ได้"/yes. Skip this step when nothing is missing.

3. **Install** exactly what was approved. Re-check each item; done when the table shows every row ready. Open a new shell or refresh PATH before re-checking ffmpeg.

4. **Smoke test**, in the scratchpad (outside the repo):
   - Playwright opens Chrome and screenshots a blank page → a PNG file exists
   - ffmpeg makes a 1s black 1080x1920 video → ffprobe reports duration 1.0

   Delete both test files. Done when both pass and nothing is left behind; then tell the user "พร้อมทำคลิปแล้ว". If either fails, show the error and the fix you propose.
