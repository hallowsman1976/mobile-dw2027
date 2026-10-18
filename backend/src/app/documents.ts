// เจ้าหน้าที่เปิดดูเอกสารที่สมาชิกแนบ ทุกครั้งบันทึก audit log
import type { ApiAuth, DocumentContent } from '../../../shared/api';
import type { Deps } from '../adapters/ports';
import { AppError } from './errors';
import { requireStaff } from './staff';
import { requirePayload, requireString } from './validate';

export function viewDocument(input: { auth?: ApiAuth; payload?: unknown }, deps: Deps): DocumentContent {
  const staff = requireStaff(input.auth, deps);
  const fileId = requireString(requirePayload(input.payload).fileId, 'เอกสาร');

  // เปิดได้เฉพาะไฟล์ที่ระบบนี้อ้างถึง ไม่ใช่ไฟล์ใดก็ได้ใน Drive
  const owner = findDocumentOwner(fileId, deps);
  if (!owner) throw new AppError('NOT_FOUND', 'ไม่พบเอกสารนี้');
  if (owner.purged) throw new AppError('NOT_FOUND', 'เอกสารนี้ถูกลบแล้วเพราะครบระยะเวลาเก็บรักษา');

  const file = deps.files.readFile(fileId);
  if (!file) throw new AppError('NOT_FOUND', 'ไม่พบไฟล์เอกสาร อาจถูกลบไปแล้ว');

  deps.data.appendAuditLog({
    at: deps.clock.now().toISOString(),
    actor: staff.username,
    action: 'viewDocument',
    target: owner.target,
    detail: fileId,
  });
  return file;
}

/** คืนสิ่งที่เอกสารนี้เป็นของ (เช่น payoutAccount:<id>) และไฟล์ถูกลบตามระยะเวลาเก็บแล้วหรือยัง */
function findDocumentOwner(fileId: string, deps: Deps): { target: string; purged: boolean } | null {
  const payout = deps.data
    .listPayoutAccounts()
    .find((a) => [a.idCardFileId, a.depositBookFileId, a.payoutBookFileId].includes(fileId));
  if (payout) return { target: `payoutAccount:${payout.id}`, purged: Boolean(payout.filesPurgedAt) };
  const request = deps.data
    .listRequests()
    .find((r) => [r.slipFileId, r.signatureFileId, r.pdfFileId].includes(fileId));
  return request ? { target: `request:${request.requestNumber}`, purged: Boolean(request.filesPurgedAt) } : null;
}
