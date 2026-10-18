// นำเข้าข้อมูลบัญชีเงินฝากจากไฟล์ที่ export จากระบบหลัก (ticket 03)
import {
  ACCOUNT_TYPE_LABELS,
  IMPORT_MAX_FILE_BYTES,
  type AccountType,
  type ApiAuth,
  type DepositAccountImportStatus,
  type ImportAccountsResult,
  type ImportRowError,
} from '../../../shared/api';
import type { DepositAccount, Deps } from '../adapters/ports';
import { AppError } from './errors';
import { normalizeMemberCode, normalizeNationalId } from './identifiers';
import { requireStaff } from './staff';
import { requirePayload, requireString } from './validate';

type Column = Exclude<keyof DepositAccount, 'importedAt'>;

/** ชื่อหัวคอลัมน์ที่ยอมรับ (ไม่สนช่องว่าง) ชื่อแรกคือชื่อที่แสดงในข้อความแจ้ง */
const COLUMN_HEADERS: Record<Column, string[]> = {
  seq: ['ลำดับ', 'ลำดับที่'],
  accountNumber: ['หมายเลขบัญชี', 'เลขที่บัญชี', 'เลขบัญชี'],
  memberCode: ['รหัสสมาชิก'],
  nationalId: ['หมายเลขบัตรประชาชน', 'เลขบัตรประชาชน', 'เลขประจำตัวประชาชน'],
  accountName: ['ชื่อบัญชีเงินฝาก', 'ชื่อบัญชี'],
  accountType: ['ประเภทบัญชี', 'ประเภทบัญชีเงินฝาก'],
  lastContactDate: ['ข้อมูลติดต่อล่าสุด', 'วันที่ติดต่อล่าสุด'],
};

const COLUMNS = Object.keys(COLUMN_HEADERS) as Column[];
const HEADER_SEARCH_ROWS = 10;
const MAX_REPORTED_ERRORS = 100;
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

export function importAccounts(
  input: { auth?: ApiAuth; payload?: unknown },
  deps: Deps,
): ImportAccountsResult {
  const staff = requireStaff(input.auth, deps, 'systemAdministrator');
  const payload = requirePayload(input.payload);
  const fileName = requireString(payload.fileName, 'ไฟล์');
  const contentBase64 = requireString(payload.contentBase64, 'ไฟล์');

  if (!ALLOWED_EXTENSIONS.some((ext) => fileName.toLowerCase().endsWith(ext))) {
    throw new AppError('VALIDATION', 'รองรับเฉพาะไฟล์ .xlsx, .xls หรือ .csv');
  }
  if ((contentBase64.length * 3) / 4 > IMPORT_MAX_FILE_BYTES) {
    throw new AppError('VALIDATION', 'ไฟล์ใหญ่เกิน 10MB');
  }

  const rows = deps.files.readSpreadsheetRows(fileName, contentBase64);
  if (!rows) {
    throw new AppError('VALIDATION', 'อ่านไฟล์ไม่ได้ ตรวจว่าเป็นไฟล์ Excel หรือ CSV ที่ไม่เสียหาย');
  }

  const now = deps.clock.now().toISOString();
  const parsed = parseRows(rows, now);
  if (parsed.errors.length > 0) {
    return {
      status: 'rejected',
      errors: parsed.errors.slice(0, MAX_REPORTED_ERRORS),
      totalErrors: parsed.errors.length,
    };
  }

  const memberCount = new Set(parsed.accounts.map((a) => a.memberCode)).size;
  deps.data.withLock(() => {
    deps.data.replaceDepositAccounts(parsed.accounts);
    deps.data.appendAuditLog({
      at: now,
      actor: staff.username,
      action: 'importAccounts',
      target: 'บัญชีเงินฝาก',
      detail: `${fileName}: ${parsed.accounts.length} บัญชี, ${memberCount} สมาชิก`,
    });
  });
  return { status: 'imported', rowCount: parsed.accounts.length, memberCount, importedAt: now };
}

export function depositAccountImportStatus(
  input: { auth?: ApiAuth },
  deps: Deps,
): DepositAccountImportStatus {
  requireStaff(input.auth, deps, 'systemAdministrator');
  const accounts = deps.data.listDepositAccounts();
  return {
    rowCount: accounts.length,
    memberCount: new Set(accounts.map((a) => a.memberCode)).size,
    importedAt: accounts[0]?.importedAt || null,
  };
}

// ---------- การอ่านและตรวจไฟล์ ----------

function parseRows(
  rows: string[][],
  importedAt: string,
): { accounts: DepositAccount[]; errors: ImportRowError[] } {
  const header = findHeader(rows);
  if ('missing' in header) {
    return {
      accounts: [],
      errors: [
        {
          row: 0,
          message: `ไม่พบคอลัมน์: ${header.missing.join(', ')} (แถวหัวตารางต้องอยู่ใน ${HEADER_SEARCH_ROWS} แถวแรก)`,
        },
      ],
    };
  }

  const accounts: DepositAccount[] = [];
  const errors: ImportRowError[] = [];
  const firstRowOfAccount = new Map<string, number>();
  const nationalIdOfMember = new Map<string, { nationalId: string; row: number }>();
  const memberOfNationalId = new Map<string, { memberCode: string; row: number }>();

  for (let i = header.rowIndex + 1; i < rows.length; i++) {
    const cells = rows[i];
    if (cells.every((cell) => !String(cell ?? '').trim())) continue;

    const rowNumber = i + 1;
    const cell = (column: Column) => String(cells[header.indexes[column]] ?? '').trim();
    const problems: string[] = [];

    const accountNumber = cell('accountNumber');
    if (!accountNumber) problems.push('ไม่มีหมายเลขบัญชี');
    else if (firstRowOfAccount.has(accountNumber)) {
      problems.push(`หมายเลขบัญชีซ้ำกับแถว ${firstRowOfAccount.get(accountNumber)}`);
    }

    const memberCode = normalizeMemberCode(cell('memberCode'));
    if (!memberCode) problems.push(`รหัสสมาชิก "${cell('memberCode')}" ไม่ใช่ตัวเลข 1–5 หลัก`);

    const nationalId = normalizeNationalId(cell('nationalId'));
    if (!nationalId) problems.push('เลขบัตรประชาชนไม่ถูกต้อง');

    const accountName = cell('accountName');
    if (!accountName) problems.push('ไม่มีชื่อบัญชี');

    const accountType = parseAccountType(cell('accountType'));
    if (!accountType) {
      problems.push(
        `ประเภทบัญชี "${cell('accountType')}" ต้องเป็น ${Object.values(ACCOUNT_TYPE_LABELS).join(' หรือ ')}`,
      );
    }

    // สมาชิกหนึ่งคนมีเลขบัตรประชาชนเดียว และเลขบัตรประชาชนหนึ่งเลขเป็นของสมาชิกคนเดียว
    if (memberCode && nationalId) {
      const known = nationalIdOfMember.get(memberCode);
      const owner = memberOfNationalId.get(nationalId);
      if (known && known.nationalId !== nationalId) {
        problems.push(`รหัสสมาชิก ${memberCode} มีเลขบัตรประชาชนไม่ตรงกับแถว ${known.row}`);
      } else if (owner && owner.memberCode !== memberCode) {
        problems.push(`เลขบัตรประชาชนซ้ำกับรหัสสมาชิก ${owner.memberCode} ในแถว ${owner.row}`);
      } else if (!known) {
        nationalIdOfMember.set(memberCode, { nationalId, row: rowNumber });
        memberOfNationalId.set(nationalId, { memberCode, row: rowNumber });
      }
    }

    if (accountNumber && !firstRowOfAccount.has(accountNumber)) {
      firstRowOfAccount.set(accountNumber, rowNumber);
    }

    if (problems.length > 0) {
      errors.push({ row: rowNumber, message: problems.join(', ') });
      continue;
    }
    accounts.push({
      seq: cell('seq'),
      accountNumber,
      memberCode: memberCode!,
      nationalId: nationalId!,
      accountName,
      accountType: accountType!,
      lastContactDate: cell('lastContactDate'),
      importedAt,
    });
  }

  if (errors.length === 0 && accounts.length === 0) {
    errors.push({ row: 0, message: 'ไม่มีข้อมูลบัญชีในไฟล์' });
  }
  return { accounts, errors };
}

function findHeader(
  rows: string[][],
): { rowIndex: number; indexes: Record<Column, number> } | { missing: string[] } {
  let best: { rowIndex: number; indexes: Partial<Record<Column, number>>; found: number } | null = null;

  for (let r = 0; r < Math.min(rows.length, HEADER_SEARCH_ROWS); r++) {
    const normalized = rows[r].map((cell) => String(cell ?? '').replace(/\s+/g, ''));
    const indexes: Partial<Record<Column, number>> = {};
    for (const column of COLUMNS) {
      const index = normalized.findIndex((cell) => COLUMN_HEADERS[column].includes(cell));
      if (index >= 0) indexes[column] = index;
    }
    const found = Object.keys(indexes).length;
    if (!best || found > best.found) best = { rowIndex: r, indexes, found };
  }

  const missing = COLUMNS.filter((column) => best?.indexes[column] === undefined);
  if (!best || missing.length > 0) {
    return { missing: missing.map((column) => COLUMN_HEADERS[column][0]) };
  }
  return { rowIndex: best.rowIndex, indexes: best.indexes as Record<Column, number> };
}

function parseAccountType(value: string): AccountType | null {
  const compact = value.replace(/\s+/g, '');
  const entry = Object.entries(ACCOUNT_TYPE_LABELS).find(([, label]) => label === compact);
  return entry ? (entry[0] as AccountType) : null;
}
