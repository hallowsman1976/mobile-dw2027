// PDF ใบถอนเงินจาก Google Docs ต้นแบบ สร้างเมื่อคำขอถอนเงินได้รับอนุมัติ (ticket 10)
import { ACCOUNT_TYPE_LABELS, BANKS, type ApiAuth, type StaffRequest } from '../../../shared/api';
import { bahtText, formatBaht, formatThaiDate, formatThaiDateTimeFromIso } from '../../../shared/format';
import type { Deps, MemberRequest } from '../adapters/ports';
import { bangkokDate } from './businessDays';
import { AppError } from './errors';
import { findRequest, toStaff } from './requests';
import { requireStaff } from './staff';
import { requirePayload, requireString } from './validate';

/** ตัวแปรที่ใช้ใน Google Docs ต้นแบบ เขียนในเอกสารเป็น {{ชื่อ}} */
export const WITHDRAWAL_TEMPLATE_TEXTS = [
  'requestNumber',
  'submittedDate',
  'memberCode',
  'accountNumber',
  'accountName',
  'accountType',
  'amount',
  'amountText',
  'payoutBank',
  'payoutAccountNumber',
  'payoutAccountName',
  'processingDate',
  'reviewedBy',
  'approvedBy',
  'approvedDate',
] as const;
export const WITHDRAWAL_TEMPLATE_IMAGES = ['ownerSignature', 'recipientSignature'] as const;

/**
 * สร้าง PDF แล้วบันทึกรหัสไฟล์ไว้ในคำขอ คืน true ถ้าสำเร็จ
 * สร้างไม่สำเร็จต้องไม่ทำให้การอนุมัติล้มเหลว จึงบันทึกลง audit log แทนการ throw
 */
export function generateWithdrawalPdf(request: MemberRequest, deps: Deps): boolean {
  let fileId: string;
  try {
    fileId = deps.files.renderWithdrawalPdf(`${request.requestNumber}.pdf`, templateTexts(request, deps), templateImages(request, deps));
  } catch (err) {
    deps.data.appendAuditLog({
      at: deps.clock.now().toISOString(),
      actor: 'system',
      action: 'pdfFailed',
      target: request.requestNumber,
      detail: err instanceof Error ? err.message : String(err),
    });
    return false;
  }

  deps.data.withLock(() => {
    const latest = findRequest(request.id, deps);
    deps.data.saveRequest({ ...latest, pdfFileId: fileId });
    deps.data.appendAuditLog({
      at: deps.clock.now().toISOString(),
      actor: 'system',
      action: 'generatePdf',
      target: request.requestNumber,
      detail: fileId,
    });
  });
  return true;
}

/** ปุ่ม "สร้าง PDF ใหม่" ในหน้าเจ้าหน้าที่ */
export function regenerateWithdrawalPdf(input: { auth?: ApiAuth; payload?: unknown }, deps: Deps): StaffRequest {
  requireStaff(input.auth, deps);
  const request = findRequest(requireString(requirePayload(input.payload).id, 'คำขอ'), deps);
  if (request.type !== 'withdrawal' || (request.status !== 'approved' && request.status !== 'completed')) {
    throw new AppError('CONFLICT', 'สร้าง PDF ได้เฉพาะคำขอถอนเงินที่อนุมัติแล้ว');
  }
  if (!generateWithdrawalPdf(request, deps)) {
    throw new AppError('CONFLICT', 'สร้าง PDF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  }
  return toStaff(findRequest(request.id, deps), deps);
}

/** ลิงก์ Google Docs ต้นแบบ ให้ผู้ดูแลระบบแก้รูปแบบ (เปิดได้เฉพาะบัญชี Google ที่เป็นเจ้าของระบบ) */
export function withdrawalTemplate(input: { auth?: ApiAuth }, deps: Deps): { url: string } {
  requireStaff(input.auth, deps, 'systemAdministrator');
  return { url: deps.files.withdrawalTemplateUrl() };
}

function templateTexts(request: MemberRequest, deps: Deps): Record<string, string> {
  const payout = deps.data.listPayoutAccounts().find((p) => p.id === request.payoutAccountId);
  const texts: Record<(typeof WITHDRAWAL_TEMPLATE_TEXTS)[number], string> = {
    requestNumber: request.requestNumber,
    submittedDate: formatThaiDateTimeFromIso(request.submittedAt),
    memberCode: request.memberCode,
    accountNumber: request.accountNumber,
    accountName: request.accountName,
    accountType: ACCOUNT_TYPE_LABELS[request.accountType],
    amount: formatBaht(request.amount),
    amountText: bahtText(request.amount),
    payoutBank: BANKS.find((b) => b.code === payout?.bankCode)?.name ?? payout?.bankCode ?? '',
    payoutAccountNumber: payout?.accountNumber ?? '',
    payoutAccountName: payout?.accountName ?? '',
    processingDate: formatThaiDate(request.processingDate),
    reviewedBy: staffName(request.reviewedBy, deps),
    approvedBy: staffName(request.approvedBy, deps),
    approvedDate: request.approvedAt ? formatThaiDate(bangkokDate(new Date(request.approvedAt))) : '',
  };
  return texts;
}

/** ลายมือชื่อเดียวใช้ทั้งช่องเจ้าของบัญชีและผู้รับเงิน เพราะผู้รับเงินคือเจ้าของบัญชีเอง */
function templateImages(request: MemberRequest, deps: Deps): Record<string, string> {
  const signature = request.signatureFileId ? deps.files.readFile(request.signatureFileId) : null;
  if (!signature) throw new Error(`ไม่พบไฟล์ลายมือชื่อของ ${request.requestNumber}`);
  return { ownerSignature: signature.contentBase64, recipientSignature: signature.contentBase64 };
}

function staffName(username: string, deps: Deps): string {
  if (!username) return '';
  return deps.data.findStaff(username)?.fullName || username;
}
