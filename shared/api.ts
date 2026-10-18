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

export type ChangePinPayload = { oldPin: string; newPin: string };

export const PIN_MAX_FAILED_ATTEMPTS = 5;

// ---------- เจ้าหน้าที่: ดูแลการผูกบัญชีของสมาชิก ----------

export type MemberCodePayload = { memberCode: string };

export type MemberLookup = {
  memberCode: string;
  memberName: string;
  accountCount: number;
  binding: null | {
    boundAt: string;
    consentVersion: string;
    pinSet: boolean;
    pinLocked: boolean;
    pinFailedAttempts: number;
  };
};

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

// ---------- เอกสารแนบ ----------

/** ไฟล์ที่สมาชิกแนบ ส่งเป็น base64 */
export type UploadedFile = { fileName: string; mimeType: string; contentBase64: string };

export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;

export const DOCUMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;

export type ViewDocumentPayload = { fileId: string };

export type DocumentContent = { fileName: string; mimeType: string; contentBase64: string };

// ---------- บัญชีรับเงิน ----------

export const BANKS: readonly { code: string; name: string }[] = [
  { code: 'KTB', name: 'ธนาคารกรุงไทย' },
  { code: 'BBL', name: 'ธนาคารกรุงเทพ' },
  { code: 'KBANK', name: 'ธนาคารกสิกรไทย' },
  { code: 'SCB', name: 'ธนาคารไทยพาณิชย์' },
  { code: 'BAY', name: 'ธนาคารกรุงศรีอยุธยา' },
  { code: 'TTB', name: 'ธนาคารทหารไทยธนชาต' },
  { code: 'GSB', name: 'ธนาคารออมสิน' },
  { code: 'BAAC', name: 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร' },
  { code: 'GHB', name: 'ธนาคารอาคารสงเคราะห์' },
  { code: 'KKP', name: 'ธนาคารเกียรตินาคินภัทร' },
  { code: 'CIMBT', name: 'ธนาคารซีไอเอ็มบี ไทย' },
  { code: 'UOBT', name: 'ธนาคารยูโอบี' },
  { code: 'LHB', name: 'ธนาคารแลนด์ แอนด์ เฮ้าส์' },
  { code: 'TISCO', name: 'ธนาคารทิสโก้' },
  { code: 'IBANK', name: 'ธนาคารอิสลามแห่งประเทศไทย' },
];

export type PayoutAccountStatus = 'pendingReview' | 'approved' | 'rejected' | 'retired';

export const PAYOUT_ACCOUNT_STATUS_LABELS: Record<PayoutAccountStatus, string> = {
  pendingReview: 'รอตรวจ',
  approved: 'อนุมัติ',
  rejected: 'ปฏิเสธ',
  retired: 'เลิกใช้',
};

/** เอกสาร 3 อย่างที่ต้องแนบตอนลงทะเบียนบัญชีรับเงิน */
export type PayoutDocumentKind = 'idCard' | 'depositBook' | 'payoutBook';

export const PAYOUT_DOCUMENT_LABELS: Record<PayoutDocumentKind, string> = {
  idCard: 'สำเนาบัตรประชาชน',
  depositBook: 'สำเนาบัญชีเงินฝากสหกรณ์',
  payoutBook: 'สำเนาบัญชีรับเงิน',
};

export type RegisterPayoutAccountPayload = {
  bankCode: string;
  accountNumber: string;
  accountName: string;
  documents: Record<PayoutDocumentKind, UploadedFile>;
};

export type MyPayoutAccount = {
  id: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  status: PayoutAccountStatus;
  rejectReason: string;
  createdAt: string;
};

export type PayoutAccountForReview = MyPayoutAccount & {
  memberCode: string;
  memberName: string;
  documents: Record<PayoutDocumentKind, string>;
  reviewedBy: string;
  reviewedAt: string;
};

export type ReviewDecisionPayload = {
  id: string;
  decision: 'approve' | 'reject';
  reason?: string;
};

// ---------- คำขอฝากและถอนเงิน ----------

export type RequestType = 'deposit' | 'withdrawal';

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  deposit: 'ฝากเงิน',
  withdrawal: 'ถอนเงิน',
};

export type RequestStatus =
  | 'pendingReview'
  | 'pendingApproval'
  | 'approved'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  pendingReview: 'รอตรวจ',
  pendingApproval: 'รออนุมัติ',
  approved: 'อนุมัติ',
  completed: 'เสร็จสิ้น',
  rejected: 'ปฏิเสธ',
  cancelled: 'ยกเลิก',
};

/** ผลตรวจสลิปของคำขอฝากเงิน */
export type SlipCheck = 'notChecked' | 'valid';

export const SLIP_CHECK_LABELS: Record<SlipCheck, string> = {
  notChecked: 'ยังไม่ตรวจสลิป',
  valid: 'สลิปถูกต้อง',
};

export const DEPOSIT_MIN_AMOUNT = 100;
export const SLIP_MIME_TYPES = ['image/jpeg', 'image/png'] as const;

export type SubmitDepositPayload = {
  accountNumber: string;
  amount: number;
  /** ISO 8601 */
  transferredAt: string;
  slip: UploadedFile;
};

/** คำขอตามที่สมาชิกเห็น */
export type MyRequest = {
  id: string;
  requestNumber: string;
  type: RequestType;
  accountNumber: string;
  accountName: string;
  accountType: AccountType;
  amount: number;
  status: RequestStatus;
  rejectReason: string;
  submittedAt: string;
  /** วันทำการที่จะดำเนินการ YYYY-MM-DD */
  processingDate: string;
  transferredAt: string;
};

/** คำขอตามที่เจ้าหน้าที่เห็น */
export type StaffRequest = MyRequest & {
  memberCode: string;
  slipFileId: string;
  slipCheck: SlipCheck;
  reviewedBy: string;
  reviewedAt: string;
  approvedBy: string;
  approvedAt: string;
  completedBy: string;
  completedAt: string;
  rejectedBy: string;
  rejectedAt: string;
};

export type ListRequestsPayload = {
  status?: RequestStatus;
  type?: RequestType;
  /** YYYY-MM-DD ตามวันทำการที่จะดำเนินการ */
  processingDate?: string;
};

export type Holiday = { date: string; name: string };

// ---------- กลุ่ม LINE ของเจ้าหน้าที่ ----------

export type LineGroup = { groupId: string; groupName: string; joinedAt: string };

export type LineGroupSettings = {
  groups: LineGroup[];
  staffGroupId: string;
  /** ลิงก์หน้าเว็บเจ้าหน้าที่ ต่อท้ายข้อความแจ้งเตือนในกลุ่ม */
  staffWebUrl: string;
};

export type UpdateNotificationSettingsPayload = { staffGroupId?: string; staffWebUrl?: string };
