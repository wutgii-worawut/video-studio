# 010 · Monaco ตัวที่สองขึ้น error "depends on UNKNOWN service"

- วันที่: 2026-10-11
- tags: editor, page
- project: ทุกโปรเจกต์ (ลองกับ sword-of-coming-s2)

## ปัญหา
เปิดไฟล์ใน Monaco ไฟล์แรกได้ปกติ แต่พอเปิดตัวแก้ไขตัวที่สอง เช่นเปิด `brand.md` ต่อจาก `index.html` หน้าเว็บมี page error 5 ตัว:
`[createInstance] … depends on UNKNOWN service ICodeLensCache` (และ IInlayHintsCache, treeViewsDndService, ISuggestMemories, actionWidgetService)
ลองกับ build ของ UI เดิม (HEAD ก่อนทำ UI ใหม่) แล้ว error เหมือนกัน แปลว่าเป็นบั๊กที่มีอยู่แล้ว เทสต์เก่าไม่เจอเพราะเปิด Monaco แค่ตัวเดียวต่อหน้า

## สาเหตุ
`CodeEditor.tsx` import Monaco แบบเลือกบางส่วน (`editor.api.js` + ภาษาที่ใช้) ส่วน `vs/internal/common/workers.js` ซึ่ง register editor contributions (find, folding, suggest, code lens, inlay hints …) พร้อม service ของมัน ถูกโหลดทีหลังแบบ lazy ตอน language worker ตัวแรกเริ่มทำงาน ช่วงนั้น editor ตัวแรกสร้างไปแล้ว และ StandaloneServices ถูก initialize ไปแล้ว service ที่ register ทีหลังจึงไม่ถูกนับ editor ตัวถัดไปสร้าง contribution ได้แต่หา service ไม่เจอ

## วิธีแก้ที่ได้ผล
- import `monaco-editor/esm/vs/internal/common/workers.js` ไว้ต้น `CodeEditor.tsx` ต่อจาก `editor.api.js` ให้ register ทุกอย่างก่อนสร้าง editor ตัวแรก (เดิมไฟล์นี้อยู่ใน bundle อยู่แล้ว แค่โหลดเร็วขึ้น ส่วนชุด language worker ยังเหมือนเดิม)
- ตรวจแล้ว: เปิด 2 ไฟล์ต่อกัน page error เหลือ 0 จากเดิม 5, `index` chunk 830 kB (เดิม 827 kB), `npm test` ผ่าน 65/65, Electron layout smoke (Monaco ใน Electron) ผ่าน
- ผลพลอยได้: editor ตัวแรกมี find / folding / suggest ครบตั้งแต่ต้น ไม่ต้องรอ worker
