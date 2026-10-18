// การตรวจและเปลี่ยน PIN ของสมาชิก (ticket 05)
import { PIN_MAX_FAILED_ATTEMPTS, type ApiAuth } from '../../../shared/api';
import type { Deps, LineBinding } from '../adapters/ports';
import { AppError } from './errors';
import { requireMember, validatePin } from './members';
import { hashSecret, verifySecret } from './secrets';
import { requirePayload } from './validate';

const LOCKED_MESSAGE = `PIN ถูกล็อกเพราะกรอกผิดครบ ${PIN_MAX_FAILED_ATTEMPTS} ครั้ง กรุณาติดต่อสหกรณ์เพื่อรีเซ็ต PIN`;

/**
 * ตรวจ PIN ของการผูกบัญชีที่ใช้งานอยู่ ต้องเรียกภายใน withLock
 * ผิดแต่ละครั้งนับสะสม ผิดครบ 5 ครั้งล็อกจนผู้ดูแลระบบรีเซ็ต ถูกแล้วรีเซ็ตตัวนับ
 * คืนการผูกบัญชีล่าสุดหลังบันทึกแล้ว
 */
export function checkMemberPin(bindingId: string, memberCode: string, pin: string, deps: Deps): LineBinding {
  const binding = deps.data.findActiveBindingByMemberCode(memberCode);
  if (!binding || binding.id !== bindingId) {
    throw new AppError('NOT_BOUND', 'กรุณาผูกบัญชี LINE กับรหัสสมาชิกก่อน');
  }
  if (binding.pinLocked) {
    throw new AppError('ACCOUNT_LOCKED', LOCKED_MESSAGE);
  }
  if (!binding.pinHash) {
    throw new AppError('CONFLICT', 'ยังไม่ได้ตั้ง PIN กรุณาตั้ง PIN ก่อน');
  }

  if (verifySecret(pin, binding.pinSalt, binding.pinHash)) {
    const updated = { ...binding, pinFailedAttempts: 0 };
    if (binding.pinFailedAttempts !== 0) deps.data.saveBinding(updated);
    return updated;
  }

  const failures = binding.pinFailedAttempts + 1;
  const locked = failures >= PIN_MAX_FAILED_ATTEMPTS;
  deps.data.saveBinding({ ...binding, pinFailedAttempts: failures, pinLocked: locked });
  if (locked) {
    deps.data.appendAuditLog({
      at: deps.clock.now().toISOString(),
      actor: `member:${memberCode}`,
      action: 'pinLocked',
      target: memberCode,
      detail: `กรอก PIN ผิด ${failures} ครั้ง`,
    });
    throw new AppError('ACCOUNT_LOCKED', LOCKED_MESSAGE);
  }
  throw new AppError(
    'INVALID_CREDENTIALS',
    `PIN ไม่ถูกต้อง กรอกผิดได้อีก ${PIN_MAX_FAILED_ATTEMPTS - failures} ครั้งก่อนถูกล็อก`,
  );
}

export function changePin(input: { auth?: ApiAuth; payload?: unknown }, deps: Deps): { pinSet: true } {
  const { binding } = requireMember(input.auth, deps);
  const payload = requirePayload(input.payload);
  const oldPin = typeof payload.oldPin === 'string' ? payload.oldPin : '';
  const newPin = validatePin(payload.newPin);

  return deps.data.withLock(() => {
    const current = checkMemberPin(binding.id, binding.memberCode, oldPin, deps);
    if (oldPin === newPin) {
      throw new AppError('VALIDATION', 'PIN ใหม่ต้องไม่ซ้ำกับ PIN เดิม');
    }
    const salt = deps.random.uuid();
    deps.data.saveBinding({ ...current, pinSalt: salt, pinHash: hashSecret(newPin, salt) });
    deps.data.appendAuditLog({
      at: deps.clock.now().toISOString(),
      actor: `member:${current.memberCode}`,
      action: 'changePin',
      target: current.memberCode,
      detail: '',
    });
    return { pinSet: true };
  });
}
