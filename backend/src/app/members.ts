// สมาชิก: การผูกบัญชี LINE, PIN และบัญชีเงินฝากของตนเอง (ticket 04)
import {
  PIN_LENGTH,
  PRIVACY_POLICY_VERSION,
  type ApiAuth,
  type BindLineAccountResult,
  type MeResult,
  type MyAccount,
} from '../../../shared/api';
import type { Deps, LineBinding, LineUser } from '../adapters/ports';
import { requireLineUser } from './auth';
import { AppError } from './errors';
import { normalizeMemberCode, normalizeNationalId } from './identifiers';
import { hashSecret } from './secrets';
import { formatBangkokTime, requirePayload } from './validate';

const MAX_BINDING_FAILURES = 5;
const BINDING_WINDOW_MINUTES = 60;
const BINDING_LOCK_MINUTES = 60;

/** ผู้ใช้ LINE ที่ผูกบัญชีแล้ว */
export function requireMember(
  auth: ApiAuth | undefined,
  deps: Deps,
): { user: LineUser; binding: LineBinding } {
  const user = requireLineUser(auth, deps);
  const binding = deps.data.findActiveBindingByLineUserId(user.userId);
  if (!binding) {
    throw new AppError('NOT_BOUND', 'กรุณาผูกบัญชี LINE กับรหัสสมาชิกก่อน');
  }
  return { user, binding };
}

export function me(input: { auth?: ApiAuth }, deps: Deps): MeResult {
  const user = requireLineUser(input.auth, deps);
  const binding = deps.data.findActiveBindingByLineUserId(user.userId);
  if (!binding) {
    return { bound: false, displayName: user.displayName };
  }
  return {
    bound: true,
    displayName: user.displayName,
    memberCode: binding.memberCode,
    memberName: memberName(binding.memberCode, deps),
    pinSet: Boolean(binding.pinHash),
    pinLocked: binding.pinLocked,
  };
}

export function bindLineAccount(
  input: { auth?: ApiAuth; payload?: unknown },
  deps: Deps,
): BindLineAccountResult {
  const user = requireLineUser(input.auth, deps);
  const payload = requirePayload(input.payload);

  if (payload.acceptedPolicyVersion !== PRIVACY_POLICY_VERSION) {
    throw new AppError('VALIDATION', 'กรุณาอ่านและยอมรับนโยบายความเป็นส่วนตัวฉบับล่าสุดก่อน');
  }
  const memberCode = normalizeMemberCode(String(payload.memberCode ?? ''));
  if (!memberCode) {
    throw new AppError('VALIDATION', 'รหัสสมาชิกต้องเป็นตัวเลขไม่เกิน 5 หลัก');
  }
  const nationalId = normalizeNationalId(String(payload.nationalId ?? ''));
  if (!nationalId) {
    throw new AppError('VALIDATION', 'เลขบัตรประชาชนไม่ถูกต้อง ตรวจว่าครบ 13 หลัก');
  }

  return deps.data.withLock(() => {
    const now = deps.clock.now();
    const existing = deps.data.findActiveBindingByLineUserId(user.userId);
    if (existing) {
      throw new AppError('CONFLICT', `บัญชี LINE นี้ผูกกับรหัสสมาชิก ${existing.memberCode} อยู่แล้ว`);
    }

    const throttle = deps.data.getBindingThrottle(user.userId);
    if (throttle?.lockedUntil && now.getTime() < Date.parse(throttle.lockedUntil)) {
      throw bindingLockedError(new Date(throttle.lockedUntil));
    }

    const matches = deps.data
      .listDepositAccounts()
      .some((a) => a.memberCode === memberCode && a.nationalId === nationalId);
    if (!matches) {
      recordBindingFailure(user.userId, throttle, now, deps);
      throw new AppError(
        'INVALID_CREDENTIALS',
        'รหัสสมาชิกหรือเลขบัตรประชาชนไม่ตรงกับข้อมูลของสหกรณ์',
      );
    }

    if (deps.data.findActiveBindingByMemberCode(memberCode)) {
      throw new AppError(
        'CONFLICT',
        'รหัสสมาชิกนี้ผูกกับบัญชี LINE อื่นอยู่แล้ว กรุณาติดต่อสหกรณ์เพื่อยกเลิกการผูกเดิม',
      );
    }

    const at = now.toISOString();
    deps.data.saveBinding({
      id: deps.random.uuid(),
      memberCode,
      lineUserId: user.userId,
      pinHash: '',
      pinSalt: '',
      pinFailedAttempts: 0,
      pinLocked: false,
      consentVersion: PRIVACY_POLICY_VERSION,
      consentAt: at,
      boundAt: at,
      unboundAt: '',
      unboundBy: '',
    });
    deps.data.appendAuditLog({
      at,
      actor: `member:${memberCode}`,
      action: 'bindLineAccount',
      target: memberCode,
      detail: `ยินยอมนโยบาย ${PRIVACY_POLICY_VERSION}`,
    });
    return { memberCode, memberName: memberName(memberCode, deps) };
  });
}

/** ตั้ง PIN ครั้งแรก หรือหลังผู้ดูแลระบบรีเซ็ต (เปลี่ยน PIN ใช้ changePin ใน ticket 05) */
export function setPin(input: { auth?: ApiAuth; payload?: unknown }, deps: Deps): { pinSet: true } {
  const { binding } = requireMember(input.auth, deps);
  const pin = validatePin(requirePayload(input.payload).pin);

  return deps.data.withLock(() => {
    const current = deps.data.findActiveBindingByMemberCode(binding.memberCode);
    if (!current || current.id !== binding.id) {
      throw new AppError('NOT_BOUND', 'กรุณาผูกบัญชี LINE กับรหัสสมาชิกก่อน');
    }
    if (current.pinHash) {
      throw new AppError('CONFLICT', 'ตั้ง PIN ไว้แล้ว หากต้องการเปลี่ยนให้ใช้เมนูเปลี่ยน PIN');
    }
    const salt = deps.random.uuid();
    deps.data.saveBinding({
      ...current,
      pinSalt: salt,
      pinHash: hashSecret(pin, salt),
      pinFailedAttempts: 0,
      pinLocked: false,
    });
    deps.data.appendAuditLog({
      at: deps.clock.now().toISOString(),
      actor: `member:${current.memberCode}`,
      action: 'setPin',
      target: current.memberCode,
      detail: '',
    });
    return { pinSet: true };
  });
}

export function listMyAccounts(input: { auth?: ApiAuth }, deps: Deps): MyAccount[] {
  const { binding } = requireMember(input.auth, deps);
  return deps.data
    .listDepositAccounts()
    .filter((a) => a.memberCode === binding.memberCode)
    .map((a) => ({
      accountNumber: a.accountNumber,
      accountName: a.accountName,
      accountType: a.accountType,
    }));
}

// ---------- ส่วนช่วย ----------

/** PIN 6 หลัก ห้ามเลขซ้ำกันทั้งหมดหรือเรียงกัน เพราะเดาง่าย */
export function validatePin(value: unknown): string {
  const pin = typeof value === 'string' ? value : '';
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) {
    throw new AppError('VALIDATION', `PIN ต้องเป็นตัวเลข ${PIN_LENGTH} หลัก`);
  }
  const digits = [...pin].map(Number);
  const allSame = digits.every((d) => d === digits[0]);
  const ascending = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 1) % 10);
  const descending = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 9) % 10);
  if (allSame || ascending || descending) {
    throw new AppError('VALIDATION', 'PIN เดาง่ายเกินไป ห้ามใช้เลขซ้ำกันทั้งหมดหรือเลขเรียงกัน');
  }
  return pin;
}

function memberName(memberCode: string, deps: Deps): string {
  return deps.data.listDepositAccounts().find((a) => a.memberCode === memberCode)?.accountName ?? '';
}

function recordBindingFailure(
  lineUserId: string,
  previous: { failures: number; firstFailureAt: string } | null,
  now: Date,
  deps: Deps,
): void {
  const windowStart =
    previous && now.getTime() - Date.parse(previous.firstFailureAt) < BINDING_WINDOW_MINUTES * 60_000
      ? previous
      : null;
  const failures = (windowStart?.failures ?? 0) + 1;
  const firstFailureAt = windowStart?.firstFailureAt ?? now.toISOString();

  if (failures >= MAX_BINDING_FAILURES) {
    const lockedUntil = new Date(now.getTime() + BINDING_LOCK_MINUTES * 60_000);
    deps.data.putBindingThrottle(
      lineUserId,
      { failures: 0, firstFailureAt, lockedUntil: lockedUntil.toISOString() },
      BINDING_LOCK_MINUTES * 60,
    );
    throw bindingLockedError(lockedUntil);
  }
  deps.data.putBindingThrottle(
    lineUserId,
    { failures, firstFailureAt, lockedUntil: '' },
    BINDING_WINDOW_MINUTES * 60,
  );
}

function bindingLockedError(lockedUntil: Date): AppError {
  return new AppError(
    'ACCOUNT_LOCKED',
    `กรอกข้อมูลไม่ตรงเกิน ${MAX_BINDING_FAILURES} ครั้ง ลองใหม่ได้หลังเวลา ${formatBangkokTime(lockedUntil)} น. หรือติดต่อสหกรณ์`,
  );
}
