// คำขอฝากเงิน และส่วนที่คำขอทุกประเภทใช้ร่วมกัน: ลำดับสถานะ ประวัติ การตรวจ (ticket 07)
import {
  DEPOSIT_MIN_AMOUNT,
  REQUEST_TYPE_LABELS,
  type ApiAuth,
  type ListRequestsPayload,
  type MyRequest,
  type RequestStatus,
  type RequestType,
  type StaffRequest,
} from '../../../shared/api';
import { formatBaht, formatThaiDate } from '../../../shared/format';
import type { Deps, MemberRequest } from '../adapters/ports';
import { bangkokDate, processingDateFor } from './businessDays';
import { AppError } from './errors';
import { memberName, requireMember } from './members';
import { notifyMember, notifyStaffGroup } from './notify';
import { requireStaff } from './staff';
import { assessSlip, mismatchError, parseTransferredAt, readSlip, validateSlip } from './slips';
import { requirePayload, requireString } from './validate';

const MAX_AMOUNT = 10_000_000;
const MY_REQUESTS_LIMIT = 50;
const REQUEST_NUMBER_PREFIX: Record<RequestType, string> = { deposit: 'DP', withdrawal: 'WD' };

// ---------- สมาชิก: ฝากเงิน ----------

export function submitDepositRequest(input: { auth?: ApiAuth; payload?: unknown }, deps: Deps): MyRequest {
  const { binding } = requireMember(input.auth, deps);
  const payload = requirePayload(input.payload);
  const account = requireOwnAccount(binding.memberCode, payload.accountNumber, deps);
  const amount = validateAmount(payload.amount, DEPOSIT_MIN_AMOUNT);

  const now = deps.clock.now();
  const transferredAt = parseTransferredAt(payload.transferredAt, now);
  const slip = validateSlip(payload.slip);
  // เรียก SlipOK นอก lock (ช้า) ส่วนการตรวจสลิปซ้ำทำใน lock
  const reading = readSlip(slip, deps);

  const request = deps.data.withLock(() => {
    const assessment = assessSlip(reading, amount, transferredAt, deps);
    if (assessment.kind === 'mismatch') throw mismatchError(assessment.reading);
    const requestNumber = nextRequestNumber('deposit', now, deps);
    const slipFileId = deps.files.saveFile(
      'slips',
      `${requestNumber}.${slip.mimeType === 'image/png' ? 'png' : 'jpg'}`,
      slip.mimeType,
      slip.contentBase64,
    );
    const request: MemberRequest = {
      ...emptyRequest(),
      id: deps.random.uuid(),
      requestNumber,
      type: 'deposit',
      memberCode: binding.memberCode,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      accountType: account.accountType,
      amount,
      slipFileId,
      transferredAt: new Date(transferredAt).toISOString(),
      slipCheck: assessment.kind === 'valid' ? 'valid' : 'notChecked',
      slipRef: assessment.kind === 'valid' ? assessment.reading.transRef : '',
      status: 'pendingReview',
      submittedAt: now.toISOString(),
      processingDate: processingDateFor(now, deps),
    };
    deps.data.saveRequest(request);
    audit(`member:${binding.memberCode}`, 'submitDepositRequest', request, `${formatBaht(amount)} บาท`, deps);
    return request;
  });

  notifySubmitted(request, deps);
  return toMine(request);
}

// ---------- สมาชิก: ประวัติและยกเลิก ----------

export function listMyRequests(input: { auth?: ApiAuth }, deps: Deps): MyRequest[] {
  const { binding } = requireMember(input.auth, deps);
  return deps.data
    .listRequests()
    .filter((r) => r.memberCode === binding.memberCode)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .slice(0, MY_REQUESTS_LIMIT)
    .map(toMine);
}

export function cancelRequest(input: { auth?: ApiAuth; payload?: unknown }, deps: Deps): MyRequest {
  const { binding } = requireMember(input.auth, deps);
  const id = requireString(requirePayload(input.payload).id, 'คำขอ');

  return deps.data.withLock(() => {
    const request = deps.data.listRequests().find((r) => r.id === id);
    if (!request || request.memberCode !== binding.memberCode) {
      throw new AppError('NOT_FOUND', 'ไม่พบคำขอนี้');
    }
    requireStatus(request, ['pendingReview'], 'ยกเลิกได้เฉพาะคำขอที่ยังรอตรวจ');
    const cancelled: MemberRequest = { ...request, status: 'cancelled', cancelledAt: deps.clock.now().toISOString() };
    deps.data.saveRequest(cancelled);
    audit(`member:${binding.memberCode}`, 'cancelRequest', cancelled, '', deps);
    return toMine(cancelled);
  });
}

// ---------- เจ้าหน้าที่ ----------

export function listRequests(input: { auth?: ApiAuth; payload?: unknown }, deps: Deps): StaffRequest[] {
  requireStaff(input.auth, deps);
  const filter = (input.payload ?? {}) as ListRequestsPayload;
  return deps.data
    .listRequests()
    .filter((r) => !filter.status || r.status === filter.status)
    .filter((r) => !filter.type || r.type === filter.type)
    .filter((r) => !filter.processingDate || r.processingDate === filter.processingDate)
    .filter((r) => !filter.processingDateTo || r.processingDate <= filter.processingDateTo)
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
    .map((r) => toStaff(r, deps));
}

export function getRequest(input: { auth?: ApiAuth; payload?: unknown }, deps: Deps): StaffRequest {
  requireStaff(input.auth, deps);
  return toStaff(findRequest(requireString(requirePayload(input.payload).id, 'คำขอ'), deps), deps);
}

/**
 * ผู้ตรวจผ่านหรือปฏิเสธคำขอที่รอตรวจ
 * คำขอฝากเงินผ่านแล้วเป็น อนุมัติ ทันที ส่วนคำขอถอนเงินไปรอผู้อนุมัติ (ticket 09)
 */
export function reviewRequest(input: { auth?: ApiAuth; payload?: unknown }, deps: Deps): StaffRequest {
  const staff = requireStaff(input.auth, deps, 'reviewer');
  const payload = requirePayload(input.payload);
  const id = requireString(payload.id, 'คำขอ');
  const decision = payload.decision;
  if (decision !== 'approve' && decision !== 'reject') {
    throw new AppError('BAD_REQUEST', 'รูปแบบคำขอไม่ถูกต้อง');
  }
  const reason = requireRejectReason(decision, payload.reason);

  const updated = deps.data.withLock(() => {
    const request = findRequest(id, deps);
    requireStatus(request, ['pendingReview'], 'คำขอนี้ได้รับการตรวจไปแล้ว');
    const now = deps.clock.now().toISOString();
    const reviewed: MemberRequest =
      decision === 'reject'
        ? { ...request, status: 'rejected', rejectedBy: staff.username, rejectedAt: now, rejectReason: reason }
        : {
            ...request,
            status: request.type === 'deposit' ? 'approved' : 'pendingApproval',
            reviewedBy: staff.username,
            reviewedAt: now,
          };
    deps.data.saveRequest(reviewed);
    audit(staff.username, decision === 'reject' ? 'rejectRequest' : 'reviewRequest', reviewed, reason, deps);
    return reviewed;
  });

  notifyStatusChanged(updated, deps);
  if (updated.status === 'pendingApproval') {
    notifyStaffGroup(
      `คำขอถอนเงิน ${updated.requestNumber} รออนุมัติ\nสมาชิก ${updated.memberCode}\nยอด ${formatBaht(updated.amount)} บาท\nตรวจแล้วโดย ${updated.reviewedBy}`,
      deps,
    );
  }
  return toStaff(updated, deps);
}

// ---------- ส่วนที่คำขอทุกประเภทใช้ร่วมกัน ----------

export function requireOwnAccount(memberCode: string, accountNumber: unknown, deps: Deps) {
  const account = deps.data
    .listDepositAccounts()
    .find((a) => a.memberCode === memberCode && a.accountNumber === accountNumber);
  if (!account) throw new AppError('VALIDATION', 'กรุณาเลือกบัญชีเงินฝากของท่าน');
  return account;
}

export function validateAmount(value: unknown, min: number, max = MAX_AMOUNT): number {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount) || Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) {
    throw new AppError('VALIDATION', 'จำนวนเงินไม่ถูกต้อง (ทศนิยมไม่เกิน 2 ตำแหน่ง)');
  }
  if (amount < min || amount > max) {
    throw new AppError('VALIDATION', `จำนวนเงินต้องอยู่ระหว่าง ${formatBaht(min)} ถึง ${formatBaht(max)} บาท`);
  }
  return Math.round(amount * 100) / 100;
}

/** เลขที่คำขอ เช่น DP-2026-000001 ต้องเรียกภายใน withLock */
export function nextRequestNumber(type: RequestType, now: Date, deps: Deps): string {
  const prefix = `${REQUEST_NUMBER_PREFIX[type]}-${bangkokDate(now).slice(0, 4)}`;
  const key = `sequence:${prefix}`;
  const next = (Number(deps.data.getSetting(key)) || 0) + 1;
  deps.data.setSetting(key, String(next));
  return `${prefix}-${String(next).padStart(6, '0')}`;
}

export function findRequest(id: string, deps: Deps): MemberRequest {
  const request = deps.data.listRequests().find((r) => r.id === id);
  if (!request) throw new AppError('NOT_FOUND', 'ไม่พบคำขอนี้');
  return request;
}

export function requireStatus(request: MemberRequest, allowed: RequestStatus[], message: string): void {
  if (!allowed.includes(request.status)) throw new AppError('CONFLICT', message);
}

export function requireRejectReason(decision: string, value: unknown): string {
  const reason = typeof value === 'string' ? value.trim() : '';
  if (decision === 'reject' && !reason) {
    throw new AppError('VALIDATION', 'กรุณาระบุเหตุผลที่ปฏิเสธ เพื่อแจ้งสมาชิก');
  }
  return decision === 'reject' ? reason : '';
}

export function audit(actor: string, action: string, request: MemberRequest, detail: string, deps: Deps): void {
  deps.data.appendAuditLog({
    at: deps.clock.now().toISOString(),
    actor,
    action,
    target: request.requestNumber,
    detail,
  });
}

export function notifySubmitted(request: MemberRequest, deps: Deps): void {
  const label = REQUEST_TYPE_LABELS[request.type];
  const amount = `${formatBaht(request.amount)} บาท`;
  const date = formatThaiDate(request.processingDate);
  notifyMember(
    request.memberCode,
    `ได้รับคำขอ${label} ${request.requestNumber}\nยอด ${amount}\nจะดำเนินการในวันทำการ ${date}`,
    deps,
  );
  notifyStaffGroup(
    `คำขอ${label}ใหม่ ${request.requestNumber}\nสมาชิก ${request.memberCode} ${memberName(request.memberCode, deps)}\nยอด ${amount}\nดำเนินการวันที่ ${date}`,
    deps,
  );
}

/** แจ้งสมาชิกเมื่อสถานะเปลี่ยนโดยเจ้าหน้าที่ */
export function notifyStatusChanged(request: MemberRequest, deps: Deps): void {
  const head = `คำขอ${REQUEST_TYPE_LABELS[request.type]} ${request.requestNumber} ยอด ${formatBaht(request.amount)} บาท`;
  const date = formatThaiDate(request.processingDate);
  const messages: Partial<Record<RequestStatus, string>> = {
    pendingApproval: `${head}\nผ่านการตรวจแล้ว รอผู้อนุมัติ`,
    approved:
      request.type === 'deposit'
        ? `${head}\nผ่านการตรวจแล้ว เจ้าหน้าที่จะบันทึกเข้าบัญชีในวันทำการ ${date}`
        : `${head}\nอนุมัติแล้ว เจ้าหน้าที่จะโอนเงินในวันทำการ ${date}`,
    completed:
      request.type === 'deposit'
        ? `${head}\nบันทึกเข้าบัญชีเงินฝากเรียบร้อยแล้ว`
        : `${head}\nโอนเงินเข้าบัญชีรับเงินเรียบร้อยแล้ว`,
    rejected: `${head}\nไม่ผ่านการตรวจ\nเหตุผล: ${request.rejectReason}`,
  };
  const text = messages[request.status];
  if (text) notifyMember(request.memberCode, text, deps);
}

export function emptyRequest(): MemberRequest {
  return {
    id: '',
    requestNumber: '',
    type: 'deposit',
    memberCode: '',
    accountNumber: '',
    accountName: '',
    accountType: 'savings',
    amount: 0,
    payoutAccountId: '',
    signatureFileId: '',
    slipFileId: '',
    transferredAt: '',
    slipCheck: 'notChecked',
    slipRef: '',
    status: 'pendingReview',
    reviewedBy: '',
    reviewedAt: '',
    approvedBy: '',
    approvedAt: '',
    completedBy: '',
    completedAt: '',
    rejectedBy: '',
    rejectedAt: '',
    rejectReason: '',
    cancelledAt: '',
    pdfFileId: '',
    submittedAt: '',
    processingDate: '',
    filesPurgedAt: '',
  };
}

export function toMine(request: MemberRequest): MyRequest {
  return {
    id: request.id,
    requestNumber: request.requestNumber,
    type: request.type,
    accountNumber: request.accountNumber,
    accountName: request.accountName,
    accountType: request.accountType,
    amount: request.amount,
    status: request.status,
    rejectReason: request.rejectReason,
    submittedAt: request.submittedAt,
    processingDate: request.processingDate,
    transferredAt: request.transferredAt,
  };
}

export function toStaff(request: MemberRequest, deps: Deps): StaffRequest {
  const payout = request.payoutAccountId
    ? deps.data.listPayoutAccounts().find((a) => a.id === request.payoutAccountId)
    : undefined;
  return {
    ...toMine(request),
    memberCode: request.memberCode,
    slipFileId: request.slipFileId,
    slipCheck: request.slipCheck,
    slipRef: request.slipRef,
    reviewedBy: request.reviewedBy,
    reviewedAt: request.reviewedAt,
    approvedBy: request.approvedBy,
    approvedAt: request.approvedAt,
    completedBy: request.completedBy,
    completedAt: request.completedAt,
    rejectedBy: request.rejectedBy,
    rejectedAt: request.rejectedAt,
    signatureFileId: request.signatureFileId,
    pdfFileId: request.pdfFileId,
    payoutAccount: payout
      ? {
          id: payout.id,
          bankCode: payout.bankCode,
          accountNumber: payout.accountNumber,
          accountName: payout.accountName,
          documents: {
            idCard: payout.idCardFileId,
            depositBook: payout.depositBookFileId,
            payoutBook: payout.payoutBookFileId,
          },
        }
      : null,
  };
}
