import {
  STAFF_ROLES,
  type AccountType,
  type Holiday,
  type LineGroup,
  type PayoutAccountStatus,
  type RequestStatus,
  type RequestType,
  type SlipCheck,
  type StaffRole,
} from '../../../../shared/api';
import type {
  AuditEntry,
  BindingThrottle,
  DataStore,
  DepositAccount,
  LineBinding,
  MemberRequest,
  PayoutAccount,
  StaffAccount,
  StaffSession,
} from '../ports';
import { SheetTable, type Row } from './sheetTable';

export const SHEET_LINE_BINDINGS = 'การผูกบัญชีLINE';
export const SHEET_STAFF = 'เจ้าหน้าที่';
export const SHEET_DEPOSIT_ACCOUNTS = 'บัญชีเงินฝาก';
export const SHEET_AUDIT_LOG = 'บันทึกการใช้งาน';

const DEPOSIT_ACCOUNT_COLUMNS = [
  'seq',
  'accountNumber',
  'memberCode',
  'nationalId',
  'accountName',
  'accountType',
  'lastContactDate',
  'importedAt',
] as const;

const AUDIT_COLUMNS = ['at', 'actor', 'action', 'target', 'detail'] as const;

const BINDING_COLUMNS = [
  'id',
  'memberCode',
  'lineUserId',
  'pinHash',
  'pinSalt',
  'pinFailedAttempts',
  'pinLocked',
  'consentVersion',
  'consentAt',
  'boundAt',
  'unboundAt',
  'unboundBy',
] as const;

const THROTTLE_KEY_PREFIX = 'bindingThrottle:';

export const SHEET_PAYOUT_ACCOUNTS = 'บัญชีรับเงิน';
export const SHEET_SETTINGS = 'ตั้งค่า';
export const SHEET_LINE_GROUPS = 'กลุ่มLINE';

const PAYOUT_COLUMNS = [
  'id',
  'memberCode',
  'bankCode',
  'accountNumber',
  'accountName',
  'status',
  'idCardFileId',
  'depositBookFileId',
  'payoutBookFileId',
  'createdAt',
  'reviewedBy',
  'reviewedAt',
  'rejectReason',
  'retiredAt',
] as const;

const SETTING_COLUMNS = ['key', 'value'] as const;

export const SHEET_REQUESTS = 'คำขอ';
export const SHEET_HOLIDAYS = 'วันหยุด';

const REQUEST_COLUMNS = [
  'id',
  'requestNumber',
  'type',
  'memberCode',
  'accountNumber',
  'accountName',
  'accountType',
  'amount',
  'payoutAccountId',
  'signatureFileId',
  'slipFileId',
  'transferredAt',
  'slipCheck',
  'slipRef',
  'status',
  'reviewedBy',
  'reviewedAt',
  'approvedBy',
  'approvedAt',
  'completedBy',
  'completedAt',
  'rejectedBy',
  'rejectedAt',
  'rejectReason',
  'cancelledAt',
  'pdfFileId',
  'submittedAt',
  'processingDate',
] as const;

const HOLIDAY_COLUMNS = ['date', 'name'] as const;
const LINE_GROUP_COLUMNS = ['groupId', 'groupName', 'joinedAt'] as const;

const STAFF_COLUMNS = [
  'username',
  'fullName',
  'roles',
  'passwordHash',
  'passwordSalt',
  'passwordChangedAt',
  'failedAttempts',
  'lockedUntil',
  'active',
  'createdAt',
] as const;

const LOCK_TIMEOUT_MS = 30_000;
const SESSION_KEY_PREFIX = 'staffSession:';

/**
 * ที่เก็บข้อมูลจริง: ตารางอยู่ใน Google Sheets ส่วน session ของเจ้าหน้าที่อยู่ใน UserProperties
 * ของบัญชีที่ deploy (CacheService เก็บได้นานสุด 6 ชั่วโมง ไม่พอสำหรับ session 8 ชั่วโมง)
 * และตัวนับการผูกบัญชีผิดอยู่ใน CacheService เพราะเป็นข้อมูลชั่วคราวที่หมดอายุเอง
 */
export function createSheetsDataStore(spreadsheetId: string): DataStore {
  let cachedBook: GoogleAppsScript.Spreadsheet.Spreadsheet | null = null;
  const book = () => (cachedBook ??= SpreadsheetApp.openById(spreadsheetId));
  const bindings = new SheetTable(book, SHEET_LINE_BINDINGS, BINDING_COLUMNS);
  // CacheService เก็บข้อมูลชั่วคราว: ตัวนับการผูกบัญชีผิด และผลอ่านสลิป
  const throttles = () => CacheService.getScriptCache();
  const staffTable = new SheetTable(book, SHEET_STAFF, STAFF_COLUMNS);
  const depositAccounts = new SheetTable(book, SHEET_DEPOSIT_ACCOUNTS, DEPOSIT_ACCOUNT_COLUMNS);
  const auditLog = new SheetTable(book, SHEET_AUDIT_LOG, AUDIT_COLUMNS);
  const payouts = new SheetTable(book, SHEET_PAYOUT_ACCOUNTS, PAYOUT_COLUMNS);
  const settings = new SheetTable(book, SHEET_SETTINGS, SETTING_COLUMNS);
  const lineGroups = new SheetTable(book, SHEET_LINE_GROUPS, LINE_GROUP_COLUMNS);
  const requests = new SheetTable(book, SHEET_REQUESTS, REQUEST_COLUMNS);
  const holidays = new SheetTable(book, SHEET_HOLIDAYS, HOLIDAY_COLUMNS);
  const sessions = () => PropertiesService.getUserProperties();
  let lockDepth = 0;

  return {
    withLock<T>(fn: () => T): T {
      // reentrant: action ที่ถือ lock อยู่แล้วเรียกส่วนที่ขอ lock ซ้ำได้
      if (lockDepth > 0) {
        lockDepth++;
        try {
          return fn();
        } finally {
          lockDepth--;
        }
      }
      const lock = LockService.getScriptLock();
      lock.waitLock(LOCK_TIMEOUT_MS);
      lockDepth = 1;
      try {
        const result = fn();
        SpreadsheetApp.flush();
        return result;
      } finally {
        lockDepth = 0;
        lock.releaseLock();
      }
    },

    findActiveBindingByLineUserId(lineUserId: string): LineBinding | null {
      const row = bindings.readAll().find((r) => r.lineUserId === lineUserId && !r.unboundAt);
      return row ? rowToBinding(row) : null;
    },

    findActiveBindingByMemberCode(memberCode: string): LineBinding | null {
      const row = bindings.readAll().find((r) => r.memberCode === memberCode && !r.unboundAt);
      return row ? rowToBinding(row) : null;
    },

    saveBinding(binding: LineBinding): void {
      bindings.upsert('id', bindingToRow(binding));
    },

    getCache: (key: string) => throttles().get(key),

    putCache(key: string, value: string, ttlSeconds: number): void {
      throttles().put(key, value, ttlSeconds);
    },

    getBindingThrottle(lineUserId: string): BindingThrottle | null {
      const raw = throttles().get(THROTTLE_KEY_PREFIX + lineUserId);
      return raw ? (JSON.parse(raw) as BindingThrottle) : null;
    },

    putBindingThrottle(lineUserId: string, throttle: BindingThrottle, ttlSeconds: number): void {
      throttles().put(THROTTLE_KEY_PREFIX + lineUserId, JSON.stringify(throttle), ttlSeconds);
    },

    listDepositAccounts: () =>
      depositAccounts.readAll().map((row) => ({ ...(row as Record<keyof DepositAccount, string>), accountType: row.accountType as AccountType })),

    replaceDepositAccounts(accounts: DepositAccount[]): void {
      depositAccounts.replaceAll(accounts.map((account) => ({ ...account })));
    },

    appendAuditLog(entry: AuditEntry): void {
      auditLog.append({ ...entry });
    },

    listPayoutAccounts: () =>
      payouts.readAll().map((row) => ({
        ...(row as Record<keyof PayoutAccount, string>),
        status: row.status as PayoutAccountStatus,
      })),

    savePayoutAccount(account: PayoutAccount): void {
      payouts.upsert('id', { ...account });
    },

    getSetting: (key: string) => settings.readAll().find((r) => r.key === key)?.value ?? '',

    setSetting(key: string, value: string): void {
      settings.upsert('key', { key, value });
    },

    listRequests: () => requests.readAll().map(rowToRequest),

    saveRequest(request: MemberRequest): void {
      requests.upsert('id', { ...request, amount: request.amount.toFixed(2) });
    },

    listHolidays: () => holidays.readAll() as Holiday[],

    saveHoliday(holiday: Holiday): void {
      holidays.upsert('date', { ...holiday });
    },

    deleteHoliday(date: string): void {
      holidays.deleteWhere('date', date);
    },

    listLineGroups: () => lineGroups.readAll() as LineGroup[],

    saveLineGroup(group: LineGroup): void {
      lineGroups.upsert('groupId', { ...group });
    },

    listStaff: () => staffTable.readAll().map(rowToStaff),

    findStaff(username: string): StaffAccount | null {
      const row = staffTable.readAll().find((r) => r.username === username);
      return row ? rowToStaff(row) : null;
    },

    saveStaff(staff: StaffAccount): void {
      staffTable.upsert('username', staffToRow(staff));
    },

    putSession(tokenHash: string, session: StaffSession): void {
      const props = sessions();
      removeExpiredSessions(props);
      props.setProperty(SESSION_KEY_PREFIX + tokenHash, JSON.stringify(session));
    },

    getSession(tokenHash: string): StaffSession | null {
      const raw = sessions().getProperty(SESSION_KEY_PREFIX + tokenHash);
      return raw ? (JSON.parse(raw) as StaffSession) : null;
    },

    deleteSession(tokenHash: string): void {
      sessions().deleteProperty(SESSION_KEY_PREFIX + tokenHash);
    },
  };
}

function removeExpiredSessions(props: GoogleAppsScript.Properties.Properties): void {
  const now = Date.now();
  for (const [key, raw] of Object.entries(props.getProperties())) {
    if (!key.startsWith(SESSION_KEY_PREFIX)) continue;
    const session = JSON.parse(raw) as StaffSession;
    if (Date.parse(session.expiresAt) <= now) props.deleteProperty(key);
  }
}

function rowToRequest(row: Row): MemberRequest {
  return {
    ...(row as Record<keyof MemberRequest, string>),
    type: row.type as RequestType,
    accountType: row.accountType as AccountType,
    amount: Number(row.amount) || 0,
    slipCheck: (row.slipCheck || 'notChecked') as SlipCheck,
    status: row.status as RequestStatus,
  };
}

function rowToBinding(row: Row): LineBinding {
  return {
    id: row.id,
    memberCode: row.memberCode,
    lineUserId: row.lineUserId,
    pinHash: row.pinHash,
    pinSalt: row.pinSalt,
    pinFailedAttempts: Number(row.pinFailedAttempts) || 0,
    pinLocked: row.pinLocked.toUpperCase() === 'TRUE',
    consentVersion: row.consentVersion,
    consentAt: row.consentAt,
    boundAt: row.boundAt,
    unboundAt: row.unboundAt,
    unboundBy: row.unboundBy,
  };
}

function bindingToRow(binding: LineBinding): Row {
  return {
    ...binding,
    pinFailedAttempts: String(binding.pinFailedAttempts),
    pinLocked: binding.pinLocked ? 'TRUE' : 'FALSE',
  };
}

function rowToStaff(row: Row): StaffAccount {
  return {
    username: row.username,
    fullName: row.fullName,
    roles: row.roles
      .split(',')
      .map((role) => role.trim())
      .filter((role): role is StaffRole => STAFF_ROLES.includes(role as StaffRole)),
    passwordHash: row.passwordHash,
    passwordSalt: row.passwordSalt,
    passwordChangedAt: row.passwordChangedAt,
    failedAttempts: Number(row.failedAttempts) || 0,
    lockedUntil: row.lockedUntil,
    active: row.active.toUpperCase() === 'TRUE',
    createdAt: row.createdAt,
  };
}

function staffToRow(staff: StaffAccount): Row {
  return {
    username: staff.username,
    fullName: staff.fullName,
    roles: staff.roles.join(','),
    passwordHash: staff.passwordHash,
    passwordSalt: staff.passwordSalt,
    passwordChangedAt: staff.passwordChangedAt,
    failedAttempts: String(staff.failedAttempts),
    lockedUntil: staff.lockedUntil,
    active: staff.active ? 'TRUE' : 'FALSE',
    createdAt: staff.createdAt,
  };
}
