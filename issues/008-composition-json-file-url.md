# 008 · Declarative Composition JSON ใช้ได้บน HTTP แต่ไม่ได้บน file://

- วันที่: 2026-10-10
- tags: render, page, timeline, compatibility, chrome
- project: composition-demo
- ref: 007

## ปัญหา
หลังเพิ่ม Composition model และ Studio Preview, ตัวอย่าง `composition-demo` เปิดผ่าน HTTP server ได้ แต่ Renderer หลักที่ใช้ `page.goto(file:///.../source/index.html?render)` ล้มด้วย `Failed to fetch` เพราะ Browser บล็อก fetch JSON ที่เป็น local file

## สาเหตุ
HTTP Origin กับ file:// ใช้นโยบายความปลอดภัยคนละแบบ ไม่ควรให้ Renderer เดิมต้องย้ายทั้งหมดไปเป็น HTTP เพียงเพื่อโหลด JSON

## วิธีแก้ที่ได้ผล
- ใช้ `composition.json` เป็น Authoring Source
- สร้าง `composition-data.js` แบบ sync ที่โหลดผ่าน `<script src>` ได้ทั้ง file:// และ HTTP
- เพิ่ม `compose-sync.mjs` สร้าง sidecar หลังแก้ JSON
- Studio Editor บันทึกทั้ง `composition.json` และ sidecar, ตรวจ ETag กัน overwrites, ปฏิเสธแก้ขณะ Render กำลังทำงาน
- `render.mjs` รอ `window.render` จะพร้อมก่อน capture
- ตรวจแล้ว: `composition-demo check` ผ่าน และ Browser Studio test เปิด Editor ได้

## ข้อจำกัด
- การแก้ HTML เดิมที่เขียนเวลาไว้ใน JS ไม่สามารถย้ายอัตโนมัติให้ JSON Editor แก้ได้
- Update JSON และ JavaScript Sidecar ยังเป็นการเขียนสองไฟล์ (ไม่ใช่ Atomic Transaction ข้ามสองไฟล์) ต้องใช้ Git ช่วยย้อนค่าเมื่อ Machine Power Loss ระหว่างบันทึก
