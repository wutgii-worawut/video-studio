# Production Readiness — Video Studio

วันที่ 10 ต.ค. 2026 · Implemented in `D:\my_project\video-studio` · HyperFrames reference: `D:\my_project\hyperframes` (commit `684c038483cdf9f6f25ea518b7fd446596fb4fab`)

## Scope

ปรับปรุง Renderer เดิมโดยไม่เปลี่ยน Authoring Contract (`render(t)`, `SCENES`, `ITEMS`), Style Packs, `/make-video`, Resolution 1080×1920 หรือการใช้ Playwright/Chrome พื้นฐาน โปรเจกต์ HyperFrames เป็น Reference **ไม่ได้แก้โค้ด HyperFrames และไม่ได้เปลี่ยน Video Studio ไปใช้ HyperFrames Engine**

## Architecture

1. Validate project name, mode, blur/workers, `window.DUR` และ `window.STILLS`
2. เปิด Chrome Workers และรอโหลด Fonts/Images ให้พร้อม
3. Audio: `lib/audio-pcm.mjs` decode Voice/Music/SFX → Float32 PCM @48 kHz stereo → duck music ตาม voice envelope → fade → peak limit → encode AAC ลงไฟล์ชั่วคราว
4. Video: `lib/render-video.mjs` ใช้ bounded frame queue, failure propagation, cancellation, watchdog 120s, subframe shutter clamp ≥ 0 และ pipe FFmpeg
5. ปิด Chrome ทุกตัวก่อน Mux
6. `ffmpeg -c copy` รวม H.264/AAC โดยไม่ใช้ Audio Filtergraph และไม่ re-encode
7. `ffprobe` ตรวจ Resolution/FPS/Frame Count/Duration/Audio ก่อน publish; `lib/production.mjs` backup/restore เมื่อต้องแทนไฟล์เก่า

## Why not directly import HyperFrames?

- Render Pipeline ของ HyperFrames มี Stage Separation, ArtifactTransaction, Probe และ Seek Completion ที่เป็น Reference แนวทาง แต่ Package Size/Composition Contract ใหญ่กว่าขอบเขตระบบนี้
- Native integration เป็นงาน migration ของ HTML Timeline และ FX ทุก Style; งานนี้จึงรักษา `render(t)` เพื่อไม่เปลี่ยน semantics ของฉาก, Lipsync และ UI preview
- HyperFrames `motionBlur` มีข้อจำกัดกับบาง capture routes; Video Studio ยังคง Blur แบบ 8 Subframes ที่ทดสอบได้จริง

## Commands

```bash
npm test
node render.mjs skillz-promo check
node render.mjs skillz-promo stills
node render.mjs skillz-promo video 1 2
node render.mjs skillz-promo video 8 2
node render.mjs sword-of-coming-s3 audio
node render.mjs sword-of-coming-s3 voice
```

## Test Matrix (executed in current workspace)

| Check | Result |
|---|---|
| Node syntax — render + core modules | PASS |
| `npm test` (21 tests incl. Audio, Browser Studio, Timeline Editor, Recovery, Cloud config) | PASS |
| `skillz-promo check` | PASS: layout OK |
| `skillz-promo stills` | PASS |
| All 8 existing projects `check` | PASS: layout OK |
| `skillz-promo video 1 2` | PASS: 450 frames/15s/30fps/AAC; ~12.8s |
| `skillz-promo video 8 2` | PASS: 450 frames/15s/30fps/AAC; ~86.9s |
| `sword-of-coming-s3 audio` (106s voice+42 SFX) | PASS: AAC produced |
| `mochi-monday-3d video 1 2` | PASS: 450 frames/15s/30fps/AAC; ~8.5s |

## Remaining production limitations (do not overclaim)

- New PCM Audio mix **ไม่ได้ยืนยัน waveform เป็น bit-for-bit ตรงกับการ mix FFmpeg เดิม**; โปรไฟล์ Ducking และ peak limiter ถูก reimplement ให้คล้ายเดิม ต้องฟังเทียบก่อน Delivery งานเสียงวิกฤต
- Audio mix ปัจจุบันจำกัดความยาวที่ 600 วินาทีเพื่อควบคุมการใช้ RAM; คลิปยาวมากควรพัฒนาระบบ audio streaming/chunked mixer
- Multiple concurrent renders of the **same project** now use an exclusive local lock; cloud jobs still need cross-host/distributed coordination
- Forced termination can leave hidden staging files; the next render removes only old (>=1h), inactive-stage files; recovery.mjs provides dry-run/manual cleanup
- `check` is a deterministic layout check with heuristics; QA ภาพ/เสียงโดยคนยังจำเป็น โดยเฉพาะ Motion Blur, ภาษาพูด, ความถูกต้องภาพตัวละครและเสียง
- เพิ่ม CI Matrix ใน .github/workflows/ci.yml, Benchmark และ long 106s smoke แล้ว แต่ GitHub-hosted CI / Docker Image Build ยังไม่ได้รันจริง
- มี local Studio preview, JSON timeline editor (เฉพาะงาน declarative), seek adapter, component registry, batch/cloud worker scaffold; native HyperFrames Engine/Player/AWS/GCP deployment ยังไม่ได้ยืนยัน

## Recovery & rollback

- ถ้า Render ล้ม: อ่าน error, ตรวจว่าไฟล์ MP4 เดิมยังเปิดได้ และระบุ staged temporary files เพื่อ debug
- ไฟล์ชั่วคราวถูกสร้างใน `projects/<name>/output/` ด้วย prefix ชื่อ `.<name>-<pid>-<timestamp>`; หลังหยุด Render ทั้งหมดแล้วลบเฉพาะไฟล์ของงานที่ล้ม
- หากจำเป็นต้องย้อนโค้ด ให้ revert เฉพาะ `render.mjs`, `lib/production.mjs`, `lib/render-video.mjs`, `lib/audio-pcm.mjs`, `lib/fx.js` โดยเก็บ `projects/*/brand`/`source` ไว้
- ห้ามใช้ `git clean -fd` หรือ reset โฟลเดอร์โปรเจกต์โดยไม่ตรวจไฟล์ผู้ใช้ก่อน

## Release Checklist

- [x] เปลี่ยน Audio Graph ที่ค้างเป็น Native PCM Mixer
- [x] Timeout + fail-fast Frame Capture/FFmpeg
- [x] Validate MP4 ก่อน publish
- [x] Protect published output until validation passes
- [x] Layout smoke ทุก 8 โปรเจกต์
- [x] Verify 8× Motion Blur + Narrated Audio Smoke
- [ ] Manual listening: SFX loudness / speech / music ducking
- [ ] CI automated run across supported machines
- [x] Concurrent local render lock and conservative stale artifact cleanup
- [x] Benchmark command and 106s full video smoke on sword-of-coming-s3 (one run, not long-duration soak)

## Reference code

- HyperFrames: `packages/producer/src/services/render/artifactTransaction.ts`
- HyperFrames: `packages/producer/src/services/render/stages/{captureStage,encodeStage,audioStage,assembleStage}.ts`
- HyperFrames: `packages/engine/src/services/{streamingEncoder,motionBlur,audioMixer}.ts`
- HyperFrames: `packages/core/src/runtime/adapters/seek-dispatch.ts`
- Video Studio: `issues/001–006`, `.claude/skills/make-video/SKILL.md`, `render.mjs`, `lib/fx.js`

## Current Implementation Status

See [hyperframes-integration.md](hyperframes-integration.md) for the current completed/verified matrix. CI configuration is checked into the workspace but not run remotely; Docker daemon unavailable; human listening QA remains outstanding.
