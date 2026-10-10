# Video Studio — UI Redesign Spec (terminal-first)

> สเปกนี้เขียนให้ AI/dev ใช้ลงโค้ดจริงใน repo `video-studio` (React + TypeScript + Zustand + Radix/shadcn + Electron ใน `app/src`, server `studio.mjs`, render `render.mjs`)
> แบบหน้าจอ (กดลองได้): https://claude.ai/artifact/54yb4xa1c88hkp4aRmyXY6
> ไฟล์แบบ: **`Video_Studio_UI.html`** (export จากแคนวาส: แชร์ › การส่งออก › HTML) — เปิดในเบราว์เซอร์ได้ มีทุกหน้าอยู่ในไฟล์เดียว แต่ละหน้าเป็น 1 บอร์ด เรียกตามชื่อบอร์ดด้านล่าง ใช้ดูหน้าตา/กดลอง ไม่ใช่โค้ดที่เอาไปใช้ตรง ๆ
>
> | หน้าในสเปกนี้ | ชื่อบอร์ดใน `Video_Studio_UI.html` |
> |---|---|
> | Director (ข้อ 4) | `1 · Director — Claude Code terminal first, preview beside it` |
> | Code (ข้อ 5) | `2 · Code — tabbed Monaco + live side preview` |
> | Library (ข้อ 6) | `3 · Library — media grid, import, trash` |
> | Render (ข้อ 7) | `4 · Render — tasks, live log, outputs, terminal drawer` |
> | Projects (ข้อ 7.5) | `5 · Projects — hub, new project, trash, workspace` |
> | Terminal (ข้อ 2.3) | `Shared · Terminal panel — same on every page (hide, drag to resize)` |
> ข้อมูลในแบบ (ชื่อฉาก, เวลา, log, ชื่อไฟล์) เป็นตัวอย่างจากโปรเจกต์ `sword-of-coming-s2` — ของจริงต้องดึงจาก API

---

## 0. กฎที่ต้องทำตาม

1. **ห้ามทำ feature เดิมหาย** ทุกอย่างที่มีใน `app/src` ตอนนี้ต้องยังใช้ได้ (รายการอยู่ข้อ 9 "Checklist feature เดิม")
2. ใช้ของที่มีอยู่ก่อนเสมอ: `useStudio` (`lib/state.ts`), `studioApi` (`lib/api.ts`), components ใน `components/ui.tsx`, `react-resizable-panels`, xterm, Monaco
3. **ห้ามติดตั้ง package ใหม่** ถ้าไม่ได้ถามผู้ใช้ก่อน (กฎใน CLAUDE.md)
4. ไฟล์ที่โปรแกรมสร้างขึ้นต้องอยู่ใน `projects/<ชื่อ>/output/` เท่านั้น
5. Server ฟังเฉพาะ `127.0.0.1` เหมือนเดิม; POST ทุกตัวต้องผ่าน same-origin check เดิม
6. รัน `npm test` ให้ผ่านทุกขั้น และเพิ่ม test ให้ API ใหม่
7. เจอปัญหาให้บันทึกใน `issues/NNN-*.md` ตามกฎใน CLAUDE.md

---

## 1. แนวคิดหลัก

ผู้ใช้ทำคลิปโดย **พิมพ์สั่ง Claude Code ใน terminal เป็นหลัก** แล้วดูผลบนพรีวิว หน้าอื่นเป็นตัวช่วยตรวจหรือแก้เอง

โครงทั้งแอป (ทุกหน้า):

```
┌───────────────────────── Top bar ─────────────────────────┐
│ [Project ▾ Ctrl K] [mode toggle*]   …   [Terminal] [Draft render|▾] │
├────┬──────────────────────────────────────────────────────┤
│Rail│                  เนื้อหาของหน้า                        │
│    │                                                      │
│    ├──────────────────────────────────────────────────────┤
│    │ ═══ Terminal (แผงล่าง ตัวเดียวทั้งแอป) ═══            │
└────┴──────────────────────────────────────────────────────┘
* mode toggle มีเฉพาะหน้า Director
```

---

## 2. โครงร่วมทุกหน้า

### 2.1 Rail (แถบซ้าย กว้าง 72px)
- ปุ่มบน→ล่าง: **Director** (`>_`) · **Code** (`{ }`) · **Library** · **Render**; ชิดล่าง: **Projects** (ไอคอน grid 4 ช่อง)
- แต่ละปุ่ม: ไอคอนบน + label ตัวเล็ก 10px ใต้ไอคอน; หน้าที่เปิดอยู่ = พื้น `#24272D` + กล่องไอคอนสี `#F0A23A` ตัวไอคอน `#1A1206`; `aria-current="page"`
- เปลี่ยนหน้าด้วย state ใน store (เพิ่ม `page: 'director'|'code'|'library'|'render'|'projects'` ใน `useStudio`) ไม่ต้องใช้ router ถ้าไม่จำเป็น
- **สลับหน้าต้องไม่ unmount terminal และไม่ reset preview time**

### 2.2 Top bar (สูง ~56px, `position: relative` สำหรับ dropdown)
เรียงจากซ้าย:
1. **ปุ่มโปรเจกต์**: กล่องตัวอักษรย่อ 2 ตัว (พื้น `#F0A23A`) + ชื่อโปรเจกต์ (ตัวหนา) + บรรทัดสถานะ (`01:02 · MP4 ready` หรือ `ยังไม่ render`) + ป้าย `Ctrl K`
   - กด หรือ `Ctrl+K` → ไปหน้า Projects (หรือเปิด command palette ค้นหาโปรเจกต์ก็ได้ ถ้าทำ)
2. **Mode toggle** (เฉพาะ Director): segmented 2 ปุ่ม `Terminal-first` | `Preview-first` (`role="radiogroup"`)
3. spacer
4. (เฉพาะบางหน้า) ป้ายสถานะ เช่น `1 unsaved file` (Code), `Rendering draft · 59%` (เมื่อมีงาน render ทำงานอยู่ — แสดงได้ทุกหน้า)
5. **ปุ่ม Terminal**: toggle ซ่อน/แสดงแผง terminal (`aria-pressed`) — ใน Director โหมด Terminal-first ปุ่มนี้ disabled + title "Always shown in Terminal-first layout"
6. **Split button Render**: ซ้าย `▶ Draft render` (สีหลัก, รัน `render 1 2` ทันที หรือพาไปหน้า Render พร้อมเริ่มงาน) + ขวา `▾` เปิด dropdown
   - Dropdown (กว้าง 320px, ชิดขวา, ใต้ top bar) มี 6 แถว แต่ละแถว: ชื่อ (ตัวหนา) + คำอธิบาย (เล็ก, สีรอง) + คำสั่ง (mono, ชิดขวา)
     | ชื่อ | คำอธิบาย | คำสั่ง |
     |---|---|---|
     | Draft render | Fast, no motion blur — hear sound in sync | `render 1 2` |
     | Final render | Motion blur, 8 subframes | `render 8 2` |
     | Check layout | Overflow, overlap, safe zone | `check` |
     | Stills | One frame per scene | `stills` |
     | Probe | Verify the MP4 with ffprobe | `probe` |
     | Tests | Run the test suite | `test` |
   - กดแถว → เริ่มงานผ่าน `POST /api/studio/task` (ของเดิม) แล้วพาไปหน้า Render; ถ้ามีงานรันอยู่ → disable ทุกแถว + บอกเหตุผล
   - ใช้ `DropdownMenu` จาก `components/ui.tsx`

### 2.3 Terminal (แผงล่าง ตัวเดียวทั้งแอป) — บอร์ด: `Shared · Terminal panel`
**โครงสร้าง (บน→ล่าง):**
1. **ที่จับลากขยาย** สูง 8px (`role="separator"`, `cursor: row-resize`, เส้นกลาง 44×3px) — ใช้ `Separator` ของ `react-resizable-panels`; จำความสูงใน localStorage
2. **แถบหัว** (สูง 38px, พื้น `#0F1218`):
   - แท็บ session: `claude` (จุดส้ม `#D98E5C`) · `codex` (จุดเขียว `#8FD6AE`) · `PowerShell` (จุดเทา) — แท็บที่เลือก: พื้น `#090B10` + เส้นบน 2px สี `#F0A23A`
   - ปุ่ม `+` เปิด session ใหม่
   - spacer
   - สถานะ: `● connected` (เขียว) / `● locked` (เหลือง `#F6C978`)
   - `Copy` `Paste` (แสดงเมื่อปลดล็อกแล้ว) — ใช้ logic เดิมใน `Console.tsx` (`copyText`, `pasteText`, Electron clipboard)
   - ปุ่ม `Hide ▾` / `Show terminal ▴` + ป้าย `Ctrl `` ` (แสดงเฉพาะแบบแผงล่าง)
3. **หน้าจอ terminal** (xterm, พื้น `#090B10`, ตัวอักษร `#D5E4F8`, mono 12.5px)
4. **แถบ Insert** (ดูข้อ 3) ติดล่างสุด

**สถานะ:**
- **ซ่อน**: เหลือเฉพาะแถบหัว (ปุ่ม `Show terminal ▴`) — ไม่ปิด WebSocket/PTY
- **ล็อก** (ยังไม่ได้ใส่ access code): แทนหน้าจอด้วยกล่องกลาง (กว้างสุด 420px):
  - หัวเล็ก `LOCAL TERMINAL SECURITY` (สีหลัก) · หัวข้อ `Unlock PowerShell`
  - ข้อความ: "The terminal runs Claude Code, Codex and any command with your Windows account. Enter the access code printed by the Studio launcher. The desktop app unlocks this automatically."
  - ช่อง password "Access code" · ปุ่ม `Unlock terminal` (สีหลัก เต็มกว้าง) · "Never share this code."
  - ใช้ API เดิม `/api/terminal/status`, `/api/terminal/login`; Electron ปลดล็อกเองตามเดิม
- **ปิดใช้ (safe mode)**: ข้อความเดิม "Terminal is disabled — launch with npm run studio"

**พฤติกรรม:**
- **ต้องเป็น terminal ตัวเดียวทั้งแอป**: ย้าย `<StudioConsole>` ออกจาก `Panel` ใน `App.tsx` มาอยู่ระดับ app ใต้เนื้อหาทุกหน้า และไม่ unmount เมื่อเปลี่ยนหน้า (session/scrollback ไม่หาย)
- หลาย session = หลาย PTY ฝั่ง server (ตอนนี้มีตัวเดียวใน `lib/studio-terminal.mjs`) — เพิ่ม `sessionId` ใน WebSocket URL; แท็บ `claude`/`codex` = PTY ที่รันคำสั่งนั้นเมื่อเปิดครั้งแรก, `PowerShell` = shell เปล่า
- แท็บ **Render Tasks** เดิมย้ายไปอยู่หน้า Render (ข้อ 7) — terminal แผงล่างมีแค่ PTY
- `Ctrl+`` ` สลับซ่อน/แสดง (มีอยู่แล้ว เก็บ `vs-terminal-visible`)

---

## 3. แถบ Insert (ใต้ terminal)

**หน้าที่:** กดแล้ว**เติมข้อความต่อท้ายบรรทัดที่กำลังพิมพ์ใน terminal ที่เลือกอยู่ โดยไม่กด Enter**

- ส่งผ่าน WebSocket เดิม: `{ type: 'input', data: '<ข้อความ> ' }` (เหมือนปุ่ม Paste) — **ห้ามมี `\r` หรือ `\n`**; ยาวไม่เกิน 16000 ตัวอักษร (`studio-terminal.mjs` จำกัดไว้)
- ถ้า terminal ซ่อนอยู่ → แสดงก่อนแล้วค่อยเติม; ถ้าล็อก/ไม่ต่อ → toast บอกเหตุผล
- หน้าตา: label `Insert:` · ปุ่ม chip กลม (พื้น `#161B25`, ขอบ `#263044`, มี `+` สีส้มนำหน้า) · เส้นคั่น · ปุ่ม Quick prompt (ขอบอย่างเดียว) · ชิดขวา `Clear line` (ส่ง `Ctrl+U` = `\u0015` เพื่อล้างบรรทัด)

**Chip ตามหน้า (ข้อความที่เติม):**
| หน้า | Label | ข้อความที่เติม |
|---|---|---|
| Director | `ภาพเฟรม 00:08.90` | ดูข้อ 8A (ถ่ายภาพแล้วเติม `@<path>`) |
| Director | `เวลา 00:08.90` | `ที่ 00:08.90` (เวลา playhead ปัจจุบัน) |
| Director | `ฉาก 2 การกลับมา` | `(ฉาก 2 การกลับมา)` (ฉากที่ playhead อยู่) |
| Director | `@source/index.html` | `@projects/<ชื่อ>/source/index.html` |
| Director | `@brand/brand.md` | `@projects/<ชื่อ>/brand/brand.md` |
| Code | `@<path ไฟล์ที่เปิด>` | `@projects/<ชื่อ>/<path>` |
| Code | `line N` | `(บรรทัด N ของ <ไฟล์>)` — N = บรรทัดที่ cursor อยู่ใน Monaco |
| Library | `@<ไฟล์ที่เลือก>` | `@projects/<ชื่อ>/<path>` |
| Render | `last task output` | สรุปบรรทัดท้ายของ log งานล่าสุด |
| Render | `@output/` | `@projects/<ชื่อ>/output/` |
| Projects | `@projects/` | `@projects/` |

**Quick prompts (ข้อความสำเร็จรูป):**
- Director: `/make-video` → `/make-video <ชื่อ>`; `check layout` → `สั่ง check แล้วแก้สิ่งที่ล้นจอ`; `draft render` → `เรนเดอร์ร่าง video 1 2`
- Code: `explain this file` → `อธิบายไฟล์นี้สั้น ๆ`
- Library: `use in a scene` → `ใช้ไฟล์นี้ในฉากที่เหมาะสม`
- Render: `fix check errors` → `แก้ทุกข้อที่ check แจ้ง`; `final render` → `เรนเดอร์จริง video 8 2`
- Projects: `/make-video new` → `/make-video `

(เก็บรายการ quick prompt เป็น array ค่าคงที่ไฟล์เดียว จะได้แก้ง่าย)

---

## 4. หน้า Director (หน้าหลัก) — บอร์ด: `1 · Director`

สลับ 2 โหมดที่ top bar; จำโหมดใน localStorage (`vs-director-mode`)

### 4.1 โหมด Terminal-first (ค่าเริ่มต้น)
- **ซ้าย**: terminal **สูงเต็มพื้นที่** ตั้งแต่ใต้ top bar ถึงขอบล่าง (ไม่ใช่แผงล่าง) กว้างที่เหลือทั้งหมด (~70%)
  - ไม่มีปุ่ม Hide และไม่มีที่จับลากขยาย (terminal แสดงตลอด)
  - ใช้ terminal instance เดียวกับแผงล่าง (ย้าย DOM/portal ไม่สร้างใหม่)
- **ขวา** (กว้างคงที่ 400px) บน→ล่าง:
  1. ป้ายสถานะพรีวิว: `● Reloaded · index.html changed 4 s ago` (เขียว) — ดูข้อ 8C; ตอนโหลด: `Loading…`; error: ข้อความแดง
  2. แถวเดียวกัน: **เฟรม 9:16** (190×338) ซ้าย + **รายการฉาก** ขวา (หัว "Scenes"; แต่ละแถว: เลข 2 หลัก · ชื่อ · เวลาเริ่ม mm:ss; แถวที่ playhead อยู่ = พื้น `#1F2A3D` ขอบ `#4A6FA8`; กด → seek ไปต้นฉาก)
  3. Transport: `‹` (ถอย 1 เฟรม) · ปุ่ม Play/Pause วงกลมขาว 42px · `›` (เดิน 1 เฟรม) · เวลา `00:08.90 / 01:02.00` (mono)
  4. Mini timeline: แถบฉาก (สูง 26px, บล็อกตามสัดส่วนเวลา, ฉากที่เลือกสีน้ำเงิน) + แถบเสียง MP4 (สูง 14px สีเขียวเข้ม) + playhead เส้นส้ม 2px; คลิกเพื่อ seek
  5. กล่องเตือนเสียง (พื้น `#1A1710` ขอบ `#3D3220`): "Sound is from the MP4 rendered at 12:41 — older than the last change." + ปุ่ม `Draft render to resync` (สีหลัก)
     - ไม่มี MP4: "ยังไม่มีเสียง — render draft เพื่อฟัง" (พรีวิว HTML ยังเล่นได้ปกติ)
  6. "Changed this session": รายการไฟล์ที่ถูกแก้ (จุดสีตามชนิด · path mono · เวลาที่แก้) กด → ไปหน้า Code เปิดไฟล์นั้น — ดูข้อ 8C

### 4.2 โหมด Preview-first
- ส่วนบน (แถว):
  1. **Scenes** (กว้าง 200–250px): รายการฉากแบบเดียวกับข้อ 4.1
  2. **พรีวิวใหญ่** (ยืดเต็ม, พื้น `#0A0B0C`): ป้ายสถานะ + เฟรม 9:16 (270×480 เมื่อ terminal แสดง, ใหญ่ขึ้นเมื่อซ่อน) + transport เหมือน 4.1
  3. **Properties** (กว้าง 260–320px): "Scene 02" · ชื่อฉาก (ตัวใหญ่) · ช่วงเวลา `00:04.20 – 00:14.00` · กล่องเตือนเสียง + ปุ่ม Draft render · แล้วแยกตามชนิดโปรเจกต์:
     - **HTML เดิม (legacy)**: กล่อง "Timing lives in your HTML — Ask Claude in the terminal, or edit `source/index.html` yourself." + ลิงก์ `Open index.html in Code`
     - **Composition** (`composition` ใน store ไม่เป็น null): หัว `COMPOSITION CLIP` · Component (read-only) · Start / Duration / Track (number, step 1/30) · ช่อง props ทุกตัวของ clip · แถวล่าง `● Pending edits` + ปุ่ม `Save composition` — ใช้ logic เดิมของ `CompositionInspector` (`saveComposition` + ETag + `previewRevision`)
- **Timeline** เต็มกว้าง: label ซ้าย `Picture` / `Sound (MP4)`; แถว Picture = clip ของ composition หรือฉากที่ตรวจพบ (ชื่ออยู่ในบล็อก); แถว Sound = แถบ MP4; playhead ส้ม; คลิกเพื่อ seek (logic เดิมใน `Timeline`)
- **Terminal** เป็นแผงล่าง (ข้อ 2.3)
- ปุ่ม Focus (ขยายพรีวิว) = ซ่อน Scenes/Properties/Timeline/terminal ชั่วคราว (แทน `workspaceMode: 'preview'` เดิม)

### 4.3 พรีวิว (ใช้ของเดิม)
- iframe `sandbox="allow-scripts"` src `/api/studio/preview/<project>?render`, scale ทั้ง document 1080×1920 (`--preview-scale`), สื่อสารด้วย `VS_READY` / `VS_SCENES` / `SEEK` / `VS_ERROR`
- เสียงมาจาก `<video>` ซ่อนที่โหลด `output/<project>.mp4` (audio master clock) — logic เดิมใน `Preview.tsx` ทั้งหมด
- ปุ่มกระโดดไปเฟรมแรกยังต้องมี (เช่น double-click `‹` หรือปุ่ม `|◀`)

---

## 5. หน้า Code — บอร์ด: `2 · Code`

3 คอลัมน์ + terminal แผงล่าง

1. **File tree** (กว้าง 220–260px): ช่องค้นหา "Find file…" + กลุ่ม:
   | กลุ่ม | ไฟล์ | แก้ได้ |
   |---|---|---|
   | Project source | `source/*.html`, `*.js`, `composition.json` | ✓ |
   | Documents | `projects/<ชื่อ>/docs/*.md` | ✓ |
   | Brand notes | `brand/brand.md`, `brand/web/SOURCES.txt` | ✓ (brand.md ห้ามเปลี่ยนชื่อ/ลบ แต่แก้เนื้อหาได้) |
   | Shared library | `lib/*.js`, `styles/**`, `components/registry.json` | ✗ ป้าย `read-only` |
   | Output | `*.srt` | ✗ |
   - จุดสีตามนามสกุล: html `#F07A6A`, js `#E8C66A`, json `#6EA8FE`, md/txt/srt `#B4B7BF`
   - ไฟล์ที่ยังไม่ save มีจุดส้มท้ายแถว
   - ใช้ `studioApi.entries()` เดิม กรองเฉพาะ `type === 'text'`
2. **Editor**:
   - **แท็บไฟล์หลายแท็บ** (เปิดไฟล์ใหม่ = เพิ่มแท็บ, แท็บที่เลือกมีเส้นส้มด้านบน, ยังไม่ save มี `●` ส้ม, ปุ่มปิดแท็บ — ถ้าปิดแท็บที่ยังไม่ save ให้ถาม)
   - แถบใต้แท็บ: path (mono) · ป้าย `Editable` (เขียว) / `Read-only` (เทา) · `Revert` · `Save  Ctrl S` (สีหลัก) — แสดงปุ่มเฉพาะไฟล์ที่แก้ได้
   - Monaco ใช้ `CodeInspector` เดิม (`/api/studio/source` + ETag, worker mapping สำหรับ Electron)
   - `Ctrl+S` = save เมื่อโฟกัสอยู่ใน Monaco
3. **พรีวิวข้างโค้ด** (กว้าง 280–360px) — **แทนปุ่มสลับ Visual/Code และ Read/Edit เดิม**:
   - `.html` → "Live preview" (iframe เดียวกับพรีวิวหลัก, ขนาด 190×338) + ปุ่ม Play + slider seek + เวลา + "Updates when you save."
   - `.md` → "Rendered" ใช้ `ReactMarkdown` + `remarkGfm` + `rehypeSanitize` เดิม อัปเดตขณะพิมพ์
   - อื่น ๆ → "About this file" เช่น shared library: "Read-only here so one project can’t break the others. Need a change? Use the Terminal."

---

## 6. หน้า Library — บอร์ด: `3 · Library`

3 คอลัมน์ + terminal แผงล่าง

1. **Locations** (กว้าง 210–240px) แบ่ง 3 ส่วน มีตัวเลขจำนวนไฟล์ท้ายแถว:
   - **This project**: Source images (`source/img`) · Brand media (`brand`) · Brand sound effects (`brand/sfx`) · Documents (project docs + brand docs) · Output
   - **Shared**: Shared SFX (`sfx/`) · Models
   - (แยก) **Trash**
   - map กับ `Category` เดิม + `managed()` เดิมใน `FileExplorer.tsx`
2. **Grid** (การ์ด min 150px):
   - หัว: ชื่อหมวด (ตัวใหญ่) · ช่องค้นหา · ปุ่ม `+ Import` (เฉพาะหมวดที่นำเข้าได้)
   - ข้อความใต้หัว (หมวดนำเข้าได้): "Drop files anywhere on this page to import into **<หมวด>**. Same name? It’s kept as a copy — nothing is overwritten. 100 MB per file."
   - หมวด read-only: แสดงเหตุผลแทน — Output: "Generated by renders. Re-render to replace it — files here are read-only." · Shared SFX: "Shared by every project. Override one by importing a file with the same name into Brand sound effects." · Models: "Large model file — only its name and size are shown. Never loaded into the app."
   - การ์ด: thumbnail สูง 112px (รูป = ภาพจริง; เสียง = waveform สีม่วง `#C9B9F5` บนพื้น `#1A1630`; วิดีโอ = ภาพแรก/พื้นดำ + ▶; เอกสาร/ข้อความ = นามสกุลตัวใหญ่) + ป้ายมุมขวาล่าง (ขนาดภาพ/ความยาว) + ชื่อไฟล์
   - การ์ดที่เลือก = พื้น `#1F2A3D` ขอบ `#4A6FA8`
   - **ลากไฟล์วางที่ไหนก็ได้ในหน้า** → นำเข้าไปหมวดที่เปิดอยู่ (ถ้าชนิดไฟล์ไม่ตรงหมวด เช่น .md ลงหมวดรูป → เปิด dialog Import เดิมให้เลือกปลายทาง)
   - ใช้ `studioApi.upload` + กฎ `DOC_EXT` เดิม (เอกสารลงหมวดเอกสารเท่านั้น)
3. **รายละเอียด** (กว้าง 280–340px):
   - พรีวิวใหญ่ (สูง 190px) + ปุ่ม Play สำหรับเสียง/วิดีโอ (ใช้ `<audio>`/`<video>` เดิม) + ชื่อไฟล์ + หมวด · ขนาด
   - หมวดที่จัดการได้: ช่อง Name + `Rename` · `Duplicate` · `Move to Trash` (ขอบแดง) + "Scenes that use this file may stop rendering until it’s restored."
   - หมวด read-only: กล่องข้อความเหตุผล (เหมือนด้านบน)
   - Move to Trash ต้องยืนยันด้วย AlertDialog เดิม; Rename/Duplicate ใช้ `/api/studio/files/action` เดิม
4. **Trash**: แทน grid ด้วยรายการ (ชื่อ · `from <หมวด> · <ขนาด> · deleted <เมื่อ>` · ปุ่ม `Restore`) + "Restore puts the file back where it came from and never overwrites a file with the same name." — ใช้ `/api/studio/files/trash` + `/restore` เดิม

---

## 7. หน้า Render — บอร์ด: `4 · Render`

3 คอลัมน์ + terminal แผงล่าง

1. **Run** (กว้าง 280–340px):
   - การ์ด 6 ใบ (ชื่อ ตัวหนา · คำอธิบาย · คำสั่ง mono · ปุ่ม `Run` ขวา):
     | ชื่อ | คำอธิบาย | คำสั่ง |
     |---|---|---|
     | Draft render | Fast, no motion blur. Use it to hear sound in sync. | `render 1 2` |
     | Final render | Motion blur, 8 subframes. Slow. | `render 8 2` |
     | Check layout | Overflow, overlaps, TikTok/Reels safe zone | `check` |
     | Stills | One frame per scene → output/stills | `stills` |
     | Probe | Verify the MP4 with ffprobe | `probe` |
     | Tests | Run the project test suite | `test` |
   - ฟอร์ม "Other command": ช่องพิมพ์ (placeholder `voice · audio · status · recovery · benchmark 1 2`) + `Run` + "Allow-listed commands only · type help to list them. One task at a time."
   - มีงานรันอยู่ → ปุ่ม Run ทุกใบ disabled; การ์ดของงานที่รันอยู่มีพื้น `#1F1A10` ขอบ `#5A4220`
   - ใช้ `POST /api/studio/task`, `GET /api/studio/task?id=`, `POST /api/studio/task/cancel` และ allowlist ใน `lib/studio-tasks.mjs` เดิม
2. **งานปัจจุบัน** (ยืดเต็ม):
   - กำลังรัน: จุดส้ม · ชื่องาน · `render 1 2 · 00:31 elapsed` · ปุ่ม `■ Stop` (แดง) · progress bar · log สด (mono, auto-scroll)
   - เสร็จ: จุดเขียว · `<ชื่องาน> — complete` · `finished 12:44 · output updated` · ลิงก์ `Back to Director to listen →`
   - ล้มเหลว: จุดแดง · `<ชื่องาน> — failed` · log แสดงสาเหตุ
   - ต้องแสดงงานที่ Claude สั่งจาก terminal ด้วย (ข้อ 8B)
3. **Output** (กว้าง 260–320px):
   - การ์ด MP4: thumbnail 9:16 + ▶ · ชื่อไฟล์ · `01:02 · 22 MB · 1080×1920` · `rendered 12:41` · ลิงก์ `Open MP4`
   - Stills: grid 3 คอลัมน์ภาพ 9:16 จาก `output/stills/` (กด → เปิดภาพใหญ่)
   - ลิงก์ `subtitles.srt` → หน้า Library หมวด Output

---

## 7.5 หน้า Projects — บอร์ด: `5 · Projects`

ไม่มี rail; top bar: `VIDEOSTUDIO / Projects` · ปุ่ม Terminal · `Back to <โปรเจกต์ปัจจุบัน>`; มี terminal แผงล่างเหมือนหน้าอื่น

1. **แถบเตือนสลับโปรเจกต์** (แสดงเมื่อสลับโปรเจกต์ขณะมีไฟล์ยังไม่ save): "Switching to **<โปรเจกต์ใหม่>** closes the preview and current files. **<ไฟล์>** in <โปรเจกต์เดิม> has unsaved changes." + ปุ่ม `Stay here` · `Discard & switch` · `Save & switch` (สีหลัก) — ไม่มีไฟล์ค้าง save ให้สลับได้เลย
2. **ซ้าย (ยืด)**: หัว `Projects` + ช่องค้นหา `Search projects (Ctrl K)`
   - grid การ์ด (min 200px): การ์ดแรก `+ New project` (ขอบประ) → โฟกัสฟอร์มด้านขวา
   - การ์ดโปรเจกต์: กล่องตัวย่อ 2 ตัว (สีต่างกันต่อโปรเจกต์) · ชื่อ · `● MP4 rendered` (เขียว) / `○ Not rendered yet` (เทา) · ปุ่ม `⋯` (เมนู: Move to Trash) · ปุ่ม `Open`; โปรเจกต์ที่เปิดอยู่ = พื้น `#1A2232` ขอบ `#4A6FA8` + "Open now"
   - กล่องยืนยันลบ (เปิดจาก `⋯ → Move to Trash`, ขอบแดง): "Move <ชื่อ> to Trash?" · คำอธิบาย (ทั้งโฟลเดอร์ไปที่ Project Trash ไม่ลบถาวร หยุด render ก่อน) · ช่อง "Type the project name to confirm" · `Cancel` · `Move to Trash` (แดง, กดได้เมื่อพิมพ์ชื่อตรง) — API เดิม `/api/studio/projects/trash`
3. **ขวา (320–400px)** บน→ล่าง:
   - **New project**: Folder name (mono, กรอง `[a-z0-9-]` ≤60, ใต้ช่อง "lowercase, numbers, hyphens → projects/<ชื่อ>") · Video title (optional) + Seconds (2–180, ค่าเริ่ม 12) · Start from: `Blank` (1 title clip) / `3-scene starter` (intro · callout · outro) · ปุ่ม `Create & open` — API เดิม `POST /api/projects`
   - **Project Trash**: รายการ (ชื่อ mono · `deleted <วันเวลา>` · `Restore`) + "Restore never overwrites an existing project." — `/api/studio/projects/trash` + `/restore`
   - **Workspace folder** (Electron เท่านั้น): คำอธิบาย + ช่อง path + `Apply & restart` — `window.videoStudioDesktop.setWorkspace`
   - **How it fits together** (แทน Help dialog): Terminal · Director · Code · Library · Render แต่ละอันหนึ่งบรรทัด

## 8. งานที่ต้องเพิ่มในโปรแกรม (ยังไม่มีในโค้ด)

### 8A. ปุ่ม "ส่งภาพเฟรมนี้ให้ Claude"
**render.mjs**
- เพิ่ม `'frame'` ในรายการโหมดที่อนุญาต (บรรทัด 20 ตอนนี้: `['check','stills','video','voice','audio']`) และใน usage
- รูปแบบ: `node render.mjs <project> frame <seconds>`
- ใช้ `openWorker()` + `shot(w, t)` ที่มีอยู่ → ถ่ายภาพเดียว → `closeWorkers()`
- ตรวจ `0 ≤ t ≤ DUR` ไม่งั้น error
- บันทึก `projects/<project>/output/frames/frame-MM-SS-CC.png` (CC = ร้อยวินาที; 8.9 วิ → `frame-00-08-90.png`) สร้างโฟลเดอร์ถ้าไม่มี, ทับไฟล์ชื่อเดิมได้
- พิมพ์ path (relative จาก workspace) เป็นบรรทัดสุดท้ายของ stdout

**studio.mjs**
- `POST /api/studio/frame` body `{ project: string, time: number }`
- ตรวจ: same-origin (เหมือน POST อื่น), `projectName(project)`, `Number.isFinite(time) && time >= 0`
- ถ้ามี render/project lock ของโปรเจกต์นั้นอยู่ → 409 `{ error: 'Render in progress' }`
- spawn `process.execPath` + `['render.mjs', project, 'frame', String(time)]` (ไม่ผ่าน shell), timeout 60 วิ, kill tree เมื่อเกินเวลา
- ตอบ `{ path: 'projects/<project>/output/frames/frame-00-08-90.png' }`

**React**
- chip `ภาพเฟรม <เวลา>` ในแถบ Insert ของ Director (label อัปเดตตาม `time`)
- กดแล้ว: ถ้า `playing` → `set({ playing: false })` ก่อน; เวลา = `Math.round(time * 30) / 30`; chip เป็น `กำลังถ่าย…` และกดซ้ำไม่ได้
- ได้ path → ส่ง `{ type: 'input', data: '@' + path + ' ' }` เข้า session ที่เลือก (**ห้าม** `\r`/`\n`)
- error/409/terminal ล็อก → toast

**Test**: project ไม่มีอยู่ → 4xx; time ติดลบ/ไม่ใช่ตัวเลข → 400; origin อื่น → ถูกปฏิเสธ

### 8B. สถานะ render ที่ Studio และ Claude รู้ร่วมกัน
- `render.mjs` เขียน/อัปเดต `projects/<project>/output/.render-status.json` ระหว่างรัน:
  ```json
  { "mode": "video", "args": ["1","2"], "pid": 1234, "startedAt": "2026-10-10T12:44:00Z",
    "updatedAt": "…", "frames": { "done": 1098, "total": 1860 },
    "state": "running" | "complete" | "failed", "error": null, "output": "output/<project>.mp4" }
  ```
  เขียนแบบ atomic (เขียนไฟล์ชั่วคราวแล้ว rename) ต่อยอดจาก project lock เดิม
- `studio.mjs`: `GET /api/studio/render-status?project=` อ่านไฟล์นี้ (ถ้า pid ตายแล้วแต่ state ยัง running → รายงาน `failed: process exited`)
- หน้า Render + ป้ายใน top bar poll ทุก ~1 วิ เมื่อ state = running → เห็นงานที่ Claude สั่งใน terminal ด้วย
- Claude อ่านไฟล์นี้เองได้ → รู้ว่าผู้ใช้กด render และผลเป็นอย่างไร (ใส่วิธีอ่านไว้ใน skill `make-video` หรือ CLAUDE.md ถ้าผู้ใช้อนุญาต)

### 8C. พรีวิวโหลดใหม่เองเมื่อไฟล์ถูกแก้
- `studio.mjs` ใช้ `fs.watch` (recursive บน Windows) ดู `projects/<project>/source/`, `brand/`, `docs/` ของโปรเจกต์ที่เปิดอยู่; debounce ~300ms; ข้าม `output/`
- ส่ง event ผ่าน SSE `GET /api/studio/events?project=` เป็น `{ type: 'changed', path, at }`
- UI: `source/*` เปลี่ยน → เพิ่ม `previewRevision` (มีใน `state.ts` แล้ว) ให้ iframe โหลดใหม่ แล้ว seek กลับเวลาเดิม; อัปเดตป้าย "Reloaded · <ไฟล์> changed N s ago"; เพิ่มรายการ "Changed this session" (เก็บในหน่วยความจำ, ล่าสุดอยู่บน, ไม่เกิน 20)
- ถ้าไฟล์ที่เปลี่ยนเปิดอยู่ใน Code และยังไม่ save → อย่าทับ ให้แสดงแถบ "File changed on disk — Reload / Keep mine"

### 8D. Terminal ตัวเดียวทั้งแอป + หลาย session
- ดูข้อ 2.3 — server ต้องรองรับหลาย PTY ต่อ client (map ด้วย `sessionId`), ปิด PTY เมื่อปิดแท็บ, จำกัดจำนวน (เช่น 6)

---

## 9. Checklist feature เดิม (ต้องยังอยู่ครบ)

- [ ] เลือกโปรเจกต์ + จุดบอกว่ามี MP4 + ยืนยันก่อนสลับโปรเจกต์ (ตอนนี้: dialog "Switch project?" → ใหม่: แถบ Save & switch / Discard & switch / Stay)
- [ ] New Project: ชื่อโฟลเดอร์ (`[a-z0-9-]`, ≤60), Video title, Duration 2–180, Template Blank / 3-scene starter (`POST /api/projects`)
- [ ] Project Trash: ย้ายโปรเจกต์ลงถังขยะ (พิมพ์ชื่อยืนยัน) + Restore (ไม่ทับโปรเจกต์ที่มีอยู่)
- [ ] Settings → Workspace folder (Electron เท่านั้น, Apply & Restart) → ย้ายไปหน้า Projects
- [ ] Help → ย้ายไปกล่อง "How it fits together" หน้า Projects (หรือปุ่ม `?`)
- [ ] Reset layout
- [ ] Explorer: 8 หมวด (Source, Assets, Brand Kit, Documents, FX & Styles, Models, Output, Trash), ค้นหา, Refresh, Import (5 ปลายทาง, 100 MB), Rename/Duplicate/Move to Trash (เมนู ⋯ + คลิกขวา), Restore → แบ่งไปหน้า Code (ไฟล์ข้อความ) และ Library (สื่อ/เอกสาร)
- [ ] Inspector File: HTML Visual/Code, MD Read/Edit, Monaco Save/Revert + ETag, รูป (fallback เมื่อ decode ไม่ได้ + ลิงก์ดาวน์โหลด), เสียง, วิดีโอ, PDF iframe + ดาวน์โหลด, binary metadata only
- [ ] Inspector Scenes (กดเพื่อ seek) → รายการฉากใน Director
- [ ] Inspector Composition (clip picker, start/duration/track/props, Save + ETag) → Properties ใน Director
- [ ] Inspector Project (Canvas, FPS, Duration, Files in category, Rendered MP4 + ลิงก์, Reusable components จาก `/components/registry.json`) → ใส่ใน Properties หรือหน้า Projects
- [ ] Preview: Play/Pause, First frame, Prev/Next frame, Mute, Volume, timecode, สถานะ READY/LOADING, ข้อความสถานะเสียง, Expand
- [ ] Timeline: แถว Visual (composition clips / scenes), แถว Soundtrack, คลิกเพื่อ seek
- [ ] Terminal: unlock ด้วย access code, Electron auto-unlock, Copy/Paste (Electron clipboard), resize, `Ctrl+\``, Render Tasks (quick buttons, Stop, command entry) → ย้ายไปหน้า Render
- [ ] Footer สถานะ (Local workspace / project / Playwright + FFmpeg · 30 FPS) → ย้ายได้แต่ต้องมีที่แสดง
- [ ] หน้าจอแคบ < 850px: แผงข้างเป็น drawer

---

## 10. ทำตอนเขียนโค้ดได้เลย (ไม่ต้องออกแบบเพิ่ม)

- สถานะ error/loading ของพรีวิว และ render ล้มเหลว → ใช้ป้าย/หัวการ์ดที่มีอยู่ เปลี่ยนเป็นสีแดง `#F07A6A` + ข้อความ
- มีไฟล์ยังไม่ save แล้วสลับหน้า/โหมด/โปรเจกต์ → แถบเตือน `Save & switch` / `Discard & switch` / `Stay here`
- คีย์ลัด: `Space` เล่น/หยุด, `←` `→` ทีละเฟรม, `Shift+←/→` ทีละฉาก, `Ctrl+\`` terminal, `Ctrl+K` โปรเจกต์ — **ห้ามดักปุ่มเมื่อโฟกัสอยู่ใน xterm, Monaco หรือ input**
- จำค่าใน localStorage: `vs-director-mode`, ความสูง terminal, session ที่เปิด, หน้าล่าสุด (ต่อจาก `vs-layout-*`, `vs-terminal-visible`, `vs-last-project`)

---

## 11. ลำดับการทำที่แนะนำ

1. **โครง**: store `page`, Rail, Top bar (รวม Render dropdown), terminal แผงล่างตัวเดียว (8D ฝั่ง UI ก่อน ยังใช้ PTY ตัวเดียวได้)
2. **Director** โหมด Preview-first (ย้าย Preview/Timeline/Inspector เดิมมาเรียงใหม่) → โหมด Terminal-first
3. **Code** (multi-tab + side preview) → **Library** → **Render** (ย้าย TaskShell) → **Projects** (ย้าย dialogs จาก App.tsx)
4. **แถบ Insert** (chip ข้อความก่อน)
5. Server: **8A** → **8B** → **8C** → หลาย PTY (8D)
6. ทุกขั้น: `npm test` ผ่าน + ไล่ checklist ข้อ 9

---

## 12. สีและตัวอักษร

| ใช้กับ | สี |
|---|---|
| พื้นหลังแอป | `#0E0F11` |
| แผง | `#111215` / top bar + rail `#131417` |
| กล่อง/ช่องกรอก | `#17191C`, `#1B1D21` |
| เส้นขอบ | `#24272D`, `#2B2E35`, `#33363E` |
| ตัวหนังสือ | `#ECEAE4` |
| ตัวหนังสือรอง | `#8E929B`, `#A3A7AF`, `#7E828C` |
| สีหลัก (Render, primary) | `#F0A23A` (ส่วนเข้ม `#D98E2A`), ตัวหนังสือบนสีหลัก `#1A1206` |
| เลือกอยู่/active | พื้น `#1F2A3D` ขอบ `#4A6FA8`; timeline clip `#2F4F86` ขอบ `#6EA8FE` |
| สำเร็จ | `#6CCB8F` (ตัวหนังสือ `#8FD6AE`, พื้น `#15241B`) |
| เตือน | `#F6C978` บนพื้น `#1A1710` / `#1F1A10` ขอบ `#3D3220` / `#5A4220` |
| อันตราย | ปุ่ม `#C2413A`, ขอบ `#6A2F29`, ตัวหนังสือ `#F5B2A8` |
| Terminal | พื้น `#090B10`, แถบหัว/Insert `#0F1218`, chip `#161B25` ขอบ `#263044` |

- ฟอนต์: **IBM Plex Sans Thai** (UI ทั้งหมด), **IBM Plex Mono** (เวลา, path, คำสั่ง, โค้ด, terminal)
- ขนาด: ตัวหนังสือปกติ 13px, เล็ก 11–12px, หัวข้อ 15–18px
- ปุ่มสูงอย่างน้อย 30–38px, มุมโค้ง 7–10px (การ์ด 12–14px)
