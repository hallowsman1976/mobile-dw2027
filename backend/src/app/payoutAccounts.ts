// บัญชีรับเงิน: สมาชิกลงทะเบียนพร้อมเอกสาร ผู้ตรวจอนุมัติหรือปฏิเสธ (ticket 06)
import {
  BANKS,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIME_TYPES,
  PAYOUT_DOCUMENT_LABELS,
  type ApiAuth,
  type MyPayoutAccount,
  type PayoutAccountForReview,
  type PayoutAccountStatus,
  type PayoutDocumentKind,
} from '../../../shared/api';
import type { Deps, PayoutAccount } from '../adapters/ports';
import { AppError } from './errors';
import { memberName, requireMember } from './members';
import { maskAccountNumber, notifyMember, notifyStaffGroup } from './notify';
import { requireStaff } from './staff';
import { validateUpload } from './uploads';
import { requirePayload, requireString } from './validate';

const MAX_ACTIVE_PAYOUT_ACCOUNTS = 3;
const DOCUMENT_KINDS = Object.keys(PAYOUT_DOCUMENT_LABELS) as PayoutDocumentKind[];

// ---------- สมาชิก ----------

export function registerPayoutAccount(
  input: { auth?: ApiAuth; payload?: unknown },
  deps: Deps,
): MyPayoutAccount {
  const { binding } = requireMember(input.auth, deps);
  const payload = requirePayload(input.payload);

  const bank = BANKS.find((b) => b.code === payload.bankCode);
  if (!bank) throw new AppError('VALIDATION', 'กรุณาเลือกธนาคาร');
  const accountNumber = requireString(payload.accountNumber, 'เลขบัญชี').replace(/[\s-]/g, '');
  if (!/^\d{10,15}$/.test(accountNumber)) {
    throw new AppError('VALIDATION', 'เลขบัญชีต้องเป็นตัวเลข 10–15 หลัก');
  }
  const accountName = requireString(payload.accountName, 'ชื่อบัญชี').trim().replace(/\s+/g, ' ');
  if (accountName.length > 100) throw new AppError('VALIDATION', 'ชื่อบัญชียาวเกิน 100 ตัวอักษร');
  const branch = requireString(payload.branch, 'สาขา').trim().replace(/\s+/g, ' ');
  if (branch.length > 100) throw new AppError('VALIDATION', 'ชื่อสาขายาวเกิน 100 ตัวอักษร');

  const rawDocuments = (payload.documents ?? {}) as Record<string, unknown>;
  const documents = Object.fromEntries(
    DOCUMENT_KINDS.map((kind) => [
      kind,
      validateUpload(rawDocuments[kind], PAYOUT_DOCUMENT_LABELS[kind], DOCUMENT_MIME_TYPES, DOCUMENT_MAX_BYTES),
    ]),
  ) as Record<PayoutDocumentKind, ReturnType<typeof validateUpload>>;

  const account = deps.data.withLock(() => {
    const active = deps.data
      .listPayoutAccounts()
      .filter((a) => a.memberCode === binding.memberCode && isActive(a.status));
    if (active.some((a) => a.bankCode === bank.code && a.accountNumber === accountNumber)) {
      throw new AppError('CONFLICT', 'บัญชีนี้ลงทะเบียนไว้แล้ว');
    }
    if (active.length >= MAX_ACTIVE_PAYOUT_ACCOUNTS) {
      throw new AppError(
        'CONFLICT',
        `มีบัญชีรับเงินได้ไม่เกิน ${MAX_ACTIVE_PAYOUT_ACCOUNTS} บัญชี กรุณาเลิกใช้บัญชีเดิมก่อน`,
      );
    }

    const id = deps.random.uuid();
    const fileIds = Object.fromEntries(
      DOCUMENT_KINDS.map((kind) => {
        const file = documents[kind];
        const extension = file.mimeType === 'application/pdf' ? 'pdf' : file.mimeType === 'image/png' ? 'png' : 'jpg';
        return [
          kind,
          deps.files.saveFile('payoutDocuments', `${binding.memberCode}-${id}-${kind}.${extension}`, file.mimeType, file.contentBase64),
        ];
      }),
    ) as Record<PayoutDocumentKind, string>;

    const now = deps.clock.now().toISOString();
    const account: PayoutAccount = {
      id,
      memberCode: binding.memberCode,
      bankCode: bank.code,
      accountNumber,
      accountName,
      status: 'pendingReview',
      idCardFileId: fileIds.idCard,
      depositBookFileId: fileIds.depositBook,
      payoutBookFileId: fileIds.payoutBook,
      createdAt: now,
      reviewedBy: '',
      reviewedAt: '',
      rejectReason: '',
      retiredAt: '',
      filesPurgedAt: '',
      branch,
    };
    deps.data.savePayoutAccount(account);
    deps.data.appendAuditLog({
      at: now,
      actor: `member:${binding.memberCode}`,
      action: 'registerPayoutAccount',
      target: id,
      detail: `${bank.name} ${maskAccountNumber(accountNumber)}`,
    });
    return account;
  });

  notifyStaffGroup(
    `บัญชีรับเงินใหม่รอตรวจ\nสมาชิก ${binding.memberCode} ${memberName(binding.memberCode, deps)}\n${bank.name} ${maskAccountNumber(accountNumber)}`,
    deps,
  );
  return toMine(account);
}

export function listMyPayoutAccounts(input: { auth?: ApiAuth }, deps: Deps): MyPayoutAccount[] {
  const { binding } = requireMember(input.auth, deps);
  return deps.data
    .listPayoutAccounts()
    .filter((a) => a.memberCode === binding.memberCode && a.status !== 'retired')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toMine);
}

export function retirePayoutAccount(
  input: { auth?: ApiAuth; payload?: unknown },
  deps: Deps,
): MyPayoutAccount {
  const { binding } = requireMember(input.auth, deps);
  const id = requireString(requirePayload(input.payload).id, 'บัญชี');

  return deps.data.withLock(() => {
    const account = deps.data.listPayoutAccounts().find((a) => a.id === id);
    if (!account || account.memberCode !== binding.memberCode) {
      throw new AppError('NOT_FOUND', 'ไม่พบบัญชีรับเงินนี้');
    }
    if (!isActive(account.status)) {
      throw new AppError('CONFLICT', 'บัญชีนี้เลิกใช้หรือถูกปฏิเสธไปแล้ว');
    }
    const now = deps.clock.now().toISOString();
    const retired: PayoutAccount = { ...account, status: 'retired', retiredAt: now };
    deps.data.savePayoutAccount(retired);
    deps.data.appendAuditLog({
      at: now,
      actor: `member:${binding.memberCode}`,
      action: 'retirePayoutAccount',
      target: id,
      detail: '',
    });
    return toMine(retired);
  });
}

// ---------- ผู้ตรวจ ----------

export function listPayoutAccountsForReview(
  input: { auth?: ApiAuth; payload?: unknown },
  deps: Deps,
): PayoutAccountForReview[] {
  requireStaff(input.auth, deps, 'reviewer');
  const status = (input.payload as { status?: PayoutAccountStatus } | undefined)?.status ?? 'pendingReview';
  return deps.data
    .listPayoutAccounts()
    .filter((a) => a.status === status)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((a) => toReview(a, deps));
}

export function reviewPayoutAccount(
  input: { auth?: ApiAuth; payload?: unknown },
  deps: Deps,
): PayoutAccountForReview {
  const staff = requireStaff(input.auth, deps, 'reviewer');
  const payload = requirePayload(input.payload);
  const id = requireString(payload.id, 'บัญชี');
  if (payload.decision !== 'approve' && payload.decision !== 'reject') {
    throw new AppError('BAD_REQUEST', 'รูปแบบคำขอไม่ถูกต้อง');
  }
  const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
  if (payload.decision === 'reject' && !reason) {
    throw new AppError('VALIDATION', 'กรุณาระบุเหตุผลที่ปฏิเสธ เพื่อแจ้งสมาชิก');
  }

  const { account, reviewed } = deps.data.withLock(() => {
    const account = deps.data.listPayoutAccounts().find((a) => a.id === id);
    if (!account) throw new AppError('NOT_FOUND', 'ไม่พบบัญชีรับเงินนี้');
    if (account.status !== 'pendingReview') {
      throw new AppError('CONFLICT', 'บัญชีนี้ได้รับการตรวจไปแล้ว');
    }

    const now = deps.clock.now().toISOString();
    const approved = payload.decision === 'approve';
    const reviewed: PayoutAccount = {
      ...account,
      status: approved ? 'approved' : 'rejected',
      reviewedBy: staff.username,
      reviewedAt: now,
      rejectReason: approved ? '' : reason,
    };
    deps.data.savePayoutAccount(reviewed);
    deps.data.appendAuditLog({
      at: now,
      actor: staff.username,
      action: approved ? 'approvePayoutAccount' : 'rejectPayoutAccount',
      target: id,
      detail: reason,
    });
    return { account, reviewed };
  });

  const bankName = BANKS.find((b) => b.code === account.bankCode)?.name ?? account.bankCode;
  notifyMember(
    account.memberCode,
    reviewed.status === 'approved'
      ? `บัญชีรับเงิน ${bankName} ${account.accountNumber} ได้รับการอนุมัติแล้ว ใช้รับเงินที่ถอนได้`
      : `บัญชีรับเงิน ${bankName} ${account.accountNumber} ไม่ผ่านการตรวจ\nเหตุผล: ${reason}\nกรุณาลงทะเบียนใหม่ในเมนูบัญชีรับเงินของฉัน`,
    deps,
  );
  return toReview(reviewed, deps);
}

// ---------- ส่วนช่วย ----------

export function isActive(status: PayoutAccountStatus): boolean {
  return status === 'pendingReview' || status === 'approved';
}

function toMine(account: PayoutAccount): MyPayoutAccount {
  return {
    id: account.id,
    bankCode: account.bankCode,
    accountNumber: account.accountNumber,
    accountName: account.accountName,
    branch: account.branch,
    status: account.status,
    rejectReason: account.rejectReason,
    createdAt: account.createdAt,
  };
}

function toReview(account: PayoutAccount, deps: Deps): PayoutAccountForReview {
  return {
    ...toMine(account),
    memberCode: account.memberCode,
    memberName: memberName(account.memberCode, deps),
    documents: {
      idCard: account.idCardFileId,
      depositBook: account.depositBookFileId,
      payoutBook: account.payoutBookFileId,
    },
    reviewedBy: account.reviewedBy,
    reviewedAt: account.reviewedAt,
  };
}
