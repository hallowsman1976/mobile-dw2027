// สัญญา (contract) ระหว่างหน้าบ้านกับหลังบ้าน ใช้ร่วมกันทั้งสองฝั่ง

export type ApiRequest = {
  action: string;
  auth?: ApiAuth;
  payload?: unknown;
};

/** สมาชิกส่ง LIFF ID token ส่วนเจ้าหน้าที่ส่ง session token */
export type ApiAuth = { idToken: string } | { sessionToken: string };

export type ApiError = { code: ErrorCode; message: string };

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNKNOWN_ACTION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  /** ผู้ใช้ LINE ยังไม่ได้ผูกบัญชี หน้าบ้านพาไปหน้าผูกบัญชี */
  | 'NOT_BOUND'
  | 'INTERNAL';

export type PingResult = { serverTime: string };

export type MeResult =
  | { bound: false; displayName: string }
  | {
      bound: true;
      displayName: string;
      memberCode: string;
      /** ชื่อตามบัญชีเงินฝากบัญชีแรกของสมาชิก */
      memberName: string;
      pinSet: boolean;
      pinLocked: boolean;
    };

// ---------- สมาชิก: การผูกบัญชี LINE และ PIN ----------

/** เวอร์ชันนโยบายความเป็นส่วนตัวที่สมาชิกต้องยินยอม เปลี่ยนเมื่อแก้เนื้อหานโยบาย */
export const PRIVACY_POLICY_VERSION = '2026-01-draft';

export type BindLineAccountPayload = {
  memberCode: string;
  nationalId: string;
  acceptedPolicyVersion: string;
};

export type BindLineAccountResult = { memberCode: string; memberName: string };

export const PIN_LENGTH = 6;

export type SetPinPayload = { pin: string };

export type MyAccount = {
  accountNumber: string;
  accountName: string;
  accountType: AccountType;
};

// ---------- เจ้าหน้าที่ ----------

export type StaffRole = 'reviewer' | 'approver' | 'systemAdministrator';

export const STAFF_ROLES: readonly StaffRole[] = ['reviewer', 'approver', 'systemAdministrator'];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  reviewer: 'ผู้ตรวจ',
  approver: 'ผู้อนุมัติ',
  systemAdministrator: 'ผู้ดูแลระบบ',
};

export const STAFF_PASSWORD_MIN_LENGTH = 10;

export type StaffProfile = {
  username: string;
  fullName: string;
  roles: StaffRole[];
};

export type StaffLoginPayload = { username: string; password: string };

export type StaffLoginResult = {
  sessionToken: string;
  expiresAt: string;
  staff: StaffProfile;
};

export type StaffListItem = StaffProfile & {
  active: boolean;
  locked: boolean;
  createdAt: string;
};

export type CreateStaffPayload = {
  username: string;
  fullName: string;
  roles: StaffRole[];
  password: string;
};

export type UpdateStaffPayload = {
  username: string;
  fullName?: string;
  roles?: StaffRole[];
  active?: boolean;
};

export type ResetStaffPasswordPayload = { username: string; newPassword: string };

// ---------- บัญชีเงินฝาก ----------

export type AccountType = 'savings' | 'specialSavings';

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  savings: 'ออมทรัพย์',
  specialSavings: 'ออมทรัพย์พิเศษ',
};

/** ไฟล์ที่ export จากระบบหลัก รองรับ .xlsx, .xls และ .csv */
export type ImportAccountsPayload = { fileName: string; contentBase64: string };

export type ImportRowError = {
  /** เลขแถวใน Excel (0 คือปัญหาของทั้งไฟล์) */
  row: number;
  message: string;
};

export type ImportAccountsResult =
  | { status: 'imported'; rowCount: number; memberCount: number; importedAt: string }
  | { status: 'rejected'; errors: ImportRowError[]; totalErrors: number };

export type DepositAccountImportStatus = {
  rowCount: number;
  memberCount: number;
  importedAt: string | null;
};

export const IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024;
