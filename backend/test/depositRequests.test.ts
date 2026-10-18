import { beforeEach, describe, expect, it } from 'vitest';
import { JPEG, PDF, PNG, STAFF_GROUP, createScene, type Scene } from './helpers';

let scene: Scene;

function deposit(overrides: Record<string, unknown> = {}, token?: string) {
  return scene.member(
    'submitDepositRequest',
    {
      accountNumber: '001-1',
      amount: 1500,
      transferredAt: '2026-01-05T08:45:00+07:00',
      slip: JPEG,
      ...overrides,
    },
    token,
  );
}

function idOf(res: unknown): string {
  return (res as { data: { id: string } }).data.id;
}

beforeEach(() => {
  scene = createScene();
});

describe('submitDepositRequest', () => {
  it('สร้างคำขอรอตรวจ เลขที่เรียงตามปี บันทึกสลิป และแจ้งสมาชิกกับกลุ่มเจ้าหน้าที่', () => {
    const res = deposit();
    expect(res).toEqual({
      ok: true,
      data: {
        id: expect.any(String),
        requestNumber: 'DP-2026-000001',
        type: 'deposit',
        accountNumber: '001-1',
        accountName: 'นายสมชาย ใจดี',
        accountType: 'savings',
        amount: 1500,
        status: 'pendingReview',
        rejectReason: '',
        submittedAt: '2026-01-05T02:00:00.000Z',
        processingDate: '2026-01-05',
        transferredAt: '2026-01-05T01:45:00.000Z',
      },
    });
    expect([...scene.world.files.values()]).toEqual([
      { category: 'slips', fileName: 'DP-2026-000001.jpg', mimeType: 'image/jpeg', contentBase64: JPEG.contentBase64 },
    ]);
    expect(scene.world.requests[0]).toMatchObject({ slipCheck: 'notChecked', memberCode: '00123' });
    expect(scene.world.sentMessages).toEqual([
      { to: 'U-somchai', text: 'ได้รับคำขอฝากเงิน DP-2026-000001\nยอด 1,500.00 บาท\nจะดำเนินการในวันทำการ 5 ม.ค. 2569' },
      {
        to: STAFF_GROUP,
        text: 'คำขอฝากเงินใหม่ DP-2026-000001\nสมาชิก 00123 นายสมชาย ใจดี\nยอด 1,500.00 บาท\nดำเนินการวันที่ 5 ม.ค. 2569',
      },
    ]);
    expect(scene.world.auditLog).toMatchObject([{ actor: 'member:00123', action: 'submitDepositRequest', target: 'DP-2026-000001' }]);

    expect(deposit({ slip: PNG })).toMatchObject({ data: { requestNumber: 'DP-2026-000002' } });
  });

  it('เลขที่คำขอเริ่มใหม่เมื่อขึ้นปีใหม่ตามเวลาไทย', () => {
    deposit();
    scene.world.setNow(new Date('2026-12-31T17:30:00Z')); // 1 ม.ค. 2027 00:30 เวลาไทย
    expect(deposit({ transferredAt: '2026-12-31T17:00:00Z' })).toMatchObject({
      data: { requestNumber: 'DP-2027-000001' },
    });
  });

  it('ตรวจข้อมูล', () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ accountNumber: '001-9' }, 'บัญชีเงินฝากของท่าน'],
      [{ accountNumber: 'nope' }, 'บัญชีเงินฝากของท่าน'],
      [{ amount: 99.99 }, '100.00'],
      [{ amount: 100.005 }, 'ทศนิยม'],
      [{ amount: 'abc' }, 'จำนวนเงินไม่ถูกต้อง'],
      [{ transferredAt: 'yesterday-ish' }, 'วันเวลาที่โอนไม่ถูกต้อง'],
      [{ transferredAt: '2026-01-05T09:30:00+07:00' }, 'อนาคต'],
      [{ slip: undefined }, 'กรุณาแนบสลิป'],
      [{ slip: PDF }, 'JPG, PNG'],
      [{ slip: { ...JPEG, contentBase64: `/9j/${'A'.repeat(7_000_000)}` } }, 'ใหญ่เกิน'],
    ];
    for (const [overrides, message] of cases) {
      expect(deposit(overrides)).toMatchObject({ error: { code: 'VALIDATION', message: expect.stringContaining(message) } });
    }
    expect(scene.world.requests).toEqual([]);
  });

  it('รับยอดทศนิยม 2 ตำแหน่ง และบัญชีออมทรัพย์พิเศษ', () => {
    expect(deposit({ amount: 100.5, accountNumber: '002-1' })).toMatchObject({
      data: { amount: 100.5, accountType: 'specialSavings' },
    });
  });

  it('ยังไม่ผูกบัญชีได้ NOT_BOUND', () => {
    expect(deposit({}, 'token-stranger')).toMatchObject({ error: { code: 'NOT_BOUND' } });
  });
});

describe('วันทำการที่จะดำเนินการ', () => {
  function processingDateAt(bangkokTime: string): string {
    scene.world.setNow(new Date(`${bangkokTime}+07:00`));
    const res = deposit({ transferredAt: `${bangkokTime}+07:00` });
    return (res as { data: { processingDate: string } }).data.processingDate;
  }

  it('ก่อน 15:30 คือวันนั้น ตั้งแต่ 15:30 คือวันทำการถัดไป', () => {
    expect(processingDateAt('2026-01-05T15:29:59')).toBe('2026-01-05');
    expect(processingDateAt('2026-01-05T15:30:00')).toBe('2026-01-06');
  });

  it('วันศุกร์หลังตัดรอบ และวันเสาร์อาทิตย์ ไปวันจันทร์', () => {
    expect(processingDateAt('2026-01-09T16:00:00')).toBe('2026-01-12');
    expect(processingDateAt('2026-01-10T10:00:00')).toBe('2026-01-12');
    expect(processingDateAt('2026-01-11T10:00:00')).toBe('2026-01-12');
  });

  it('ข้ามวันหยุดติดกันหลายวัน', () => {
    scene.staff('addHoliday', { date: '2026-01-12', name: 'หยุด 1' });
    scene.staff('addHoliday', { date: '2026-01-13', name: 'หยุด 2' });
    expect(processingDateAt('2026-01-09T16:00:00')).toBe('2026-01-14');
    expect(processingDateAt('2026-01-12T09:00:00')).toBe('2026-01-14');
  });

  it('ปรับเวลาตัดรอบได้ในชีตตั้งค่า', () => {
    scene.world.settings.set('cutoffTime', '12:00');
    expect(processingDateAt('2026-01-05T12:00:00')).toBe('2026-01-06');
  });
});

describe('ประวัติและการยกเลิกของสมาชิก', () => {
  it('เห็นเฉพาะคำขอของตนเอง เรียงล่าสุดก่อน', () => {
    deposit();
    scene.world.advanceMinutes(1);
    deposit({ amount: 200 });
    scene.member('submitDepositRequest', { accountNumber: '001-9', amount: 300, transferredAt: '2026-01-05T08:00:00+07:00', slip: JPEG }, 'token-somying');

    const res = scene.member('listMyRequests');
    expect((res as { data: { amount: number }[] }).data.map((r) => r.amount)).toEqual([200, 1500]);
  });

  it('ยกเลิกได้เฉพาะคำขอของตนเองที่ยังรอตรวจ', () => {
    const id = idOf(deposit());
    expect(scene.member('cancelRequest', { id }, 'token-somying')).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(scene.member('cancelRequest', { id })).toMatchObject({ data: { status: 'cancelled' } });
    expect(scene.world.requests[0].cancelledAt).toBe('2026-01-05T02:00:00.000Z');
    expect(scene.member('cancelRequest', { id })).toMatchObject({ error: { code: 'CONFLICT' } });

    const reviewed = idOf(deposit());
    scene.staff('reviewRequest', { id: reviewed, decision: 'approve' });
    expect(scene.member('cancelRequest', { id: reviewed })).toMatchObject({ error: { code: 'CONFLICT' } });
  });
});

describe('การตรวจของเจ้าหน้าที่', () => {
  it('รายการกรองตามสถานะ ประเภท และวันทำการ', () => {
    deposit();
    scene.world.setNow(new Date('2026-01-05T16:00:00+07:00'));
    deposit({ amount: 200, transferredAt: '2026-01-05T15:50:00+07:00' });

    const all = scene.staff('listRequests');
    expect((all as { data: unknown[] }).data).toHaveLength(2);
    expect(scene.staff('listRequests', { processingDate: '2026-01-06' })).toMatchObject({ data: [{ amount: 200 }] });
    expect(scene.staff('listRequests', { type: 'withdrawal' })).toEqual({ ok: true, data: [] });
    expect(scene.staff('listRequests', { status: 'pendingReview' })).toMatchObject({
      data: [{ memberCode: '00123', slipFileId: 'file-1', slipCheck: 'notChecked' }, {}],
    });
  });

  it('ผู้ตรวจผ่านคำขอฝากเงิน → อนุมัติ และแจ้งสมาชิก', () => {
    const id = idOf(deposit());
    scene.world.sentMessages.length = 0;
    expect(scene.staff('reviewRequest', { id, decision: 'approve' })).toMatchObject({
      data: { status: 'approved', reviewedBy: 'admin', reviewedAt: '2026-01-05T02:00:00.000Z' },
    });
    expect(scene.world.sentMessages).toEqual([
      {
        to: 'U-somchai',
        text: 'คำขอฝากเงิน DP-2026-000001 ยอด 1,500.00 บาท\nผ่านการตรวจแล้ว เจ้าหน้าที่จะบันทึกเข้าบัญชีในวันทำการ 5 ม.ค. 2569',
      },
    ]);
    expect(scene.member('listMyRequests')).toMatchObject({ data: [{ status: 'approved' }] });
    expect(scene.staff('reviewRequest', { id, decision: 'approve' })).toMatchObject({ error: { code: 'CONFLICT' } });
  });

  it('ปฏิเสธต้องมีเหตุผล และแจ้งเหตุผลให้สมาชิก', () => {
    const id = idOf(deposit());
    scene.world.sentMessages.length = 0;
    expect(scene.staff('reviewRequest', { id, decision: 'reject' })).toMatchObject({ error: { code: 'VALIDATION' } });
    expect(scene.staff('reviewRequest', { id, decision: 'reject', reason: 'ยอดไม่ตรงกับสลิป' })).toMatchObject({
      data: { status: 'rejected', rejectReason: 'ยอดไม่ตรงกับสลิป', rejectedBy: 'admin' },
    });
    expect(scene.world.sentMessages[0].text).toContain('เหตุผล: ยอดไม่ตรงกับสลิป');
    expect(scene.world.auditLog).toContainEqual(expect.objectContaining({ action: 'rejectRequest', detail: 'ยอดไม่ตรงกับสลิป' }));
  });

  it('คำขอที่ยกเลิกแล้วตรวจไม่ได้', () => {
    const id = idOf(deposit());
    scene.member('cancelRequest', { id });
    expect(scene.staff('reviewRequest', { id, decision: 'approve' })).toMatchObject({ error: { code: 'CONFLICT' } });
  });

  it('ต้องมีบทบาทผู้ตรวจจึงตรวจได้ แต่เจ้าหน้าที่ทุกบทบาทดูรายการได้', () => {
    const id = idOf(deposit());
    scene.addStaff('approver1', ['approver']);
    expect(scene.staff('listRequests', undefined, 'approver1')).toMatchObject({ ok: true });
    expect(scene.staff('reviewRequest', { id, decision: 'approve' }, 'approver1')).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
  });

  it('เจ้าหน้าที่เปิดสลิปได้ผ่าน viewDocument', () => {
    deposit();
    expect(scene.staff('viewDocument', { fileId: 'file-1' })).toMatchObject({ data: { mimeType: 'image/jpeg' } });
    expect(scene.world.auditLog).toContainEqual(expect.objectContaining({ action: 'viewDocument', target: 'request:DP-2026-000001' }));
  });
});

describe('วันหยุด', () => {
  it('ผู้ดูแลระบบเพิ่มและลบได้ รายการเรียงตามวันที่', () => {
    scene.staff('addHoliday', { date: '2026-04-13', name: 'สงกรานต์' });
    expect(scene.staff('addHoliday', { date: '2026-01-01', name: 'ขึ้นปีใหม่' })).toEqual({
      ok: true,
      data: [
        { date: '2026-01-01', name: 'ขึ้นปีใหม่' },
        { date: '2026-04-13', name: 'สงกรานต์' },
      ],
    });
    expect(scene.staff('removeHoliday', { date: '2026-04-13' })).toEqual({
      ok: true,
      data: [{ date: '2026-01-01', name: 'ขึ้นปีใหม่' }],
    });
  });

  it('วันที่ผิดรูปแบบได้ VALIDATION และผู้ที่ไม่ใช่ผู้ดูแลระบบแก้ไม่ได้', () => {
    for (const date of ['2026-02-30', '13/04/2569', '']) {
      expect(scene.staff('addHoliday', { date, name: 'x' })).toMatchObject({ error: { code: 'VALIDATION' } });
    }
    scene.addStaff('reviewer1', ['reviewer']);
    expect(scene.staff('addHoliday', { date: '2026-04-13', name: 'x' }, 'reviewer1')).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(scene.staff('listHolidays', undefined, 'reviewer1')).toMatchObject({ ok: true });
  });
});
