# 006 · FFmpeg เสียงค้างแม้ตัดวิดีโอออกจากขั้น Mux

- วันที่: 2026-10-10
- tags: render, ffmpeg, audio, production
- project: skillz-promo / sword-of-coming-s3
- ref: 001, 003, 005

## ปัญหา
ทดลอง `skillz-promo video 1 2` (SFX 60 cues) หลังแก้ renderer ให้ปิด Chrome ก่อน Mux ภาพเข้ารหัสครบ 450 เฟรม แต่ FFmpeg รวมเสียงยังค้างจนเกิน 90 วินาทีตาม Timeout

ทดลองใหม่ด้วย Audio-only FFmpeg graph (เพิ่ม dummy input, ไม่มีไฟล์วิดีโอ) พร้อม `-filter_complex_threads 1` ก็ยังค้าง

## สาเหตุ
ยืนยันได้ว่าปัญหาเกิดได้ใน **FFmpeg audio filtergraph เอง** ที่มี `asplit` + `adelay` หลายสิบชุด + `amix` + `alimiter` ไม่จำเป็นต้องมี Chrome หรือ Video Input ทำให้สมมุติฐาน Chrome/STDIN เป็นสาเหตุทั้งหมดไม่ถูกต้อง

**ยังไม่พิสูจน์ root cause ระดับ filter ตัวเดียว** (race/graph scheduling/version) แต่ทราบจุดที่ต้องหลีกเลี่ยงชัดเจนแล้ว

## วิธีแก้ที่ได้ผล
- สร้าง `lib/audio-pcm.mjs` ถอดแต่ละไฟล์เสียงด้วย FFmpeg แยกเป็น Float32 48 kHz Stereo
- รวม PCM ใน Node โดยรักษาตำแหน่ง SFX, Voice, Fade และ Duck Music พร้อม Peak Limiter
- เข้ารหัส AAC แทร็กเดียว แล้วค่อย `ffmpeg -c copy` รวมกับ Video
- Smoke: `skillz-promo video 1 2` ผ่าน 450 เฟรม/15s/เสียง ใน 12.8s
- Full Blur: `skillz-promo video 8 2` ผ่าน 450 เฟรม/15s/เสียง ใน 86.9s
- Narrated: `sword-of-coming-s3 audio` ผ่าน (voice + 42 cues)

## ข้อจำกัด
- Ducking/Peak Limiter ใหม่เทียบเคียงเดิม แต่ยังไม่ตรวจการฟัง A/B ในทุกโปรเจกต์
- เสียงที่ยาวเกิน 600s ยังไม่รองรับ
