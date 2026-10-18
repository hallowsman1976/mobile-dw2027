import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeWorld, type FakeWorld } from '../src/adapters/fake';
import { handleRequestBody } from '../src/app/handle';

let world: FakeWorld;

function call(request: unknown) {
  return handleRequestBody(JSON.stringify(request), world.deps);
}

beforeEach(() => {
  world = createFakeWorld();
  world.lineTokens.set('token-somchai', { userId: 'U-somchai', displayName: 'สมชาย' });
});

describe('me', () => {
  it('ผู้ที่ยังไม่ผูกบัญชี LINE ได้ bound: false พร้อมชื่อใน LINE', () => {
    expect(call({ action: 'me', auth: { idToken: 'token-somchai' } })).toEqual({
      ok: true,
      data: { bound: false, displayName: 'สมชาย' },
    });
  });

  it('ผู้ที่ผูกบัญชี LINE แล้วได้รหัสสมาชิก', () => {
    world.addBinding({ memberCode: '00123', lineUserId: 'U-somchai' });

    expect(call({ action: 'me', auth: { idToken: 'token-somchai' } })).toEqual({
      ok: true,
      data: {
        bound: true,
        displayName: 'สมชาย',
        memberCode: '00123',
        memberName: '',
        pinSet: false,
        pinLocked: false,
      },
    });
  });

  it('token ที่ LINE ยืนยันไม่ได้ ถูกปฏิเสธ', () => {
    const res = call({ action: 'me', auth: { idToken: 'token-forged' } });
    expect(res).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
  });

  it('ไม่ส่ง token มา ถูกปฏิเสธ', () => {
    const res = call({ action: 'me' });
    expect(res).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
  });

  it('ผูกบัญชีของคนอื่นไม่ทำให้ผู้ใช้นี้ถือว่าผูกแล้ว', () => {
    world.addBinding({ memberCode: '00999', lineUserId: 'U-someone-else' });

    expect(call({ action: 'me', auth: { idToken: 'token-somchai' } })).toMatchObject({
      ok: true,
      data: { bound: false },
    });
  });
});

describe('ตัวรับคำสั่ง', () => {
  it('ping ตอบเวลาของหลังบ้านโดยไม่ต้องยืนยันตัวตน', () => {
    world.setNow(new Date('2026-03-02T08:30:00Z'));
    expect(call({ action: 'ping' })).toEqual({
      ok: true,
      data: { serverTime: '2026-03-02T08:30:00.000Z' },
    });
  });

  it('action ที่ไม่รู้จัก ได้ UNKNOWN_ACTION', () => {
    expect(call({ action: 'deleteEverything' })).toMatchObject({
      ok: false,
      error: { code: 'UNKNOWN_ACTION' },
    });
  });

  it('ชื่อ action ที่เป็น property ของ Object ไม่ถูกเรียก', () => {
    expect(call({ action: 'toString' })).toMatchObject({
      ok: false,
      error: { code: 'UNKNOWN_ACTION' },
    });
  });

  it('body ที่ไม่ใช่ JSON ได้ BAD_REQUEST', () => {
    expect(handleRequestBody('not json', world.deps)).toMatchObject({
      ok: false,
      error: { code: 'BAD_REQUEST' },
    });
  });

  it('body ที่ไม่มี action ได้ BAD_REQUEST', () => {
    expect(call({ payload: {} })).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
  });

  it('error ที่ไม่ได้ตั้งใจ ได้ INTERNAL โดยไม่เปิดเผยรายละเอียด', () => {
    world.deps.lineIdentity.verifyIdToken = () => {
      throw new Error('LINE verify failed: HTTP 500');
    };
    const res = call({ action: 'me', auth: { idToken: 'token-somchai' } });
    expect(res).toEqual({
      ok: false,
      error: { code: 'INTERNAL', message: 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง' },
    });
  });
});
