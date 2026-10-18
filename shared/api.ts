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
  | 'INTERNAL';

export type PingResult = { serverTime: string };

export type MeResult =
  | { bound: false; displayName: string }
  | { bound: true; displayName: string; memberCode: string };

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
