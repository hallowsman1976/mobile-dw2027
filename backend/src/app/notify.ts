// การแจ้งเตือนผ่าน LINE: ส่งไม่สำเร็จต้องไม่ทำให้ action ล้มเหลว แต่บันทึกลง audit log
import type { Deps } from '../adapters/ports';

export const SETTING_STAFF_GROUP_ID = 'staffGroupId';
export const SETTING_STAFF_WEB_URL = 'staffWebUrl';

export function notifyMember(memberCode: string, text: string, deps: Deps): void {
  const binding = deps.data.findActiveBindingByMemberCode(memberCode);
  if (!binding) return;
  send(binding.lineUserId, `member:${memberCode}`, text, deps);
}

/** ข้อความถึงกลุ่มเจ้าหน้าที่ ห้ามใส่เลขบัตรประชาชนหรือเลขบัญชีเต็ม */
export function notifyStaffGroup(text: string, deps: Deps): void {
  const groupId = deps.data.getSetting(SETTING_STAFF_GROUP_ID);
  if (!groupId) return;
  const url = deps.data.getSetting(SETTING_STAFF_WEB_URL);
  send(groupId, 'staffGroup', url ? `${text}\n${url}` : text, deps);
}

function send(to: string, target: string, text: string, deps: Deps): void {
  try {
    deps.messenger.pushText(to, text);
  } catch (err) {
    deps.data.appendAuditLog({
      at: deps.clock.now().toISOString(),
      actor: 'system',
      action: 'notifyFailed',
      target,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

/** แสดงเฉพาะ 4 หลักท้ายของเลขบัญชี */
export function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, '');
  return `ลงท้าย ${digits.slice(-4)}`;
}
