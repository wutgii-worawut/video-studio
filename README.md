# Video Studio — Desktop (React + Electron)

**Current UI:** React + TypeScript + shadcn-style UI/Radix + Zustand + Electron. The existing Playwright/FFmpeg Render Engine is retained.

**Windows installer:** `D:\my_project\video-studio\release-optimized\Video-Studio-1.0.0-x64.exe`

**Unpacked app:** `D:\my_project\video-studio\release-optimized\win-unpacked\Video Studio.exe`

**Start from source:** `npm run electron` (Desktop) or `npm run studio` (React in browser, port 4183). The classic HTML Studio is still available with `npm run studio:legacy`.

After installing, use **Settings → Workspace folder** and point it at `D:\my_project\video-studio` to access your existing projects. The installer contains only a seed project, not your private media or large models.

React UI uses Radix/shadcn dialogs (including Delete Confirmation), responsive Panels, Project File Manager, Source/Monaco editor, live HTML preview + MP4 audio, Scenes/Composition, and PowerShell/Claude/Codex Terminal. Electron auto-authenticates the local PTY and keeps Node out of the renderer.

For architecture, verifications and known limitations see **[Electron Migration](docs/electron-migration.md)** and **[Terminal + Monaco Optimization](docs/terminal-monaco-optimization.md)**. See **[Code Recheck](docs/code-recheck-2026-10-10.md)** for the latest code audit and fixes. For the current clean-up audit see **[Code Cleanup](docs/code-cleanup-2026-10-10.md)**. Important: this is **not yet a fully draggable nonlinear video editor** for arbitrary legacy HTML scenes.

---
# video-studio

คลิป motion graphic ที่เขียนด้วย HTML แล้วเรนเดอร์ด้วย Playwright + ffmpeg (มี motion blur และเสียง)

## โครงสร้าง

```
CLAUDE.md                  กฎพื้นฐานที่ Claude Code อ่านเองทุกครั้ง
render.mjs                 ตัวเรนเดอร์ ใช้ร่วมกันทุกโปรเจกต์
lib/fx.js                  คลังลูกเล่น: ตัวหนังสือทีละคำ ไฮไลต์ ขีดฆ่า spring เปลี่ยนฉาก กล้องสั่น วาดเส้น confetti
sfx/                       เสียงเอฟเฟกต์ในตัว whoosh tick pop impact ding (สร้างใหม่: node sfx/make-sfx.mjs)
issues/                    บันทึกปัญหา สาเหตุ วิธีแก้ (1 ปัญหา = 1 ไฟล์ มี tags)
models/                    โมเดล Whisper สำหรับถอดเสียงพากย์ (ไม่เข้า git)
styles/                    แนวภาพที่ใช้ซ้ำได้ 1 แนว = 1 โฟลเดอร์ (style.md + example.png + โค้ดเฉพาะแนว)
  cute-doodle/             Kawaii Doodle: เส้นสั่น line boil (boil.js) พาสเทล กระดาษลายจุด + มาสคอตโมจิ (mochi.js: ชุดนักดาบ ขยับปากตามเสียง)
  dark-tech/               Dark Tech / Terminal: พื้นมืด แสงฟุ้งนีออน terminal การ์ดคำสั่ง
  manga-action/            มังงะแอ็กชัน: เส้นหมึกหนา cel shading เส้นความเร็ว impact frame ตัวหนังสือเสียง (manga.js)
.claude/skills/
  check-computer/          /check-computer        เช็ก/เตรียมเครื่อง (ครั้งแรก/ย้ายเครื่อง)
  make-video/              /make-video <ชื่อ>     ทำ/แก้คลิป: ขั้นตอน ลำดับเรื่อง กฎการขยับ เสียง
projects/
  <ชื่อโปรเจกต์>/
    brand/brand.md         ข้อมูลสินค้า/เรื่อง ปัญหา จุดเด่น + บรรทัด "สไตล์: <ชื่อแนวใน styles/>"
    brand/voice.mp3        เสียงพากย์จาก ElevenLabs (ไม่ใส่ก็ได้)
    brand/music.mp3        เพลง (ไม่ใส่ก็ได้)
    brand/web/             ภาพที่หามาจากเว็บ + SOURCES.txt (ที่มาทุกภาพ)
    brand/sfx/<ชื่อ>.wav   เสียงเฉพาะโปรเจกต์ ทับของ sfx/ (ไม่ใส่ก็ได้)
    source/index.html      ต้นฉบับ 1080x1920 จังหวะ+เสียงทุกชิ้นอยู่ในตาราง ITEMS
    source/voice.js        ระดับเสียงพากย์ต่อเฟรม (สร้างด้วยคำสั่ง voice) ให้โมจิขยับปาก
    output/                สร้างอัตโนมัติ ลบแล้วสร้างใหม่ได้ (ไม่เข้า git)
      stills/              ภาพนิ่งตรวจงาน (ปกติวินาที 1, 5, 9, 14)
      <ชื่อโปรเจกต์>.mp4
```

ภาพตัวละครหรือคนจริง: ใช้เฉพาะภาพที่ตรวจเทียบกับรูปที่มีชื่อกำกับแล้ว ถ้าไม่มีภาพจะบอก ไม่ใส่ภาพเดา

กฎ: 1 คลิป = 1 โฟลเดอร์ใน `projects/` ตั้งชื่อ `ลูกค้า-หัวข้อ` ตัวพิมพ์เล็ก คั่นด้วย `-` เช่น `skillz-promo`

## ทำคลิปใหม่

1. พิมพ์ `/make-video <ชื่อ>` (ต่อท้ายด้วยสิ่งที่อยากได้ต่างจากปกติได้)
   ถ้ายังไม่มี `brand/brand.md` Claude จะสร้างแบบฟอร์มให้กรอกก่อน
2. ถ้ามีเสียงพากย์: ขอสคริปต์ → ทำเสียงใน ElevenLabs (โมเดล v3) → วางไฟล์ใน `brand/` แล้ว Claude จัดจังหวะภาพตามเสียงให้
3. ดูภาพนิ่ง ปรับจนพอใจ แล้วตอบ "เรนเดอร์ได้เลย"

ตัวอย่างคำสั่ง (ใส่รูปสินค้า/ภาพหน้าร้านไว้ใน `projects/<ชื่อ>/brand/` ก่อน ถ้ามี):

```
/make-video coffee-drip แนว cute-doodle ยาว 30 วิ ห้ามใส่ราคา
/make-video sword-of-coming แนว cute-doodle ให้โมจิเล่าเรื่อง ยาว 1 นาที ขอสคริปต์พากย์ด้วย
/make-video new-app แนว dark-tech
/make-video fight-promo แนว manga-action ยาว 15 วิ
```

ต่อท้ายได้: แนวภาพ (`styles/` หรือบรรยายเอง) · ความยาว · ให้โมจิเล่า/แต่งชุด · ขอสคริปต์พากย์ · ข้อห้าม/สิ่งที่อยากเน้น

## คำสั่ง

```
node render.mjs <ชื่อ> check      ตัวหนังสือล้นจอ / ออกนอก safe zone ของ TikTok-Reels / ล้นการ์ด / ทับกัน
node render.mjs <ชื่อ> stills     ภาพนิ่ง → output/stills/
node render.mjs <ชื่อ> video      → output/<ชื่อ>.mp4 (motion blur 8 ภาพย่อยต่อเฟรม + เสียง)
node render.mjs <ชื่อ> video 1    ร่างเร็ว ไม่มี motion blur
node render.mjs <ชื่อ> voice      brand/voice.mp3 → source/voice.js (ให้โมจิขยับปากตามเสียง)
node render.mjs <ชื่อ> video 8 4  กำหนดจำนวน Chrome ที่ช่วยกันถ่ายเอง (ปกติตั้งให้เองตามคอร์/RAM สูงสุด 8)
```

ความยาวคลิป: ปกติ 15 วินาที · ยาวกว่านั้นตั้งใน index.html ด้วย `window.DUR = 60` และ `window.STILLS = [...]` (เวลาภาพนิ่ง ฉากละภาพ)

ความเร็ว: คลิป 15 วินาที + motion blur ≈ 30 วินาที · 107 วินาที ≈ 4 นาที

เสียง: มี voice.mp3 → เล่นเต็มเสียง SFX ลดครึ่ง เพลงหลบตอนพูด · ไม่มีเพลง → ใช้แค่ SFX · ไม่มีทั้งคู่ → คลิปเงียบ · ชื่อ SFX ที่หาไฟล์ไม่เจอจะถูกข้ามและแจ้งใน log

ดูในเบราว์เซอร์: เปิด `source/index.html` เล่นวนพร้อมแถบเลื่อนเวลา หรือเติม `?t=5` เพื่อค้างที่วินาทีที่ 5

## Production Rendering (อัปเดต 2026-10-10)

คำสั่งเดิมยังใช้งานได้:

```bash
npm test
node render.mjs skillz-promo check
node render.mjs skillz-promo stills
node render.mjs skillz-promo video 1 2    # เรนเดอร์เร็วสำหรับตรวจงาน
node render.mjs skillz-promo video        # final: motion blur 8 subframes
node render.mjs sword-of-coming-s3 audio # ทดสอบ Audio Mix โดยไม่ต้องเรนเดอร์ภาพ
```

ระบบใหม่ใช้ **Native PCM Mixer**: Decode SFX/Voice/Music แยกด้วย FFmpeg, รวมเสียงและ Ducking ใน Node, เข้ารหัส AAC หนึ่งครั้ง แล้ว Mux กับวิดีโอด้วย Stream Copy ป้องกัน FFmpeg กราฟเสียงหลายสิบแทร็กค้าง (issues/003, 005, 006)

การ Render วิดีโอมีขั้นตอนดังนี้:
1. ตรวจชื่อตำแหน่งโปรเจกต์, เวลาและจำนวนเฟรม
2. ตรวจภาพ/ฟอนต์ และสร้างเสียง AAC ก่อน
3. Capture และ Encode ภาพด้วย Chrome หลาย Workers แบบ bounded queue; ถ้า Worker/Encoder ล้มจะหยุดแทนการรอค้าง
4. ปิด Chrome ทุกตัว ก่อนรวม AAC กับ H.264
5. ใช้ ffprobe ตรวจ 1080×1920, 30fps, จำนวนเฟรม, ความยาว, Audio Stream
6. เผยแพร่ไฟล์ด้วย Staging + Backup/Restore เพื่อไม่เขียนทับไฟล์เดิมเมื่อ Render ไม่ผ่าน

**ไฟล์ MP4 เดิมไม่ถูกแทนที่จนกว่าจะตรวจสอบผ่าน**; หาก Process ถูก Kill แบบบังคับ อาจมีไฟล์ชั่วคราวชื่อ `.<project>-<pid>-<timestamp>.*` หลงเหลือใน `output/` ได้ ให้ตรวจว่าไม่มี Render อื่นกำลังทำงานก่อนลบไฟล์ดังกล่าว

**ข้อจำกัด:** PCM Mixer รองรับคลิปที่มีเสียงยาวไม่เกิน 600 วินาที; ยังไม่มี Project Lock สำหรับป้องกันการ Render โปรเจกต์เดียวกันพร้อมกัน

อ่านรายละเอียด สถานะการทดสอบ และข้อจำกัดก่อนใช้งานจริงที่ [docs/production-readiness.md](docs/production-readiness.md)

## HyperFrames-inspired extensions (2026-10-10)

คำว่า HyperFrames Integration ในโครงการนี้หมายถึง **เลือกนำแนวคิดและส่วนที่เข้ากันได้มาเพิ่ม** ไม่ใช่ Fork/ย้าย HyperFrames ทั้งก้อน และโปรเจกต์เก่าทั้ง 8 โปรเจกต์ไม่ถูกแปลงหรือ Rewrite

```powershell
npm test
npm run studio                  # Local Studio: http://127.0.0.1:4177
node batch.mjs examples/batch-smoke.json --concurrency=2
node recovery.mjs skillz-promo          # Dry run by default
node benchmark.mjs composition-demo 1 2
node audio-audit.mjs sword-of-coming-s3
node compose-sync.mjs composition-demo
```

- Studio Preview ของงานเดิม: Seek/Play/Pause, แสดง Timeline จาก DOM, ดู Components
- `composition-demo`: ใช้ JSON Timeline Editor เพื่อแก้เวลาและข้อความ (Save → Sync sidecar → Re-render)
- Per-project Lock, Auto Orphan Cleanup, Batch Runner, Benchmark, Audio A/B level report
- Container Cloud Job runner และ GitHub Actions CI configuration (ต้อง Deploy/Run จริงใน environment เป้าหมาย)

อ่าน [docs/hyperframes-integration.md](docs/hyperframes-integration.md) สำหรับตารางความคืบหน้าและข้อจำกัด และ [docs/cloud-worker.md](docs/cloud-worker.md) สำหรับ Cloud

### Studio: Play พร้อมเสียง (10 ต.ค. 2026)

- กด `npm run studio` เปิด `http://127.0.0.1:4177` แล้วเลือกโปรเจกต์ที่มี MP4 เรนเดอร์แล้ว เช่น `sword-of-coming-s2`
- ปุ่ม **Play** จะใช้แทร็กเสียงจาก `projects/<project>/output/<project>.mp4` และซิงก์ภาพ HTML `render(t)` ให้เดินตามเวลาเสียง (audio master clock)
- ใช้ปุ่ม Pause, Timeline Seek, Mute และ Volume ที่แถบควบคุมได้ทันที; เบราว์เซอร์ต้องอนุญาตให้เล่นเสียง และกด Play ด้วยตัวเองครั้งแรก
- ถ้ายังไม่มี MP4 หน้าจอจะแจ้ง **silent preview** โดยภาพยังเล่นได้; ให้ `node render.mjs <project> video` เพื่อสร้างไฟล์เสียง/ภาพรวมกันก่อน
- **สำคัญ:** ภาพใน Preview อ่าน HTML ล่าสุด แต่เสียงมาจาก **MP4 ที่เรนเดอร์ครั้งล่าสุด** ถ้าเปลี่ยนเสียงพากย์ SFX หรือจังหวะฉาก ต้องเรนเดอร์ใหม่และกด Reload หน้า Studio เพื่อให้เสียงตรง
- Server รองรับ `HTTP Range` สำหรับอ่าน MP4 เฉพาะส่วน จึง Seek ไปกลางคลิปได้โดยไม่โหลดไฟล์ใหญ่ทั้งหมด
- หลังอัปเดตโค้ด Studio Server (`studio.mjs`) ต้องหยุดแล้วสั่ง `npm run studio` ใหม่เพื่อใช้ Range Streaming เวอร์ชันใหม่

## Studio Project Workbench

ใหม่ใน Studio: **Project Workspace** — หน้าจอไม่ได้มีไว้เพียง Preview อีกต่อไป แต่รวมไฟล์และงาน Render ของโปรเจกต์ไว้ในหน้าเดียว

- **Explorer ด้านซ้าย:** Source, Assets, Brand, Docs, FX, Models, Output; คลิกไฟล์เพื่อดูเนื้อหา ไม่แก้ไฟล์ Source/Brand อัตโนมัติ
- **Inspector ด้านขวา:** ดูภาพ, ฟังเสียง Brand/Voice/SFX, เปิด MP4, อ่าน `.md` / `.html` / `.js` / `.srt`, เลือก Scenes เพื่อ Seek, และแก้ Composition แบบ JSON ของโปรเจกต์ที่รองรับ
- **Project Console ด้านล่าง:** มีการสั่งงานจริงแบบไม่ต้องสลับ Terminal, พร้อม Log สดและ Stop งาน (ใช้ `taskkill /T /F` เมื่อหยุดบน Windows)
- **ความปลอดภัย:** Studio เปิดที่ `127.0.0.1` เท่านั้น, API จำกัดไฟล์ตามหมวด, ไม่เปิดอ่านไฟล์โมเดลขนาดใหญ่ และ Console ใช้ Allowlist คำสั่ง ไม่ใช่ PowerShell แบบไม่จำกัดสิทธิ์
- **Preview พร้อมเสียง:** เสียงมาจาก MP4 ล่าสุด ส่วนภาพมาจาก HTML Source ปัจจุบัน จึงต้อง Render ใหม่เมื่อแก้เนื้อหา/เสียง/จังหวะแล้ว

คำสั่งที่ Console รองรับ:

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

เปิดด้วย `npm run studio` แล้วเลือกโปรเจกต์; ไม่ต้องเปิด Terminal อื่นเพื่อใช้คำสั่งเหล่านี้ เพิ่มเติมที่ [docs/studio-workspace.md](docs/studio-workspace.md)

### Studio media upload, expanded previews and full PowerShell

Recent enhancements: Project Explorer now supports image/audio/video uploads to `source/img`, `brand`, or `brand/sfx` without overwriting existing media, plus in-place rename. The Inspector can Expand into the main workspace, and Live Preview has its own Expand/Restore control.

To start the **real interactive PowerShell PTY** alongside Render Tasks, double-click `start-studio-terminal.cmd` or run:

```powershell
npm run studio
```

Open `http://127.0.0.1:4183`, choose the PowerShell tab, and enter the terminal access code printed at startup. This terminal has full Windows user permissions and can launch installed `claude` and `codex` commands. Standard `npm run studio` now launches the terminal-enabled Studio on port 4183 (the user must unlock it with a startup access code). Use `npm run studio:safe` for task-only mode on port 4177. See [docs/studio-workspace.md](docs/studio-workspace.md) for workflow, limitations, and security.

### File Manager: full document/media lifecycle

Added project Documents (`projects/<name>/docs`) and Brand notes import. Select an eligible file to **Rename**, **Duplicate**, or **Move to Trash**. Open the **Trash** tab to restore the original file. Files from shared tools, model binaries, source scripts and protected `brand.md` cannot be changed through Explorer. Duplicate/restore never overwrite existing files. See [Studio Workspace](docs/studio-workspace.md).
