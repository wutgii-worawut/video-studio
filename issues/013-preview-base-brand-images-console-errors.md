# 013 · พรีวิวใน Studio ไม่แสดงรูปจาก brand/ และ voice.js โหลดไม่ขึ้น (พร้อม CONSOLE_ERR ใน Electron smoke)

- วันที่: 2026-10-11
- tags: page, picture, voice, electron, studio
- project: sword-of-coming-s2 (โปรเจกต์อื่นที่ใช้ `../brand/web/` หรือมี `<script src>` relative ใน `<head>` ก็โดนเหมือนกัน)

## ปัญหา
- `electron-new-project` exit 0 แต่พิมพ์ `CONSOLE_ERR … 404` และ `ERR_INCOMPLETE_CHUNKED_ENCODING` ออกมา
- พอเก็บ URL ที่ล้มก็เจอ `ERR_BLOCKED_BY_ORB` กับรูป `brand/web/*.jpg` ทุกรูป และกับ `voice.js` ด้วย ในพรีวิวของ `sword-of-coming-s2` **รูปโหลดได้แค่ 2 จาก 31** (เกิดแม้ไม่ได้สลับโปรเจกต์) แต่ใน MP4 รูปขึ้นครบ เพราะ render.mjs เปิดหน้าผ่าน `file://`

## สาเหตุ
1. `studio.mjs` `/api/studio/preview/<p>` แทรก `<base href="/projects/<p>/source/">` ไว้ก่อน `</head>` ทำให้ `<script src>` ใน `<head>` ที่อยู่ก่อนหน้านั้น resolve path จาก URL ของ preview แทน `voice.js` จึงกลายเป็น `/api/studio/preview/voice.js` (400) และโมจิไม่ขยับปากในพรีวิว ส่วน `../../../lib/fx.js` โหลดได้เพราะบังเอิญไปลงที่ root พอดี
2. `permitted()` เสิร์ฟแค่ `projects/<p>/source|output/` แต่ HTML อ้างถึง `../brand/web/*.jpg` จึงได้ 403 JSON ซึ่ง iframe ที่ sandbox เป็น opaque origin จึงถูก ORB บล็อก
3. 404: App เรียก `/api/compositions/<p>` กับโปรเจกต์แบบ legacy ที่ไม่มี composition ฝั่ง client รองรับ 404 ไว้อยู่แล้ว แต่ Chromium ก็ยังพิมพ์ error
4. `ERR_INCOMPLETE_CHUNKED_ENCODING`: `before-quit` ใน `electron/main.cjs` ปิด server ตอนหน้าต่างยังเปิดอยู่ จึงตัดสาย SSE `/api/studio/events` ขาดกลางทาง

## วิธีแก้ที่ได้ผล
- แทรก `<base>` ไว้ต่อจาก `<head …>` ทันที (ใช้ regex `<head(\s[^>]*)?>` เพื่อไม่ให้ไปจับ `<header>`)
- `permitted()` / `safeStaticProjectFile()` เปิดให้ `projects/<p>/brand/` **เฉพาะไฟล์รูป** ส่วน `voice.mp3`, `brand.md` และไฟล์อื่นยังได้ 403 เหมือนเดิม (มีเทสต์เดิมและเทสต์ใหม่ยืนยัน) และยังตรวจ symlink เหมือนเดิม รูปใน brand/ เปิดดูผ่าน `/api/studio/media` ได้อยู่แล้ว ข้อมูลที่เข้าถึงได้จึงไม่ได้เพิ่ม
- `/api/projects` เพิ่ม `hasComposition` และ App ข้ามการเรียก composition เมื่อรู้แน่ว่าไม่มี (ถ้าไม่รู้ เช่นโปรเจกต์ที่เพิ่งสร้าง จะยังเรียกตามเดิม)
- Electron ย้ายการปิด server ไปไว้ที่ `will-quit` ซึ่งทำงานหลังปิดหน้าต่างครบแล้ว
- ตรวจแล้ว: รูปในพรีวิว 31/31, ไม่มี `voice.js` ล้ม, `electron-new-project` ไม่มี CONSOLE_ERR, `npm test` ผ่าน 79/79, Electron smoke ทั้ง 5 ตัวไม่มี console error
