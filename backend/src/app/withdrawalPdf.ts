// PDF ใบถอนเงินจาก Google Docs ต้นแบบ สร้างเมื่อคำขอถอนเงินได้รับอนุมัติ (ticket 10)
import {
  ACCOUNT_TYPE_LABELS,
  BANKS,
  PAYOUT_DOCUMENT_LABELS,
  type ApiAuth,
  type PayoutDocumentKind,
  type StaffRequest,
} from '../../../shared/api';
import { bahtText, formatBaht, formatPhone, formatThaiDate } from '../../../shared/format';
import type { Deps, MemberRequest, TemplateImage } from '../adapters/ports';
import { bangkokDate } from './businessDays';
import { AppError } from './errors';
import { findRequest, toStaff } from './requests';
import { requireStaff } from './staff';
import { requirePayload, requireString } from './validate';

/** ตัวแปรข้อความในต้นแบบ เขียนในเอกสารเป็น {{ชื่อ}} (ตามแบบฟอร์มใบถอนเงินออนไลน์ของสหกรณ์) */
export const WITHDRAWAL_TEMPLATE_TEXTS = [
  'requestNumber',
  'submittedDate',
  'memberCode',
  'accountNumber',
  'accountName',
  'accountType',
  /** ● หรือ ○ หน้าช่อง ออมทรัพย์ / ออมทรัพย์พิเศษ */
  'savingsMark',
  'specialSavingsMark',
  'amount',
  'amountText',
  'payoutBank',
  'payoutAccountNumber',
  'payoutAccountName',
  'payoutBranch',
  'contactPhone',
  'processingDate',
  'reviewedBy',
  'approvedBy',
  'approvedDate',
] as const;

/** ตัวแปรรูป: ลายมือชื่อ และสำเนาเอกสารของบัญชีรับเงิน (เอกสารที่เป็น PDF แทนด้วยข้อความ) */
export const WITHDRAWAL_TEMPLATE_IMAGES = [
  'ownerSignature',
  'recipientSignature',
  'idCardImage',
  'depositBookImage',
  'payoutBookImage',
] as const;

const SIGNATURE_SIZE = { maxWidth: 150, maxHeight: 45 };
const ATTACHMENTS = [
  { key: 'idCardImage', kind: 'idCard', maxWidth: 150, maxHeight: 200 },
  { key: 'depositBookImage', kind: 'depositBook', maxWidth: 330, maxHeight: 180 },
  { key: 'payoutBookImage', kind: 'payoutBook', maxWidth: 330, maxHeight: 180 },
] as const;
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png'];

/**
 * สร้าง PDF แล้วบันทึกรหัสไฟล์ไว้ในคำขอ คืน true ถ้าสำเร็จ
 * สร้างไม่สำเร็จต้องไม่ทำให้การอนุมัติล้มเหลว จึงบันทึกลง audit log แทนการ throw
 */
export function generateWithdrawalPdf(request: MemberRequest, deps: Deps): boolean {
  let fileId: string;
  try {
    const { texts, images } = templateContent(request, deps);
    fileId = deps.files.renderWithdrawalPdf(`${request.requestNumber}.pdf`, texts, images);
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
  if (request.filesPurgedAt) {
    throw new AppError('CONFLICT', 'เอกสารของคำขอนี้ถูกลบแล้วเพราะครบระยะเวลาเก็บรักษา');
  }
  if (!generateWithdrawalPdf(request, deps)) {
    throw new AppError('CONFLICT', 'สร้าง PDF ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  }
  return toStaff(findRequest(request.id, deps), deps);
}

/** สร้างต้นแบบเริ่มต้นใหม่ตามแบบฟอร์มใบถอนเงินออนไลน์ของสหกรณ์ (ต้นแบบเดิมเก็บไว้แต่เลิกใช้) */
export function resetWithdrawalTemplate(input: { auth?: ApiAuth }, deps: Deps): { url: string } {
  const staff = requireStaff(input.auth, deps, 'systemAdministrator');
  const url = deps.files.resetWithdrawalTemplate();
  deps.data.appendAuditLog({
    at: deps.clock.now().toISOString(),
    actor: staff.username,
    action: 'resetWithdrawalTemplate',
    target: 'withdrawalTemplate',
    detail: '',
  });
  return { url };
}

/** ลิงก์ Google Docs ต้นแบบ ให้ผู้ดูแลระบบแก้รูปแบบ (เปิดได้เฉพาะบัญชี Google ที่เป็นเจ้าของระบบ) */
export function withdrawalTemplate(input: { auth?: ApiAuth }, deps: Deps): { url: string } {
  requireStaff(input.auth, deps, 'systemAdministrator');
  return { url: deps.files.withdrawalTemplateUrl() };
}

function templateContent(
  request: MemberRequest,
  deps: Deps,
): { texts: Record<string, string>; images: Record<string, TemplateImage> } {
  const payout = deps.data.listPayoutAccounts().find((p) => p.id === request.payoutAccountId);
  const texts: Record<string, string> = {
    requestNumber: request.requestNumber,
    submittedDate: formatThaiDate(bangkokDate(new Date(request.submittedAt))),
    memberCode: request.memberCode,
    accountNumber: request.accountNumber,
    accountName: request.accountName,
    accountType: ACCOUNT_TYPE_LABELS[request.accountType],
    savingsMark: request.accountType === 'savings' ? '●' : '○',
    specialSavingsMark: request.accountType === 'specialSavings' ? '●' : '○',
    amount: formatBaht(request.amount),
    amountText: bahtText(request.amount),
    payoutBank: BANKS.find((b) => b.code === payout?.bankCode)?.name ?? payout?.bankCode ?? '',
    payoutAccountNumber: payout?.accountNumber ?? '',
    payoutAccountName: payout?.accountName ?? '',
    payoutBranch: payout?.branch ?? '',
    contactPhone: formatPhone(request.contactPhone),
    processingDate: formatThaiDate(request.processingDate),
    reviewedBy: staffName(request.reviewedBy, deps),
    approvedBy: staffName(request.approvedBy, deps),
    approvedDate: request.approvedAt ? formatThaiDate(bangkokDate(new Date(request.approvedAt))) : '',
  };

  // ลายมือชื่อเดียวใช้ทั้งช่องเจ้าของบัญชีและผู้รับเงิน เพราะผู้รับเงินคือเจ้าของบัญชีเอง
  const signature = request.signatureFileId ? deps.files.readFile(request.signatureFileId) : null;
  if (!signature) throw new Error(`ไม่พบไฟล์ลายมือชื่อของ ${request.requestNumber}`);
  const signatureImage = { mimeType: signature.mimeType, contentBase64: signature.contentBase64, ...SIGNATURE_SIZE };
  const images: Record<string, TemplateImage> = { ownerSignature: signatureImage, recipientSignature: signatureImage };

  const fileIds: Record<PayoutDocumentKind, string> = {
    idCard: payout?.idCardFileId ?? '',
    depositBook: payout?.depositBookFileId ?? '',
    payoutBook: payout?.payoutBookFileId ?? '',
  };
  for (const { key, kind, maxWidth, maxHeight } of ATTACHMENTS) {
    const file = fileIds[kind] ? deps.files.readFile(fileIds[kind]) : null;
    if (file && IMAGE_MIME_TYPES.includes(file.mimeType)) {
      images[key] = { mimeType: file.mimeType, contentBase64: file.contentBase64, maxWidth, maxHeight };
    } else {
      texts[key] = file
        ? `(${PAYOUT_DOCUMENT_LABELS[kind]}เป็นไฟล์ PDF เปิดดูในระบบ)`
        : `(ไม่พบ${PAYOUT_DOCUMENT_LABELS[kind]})`;
    }
  }
  return { texts, images };
}

function staffName(username: string, deps: Deps): string {
  if (!username) return '';
  return deps.data.findStaff(username)?.fullName || username;
}
