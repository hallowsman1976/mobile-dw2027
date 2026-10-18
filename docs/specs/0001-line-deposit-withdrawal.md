---
status: ready-for-agent
---

# ระบบยื่นคำขอฝากถอนเงินผ่าน LINE

## Problem Statement

สมาชิกของสหกรณ์ออมทรัพย์สาธารณสุขจังหวัดมุกดาหาร จำกัด ส่วนใหญ่ทำงานในหน่วยบริการสาธารณสุขที่กระจายอยู่ทั่วจังหวัด ถ้าจะถอนเงินจากบัญชีเงินฝาก ต้องกรอกแบบฟอร์มกระดาษ เซ็นชื่อ แนบสำเนาเอกสาร แล้วส่งหรือนำมายื่นที่สำนักงานด้วยตนเอง ส่วนการฝากเงินด้วยการโอนเข้าบัญชีสหกรณ์ ก็ต้องส่งสลิปแจ้งเจ้าหน้าที่ผ่านช่องทางที่ไม่เป็นระบบ ทำให้สลิปตกหล่น ตรวจซ้ำไม่ได้ และสมาชิกไม่รู้ว่าเรื่องของตนถึงขั้นไหนแล้ว

ฝั่งเจ้าหน้าที่ไม่มีที่รวมคำขอไว้ในที่เดียว ไม่มีลำดับการตรวจและอนุมัติที่ชัดเจน และตรวจไม่ได้ง่าย ๆ ว่าสลิปเป็นของจริง โอนเข้าบัญชีสหกรณ์จริง หรือเคยถูกใช้แจ้งฝากมาแล้ว

## Solution

สมาชิกยื่น**คำขอถอนเงิน**และ**คำขอฝากเงิน**ผ่าน LINE OA ของสหกรณ์ (หน้าจอ LIFF) ได้ตลอด 24 ชั่วโมง

- ครั้งแรกสมาชิก**ผูกบัญชี LINE** ด้วยรหัสสมาชิกและเลขบัตรประชาชน ครั้งต่อไปเข้าใช้ได้ทันทีจาก LINE
- ข้อมูลบัญชีเงินฝากเติมให้อัตโนมัติ
- ถอนเงินเข้า**บัญชีรับเงิน**ในชื่อตนเองที่ลงทะเบียนไว้ล่วงหน้า โดยเซ็นลายมือชื่อบนจอและยืนยันด้วย PIN
- ฝากเงินโดยแนบสลิป ซึ่งระบบตรวจกับบริการตรวจสลิปทันที
- สมาชิกได้ข้อความแจ้งใน LINE ทุกครั้งที่สถานะคำขอเปลี่ยน

เจ้าหน้าที่ใช้หน้าเว็บสำหรับเจ้าหน้าที่ในการ

- ตรวจคำขอและเอกสาร
- ให้**ผู้ตรวจ**และ**ผู้อนุมัติ**คนละคนกันยืนยันคำขอถอนเงิน
- export รายการที่อนุมัติแล้วของแต่ละวันไปบันทึกใน**ระบบหลัก**และโอนเงิน แล้วปิดคำขอเป็น**เสร็จสิ้น**

ระบบนี้**ไม่ตัดหรือเพิ่มยอดเงินจริง** (ADR 0001) และสร้างบน Google Apps Script + Google Sheets + Google Drive (ADR 0002)

## User Stories

### การผูกบัญชี LINE และการเข้าใช้

1. As a สมาชิก, I want to open the system from the LINE OA rich menu, so that I don't need to install another app.
2. As a สมาชิก, I want to bind my LINE account by entering my member code and national ID once, so that I never have to log in again on this phone.
3. As a สมาชิก, I want to type my member code without leading zeros (e.g. "123"), so that the system pads it to "00123" for me.
4. As a สมาชิก, I want a clear error when my member code and national ID don't match, so that I know to check what I typed.
5. As a สมาชิก, I want to read and accept the privacy policy before binding, so that I know how my documents and personal data will be used.
6. As a สมาชิก, I want to set a 6-digit PIN while binding, so that someone who borrows my phone cannot withdraw money.
7. As a สมาชิก who is not yet bound, I want any rich menu button to take me to the binding screen first, so that I'm never stuck on a screen I can't use.
8. As a สมาชิก, I want to be blocked from binding if my member code is already bound to another LINE account, and told to contact the coop, so that nobody can take over my account.
9. As a สมาชิก, I want binding to be temporarily locked after too many failed attempts, so that nobody can guess my national ID.
10. As a สมาชิก, I want to change my PIN by entering the old one, so that I can keep it secret.
11. As a สมาชิก who has entered the wrong PIN 5 times, I want withdrawals to be locked until the coop resets my PIN, so that a thief cannot keep guessing.
12. As a สมาชิก whose PIN was reset by the coop, I want to set a new PIN through LINE, so that I don't have to go to the office.
13. As a สมาชิก who has changed phone or LINE account, I want the coop to remove my old binding, so that I can bind my new LINE account.

### บัญชีเงินฝาก

14. As a สมาชิก, I want to see all my deposit accounts with number, name and type (savings or special savings), so that I can confirm the coop's records are correct.
15. As a สมาชิก with only one deposit account, I want it selected automatically on every form, so that I have fewer steps.
16. As a สมาชิก with several deposit accounts, I want to choose which account each request is for, so that money goes in or out of the right account.
17. As a สมาชิก, I want a closed deposit account to stop appearing in my list, so that I can't pick it by mistake.

### บัญชีรับเงิน

18. As a สมาชิก, I want to register a payout account (bank, account number, account name) once, with a copy of my ID card, a copy of my deposit account book and a copy of the payout account book, so that I don't have to attach these documents on every withdrawal.
19. As a สมาชิก, I want to attach JPG, PNG or PDF files no larger than 5MB each, so that I can use photos taken on my phone.
20. As a สมาชิก, I want to see whether my payout account is awaiting review, approved or rejected (with the reason), so that I know when I can withdraw.
21. As a สมาชิก, I want a LINE message when my payout account is approved or rejected, so that I don't have to keep checking.
22. As a สมาชิก, I want to register a new payout account when I change banks, so that I can keep withdrawing.
23. As a สมาชิก, I want to stop using an old payout account, so that money can't be sent to it again.

### คำขอถอนเงิน

24. As a สมาชิก, I want the withdrawal form to fill in my account number, account name and account type automatically, so that I can't type them wrong.
25. As a สมาชิก, I want to pick from my approved payout accounts only, so that money only goes to an account in my own name.
26. As a สมาชิก, I want to enter an amount from 1,000 to 100,000 baht and get an error outside that range, so that I know the coop's limits straight away.
27. As a สมาชิก, I want to sign on the screen once, so that my signature serves as both the account owner's and the recipient's signature.
28. As a สมาชิก, I want to clear and redo my signature, so that a messy signature doesn't get rejected.
29. As a สมาชิก, I want to confirm the withdrawal with my PIN, so that only I can submit it.
30. As a สมาชิก, I want to be told that I can't submit another withdrawal from an account that already has one open, so that I don't send duplicates.
31. As a สมาชิก, I want a request number and a summary when I submit, so that I can quote it if I call the coop.
32. As a สมาชิก submitting after 15:30 or on a non-business day, I want to be told the business day it will be processed, so that I know when to expect the money.
33. As a สมาชิก, I want to cancel my withdrawal while it is still awaiting review, so that I can fix a mistake.

### คำขอฝากเงิน

34. As a สมาชิก, I want the deposit form to fill in my account number, account name and account type automatically, so that I can't type them wrong.
35. As a สมาชิก, I want to pick the transfer date and time with a date picker, so that I enter it in the right format.
36. As a สมาชิก, I want to enter the deposit amount (at least 100 baht), so that the coop knows how much I sent.
37. As a สมาชิก, I want to attach a JPG or PNG slip of up to 5MB, so that I can use the screenshot from my banking app.
38. As a สมาชิก, I want the slip checked as soon as I submit, so that I find out about problems straight away.
39. As a สมาชิก, I want a slip that has already been used, or wasn't paid into the coop's Krungthai account, to be refused with a clear reason, so that I know to check which slip I picked.
40. As a สมาชิก whose amount or time doesn't match the slip, I want the system to show me the slip's values and ask me to confirm them, so that the request is correct without retyping.
41. As a สมาชิก, I want my deposit request accepted even when the slip service is down, so that I don't have to try again later.
42. As a สมาชิก, I want to cancel my deposit request while it is still awaiting review, so that I can fix a mistake.

### การติดตามคำขอ

43. As a สมาชิก, I want to see my past requests with their status, so that I can follow everything in one place.
44. As a สมาชิก, I want a LINE message every time a request's status changes, so that I don't have to keep checking.
45. As a สมาชิก whose request was rejected, I want to see the reason, so that I can fix it and submit again.
46. As a สมาชิก, I want a "contact the coop" button, so that I can call or message staff when something goes wrong.

### เจ้าหน้าที่: เข้าระบบและบัญชีเจ้าหน้าที่

47. As a เจ้าหน้าที่, I want to log in to the staff website with a username and password, so that only staff can see member data.
48. As a เจ้าหน้าที่, I want my session to expire after 8 hours, so that a computer left open doesn't stay logged in.
49. As a เจ้าหน้าที่, I want my account locked for 15 minutes after 5 wrong passwords, so that nobody can guess it.
50. As a ผู้ดูแลระบบ, I want to create, disable and reset passwords for staff accounts, and give them the checker, approver or admin role, so that I control who can do what.
51. As a ผู้ดูแลระบบ, I want to give one person both the checker and approver roles, so that a small office can still run the system.

### เจ้าหน้าที่: ตรวจและอนุมัติ

52. As a เจ้าหน้าที่, I want a LINE message in the staff group when a new request or payout account registration comes in, without any national ID numbers, so that I can act quickly without exposing personal data.
53. As a ผู้ตรวจ, I want a list of requests I can filter by status, type and date, so that I can work through the queue.
54. As a ผู้ตรวจ, I want to open a request and see its details, the signature, the slip and the slip check result, so that I can check everything on one screen.
55. As a ผู้ตรวจ, I want to see the payout account's documents from the withdrawal screen, so that I can confirm the payout account belongs to the member.
56. As a ผู้ตรวจ, I want to pass a withdrawal on to an approver, so that two people sign off on money going out.
57. As a ผู้ตรวจ, I want to approve a deposit request directly, so that deposits don't need a second person.
58. As a ผู้ตรวจ, I want to reject a request with a required reason, so that the member knows what to fix.
59. As a ผู้อนุมัติ, I want to see only withdrawals awaiting approval, so that I know what is waiting for me.
60. As a ผู้อนุมัติ, I want to approve or reject a withdrawal with a reason, so that I can stop anything suspicious.
61. As a ผู้อนุมัติ, I want to be blocked from approving a withdrawal I checked myself, so that two different people are always involved.
62. As a ผู้ตรวจ, I want to approve or reject payout account registrations, so that withdrawals only go to verified accounts.
63. As a เจ้าหน้าที่, I want a PDF in the coop's withdrawal form layout, with the member's signature, created for every approved withdrawal, so that I can print and file it.

### เจ้าหน้าที่: บันทึกเข้าระบบหลักและปิดคำขอ

64. As a เจ้าหน้าที่, I want to export the day's approved requests to Excel, split into deposits and withdrawals, so that I can record them in the core system and transfer the money in one batch.
65. As a เจ้าหน้าที่, I want to mark approved requests as completed one at a time or as a whole batch, so that members get notified once the work is done.
66. As a เจ้าหน้าที่, I want to see the business day each request is due to be processed, so that I handle them in the right order.

### ผู้ดูแลระบบ: ข้อมูลและการดูแล

67. As a ผู้ดูแลระบบ, I want to upload the Excel export from the core system to replace all deposit account data, so that the forms show current information.
68. As a ผู้ดูแลระบบ, I want an import file with missing columns or a bad member code or national ID to be rejected with the row numbers, so that bad data never replaces good data.
69. As a ผู้ดูแลระบบ, I want existing LINE bindings and payout accounts to survive an import, so that members don't have to bind again.
70. As a ผู้ดูแลระบบ, I want to reset a member's PIN, so that a locked-out member can withdraw again.
71. As a ผู้ดูแลระบบ, I want to remove a member's LINE binding, so that a member who changed LINE account can bind again.
72. As a ผู้ดูแลระบบ, I want to maintain the coop's list of holidays, so that the processing business day is calculated correctly.
73. As a ผู้ดูแลระบบ, I want to see an audit log of who viewed which document and who changed which status and when, so that we can investigate problems and meet PDPA.
74. As a ผู้ดูแลระบบ, I want documents and slips deleted automatically 10 years after the request ends, so that we don't keep personal data longer than necessary.

## Implementation Decisions

### โครงสร้างระบบ

- **หน้าบ้านสมาชิก**: Vite + TypeScript ไม่ใช้ framework ทำงานใน LIFF ใช้ LIFF SDK ใช้ Flatpickr เลือกวันเวลา และมี signature pad
- **หน้าเว็บเจ้าหน้าที่**: Vite + TypeScript ไม่ใช้ framework เปิดในเบราว์เซอร์ทั่วไป ไม่ผ่าน LIFF
- หน้าบ้านทั้งสองชุด build แยกกันและโฮสต์บน Cloudflare Pages
- **หลังบ้าน**: Google Apps Script web app เขียนเป็น TypeScript แล้ว build ด้วย esbuild ก่อน push ด้วย clasp
- **ข้อมูล**: Google Sheets **ไฟล์ข้อมูล**: Google Drive ทั้งสองอยู่ใน Gmail ส่วนตัวของเจ้าหน้าที่ และแชร์เป็น Editor ให้กรรมการอีก 1 คน

### เลเยอร์ของหลังบ้าน

1. **ทางเข้า (entry)**: `doPost` รับ body ที่เป็น JSON ส่งมาเป็น `text/plain` (เพื่อเลี่ยง CORS preflight) มีรูปแบบ `{ action, auth, payload }` แล้วส่งต่อให้ handler ตามชื่อ action และตอบกลับ `{ ok: true, data }` หรือ `{ ok: false, error: { code, message } }` โดย message เป็นภาษาไทยที่แสดงให้ผู้ใช้ได้เลย
2. **Action handlers**: กฎทางธุรกิจทั้งหมดอยู่ที่นี่ และเรียกโลกภายนอกผ่าน adapter เท่านั้น
3. **Adapters**: 7 ตัวตามตาราง แต่ละตัวมีตัวจริง (ใช้ Google หรือ LINE) และตัวปลอมในหน่วยความจำสำหรับทดสอบ

| Adapter | หน้าที่ |
|---|---|
| ที่เก็บข้อมูล | อ่านและเขียนตารางใน Sheets ทุกการเขียนที่มีเงื่อนไขทำภายใต้ script lock และเก็บ session ของเจ้าหน้าที่ |
| ที่เก็บไฟล์ | บันทึกและอ่านไฟล์ใน Drive และสร้าง PDF จาก Google Docs ต้นแบบ |
| ตัวตรวจตัวตน LINE | ตรวจ LIFF ID token กับ LINE verify endpoint แล้วได้ LINE userId |
| ตัวตรวจสลิป | เรียก SlipOK |
| ตัวส่งข้อความ | push message ผ่าน Messaging API ไปยังสมาชิก และไปยังกลุ่ม LINE ของเจ้าหน้าที่ |
| นาฬิกา | เวลาปัจจุบัน (Asia/Bangkok) |
| ตัวสุ่ม | UUID สำหรับ salt และ session token (`Utilities.getUuid`) |

- ค่าลับ (secret) ได้แก่ channel access token, LIFF channel ID, SlipOK API key, หมายเลขบัญชีรับโอนของสหกรณ์ และรหัสโฟลเดอร์ Drive เก็บใน Script Properties
- ค่าที่เจ้าหน้าที่ปรับได้ เช่น เวลาตัดรอบ 15:30 เก็บในชีตตั้งค่า

### การยืนยันตัวตน

- **สมาชิก**: ทุก action ส่ง LIFF ID token มาใน `auth` หลังบ้านตรวจ token กับ LINE ทุกครั้ง แล้วหาการผูกบัญชีจาก LINE userId ถ้า token หมดอายุ หน้าบ้านให้ LIFF login ใหม่
- **รหัสสมาชิก**: ตัดช่องว่าง รับเฉพาะตัวเลข 1–5 หลัก แล้วเติม 0 ข้างหน้าให้ครบ 5 หลัก ถ้ามีเกิน 5 หลักหรือมีอักขระอื่นให้ปฏิเสธ
- **การผูกบัญชี LINE**:
  - รหัสสมาชิกและเลขบัตรประชาชนต้องตรงกับบัญชีเงินฝากอย่างน้อย 1 แถว
  - LINE userId 1 บัญชีผูกกับสมาชิกได้ 1 คน และสมาชิก 1 คนมีการผูกที่ใช้งานอยู่ได้ 1 รายการ
  - ผูกผิดเกิน 5 ครั้งต่อ LINE userId ภายใน 1 ชั่วโมง ให้ล็อก 1 ชั่วโมง (ตัวนับเก็บใน CacheService) การกรอกผิดรูปแบบไม่นับ นับเฉพาะรหัสสมาชิกกับเลขบัตรที่ไม่ตรงกัน
  - ตรวจว่ารหัสสมาชิกผูกกับ LINE อื่นอยู่แล้วหรือไม่ หลังจากข้อมูลตรงกันแล้วเท่านั้น เพื่อไม่ให้ใช้เดาว่ารหัสสมาชิกใดผูกแล้ว
  - บันทึกเวอร์ชันนโยบายความเป็นส่วนตัวและเวลาที่สมาชิกกดยินยอม ต้องยอมรับฉบับปัจจุบัน (`PRIVACY_POLICY_VERSION`) จึงผูกได้
  - action ของสมาชิกที่ต้องผูกบัญชีก่อน ตอบ error `NOT_BOUND` เมื่อยังไม่ผูก
- **PIN**: 6 หลัก ห้ามเลขซ้ำกันทั้งหมดหรือเลขเรียงขึ้น/ลง (เช่น 111111, 123456, 890123, 654321) เก็บเป็น SHA-256 ผสม salt ของแต่ละคน วนแฮช 10,000 รอบ ใช้ยืนยันตอนยื่นคำขอถอนเงินและตอนเปลี่ยน PIN (ต้องใช้ PIN เดิม และ PIN ใหม่ต้องไม่ซ้ำ PIN เดิม) ผิดสะสม 5 ครั้งให้ล็อกจนกว่าผู้ดูแลระบบจะรีเซ็ต ข้อความแจ้งบอกจำนวนครั้งที่เหลือ กรอกถูกแล้วนับใหม่ การรีเซ็ตล้าง PIN และสมาชิกตั้ง PIN ใหม่ผ่าน LINE ได้ทันที
- **เจ้าหน้าที่**:
  - ชื่อผู้ใช้และรหัสผ่านอย่างน้อย 10 ตัวอักษร เก็บแบบเดียวกับ PIN
  - ล็อกอินได้แล้วรับ session token แบบสุ่ม อายุ 8 ชั่วโมง ส่งมาใน `auth` ทุกครั้ง หลังบ้านเก็บเฉพาะแฮชของ token ไว้ใน UserProperties ของบัญชีที่ deploy (CacheService เก็บได้นานสุด 6 ชั่วโมง ไม่พอ) และ session ใช้ไม่ได้ทันทีเมื่อปิดบัญชีหรือรีเซ็ตรหัสผ่าน
  - ผิด 5 ครั้งล็อก 15 นาที
  - ชื่อผู้ใช้เป็นตัวพิมพ์เล็ก a-z, 0-9, จุด, ขีดกลาง, ขีดล่าง ยาว 3–32 ตัว
  - ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คนเสมอ
  - ผู้ดูแลระบบคนแรกสร้างด้วยฟังก์ชัน `createFirstAdministrator` จาก editor ของ Apps Script
  - ทุก action ของเจ้าหน้าที่ตรวจบทบาทก่อนทำงาน

### หน้า LIFF ของสมาชิก

Rich Menu ทุกปุ่มเปิด LIFF URL เดียวกันพร้อม `?page=` (deposit, withdraw, history, payout, account, contact) หน้าบ้านสลับหน้าด้วย history API โดยไม่โหลด LIFF ใหม่ สมาชิกที่ยังไม่ผูกบัญชีผ่าน 3 ขั้น (ยินยอมนโยบาย → ผูกบัญชี → ตั้ง PIN) แล้วไปหน้าที่กด

### Actions

**สมาชิก**
- `me`: ดูสถานะการผูก ข้อมูลสมาชิก และสถานะ PIN (ตั้งแล้ว / ถูกล็อก)
- `setPin`, `changePin`: ตั้ง PIN ครั้งแรกหรือหลังรีเซ็ต และเปลี่ยน PIN
- `bindLineAccount`: ผูกบัญชี LINE
- `listMyAccounts`: ดูบัญชีเงินฝากของตนเอง
- `registerPayoutAccount`, `listMyPayoutAccounts`, `retirePayoutAccount`: จัดการบัญชีรับเงิน
- `submitWithdrawalRequest`: ยื่นคำขอถอนเงิน
- `checkSlip`: ตรวจสลิปโดยยังไม่สร้างคำขอ
- `submitDepositRequest`: ยื่นคำขอฝากเงิน
- `cancelRequest`: ยกเลิกคำขอ
- `listMyRequests`: ดูประวัติคำขอ

**เจ้าหน้าที่**
- `staffLogin`, `staffLogout`, `staffMe`
- `listRequests`, `getRequest`: ดูคำขอ (เจ้าหน้าที่ทุกบทบาท) กรองตามสถานะ ประเภท และวันทำการ
- `listHolidays`: วันหยุด (เจ้าหน้าที่ทุกบทบาท)
- `viewDocument`: ส่งไฟล์กลับเป็น base64 หลังตรวจสิทธิ์ และบันทึก audit log ทุกครั้ง
- `reviewRequest`: ผู้ตรวจผ่านหรือปฏิเสธ
- `approveRequest`: ผู้อนุมัติอนุมัติหรือปฏิเสธ
- `completeRequests`: ปิดเป็นเสร็จสิ้น ทีละรายการหรือทั้งชุด
- `listPayoutAccountsForReview`, `reviewPayoutAccount`: คิวและการตรวจบัญชีรับเงิน (ผู้ตรวจ)
- `exportApproved`: export รายการที่อนุมัติแล้ว
- `importAccounts`: นำเข้าข้อมูลจากระบบหลัก
- `listStaff`, `createStaff`, `updateStaff`, `resetStaffPassword`, `lookupMember`, `resetPin`, `unbindLineAccount`, `addHoliday`, `removeHoliday`, `listAuditLog`: งานของผู้ดูแลระบบ
- `listAuditLog`: ใหม่สุดก่อน กรองตามช่วงวันที่ (เวลาไทย) และค้นผู้กระทำหรือเป้าหมายด้วยข้อความบางส่วน (ไม่สนตัวพิมพ์) หน้าละ 50 รายการด้วย `offset` อ่านจากท้ายชีตขึ้นไปทีละชุดและหยุดเมื่อเลยวันที่เริ่มต้น เพื่อไม่ต้องอ่านทั้งตาราง

**Webhook**: `doPost` ที่มี `events` และไม่มี action ถือว่าเป็น webhook ของ LINE จัดการเฉพาะ event `join` ของกลุ่ม เพื่อบันทึก groupId (และชื่อกลุ่ม) ไว้ให้ผู้ดูแลระบบเลือกเป็นกลุ่มแจ้งเตือนเจ้าหน้าที่ และไม่สนใจ event อื่นทั้งหมด เพราะ Apps Script ตรวจ X-Line-Signature ไม่ได้ (ADR 0002) ใครก็ส่ง join ปลอมได้ การตั้งกลุ่มจึงต้องส่งข้อความทดสอบเข้ากลุ่มนั้นสำเร็จก่อน

**การตั้งค่าการแจ้งเตือน** (ผู้ดูแลระบบ): `lineGroupSettings`, `updateNotificationSettings` เลือกกลุ่มแจ้งเตือนเจ้าหน้าที่ และลิงก์หน้าเว็บเจ้าหน้าที่ (https) ที่ต่อท้ายข้อความในกลุ่ม

### ตารางข้อมูล (แต่ละตารางคือหนึ่งชีต)

คอลัมน์ใหม่เพิ่มต่อท้ายเสมอ ระบบเติมหัวคอลัมน์ที่ขาดในชีตเดิมให้เองเมื่อเขียนครั้งแรก


- **บัญชีเงินฝาก** (ถูกแทนที่ทั้งตารางทุกครั้งที่นำเข้า): ลำดับ, หมายเลขบัญชี, รหัสสมาชิก, เลขบัตรประชาชน, ชื่อบัญชี, ประเภทบัญชี (ออมทรัพย์ / ออมทรัพย์พิเศษ), ข้อมูลติดต่อล่าสุด (วันที่), วันเวลาที่นำเข้า
- **การผูกบัญชี LINE**: รหัสสมาชิก, LINE userId, PIN hash, PIN salt, จำนวนครั้งที่ PIN ผิด, ล็อก PIN, เวอร์ชันนโยบายที่ยินยอม, เวลายินยอม, เวลาผูก, เวลาและผู้ยกเลิกการผูก
- **บัญชีรับเงิน**: รหัส, รหัสสมาชิก, ธนาคาร, เลขบัญชี, ชื่อบัญชี, สถานะ (รอตรวจ / อนุมัติ / ปฏิเสธ / เลิกใช้), รหัสไฟล์เอกสาร 3 ไฟล์, ผู้ตรวจ, เวลาตรวจ, เหตุผลที่ปฏิเสธ, เวลาเลิกใช้, เวลาที่ลบไฟล์ตามระยะเวลาเก็บ
- **คำขอ** (ทั้งฝากและถอน):
  - เลขที่คำขอ (`WD-` สำหรับถอน, `DP-` สำหรับฝาก ตามด้วยปีและเลขลำดับ ออกเลขภายใต้ lock), ประเภท, รหัสสมาชิก
  - หมายเลขบัญชี, ชื่อบัญชีและประเภทบัญชีที่บันทึกไว้ ณ เวลายื่น, ยอดเงิน
  - ถอน: รหัสบัญชีรับเงิน, รหัสไฟล์ลายมือชื่อ
  - ฝาก: รหัสไฟล์สลิป, วันเวลาโอน, ผลตรวจสลิป (สลิปถูกต้อง / ยังไม่ตรวจสลิป), เลขอ้างอิงสลิป
  - สถานะ, ผู้ตรวจและเวลา, ผู้อนุมัติและเวลา, ผู้ปิดและเวลา, เหตุผลที่ปฏิเสธ, รหัสไฟล์ PDF, เวลายื่น, วันทำการที่จะดำเนินการ, เวลาที่ลบไฟล์ตามระยะเวลาเก็บ
- **เจ้าหน้าที่**: ชื่อผู้ใช้, ชื่อ-สกุล, บทบาท (ผู้ตรวจ / ผู้อนุมัติ / ผู้ดูแลระบบ มีได้หลายบทบาท), password hash, salt, จำนวนครั้งที่ผิด, ล็อกถึงเวลา, ใช้งานอยู่หรือไม่
- **วันหยุด**: วันที่, ชื่อวันหยุด
- **audit log**: เวลา, ผู้กระทำ (เจ้าหน้าที่ สมาชิก หรือ `system` สำหรับงานตามเวลา), action, เป้าหมาย, รายละเอียด
- **ตั้งค่า**: ค่าที่ปรับได้ และ groupId ของกลุ่มเจ้าหน้าที่

### ลำดับสถานะของคำขอ

```
คำขอถอนเงิน: รอตรวจ → รออนุมัติ → อนุมัติ → เสร็จสิ้น
คำขอฝากเงิน: รอตรวจ → อนุมัติ → เสร็จสิ้น
ปฏิเสธ:      จาก รอตรวจ (ผู้ตรวจ) หรือ รออนุมัติ (ผู้อนุมัติ) ต้องมีเหตุผล
ยกเลิก:      จาก รอตรวจ เท่านั้น โดยสมาชิกเจ้าของคำขอ
```

- ผู้อนุมัติต้องไม่ใช่คนเดียวกับผู้ตรวจของคำขอนั้น
- **คำขอค้าง** คือสถานะ รอตรวจ, รออนุมัติ หรือ อนุมัติ บัญชีเงินฝากหนึ่งบัญชีมีคำขอถอนเงินค้างได้ 1 รายการ และตรวจเงื่อนไขนี้ภายใต้ lock
- ทุกครั้งที่สถานะเปลี่ยน ให้บันทึก audit log และส่งข้อความแจ้งสมาชิก
- เมื่อคำขอถอนเงินเข้าสถานะ **อนุมัติ** ให้สร้าง PDF จาก Google Docs ต้นแบบ

### กฎของคำขอถอนเงิน

- บัญชีเงินฝากต้องเป็นของสมาชิก และยังอยู่ในข้อมูลที่นำเข้าล่าสุด
- บัญชีรับเงินต้องเป็นของสมาชิกและมีสถานะ อนุมัติ
- ยอด 1,000–100,000 บาท ทศนิยมไม่เกิน 2 ตำแหน่ง
- ต้องมีลายมือชื่อเป็นภาพ PNG (ไม่เกิน 1MB วาดบนจอใน LIFF) ใช้เป็นทั้งลายมือชื่อเจ้าของบัญชีและผู้รับเงิน
- ตรวจ PIN ด้วยกฎเดียวกับการเปลี่ยน PIN (ผิดสะสม 5 ครั้งล็อก) ก่อนตรวจคำขอค้าง จึงนับ PIN ผิดแม้มีคำขอค้างอยู่
- เมื่อผู้ตรวจผ่าน กลุ่มแจ้งเตือนเจ้าหน้าที่ได้ข้อความว่ามีคำขอรออนุมัติ
- หน้าเจ้าหน้าที่แสดงบัญชีรับเงินพร้อมเอกสาร 3 อย่างและลายมือชื่อ และเตือนให้ตรวจยอดคงเหลือในระบบหลักก่อน ผู้อนุมัติที่เป็นผู้ตรวจคำขอนั้นเองเห็นข้อความแทนปุ่มอนุมัติ

### กฎของคำขอฝากเงิน

- ยอดอย่างน้อย 100 บาท (ทศนิยมไม่เกิน 2 ตำแหน่ง) วันเวลาโอนต้องไม่อยู่ในอนาคต (ยอมให้นาฬิกาคลาดได้ 5 นาที) สลิปเป็น JPG/PNG ขนาดไม่เกิน 5MB หน้า LIFF ย่อรูปสลิปแบบเดียวกับเอกสารบัญชีรับเงิน
- เลขที่คำขอเรียงต่อกันในแต่ละปี (ปีตามเวลาไทย) ตัวนับเก็บในชีตตั้งค่า
- ช่อง Flatpickr แสดงวันที่เป็นปี พ.ศ. แต่ส่งเวลาไปหลังบ้านเป็น ISO
- `checkSlip` เรียก SlipOK แล้วเก็บผลไว้ใน cache โดยใช้ hash ของไฟล์เป็น key เพื่อให้ `submitDepositRequest` ไม่ต้องเรียก SlipOK ซ้ำ
- ผลการตรวจ:
  - ผู้รับไม่ใช่บัญชีรับโอนของสหกรณ์ (กรุงไทย) หรือเลขอ้างอิงสลิปซ้ำกับคำขอที่ไม่ได้อยู่ในสถานะยกเลิกหรือปฏิเสธ: **ไม่รับ**
  - ยอดหรือเวลาต่างจากที่กรอก (เวลาคลาดได้ไม่เกิน ±10 นาที): ส่งค่าจากสลิปกลับไปให้สมาชิกยืนยัน แล้วใช้ค่าจากสลิป
  - SlipOK ไม่ตอบหรืออ่านสลิปไม่ได้: รับคำขอไว้ โดยผลตรวจเป็น "ยังไม่ตรวจสลิป"
  - ผ่านทุกข้อ: ผลตรวจเป็น "สลิปถูกต้อง" ซึ่งยังไม่ใช่การอนุมัติ
- เลขอ้างอิงสลิปต้องตรวจซ้ำอีกครั้งภายใต้ lock ตอนสร้างคำขอ
- `checkSlip` ไม่สร้างคำขอ คืน valid / mismatch (พร้อมยอดและเวลาจากสลิป) / unverified ส่วนผู้รับผิดหรือสลิปซ้ำตอบเป็น error หน้า LIFF เรียก `checkSlip` ก่อนเสมอ ถ้า mismatch ให้สมาชิกเลือกใช้ค่าจากสลิปหรือกลับไปแก้ `submitDepositRequest` ที่ยอดหรือเวลายังไม่ตรงกับสลิปจะถูกปฏิเสธ
- ผู้รับตรวจจากรหัสธนาคารผู้รับ (ค่าเริ่มต้น 006 กรุงไทย, key `coopReceivingBankCode`) และเลขบัญชีผู้รับที่ธนาคารปิดบางหลัก เทียบเฉพาะหลักที่แสดงกับเลขบัญชีรับโอนของสหกรณ์ (key `coopReceivingAccount` ในชีตตั้งค่า) ถ้ายังไม่ได้ตั้งเลขบัญชีสหกรณ์ หรือสลิปไม่มีเลขบัญชีผู้รับ (เช่น โอนผ่านพร้อมเพย์) ถือว่า ยังไม่ตรวจสลิป
- สลิปซ้ำตรวจจากเลขอ้างอิงธุรกรรม (transRef) จึงจับได้แม้เป็นภาพแคปหน้าจอคนละไฟล์ของธุรกรรมเดียวกัน
- เรียก SlipOK โดยไม่ส่ง `log: true` เพื่อไม่ให้การตรวจก่อนยื่นนับสลิปว่าใช้แล้ว ผลที่อ่านได้เก็บใน CacheService 30 นาที ผลที่อ่านไม่ได้ไม่เก็บ
- ใช้ SlipOK เมื่อตั้ง Script Properties `SLIPOK_API_KEY` และ `SLIPOK_BRANCH_ID` แล้วเท่านั้น

### วันทำการ

ถ้ายื่นคำขอหลังเวลาตัดรอบ (15:30) หรือในวันเสาร์ อาทิตย์ หรือวันหยุดในชีตวันหยุด วันทำการที่จะดำเนินการคือวันทำการถัดไป ถ้าไม่ใช่ ก็คือวันที่ยื่น เวลาตัดรอบเปลี่ยนได้ที่ชีตตั้งค่า key `cutoffTime` (รูปแบบ HH:MM) ทุกอย่างคิดตามเวลาไทย

### ข้อความแจ้งสมาชิกตามสถานะ

- ยื่นคำขอ: เลขที่คำขอ ยอด และวันทำการที่จะดำเนินการ (กลุ่มเจ้าหน้าที่ได้ข้อความคู่กัน)
- รออนุมัติ: ผ่านการตรวจแล้ว รอผู้อนุมัติ
- อนุมัติ: ฝากเงินแจ้งว่าจะบันทึกเข้าบัญชี ถอนเงินแจ้งว่าจะโอนเงิน ในวันทำการนั้น
- เสร็จสิ้น: บันทึกเข้าบัญชีหรือโอนเงินเรียบร้อยแล้ว
- ปฏิเสธ: พร้อมเหตุผล
- ยกเลิก: ไม่แจ้ง เพราะสมาชิกเป็นคนยกเลิกเอง

### ไฟล์

- รับไฟล์เป็น base64 ใน body แล้วบันทึกลงโฟลเดอร์ Drive ตามประเภท (เอกสารบัญชีรับเงิน / ลายมือชื่อ / สลิป / PDF) ตั้งชื่อไฟล์ตามเลขที่คำขอหรือรหัสบัญชีรับเงิน
- ห้ามแชร์ไฟล์แบบมีลิงก์ เจ้าหน้าที่ดูไฟล์ผ่าน `viewDocument` เท่านั้น
- trigger ที่รันตามเวลาทุกเดือน (วันที่ 1 ประมาณ 02:00) ลบไฟล์ของคำขอที่ เสร็จสิ้น / ปฏิเสธ / ยกเลิก และบัญชีรับเงินที่ ปฏิเสธ / เลิกใช้ ที่ปิดไปแล้วเกินระยะเวลาเก็บ (ชีตตั้งค่า key `documentRetentionYears` ค่าเริ่มต้น 10 ปี ค่าที่ไม่ใช่จำนวนเต็มบวกทำให้ trigger หยุดโดยไม่ลบอะไร) นับจากเวลาที่ปิด (เสร็จสิ้น / ปฏิเสธ / ยกเลิก / เลิกใช้)
  - ไฟล์ย้ายไปถังขยะของ Drive แถวข้อมูลยังอยู่ แต่บันทึกเวลาที่ลบไฟล์ (`filesPurgedAt`) แล้ว `viewDocument` และการสร้าง PDF ใหม่ตอบว่าเอกสารครบระยะเวลาเก็บแล้ว
  - ห้ามลบไฟล์ของบัญชีรับเงินที่ยังมีสถานะ อนุมัติ หรือ รอตรวจ
  - ทุกรายการบันทึก audit log ผู้กระทำ `system` (`purgeDocuments` หรือ `purgeDocumentsFailed` ถ้าลบไม่ได้ ซึ่งจะลองใหม่รอบหน้า)
  - ทำทีละรายการและหยุดเมื่อใช้เวลาเกิน 4.5 นาที แล้วตั้ง trigger ครั้งเดียวให้ทำต่อในอีก 1 นาที เพื่อไม่ให้เกินเวลา 6 นาทีของ Apps Script

### การนำเข้าข้อมูล

ผู้ดูแลระบบอัปโหลดไฟล์ .xlsx, .xls หรือ .csv (ไม่เกิน 10MB) ระบบแปลงเป็น Sheets ชั่วคราวผ่าน Drive advanced service อ่านค่าตามที่แสดง (เลขที่ขึ้นต้นด้วย 0 ไม่หาย) แล้วลบไฟล์ชั่วคราวทันที จากนั้นตรวจไฟล์

- หาแถวหัวตารางใน 10 แถวแรก รองรับชื่อหัวคอลัมน์ที่ใช้กัน เช่น หมายเลขบัญชี/เลขที่บัญชี, หมายเลขบัตรประชาชน/เลขบัตรประชาชน, ชื่อบัญชีเงินฝาก/ชื่อบัญชี และข้ามแถวว่าง
- คอลัมน์ครบหรือไม่
- หมายเลขบัญชีไม่ว่างและไม่ซ้ำ
- รหัสสมาชิกเติม 0 ได้ครบ 5 หลักหรือไม่
- เลขบัตรประชาชนมี 13 หลักและ checksum ถูกต้องหรือไม่ (ตัดขีดและช่องว่างก่อนตรวจ)
- สมาชิกหนึ่งคนมีเลขบัตรประชาชนเดียว และเลขบัตรประชาชนหนึ่งเลขเป็นของสมาชิกคนเดียว
- ประเภทบัญชีเป็นหนึ่งในสองค่าที่กำหนดหรือไม่ (ไม่สนช่องว่าง)
- แจ้งปัญหาได้สูงสุด 100 แถวพร้อมจำนวนทั้งหมด

ผิดแม้แถวเดียวให้ปฏิเสธทั้งไฟล์และแจ้งเลขแถว ถ้าผ่านทั้งหมด ให้แทนที่ตารางบัญชีเงินฝากทั้งตารางภายใต้ lock ส่วนตารางการผูกบัญชี LINE และบัญชีรับเงินไม่ถูกแตะ

### บัญชีรับเงิน

- ธนาคารเลือกจากรายการธนาคารไทยที่กำหนด เลขบัญชีตัดขีดและช่องว่างแล้วต้องเป็นตัวเลข 10–15 หลัก ชื่อบัญชียุบช่องว่างซ้ำ
- เอกสาร 3 อย่างต้องครบ แต่ละไฟล์เป็น JPG, PNG หรือ PDF ไม่เกิน 5MB ตรวจทั้ง mimeType และไบต์แรกของไฟล์ ชื่อไฟล์ใน Drive ตั้งจากรหัสสมาชิก รหัสบัญชีรับเงิน และชนิดเอกสาร
- หน้า LIFF ย่อรูปถ่ายให้ด้านยาวไม่เกิน 1600px และแปลงเป็น JPEG ก่อนส่ง
- สมาชิกมีบัญชีรับเงินที่ยังใช้งาน (รอตรวจหรืออนุมัติ) ได้ไม่เกิน 3 บัญชี และลงบัญชีเดิมซ้ำไม่ได้
- หน้าผู้ตรวจเตือนเมื่อชื่อบัญชีไม่ตรงกับชื่อสมาชิก (ไม่สนช่องว่างและคำนำหน้าชื่อ) แต่ผู้ตรวจเป็นคนตัดสิน
- `viewDocument` เปิดได้เฉพาะไฟล์ที่ระบบอ้างถึง (เอกสารบัญชีรับเงิน และในอนาคตคือลายมือชื่อ สลิป และ PDF ของคำขอ) ไม่ใช่ไฟล์ใดก็ได้ใน Drive

### การแจ้งเตือน

- **สมาชิก**: push message ทุกครั้งที่สถานะคำขอหรือบัญชีรับเงินเปลี่ยน ระบุเลขที่คำขอ ยอดเงิน สถานะ และเหตุผลถ้าถูกปฏิเสธ
- **กลุ่มเจ้าหน้าที่**: push เมื่อมีคำขอใหม่ คำขอเข้า รออนุมัติ หรือมีบัญชีรับเงินใหม่ ระบุประเภท ยอดเงิน และลิงก์ไปหน้าเว็บเจ้าหน้าที่ ห้ามใส่เลขบัตรประชาชนหรือเลขบัญชีเต็ม
- ถ้าส่งข้อความไม่สำเร็จ ห้ามทำให้ action ล้มเหลว ให้บันทึกลง audit log แทน

### PDF ใบถอนเงิน

- สร้างทันทีที่ผู้อนุมัติอนุมัติคำขอถอนเงิน บันทึกในโฟลเดอร์ PDF และเก็บรหัสไฟล์ไว้ในคำขอ สร้างไม่สำเร็จไม่ทำให้การอนุมัติล้มเหลว (บันทึก `pdfFailed` ใน audit log) เจ้าหน้าที่กด `regenerateWithdrawalPdf` เพื่อสร้างใหม่ได้สำหรับคำขอที่อนุมัติหรือเสร็จสิ้นแล้ว
- scope `drive.file` เปิดได้เฉพาะไฟล์ที่ระบบสร้างเอง ระบบจึงสร้าง Google Docs ต้นแบบชั่วคราวเองครั้งแรก (จำ ID ใน Script Property `WITHDRAWAL_TEMPLATE_DOC_ID`) ผู้ดูแลระบบเปิดต้นแบบจากหน้าเว็บ (`withdrawalTemplate`) เพื่อแก้ให้ตรงกับแบบฟอร์มกระดาษของสหกรณ์ ถ้าต้นแบบถูกลบ ระบบสร้างต้นแบบชั่วคราวใหม่
- ตัวแปรในต้นแบบเขียนเป็น `{{ชื่อ}}`: requestNumber, submittedDate, memberCode, accountNumber, accountName, accountType, amount, amountText (ยอดเป็นตัวอักษรไทย เช่น หนึ่งพันห้าร้อยบาทห้าสิบสตางค์), payoutBank, payoutAccountNumber, payoutAccountName, processingDate, reviewedBy, approvedBy (ชื่อ-สกุลเจ้าหน้าที่), approvedDate
- รูปลายมือชื่อ `{{ownerSignature}}` และ `{{recipientSignature}}` เป็นรูปเดียวกัน ต้องวางในบรรทัดของตัวเอง รูปกว้าง 170 จุด
- ขั้นตอน: คัดลอกต้นแบบ → แทนตัวแปร → export PDF ผ่าน Drive API → ลบสำเนา

### Export

`exportApproved` (เจ้าหน้าที่ทุกบทบาท) รับวันทำการ แล้วสร้างไฟล์ .xlsx ที่มีสองแท็บ (ฝาก / ถอน) ของคำขอที่อยู่ในสถานะ อนุมัติ ซึ่งวันทำการ**ไม่เกิน**วันนั้น (จึงรวมรายการค้างจากวันก่อน) เรียงตามเลขที่คำขอ

- คอลัมน์ร่วม: เลขที่คำขอ, วันทำการ, รหัสสมาชิก, หมายเลขบัญชี, ชื่อบัญชี, ประเภทบัญชี, จำนวนเงิน
- แท็บฝากเพิ่ม: วันเวลาที่โอน, ผลตรวจสลิป
- แท็บถอนเพิ่ม: ธนาคาร, เลขบัญชีรับเงิน, ชื่อบัญชีรับเงิน, ผู้ตรวจ, ผู้อนุมัติ (สำหรับโอนผ่าน KTB Corporate Online)
- แถวสุดท้ายของแต่ละแท็บคือจำนวนรายการและยอดรวม
- สร้างจาก Google Sheets ชั่วคราว (คอลัมน์ข้อความเป็นรูปแบบข้อความ ตัวเลขแสดงทศนิยม 2 ตำแหน่ง) export เป็น .xlsx แล้วลบไฟล์ชั่วคราว ไม่เก็บไฟล์ไว้ใน Drive
- การ export ไม่เปลี่ยนสถานะ และบันทึก audit log

`completeRequests` (เจ้าหน้าที่ทุกบทบาท) รับรายการ id ไม่เกิน 200 รายการ ปิดเฉพาะคำขอที่อนุมัติแล้วเป็นเสร็จสิ้น แต่ละรายการสำเร็จหรือล้มเหลวแยกกันพร้อมเหตุผล แจ้งสมาชิกทุกรายการที่ปิด

### สภาพแวดล้อม

ชุด**ทดสอบ**และชุด**ใช้จริง**แยกจากกันทั้ง LIFF app, Apps Script deployment, Spreadsheet และโฟลเดอร์ Drive หน้าบ้านรับ URL ของ Apps Script และ LIFF ID จากตัวแปรตอน build

## Testing Decisions

- **จุดทดสอบเดียว**: ตัวรับคำสั่ง (action handler) ของหลังบ้าน ทดสอบบน Node ด้วย Vitest ส่ง `{ action, auth, payload }` เข้าไปแล้วตรวจผลลัพธ์ สถานะในที่เก็บข้อมูลปลอม และข้อความที่ตัวส่งข้อความปลอมได้รับ
- adapter ทั้ง 7 ใช้ตัวปลอมในหน่วยความจำ ตัวตรวจตัวตน LINE ปลอมจับคู่ token กับ userId ส่วนนาฬิกาปลอมตั้งเวลาได้ เพื่อทดสอบเรื่องวันทำการ
- ทดสอบเฉพาะพฤติกรรมที่มองเห็นจากภายนอก ไม่ทดสอบฟังก์ชันภายในหรือโครงสร้างแถวใน Sheets
- กรณีที่ต้องมี:
  - เติม 0 ให้รหัสสมาชิก และปฏิเสธรหัสที่เกิน 5 หลัก
  - ผูกบัญชีไม่ได้เมื่อเลขบัตรไม่ตรง หรือรหัสสมาชิกถูกผูกกับ LINE อื่นแล้ว และล็อกเมื่อผิดเกิน 5 ครั้ง
  - PIN ผิด 5 ครั้งแล้วถอนไม่ได้ จนกว่าผู้ดูแลระบบจะรีเซ็ต
  - ยอดถอนนอกช่วง 1,000–100,000 บาทถูกปฏิเสธ
  - ยื่นคำขอถอนเงินรายการที่สองระหว่างที่มีคำขอค้างไม่ได้
  - ถอนเข้าบัญชีรับเงินที่ยังไม่อนุมัติหรือเป็นของคนอื่นไม่ได้
  - ลำดับสถานะทุกเส้นทาง รวมทั้งการเปลี่ยนสถานะที่ไม่อนุญาต
  - ผู้ตรวจอนุมัติคำขอที่ตัวเองตรวจไม่ได้
  - สมาชิกยกเลิกคำขอได้เฉพาะตอน รอตรวจ และเฉพาะคำขอของตัวเอง
  - ตรวจสลิปครบทุกผล: ผ่าน, ผู้รับผิด, เลขอ้างอิงซ้ำ, ยอดหรือเวลาไม่ตรง, SlipOK ล่ม
  - คำนวณวันทำการ: ก่อนและหลัง 15:30, วันเสาร์อาทิตย์, วันหยุด, วันหยุดติดกันหลายวัน
  - นำเข้าไฟล์ที่ผิดแล้วข้อมูลเดิมไม่เปลี่ยน ส่วนการนำเข้าที่ถูกต้องไม่ทำให้การผูกบัญชี LINE หาย
  - ส่งข้อความไม่สำเร็จแล้ว action ยังสำเร็จ
  - action ของเจ้าหน้าที่ปฏิเสธเมื่อไม่มีบทบาทที่ต้องใช้
- **ทดสอบด้วยมือบนชุดทดสอบ**: หน้าจอ LIFF และหน้าเว็บเจ้าหน้าที่, LockService กับ Sheets ตัวจริง, การสร้าง PDF, การ export .xlsx และการรับ event join ของ webhook
- ยังไม่มีโค้ดหรือการทดสอบเดิมในโปรเจกต์ (เพิ่งเริ่มโปรเจกต์)

## Out of Scope

- ตัดหรือเพิ่มยอดในระบบหลักอัตโนมัติ และแสดงยอดคงเหลือ (ADR 0001)
- โอนเงินออกอัตโนมัติผ่าน API ของธนาคาร เจ้าหน้าที่โอนผ่าน KTB Corporate Online เอง
- ถอนเงินเข้าบัญชีของบุคคลอื่น
- ชำระหนี้เงินกู้ ซื้อหุ้น หรือธุรกรรมอื่นที่ไม่ใช่การฝากหรือถอนบัญชีเงินฝาก
- วงเงินถอนรวมต่อวัน
- Sign in with Google สำหรับเจ้าหน้าที่
- อ่านข้อมูลจากสำเนาบัตรประชาชนด้วย OCR
- ภาษาอื่นนอกจากภาษาไทย

## Further Notes

- **แบบฟอร์มกระดาษของสหกรณ์** สำหรับใช้ทำต้นแบบ PDF ยังไม่ได้รับ ถ้ายังไม่ได้รับเมื่อถึงงานนี้ ให้ออกแบบต้นแบบที่มีช่องครบตามฟอร์มถอนเงิน แล้วให้สหกรณ์ตรวจ
- **โควตาข้อความของ LINE OA**: แผนฟรีส่ง push ได้ 300 ข้อความต่อเดือน คำขอหลักร้อยรายการต่อเดือน รายการละ 2–4 ข้อความ จะเกินโควตา ต้องสมัครแผนที่เสียเงิน
- **ความเสี่ยงจาก Gmail ส่วนตัว** (ADR 0002): ต้องแชร์เป็น Editor ให้กรรมการอีก 1 คน และเขียนขั้นตอนโอนความเป็นเจ้าของให้เสร็จก่อนเปิดใช้จริง
- **ระยะเวลาเก็บเอกสาร 10 ปี** ควรยืนยันกับผู้สอบบัญชีของสหกรณ์
- **โควตาของ Apps Script** สำหรับ Gmail ส่วนตัว (เช่น UrlFetch 20,000 ครั้งต่อวัน, รันได้ไม่เกิน 6 นาทีต่อครั้ง) เพียงพอสำหรับสมาชิกไม่เกิน 3,000 คน
- ใช้คำศัพท์ตาม GLOSSARY.md
