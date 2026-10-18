// ผู้ดูแลระบบ: ค้นหาสมาชิก รีเซ็ต PIN และยกเลิกการผูกบัญชี LINE (ticket 05)
import type { ApiAuth, MemberLookup } from '../../../shared/api';
import type { Deps, LineBinding, StaffAccount } from '../adapters/ports';
import { AppError } from './errors';
import { normalizeMemberCode } from './identifiers';
import { memberName } from './members';
import { requireStaff } from './staff';
import { requirePayload } from './validate';

export function lookupMember(input: { auth?: ApiAuth; payload?: unknown }, deps: Deps): MemberLookup {
  requireStaff(input.auth, deps, 'systemAdministrator');
  const memberCode = requireMemberCode(input.payload);
  const accountCount = deps.data.listDepositAccounts().filter((a) => a.memberCode === memberCode).length;
  const binding = deps.data.findActiveBindingByMemberCode(memberCode);
  if (accountCount === 0 && !binding) {
    throw new AppError('NOT_FOUND', `ไม่พบรหัสสมาชิก ${memberCode} ในข้อมูลบัญชีเงินฝาก`);
  }
  return toLookup(memberCode, accountCount, binding, deps);
}

export function resetPin(input: { auth?: ApiAuth; payload?: unknown }, deps: Deps): MemberLookup {
  const staff = requireStaff(input.auth, deps, 'systemAdministrator');
  const memberCode = requireMemberCode(input.payload);

  return deps.data.withLock(() => {
    const binding = requireActiveBinding(memberCode, deps);
    const updated: LineBinding = {
      ...binding,
      pinHash: '',
      pinSalt: '',
      pinFailedAttempts: 0,
      pinLocked: false,
    };
    deps.data.saveBinding(updated);
    audit(staff, 'resetPin', memberCode, 'สมาชิกต้องตั้ง PIN ใหม่ผ่าน LINE', deps);
    return toLookup(memberCode, countAccounts(memberCode, deps), updated, deps);
  });
}

export function unbindLineAccount(input: { auth?: ApiAuth; payload?: unknown }, deps: Deps): MemberLookup {
  const staff = requireStaff(input.auth, deps, 'systemAdministrator');
  const memberCode = requireMemberCode(input.payload);

  return deps.data.withLock(() => {
    const binding = requireActiveBinding(memberCode, deps);
    deps.data.saveBinding({
      ...binding,
      unboundAt: deps.clock.now().toISOString(),
      unboundBy: staff.username,
    });
    audit(staff, 'unbindLineAccount', memberCode, `ผูกไว้ตั้งแต่ ${binding.boundAt}`, deps);
    return toLookup(memberCode, countAccounts(memberCode, deps), null, deps);
  });
}

function requireMemberCode(payload: unknown): string {
  const memberCode = normalizeMemberCode(String(requirePayload(payload).memberCode ?? ''));
  if (!memberCode) throw new AppError('VALIDATION', 'รหัสสมาชิกต้องเป็นตัวเลขไม่เกิน 5 หลัก');
  return memberCode;
}

function requireActiveBinding(memberCode: string, deps: Deps): LineBinding {
  const binding = deps.data.findActiveBindingByMemberCode(memberCode);
  if (!binding) throw new AppError('NOT_FOUND', `รหัสสมาชิก ${memberCode} ยังไม่ได้ผูกบัญชี LINE`);
  return binding;
}

function countAccounts(memberCode: string, deps: Deps): number {
  return deps.data.listDepositAccounts().filter((a) => a.memberCode === memberCode).length;
}

function toLookup(
  memberCode: string,
  accountCount: number,
  binding: LineBinding | null,
  deps: Deps,
): MemberLookup {
  return {
    memberCode,
    memberName: memberName(memberCode, deps),
    accountCount,
    binding: binding && {
      boundAt: binding.boundAt,
      consentVersion: binding.consentVersion,
      pinSet: Boolean(binding.pinHash),
      pinLocked: binding.pinLocked,
      pinFailedAttempts: binding.pinFailedAttempts,
    },
  };
}

function audit(staff: StaffAccount, action: string, memberCode: string, detail: string, deps: Deps): void {
  deps.data.appendAuditLog({
    at: deps.clock.now().toISOString(),
    actor: staff.username,
    action,
    target: memberCode,
    detail,
  });
}
