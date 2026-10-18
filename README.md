# ระบบยื่นคำขอฝากถอนเงินผ่าน LINE

สหกรณ์ออมทรัพย์สาธารณสุขจังหวัดมุกดาหาร จำกัด

- รายละเอียดระบบ: [docs/specs/0001-line-deposit-withdrawal.md](docs/specs/0001-line-deposit-withdrawal.md)
- คำศัพท์: [GLOSSARY.md](GLOSSARY.md)
- เหตุผลการตัดสินใจ: [docs/adr/](docs/adr/)
- งานที่ต้องทำ: [.scratch/line-deposit-withdrawal/issues/](.scratch/line-deposit-withdrawal/issues/)

## โครงสร้าง

| โฟลเดอร์ | คืออะไร |
|---|---|
| `backend/` | หลังบ้าน Google Apps Script เขียนเป็น TypeScript แล้ว build เป็นไฟล์เดียวด้วย esbuild |
| `backend/src/app/` | ตัวรับคำสั่งและ action ทั้งหมด (กฎทางธุรกิจอยู่ที่นี่) |
| `backend/src/adapters/` | ตัวกลาง 7 ตัว: `ports.ts` คือ interface, `gas/` คือตัวจริง, `fake/` คือตัวปลอมสำหรับทดสอบ |
| `backend/test/` | การทดสอบผ่านตัวรับคำสั่ง (Vitest) |
| `apps/member/` | หน้าบ้านสมาชิก (LIFF) |
| `apps/staff/` | หน้าเว็บเจ้าหน้าที่ |
| `apps/lib/` | โค้ดที่หน้าบ้านทั้งสองใช้ร่วมกัน |
| `shared/` | สัญญา API ที่หน้าบ้านและหลังบ้านใช้ร่วมกัน |

## คำสั่งที่ใช้บ่อย

```bash
npm install
```

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run dev:member
```

## พัฒนาบนเครื่องด้วยหลังบ้านจำลอง

`npm run dev:api` เปิดหลังบ้านจำลองที่ http://localhost:8787 ใช้ตัวรับคำสั่งตัวจริงกับข้อมูลในหน่วยความจำ (หายเมื่อปิด) มีผู้ดูแลระบบทดลอง `admin` / `admin-password-1` และ LIFF token ทดลอง `dev-line-token` การนำเข้าข้อมูลบัญชีเงินฝากในหลังบ้านจำลองรับเฉพาะไฟล์ .csv (หลังบ้านจริงรับ .xlsx/.xls/.csv ผ่าน Google Drive)

1. สร้างไฟล์ `apps/staff/.env.development.local` ที่มี `VITE_GAS_URL=http://localhost:8787` และ `apps/member/.env.development.local` ที่มี `VITE_GAS_URL=http://localhost:8787` กับ `VITE_DEV_ID_TOKEN=dev-line-token` (หน้าสมาชิกจะข้าม LIFF และใช้ token ทดลองแทน เฉพาะตอน `npm run dev:member`) สมาชิกทดลองผูกบัญชีด้วยรหัสสมาชิก `123` และเลขบัตร `1101700230708`
2. รันหลังบ้านจำลอง:

   ```bash
   npm run dev:api
   ```

3. รันหน้าเว็บเจ้าหน้าที่ (http://localhost:5174) หรือหน้าสมาชิก (http://localhost:5173) ในอีกเทอร์มินัล

   ```bash
   npm run dev:staff
   ```

   ```bash
   npm run dev:member
   ```

## ตั้งค่าชุดทดสอบ (ทำครั้งเดียว)

ชุดทดสอบและชุดใช้จริงแยกกันทุกส่วน ขั้นตอนนี้ใช้กับชุดทดสอบ ชุดใช้จริงทำแบบเดียวกันใน ticket 13

### 1. Google Sheets และ Apps Script

1. สร้าง Google Spreadsheet ใหม่ชื่อ `ฝากถอนออนไลน์ (ทดสอบ)` แล้วจด Spreadsheet ID จาก URL
2. เข้า <https://script.google.com> สร้างโปรเจกต์ใหม่ชื่อ `ฝากถอนออนไลน์ (ทดสอบ)` แล้วจด Script ID จาก Project Settings
3. เปิด Google Apps Script API ที่ <https://script.google.com/home/usersettings>
4. ล็อกอิน clasp ด้วย Gmail ที่เป็นเจ้าของระบบ (ทำเองในเทอร์มินัล):

   ```bash
   npx clasp login
   ```

5. คัดลอก `backend/.clasp.test.example.json` เป็น `backend/.clasp.test.json` แล้วใส่ Script ID
6. push โค้ด:

   ```bash
   npm run push:test
   ```

7. ใน Apps Script editor → Project Settings → Script Properties ตั้งค่า
   - `SPREADSHEET_ID` = Spreadsheet ID จากข้อ 1
   - `LINE_LOGIN_CHANNEL_ID` = Channel ID ของ LINE Login channel (ข้อ 2 ด้านล่าง)
8. ในตัวแก้โค้ด เลือกฟังก์ชัน `checkScriptProperties` แล้วกด Run ดู log ว่าตั้งครบ ครั้งแรกระบบจะขออนุญาตสิทธิ์ Sheets, Drive (เฉพาะไฟล์ที่ระบบสร้าง) และการเรียกเว็บภายนอก ถ้าภายหลังเพิ่มสิทธิ์ใหม่ใน `appsscript.json` ต้องรันฟังก์ชันใดก็ได้ใน editor เพื่ออนุญาตอีกครั้ง
9. สร้างผู้ดูแลระบบคนแรก: ตั้ง Script Properties `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_FULL_NAME`, `INITIAL_ADMIN_PASSWORD` (อย่างน้อย 10 ตัวอักษร) แล้วรันฟังก์ชัน `createFirstAdministrator` ระบบจะลบ `INITIAL_ADMIN_PASSWORD` ออกให้เมื่อสร้างสำเร็จ
10. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone แล้วจด URL ที่ลงท้ายด้วย `/exec`

**ทุกครั้งที่ push โค้ดใหม่** ให้ Deploy → Manage deployments → แก้ deployment เดิม → Version: New version เพื่อให้ URL เดิมได้โค้ดใหม่ (ถ้าสร้าง deployment ใหม่จะได้ URL ใหม่)

### 2. LINE

1. ที่ <https://developers.line.biz> ใน Provider ของสหกรณ์ สร้าง **LINE Login channel** สำหรับชุดทดสอบ
2. ใน channel นั้น เพิ่ม LIFF app: Size = Full, Scope = `openid` และ `profile`, Endpoint URL = URL ของ Cloudflare Pages หน้าสมาชิก (ข้อ 3) แล้วจด LIFF ID
3. นำ Channel ID ไปใส่ Script Property `LINE_LOGIN_CHANNEL_ID`

### 3. หน้าบ้านบน Cloudflare Pages

1. คัดลอก `apps/member/.env.example` เป็น `apps/member/.env.test` แล้วใส่ `VITE_LIFF_ID`, `VITE_GAS_URL` และ `VITE_COOP_PHONE` (เบอร์ที่แสดงในหน้าติดต่อสหกรณ์)
2. คัดลอก `apps/staff/.env.example` เป็น `apps/staff/.env.test` แล้วใส่ `VITE_GAS_URL`
3. ล็อกอิน Cloudflare ครั้งแรก (ทำเองในเทอร์มินัล):

   ```bash
   npx wrangler login
   ```

4. build และ deploy ทั้งสองหน้า:

   ```bash
   npm run pages:test
   ```

### 4. Rich Menu ของ LINE OA

สร้างใน LINE Official Account Manager → Rich menus → Create ใช้ template แบบ 6 ช่อง (2 แถว × 3 คอลัมน์) ตั้ง Display: Show และให้แต่ละช่องเป็น Action `Link` ไปที่ LIFF URL ตามตาราง (แทน `<LIFF ID>` ด้วย LIFF ID ของชุดนั้น)

| ช่อง | ข้อความบนปุ่ม | Link |
|---|---|---|
| 1 | ฝากเงิน | `https://liff.line.me/<LIFF ID>?page=deposit` |
| 2 | ถอนเงิน | `https://liff.line.me/<LIFF ID>?page=withdraw` |
| 3 | ประวัติคำขอ | `https://liff.line.me/<LIFF ID>?page=history` |
| 4 | บัญชีรับเงินของฉัน | `https://liff.line.me/<LIFF ID>?page=payout` |
| 5 | ข้อมูลบัญชี / เปลี่ยน PIN | `https://liff.line.me/<LIFF ID>?page=account` |
| 6 | ติดต่อสหกรณ์ | `https://liff.line.me/<LIFF ID>?page=contact` |

สมาชิกที่ยังไม่ผูกบัญชี กดปุ่มใดก็จะไปหน้าผูกบัญชีก่อน แล้วกลับมาหน้าที่กดหลังตั้ง PIN เสร็จ

### 5. ตรวจว่าใช้งานได้

- นำเข้าข้อมูลบัญชีเงินฝากทดลองจากหน้าเว็บเจ้าหน้าที่
- เปิด LIFF URL (`https://liff.line.me/<LIFF ID>`) ใน LINE จะต้องเห็นหน้านโยบายความเป็นส่วนตัว ผูกบัญชีด้วยข้อมูลทดลอง ตั้ง PIN แล้วเห็นบัญชีเงินฝากในเมนูข้อมูลบัญชี
- เปิดหน้าเว็บเจ้าหน้าที่ แล้วเข้าสู่ระบบด้วยผู้ดูแลระบบคนแรกได้
