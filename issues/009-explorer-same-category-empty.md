# 009 · กดหมวดเดิมใน Project Explorer แล้วรายการไฟล์ว่าง

- วันที่: 2026-10-11
- tags: editor, page, layout
- project: ทุกโปรเจกต์ (เจอใน composition-demo, sword-of-coming-s2 ระหว่างทำ UI ใหม่ตาม docs/design)

## ปัญหา
หลังเพิ่มหน้า Code / Library (เปิดมาที่หมวด Source / Assets ให้เลย) ถ้ากดปุ่มหมวดที่กำลังเปิดอยู่ซ้ำ เช่นกด Source ตอนอยู่ Source รายการไฟล์หายหมดและไม่โหลดกลับ test `react-workspace-layout` และ `studio-projects` รอ `index.html` จนหมดเวลา

## สาเหตุ
ปุ่มหมวดใน `FileExplorer.tsx` สั่ง `set({category, files:[]})` ทุกครั้ง แต่ effect ที่โหลดไฟล์ผูกกับ `[project, category]` เมื่อ category ค่าเดิม effect จึงไม่รันใหม่ ไฟล์ถูกล้างแต่ไม่โหลด บั๊กนี้มีอยู่เดิม แต่หน้าเก่าเริ่มที่หมวด Brand Kit การกดหมวดอื่นเลยไม่เจอ

## วิธีแก้ที่ได้ผล
- ปุ่มหมวดล้างรายการเฉพาะเมื่อเปลี่ยนไปหมวดอื่น (`if(category!==s.key)`)
- ตรวจแล้ว: `npm test` ผ่าน 64/64 รวม test ที่กด Source ซ้ำหลังเข้าหน้า Code
