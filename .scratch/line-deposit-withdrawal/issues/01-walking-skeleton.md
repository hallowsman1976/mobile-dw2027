# 01: โครงระบบขั้นต่ำที่ทำงานได้ (walking skeleton)

**What to build:** สมาชิกเปิด LIFF ของชุดทดสอบใน LINE แล้วหน้าจอเรียกหลังบ้าน Apps Script ด้วย action `me` หลังบ้านตรวจ LIFF ID token กับ LINE จริง แล้วตอบว่า "ยังไม่ผูกบัญชี" พร้อมชื่อที่แสดงใน LINE ส่วนหน้าเว็บเจ้าหน้าที่เปิดได้และเรียกหลังบ้านได้ ticket นี้วางโครงสร้างที่ทุก ticket ถัดไปใช้ต่อ ได้แก่ ทางเข้า `doPost` → ตัวรับคำสั่งแต่ละ action → ตัวกลาง (adapter) 6 ตัว ดูใน spec `docs/specs/0001-line-deposit-withdrawal.md` และ ADR 0002

**Blocked by:** None (can start immediately)

**Status:** in-progress (โค้ดเสร็จแล้ว เหลือตั้งค่าชุดทดสอบจริง)

- [x] โปรเจกต์เป็น git repo มีหน้าบ้านสองชุด (LIFF สมาชิก และเว็บเจ้าหน้าที่) เป็น Vite + TypeScript ไม่ใช้ framework
- [x] โค้ด Apps Script เขียนเป็น TypeScript, build ด้วย esbuild และ push ด้วย clasp ได้ด้วยคำสั่งเดียว
- [x] `doPost` รับ JSON แบบ `text/plain` รูปแบบ `{ action, auth, payload }` และตอบ `{ ok, data }` หรือ `{ ok: false, error: { code, message } }` โดย message เป็นภาษาไทย ถ้าไม่รู้จัก action ให้ตอบ error
- [x] มี interface ของตัวกลางทั้ง 6 (ที่เก็บข้อมูล, ที่เก็บไฟล์, ตัวตรวจตัวตน LINE, ตัวตรวจสลิป, ตัวส่งข้อความ, นาฬิกา) พร้อมตัวปลอมในหน่วยความจำ ส่วนตัวจริงที่ต้องมีใน ticket นี้คือตัวตรวจตัวตน LINE และนาฬิกา
- [x] Vitest รันการทดสอบ action `me` ผ่านตัวรับคำสั่ง โดยใช้ตัวปลอม: token ถูกต้องได้ "ยังไม่ผูกบัญชี", token ผิดได้ error
- [x] ค่าลับอ่านจาก Script Properties ส่วน URL ของ Apps Script และ LIFF ID ส่งให้หน้าบ้านเป็นตัวแปรตอน build
- [ ] ชุดทดสอบใช้งานได้: LIFF app, Apps Script deployment, Spreadsheet และโฟลเดอร์ Drive ของชุดทดสอบ และหน้าบ้านทั้งสองชุดอยู่บน Cloudflare Pages — รอสหกรณ์สร้างบัญชีและตั้งค่าตาม README
- [x] README อธิบายวิธี build, ทดสอบ และ deploy ชุดทดสอบ
