// ตัวกลาง (adapter) ที่ action handler ใช้ติดต่อโลกภายนอก
// แต่ละตัวมีตัวจริงใน ./gas และตัวปลอมใน ./fake สำหรับทดสอบ
// ticket ถัด ๆ ไปจะเพิ่มเมธอดตามที่ต้องใช้
import type {
  AccountType,
  DocumentContent,
  Holiday,
  LineGroup,
  PayoutAccountStatus,
  RequestStatus,
  RequestType,
  SlipCheck,
  StaffRole,
} from '../../../shared/api';

/** การผูกบัญชี LINE หนึ่งครั้ง แถวที่ยกเลิกแล้วยังเก็บไว้เป็นประวัติ */
export type LineBinding = {
  id: string;
  memberCode: string;
  lineUserId: string;
  /** '' ถ้ายังไม่ได้ตั้ง PIN หรือผู้ดูแลระบบรีเซ็ตแล้ว */
  pinHash: string;
  pinSalt: string;
  pinFailedAttempts: number;
  pinLocked: boolean;
  consentVersion: string;
  consentAt: string;
  boundAt: string;
  /** '' ถ้ายังใช้งานอยู่ */
  unboundAt: string;
  unboundBy: string;
};

/** ตัวนับการผูกบัญชีผิดของ LINE userId หนึ่งคน (เก็บชั่วคราว) */
export type BindingThrottle = {
  failures: number;
  firstFailureAt: string;
  /** '' ถ้าไม่ได้ล็อก */
  lockedUntil: string;
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

export type PayoutAccount = {
  id: string;
  memberCode: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  status: PayoutAccountStatus;
  idCardFileId: string;
  depositBookFileId: string;
  payoutBookFileId: string;
  createdAt: string;
  reviewedBy: string;
  reviewedAt: string;
  rejectReason: string;
  retiredAt: string;
};

/** คำขอฝากหรือถอนเงิน ชื่อและประเภทบัญชีบันทึกไว้ ณ เวลายื่น */
export type MemberRequest = {
  id: string;
  requestNumber: string;
  type: RequestType;
  memberCode: string;
  accountNumber: string;
  accountName: string;
  accountType: AccountType;
  amount: number;
  // ถอนเงิน
  payoutAccountId: string;
  signatureFileId: string;
  // ฝากเงิน
  slipFileId: string;
  transferredAt: string;
  slipCheck: SlipCheck;
  slipRef: string;
  status: RequestStatus;
  reviewedBy: string;
  reviewedAt: string;
  approvedBy: string;
  approvedAt: string;
  completedBy: string;
  completedAt: string;
  rejectedBy: string;
  rejectedAt: string;
  rejectReason: string;
  cancelledAt: string;
  pdfFileId: string;
  submittedAt: string;
  /** วันทำการที่จะดำเนินการ YYYY-MM-DD */
  processingDate: string;
};

/** หมวดของไฟล์ แต่ละหมวดเป็นโฟลเดอร์ย่อยใน Drive */
export type FileCategory = 'payoutDocuments' | 'signatures' | 'slips' | 'pdfs';

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
  findActiveBindingByMemberCode(memberCode: string): LineBinding | null;
  /** เพิ่มหรือแทนที่ตาม id */
  saveBinding(binding: LineBinding): void;

  /** cache ชั่วคราว หมดอายุเองหลัง ttlSeconds คืน null ถ้าไม่มี */
  getCache(key: string): string | null;
  putCache(key: string, value: string, ttlSeconds: number): void;

  /** ตัวนับชั่วคราว หมดอายุเองหลัง ttlSeconds */
  getBindingThrottle(lineUserId: string): BindingThrottle | null;
  putBindingThrottle(lineUserId: string, throttle: BindingThrottle, ttlSeconds: number): void;

  listDepositAccounts(): DepositAccount[];
  /** แทนที่บัญชีเงินฝากทั้งตาราง (ผู้เรียกต้องถือ lock) */
  replaceDepositAccounts(accounts: DepositAccount[]): void;

  appendAuditLog(entry: AuditEntry): void;

  listPayoutAccounts(): PayoutAccount[];
  /** เพิ่มหรือแทนที่ตาม id */
  savePayoutAccount(account: PayoutAccount): void;

  /** ค่าตั้งค่าที่เจ้าหน้าที่เปลี่ยนได้ คืน '' ถ้ายังไม่ตั้ง */
  getSetting(key: string): string;
  setSetting(key: string, value: string): void;

  listRequests(): MemberRequest[];
  /** เพิ่มหรือแทนที่ตาม id */
  saveRequest(request: MemberRequest): void;

  listHolidays(): Holiday[];
  /** เพิ่มหรือแทนที่ตาม date */
  saveHoliday(holiday: Holiday): void;
  deleteHoliday(date: string): void;

  listLineGroups(): LineGroup[];
  /** เพิ่มหรือแทนที่ตาม groupId */
  saveLineGroup(group: LineGroup): void;

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

  /** บันทึกไฟล์แบบไม่แชร์ คืน fileId */
  saveFile(category: FileCategory, fileName: string, mimeType: string, contentBase64: string): string;
  /** คืน null ถ้าไม่พบไฟล์ */
  readFile(fileId: string): DocumentContent | null;

  /** สร้างไฟล์ .xlsx ชั่วคราวจากตารางหลายแท็บ คืนเนื้อไฟล์ ไม่เก็บไฟล์ไว้ใน Drive */
  buildSpreadsheet(fileName: string, sheets: SpreadsheetTab[]): DocumentContent;
}

export type SpreadsheetTab = { name: string; rows: (string | number)[][] };

export type LineUser = { userId: string; displayName: string };

/** ตัวตรวจตัวตน LINE: ตรวจ LIFF ID token แล้วคืนผู้ใช้ หรือ null ถ้า token ไม่ถูกต้อง */
export interface LineIdentity {
  verifyIdToken(idToken: string): LineUser | null;
}

/** ข้อมูลที่อ่านได้จาก QR ของสลิป */
export type SlipReading = {
  /** เลขอ้างอิงธุรกรรม ไม่ซ้ำกันในแต่ละสลิป */
  transRef: string;
  /** ISO */
  transferredAt: string;
  amount: number;
  /** รหัสธนาคารผู้รับ เช่น 006 = กรุงไทย */
  receiverBankCode: string;
  /** เลขบัญชีผู้รับแบบที่ธนาคารปิดบางหลัก เช่น xxx-x-x5678-x */
  receiverAccount: string;
  receiverName: string;
};

/** ตัวตรวจสลิป (SlipOK) คืน null ถ้าตรวจไม่ได้ (บริการล่ม อ่าน QR ไม่ได้ หรือยังไม่ได้ตั้งค่า) */
export interface SlipVerifier {
  read(imageBase64: string, mimeType: string): SlipReading | null;
}

/** ตัวส่งข้อความ LINE (Messaging API) */
export interface Messenger {
  /** ส่งข้อความถึง userId หรือ groupId โยน error ถ้าส่งไม่สำเร็จ */
  pushText(to: string, text: string): void;
  /** ชื่อกลุ่ม LINE คืน null ถ้าอ่านไม่ได้ */
  getGroupName(groupId: string): string | null;
}

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
