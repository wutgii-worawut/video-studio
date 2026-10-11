# 016 · mochi-monday-3d ต้องต่อเน็ต (three.js จาก jsdelivr) และใช้ ES module ในเครื่องผ่าน file:// ไม่ได้

- วันที่: 2026-10-11
- tags: render, page, chrome, library
- project: mochi-monday-3d
- ref: 015

## ปัญหา
`source/index.html` โหลด three@0.170.0 ผ่าน importmap จาก `cdn.jsdelivr.net` ถ้าไม่มีเน็ต `render()` จะไม่ถูกสร้าง ทั้งพรีวิวและ render.mjs จึงใช้ไม่ได้ (สคริปต์ถ่าย stills ตอนบล็อกเน็ตล้มด้วย `window.render is not a function`)

## สาเหตุ
- พึ่ง CDN
- ถ้าแค่ดาวน์โหลด `three.module.js` มาวางแล้วชี้ importmap ไปที่ไฟล์ในเครื่องก็ยังไม่พอ ทดสอบแล้วว่า Chrome บล็อก ES module จากไฟล์ในเครื่องเมื่อเปิดหน้าผ่าน `file://` (`Access to script … from origin 'null' has been blocked by CORS policy`) และ render.mjs เปิดโปรเจกต์ผ่าน `file://`

## วิธีแก้ที่ได้ผล
- ผู้ใช้อนุมัติ `npm pack three@0.170.0` (MIT) มาไว้ใน scratchpad แล้ว bundle `three` + `RoundedBoxGeometry` เป็น IIFE `window.THREE` ด้วย rolldown 1.2.13 ที่มีใน repo อยู่แล้ว ได้ `libs/three/three-0.170.0.js` ขนาด 684 672 bytes พร้อม `LICENSE.txt` และ `README.md` (ขั้นตอนอัปเดตเองและ sha256)
- ไม่ใช้ชื่อ `vendor/` เพราะ `studio.mjs` มี route `/vendor/` ของ xterm อยู่แล้ว ซึ่งตอบ 404 กับไฟล์อื่น
- แก้ HTML: ลบ importmap, เพิ่ม `<script src="../../../libs/three/three-0.170.0.js">` และเปลี่ยน `import` 2 บรรทัดเป็น `const THREE = window.THREE; const { RoundedBoxGeometry } = THREE;`
- `studio.mjs` เสิร์ฟเฉพาะ `/libs/<lib>/<file>.js`, workspace-seed เพิ่ม `libs/**/*`, README มีหัวข้อ "ฟอนต์และไลบรารี offline (ผู้ใช้ต้องอัปเดตเอง)", skill `make-video` อัปเดตแล้ว
- ตรวจแล้ว:
  - stills 4 เฟรม ตอนบล็อกเน็ตทั้งหมด เทียบกับตอนโหลดจาก CDN **ตรงกันทุก pixel** และไม่มี request ออกไปภายนอก
  - ดูภาพด้วยตาแล้ว ฉาก 3D ขึ้นครบ
  - `render.mjs mochi-monday-3d check` ได้ layout OK
  - เทสต์ใหม่ยืนยันว่าพรีวิว offline ได้ `THREE.REVISION` เป็น 170 และไม่มีโปรเจกต์ไหนอ้าง CDN
  - `npm test` ผ่าน 80/80, Electron smoke ทั้ง 5 ตัวไม่มี console error
- ข้อจำกัด: ไม่มีระบบอัปเดตอัตโนมัติ ถ้าจะใช้รุ่นใหม่หรือ addon ตัวอื่นต้อง build ใหม่เอง (`libs/three/README.md`)
