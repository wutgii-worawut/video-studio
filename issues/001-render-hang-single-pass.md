# 001 · เรนเดอร์ค้าง ffmpeg ไม่ได้ภาพเลย (frame=0)

- วันที่: 2026-10-07
- tags: render, ffmpeg, audio
- โปรเจกต์: sword-of-coming
- ref: -

## ปัญหา
`node render.mjs sword-of-coming video` ค้าง ffmpeg แสดง frame=0 ทั้งที่เสียงประมวลผลไปถึง 1:45 แล้ว

## สาเหตุ
ffmpeg เข้ารหัสภาพ (x264 lookahead) กับมิกซ์เสียงในคำสั่งเดียว ฝั่งเสียงรอฝั่งภาพ ฝั่งภาพรอ input จาก pipe เลยค้างกันเอง (deadlock)

## วิธีแก้ที่ได้ผล
แยกเป็น 2 รอบใน `render.mjs`: รอบแรกเข้ารหัสภาพอย่างเดียวเป็น `output/.video-only.mp4` รอบสองรวมเสียงด้วย `-c:v copy` แล้วลบไฟล์ชั่วคราว
