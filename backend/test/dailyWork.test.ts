import { beforeEach, describe, expect, it } from 'vitest';
import type { SpreadsheetTab } from '../src/adapters/ports';
import { JPEG, MEMBER_PIN, PNG, createScene, type Scene } from './helpers';

let scene: Scene;

function idOf(res: unknown): string {
  return (res as { data: { id: string } }).data.id;
}

function deposit(amount: number, accountNumber = '001-1', token?: string): string {
  return idOf(
    scene.member(
      'submitDepositRequest',
      { accountNumber, amount, transferredAt: '2026-01-05T08:00:00+07:00', slip: JPEG },
      token,
    ),
  );
}

function withdraw(amount: number, accountNumber = '001-1'): string {
  return idOf(
    scene.member('submitWithdrawalRequest', {
      accountNumber,
      payoutAccountId: 'payout-somchai',
      amount,
      signature: PNG,
      pin: MEMBER_PIN,
      contactPhone: '0812345678',
    }),
  );
}

function approveDeposit(id: string): void {
  scene.staff('reviewRequest', { id, decision: 'approve' }, 'checker');
}

function approveWithdrawal(id: string): void {
  scene.staff('reviewRequest', { id, decision: 'approve' }, 'checker');
  scene.staff('approveRequest', { id, decision: 'approve' }, 'boss');
}

function exportedSheets(res: unknown): SpreadsheetTab[] {
  const content = (res as { data: { contentBase64: string } }).data.contentBase64;
  return JSON.parse(Buffer.from(content, 'base64').toString('utf8')) as SpreadsheetTab[];
}

beforeEach(() => {
  scene = createScene();
  scene.world.payoutAccounts.push({
    id: 'payout-somchai',
    memberCode: '00123',
    bankCode: 'KTB',
    accountNumber: '1234567890',
    accountName: 'นายสมชาย ใจดี',
    status: 'approved',
    idCardFileId: 'a',
    depositBookFileId: 'b',
    payoutBookFileId: 'c',
    createdAt: '2026-01-01T00:00:00.000Z',
    reviewedBy: 'admin',
    reviewedAt: '2026-01-01T00:00:00.000Z',
    rejectReason: '',
    retiredAt: '',
    filesPurgedAt: '',
    branch: 'สาขามุกดาหาร',
  });
  scene.addStaff('checker', ['reviewer']);
  scene.addStaff('boss', ['approver']);
});

describe('exportApproved', () => {
  it('รวมเฉพาะคำขอที่อนุมัติแล้วซึ่งวันทำการไม่เกินวันที่เลือก แยกแท็บฝากและถอน พร้อมยอดรวม', () => {
    approveDeposit(deposit(1500));
    approveDeposit(deposit(250.5, '002-1'));
    deposit(999); // ยังรอตรวจ ไม่รวม
    approveWithdrawal(withdraw(5000));
    const pendingApproval = withdraw(3000, '002-1');
    scene.staff('reviewRequest', { id: pendingApproval, decision: 'approve' }, 'checker'); // ยังรออนุมัติ ไม่รวม

    // คำขอที่ยื่นหลังตัดรอบ ไปวันทำการถัดไป
    scene.world.setNow(new Date('2026-01-05T16:00:00+07:00'));
    approveDeposit(deposit(700, '001-9', 'token-somying'));

    const res = scene.staff('exportApproved', { processingDate: '2026-01-05' });
    expect(res).toMatchObject({
      ok: true,
      data: {
        fileName: 'คำขอที่อนุมัติ ถึง 5 ม.ค. 2569.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        depositCount: 2,
        depositTotal: 1750.5,
        withdrawalCount: 1,
        withdrawalTotal: 5000,
      },
    });

    const [deposits, withdrawals] = exportedSheets(res);
    expect(deposits.name).toBe('ฝาก');
    expect(deposits.rows).toEqual([
      ['เลขที่คำขอ', 'วันทำการ', 'รหัสสมาชิก', 'หมายเลขบัญชี', 'ชื่อบัญชี', 'ประเภทบัญชี', 'จำนวนเงิน', 'วันเวลาที่โอน', 'ผลตรวจสลิป'],
      ['DP-2026-000001', '2026-01-05', '00123', '001-1', 'นายสมชาย ใจดี', 'ออมทรัพย์', 1500, '5 ม.ค. 2569 08:00', 'ยังไม่ตรวจสลิป'],
      ['DP-2026-000002', '2026-01-05', '00123', '002-1', 'นายสมชาย ใจดี', 'ออมทรัพย์พิเศษ', 250.5, '5 ม.ค. 2569 08:00', 'ยังไม่ตรวจสลิป'],
      ['รวม 2 รายการ', '', '', '', '', '', 1750.5],
    ]);
    expect(withdrawals.name).toBe('ถอน');
    expect(withdrawals.rows[1]).toEqual([
      'WD-2026-000001', '2026-01-05', '00123', '001-1', 'นายสมชาย ใจดี', 'ออมทรัพย์', 5000,
      'ธนาคารกรุงไทย', '1234567890', 'นายสมชาย ใจดี', 'checker', 'boss',
    ]);
    expect(withdrawals.rows).toHaveLength(3);

    // วันถัดไปรวมรายการค้างจากวันก่อนด้วย
    expect(scene.staff('exportApproved', { processingDate: '2026-01-06' })).toMatchObject({
      data: { depositCount: 3, depositTotal: 2450.5 },
    });
  });

  it('export ไม่เปลี่ยนสถานะ และบันทึก audit log', () => {
    approveDeposit(deposit(1500));
    scene.staff('exportApproved', { processingDate: '2026-01-05' }, 'checker');
    expect(scene.world.requests[0].status).toBe('approved');
    expect(scene.world.auditLog).toContainEqual(
      expect.objectContaining({ actor: 'checker', action: 'exportApproved', target: '2026-01-05', detail: 'ฝาก 1 รายการ, ถอน 0 รายการ' }),
    );
  });

  it('ต้องระบุวันทำการ และต้องเข้าสู่ระบบ', () => {
    expect(scene.staff('exportApproved', {})).toMatchObject({ error: { code: 'VALIDATION' } });
    expect(scene.member('exportApproved', { processingDate: '2026-01-05' })).toMatchObject({
      error: { code: 'UNAUTHENTICATED' },
    });
  });
});

describe('completeRequests', () => {
  it('ปิดเป็นเสร็จสิ้นได้ทั้งชุด รายการที่สถานะไม่ใช่อนุมัติแจ้งแยกรายการ และแจ้งสมาชิก', () => {
    const a = deposit(1500);
    approveDeposit(a);
    const b = withdraw(5000);
    approveWithdrawal(b);
    const pending = deposit(200);
    scene.world.sentMessages.length = 0;

    const res = scene.staff('completeRequests', { ids: [a, b, pending, 'missing', a] }, 'checker');
    expect(res).toEqual({
      ok: true,
      data: [
        { id: a, requestNumber: 'DP-2026-000001', ok: true, message: 'เสร็จสิ้น' },
        { id: b, requestNumber: 'WD-2026-000001', ok: true, message: 'เสร็จสิ้น' },
        { id: pending, requestNumber: 'DP-2026-000002', ok: false, message: 'ปิดได้เฉพาะคำขอที่อนุมัติแล้ว' },
        { id: 'missing', requestNumber: '', ok: false, message: 'ไม่พบคำขอนี้' },
      ],
    });
    expect(scene.world.requests.find((r) => r.id === a)).toMatchObject({
      status: 'completed',
      completedBy: 'checker',
      completedAt: '2026-01-05T02:00:00.000Z',
    });
    expect(scene.world.sentMessages).toEqual([
      { to: 'U-somchai', text: 'คำขอฝากเงิน DP-2026-000001 ยอด 1,500.00 บาท\nบันทึกเข้าบัญชีเงินฝากเรียบร้อยแล้ว' },
      { to: 'U-somchai', text: 'คำขอถอนเงิน WD-2026-000001 ยอด 5,000.00 บาท\nโอนเงินเข้าบัญชีรับเงินเรียบร้อยแล้ว' },
    ]);
    expect(scene.world.auditLog.filter((e) => e.action === 'completeRequest')).toHaveLength(2);
  });

  it('ปิดแล้วไม่เป็นคำขอค้าง ยื่นคำขอถอนเงินใหม่ในบัญชีเดียวกันได้', () => {
    const id = withdraw(5000);
    approveWithdrawal(id);
    expect(scene.member('submitWithdrawalRequest', { accountNumber: '001-1', payoutAccountId: 'payout-somchai', amount: 2000, signature: PNG, pin: MEMBER_PIN, contactPhone: '0812345678' })).toMatchObject({
      error: { code: 'CONFLICT' },
    });
    scene.staff('completeRequests', { ids: [id] });
    expect(withdraw(2000)).toEqual(expect.any(String));
    expect(scene.world.requests.filter((r) => r.type === 'withdrawal').map((r) => r.status)).toEqual(['completed', 'pendingReview']);
  });

  it('ปิดซ้ำไม่ได้ และต้องเลือกอย่างน้อย 1 รายการ', () => {
    const id = deposit(1500);
    approveDeposit(id);
    scene.staff('completeRequests', { ids: [id] });
    expect(scene.staff('completeRequests', { ids: [id] })).toMatchObject({
      data: [{ ok: false, message: 'ปิดได้เฉพาะคำขอที่อนุมัติแล้ว' }],
    });
    expect(scene.staff('completeRequests', { ids: [] })).toMatchObject({ error: { code: 'VALIDATION' } });
    expect(scene.staff('completeRequests', {})).toMatchObject({ error: { code: 'VALIDATION' } });
  });
});

describe('listRequests ตามวันทำการไม่เกินวันที่เลือก', () => {
  it('ใช้ดูรายการที่ต้องทำวันนี้รวมรายการค้าง', () => {
    approveDeposit(deposit(100));
    scene.world.setNow(new Date('2026-01-05T16:00:00+07:00'));
    approveDeposit(deposit(200));
    expect(scene.staff('listRequests', { status: 'approved', processingDateTo: '2026-01-05' })).toMatchObject({
      data: [{ amount: 100 }],
    });
    expect((scene.staff('listRequests', { status: 'approved', processingDateTo: '2026-01-06' }) as { data: unknown[] }).data).toHaveLength(2);
  });
});
