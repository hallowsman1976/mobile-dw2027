// คำขอถอนเงิน: ยื่นพร้อมลายมือชื่อและ PIN แล้วผ่านผู้ตรวจและผู้อนุมัติคนละคน (ticket 09)
import {
  SIGNATURE_MAX_BYTES,
  WITHDRAWAL_MAX_AMOUNT,
  WITHDRAWAL_MIN_AMOUNT,
  type ApiAuth,
  type MyRequest,
  type RequestStatus,
  type StaffRequest,
} from '../../../shared/api';
import { formatBaht } from '../../../shared/format';
import type { Deps, MemberRequest } from '../adapters/ports';
import { processingDateFor } from './businessDays';
import { AppError } from './errors';
import { requireMember } from './members';
import { checkMemberPin } from './pin';
import {
  audit,
  emptyRequest,
  findRequest,
  nextRequestNumber,
  notifyStatusChanged,
  notifySubmitted,
  requireOwnAccount,
  requireRejectReason,
  requireStatus,
  toMine,
  toStaff,
  validateAmount,
} from './requests';
import { requireStaff } from './staff';
import { validateUpload } from './uploads';
import { generateWithdrawalPdf } from './withdrawalPdf';
import { requirePayload, requireString } from './validate';

/** สถานะที่นับเป็นคำขอค้าง: บัญชีเงินฝากหนึ่งบัญชีมีคำขอถอนเงินค้างได้ครั้งละหนึ่งรายการ */
const OPEN_STATUSES: RequestStatus[] = ['pendingReview', 'pendingApproval', 'approved'];

export function submitWithdrawalRequest(input: { auth?: ApiAuth; payload?: unknown }, deps: Deps): MyRequest {
  const { binding } = requireMember(input.auth, deps);
  const payload = requirePayload(input.payload);
  const account = requireOwnAccount(binding.memberCode, payload.accountNumber, deps);
  const amount = validateAmount(payload.amount, WITHDRAWAL_MIN_AMOUNT, WITHDRAWAL_MAX_AMOUNT);
  const payoutAccountId = requireString(payload.payoutAccountId, 'บัญชีรับเงิน');
  const payout = deps.data.listPayoutAccounts().find((a) => a.id === payoutAccountId);
  if (!payout || payout.memberCode !== binding.memberCode || payout.status !== 'approved') {
    throw new AppError('VALIDATION', 'กรุณาเลือกบัญชีรับเงินของท่านที่ได้รับอนุมัติแล้ว');
  }
  const signature = validateUpload(payload.signature, 'ลายมือชื่อ', ['image/png'], SIGNATURE_MAX_BYTES);
  const pin = typeof payload.pin === 'string' ? payload.pin : '';

  const request = deps.data.withLock(() => {
    checkMemberPin(binding.id, binding.memberCode, pin, deps);

    const open = deps.data
      .listRequests()
      .find(
        (r) => r.type === 'withdrawal' && r.accountNumber === account.accountNumber && OPEN_STATUSES.includes(r.status),
      );
    if (open) {
      throw new AppError(
        'CONFLICT',
        `บัญชี ${account.accountNumber} มีคำขอถอนเงิน ${open.requestNumber} ที่ยังไม่เสร็จ กรุณารอให้เสร็จหรือยกเลิกก่อน`,
      );
    }

    const now = deps.clock.now();
    const requestNumber = nextRequestNumber('withdrawal', now, deps);
    const signatureFileId = deps.files.saveFile('signatures', `${requestNumber}.png`, 'image/png', signature.contentBase64);
    const request: MemberRequest = {
      ...emptyRequest(),
      id: deps.random.uuid(),
      requestNumber,
      type: 'withdrawal',
      memberCode: binding.memberCode,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      accountType: account.accountType,
      amount,
      payoutAccountId: payout.id,
      signatureFileId,
      status: 'pendingReview',
      submittedAt: now.toISOString(),
      processingDate: processingDateFor(now, deps),
    };
    deps.data.saveRequest(request);
    audit(`member:${binding.memberCode}`, 'submitWithdrawalRequest', request, `${formatBaht(amount)} บาท`, deps);
    return request;
  });

  notifySubmitted(request, deps);
  return toMine(request);
}

/** ผู้อนุมัติอนุมัติหรือปฏิเสธคำขอถอนเงินที่ผู้ตรวจผ่านแล้ว ต้องไม่ใช่คนเดียวกับผู้ตรวจ */
export function approveRequest(input: { auth?: ApiAuth; payload?: unknown }, deps: Deps): StaffRequest {
  const staff = requireStaff(input.auth, deps, 'approver');
  const payload = requirePayload(input.payload);
  const id = requireString(payload.id, 'คำขอ');
  const decision = payload.decision;
  if (decision !== 'approve' && decision !== 'reject') {
    throw new AppError('BAD_REQUEST', 'รูปแบบคำขอไม่ถูกต้อง');
  }
  const reason = requireRejectReason(decision, payload.reason);

  const updated = deps.data.withLock(() => {
    const request = findRequest(id, deps);
    requireStatus(request, ['pendingApproval'], 'คำขอนี้ไม่ได้อยู่ในสถานะรออนุมัติ');
    if (request.reviewedBy === staff.username) {
      throw new AppError('FORBIDDEN', 'ผู้อนุมัติต้องไม่ใช่คนเดียวกับผู้ตรวจคำขอนี้');
    }
    const now = deps.clock.now().toISOString();
    const decided: MemberRequest =
      decision === 'approve'
        ? { ...request, status: 'approved', approvedBy: staff.username, approvedAt: now }
        : { ...request, status: 'rejected', rejectedBy: staff.username, rejectedAt: now, rejectReason: reason };
    deps.data.saveRequest(decided);
    audit(staff.username, decision === 'approve' ? 'approveRequest' : 'rejectRequest', decided, reason, deps);
    return decided;
  });

  if (updated.status === 'approved') generateWithdrawalPdf(updated, deps);
  notifyStatusChanged(updated, deps);
  return toStaff(findRequest(updated.id, deps), deps);
}
