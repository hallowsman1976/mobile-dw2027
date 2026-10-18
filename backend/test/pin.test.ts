import { beforeEach, describe, expect, it } from 'vitest';
import { PRIVACY_POLICY_VERSION } from '../../shared/api';
import { createFakeWorld, type FakeWorld } from '../src/adapters/fake';
import { handleRequestBody } from '../src/app/handle';
import { bootstrapFirstAdministrator } from '../src/app/staff';

let world: FakeWorld;
let adminToken: string;

const SOMCHAI_ID = '1101700230708';

function memberCall(action: string, payload?: unknown, idToken = 'token-somchai') {
  return handleRequestBody(JSON.stringify({ action, auth: { idToken }, payload }), world.deps);
}

function staffCall(action: string, payload?: unknown, sessionToken = adminToken) {
  return handleRequestBody(JSON.stringify({ action, auth: { sessionToken }, payload }), world.deps);
}

function wrongPin(times: number) {
  let res;
  for (let i = 0; i < times; i++) res = memberCall('changePin', { oldPin: '000999', newPin: '730264' });
  return res;
}

beforeEach(() => {
  world = createFakeWorld();
  world.lineTokens.set('token-somchai', { userId: 'U-somchai', displayName: 'Somchai' });
  world.lineTokens.set('token-new-phone', { userId: 'U-somchai-new', displayName: 'Somchai' });
  world.depositAccounts.push({
    seq: '1',
    accountNumber: '001-1',
    memberCode: '00123',
    nationalId: SOMCHAI_ID,
    accountName: 'นายสมชาย ใจดี',
    accountType: 'savings',
    lastContactDate: '',
    importedAt: '2026-01-01T00:00:00.000Z',
  });
  memberCall('bindLineAccount', {
    memberCode: '123',
    nationalId: SOMCHAI_ID,
    acceptedPolicyVersion: PRIVACY_POLICY_VERSION,
  });
  memberCall('setPin', { pin: '482915' });

  bootstrapFirstAdministrator(
    { username: 'admin', fullName: 'ผู้ดูแล', password: 'admin-password-1' },
    world.deps,
  );
  const login = handleRequestBody(
    JSON.stringify({ action: 'staffLogin', payload: { username: 'admin', password: 'admin-password-1' } }),
    world.deps,
  );
  adminToken = (login as { data: { sessionToken: string } }).data.sessionToken;
});

describe('changePin', () => {
  it('เปลี่ยน PIN ได้เมื่อ PIN เดิมถูก แล้ว PIN ใหม่ใช้แทนได้', () => {
    expect(memberCall('changePin', { oldPin: '482915', newPin: '730264' })).toEqual({
      ok: true,
      data: { pinSet: true },
    });
    expect(memberCall('changePin', { oldPin: '482915', newPin: '591736' })).toMatchObject({
      error: { code: 'INVALID_CREDENTIALS' },
    });
    expect(memberCall('changePin', { oldPin: '730264', newPin: '591736' })).toMatchObject({ ok: true });
    expect(world.auditLog.filter((e) => e.action === 'changePin')).toHaveLength(2);
  });

  it('PIN เดิมผิดบอกจำนวนครั้งที่เหลือ', () => {
    expect(wrongPin(1)).toMatchObject({
      error: { code: 'INVALID_CREDENTIALS', message: expect.stringContaining('อีก 4 ครั้ง') },
    });
  });

  it('PIN ใหม่ต้องผ่านกฎเดียวกับตอนตั้ง และไม่ซ้ำ PIN เดิม', () => {
    expect(memberCall('changePin', { oldPin: '482915', newPin: '111111' })).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    expect(memberCall('changePin', { oldPin: '482915', newPin: '482915' })).toMatchObject({
      error: { code: 'VALIDATION', message: expect.stringContaining('ไม่ซ้ำ') },
    });
  });

  it('ผิด 5 ครั้งล็อก แม้ PIN ถูกก็ใช้ไม่ได้ และ me แจ้งว่าถูกล็อก', () => {
    wrongPin(4);
    expect(wrongPin(1)).toMatchObject({ error: { code: 'ACCOUNT_LOCKED' } });
    expect(memberCall('changePin', { oldPin: '482915', newPin: '730264' })).toMatchObject({
      error: { code: 'ACCOUNT_LOCKED' },
    });
    expect(memberCall('me')).toMatchObject({ data: { pinSet: true, pinLocked: true } });
    expect(world.auditLog.some((e) => e.action === 'pinLocked')).toBe(true);
  });

  it('PIN ถูกแล้วนับครั้งที่ผิดใหม่', () => {
    wrongPin(4);
    memberCall('changePin', { oldPin: '482915', newPin: '730264' });
    expect(wrongPin(4)).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } });
  });

  it('ยังไม่ผูกบัญชีได้ NOT_BOUND', () => {
    expect(memberCall('changePin', { oldPin: '482915', newPin: '730264' }, 'token-new-phone')).toMatchObject({
      error: { code: 'NOT_BOUND' },
    });
  });
});

describe('resetPin (ผู้ดูแลระบบ)', () => {
  it('ปลดล็อกและล้าง PIN แล้วสมาชิกตั้ง PIN ใหม่ผ่าน LINE ได้', () => {
    wrongPin(5);
    expect(staffCall('resetPin', { memberCode: '123' })).toMatchObject({
      ok: true,
      data: { memberCode: '00123', binding: { pinSet: false, pinLocked: false, pinFailedAttempts: 0 } },
    });
    expect(memberCall('me')).toMatchObject({ data: { pinSet: false, pinLocked: false } });
    expect(memberCall('setPin', { pin: '591736' })).toMatchObject({ ok: true });
    expect(memberCall('changePin', { oldPin: '591736', newPin: '730264' })).toMatchObject({ ok: true });
    expect(world.auditLog).toContainEqual(
      expect.objectContaining({ actor: 'admin', action: 'resetPin', target: '00123' }),
    );
  });

  it('สมาชิกที่ยังไม่ผูกบัญชีได้ NOT_FOUND', () => {
    expect(staffCall('resetPin', { memberCode: '999' })).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});

describe('unbindLineAccount (ผู้ดูแลระบบ)', () => {
  it('ยกเลิกแล้ว LINE เดิมใช้ไม่ได้ทันที และผูก LINE ใหม่ได้', () => {
    expect(staffCall('unbindLineAccount', { memberCode: '00123' })).toMatchObject({
      ok: true,
      data: { memberCode: '00123', binding: null },
    });
    expect(world.bindings[0]).toMatchObject({ unboundBy: 'admin', unboundAt: '2026-01-05T02:00:00.000Z' });
    expect(memberCall('me')).toMatchObject({ data: { bound: false } });
    expect(memberCall('listMyAccounts')).toMatchObject({ error: { code: 'NOT_BOUND' } });

    expect(
      memberCall(
        'bindLineAccount',
        { memberCode: '123', nationalId: SOMCHAI_ID, acceptedPolicyVersion: PRIVACY_POLICY_VERSION },
        'token-new-phone',
      ),
    ).toMatchObject({ ok: true });
    expect(world.auditLog).toContainEqual(
      expect.objectContaining({ actor: 'admin', action: 'unbindLineAccount', target: '00123' }),
    );
  });

  it('ยกเลิกซ้ำได้ NOT_FOUND', () => {
    staffCall('unbindLineAccount', { memberCode: '123' });
    expect(staffCall('unbindLineAccount', { memberCode: '123' })).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });
});

describe('lookupMember (ผู้ดูแลระบบ)', () => {
  it('แสดงสถานะการผูกและ PIN', () => {
    wrongPin(2);
    expect(staffCall('lookupMember', { memberCode: '123' })).toEqual({
      ok: true,
      data: {
        memberCode: '00123',
        memberName: 'นายสมชาย ใจดี',
        accountCount: 1,
        binding: {
          boundAt: '2026-01-05T02:00:00.000Z',
          consentVersion: PRIVACY_POLICY_VERSION,
          pinSet: true,
          pinLocked: false,
          pinFailedAttempts: 2,
        },
      },
    });
  });

  it('รหัสสมาชิกที่ไม่มีได้ NOT_FOUND และรูปแบบผิดได้ VALIDATION', () => {
    expect(staffCall('lookupMember', { memberCode: '999' })).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(staffCall('lookupMember', { memberCode: 'abc' })).toMatchObject({ error: { code: 'VALIDATION' } });
  });

  it('เฉพาะผู้ดูแลระบบ', () => {
    staffCall('createStaff', {
      username: 'somsri',
      fullName: 'สมศรี',
      roles: ['reviewer', 'approver'],
      password: 'reviewer-pass-1',
    });
    const login = handleRequestBody(
      JSON.stringify({ action: 'staffLogin', payload: { username: 'somsri', password: 'reviewer-pass-1' } }),
      world.deps,
    );
    const token = (login as { data: { sessionToken: string } }).data.sessionToken;
    for (const action of ['lookupMember', 'resetPin', 'unbindLineAccount']) {
      expect(staffCall(action, { memberCode: '123' }, token)).toMatchObject({ error: { code: 'FORBIDDEN' } });
    }
  });
});
