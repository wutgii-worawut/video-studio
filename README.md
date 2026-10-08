# video-studio

คลิป motion graphic ที่เขียนด้วย HTML แล้วเรนเดอร์ด้วย Playwright + ffmpeg (มี motion blur และเสียง)

## โครงสร้าง

```
CLAUDE.md                  กฎพื้นฐานที่ Claude Code อ่านเองทุกครั้ง
render.mjs                 ตัวเรนเดอร์ ใช้ร่วมกันทุกโปรเจกต์
lib/fx.js                  คลังลูกเล่น: ตัวหนังสือทีละคำ ไฮไลต์ ขีดฆ่า spring เปลี่ยนฉาก กล้องสั่น วาดเส้น confetti
sfx/                       เสียงเอฟเฟกต์ในตัว whoosh tick pop impact ding (สร้างใหม่: node sfx/make-sfx.mjs)
issues/                    บันทึกปัญหา สาเหตุ วิธีแก้ (1 ปัญหา = 1 ไฟล์ มี tags)
models/                    โมเดล Whisper สำหรับถอดเสียงพากย์ (ไม่เข้า git)
styles/                    แนวภาพที่ใช้ซ้ำได้ 1 แนว = 1 โฟลเดอร์ (style.md + example.png + โค้ดเฉพาะแนว)
  cute-doodle/             Kawaii Doodle: เส้นสั่น line boil (boil.js) พาสเทล กระดาษลายจุด + มาสคอตโมจิ (mochi.js: ชุดนักดาบ ขยับปากตามเสียง)
  dark-tech/               Dark Tech / Terminal: พื้นมืด แสงฟุ้งนีออน terminal การ์ดคำสั่ง
  manga-action/            มังงะแอ็กชัน: เส้นหมึกหนา cel shading เส้นความเร็ว impact frame ตัวหนังสือเสียง (manga.js)
.claude/skills/
  check-computer/          /check-computer        เช็ก/เตรียมเครื่อง (ครั้งแรก/ย้ายเครื่อง)
  make-video/              /make-video <ชื่อ>     ทำ/แก้คลิป: ขั้นตอน ลำดับเรื่อง กฎการขยับ เสียง
projects/
  <ชื่อโปรเจกต์>/
    brand/brand.md         ข้อมูลสินค้า/เรื่อง ปัญหา จุดเด่น + บรรทัด "สไตล์: <ชื่อแนวใน styles/>"
    brand/voice.mp3        เสียงพากย์จาก ElevenLabs (ไม่ใส่ก็ได้)
    brand/music.mp3        เพลง (ไม่ใส่ก็ได้)
    brand/web/             ภาพที่หามาจากเว็บ + SOURCES.txt (ที่มาทุกภาพ)
    brand/sfx/<ชื่อ>.wav   เสียงเฉพาะโปรเจกต์ ทับของ sfx/ (ไม่ใส่ก็ได้)
    source/index.html      ต้นฉบับ 1080x1920 จังหวะ+เสียงทุกชิ้นอยู่ในตาราง ITEMS
    source/voice.js        ระดับเสียงพากย์ต่อเฟรม (สร้างด้วยคำสั่ง voice) ให้โมจิขยับปาก
    output/                สร้างอัตโนมัติ ลบแล้วสร้างใหม่ได้ (ไม่เข้า git)
      stills/              ภาพนิ่งตรวจงาน (ปกติวินาที 1, 5, 9, 14)
      <ชื่อโปรเจกต์>.mp4
```

ภาพตัวละครหรือคนจริง: ใช้เฉพาะภาพที่ตรวจเทียบกับรูปที่มีชื่อกำกับแล้ว ถ้าไม่มีภาพจะบอก ไม่ใส่ภาพเดา

กฎ: 1 คลิป = 1 โฟลเดอร์ใน `projects/` ตั้งชื่อ `ลูกค้า-หัวข้อ` ตัวพิมพ์เล็ก คั่นด้วย `-` เช่น `skillz-promo`

## ทำคลิปใหม่

1. พิมพ์ `/make-video <ชื่อ>` (ต่อท้ายด้วยสิ่งที่อยากได้ต่างจากปกติได้)
   ถ้ายังไม่มี `brand/brand.md` Claude จะสร้างแบบฟอร์มให้กรอกก่อน
2. ถ้ามีเสียงพากย์: ขอสคริปต์ → ทำเสียงใน ElevenLabs (โมเดล v3) → วางไฟล์ใน `brand/` แล้ว Claude จัดจังหวะภาพตามเสียงให้
3. ดูภาพนิ่ง ปรับจนพอใจ แล้วตอบ "เรนเดอร์ได้เลย"

ตัวอย่างคำสั่ง (ใส่รูปสินค้า/ภาพหน้าร้านไว้ใน `projects/<ชื่อ>/brand/` ก่อน ถ้ามี):

```
/make-video coffee-drip แนว cute-doodle ยาว 30 วิ ห้ามใส่ราคา
/make-video sword-of-coming แนว cute-doodle ให้โมจิเล่าเรื่อง ยาว 1 นาที ขอสคริปต์พากย์ด้วย
/make-video new-app แนว dark-tech
/make-video fight-promo แนว manga-action ยาว 15 วิ
```

ต่อท้ายได้: แนวภาพ (`styles/` หรือบรรยายเอง) · ความยาว · ให้โมจิเล่า/แต่งชุด · ขอสคริปต์พากย์ · ข้อห้าม/สิ่งที่อยากเน้น

## คำสั่ง

```
node render.mjs <ชื่อ> check      ตัวหนังสือล้นจอ / ออกนอก safe zone ของ TikTok-Reels / ล้นการ์ด / ทับกัน
node render.mjs <ชื่อ> stills     ภาพนิ่ง → output/stills/
node render.mjs <ชื่อ> video      → output/<ชื่อ>.mp4 (motion blur 8 ภาพย่อยต่อเฟรม + เสียง)
node render.mjs <ชื่อ> video 1    ร่างเร็ว ไม่มี motion blur
node render.mjs <ชื่อ> voice      brand/voice.mp3 → source/voice.js (ให้โมจิขยับปากตามเสียง)
node render.mjs <ชื่อ> video 8 4  กำหนดจำนวน Chrome ที่ช่วยกันถ่ายเอง (ปกติตั้งให้เองตามคอร์/RAM สูงสุด 8)
```

ความยาวคลิป: ปกติ 15 วินาที · ยาวกว่านั้นตั้งใน index.html ด้วย `window.DUR = 60` และ `window.STILLS = [...]` (เวลาภาพนิ่ง ฉากละภาพ)

ความเร็ว: คลิป 15 วินาที + motion blur ≈ 30 วินาที · 107 วินาที ≈ 4 นาที

เสียง: มี voice.mp3 → เล่นเต็มเสียง SFX ลดครึ่ง เพลงหลบตอนพูด · ไม่มีเพลง → ใช้แค่ SFX · ไม่มีทั้งคู่ → คลิปเงียบ · ชื่อ SFX ที่หาไฟล์ไม่เจอจะถูกข้ามและแจ้งใน log

ดูในเบราว์เซอร์: เปิด `source/index.html` เล่นวนพร้อมแถบเลื่อนเวลา หรือเติม `?t=5` เพื่อค้างที่วินาทีที่ 5
