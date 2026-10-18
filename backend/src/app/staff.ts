// เจ้าหน้าที่: เข้าระบบ, session และการจัดการบัญชีเจ้าหน้าที่ (ticket 02)
import {
  STAFF_PASSWORD_MIN_LENGTH,
  STAFF_ROLES,
  type ApiAuth,
  type StaffListItem,
  type StaffLoginResult,
  type StaffProfile,
  type StaffRole,
} from '../../../shared/api';
import type { Deps, StaffAccount } from '../adapters/ports';
import { AppError } from './errors';
import { hashSecret, hashToken, verifySecret } from './secrets';
import { formatBangkokTime, requirePayload, requireString } from './validate';

const SESSION_HOURS = 8;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

// ---------- การยืนยันตัวตน ----------

/** ตรวจ session ของเจ้าหน้าที่ และบทบาทถ้าระบุ แล้วคืนบัญชีเจ้าหน้าที่ */
export function requireStaff(auth: ApiAuth | undefined, deps: Deps, role?: StaffRole): StaffAccount {
  const token = auth && 'sessionToken' in auth ? auth.sessionToken : '';
  const expired = new AppError('UNAUTHENTICATED', 'หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบใหม่');
  if (!token) throw expired;

  const tokenHash = hashToken(token);
  const session = deps.data.getSession(tokenHash);
  if (!session || deps.clock.now().getTime() >= Date.parse(session.expiresAt)) {
    if (session) deps.data.deleteSession(tokenHash);
    throw expired;
  }

  const staff = deps.data.findStaff(session.username);
  if (!staff || !staff.active || staff.passwordSalt !== session.passwordSalt) {
    deps.data.deleteSession(tokenHash);
    throw expired;
  }
  if (role && !staff.roles.includes(role)) {
    throw new AppError('FORBIDDEN', 'คุณไม่มีสิทธิ์ใช้งานส่วนนี้');
  }
  return staff;
}

export function staffLogin(input: { payload?: unknown }, deps: Deps): StaffLoginResult {
  const payload = requirePayload(input.payload);
  const username = normalizeUsername(payload.username);
  const password = typeof payload.password === 'string' ? payload.password : '';
  const invalid = new AppError('INVALID_CREDENTIALS', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');

  return deps.data.withLock(() => {
    const staff = deps.data.findStaff(username);
    if (!staff || !staff.active) throw invalid;

    const now = deps.clock.now();
    if (staff.lockedUntil && now.getTime() < Date.parse(staff.lockedUntil)) {
      throw lockedError(new Date(staff.lockedUntil));
    }

    if (!verifySecret(password, staff.passwordSalt, staff.passwordHash)) {
      staff.failedAttempts += 1;
      if (staff.failedAttempts >= MAX_FAILED_ATTEMPTS) {
        const lockedUntil = new Date(now.getTime() + LOCK_MINUTES * 60_000);
        deps.data.saveStaff({ ...staff, failedAttempts: 0, lockedUntil: lockedUntil.toISOString() });
        throw lockedError(lockedUntil);
      }
      deps.data.saveStaff({ ...staff, lockedUntil: '' });
      throw invalid;
    }

    deps.data.saveStaff({ ...staff, failedAttempts: 0, lockedUntil: '' });

    const sessionToken = (deps.random.uuid() + deps.random.uuid()).replace(/-/g, '');
    const expiresAt = new Date(now.getTime() + SESSION_HOURS * 60 * 60_000).toISOString();
    deps.data.putSession(hashToken(sessionToken), {
      username: staff.username,
      passwordSalt: staff.passwordSalt,
      issuedAt: now.toISOString(),
      expiresAt,
    });
    return { sessionToken, expiresAt, staff: toProfile(staff) };
  });
}

export function staffLogout(input: { auth?: ApiAuth }, deps: Deps): Record<string, never> {
  const token = input.auth && 'sessionToken' in input.auth ? input.auth.sessionToken : '';
  if (token) deps.data.deleteSession(hashToken(token));
  return {};
}

export function staffMe(input: { auth?: ApiAuth }, deps: Deps): StaffProfile {
  return toProfile(requireStaff(input.auth, deps));
}

// ---------- การจัดการบัญชีเจ้าหน้าที่ (ผู้ดูแลระบบ) ----------

export function listStaff(input: { auth?: ApiAuth }, deps: Deps): StaffListItem[] {
  requireStaff(input.auth, deps, 'systemAdministrator');
  const now = deps.clock.now();
  return deps.data
    .listStaff()
    .map((s) => toListItem(s, now))
    .sort((a, b) => a.username.localeCompare(b.username));
}

export function createStaff(input: { auth?: ApiAuth; payload?: unknown }, deps: Deps): StaffListItem {
  requireStaff(input.auth, deps, 'systemAdministrator');
  return insertStaff(input.payload, deps);
}

export function updateStaff(input: { auth?: ApiAuth; payload?: unknown }, deps: Deps): StaffListItem {
  requireStaff(input.auth, deps, 'systemAdministrator');
  const payload = requirePayload(input.payload);
  const username = normalizeUsername(payload.username);

  return deps.data.withLock(() => {
    const staff = findStaffOrThrow(username, deps);
    const updated: StaffAccount = { ...staff };
    if (payload.fullName !== undefined) updated.fullName = validateFullName(payload.fullName);
    if (payload.roles !== undefined) updated.roles = validateRoles(payload.roles);
    if (payload.active !== undefined) {
      if (typeof payload.active !== 'boolean') throw new AppError('BAD_REQUEST', 'รูปแบบคำขอไม่ถูกต้อง');
      updated.active = payload.active;
    }

    const activeAdministrators = deps.data
      .listStaff()
      .map((s) => (s.username === username ? updated : s))
      .filter((s) => s.active && s.roles.includes('systemAdministrator'));
    if (activeAdministrators.length === 0) {
      throw new AppError('CONFLICT', 'ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน');
    }

    deps.data.saveStaff(updated);
    return toListItem(updated, deps.clock.now());
  });
}

export function resetStaffPassword(
  input: { auth?: ApiAuth; payload?: unknown },
  deps: Deps,
): StaffListItem {
  requireStaff(input.auth, deps, 'systemAdministrator');
  const payload = requirePayload(input.payload);
  const username = normalizeUsername(payload.username);
  const newPassword = validatePassword(payload.newPassword);

  return deps.data.withLock(() => {
    const staff = findStaffOrThrow(username, deps);
    const now = deps.clock.now();
    const salt = deps.random.uuid();
    const updated: StaffAccount = {
      ...staff,
      passwordSalt: salt,
      passwordHash: hashSecret(newPassword, salt),
      passwordChangedAt: now.toISOString(),
      failedAttempts: 0,
      lockedUntil: '',
    };
    deps.data.saveStaff(updated);
    return toListItem(updated, now);
  });
}

/** สร้างผู้ดูแลระบบคนแรก ใช้ได้เฉพาะตอนที่ยังไม่มีเจ้าหน้าที่เลย (เรียกจาก editor ของ Apps Script) */
export function bootstrapFirstAdministrator(
  account: { username: string; fullName: string; password: string },
  deps: Deps,
): StaffListItem {
  return deps.data.withLock(() => {
    if (deps.data.listStaff().length > 0) {
      throw new AppError('CONFLICT', 'มีบัญชีเจ้าหน้าที่อยู่แล้ว ให้ผู้ดูแลระบบสร้างบัญชีจากหน้าเว็บแทน');
    }
    return insertStaff({ ...account, roles: ['systemAdministrator'] }, deps);
  });
}

// ---------- ส่วนช่วย ----------

function insertStaff(rawPayload: unknown, deps: Deps): StaffListItem {
  const payload = requirePayload(rawPayload);
  const username = normalizeUsername(payload.username);
  if (!USERNAME_PATTERN.test(username)) {
    throw new AppError(
      'VALIDATION',
      'ชื่อผู้ใช้ต้องยาว 3–32 ตัวอักษร ใช้ได้เฉพาะ a-z, 0-9, จุด, ขีดกลาง และขีดล่าง',
    );
  }
  const fullName = validateFullName(payload.fullName);
  const roles = validateRoles(payload.roles);
  const password = validatePassword(payload.password);

  return deps.data.withLock(() => {
    if (deps.data.findStaff(username)) {
      throw new AppError('CONFLICT', 'ชื่อผู้ใช้นี้มีอยู่แล้ว');
    }
    const now = deps.clock.now();
    const salt = deps.random.uuid();
    const staff: StaffAccount = {
      username,
      fullName,
      roles,
      passwordSalt: salt,
      passwordHash: hashSecret(password, salt),
      passwordChangedAt: now.toISOString(),
      failedAttempts: 0,
      lockedUntil: '',
      active: true,
      createdAt: now.toISOString(),
    };
    deps.data.saveStaff(staff);
    return toListItem(staff, now);
  });
}

function findStaffOrThrow(username: string, deps: Deps): StaffAccount {
  const staff = deps.data.findStaff(username);
  if (!staff) throw new AppError('NOT_FOUND', 'ไม่พบบัญชีเจ้าหน้าที่นี้');
  return staff;
}

function normalizeUsername(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validateFullName(value: unknown): string {
  const fullName = requireString(value, 'ชื่อ-สกุล').trim();
  if (fullName.length > 100) throw new AppError('VALIDATION', 'ชื่อ-สกุลยาวเกิน 100 ตัวอักษร');
  return fullName;
}

function validateRoles(value: unknown): StaffRole[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AppError('VALIDATION', 'กรุณาเลือกบทบาทอย่างน้อย 1 บทบาท');
  }
  if (!value.every((role) => STAFF_ROLES.includes(role as StaffRole))) {
    throw new AppError('VALIDATION', 'บทบาทไม่ถูกต้อง');
  }
  return STAFF_ROLES.filter((role) => value.includes(role));
}

function validatePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < STAFF_PASSWORD_MIN_LENGTH) {
    throw new AppError('VALIDATION', `รหัสผ่านต้องยาวอย่างน้อย ${STAFF_PASSWORD_MIN_LENGTH} ตัวอักษร`);
  }
  return value;
}

function lockedError(lockedUntil: Date): AppError {
  return new AppError(
    'ACCOUNT_LOCKED',
    `ใส่รหัสผ่านผิดเกิน ${MAX_FAILED_ATTEMPTS} ครั้ง บัญชีถูกล็อกชั่วคราว ลองใหม่ได้หลังเวลา ${formatBangkokTime(lockedUntil)} น.`,
  );
}

function toProfile(staff: StaffAccount): StaffProfile {
  return { username: staff.username, fullName: staff.fullName, roles: [...staff.roles] };
}

function toListItem(staff: StaffAccount, now: Date): StaffListItem {
  return {
    ...toProfile(staff),
    active: staff.active,
    locked: Boolean(staff.lockedUntil) && now.getTime() < Date.parse(staff.lockedUntil),
    createdAt: staff.createdAt,
  };
}
