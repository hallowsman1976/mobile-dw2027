// งานประจำวันของเจ้าหน้าที่: export คำขอที่อนุมัติแล้วไปบันทึกในระบบหลัก แล้วปิดเป็นเสร็จสิ้น (ticket 11)
import {
  ACCOUNT_TYPE_LABELS,
  BANKS,
  SLIP_CHECK_LABELS,
  type ApiAuth,
  type CompleteRequestsResult,
  type ExportApprovedResult,
} from '../../../shared/api';
import { formatThaiDate, formatThaiDateTimeFromIso } from '../../../shared/format';
import type { Deps, MemberRequest, SpreadsheetTab } from '../adapters/ports';
import { AppError } from './errors';
import { audit, notifyStatusChanged } from './requests';
import { requireStaff } from './staff';
import { requirePayload } from './validate';

const MAX_BATCH = 200;

export function exportApproved(input: { auth?: ApiAuth; payload?: unknown }, deps: Deps): ExportApprovedResult {
  const staff = requireStaff(input.auth, deps);
  const processingDate = requireYmd(requirePayload(input.payload).processingDate);

  const approved = deps.data
    .listRequests()
    .filter((r) => r.status === 'approved' && r.processingDate <= processingDate)
    .sort((a, b) => a.requestNumber.localeCompare(b.requestNumber));
  const deposits = approved.filter((r) => r.type === 'deposit');
  const withdrawals = approved.filter((r) => r.type === 'withdrawal');
  const payouts = new Map(deps.data.listPayoutAccounts().map((p) => [p.id, p]));

  const common = (r: MemberRequest) => [
    r.requestNumber,
    r.processingDate,
    r.memberCode,
    r.accountNumber,
    r.accountName,
    ACCOUNT_TYPE_LABELS[r.accountType],
    r.amount,
  ];
  const commonHeader = ['เลขที่คำขอ', 'วันทำการ', 'รหัสสมาชิก', 'หมายเลขบัญชี', 'ชื่อบัญชี', 'ประเภทบัญชี', 'จำนวนเงิน'];

  const sheets: SpreadsheetTab[] = [
    {
      name: 'ฝาก',
      rows: [
        [...commonHeader, 'วันเวลาที่โอน', 'ผลตรวจสลิป'],
        ...deposits.map((r) => [...common(r), formatThaiDateTimeFromIso(r.transferredAt), SLIP_CHECK_LABELS[r.slipCheck]]),
        totalRow(deposits, commonHeader.length),
      ],
    },
    {
      name: 'ถอน',
      rows: [
        [...commonHeader, 'ธนาคาร', 'เลขบัญชีรับเงิน', 'ชื่อบัญชีรับเงิน', 'ผู้ตรวจ', 'ผู้อนุมัติ'],
        ...withdrawals.map((r) => {
          const payout = payouts.get(r.payoutAccountId);
          return [
            ...common(r),
            BANKS.find((b) => b.code === payout?.bankCode)?.name ?? payout?.bankCode ?? '',
            payout?.accountNumber ?? '',
            payout?.accountName ?? '',
            r.reviewedBy,
            r.approvedBy,
          ];
        }),
        totalRow(withdrawals, commonHeader.length),
      ],
    },
  ];

  const file = deps.files.buildSpreadsheet(`คำขอที่อนุมัติ ถึง ${formatThaiDate(processingDate)}.xlsx`, sheets);
  deps.data.appendAuditLog({
    at: deps.clock.now().toISOString(),
    actor: staff.username,
    action: 'exportApproved',
    target: processingDate,
    detail: `ฝาก ${deposits.length} รายการ, ถอน ${withdrawals.length} รายการ`,
  });
  return {
    ...file,
    depositCount: deposits.length,
    depositTotal: sum(deposits),
    withdrawalCount: withdrawals.length,
    withdrawalTotal: sum(withdrawals),
  };
}

/** ปิดคำขอที่อนุมัติแล้วเป็นเสร็จสิ้น ทีละหลายรายการ แต่ละรายการสำเร็จหรือล้มเหลวแยกกัน */
export function completeRequests(input: { auth?: ApiAuth; payload?: unknown }, deps: Deps): CompleteRequestsResult {
  const staff = requireStaff(input.auth, deps);
  const ids = requirePayload(input.payload).ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
    throw new AppError('VALIDATION', 'กรุณาเลือกคำขออย่างน้อย 1 รายการ');
  }
  if (ids.length > MAX_BATCH) throw new AppError('VALIDATION', `ปิดได้ครั้งละไม่เกิน ${MAX_BATCH} รายการ`);

  const completed: MemberRequest[] = [];
  const results = deps.data.withLock(() => {
    const byId = new Map(deps.data.listRequests().map((r) => [r.id, r]));
    const now = deps.clock.now().toISOString();
    return [...new Set(ids as string[])].map((id) => {
      const request = byId.get(id);
      if (!request) return { id, requestNumber: '', ok: false, message: 'ไม่พบคำขอนี้' };
      if (request.status !== 'approved') {
        return { id, requestNumber: request.requestNumber, ok: false, message: 'ปิดได้เฉพาะคำขอที่อนุมัติแล้ว' };
      }
      const done: MemberRequest = { ...request, status: 'completed', completedBy: staff.username, completedAt: now };
      deps.data.saveRequest(done);
      audit(staff.username, 'completeRequest', done, '', deps);
      completed.push(done);
      return { id, requestNumber: request.requestNumber, ok: true, message: 'เสร็จสิ้น' };
    });
  });

  for (const request of completed) notifyStatusChanged(request, deps);
  return results;
}

function totalRow(requests: MemberRequest[], amountColumn: number): (string | number)[] {
  const row: (string | number)[] = new Array(amountColumn).fill('');
  row[0] = `รวม ${requests.length} รายการ`;
  row[amountColumn - 1] = sum(requests);
  return row;
}

function sum(requests: MemberRequest[]): number {
  return Math.round(requests.reduce((total, r) => total + r.amount * 100, 0)) / 100;
}

function requireYmd(value: unknown): string {
  const date = typeof value === 'string' ? value : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError('VALIDATION', 'กรุณาเลือกวันทำการ');
  return date;
}
