// webhook ของ LINE และการตั้งค่ากลุ่ม LINE ของเจ้าหน้าที่ (ticket 06)
import type { ApiAuth, LineGroupSettings } from '../../../shared/api';
import type { Deps } from '../adapters/ports';
import { AppError } from './errors';
import { SETTING_STAFF_GROUP_ID, SETTING_STAFF_WEB_URL } from './notify';
import { requireStaff } from './staff';
import { requirePayload } from './validate';

type WebhookEvent = { type?: string; source?: { type?: string; groupId?: string } };

/** body ที่ LINE ส่งมาคือ { destination, events } โดยไม่มี action */
export function isLineWebhookBody(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return Array.isArray(parsed.events) && !('action' in parsed);
  } catch {
    return false;
  }
}

/**
 * รับเฉพาะ event join เพื่อบันทึก groupId ที่ bot ถูกเชิญเข้าไป
 * Apps Script ตรวจ X-Line-Signature ไม่ได้ (ADR 0002) จึงไม่เชื่อข้อมูลอื่นใน webhook
 * และการตั้งกลุ่มเจ้าหน้าที่ต้องส่งข้อความทดสอบเข้ากลุ่มได้จริง
 */
export function handleLineWebhook(body: string, deps: Deps): void {
  const events = (JSON.parse(body) as { events: WebhookEvent[] }).events;
  for (const event of events) {
    const groupId = event.source?.groupId;
    if (event.type !== 'join' || event.source?.type !== 'group' || !groupId) continue;
    if (!/^C[0-9a-f]{32}$/.test(groupId)) continue;
    deps.data.withLock(() => {
      deps.data.saveLineGroup({
        groupId,
        groupName: safeGroupName(groupId, deps),
        joinedAt: deps.clock.now().toISOString(),
      });
    });
  }
}

export function lineGroupSettings(input: { auth?: ApiAuth }, deps: Deps): LineGroupSettings {
  requireStaff(input.auth, deps, 'systemAdministrator');
  return {
    groups: deps.data.listLineGroups().sort((a, b) => b.joinedAt.localeCompare(a.joinedAt)),
    staffGroupId: deps.data.getSetting(SETTING_STAFF_GROUP_ID),
    staffWebUrl: deps.data.getSetting(SETTING_STAFF_WEB_URL),
  };
}

export function updateNotificationSettings(
  input: { auth?: ApiAuth; payload?: unknown },
  deps: Deps,
): LineGroupSettings {
  const staff = requireStaff(input.auth, deps, 'systemAdministrator');
  const payload = requirePayload(input.payload);

  if (payload.staffGroupId !== undefined) {
    const groupId = String(payload.staffGroupId);
    if (groupId && !deps.data.listLineGroups().some((g) => g.groupId === groupId)) {
      throw new AppError('NOT_FOUND', 'ไม่พบกลุ่มนี้ เชิญ LINE OA เข้ากลุ่มก่อน');
    }
    if (groupId) {
      // ส่งข้อความทดสอบ: ถ้า bot ไม่ได้อยู่ในกลุ่มจริงจะส่งไม่ได้
      try {
        deps.messenger.pushText(groupId, 'ทดสอบ: กลุ่มนี้ถูกตั้งเป็นกลุ่มแจ้งเตือนของเจ้าหน้าที่ระบบฝากถอนออนไลน์');
      } catch {
        throw new AppError('CONFLICT', 'ส่งข้อความเข้ากลุ่มนี้ไม่ได้ ตรวจว่า LINE OA ยังอยู่ในกลุ่ม');
      }
    }
    deps.data.withLock(() => deps.data.setSetting(SETTING_STAFF_GROUP_ID, groupId));
    audit(staff.username, 'setStaffGroup', groupId, deps);
  }

  if (payload.staffWebUrl !== undefined) {
    const url = String(payload.staffWebUrl).trim();
    if (url && !/^https:\/\/[^\s]+$/.test(url)) {
      throw new AppError('VALIDATION', 'ลิงก์หน้าเว็บเจ้าหน้าที่ต้องขึ้นต้นด้วย https://');
    }
    deps.data.withLock(() => deps.data.setSetting(SETTING_STAFF_WEB_URL, url));
    audit(staff.username, 'setStaffWebUrl', url, deps);
  }

  return lineGroupSettings(input, deps);
}

function safeGroupName(groupId: string, deps: Deps): string {
  try {
    return deps.messenger.getGroupName(groupId) ?? '';
  } catch {
    return '';
  }
}

function audit(actor: string, action: string, target: string, deps: Deps): void {
  deps.data.appendAuditLog({ at: deps.clock.now().toISOString(), actor, action, target, detail: '' });
}
