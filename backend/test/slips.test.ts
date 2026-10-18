import { beforeEach, describe, expect, it } from 'vitest';
import type { SlipReading } from '../src/adapters/ports';
import { maskedAccountMatches } from '../src/app/slips';
import { createScene, type Scene } from './helpers';

let scene: Scene;

const COOP_ACCOUNT = '9876543210';

/** สลิป JPEG ที่ต่างกันตามเลข n */
function slip(n: number) {
  return { fileName: `slip-${n}.jpg`, mimeType: 'image/jpeg', contentBase64: `/9j/4AAQ${'A'.repeat(n)}` };
}

function reading(partial: Partial<SlipReading> = {}): SlipReading {
  return {
    transRef: 'REF-001',
    transferredAt: '2026-01-05T01:45:00.000Z', // 08:45 เวลาไทย
    amount: 1500,
    receiverBankCode: '006',
    receiverAccount: 'xxx-x-x4321-x',
    receiverName: 'สหกรณ์ออมทรัพย์สาธารณสุขจังหวัดมุกดาหาร จำกัด',
    ...partial,
  };
}

function check(n: number, overrides: Record<string, unknown> = {}) {
  return scene.member('checkSlip', {
    slip: slip(n),
    amount: 1500,
    transferredAt: '2026-01-05T08:45:00+07:00',
    ...overrides,
  });
}

function deposit(n: number, overrides: Record<string, unknown> = {}) {
  return scene.member('submitDepositRequest', {
    accountNumber: '001-1',
    amount: 1500,
    transferredAt: '2026-01-05T08:45:00+07:00',
    slip: slip(n),
    ...overrides,
  });
}

beforeEach(() => {
  scene = createScene();
  scene.world.settings.set('coopReceivingAccount', COOP_ACCOUNT);
  scene.world.slipReadings.set(slip(1).contentBase64, reading());
});

describe('checkSlip', () => {
  it('สลิปตรงทุกอย่างได้ valid และไม่สร้างคำขอ', () => {
    expect(check(1)).toEqual({ ok: true, data: { status: 'valid' } });
    expect(scene.world.requests).toEqual([]);
  });

  it('ยอดไม่ตรง หรือเวลาคลาดเกิน 10 นาที ได้ค่าจากสลิปให้ยืนยัน', () => {
    expect(check(1, { amount: 1000 })).toEqual({
      ok: true,
      data: { status: 'mismatch', slipAmount: 1500, slipTransferredAt: '2026-01-05T01:45:00.000Z' },
    });
    expect(check(1, { transferredAt: '2026-01-05T08:56:00+07:00' })).toMatchObject({ data: { status: 'mismatch' } });
    expect(check(1, { transferredAt: '2026-01-05T08:55:00+07:00' })).toMatchObject({ data: { status: 'valid' } });
  });

  it('ผู้รับไม่ใช่บัญชีสหกรณ์ ไม่รับ', () => {
    scene.world.slipReadings.set(slip(2).contentBase64, reading({ receiverAccount: 'xxx-x-x9999-x', receiverName: 'นายอื่น' }));
    scene.world.slipReadings.set(slip(3).contentBase64, reading({ receiverBankCode: '014' }));
    expect(check(2)).toMatchObject({
      error: { code: 'VALIDATION', message: expect.stringContaining('ไม่ได้โอนเข้าบัญชีของสหกรณ์') },
    });
    expect(check(3)).toMatchObject({ error: { code: 'VALIDATION' } });
  });

  it('SlipOK อ่านไม่ได้ หรือยังไม่ได้ตั้งเลขบัญชีสหกรณ์ ได้ unverified', () => {
    expect(check(9)).toEqual({ ok: true, data: { status: 'unverified' } });
    scene.world.settings.delete('coopReceivingAccount');
    expect(check(1)).toEqual({ ok: true, data: { status: 'unverified' } });
  });

  it('เก็บผลไว้ใน cache: ตรวจแล้วยื่นด้วยสลิปเดิมเรียก SlipOK ครั้งเดียว', () => {
    check(1);
    check(1, { amount: 1000 });
    deposit(1);
    expect(scene.world.slipCalls).toBe(1);
  });

  it('SlipOK ที่อ่านไม่ได้ไม่ถูก cache จึงลองใหม่ได้', () => {
    check(9);
    check(9);
    expect(scene.world.slipCalls).toBe(2);
  });

  it('ยังไม่ผูกบัญชีได้ NOT_BOUND', () => {
    expect(scene.member('checkSlip', { slip: slip(1), amount: 1500, transferredAt: '2026-01-05T08:45:00+07:00' }, 'token-stranger')).toMatchObject({
      error: { code: 'NOT_BOUND' },
    });
  });
});

describe('submitDepositRequest กับการตรวจสลิป', () => {
  it('สลิปถูกต้อง: บันทึกผลตรวจและเลขอ้างอิง ให้เจ้าหน้าที่เห็น', () => {
    const res = deposit(1);
    expect(res).toMatchObject({ ok: true });
    expect(scene.world.requests[0]).toMatchObject({ slipCheck: 'valid', slipRef: 'REF-001' });
    expect(scene.staff('listRequests')).toMatchObject({ data: [{ slipCheck: 'valid', slipRef: 'REF-001' }] });
  });

  it('ยอดหรือเวลาไม่ตรงไม่รับ จนกว่าจะยื่นด้วยค่าจากสลิป', () => {
    expect(deposit(1, { amount: 1000 })).toMatchObject({
      error: { code: 'VALIDATION', message: expect.stringContaining('สลิป: 1,500.00 บาท เวลา 5 ม.ค. 2569 08:45') },
    });
    expect(deposit(1, { transferredAt: '2026-01-05T01:45:00.000Z' })).toMatchObject({
      ok: true,
      data: { amount: 1500 },
    });
  });

  it('สลิปเดิมใช้ซ้ำไม่ได้ เว้นแต่คำขอเดิมถูกยกเลิกหรือปฏิเสธ', () => {
    const first = (deposit(1) as { data: { id: string } }).data.id;
    expect(deposit(1)).toMatchObject({
      error: { code: 'CONFLICT', message: expect.stringContaining('DP-2026-000001') },
    });
    // สลิปไฟล์อื่นแต่เป็นธุรกรรมเดียวกัน (เช่นแคปหน้าจอใหม่) ก็ใช้ซ้ำไม่ได้
    scene.world.slipReadings.set(slip(4).contentBase64, reading());
    expect(deposit(4)).toMatchObject({ error: { code: 'CONFLICT' } });

    scene.staff('reviewRequest', { id: first, decision: 'reject', reason: 'โอนผิดบัญชีเงินฝาก' });
    expect(deposit(1)).toMatchObject({ ok: true, data: { requestNumber: 'DP-2026-000002' } });
  });

  it('ผู้รับผิดไม่รับ และไม่บันทึกไฟล์', () => {
    scene.world.slipReadings.set(slip(2).contentBase64, reading({ receiverAccount: 'xxx-x-x9999-x' }));
    expect(deposit(2)).toMatchObject({ error: { code: 'VALIDATION' } });
    expect(scene.world.files.size).toBe(0);
  });

  it('SlipOK ล่ม: รับคำขอไว้ ผลตรวจเป็น ยังไม่ตรวจสลิป', () => {
    scene.world.deps.slips.read = () => {
      throw new Error('SlipOK HTTP 503');
    };
    expect(deposit(1)).toMatchObject({ ok: true });
    expect(scene.world.requests[0]).toMatchObject({ slipCheck: 'notChecked', slipRef: '' });
  });
});

describe('maskedAccountMatches', () => {
  it('เทียบเฉพาะหลักที่ธนาคารแสดง ไม่สนขีด', () => {
    expect(maskedAccountMatches('xxx-x-x4321-x', '987-6-54321-0')).toBe(true);
    expect(maskedAccountMatches('XXX-X-X4321-X', '9876543210')).toBe(true);
    expect(maskedAccountMatches('987-6-54321-0', '9876543210')).toBe(true);
    expect(maskedAccountMatches('xxx-x-x4320-x', '9876543210')).toBe(false);
    expect(maskedAccountMatches('xxx-x-x4321', '9876543210')).toBe(false);
    expect(maskedAccountMatches('xxxxxxxxxx', '9876543210')).toBe(false);
  });
});
