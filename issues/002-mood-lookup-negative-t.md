# 002 · เรนเดอร์ล้ม: หา MOOD ไม่เจอตอน t ติดลบ

- วันที่: 2026-10-07
- tags: render, page
- โปรเจกต์: sword-of-coming
- ref: -

## ปัญหา
เรนเดอร์แบบ motion blur ล้มกลางทาง: `Cannot read properties of undefined` ในบรรทัดที่หา MOOD

## สาเหตุ
motion blur ถ่ายภาพย่อยก่อนเวลาเฟรม เฟรมแรกจึงเรียก `render(t)` ด้วย t ติดลบ `MOOD.filter(([at]) => t >= at).pop()` ได้ undefined

## วิธีแก้ที่ได้ผล
ทุกตารางที่หาค่าตามเวลาใช้ `(X.filter(([at]) => t >= at).pop() || X[0])[1]`
