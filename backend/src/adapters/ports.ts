// ตัวกลาง (adapter) ทั้ง 6 ที่ action handler ใช้ติดต่อโลกภายนอก
// แต่ละตัวมีตัวจริงใน ./gas และตัวปลอมใน ./fake สำหรับทดสอบ
// ticket ถัด ๆ ไปจะเพิ่มเมธอดตามที่ต้องใช้

export type LineBinding = {
  memberCode: string;
  lineUserId: string;
};

/** ที่เก็บข้อมูล (Google Sheets) */
export interface DataStore {
  findActiveBindingByLineUserId(lineUserId: string): LineBinding | null;
}

/** ที่เก็บไฟล์ (Google Drive) — ใช้ตั้งแต่ ticket 06 */
export interface FileStore {}

export type LineUser = { userId: string; displayName: string };

/** ตัวตรวจตัวตน LINE: ตรวจ LIFF ID token แล้วคืนผู้ใช้ หรือ null ถ้า token ไม่ถูกต้อง */
export interface LineIdentity {
  verifyIdToken(idToken: string): LineUser | null;
}

/** ตัวตรวจสลิป (SlipOK) — ใช้ตั้งแต่ ticket 08 */
export interface SlipVerifier {}

/** ตัวส่งข้อความ LINE (Messaging API) — ใช้ตั้งแต่ ticket 06 */
export interface Messenger {}

/** นาฬิกา (Asia/Bangkok) */
export interface Clock {
  now(): Date;
}

export type Deps = {
  data: DataStore;
  files: FileStore;
  lineIdentity: LineIdentity;
  slips: SlipVerifier;
  messenger: Messenger;
  clock: Clock;
};
