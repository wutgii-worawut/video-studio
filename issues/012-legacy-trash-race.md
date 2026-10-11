# 012 · Legacy Studio: ลบไฟล์แล้วกด Trash ทันที ไม่เห็นไฟล์ / ถูกดึงกลับไปหน้า Docs

- วันที่: 2026-10-11
- tags: page, studio, legacy, test
- project: composition-demo (เทสต์ `tests/studio-files.test.mjs` "browser shows docs upload, duplicate, Trash and Restore")

## ปัญหา
`npm test` ล้มเป็นบางครั้งด้วย `test timed out after 30000ms` สคริปต์ที่จับเวลาแต่ละขั้นรัน 8 รอบ ล้ม 2 รอบ ทุกครั้งค้างที่ขั้นเดียวกัน คือกด **Trash** หลัง Move to Trash แล้วไม่เคยเห็นไฟล์ที่เพิ่งลบ

## สาเหตุ
ใน `studio/index.html` ฟังก์ชัน `fileAction` จำ `group` ไว้ตอนเริ่ม (`documents`) พอคำขอ `/api/studio/files/action` ตอบกลับก็เรียก `loadWorkspaceGroup(group)` เสมอ ถ้าผู้ใช้กด Trash ไปแล้วระหว่างรอ หน้าจอจะถูกดึงกลับไป Docs หรือ Trash ถูกโหลดก่อนไฟล์ย้ายเสร็จแล้วไม่โหลดใหม่อีก
`loadTrash` ก็ไม่มีตัวกันผลลัพธ์เก่า (stale request) ถ้าคำขอเก่าตอบกลับหลังเปลี่ยนแท็บ จะไปล้างรายการของแท็บอื่น

## วิธีแก้ที่ได้ผล
- `fileAction`: หลังทำเสร็จ โหลดใหม่เฉพาะแท็บที่เปิดอยู่ตอนนั้น (`workspace.group`) และเฉพาะเมื่อยังอยู่กลุ่มเดิมหรืออยู่ที่ Trash ไม่ดึงผู้ใช้กลับไปกลุ่มเดิม
- `loadTrash`: จำ `workspace.request` และ project ไว้ ถ้าเปลี่ยนแท็บหรือโปรเจกต์ไปแล้ว ไม่วาดผลลัพธ์นั้น
- ตรวจแล้ว: สคริปต์จับเวลาผ่าน 8/8, `node --test tests/studio-files.test.mjs` ผ่าน 5 รอบติดกัน, `npm test` ผ่าน 78/78
