import { beforeEach, describe, expect, it } from 'vitest';
import { PRIVACY_POLICY_VERSION } from '../../shared/api';
import { createFakeWorld, type FakeWorld } from '../src/adapters/fake';
import type { DepositAccount } from '../src/adapters/ports';
import { handleRequestBody } from '../src/app/handle';

let world: FakeWorld;

function call(action: string, payload?: unknown, idToken = 'token-somchai') {
  return handleRequestBody(JSON.stringify({ action, auth: { idToken }, payload }), world.deps);
}

/** เลขบัตรประชาชนที่ checksum ถูกต้อง สร้างจาก 12 หลักแรก */
function nationalId(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (13 - i);
  return first12 + ((11 - (sum % 11)) % 10);
}

const SOMCHAI_ID = nationalId('110170023070');
const SOMYING_ID = nationalId('349010012345');

function account(partial: Partial<DepositAccount>): DepositAccount {
  return {
    seq: '1',
    accountNumber: '001-1',
    memberCode: '00123',
    nationalId: SOMCHAI_ID,
    accountName: 'นายสมชาย ใจดี',
    accountType: 'savings',
    lastContactDate: '',
    importedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function bind(memberCode = '123', id = SOMCHAI_ID, token = 'token-somchai') {
  return call(
    'bindLineAccount',
    { memberCode, nationalId: id, acceptedPolicyVersion: PRIVACY_POLICY_VERSION },
    token,
  );
}

beforeEach(() => {
  world = createFakeWorld();
  world.lineTokens.set('token-somchai', { userId: 'U-somchai', displayName: 'Somchai' });
  world.lineTokens.set('token-other', { userId: 'U-other', displayName: 'Other' });
  world.depositAccounts.push(
    account({}),
    account({ seq: '2', accountNumber: '002-1', accountType: 'specialSavings' }),
    account({
      seq: '3',
      accountNumber: '001-9',
      memberCode: '04567',
      nationalId: SOMYING_ID,
      accountName: 'นางสาวสมหญิง รักออม',
    }),
  );
});

describe('bindLineAccount', () => {
  it('ผูกสำเร็จเมื่อรหัสสมาชิก (เติม 0 ให้) และเลขบัตรตรงกัน และบันทึกการยินยอม', () => {
    expect(bind(' 123 ', `${SOMCHAI_ID.slice(0, 1)}-${SOMCHAI_ID.slice(1, 5)}-${SOMCHAI_ID.slice(5)}`)).toEqual({
      ok: true,
      data: { memberCode: '00123', memberName: 'นายสมชาย ใจดี' },
    });
    expect(world.bindings).toEqual([
      expect.objectContaining({
        memberCode: '00123',
        lineUserId: 'U-somchai',
        pinHash: '',
        consentVersion: PRIVACY_POLICY_VERSION,
        consentAt: '2026-01-05T02:00:00.000Z',
        unboundAt: '',
      }),
    ]);
    expect(world.auditLog).toMatchObject([{ actor: 'member:00123', action: 'bindLineAccount' }]);

    expect(call('me')).toEqual({
      ok: true,
      data: {
        bound: true,
        displayName: 'Somchai',
        memberCode: '00123',
        memberName: 'นายสมชาย ใจดี',
        pinSet: false,
        pinLocked: false,
      },
    });
  });

  it('ต้องยอมรับนโยบายฉบับปัจจุบัน', () => {
    const res = call('bindLineAccount', {
      memberCode: '123',
      nationalId: SOMCHAI_ID,
      acceptedPolicyVersion: 'old',
    });
    expect(res).toMatchObject({ error: { code: 'VALIDATION' } });
    expect(world.bindings).toEqual([]);
  });

  it('รหัสสมาชิกหรือเลขบัตรผิดรูปแบบได้ VALIDATION และไม่นับเป็นการผูกผิด', () => {
    expect(bind('123456')).toMatchObject({ error: { code: 'VALIDATION' } });
    expect(bind('12a')).toMatchObject({ error: { code: 'VALIDATION' } });
    expect(bind('123', '1234567890123')).toMatchObject({ error: { code: 'VALIDATION' } });
    expect(world.bindingThrottles.size).toBe(0);
  });

  it('เลขบัตรไม่ตรงกับรหัสสมาชิกได้ INVALID_CREDENTIALS', () => {
    expect(bind('123', SOMYING_ID)).toMatchObject({
      error: { code: 'INVALID_CREDENTIALS', message: expect.stringContaining('ไม่ตรงกับข้อมูลของสหกรณ์') },
    });
    expect(bind('999', SOMCHAI_ID)).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } });
    expect(world.bindings).toEqual([]);
  });

  it('ผูกผิด 5 ครั้งภายใน 1 ชั่วโมงล็อก 1 ชั่วโมง แม้ข้อมูลถูกก็ผูกไม่ได้', () => {
    for (let i = 0; i < 4; i++) {
      expect(bind('123', SOMYING_ID)).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } });
    }
    expect(bind('123', SOMYING_ID)).toMatchObject({
      error: { code: 'ACCOUNT_LOCKED', message: expect.stringContaining('10:00') },
    });
    expect(bind()).toMatchObject({ error: { code: 'ACCOUNT_LOCKED' } });

    world.advanceMinutes(60);
    expect(bind()).toMatchObject({ ok: true });
  });

  it('ผิดห่างกันเกิน 1 ชั่วโมงเริ่มนับใหม่', () => {
    for (let i = 0; i < 4; i++) bind('123', SOMYING_ID);
    world.advanceMinutes(61);
    for (let i = 0; i < 4; i++) {
      expect(bind('123', SOMYING_ID)).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } });
    }
  });

  it('การล็อกเป็นของ LINE userId นั้นเท่านั้น', () => {
    for (let i = 0; i < 5; i++) bind('123', SOMYING_ID);
    expect(bind('4567', SOMYING_ID, 'token-other')).toMatchObject({ ok: true });
  });

  it('รหัสสมาชิกที่ผูกกับ LINE อื่นแล้วผูกซ้ำไม่ได้', () => {
    world.addBinding({ memberCode: '00123', lineUserId: 'U-other' });
    expect(bind()).toMatchObject({
      error: { code: 'CONFLICT', message: expect.stringContaining('ติดต่อสหกรณ์') },
    });
  });

  it('LINE ที่ผูกแล้วผูกกับสมาชิกคนอื่นอีกไม่ได้', () => {
    bind();
    expect(bind('4567', SOMYING_ID)).toMatchObject({
      error: { code: 'CONFLICT', message: expect.stringContaining('00123') },
    });
  });

  it('การผูกที่ถูกยกเลิกแล้วไม่ขวางการผูกใหม่', () => {
    world.addBinding({ memberCode: '00123', lineUserId: 'U-old', unboundAt: '2026-01-01T00:00:00Z' });
    expect(bind()).toMatchObject({ ok: true });
  });

  it('token LINE ไม่ถูกต้องได้ UNAUTHENTICATED', () => {
    expect(bind('123', SOMCHAI_ID, 'forged')).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });
});

describe('setPin', () => {
  it('ตั้ง PIN ได้ครั้งเดียวหลังผูกบัญชี และไม่เก็บ PIN จริง', () => {
    bind();
    expect(call('setPin', { pin: '482915' })).toEqual({ ok: true, data: { pinSet: true } });
    expect(world.bindings[0].pinHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(world.bindings)).not.toContain('482915');
    expect(call('me')).toMatchObject({ data: { pinSet: true } });

    expect(call('setPin', { pin: '730264' })).toMatchObject({ error: { code: 'CONFLICT' } });
  });

  it('ยังไม่ผูกบัญชีได้ NOT_BOUND', () => {
    expect(call('setPin', { pin: '482915' })).toMatchObject({ error: { code: 'NOT_BOUND' } });
  });

  it('PIN ต้องเป็นตัวเลข 6 หลักที่เดายาก', () => {
    bind();
    for (const pin of ['12345', '1234567', '12345a', '111111', '123456', '890123', '654321', '210987']) {
      expect(call('setPin', { pin })).toMatchObject({ error: { code: 'VALIDATION' } });
    }
    expect(world.bindings[0].pinHash).toBe('');
  });
});

describe('listMyAccounts', () => {
  it('เห็นเฉพาะบัญชีเงินฝากของตนเอง โดยไม่มีเลขบัตรประชาชน', () => {
    bind();
    const res = call('listMyAccounts');
    expect(res).toEqual({
      ok: true,
      data: [
        { accountNumber: '001-1', accountName: 'นายสมชาย ใจดี', accountType: 'savings' },
        { accountNumber: '002-1', accountName: 'นายสมชาย ใจดี', accountType: 'specialSavings' },
      ],
    });
    expect(JSON.stringify(res)).not.toContain(SOMCHAI_ID);
  });

  it('บัญชีที่ไม่อยู่ในข้อมูลนำเข้าล่าสุดไม่แสดง', () => {
    bind();
    world.depositAccounts.splice(1, 1);
    expect(call('listMyAccounts')).toMatchObject({ data: [{ accountNumber: '001-1' }] });
  });

  it('ยังไม่ผูกบัญชีได้ NOT_BOUND', () => {
    expect(call('listMyAccounts')).toMatchObject({ error: { code: 'NOT_BOUND' } });
  });
});
