import { beforeEach, describe, expect, it } from 'vitest';
import type { MemberRequest, PayoutAccount } from '../src/adapters/ports';
import { purgeExpiredDocuments } from '../src/app/retention';
import { createScene, type Scene } from './helpers';

let scene: Scene;

// นาฬิกาปลอมของฉากเริ่มที่ 5 ม.ค. 2026 ระยะเวลาเก็บ 10 ปีจึงตัดที่ 5 ม.ค. 2016 09:00 เวลาไทย
const EXPIRED = '2016-01-05T01:59:00.000Z';
const NOT_YET = '2016-01-05T02:01:00.000Z';

function file(id: string): string {
  scene.world.files.set(id, { category: 'slips', fileName: `${id}.jpg`, mimeType: 'image/jpeg', contentBase64: '' });
  return id;
}

function request(partial: Partial<MemberRequest> & Pick<MemberRequest, 'id' | 'status'>): void {
  scene.world.requests.push({
    requestNumber: `WD-2015-${partial.id}`,
    type: 'withdrawal',
    memberCode: '00123',
    accountNumber: '001-1',
    accountName: 'นายสมชาย ใจดี',
    accountType: 'savings',
    amount: 1000,
    payoutAccountId: '',
    signatureFileId: file(`${partial.id}-sig`),
    slipFileId: '',
    transferredAt: '',
    slipCheck: 'notChecked',
    slipRef: '',
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
    pdfFileId: file(`${partial.id}-pdf`),
    submittedAt: '2015-12-01T00:00:00.000Z',
    processingDate: '2015-12-01',
    filesPurgedAt: '',
    ...partial,
  });
}

function payout(partial: Partial<PayoutAccount> & Pick<PayoutAccount, 'id' | 'status'>): void {
  scene.world.payoutAccounts.push({
    memberCode: '00123',
    bankCode: 'KTB',
    accountNumber: '1234567890',
    accountName: 'นายสมชาย ใจดี',
    idCardFileId: file(`${partial.id}-id`),
    depositBookFileId: file(`${partial.id}-book`),
    payoutBookFileId: file(`${partial.id}-payout`),
    createdAt: '2015-01-01T00:00:00.000Z',
    reviewedBy: 'admin',
    reviewedAt: '2015-01-02T00:00:00.000Z',
    rejectReason: '',
    retiredAt: '',
    filesPurgedAt: '',
    ...partial,
  });
}

beforeEach(() => {
  scene = createScene();
});

describe('ลบเอกสารที่ครบระยะเวลาเก็บ', () => {
  it('ลบไฟล์ของคำขอที่ปิดเกิน 10 ปี เก็บแถวไว้และบันทึกว่าลบแล้ว พร้อม audit log', () => {
    request({ id: 'r1', status: 'completed', completedAt: EXPIRED });
    request({ id: 'r2', status: 'rejected', rejectedAt: EXPIRED });
    request({ id: 'r3', status: 'cancelled', cancelledAt: EXPIRED, pdfFileId: '' });

    expect(purgeExpiredDocuments(scene.world.deps)).toEqual({ purged: 3, failed: 0, remaining: 0 });

    for (const id of ['r1-sig', 'r1-pdf', 'r2-sig', 'r2-pdf', 'r3-sig']) {
      expect(scene.world.files.has(id)).toBe(false);
    }
    expect(scene.world.requests.map((r) => r.filesPurgedAt)).toEqual([
      '2026-01-05T02:00:00.000Z',
      '2026-01-05T02:00:00.000Z',
      '2026-01-05T02:00:00.000Z',
    ]);
    expect(scene.world.requests[0].signatureFileId).toBe('r1-sig');
    expect(scene.world.auditLog[0]).toEqual({
      at: '2026-01-05T02:00:00.000Z',
      actor: 'system',
      action: 'purgeDocuments',
      target: 'request:WD-2015-r1',
      detail: '2 ไฟล์: r1-sig, r1-pdf',
    });
  });

  it('ไม่ลบคำขอที่ยังไม่ครบกำหนด หรือยังไม่ปิด', () => {
    request({ id: 'young', status: 'completed', completedAt: NOT_YET });
    request({ id: 'open', status: 'approved', approvedAt: EXPIRED });
    request({ id: 'waiting', status: 'pendingReview' });

    expect(purgeExpiredDocuments(scene.world.deps)).toEqual({ purged: 0, failed: 0, remaining: 0 });
    expect(scene.world.files.size).toBe(6);
    expect(scene.world.auditLog).toEqual([]);
  });

  it('ลบเอกสารบัญชีรับเงินที่ปฏิเสธหรือเลิกใช้เกินกำหนด แต่ไม่ลบบัญชีที่ยังอนุมัติหรือรอตรวจ', () => {
    payout({ id: 'rejected', status: 'rejected', reviewedAt: EXPIRED });
    payout({ id: 'retired', status: 'retired', retiredAt: EXPIRED });
    payout({ id: 'retiredRecently', status: 'retired', retiredAt: NOT_YET });
    payout({ id: 'active', status: 'approved', reviewedAt: EXPIRED });
    payout({ id: 'pending', status: 'pendingReview', reviewedAt: '' });

    expect(purgeExpiredDocuments(scene.world.deps)).toMatchObject({ purged: 2 });
    const purged = scene.world.payoutAccounts.filter((a) => a.filesPurgedAt).map((a) => a.id);
    expect(purged).toEqual(['rejected', 'retired']);
    for (const id of ['active', 'pending', 'retiredRecently']) {
      expect(scene.world.files.has(`${id}-id`)).toBe(true);
    }
  });

  it('ไม่ลบซ้ำในรอบถัดไป', () => {
    request({ id: 'r1', status: 'completed', completedAt: EXPIRED });
    purgeExpiredDocuments(scene.world.deps);
    expect(purgeExpiredDocuments(scene.world.deps)).toEqual({ purged: 0, failed: 0, remaining: 0 });
  });

  it('ระยะเวลาเก็บอ่านจากชีตตั้งค่า และหยุดเมื่อค่าตั้งผิด', () => {
    request({ id: 'r1', status: 'completed', completedAt: '2020-01-01T00:00:00.000Z' });
    scene.world.settings.set('documentRetentionYears', '5');
    expect(purgeExpiredDocuments(scene.world.deps)).toMatchObject({ purged: 1 });

    request({ id: 'r2', status: 'completed', completedAt: '2020-01-01T00:00:00.000Z' });
    scene.world.settings.set('documentRetentionYears', '0');
    expect(() => purgeExpiredDocuments(scene.world.deps)).toThrow(/documentRetentionYears/);
    expect(scene.world.files.has('r2-sig')).toBe(true);
  });

  it('ทำเป็นชุด: หยุดเมื่อถูกสั่งหยุด แล้วรอบถัดไปทำต่อจากที่เหลือ', () => {
    for (const id of ['a', 'b', 'c']) request({ id, status: 'completed', completedAt: EXPIRED });
    let calls = 0;
    expect(purgeExpiredDocuments(scene.world.deps, () => ++calls > 2)).toEqual({ purged: 2, failed: 0, remaining: 1 });
    expect(purgeExpiredDocuments(scene.world.deps)).toEqual({ purged: 1, failed: 0, remaining: 0 });
  });

  it('ลบไฟล์ไม่สำเร็จ: บันทึก audit log ข้ามไปทำรายการอื่น และยังไม่ทำเครื่องหมายว่าลบแล้ว', () => {
    request({ id: 'bad', status: 'completed', completedAt: EXPIRED });
    request({ id: 'good', status: 'completed', completedAt: EXPIRED });
    scene.world.failingDeletes.add('bad-pdf');

    expect(purgeExpiredDocuments(scene.world.deps)).toEqual({ purged: 1, failed: 1, remaining: 0 });
    expect(scene.world.requests.find((r) => r.id === 'bad')!.filesPurgedAt).toBe('');
    expect(scene.world.auditLog[0]).toMatchObject({ action: 'purgeDocumentsFailed', target: 'request:WD-2015-bad' });
  });

  it('เจ้าหน้าที่เปิดเอกสารที่ลบแล้วได้ข้อความว่าครบระยะเวลาเก็บ', () => {
    request({ id: 'r1', status: 'completed', completedAt: EXPIRED });
    purgeExpiredDocuments(scene.world.deps);
    expect(scene.staff('viewDocument', { fileId: 'r1-pdf' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'เอกสารนี้ถูกลบแล้วเพราะครบระยะเวลาเก็บรักษา' },
    });
  });

  it('ผู้ดูแลระบบค้น audit log การลบด้วยเลขที่คำขอได้', () => {
    request({ id: 'r1', status: 'completed', completedAt: EXPIRED });
    purgeExpiredDocuments(scene.world.deps);
    expect(scene.staff('listAuditLog', { target: 'WD-2015-r1' })).toMatchObject({
      ok: true,
      data: { entries: [{ actor: 'system', action: 'purgeDocuments' }] },
    });
  });
});
