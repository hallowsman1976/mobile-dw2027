// ตัวกลาง (adapter) ที่ action handler ใช้ติดต่อโลกภายนอก
// แต่ละตัวมีตัวจริงใน ./gas และตัวปลอมใน ./fake สำหรับทดสอบ
// ticket ถัด ๆ ไปจะเพิ่มเมธอดตามที่ต้องใช้
import type { AccountType, StaffRole } from '../../../shared/api';

export type LineBinding = {
  memberCode: string;
  lineUserId: string;
};

export type StaffAccount = {
  username: string;
  fullName: string;
  roles: StaffRole[];
  passwordHash: string;
  passwordSalt: string;
  /** เวลาที่ตั้งรหัสผ่านล่าสุด session ที่ออกก่อนเวลานี้ใช้ไม่ได้ */
  passwordChangedAt: string;
  failedAttempts: number;
  /** ISO time หรือ '' ถ้าไม่ได้ล็อก */
  lockedUntil: string;
  active: boolean;
  createdAt: string;
};

export type StaffSession = {
  username: string;
  /** salt ของรหัสผ่าน ณ ตอนออก session ถ้ารีเซ็ตรหัสผ่าน salt เปลี่ยนและ session เดิมใช้ไม่ได้ */
  passwordSalt: string;
  issuedAt: string;
  expiresAt: string;
};

/** หนึ่งแถวของบัญชีเงินฝากที่นำเข้าจากระบบหลัก */
export type DepositAccount = {
  seq: string;
  accountNumber: string;
  memberCode: string;
  nationalId: string;
  accountName: string;
  accountType: AccountType;
  /** วันที่ติดต่อล่าสุดตามที่ระบบหลักแสดง (ข้อความ) */
  lastContactDate: string;
  importedAt: string;
};

export type AuditEntry = {
  at: string;
  /** username ของเจ้าหน้าที่ หรือ member:<รหัสสมาชิก> */
  actor: string;
  action: string;
  target: string;
  detail: string;
};

/** ที่เก็บข้อมูล (Google Sheets และ PropertiesService สำหรับ session) */
export interface DataStore {
  /** ทำงานภายใต้ script lock ทุกการอ่าน-ตรวจ-เขียนที่ต้องไม่ชนกันต้องอยู่ในนี้ */
  withLock<T>(fn: () => T): T;

  findActiveBindingByLineUserId(lineUserId: string): LineBinding | null;

  listDepositAccounts(): DepositAccount[];
  /** แทนที่บัญชีเงินฝากทั้งตาราง (ผู้เรียกต้องถือ lock) */
  replaceDepositAccounts(accounts: DepositAccount[]): void;

  appendAuditLog(entry: AuditEntry): void;

  listStaff(): StaffAccount[];
  findStaff(username: string): StaffAccount | null;
  /** เพิ่มหรือแทนที่ตาม username */
  saveStaff(staff: StaffAccount): void;

  /** key คือแฮชของ session token ไม่เก็บ token จริง */
  putSession(tokenHash: string, session: StaffSession): void;
  getSession(tokenHash: string): StaffSession | null;
  deleteSession(tokenHash: string): void;
}

/** ที่เก็บไฟล์ (Google Drive) */
export interface FileStore {
  /**
   * อ่านแผ่นแรกของไฟล์ตาราง (.xlsx, .xls, .csv) เป็นข้อความตามที่แสดงในโปรแกรม
   * เพื่อให้เลขที่ขึ้นต้นด้วย 0 ไม่หาย คืน null ถ้าอ่านไฟล์ไม่ได้
   */
  readSpreadsheetRows(fileName: string, contentBase64: string): string[][] | null;
}

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

/** ตัวสุ่มที่ปลอดภัยพอสำหรับ salt และ session token */
export interface Random {
  uuid(): string;
}

export type Deps = {
  data: DataStore;
  files: FileStore;
  lineIdentity: LineIdentity;
  slips: SlipVerifier;
  messenger: Messenger;
  clock: Clock;
  random: Random;
};
