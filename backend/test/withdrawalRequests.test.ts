import { beforeEach, describe, expect, it } from 'vitest';
import type { PayoutAccount } from '../src/adapters/ports';
import { JPEG, MEMBER_PIN, PNG, STAFF_GROUP, createScene, type Scene } from './helpers';

let scene: Scene;

function payoutAccount(partial: Partial<PayoutAccount>): PayoutAccount {
  return {
    id: 'payout-somchai',
    memberCode: '00123',
    bankCode: 'KTB',
    accountNumber: '1234567890',
    accountName: 'นายสมชาย ใจดี',
    status: 'approved',
    idCardFileId: 'doc-id',
    depositBookFileId: 'doc-book',
    payoutBookFileId: 'doc-payout',
    createdAt: '2026-01-01T00:00:00.000Z',
    reviewedBy: 'admin',
    reviewedAt: '2026-01-01T00:00:00.000Z',
    rejectReason: '',
    retiredAt: '',
    filesPurgedAt: '',
    ...partial,
  };
}

function withdraw(overrides: Record<string, unknown> = {}, token?: string) {
  return scene.member(
    'submitWithdrawalRequest',
    { accountNumber: '001-1', payoutAccountId: 'payout-somchai', amount: 5000, signature: PNG, pin: MEMBER_PIN, ...overrides },
    token,
  );
}

function idOf(res: unknown): string {
  return (res as { data: { id: string } }).data.id;
}

beforeEach(() => {
  scene = createScene();
  scene.world.payoutAccounts.push(
    payoutAccount({}),
    payoutAccount({ id: 'payout-pending', accountNumber: '2222222222', status: 'pendingReview' }),
    payoutAccount({ id: 'payout-somying', memberCode: '04567', accountName: 'นางสาวสมหญิง รักออม' }),
  );
  scene.addStaff('checker', ['reviewer']);
  scene.addStaff('boss', ['approver']);
  scene.addStaff('both', ['reviewer', 'approver']);
});

describe('submitWithdrawalRequest', () => {
  it('สร้างคำขอถอนเงินรอตรวจ บันทึกลายมือชื่อ และแจ้งสมาชิกกับกลุ่มเจ้าหน้าที่', () => {
    expect(withdraw()).toMatchObject({
      ok: true,
      data: {
        requestNumber: 'WD-2026-000001',
        type: 'withdrawal',
        accountNumber: '001-1',
        amount: 5000,
        status: 'pendingReview',
        processingDate: '2026-01-05',
      },
    });
    expect(scene.world.requests[0]).toMatchObject({ payoutAccountId: 'payout-somchai', signatureFileId: 'file-1' });
    expect([...scene.world.files.values()]).toEqual([
      { category: 'signatures', fileName: 'WD-2026-000001.png', mimeType: 'image/png', contentBase64: PNG.contentBase64 },
    ]);
    expect(scene.world.sentMessages.map((m) => m.to)).toEqual(['U-somchai', STAFF_GROUP]);
    expect(scene.world.sentMessages[0].text).toContain('ได้รับคำขอถอนเงิน WD-2026-000001');
  });

  it('ตรวจยอด บัญชี บัญชีรับเงิน และลายมือชื่อ', () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ amount: 999.99 }, '1,000.00 ถึง 100,000.00'],
      [{ amount: 100000.01 }, '1,000.00 ถึง 100,000.00'],
      [{ accountNumber: '001-9' }, 'บัญชีเงินฝากของท่าน'],
      [{ payoutAccountId: 'payout-pending' }, 'ได้รับอนุมัติแล้ว'],
      [{ payoutAccountId: 'payout-somying' }, 'ได้รับอนุมัติแล้ว'],
      [{ payoutAccountId: 'nope' }, 'ได้รับอนุมัติแล้ว'],
      [{ signature: undefined }, 'กรุณาแนบลายมือชื่อ'],
      [{ signature: JPEG }, 'ต้องเป็นไฟล์ PNG'],
    ];
    for (const [overrides, message] of cases) {
      expect(withdraw(overrides)).toMatchObject({ error: { code: 'VALIDATION', message: expect.stringContaining(message) } });
    }
    expect(withdraw({ amount: 1000 })).toMatchObject({ ok: true });
    scene.world.requests.length = 0;
    expect(withdraw({ amount: 100000, accountNumber: '002-1' })).toMatchObject({ ok: true });
  });

  it('PIN ผิดนับรวมกับการล็อก และ PIN ที่ถูกล็อกถอนไม่ได้', () => {
    for (let i = 0; i < 4; i++) {
      expect(withdraw({ pin: '000999' })).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } });
    }
    expect(withdraw({ pin: '000999' })).toMatchObject({ error: { code: 'ACCOUNT_LOCKED' } });
    expect(withdraw()).toMatchObject({ error: { code: 'ACCOUNT_LOCKED' } });
    expect(scene.world.requests).toEqual([]);
  });

  it('บัญชีเงินฝากหนึ่งบัญชีมีคำขอถอนเงินค้างได้ครั้งละหนึ่งรายการ', () => {
    const first = idOf(withdraw());
    expect(withdraw({ amount: 2000 })).toMatchObject({
      error: { code: 'CONFLICT', message: expect.stringContaining('WD-2026-000001') },
    });
    // บัญชีเงินฝากอื่น และคำขอฝากเงิน ไม่ถูกจำกัด
    expect(withdraw({ accountNumber: '002-1' })).toMatchObject({ ok: true });

    scene.staff('reviewRequest', { id: first, decision: 'approve' }, 'checker');
    expect(withdraw({ amount: 2000 })).toMatchObject({ error: { code: 'CONFLICT' } });
    scene.staff('approveRequest', { id: first, decision: 'approve' }, 'boss');
    expect(withdraw({ amount: 2000 })).toMatchObject({ error: { code: 'CONFLICT' } });
  });

  it('ยื่นใหม่ได้หลังคำขอเดิมถูกยกเลิก ปฏิเสธ หรือเสร็จสิ้น', () => {
    const cancelled = idOf(withdraw());
    scene.member('cancelRequest', { id: cancelled });
    const rejected = idOf(withdraw());
    scene.staff('reviewRequest', { id: rejected, decision: 'reject', reason: 'ลายมือชื่อไม่ชัด' }, 'checker');
    const completed = idOf(withdraw());
    scene.world.requests.find((r) => r.id === completed)!.status = 'completed';
    expect(withdraw()).toMatchObject({ ok: true, data: { requestNumber: 'WD-2026-000004' } });
  });

  it('ยังไม่ผูกบัญชีได้ NOT_BOUND', () => {
    expect(withdraw({}, 'token-stranger')).toMatchObject({ error: { code: 'NOT_BOUND' } });
  });
});

describe('ผู้ตรวจและผู้อนุมัติ', () => {
  it('ผู้ตรวจผ่าน → รออนุมัติ แจ้งสมาชิกและกลุ่มเจ้าหน้าที่ จากนั้นผู้อนุมัติอนุมัติ → อนุมัติ', () => {
    const id = idOf(withdraw());
    scene.world.sentMessages.length = 0;

    expect(scene.staff('reviewRequest', { id, decision: 'approve' }, 'checker')).toMatchObject({
      data: { status: 'pendingApproval', reviewedBy: 'checker' },
    });
    expect(scene.world.sentMessages).toEqual([
      { to: 'U-somchai', text: 'คำขอถอนเงิน WD-2026-000001 ยอด 5,000.00 บาท\nผ่านการตรวจแล้ว รอผู้อนุมัติ' },
      { to: STAFF_GROUP, text: 'คำขอถอนเงิน WD-2026-000001 รออนุมัติ\nสมาชิก 00123\nยอด 5,000.00 บาท\nตรวจแล้วโดย checker' },
    ]);
    scene.world.sentMessages.length = 0;

    expect(scene.staff('approveRequest', { id, decision: 'approve' }, 'boss')).toMatchObject({
      data: { status: 'approved', approvedBy: 'boss', approvedAt: '2026-01-05T02:00:00.000Z' },
    });
    expect(scene.world.sentMessages).toEqual([
      { to: 'U-somchai', text: 'คำขอถอนเงิน WD-2026-000001 ยอด 5,000.00 บาท\nอนุมัติแล้ว เจ้าหน้าที่จะโอนเงินในวันทำการ 5 ม.ค. 2569' },
    ]);
    expect(scene.world.auditLog).toContainEqual(expect.objectContaining({ actor: 'boss', action: 'approveRequest', target: 'WD-2026-000001' }));
  });

  it('ผู้อนุมัติปฏิเสธได้พร้อมเหตุผล', () => {
    const id = idOf(withdraw());
    scene.staff('reviewRequest', { id, decision: 'approve' }, 'checker');
    expect(scene.staff('approveRequest', { id, decision: 'reject' }, 'boss')).toMatchObject({ error: { code: 'VALIDATION' } });
    expect(scene.staff('approveRequest', { id, decision: 'reject', reason: 'ยอดคงเหลือไม่พอ' }, 'boss')).toMatchObject({
      data: { status: 'rejected', rejectedBy: 'boss', rejectReason: 'ยอดคงเหลือไม่พอ' },
    });
    expect(scene.member('listMyRequests')).toMatchObject({ data: [{ status: 'rejected', rejectReason: 'ยอดคงเหลือไม่พอ' }] });
  });

  it('คนที่มีทั้งสองบทบาท อนุมัติคำขอที่ตัวเองตรวจไม่ได้ แต่อนุมัติคำขอที่คนอื่นตรวจได้', () => {
    const own = idOf(withdraw());
    scene.staff('reviewRequest', { id: own, decision: 'approve' }, 'both');
    expect(scene.staff('approveRequest', { id: own, decision: 'approve' }, 'both')).toMatchObject({
      error: { code: 'FORBIDDEN', message: expect.stringContaining('ไม่ใช่คนเดียวกับผู้ตรวจ') },
    });

    const other = idOf(withdraw({ accountNumber: '002-1' }));
    scene.staff('reviewRequest', { id: other, decision: 'approve' }, 'checker');
    expect(scene.staff('approveRequest', { id: other, decision: 'approve' }, 'both')).toMatchObject({
      data: { status: 'approved' },
    });
  });

  it('อนุมัติได้เฉพาะคำขอที่รออนุมัติ และต้องมีบทบาทผู้อนุมัติ', () => {
    const id = idOf(withdraw());
    expect(scene.staff('approveRequest', { id, decision: 'approve' }, 'boss')).toMatchObject({ error: { code: 'CONFLICT' } });
    scene.staff('reviewRequest', { id, decision: 'approve' }, 'checker');
    expect(scene.staff('approveRequest', { id, decision: 'approve' }, 'checker')).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(scene.member('cancelRequest', { id })).toMatchObject({ error: { code: 'CONFLICT' } });
  });

  it('เจ้าหน้าที่เห็นข้อมูลบัญชีรับเงินพร้อมเอกสาร และเปิดลายมือชื่อได้', () => {
    const id = idOf(withdraw());
    expect(scene.staff('getRequest', { id }, 'checker')).toMatchObject({
      data: {
        signatureFileId: 'file-1',
        payoutAccount: {
          id: 'payout-somchai',
          bankCode: 'KTB',
          accountNumber: '1234567890',
          documents: { idCard: 'doc-id', depositBook: 'doc-book', payoutBook: 'doc-payout' },
        },
      },
    });
    expect(scene.staff('viewDocument', { fileId: 'file-1' }, 'boss')).toMatchObject({ data: { mimeType: 'image/png' } });
  });
});
