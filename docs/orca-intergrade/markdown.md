# แผนพัฒนา Markdown viewer แบบ Orca (สลับโหมด Source / Split / Preview)

- เขียนเมื่อ: 2026-10-11 · branch: `upgrade-feature-and-engine`
- สถานะ: **ยังไม่เริ่มลงมือ** — แผนสำหรับ session ถัดไป (คู่กับ [README.md](README.md) แผน terminal)
- อ้างอิง: [stablyai/orca](https://github.com/stablyai/orca) (MIT) ตรึงลิงก์ที่ commit [`ca1aac6`](https://github.com/stablyai/orca/tree/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb)

## 0. สิ่งที่ผู้ใช้ตัดสินใจแล้ว

| เรื่อง | คำตอบ |
|---|---|
| ลำดับ | ทำ **ส่วน A (ไม่ติดตั้ง package)** ก่อน แล้วค่อย **ส่วน B** |
| ส่วน B | เอา **สีโค้ด, สูตรคณิต, ขึ้นบรรทัดตามที่พิมพ์** — ต้องขออนุญาตติดตั้งก่อนตามกฎ `CLAUDE.md` |
| โหมด Rich (WYSIWYG / Tiptap) | **ไม่ทำ** — เสี่ยงทำ markdown เพี้ยนตอนบันทึกกลับ |

## 1. Orca ทำอย่างไร (ตรวจจากซอร์สแล้ว)

- [`markdown-render-mode.ts`](https://github.com/stablyai/orca/blob/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/src/renderer/src/components/editor/markdown-render-mode.ts) — `MarkdownRenderMode = 'source' | 'rich-editor' | 'preview'`; เลือก `preview` แล้วอยู่ preview เสมอ; rich ถอยไป source เมื่อไฟล์ใหญ่หรือมี syntax ที่ไม่รองรับ
- [`EditorMarkdownFileSurface.tsx`](https://github.com/stablyai/orca/blob/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/src/renderer/src/components/editor/EditorMarkdownFileSurface.tsx) — เลือก surface ตามโหมด; แยก front matter ออกก่อนแสดง (`extractFrontMatter` / `prependFrontMatter`)
- [`EditorPanelShell.tsx`](https://github.com/stablyai/orca/blob/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/src/renderer/src/components/editor/EditorPanelShell.tsx) — action: `onOpenPreviewToSide`, `onOpenMarkdownPreview`, `onToggleMarkdownTableOfContents`, `onToggleMarkdownFrontmatter`, `onExportMarkdownToPdf`
- [`EditorPanelMarkdownActionsMenu.tsx`](https://github.com/stablyai/orca/blob/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/src/renderer/src/components/editor/EditorPanelMarkdownActionsMenu.tsx) — เมนู Word Wrap / Show-Hide front matter / Export as PDF
- [`MarkdownTableOfContentsPanel.tsx`](https://github.com/stablyai/orca/blob/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/src/renderer/src/components/editor/MarkdownTableOfContentsPanel.tsx) — สารบัญ ย่อ/ขยายตามระดับ, ปรับความกว้างได้
- [`MarkdownPreviewSearchBar.tsx`](https://github.com/stablyai/orca/blob/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/src/renderer/src/components/editor/MarkdownPreviewSearchBar.tsx) — ค้นหาในพรีวิว
- [`markdown-preview-plugins.ts`](https://github.com/stablyai/orca/blob/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/src/renderer/src/components/editor/markdown-preview-plugins.ts) — `remark-gfm`, `remark-frontmatter`, `remark-math`, `remark-breaks`, `remark-cjk-friendly`, `rehype-raw`, `rehype-sanitize` (schema ขยาย), `rehype-slug`, `rehype-katex`, `rehype-highlight`, GitHub callouts
- [`markdown-preview-local-images.ts`](https://github.com/stablyai/orca/blob/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/src/renderer/src/components/editor/markdown-preview-local-images.ts), [`markdown-preview-link-actions.ts`](https://github.com/stablyai/orca/blob/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/src/renderer/src/components/editor/markdown-preview-link-actions.ts), [`markdown-internal-links.ts`](https://github.com/stablyai/orca/blob/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/src/renderer/src/components/editor/markdown-internal-links.ts) — รูปในเครื่องและลิงก์ระหว่างเอกสาร

## 2. สภาพปัจจุบันของ Video Studio (ตรวจแล้ว)

| จุด | ที่อยู่ | ปัญหา |
|---|---|---|
| พรีวิว `.md` | `app/src/components/CodePage.tsx` `SidePreview` (บรรทัด ~55-56) | แบบเดียว: Monaco + คอลัมน์ขวาแคบ สลับโหมดไม่ได้ |
| Plugin | `ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}` | ไม่มี slug/สารบัญ/front matter/callout/สีโค้ด/คณิต |
| รูป relative | `studio.mjs` `permitted()` บรรทัด 48-51 เสิร์ฟ static แค่ `projects/<p>/source|output/` | รูปใน `brand/`, `docs/` ไม่ขึ้น |
| ลิงก์ | ไม่มี handler | ลิงก์ `.md` อื่นกดไม่ได้; ลิงก์ภายนอกพึ่ง `setWindowOpenHandler` ใน `electron/main.cjs:79` (https เท่านั้น) |
| Library | `app/src/components/Library.tsx` แผงรายละเอียด | `.md` แสดงแค่ตัวย่อนามสกุล + ปุ่ม Open in Code |
| สไตล์ | `app/src/styles.css` `.markdown-reading` (หลายจุด) | ยังขาดตาราง/บล็อกโค้ด/blockquote/checkbox ที่จัดดี |

package ที่มีแล้ว: `react-markdown@10.1.0` (ใช้ `unified@11`), `remark-gfm@4.0.1`, `rehype-sanitize@6.0.0`

## 3. ส่วน A — ไม่ต้องติดตั้ง package

### A1. โหมด Source | Split | Preview
- segmented control บน `code-bar` เฉพาะแท็บ `.md/.mdx`; จำค่าใน `localStorage['vs-md-mode']` (ค่าเริ่ม `split`)
- **Source**: Monaco เต็มกว้าง (ซ่อนคอลัมน์ขวา)
- **Split**: Monaco + Rendered; ลากความกว้างได้ด้วย `react-resizable-panels` (มีอยู่แล้ว) จำขนาดใน `localStorage`
- **Preview**: เนื้อหาเต็มพื้นที่ กว้างสุด ~820px อยู่กลาง + คอลัมน์ขวาเป็นสารบัญ; ยังแก้ไม่ได้ (read-only) แต่ข้อความใน tab ไม่หาย
- คีย์ลัด `Ctrl+Shift+V` สลับ Preview ↔ โหมดก่อนหน้า (ตาม VS Code) — **ห้ามดักเมื่อโฟกัสอยู่ใน xterm/input** (ใช้ `typing()` ใน `lib/utils.ts`)
- สลับโหมดต้องไม่ remount state ของแท็บ (ข้อความอยู่ใน store `tabs` แล้ว)

### A2. สารบัญ (Outline)
- หลัง render เก็บ `h1–h6` จาก DOM ของบทความ (ตรงกับที่เห็นจริง) → `{id,text,level}`
- id ของหัวข้อ: ฟังก์ชัน slug เอง (ตัวพิมพ์เล็ก, ช่องว่าง→`-`, ตัดเครื่องหมายวรรคตอน, **คงอักษรไทย**, ซ้ำเติม `-1`,`-2`) ใส่ผ่าน component `h1..h6` ของ react-markdown — ต้องอนุญาต `id` ใน sanitize schema
- คลิก → `scrollIntoView` ในบทความ; ไฮไลต์หัวข้อที่กำลังอ่านด้วย `IntersectionObserver`
- ปุ่มย่อ/ขยายตามระดับ (แนว Orca) — ทำแบบง่าย: ระดับ 1–3 แสดงก่อน

### A3. Front matter
- ตัด `^---\r?\n…\r?\n---` ออกจากข้อความก่อน render (ไม่แก้ไฟล์)
- ปุ่ม “Front matter (N)” เปิด/ปิดตาราง key: value แบบข้อความดิบ (ไม่ parse YAML เต็ม — ไม่มี package)

### A4. Callout แบบ GitHub
- remark plugin เล็กเขียนเอง (เดินต้นไม้ mdast เอง ไม่พึ่ง `unist-util-visit`): blockquote ที่ย่อหน้าแรกขึ้นต้น `[!NOTE|TIP|IMPORTANT|WARNING|CAUTION]` → ตัด marker แล้วใส่ `data.hProperties.className = ['callout','callout-note'…]`
- sanitize schema อนุญาต `className` บน `blockquote` เฉพาะค่า `/^callout(-(note|tip|important|warning|caution))?$/`
- ไอคอน + สีตาม token ใน `styles.css` (note=น้ำเงิน, tip=เขียว, important=ม่วง, warning=เหลือง, caution=แดง)

### A5. ลิงก์
- `https://` / `http://` → เปิดภายนอก (`target="_blank" rel="noopener noreferrer"`; Electron ใช้ handler เดิม — ถ้าจะรองรับ `http://` ต้องแก้ `main.cjs:79` ให้ allowlist ทั้ง http/https)
- `#anchor` → เลื่อนในบทความ
- relative ที่ลงท้าย `.md/.mdx` → คำนวณ path จาก `workspacePath()` ของไฟล์ปัจจุบัน (`app/src/lib/paths.ts`) → หา entry ในกลุ่ม `source`/`documents`/`brand`/`fx` ที่ `workspacePath` ตรงกัน → `openFile(group, entry)` (เปิดเป็นแท็บใหม่)
- อย่างอื่นทั้งหมด (`javascript:`, `file:`, `data:`, path นอก workspace) → ไม่ทำอะไร + title บอกเหตุผล
- ใช้ `urlTransform` ของ react-markdown + handler `onClick` บน `a` — ไม่ให้ลิงก์ทำ navigation ของหน้าแอปเด็ดขาด (`will-navigate` ใน Electron กันอยู่แล้วอีกชั้น)

### A6. รูปภาพ
- path relative → workspace path → ถ้าอยู่ใต้ `projects/<p>/source/` หรือ `projects/<p>/brand/` → ใช้ media API เดิม: `/api/studio/media?project&group=assets&path=<rootIndex>/<sub>` (กลุ่ม `assets`: root 0 = `source/`, 1 = `brand/` ตาม `lib/studio-workspace.mjs` `groupRoots`)
- อยู่ที่อื่น (เช่น `docs/img/`) → กล่อง “ภาพนี้อยู่นอก source/ และ brand/ — Studio ยังแสดงไม่ได้”
  - ทางเลือกภายหลัง (งานแยก ต้องรีวิวความปลอดภัย): เพิ่ม root media ให้ `docs/` ใน `groupRoots`
- รูปจาก `https://` แสดงได้ตาม CSP เดิม (`img-src 'self' https: data: blob:`) — ไม่แตะ CSP

### A7. สไตล์การอ่าน
- ตาราง (ขอบ, แถวสลับสี, เลื่อนแนวนอน), code block (พื้น `#0F1218`, ฟอนต์ Plex Mono), inline code, blockquote, `hr`, task list checkbox (disabled), รูป `max-width:100%`
- **ตรวจภาษาไทยด้วยตา** (สระ/วรรณยุกต์, ระยะบรรทัด) ทั้งใน Split แคบและ Preview กว้าง — แนบภาพหน้าจอในรายงาน

### A8. Library
- เลือกไฟล์ `.md` → แผงรายละเอียดแสดง render ย่อ (component เดียวกัน, ซ่อนสารบัญ)
- “Open in Code” → เปิดแท็บในโหมด Preview

### A9. โครงโค้ด
- `app/src/components/MarkdownView.tsx` (ใหม่) — `{content, file, group, compact?, onHeadings?}`; รวม front matter, callout, ลิงก์, รูป, slug
- `app/src/lib/markdown.ts` (ใหม่) — `splitFrontMatter`, `slugger`, `remarkCallouts`, `resolveWorkspaceLink`, sanitize schema (ไฟล์เดียว)
- `CodePage.tsx` — โหมด + layout; `Library.tsx` — พรีวิวย่อ; `styles.css`
- ทุกอย่างอยู่ใน chunk ของหน้า Code ที่ lazy load อยู่แล้ว → ไม่เพิ่มขนาด bundle หลัก (วัด `index-*.js` ก่อน/หลัง — ตอนนี้ ~834 kB)

## 4. ส่วน B — ต้องติดตั้ง (ขออนุญาตก่อนลงมือ พร้อมเหตุผล/คำสั่ง/เวอร์ชัน)

เวอร์ชันล่าสุดบน npm ตอนเขียนแผน (ยืนยันอีกครั้งตอนทำ):

| ฟีเจอร์ | package | ล่าสุด | dependency ที่น่าสังเกต |
|---|---|---|---|
| สีโค้ด | `rehype-highlight` | 7.0.2 | `lowlight ^3` (highlight.js) |
| สูตรคณิต | `remark-math` | 6.0.0 | `unified ^11` (ตรงกับของเรา) |
| | `rehype-katex` | 7.0.1 | ดึง `katex ^0.16` มาเอง — ต้อง import CSS + ฟอนต์ของ KaTeX **รุ่นเดียวกับที่ rehype-katex ใช้** เพื่อให้ทำงาน offline ใน Electron |
| ขึ้นบรรทัดตามที่พิมพ์ | `remark-breaks` | 4.0.0 | เปลี่ยนพฤติกรรมจาก markdown มาตรฐาน → **ทำเป็นตัวเลือก** (ปุ่ม/ตั้งค่า) ไม่บังคับ |

ร่างคำสั่ง (ห้ามรันจนผู้ใช้อนุมัติ):
```
npm install --save-exact rehype-highlight@7.0.2 remark-math@6.0.0 rehype-katex@7.0.1 remark-breaks@4.0.0
```

ลำดับ plugin และความปลอดภัย
- `remarkPlugins`: `remark-gfm`, `remark-math`, `remark-breaks`(ถ้าเปิด), callout ของเรา
- `rehypePlugins`: **`rehype-sanitize` ก่อน** (schema อนุญาต `className` `math-inline`/`math-display`/`language-*` บน `code`) → แล้วค่อย `rehype-katex` และ `rehype-highlight` ซึ่งสร้าง markup จากข้อมูลที่ผ่าน sanitize แล้ว
- **ไม่ใช้ `rehype-raw`** (HTML ดิบในไฟล์ md ไม่แสดง) — คงความปลอดภัยแบบเดิม
- ขนาด: highlight.js + KaTeX ใหญ่ → อยู่ใน chunk หน้า Code (lazy) และพิจารณา import ภาษาเฉพาะที่ใช้ (js/ts/json/html/css/bash/powershell/markdown) แทน bundle ทั้งหมด; วัด chunk ก่อน/หลัง

## 5. ไม่ทำ
- โหมด Rich (WYSIWYG/Tiptap) — ผู้ใช้ตัดสินแล้วว่าเสี่ยงเกิน
- `rehype-raw` / HTML ดิบใน md
- Export PDF, ค้นหาในพรีวิว, annotation/review notes (มีใน Orca — พิจารณารอบหลัง; ค้นหาใช้ `Ctrl+F` ของเบราว์เซอร์/Electron ได้ระหว่างนี้หรือไม่ **ต้องตรวจ**)

## 6. การทดสอบ

| ส่วน | เทสต์ (Playwright + โปรเจกต์ชั่วคราวที่ลบทิ้งท้ายเทสต์ — ไม่แตะโปรเจกต์จริง) |
|---|---|
| A1 | สลับ Source/Split/Preview 3 รอบ → ข้อความที่ยังไม่ save ไม่หาย, `Ctrl+S` ยังทำงานใน Source/Split, Preview ไม่มี Monaco; โหมดถูกจำหลังรีโหลด |
| A2 | ไฟล์ที่มี heading ซ้ำ + ภาษาไทย → id ไม่ซ้ำ, คลิกสารบัญแล้วหัวข้อเลื่อนเข้าจอ |
| A3 | front matter ไม่ปรากฏในเนื้อหา, เปิดตารางแล้วเห็น key |
| A4 | `> [!WARNING]` ได้ class `callout-warning`; `className` อื่นที่ใส่มาในไฟล์ถูกตัด |
| A5 | ลิงก์ `./other.md` เปิดแท็บใหม่; `javascript:alert(1)` ไม่ทำงาน (ไม่มี dialog, ไม่ navigate); `https://` ไม่เปลี่ยนหน้าแอป |
| A6 | รูปใน `brand/` โหลด (`naturalWidth>0`); รูปใน `docs/img` ขึ้นกล่องบอกเหตุผล |
| A8 | Library เลือก `.md` เห็น render; Open in Code เปิดในโหมด Preview |
| B | บล็อก ```js มี `span.hljs-*`; `$E=mc^2$` render เป็น `.katex`; ฟอนต์ KaTeX โหลดจากเครื่อง (บล็อกเน็ตใน Playwright) |
| ทุกส่วน | `npm run ui:check`, `npm test`, Electron smoke 5 ตัว, วัดขนาด `index-*.js` |

## 7. ความเสี่ยง

| เรื่อง | วิธีลด |
|---|---|
| slug ของเรากับหัวข้อที่มี markup (ลิงก์/ตัวหนา) ไม่ตรงกับ anchor ที่ผู้เขียนตั้งใจ | สร้าง id จากข้อความที่ render จริง; ลิงก์ `#…` ลองหาแบบไม่สนตัวพิมพ์ก่อนยอมแพ้ |
| plugin รุ่นใหม่ไม่เข้ากับ `react-markdown@10.1.0`/`unified@11` | ตรวจ `npm ls unified` หลังติดตั้ง ต้องได้รุ่นเดียว (deduped) + รันเทสต์ |
| KaTeX ต้องใช้ฟอนต์ offline | import CSS จาก `katex` รุ่นที่ `rehype-katex` ดึงมา, ทดสอบโดยบล็อกเน็ต |
| ไฟล์ md ใหญ่มาก render ช้า | debounce การ render ใน Split ~150ms; ถ้าเกิน ~1 MB แสดงเตือนและให้เลือก Source (แนว Orca size gate) |

## 8. Checklist เริ่ม session
- [ ] อ่านเอกสารนี้ + `git status -sb`
- [ ] baseline `npm run ui:check` / `npm test` (จดผลจริง)
- [ ] ทำ A1 → A9 พร้อมเทสต์ → รายงาน + ภาพหน้าจอ
- [ ] เสนอคำสั่งติดตั้งส่วน B → รออนุมัติ → ทำ B + เทสต์
- [ ] ไม่ commit/push จนผู้ใช้สั่ง
