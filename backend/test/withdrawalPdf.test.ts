import { beforeEach, describe, expect, it } from 'vitest';
import { bahtText } from '../../shared/format';
import { JPEG, MEMBER_PIN, PNG, createScene, type Scene } from './helpers';

let scene: Scene;

function idOf(res: unknown): string {
  return (res as { data: { id: string } }).data.id;
}

function approvedWithdrawal(amount = 5000): string {
  const id = idOf(
    scene.member('submitWithdrawalRequest', {
      accountNumber: '001-1',
      payoutAccountId: 'payout-somchai',
      amount,
      signature: PNG,
      pin: MEMBER_PIN,
    }),
  );
  scene.staff('reviewRequest', { id, decision: 'approve' }, 'checker');
  scene.staff('approveRequest', { id, decision: 'approve' }, 'boss');
  return id;
}

function pdfContent(fileId: string): { texts: Record<string, string>; images: Record<string, string> } {
  const file = scene.world.files.get(fileId)!;
  return JSON.parse(Buffer.from(file.contentBase64, 'base64').toString('utf8'));
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
  });
  scene.addStaff('checker', ['reviewer']);
  scene.addStaff('boss', ['approver']);
});

describe('PDF ใบถอนเงิน', () => {
  it('สร้างเมื่ออนุมัติ ใส่ข้อมูลคำขอ บัญชีรับเงิน ยอดเป็นตัวอักษร และลายมือชื่อทั้งสองช่อง', () => {
    const id = approvedWithdrawal(1500.5);
    const request = scene.world.requests.find((r) => r.id === id)!;
    expect(request.pdfFileId).toBe('file-2');
    expect(scene.world.files.get('file-2')).toMatchObject({ category: 'pdfs', fileName: 'WD-2026-000001.pdf', mimeType: 'application/pdf' });

    const { texts, images } = pdfContent('file-2');
    expect(texts).toEqual({
      requestNumber: 'WD-2026-000001',
      submittedDate: '5 ม.ค. 2569 09:00',
      memberCode: '00123',
      accountNumber: '001-1',
      accountName: 'นายสมชาย ใจดี',
      accountType: 'ออมทรัพย์',
      amount: '1,500.50',
      amountText: 'หนึ่งพันห้าร้อยบาทห้าสิบสตางค์',
      payoutBank: 'ธนาคารกรุงไทย',
      payoutAccountNumber: '1234567890',
      payoutAccountName: 'นายสมชาย ใจดี',
      processingDate: '5 ม.ค. 2569',
      reviewedBy: 'checker',
      approvedBy: 'boss',
      approvedDate: '5 ม.ค. 2569',
    });
    expect(images).toEqual({ ownerSignature: PNG.contentBase64, recipientSignature: PNG.contentBase64 });

    expect(scene.staff('getRequest', { id }, 'checker')).toMatchObject({ data: { pdfFileId: 'file-2' } });
    expect(scene.staff('viewDocument', { fileId: 'file-2' }, 'checker')).toMatchObject({ data: { mimeType: 'application/pdf' } });
    expect(scene.world.auditLog).toContainEqual(expect.objectContaining({ action: 'generatePdf', target: 'WD-2026-000001' }));
  });

  it('สร้าง PDF ไม่สำเร็จ การอนุมัติยังสำเร็จ บันทึก audit log และกดสร้างใหม่ได้', () => {
    scene.world.pdfDown = true;
    const id = approvedWithdrawal();
    const request = scene.world.requests.find((r) => r.id === id)!;
    expect(request).toMatchObject({ status: 'approved', pdfFileId: '' });
    expect(scene.world.auditLog).toContainEqual(expect.objectContaining({ action: 'pdfFailed', detail: 'Docs export failed' }));
    expect(scene.world.sentMessages.at(-1)?.text).toContain('อนุมัติแล้ว');

    expect(scene.staff('regenerateWithdrawalPdf', { id }, 'checker')).toMatchObject({ error: { code: 'CONFLICT' } });
    scene.world.pdfDown = false;
    expect(scene.staff('regenerateWithdrawalPdf', { id }, 'checker')).toMatchObject({ data: { pdfFileId: 'file-2' } });
  });

  it('สร้างใหม่ได้หลังเสร็จสิ้น แต่ไม่ได้สำหรับคำขอฝากหรือคำขอที่ยังไม่อนุมัติ', () => {
    const id = approvedWithdrawal();
    scene.staff('completeRequests', { ids: [id] });
    expect(scene.staff('regenerateWithdrawalPdf', { id })).toMatchObject({ ok: true });

    const deposit = idOf(
      scene.member('submitDepositRequest', { accountNumber: '001-1', amount: 500, transferredAt: '2026-01-05T08:00:00+07:00', slip: JPEG }),
    );
    expect(scene.staff('regenerateWithdrawalPdf', { id: deposit })).toMatchObject({ error: { code: 'CONFLICT' } });

    const pending = idOf(
      scene.member('submitWithdrawalRequest', { accountNumber: '002-1', payoutAccountId: 'payout-somchai', amount: 2000, signature: PNG, pin: MEMBER_PIN }),
    );
    expect(scene.staff('regenerateWithdrawalPdf', { id: pending })).toMatchObject({ error: { code: 'CONFLICT' } });
  });

  it('ปฏิเสธไม่สร้าง PDF', () => {
    const id = idOf(
      scene.member('submitWithdrawalRequest', { accountNumber: '001-1', payoutAccountId: 'payout-somchai', amount: 2000, signature: PNG, pin: MEMBER_PIN }),
    );
    scene.staff('reviewRequest', { id, decision: 'approve' }, 'checker');
    scene.staff('approveRequest', { id, decision: 'reject', reason: 'ยอดไม่พอ' }, 'boss');
    expect([...scene.world.files.values()].some((f) => f.category === 'pdfs')).toBe(false);
  });

  it('ลิงก์ต้นแบบสำหรับผู้ดูแลระบบเท่านั้น', () => {
    expect(scene.staff('withdrawalTemplate')).toEqual({
      ok: true,
      data: { url: 'https://docs.google.com/document/d/fake-template/edit' },
    });
    expect(scene.staff('withdrawalTemplate', undefined, 'checker')).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });
});

describe('bahtText', () => {
  it.each([
    [0, 'ศูนย์บาทถ้วน'],
    [1, 'หนึ่งบาทถ้วน'],
    [11, 'สิบเอ็ดบาทถ้วน'],
    [21, 'ยี่สิบเอ็ดบาทถ้วน'],
    [101, 'หนึ่งร้อยเอ็ดบาทถ้วน'],
    [1000, 'หนึ่งพันบาทถ้วน'],
    [1500.5, 'หนึ่งพันห้าร้อยบาทห้าสิบสตางค์'],
    [100000, 'หนึ่งแสนบาทถ้วน'],
    [1000000, 'หนึ่งล้านบาทถ้วน'],
    [2500000.25, 'สองล้านห้าแสนบาทยี่สิบห้าสตางค์'],
    [11000000, 'สิบเอ็ดล้านบาทถ้วน'],
    [0.75, 'เจ็ดสิบห้าสตางค์'],
  ])('%d → %s', (amount, text) => {
    expect(bahtText(amount)).toBe(text);
  });
});
