# HyperFrames Integration — Implementation Report

วันที่: 10 ต.ค. 2026 | Video Studio: `D:\my_project\video-studio` | Reference: `D:\my_project\hyperframes` @ `684c038483cdf9f6f25ea518b7fd446596fb4fab`

## ความหมายของ Integration

**นำข้อดีของ HyperFrames มาปรับใช้** ไม่ใช่เปลี่ยน Renderer ทั้งหมด และไม่ได้คัดลอกหรือแก้ Repository ต้นทาง ระบบเดิม `window.render(t)`, FX, Thai text/voice, Styles และ `/make-video` ยังทำงานเหมือนเดิม

## Implemented / Tested Matrix

| Capability | Implemented | Verification / Caveat |
|---|---|---|
| Frame capture fail-fast, timeout, ffprobe, atomic publish | Yes | Unit/Integration + 2D/3D/106s full render pass |
| Project concurrency lock | Yes | Lock prevents multiple renders of the same project; stale dead-PID locks expire after 30s |
| Orphaned staging cleanup | Yes | Automatic at render start for old, dead-PID stages; manual dry-run via recovery.mjs |
| Batch Rendering | Yes | `batch.mjs` JSON manifest + concurrency + report, tested live with 3 checks |
| Studio Preview | Yes | Local-only HTTP web page supports all existing HTML projects and scrubbing |
| HyperFrames-style Seek protocol | Yes, adapter | `window.__hf={duration,seek}` works in Playwright; **native HyperFrames Engine integration not verified** |
| Declarative Composition model | Yes | `lib/composition.mjs` validation and browser compositor; `composition-demo` runs from JSON/sidecar |
| JSON Timeline Editor | Yes, limited | Studio saves clip timing/text on JSON compositions, refuses writes when a render lock is active; **legacy hardcoded `render(t)` remains read-only** |
| Reusable Component Registry | Yes, initial | 4 actual DOM factories + 3 integrations to existing effects/mascot |
| Audio A/B audit | Yes, metrics | Original S3: mean -24.2 dB, peak -2.9 dB; new: mean -25.1 dB, peak -3.8 dB (delta -0.9 dB each). Not a listening check |
| Benchmark tooling | Yes | `benchmark.mjs composition-demo 1 2`: 180 frames in 5.79s (31.11 frames/s wall time, 6s video) |
| Cross-platform CI | Configuration written | `.github/workflows/ci.yml` builds/tests Windows/macOS/Linux; **not executed on GitHub Actions until pushed** |
| Docker/Cloud job | Source/config complete | Dockerfile + `cloud/job.mjs` signed URL upload; local Cloud Worker test passed; **not built (Docker Engine unavailable), not deployed** |
| Native HyperFrames Studio/Player/AWS Lambda replacement | No | Not appropriate as unconditional replacement for existing authoring system |

## Access / Commands

```powershell
cd D:\my_project\video-studio
npm test
npm run studio              # http://127.0.0.1:4177
node render.mjs skillz-promo check
node render.mjs skillz-promo video 1 2
node render.mjs skillz-promo video 8 2
node benchmark.mjs composition-demo 1 2
node audio-audit.mjs sword-of-coming-s3
node recovery.mjs skillz-promo          # dry run
node recovery.mjs skillz-promo --clean  # old orphan stages only
node batch.mjs examples/batch-smoke.json --concurrency=2
node compose-sync.mjs composition-demo
```

## How the Composition demo works

`projects/composition-demo/source/composition.json` คือข้อมูลหลัก มีคลิป 3 ช่วง, เวลาเริ่ม/ระยะเวลา, component และข้อความ หน้า Studio เปิด Editor ได้เฉพาะโปรเจกต์นี้ และเขียน `composition.json` + `composition-data.js` โดยใช้ ETag เพื่อลด lost updates; `composition-data.js` จำเป็นเพราะ Renderer เดิมใช้ `file://` ซึ่ง Fetch JSON ไม่ได้จาก Chrome การแก้ HTML อย่าง `render(t)` ของโปรเจกต์เก่าไม่ได้ถูกย้ายไปเป็น Declarative โดยอัตโนมัติ

## Acceptance Evidence

- `npm test`: 21/21 Automated Tests ผ่าน (workflow, audio, browser, studio, composition, cloud env)
- Layout: 9/9 โปรเจกต์ (8 ของเดิม + composition-demo) ผ่านผ่าน batch concurrency=3
- `skillz-promo video 8 2`: MP4 450f/15s/30fps + AAC/Blur8 — pass
- `mochi-monday-3d video 1 2`: MP4 450f/15s/30fps + AAC — pass
- `sword-of-coming-s3 video 1 2`: MP4 3180f/106s/30fps + AAC — pass
- `composition-demo` local Cloud Runner + final 6s video render: pass; Signed HTTPS upload **not exercised**

## Not yet externally verified

1. ไม่มี Docker Daemon เปิดอยู่บนเครื่อง จึงยังไม่ Build/Run Image ที่สร้างไว้
2. ไม่มีการเชื่อมต่อกับบัญชี AWS/GCP และ Signed Upload URL จริง จึงยังไม่ได้ Deploy Cloud Job
3. ยังไม่ได้รัน CI บน GitHub เพราะไม่ได้ Commit/Push
4. ยังไม่ได้ทำการฟังเสียง A/B โดยมนุษย์หรือทดสอบเสียงกับทุกโปรเจกต์
5. Native HyperFrames Studio/Player และ timeline operations ของ HyperFrames ไม่ได้ถูกนำเข้าโดยตรง; เลือก adapter/model เฉพาะที่เข้ากันได้แทน

## Files

- `lib/recovery.mjs`, `recovery.mjs`: Lock, orphan detection and cleanup
- `lib/batch.mjs`, `batch.mjs`, `examples/batch-smoke.json`: Batch
- `lib/hf-adapter.js`: Bridge to `window.__hf`
- `lib/composition.mjs`, `lib/compose-browser.js`, `compose-sync.mjs`: Composition contract
- `components/registry.json`, `components/render.js`: Reusable elements
- `studio.mjs`, `studio/index.html`: Local preview and JSON composition editor
- `cloud/job.mjs`, `Dockerfile`, `.dockerignore`, `.github/workflows/ci.yml`: Remote deploy/CI
- `benchmark.mjs`, `lib/audio-audit.mjs`, `audio-audit.mjs`: Performance and audio level audit

## Next manual acceptance

ตรวจเปิด MP4 ใหม่บนอุปกรณ์ปลายทาง, ฟัง A/B เทียบเสียงบรรยายและ SFX, รัน GitHub Actions CI หลัง Commit/Push, เปิด Docker Engine แล้วทดลอง Build/Run Worker, ทดสอบ Signed HTTPS Upload/Cloud Job ในบัญชีเป้าหมาย สิ่งเหล่านี้ต้องผ่านก่อนใช้คำว่า **Fully production accepted across cloud providers**
