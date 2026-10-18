import { STAFF_ROLES, type StaffRole } from '../../../../shared/api';
import type { DataStore, LineBinding, StaffAccount, StaffSession } from '../ports';
import { SheetTable, type Row } from './sheetTable';

export const SHEET_LINE_BINDINGS = 'การผูกบัญชีLINE';
export const SHEET_STAFF = 'เจ้าหน้าที่';

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
 */
export function createSheetsDataStore(spreadsheetId: string): DataStore {
  let cachedBook: GoogleAppsScript.Spreadsheet.Spreadsheet | null = null;
  const book = () => (cachedBook ??= SpreadsheetApp.openById(spreadsheetId));
  const bindings = new SheetTable(book, SHEET_LINE_BINDINGS, [
    'memberCode',
    'lineUserId',
    'unboundAt',
  ]);
  const staffTable = new SheetTable(book, SHEET_STAFF, STAFF_COLUMNS);
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
      return row ? { memberCode: row.memberCode, lineUserId } : null;
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
