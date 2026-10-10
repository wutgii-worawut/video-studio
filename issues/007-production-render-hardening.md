# 007 · Harden Render Pipeline และตรวจ MP4 ก่อนเผยแพร่

- วันที่: 2026-10-10
- tags: render, chrome, ffmpeg, layout, production
- project: all
- ref: 002, 004, 005, 006

## ปัญหา
Renderer เดิมเปิด Chrome ไว้ตอน Mux, เขียน Output ลงชื่อจริงก่อนตรวจ, ไม่มี Timeout ของ FFmpeg, ไม่มีการ propagate capture failure ไปยัง writer, ไม่มี automated tests และ request `render(t)` ที่เวลาติดลบในเฟรมแรกได้

## สาเหตุ
โค้ด render อยู่ใน script เดียวและยังไม่มี separations / validation stages

## วิธีแก้ที่ได้ผล
- `lib/production.mjs`: validate inputs/timeline, ffprobe output, atomic publication with rollback, process timeout
- `lib/render-video.mjs`: bounded capture queue, error propagation, FFmpeg close/drain/abort handling, watchdog
- `render.mjs`: Render to unique staging artifacts, close Chrome before mux, validate then publish
- `lib/fx.js`: hide not-yet-entered scenes fully; fix wipe/circle hairline for all projects
- `tests/*.test.mjs` + `npm test`: 9 tests
- All 8 project layouts: `layout OK`
- Smoke: skillz-promo blur1/blur8, mochi-monday-3d blur1, sword-of-coming-s3 audio

## ยังไม่ได้แก้
- Cross-process lock สำหรับ render โปรเจกต์เดียวกัน
- Forced-kill cleanup, CI Matrix, Audio A/B listening
