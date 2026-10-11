# 015 · ฟอนต์ของโปรเจกต์ต้องต่อเน็ต (Google Fonts) ถึงจะ render ได้ถูก

- วันที่: 2026-10-11
- tags: render, page, font, chrome, electron
- project: kento-lite, luffy-fanart-test, mochi-monday, mochi-monday-3d, skillz-promo, sword-of-coming, sword-of-coming-s2, sword-of-coming-s3
- ref: 013

## ปัญหา
`source/index.html` ของ 8 โปรเจกต์โหลดฟอนต์จาก `fonts.googleapis.com` / `fonts.gstatic.com` ถ้าไม่มีเน็ต ทั้งพรีวิวใน Studio, Electron และ render.mjs จะใช้ฟอนต์สำรองแทน ภาพที่ได้จึงไม่ตรงแบบ เทสต์ markdown ที่บล็อกเน็ตก็เจอ request นี้ เพราะพรีวิวของ sword-of-coming-s2 ซึ่งเป็นโปรเจกต์เริ่มต้นไปขอฟอนต์

## สาเหตุ
โปรเจกต์ทำตามแบบเดิมที่ใช้ `<link>` ของ Google Fonts พร้อม `preconnect` ทั้งใน repo และใน skill ไม่มีที่เก็บฟอนต์ในเครื่องให้โปรเจกต์ใช้

## วิธีแก้ที่ได้ผล
- ผู้ใช้อนุมัติ `npm pack @fontsource/{mali@5.3.0,ma-shan-zheng@5.3.1,dela-gothic-one@5.3.0,kanit@5.3.0,rye@5.3.0,prompt@5.3.0,jetbrains-mono@5.3.0}` (OFL-1.1) มาไว้ใน scratchpad โดยไม่ติดตั้งลง node_modules แล้วคัดเฉพาะ woff2 ของ weight ที่ใช้ ทุกชุดตัวอักษร (CJK เก็บครบทุกชิ้นตามที่ผู้ใช้เลือก) ไปไว้ที่ `fonts/<name>/` พร้อม `fonts/<name>.css` และ LICENSE รวมราว 5.4 MB ใช้ `font-display:block` เหมือนพารามิเตอร์ `display=block` ใน URL ของ Google เดิม
- แทน 3 บรรทัด (preconnect ×2 + Google `<link>`) ใน 8 โปรเจกต์ด้วย `<link rel="stylesheet" href="../../../fonts/<name>.css">`
- `studio.mjs` `permitted()` เสิร์ฟ `/fonts/<name>.css` และ `/fonts/<name>/<file>.woff2` เท่านั้น, `package.json` workspace-seed เพิ่ม `fonts/**/*`
- ไม่เก็บไว้ใน `styles/fonts` เพราะจะไปโผล่ใน Library "FX & styles" ถึง 271 จาก 301 รายการ
- skill `make-video` และ README บอกให้ใช้ `fonts/` แทน CDN
- ตรวจแล้ว:
  - stills 66 เฟรมของ 8 โปรเจกต์ ถ่ายตอนต่อเน็ต (ก่อนแก้) เทียบกับตอนบล็อก Google Fonts (หลังแก้) ตรงกันทุก pixel 63 เฟรม อีก 3 เฟรมของ skillz-promo ต่างกันไม่เกิน 0.004% ที่ขอบตัวอักษร ซูมดูด้วยตาแล้วไม่เห็นความต่าง (น่าจะเป็นไฟล์ฟอนต์คนละ build)
  - `render.mjs check` ของ skillz-promo และ sword-of-coming-s2 ได้ layout OK
  - `npm test` ผ่าน 80/80, Electron smoke ทั้ง 5 ตัวไม่มี console error
- ยังเหลือ: `mochi-monday-3d` ยังโหลด three.js จาก `cdn.jsdelivr.net` ถ้าไม่มีเน็ตจะ render ไม่ได้ (เรื่องแยก ยังไม่ได้แก้)
