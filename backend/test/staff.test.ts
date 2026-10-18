import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeWorld, type FakeWorld } from '../src/adapters/fake';
import { handleRequestBody } from '../src/app/handle';
import { sha256, toHex, utf8 } from '../src/app/sha256';
import { bootstrapFirstAdministrator } from '../src/app/staff';

let world: FakeWorld;

function call(action: string, payload?: unknown, sessionToken?: string) {
  const auth = sessionToken ? { sessionToken } : undefined;
  return handleRequestBody(JSON.stringify({ action, auth, payload }), world.deps);
}

function login(username: string, password: string): string {
  const res = call('staffLogin', { username, password });
  if (!res.ok) throw new Error(`login failed: ${res.error.message}`);
  return (res.data as { sessionToken: string }).sessionToken;
}

const ADMIN = { username: 'admin', fullName: 'ผู้ดูแล ระบบ', password: 'admin-password-1' };

let adminToken: string;

beforeEach(() => {
  world = createFakeWorld();
  bootstrapFirstAdministrator(ADMIN, world.deps);
  adminToken = login('admin', ADMIN.password);
});

function createReviewer(username = 'somsri', password = 'reviewer-pass-1') {
  return call(
    'createStaff',
    { username, fullName: 'สมศรี ตรวจดี', roles: ['reviewer'], password },
    adminToken,
  );
}

describe('ผู้ดูแลระบบคนแรก', () => {
  it('สร้างได้ครั้งเดียว เมื่อมีเจ้าหน้าที่แล้วสร้างซ้ำไม่ได้', () => {
    expect(() =>
      bootstrapFirstAdministrator({ ...ADMIN, username: 'admin2' }, world.deps),
    ).toThrow('มีบัญชีเจ้าหน้าที่อยู่แล้ว');
  });
});

describe('staffLogin', () => {
  it('รหัสผ่านถูกต้องได้ session token และข้อมูลเจ้าหน้าที่', () => {
    const res = call('staffLogin', { username: ' Admin ', password: ADMIN.password });
    expect(res).toMatchObject({
      ok: true,
      data: {
        expiresAt: '2026-01-05T10:00:00.000Z',
        staff: { username: 'admin', fullName: 'ผู้ดูแล ระบบ', roles: ['systemAdministrator'] },
      },
    });
  });

  it('รหัสผ่านผิดได้ INVALID_CREDENTIALS', () => {
    expect(call('staffLogin', { username: 'admin', password: 'wrong-password' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_CREDENTIALS' },
    });
  });

  it('ชื่อผู้ใช้ที่ไม่มีได้ข้อความเดียวกับรหัสผ่านผิด', () => {
    expect(call('staffLogin', { username: 'nobody', password: 'whatever-123' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' },
    });
  });

  it('ผิด 5 ครั้งล็อก 15 นาที แม้ใส่รหัสถูกก็เข้าไม่ได้ จนครบเวลา', () => {
    for (let i = 0; i < 4; i++) {
      expect(call('staffLogin', { username: 'admin', password: 'wrong' })).toMatchObject({
        error: { code: 'INVALID_CREDENTIALS' },
      });
    }
    expect(call('staffLogin', { username: 'admin', password: 'wrong' })).toMatchObject({
      error: { code: 'ACCOUNT_LOCKED', message: expect.stringContaining('09:15') },
    });
    expect(call('staffLogin', { username: 'admin', password: ADMIN.password })).toMatchObject({
      error: { code: 'ACCOUNT_LOCKED' },
    });

    world.advanceMinutes(15);
    expect(call('staffLogin', { username: 'admin', password: ADMIN.password })).toMatchObject({
      ok: true,
    });
  });

  it('เข้าสำเร็จแล้วนับครั้งที่ผิดใหม่', () => {
    for (let i = 0; i < 4; i++) call('staffLogin', { username: 'admin', password: 'wrong' });
    login('admin', ADMIN.password);
    for (let i = 0; i < 4; i++) {
      expect(call('staffLogin', { username: 'admin', password: 'wrong' })).toMatchObject({
        error: { code: 'INVALID_CREDENTIALS' },
      });
    }
  });

  it('บัญชีที่ถูกปิดเข้าระบบไม่ได้', () => {
    createReviewer();
    call('updateStaff', { username: 'somsri', active: false }, adminToken);
    expect(call('staffLogin', { username: 'somsri', password: 'reviewer-pass-1' })).toMatchObject({
      error: { code: 'INVALID_CREDENTIALS' },
    });
  });
});

describe('session', () => {
  it('staffMe ใช้ token ได้ และหมดอายุเมื่อครบ 8 ชั่วโมง', () => {
    expect(call('staffMe', undefined, adminToken)).toMatchObject({
      ok: true,
      data: { username: 'admin' },
    });
    world.advanceMinutes(8 * 60 - 1);
    expect(call('staffMe', undefined, adminToken)).toMatchObject({ ok: true });
    world.advanceMinutes(1);
    expect(call('staffMe', undefined, adminToken)).toMatchObject({
      error: { code: 'UNAUTHENTICATED' },
    });
  });

  it('ออกจากระบบแล้ว token ใช้ไม่ได้ทันที', () => {
    expect(call('staffLogout', undefined, adminToken)).toEqual({ ok: true, data: {} });
    expect(call('staffMe', undefined, adminToken)).toMatchObject({
      error: { code: 'UNAUTHENTICATED' },
    });
  });

  it('ไม่ส่ง token หรือ token ปลอมได้ UNAUTHENTICATED', () => {
    expect(call('staffMe')).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    expect(call('staffMe', undefined, 'forged-token')).toMatchObject({
      error: { code: 'UNAUTHENTICATED' },
    });
  });

  it('ไม่เก็บ token จริงไว้ในที่เก็บข้อมูล', () => {
    expect([...world.sessions.keys()]).not.toContain(adminToken);
  });

  it('ปิดบัญชีแล้ว session เดิมของคนนั้นใช้ไม่ได้ทันที', () => {
    createReviewer();
    const token = login('somsri', 'reviewer-pass-1');
    call('updateStaff', { username: 'somsri', active: false }, adminToken);
    expect(call('staffMe', undefined, token)).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });
});

describe('สิทธิ์ตามบทบาท', () => {
  it('ผู้ตรวจเรียกงานของผู้ดูแลระบบไม่ได้', () => {
    createReviewer();
    const token = login('somsri', 'reviewer-pass-1');
    expect(call('listStaff', undefined, token)).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(
      call(
        'createStaff',
        { username: 'x1', fullName: 'x', roles: ['reviewer'], password: 'password-123' },
        token,
      ),
    ).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });
});

describe('จัดการบัญชีเจ้าหน้าที่', () => {
  it('สร้างเจ้าหน้าที่แล้วเห็นในรายการ โดยไม่มีข้อมูลรหัสผ่าน', () => {
    expect(createReviewer()).toMatchObject({
      ok: true,
      data: { username: 'somsri', roles: ['reviewer'], active: true, locked: false },
    });
    const res = call('listStaff', undefined, adminToken);
    expect(res).toMatchObject({
      ok: true,
      data: [{ username: 'admin' }, { username: 'somsri' }],
    });
    expect(JSON.stringify(res)).not.toMatch(/password/i);
  });

  it('ชื่อผู้ใช้ซ้ำได้ CONFLICT', () => {
    createReviewer();
    expect(createReviewer('SOMSRI')).toMatchObject({ error: { code: 'CONFLICT' } });
  });

  it('ตรวจข้อมูลก่อนสร้าง', () => {
    const base = { username: 'newstaff', fullName: 'ใหม่', roles: ['reviewer'], password: 'long-password' };
    const cases = [
      { ...base, password: 'short' },
      { ...base, username: 'ab' },
      { ...base, username: 'สมศรี' },
      { ...base, roles: [] },
      { ...base, roles: ['superuser'] },
      { ...base, fullName: '   ' },
    ];
    for (const payload of cases) {
      expect(call('createStaff', payload, adminToken)).toMatchObject({
        error: { code: 'VALIDATION' },
      });
    }
  });

  it('คนเดียวมีได้หลายบทบาท และเก็บตามลำดับมาตรฐาน', () => {
    const res = call(
      'createStaff',
      {
        username: 'multi',
        fullName: 'หลาย บทบาท',
        roles: ['approver', 'reviewer', 'reviewer'],
        password: 'long-password',
      },
      adminToken,
    );
    expect(res).toMatchObject({ ok: true, data: { roles: ['reviewer', 'approver'] } });
  });

  it('แก้ชื่อและบทบาทได้', () => {
    createReviewer();
    expect(
      call('updateStaff', { username: 'somsri', fullName: 'สมศรี ใหม่', roles: ['approver'] }, adminToken),
    ).toMatchObject({ ok: true, data: { fullName: 'สมศรี ใหม่', roles: ['approver'] } });
  });

  it('แก้บัญชีที่ไม่มีได้ NOT_FOUND', () => {
    expect(call('updateStaff', { username: 'ghost', active: false }, adminToken)).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });

  it('ปิดหรือถอดบทบาทผู้ดูแลระบบคนสุดท้ายไม่ได้', () => {
    expect(call('updateStaff', { username: 'admin', active: false }, adminToken)).toMatchObject({
      error: { code: 'CONFLICT' },
    });
    expect(
      call('updateStaff', { username: 'admin', roles: ['reviewer'] }, adminToken),
    ).toMatchObject({ error: { code: 'CONFLICT' } });
  });

  it('รีเซ็ตรหัสผ่าน: รหัสใหม่ใช้ได้ รหัสเดิมและ session เดิมใช้ไม่ได้ และปลดล็อก', () => {
    createReviewer();
    const oldToken = login('somsri', 'reviewer-pass-1');
    for (let i = 0; i < 5; i++) call('staffLogin', { username: 'somsri', password: 'wrong' });

    expect(
      call('resetStaffPassword', { username: 'somsri', newPassword: 'brand-new-pass' }, adminToken),
    ).toMatchObject({ ok: true, data: { locked: false } });

    expect(call('staffMe', undefined, oldToken)).toMatchObject({
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(call('staffLogin', { username: 'somsri', password: 'reviewer-pass-1' })).toMatchObject({
      error: { code: 'INVALID_CREDENTIALS' },
    });
    expect(call('staffLogin', { username: 'somsri', password: 'brand-new-pass' })).toMatchObject({
      ok: true,
    });
  });

  it('รีเซ็ตด้วยรหัสผ่านสั้นเกินได้ VALIDATION', () => {
    createReviewer();
    expect(
      call('resetStaffPassword', { username: 'somsri', newPassword: 'short' }, adminToken),
    ).toMatchObject({ error: { code: 'VALIDATION' } });
  });
});

describe('sha256', () => {
  it('ได้ผลเหมือน node:crypto ทั้งข้อความสั้น ยาว และภาษาไทย', () => {
    for (const text of ['', 'abc', 'x'.repeat(55), 'y'.repeat(64), 'z'.repeat(1000), 'รหัสผ่าน🔐']) {
      const expected = createHash('sha256').update(text, 'utf8').digest('hex');
      expect(toHex(sha256(utf8(text)))).toBe(expected);
    }
  });
});
