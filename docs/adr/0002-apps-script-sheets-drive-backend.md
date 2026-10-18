# หลังบ้านใช้ Google Apps Script + Google Sheets + Google Drive

หลังบ้านเป็น Google Apps Script web app ใช้ Google Sheets เป็นฐานข้อมูล และเก็บเอกสารกับสลิปใน Google Drive ของ Gmail ส่วนตัว (ไม่ใช่ Google Workspace) หน้าบ้านเป็น Vite + TypeScript ไม่ใช้ framework ทำงานใน LIFF ตัวเลือกนี้ชนะ Node.js + PostgreSQL แม้สหกรณ์จะมีทีม IT และงบค่าเซิร์ฟเวอร์ เพราะไม่ต้องดูแลเซิร์ฟเวอร์ เชื่อม Drive ได้ทันที และรองรับสมาชิกไม่เกิน 3,000 คนได้เพียงพอ

## Consequences

- Sheets ไม่มี transaction ทุกการเขียนที่ต้องตรวจเงื่อนไขก่อน (เช่น คำขอถอนเงินค้างได้ครั้งละหนึ่งรายการ หรือเลขอ้างอิงสลิปห้ามซ้ำ) ต้องอยู่ภายใต้ LockService
- Apps Script อ่าน HTTP header ของคำขอที่เข้ามาไม่ได้ จึงตรวจ X-Line-Signature ของ webhook ไม่ได้ และต้องส่ง token ผ่าน body แทน header
- ข้อมูลทั้งหมดผูกกับ Gmail ส่วนตัวของเจ้าหน้าที่คนหนึ่ง (เลือกแทนการเปิด Gmail กลางในนามสหกรณ์) ถ้าเจ้าหน้าที่คนนั้นลาออก หรือเสียการเข้าถึงบัญชี ระบบและเอกสารจะใช้งานไม่ได้ทั้งหมด และสหกรณ์ไม่ได้เป็นเจ้าของข้อมูลสมาชิกโดยตรง
- หน้าบ้านโฮสต์บน Cloudflare Pages และเรียก Apps Script ด้วย POST แบบ text/plain เพื่อเลี่ยง CORS preflight
- รหัสผ่านของเจ้าหน้าที่ต้องเก็บเองใน Sheets เพราะเลือกไม่ใช้ Sign in with Google
