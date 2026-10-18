// ฉากเริ่มต้นที่การทดสอบหลายไฟล์ใช้ร่วมกัน
import { PRIVACY_POLICY_VERSION, type StaffRole } from '../../shared/api';
import { createFakeWorld, type FakeWorld } from '../src/adapters/fake';
import type { DepositAccount } from '../src/adapters/ports';
import { handleRequestBody } from '../src/app/handle';
import { bootstrapFirstAdministrator } from '../src/app/staff';

export const SOMCHAI_ID = '1101700230708';
export const SOMYING_ID = '3490100123458';
export const STAFF_GROUP = `C${'a'.repeat(32)}`;
export const MEMBER_PIN = '482915';

export const JPEG = { fileName: 'slip.jpg', mimeType: 'image/jpeg', contentBase64: '/9j/4AAQSkZJRgABAQ==' };
export const PNG = { fileName: 'slip.png', mimeType: 'image/png', contentBase64: 'iVBORw0KGgoAAAANSUhEUg==' };
export const PDF = { fileName: 'doc.pdf', mimeType: 'application/pdf', contentBase64: 'JVBERi0xLjQKJcOkw7zDtsOf' };

export function depositAccount(partial: Partial<DepositAccount>): DepositAccount {
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

export type Scene = {
  world: FakeWorld;
  /** เรียก action ในนามสมาชิก (token-somchai = 00123, token-somying = 04567) */
  member(action: string, payload?: unknown, idToken?: string): ReturnType<typeof handleRequestBody>;
  /** เรียก action ในนามเจ้าหน้าที่ (ค่าเริ่มต้นคือ admin ที่มีทุกบทบาท) */
  staff(action: string, payload?: unknown, username?: string): ReturnType<typeof handleRequestBody>;
  addStaff(username: string, roles: StaffRole[]): void;
};

/**
 * สมาชิก 2 คนที่ผูกบัญชีและตั้ง PIN แล้ว: สมชาย (00123, บัญชีออมทรัพย์ 001-1 และออมทรัพย์พิเศษ 002-1)
 * และสมหญิง (04567, บัญชี 001-9) ผู้ดูแลระบบ admin มีทุกบทบาท และตั้งกลุ่มแจ้งเตือนเจ้าหน้าที่แล้ว
 * เวลาเริ่มต้นคือวันจันทร์ 5 ม.ค. 2026 09:00 เวลาไทย
 */
export function createScene(): Scene {
  const world = createFakeWorld();
  const tokens = new Map<string, string>();

  const member: Scene['member'] = (action, payload, idToken = 'token-somchai') =>
    handleRequestBody(JSON.stringify({ action, auth: { idToken }, payload }), world.deps);

  const staffRaw = (action: string, payload: unknown, sessionToken?: string) =>
    handleRequestBody(
      JSON.stringify({ action, auth: sessionToken ? { sessionToken } : undefined, payload }),
      world.deps,
    );

  function login(username: string): void {
    const res = staffRaw('staffLogin', { username, password: `${username}-password-1` });
    if (!res.ok) throw new Error(res.error.message);
    tokens.set(username, (res.data as { sessionToken: string }).sessionToken);
  }

  const staff: Scene['staff'] = (action, payload, username = 'admin') =>
    staffRaw(action, payload, tokens.get(username));

  world.lineTokens.set('token-somchai', { userId: 'U-somchai', displayName: 'Somchai' });
  world.lineTokens.set('token-somying', { userId: 'U-somying', displayName: 'Somying' });
  world.lineTokens.set('token-stranger', { userId: 'U-stranger', displayName: 'Stranger' });
  world.depositAccounts.push(
    depositAccount({}),
    depositAccount({ seq: '2', accountNumber: '002-1', accountType: 'specialSavings' }),
    depositAccount({ seq: '3', accountNumber: '001-9', memberCode: '04567', nationalId: SOMYING_ID, accountName: 'นางสาวสมหญิง รักออม' }),
  );
  for (const [token, memberCode, nationalId] of [
    ['token-somchai', '123', SOMCHAI_ID],
    ['token-somying', '4567', SOMYING_ID],
  ]) {
    const bound = member('bindLineAccount', { memberCode, nationalId, acceptedPolicyVersion: PRIVACY_POLICY_VERSION }, token);
    if (!bound.ok) throw new Error(bound.error.message);
    member('setPin', { pin: MEMBER_PIN }, token);
  }

  bootstrapFirstAdministrator({ username: 'admin', fullName: 'ผู้ดูแล ระบบ', password: 'admin-password-1' }, world.deps);
  world.staff.get('admin')!.roles = ['reviewer', 'approver', 'systemAdministrator'];
  login('admin');

  world.settings.set('staffGroupId', STAFF_GROUP);
  world.auditLog.length = 0;
  world.sentMessages.length = 0;

  return {
    world,
    member,
    staff,
    addStaff(username, roles) {
      const res = staff('createStaff', { username, fullName: username, roles, password: `${username}-password-1` });
      if (!res.ok) throw new Error(res.error.message);
      login(username);
    },
  };
}
