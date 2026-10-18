// ลบเอกสารที่ครบระยะเวลาเก็บ: ไฟล์ของคำขอและบัญชีรับเงินที่ปิดไปแล้วเกินกำหนด (ค่าเริ่มต้น 10 ปี)
// แถวข้อมูลยังอยู่ แค่บันทึกว่าลบไฟล์แล้ว ทำงานจาก trigger รายเดือน ไม่ใช่ action ที่เรียกจากหน้าเว็บ
import type { RequestStatus } from '../../../shared/api';
import type { Deps, MemberRequest, PayoutAccount } from '../adapters/ports';

export const SETTING_RETENTION_YEARS = 'documentRetentionYears';
const DEFAULT_RETENTION_YEARS = 10;
const ACTOR = 'system';

const CLOSED_REQUEST_STATUSES: RequestStatus[] = ['completed', 'rejected', 'cancelled'];

export type RetentionResult = {
  purged: number;
  failed: number;
  /** รายการที่ครบกำหนดแต่ยังไม่ได้ทำเพราะหมดเวลา */
  remaining: number;
};

type Expired = { target: string; fileIds: string[]; markPurged: (at: string) => void };

/**
 * ลบไฟล์ของรายการที่ครบกำหนดทีละรายการ ตรวจ shouldStop ก่อนเริ่มแต่ละรายการ
 * เพื่อให้ผู้เรียกหยุดก่อนเวลา 6 นาทีของ Apps Script แล้วทำต่อในรอบถัดไป
 * รายการที่ลบไม่สำเร็จบันทึก audit log แล้วข้ามไป (ลองใหม่รอบหน้า)
 */
export function purgeExpiredDocuments(deps: Deps, shouldStop: () => boolean = () => false): RetentionResult {
  const now = deps.clock.now();
  const cutoff = retentionCutoff(now, deps).toISOString();
  const expired = [
    ...deps.data
      .listRequests()
      .filter((r) => !r.filesPurgedAt && CLOSED_REQUEST_STATUSES.includes(r.status) && closedAt(r) && closedAt(r) < cutoff)
      .map((r) => expiredRequest(r, deps)),
    ...deps.data
      .listPayoutAccounts()
      .filter((a) => !a.filesPurgedAt && payoutClosedAt(a) && payoutClosedAt(a) < cutoff)
      .map((a) => expiredPayoutAccount(a, deps)),
  ].filter((item) => item.fileIds.length > 0);

  const result: RetentionResult = { purged: 0, failed: 0, remaining: 0 };
  for (const [index, item] of expired.entries()) {
    if (shouldStop()) {
      result.remaining = expired.length - index;
      break;
    }
    try {
      for (const fileId of item.fileIds) deps.files.deleteFile(fileId);
    } catch (err) {
      result.failed++;
      audit('purgeDocumentsFailed', item.target, err instanceof Error ? err.message : String(err), deps);
      continue;
    }
    const at = deps.clock.now().toISOString();
    deps.data.withLock(() => item.markPurged(at));
    audit('purgeDocuments', item.target, `${item.fileIds.length} ไฟล์: ${item.fileIds.join(', ')}`, deps);
    result.purged++;
  }
  return result;
}

function retentionCutoff(now: Date, deps: Deps): Date {
  const raw = deps.data.getSetting(SETTING_RETENTION_YEARS).trim();
  const years = raw ? Number(raw) : DEFAULT_RETENTION_YEARS;
  // ค่าตั้งผิดแล้วลบเอกสารเร็วเกินไปย้อนคืนไม่ได้ จึงหยุดแทนการเดา
  if (!Number.isInteger(years) || years < 1) {
    throw new Error(`Setting ${SETTING_RETENTION_YEARS} must be a whole number of years (got "${raw}")`);
  }
  const cutoff = new Date(now.getTime());
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  return cutoff;
}

function closedAt(request: MemberRequest): string {
  if (request.status === 'completed') return request.completedAt;
  if (request.status === 'rejected') return request.rejectedAt;
  if (request.status === 'cancelled') return request.cancelledAt;
  return '';
}

/** บัญชีรับเงินที่ยังอนุมัติหรือรอตรวจไม่ถือว่าปิด ไฟล์จึงไม่ถูกลบ */
function payoutClosedAt(account: PayoutAccount): string {
  if (account.status === 'rejected') return account.reviewedAt;
  if (account.status === 'retired') return account.retiredAt;
  return '';
}

function expiredRequest(request: MemberRequest, deps: Deps): Expired {
  return {
    target: `request:${request.requestNumber}`,
    fileIds: [request.slipFileId, request.signatureFileId, request.pdfFileId].filter(Boolean),
    markPurged: (at) => {
      const fresh = deps.data.listRequests().find((r) => r.id === request.id);
      if (fresh) deps.data.saveRequest({ ...fresh, filesPurgedAt: at });
    },
  };
}

function expiredPayoutAccount(account: PayoutAccount, deps: Deps): Expired {
  return {
    target: `payoutAccount:${account.id}`,
    fileIds: [account.idCardFileId, account.depositBookFileId, account.payoutBookFileId].filter(Boolean),
    markPurged: (at) => {
      const fresh = deps.data.listPayoutAccounts().find((a) => a.id === account.id);
      if (fresh) deps.data.savePayoutAccount({ ...fresh, filesPurgedAt: at });
    },
  };
}

function audit(action: string, target: string, detail: string, deps: Deps): void {
  deps.data.appendAuditLog({ at: deps.clock.now().toISOString(), actor: ACTOR, action, target, detail });
}
