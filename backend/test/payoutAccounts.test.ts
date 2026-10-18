import { beforeEach, describe, expect, it } from 'vitest';
import { PRIVACY_POLICY_VERSION } from '../../shared/api';
import { createFakeWorld, type FakeWorld } from '../src/adapters/fake';
import { handleRequestBody } from '../src/app/handle';
import { handleLineWebhook } from '../src/app/lineGroups';
import { bootstrapFirstAdministrator } from '../src/app/staff';

let world: FakeWorld;
let adminToken: string;
let reviewerToken: string;

const SOMCHAI_ID = '1101700230708';
const STAFF_GROUP = `C${'a'.repeat(32)}`;

const JPEG = { fileName: 'id.jpg', mimeType: 'image/jpeg', contentBase64: '/9j/4AAQSkZJRgABAQ==' };
const PNG = { fileName: 'book.png', mimeType: 'image/png', contentBase64: 'iVBORw0KGgoAAAANSUhEUg==' };
const PDF = { fileName: 'payout.pdf', mimeType: 'application/pdf', contentBase64: 'JVBERi0xLjQKJcOkw7zDtsOf' };

function memberCall(action: string, payload?: unknown, idToken = 'token-somchai') {
  return handleRequestBody(JSON.stringify({ action, auth: { idToken }, payload }), world.deps);
}

function staffCall(action: string, payload?: unknown, sessionToken = reviewerToken) {
  return handleRequestBody(JSON.stringify({ action, auth: { sessionToken }, payload }), world.deps);
}

function login(username: string, password: string): string {
  const res = handleRequestBody(JSON.stringify({ action: 'staffLogin', payload: { username, password } }), world.deps);
  return (res as { data: { sessionToken: string } }).data.sessionToken;
}

function register(overrides: Record<string, unknown> = {}) {
  return memberCall('registerPayoutAccount', {
    bankCode: 'KTB',
    accountNumber: '123-4-56789-0',
    accountName: 'นายสมชาย  ใจดี',
    documents: { idCard: JPEG, depositBook: PNG, payoutBook: PDF },
    ...overrides,
  });
}

function registeredId(res: unknown): string {
  return (res as { data: { id: string } }).data.id;
}

beforeEach(() => {
  world = createFakeWorld();
  world.lineTokens.set('token-somchai', { userId: 'U-somchai', displayName: 'Somchai' });
  world.lineTokens.set('token-stranger', { userId: 'U-stranger', displayName: 'Stranger' });
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
  memberCall('bindLineAccount', { memberCode: '123', nationalId: SOMCHAI_ID, acceptedPolicyVersion: PRIVACY_POLICY_VERSION });

  bootstrapFirstAdministrator({ username: 'admin', fullName: 'ผู้ดูแล', password: 'admin-password-1' }, world.deps);
  adminToken = login('admin', 'admin-password-1');
  staffCall('createStaff', { username: 'somsri', fullName: 'สมศรี', roles: ['reviewer'], password: 'reviewer-pass-1' }, adminToken);
  reviewerToken = login('somsri', 'reviewer-pass-1');
  world.settings.set('staffGroupId', STAFF_GROUP);
  world.settings.set('staffWebUrl', 'https://staff.example.org');
});

describe('registerPayoutAccount', () => {
  it('บันทึกเอกสาร 3 ไฟล์แบบไม่แชร์ สร้างบัญชีรอตรวจ และแจ้งกลุ่มเจ้าหน้าที่โดยไม่เปิดเผยเลขบัญชีเต็ม', () => {
    const res = register();
    expect(res).toMatchObject({
      ok: true,
      data: { bankCode: 'KTB', accountNumber: '1234567890', accountName: 'นายสมชาย ใจดี', status: 'pendingReview' },
    });
    expect([...world.files.values()].map((f) => [f.category, f.mimeType])).toEqual([
      ['payoutDocuments', 'image/jpeg'],
      ['payoutDocuments', 'image/png'],
      ['payoutDocuments', 'application/pdf'],
    ]);
    expect(world.sentMessages).toEqual([
      {
        to: STAFF_GROUP,
        text: 'บัญชีรับเงินใหม่รอตรวจ\nสมาชิก 00123 นายสมชาย ใจดี\nธนาคารกรุงไทย ลงท้าย 7890\nhttps://staff.example.org',
      },
    ]);
    expect(JSON.stringify(world.sentMessages)).not.toContain(SOMCHAI_ID);
    expect(JSON.stringify(world.sentMessages)).not.toContain('1234567890');
    expect(world.auditLog).toContainEqual(expect.objectContaining({ actor: 'member:00123', action: 'registerPayoutAccount' }));
  });

  it('ตรวจข้อมูลและเอกสาร', () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ bankCode: 'XXX' }, 'ธนาคาร'],
      [{ accountNumber: '12345' }, 'เลขบัญชี'],
      [{ accountName: '  ' }, 'ชื่อบัญชี'],
      [{ documents: { idCard: JPEG, depositBook: PNG } }, 'สำเนาบัญชีรับเงิน'],
      [{ documents: { idCard: { ...JPEG, mimeType: 'image/gif' }, depositBook: PNG, payoutBook: PDF } }, 'สำเนาบัตรประชาชนต้องเป็นไฟล์'],
      [{ documents: { idCard: { ...JPEG, contentBase64: 'TVqQAAMAAAAEAAAA' }, depositBook: PNG, payoutBook: PDF } }, 'JPG, PNG, PDF'],
      [{ documents: { idCard: JPEG, depositBook: PNG, payoutBook: { ...PDF, contentBase64: `JVBERi0x${'A'.repeat(7_000_000)}` } } }, 'ใหญ่เกิน 5MB'],
    ];
    for (const [overrides, message] of cases) {
      expect(register(overrides)).toMatchObject({ error: { code: 'VALIDATION', message: expect.stringContaining(message) } });
    }
    expect(world.payoutAccounts).toEqual([]);
    expect(world.files.size).toBe(0);
  });

  it('บัญชีเดิมลงซ้ำไม่ได้ และมีบัญชีที่ใช้งานได้ไม่เกิน 3 บัญชี', () => {
    register();
    expect(register({ accountNumber: '1234567890' })).toMatchObject({ error: { code: 'CONFLICT' } });
    register({ accountNumber: '2222222222' });
    register({ accountNumber: '3333333333' });
    expect(register({ accountNumber: '4444444444' })).toMatchObject({
      error: { code: 'CONFLICT', message: expect.stringContaining('ไม่เกิน 3 บัญชี') },
    });
  });

  it('ยังไม่ผูกบัญชีได้ NOT_BOUND', () => {
    expect(
      memberCall('registerPayoutAccount', { bankCode: 'KTB', accountNumber: '1234567890', accountName: 'x' }, 'token-stranger'),
    ).toMatchObject({ error: { code: 'NOT_BOUND' } });
  });

  it('LINE ส่งข้อความไม่สำเร็จ การลงทะเบียนยังสำเร็จและบันทึก audit log', () => {
    world.messengerDown = true;
    expect(register()).toMatchObject({ ok: true });
    expect(world.auditLog).toContainEqual(
      expect.objectContaining({ action: 'notifyFailed', target: 'staffGroup', detail: 'LINE push failed: HTTP 500' }),
    );
  });
});

describe('บัญชีรับเงินของฉัน', () => {
  it('เห็นเฉพาะของตนเองที่ยังไม่เลิกใช้ และเลิกใช้ได้', () => {
    const id = registeredId(register());
    expect(memberCall('listMyPayoutAccounts')).toMatchObject({ data: [{ id, status: 'pendingReview' }] });

    expect(memberCall('retirePayoutAccount', { id })).toMatchObject({ data: { status: 'retired' } });
    expect(memberCall('listMyPayoutAccounts')).toEqual({ ok: true, data: [] });
    expect(memberCall('retirePayoutAccount', { id })).toMatchObject({ error: { code: 'CONFLICT' } });
  });

  it('เลิกใช้บัญชีของคนอื่นไม่ได้', () => {
    const id = registeredId(register());
    world.lineTokens.set('token-somying', { userId: 'U-somying', displayName: 'Somying' });
    world.addBinding({ memberCode: '04567', lineUserId: 'U-somying' });
    expect(memberCall('retirePayoutAccount', { id }, 'token-somying')).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});

describe('reviewPayoutAccount', () => {
  it('ผู้ตรวจเห็นคิวรอตรวจพร้อมเอกสาร อนุมัติแล้วแจ้งสมาชิก', () => {
    const id = registeredId(register());
    world.sentMessages.length = 0;

    expect(staffCall('listPayoutAccountsForReview')).toMatchObject({
      data: [{ id, memberCode: '00123', memberName: 'นายสมชาย ใจดี', documents: { idCard: 'file-1', depositBook: 'file-2', payoutBook: 'file-3' } }],
    });

    expect(staffCall('reviewPayoutAccount', { id, decision: 'approve' })).toMatchObject({
      ok: true,
      data: { status: 'approved', reviewedBy: 'somsri', reviewedAt: '2026-01-05T02:00:00.000Z' },
    });
    expect(world.sentMessages).toEqual([
      { to: 'U-somchai', text: 'บัญชีรับเงิน ธนาคารกรุงไทย 1234567890 ได้รับการอนุมัติแล้ว ใช้รับเงินที่ถอนได้' },
    ]);
    expect(memberCall('listMyPayoutAccounts')).toMatchObject({ data: [{ status: 'approved' }] });
    expect(staffCall('listPayoutAccountsForReview')).toEqual({ ok: true, data: [] });
  });

  it('ปฏิเสธต้องมีเหตุผล และแจ้งเหตุผลให้สมาชิก', () => {
    const id = registeredId(register());
    world.sentMessages.length = 0;
    expect(staffCall('reviewPayoutAccount', { id, decision: 'reject', reason: ' ' })).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    expect(staffCall('reviewPayoutAccount', { id, decision: 'reject', reason: 'สำเนาไม่ชัด' })).toMatchObject({
      data: { status: 'rejected', rejectReason: 'สำเนาไม่ชัด' },
    });
    expect(world.sentMessages[0]).toMatchObject({ to: 'U-somchai', text: expect.stringContaining('เหตุผล: สำเนาไม่ชัด') });
    expect(memberCall('listMyPayoutAccounts')).toMatchObject({ data: [{ status: 'rejected', rejectReason: 'สำเนาไม่ชัด' }] });
  });

  it('ตรวจซ้ำไม่ได้', () => {
    const id = registeredId(register());
    staffCall('reviewPayoutAccount', { id, decision: 'approve' });
    expect(staffCall('reviewPayoutAccount', { id, decision: 'reject', reason: 'x' })).toMatchObject({
      error: { code: 'CONFLICT' },
    });
  });

  it('ต้องมีบทบาทผู้ตรวจ', () => {
    const id = registeredId(register());
    expect(staffCall('listPayoutAccountsForReview', undefined, adminToken)).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(staffCall('reviewPayoutAccount', { id, decision: 'approve' }, adminToken)).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
  });
});

describe('viewDocument', () => {
  it('เจ้าหน้าที่เปิดเอกสารได้และบันทึก audit log ทุกครั้ง', () => {
    const id = registeredId(register());
    expect(staffCall('viewDocument', { fileId: 'file-1' })).toEqual({
      ok: true,
      data: { fileName: '00123-' + id + '-idCard.jpg', mimeType: 'image/jpeg', contentBase64: JPEG.contentBase64 },
    });
    expect(world.auditLog).toContainEqual(
      expect.objectContaining({ actor: 'somsri', action: 'viewDocument', target: `payoutAccount:${id}`, detail: 'file-1' }),
    );
  });

  it('เปิดไฟล์ที่ระบบไม่ได้อ้างถึงไม่ได้ และต้องเข้าสู่ระบบ', () => {
    world.files.set('file-other', { category: 'pdfs', fileName: 'x', mimeType: 'application/pdf', contentBase64: 'JVBE' });
    expect(staffCall('viewDocument', { fileId: 'file-other' })).toMatchObject({ error: { code: 'NOT_FOUND' } });
    register();
    expect(handleRequestBody(JSON.stringify({ action: 'viewDocument', payload: { fileId: 'file-1' } }), world.deps)).toMatchObject({
      error: { code: 'UNAUTHENTICATED' },
    });
  });
});

describe('กลุ่ม LINE ของเจ้าหน้าที่', () => {
  const GROUP = `C${'b'.repeat(32)}`;

  function webhook(events: unknown[]) {
    handleLineWebhook(JSON.stringify({ destination: 'U-bot', events }), world.deps);
  }

  it('event join ของกลุ่มบันทึก groupId พร้อมชื่อกลุ่ม ส่วน event อื่นไม่สนใจ', () => {
    world.groupNames.set(GROUP, 'เจ้าหน้าที่สหกรณ์');
    webhook([
      { type: 'message', source: { type: 'group', groupId: `C${'c'.repeat(32)}` } },
      { type: 'join', source: { type: 'room', roomId: 'R1' } },
      { type: 'join', source: { type: 'group', groupId: 'not-a-group-id' } },
      { type: 'join', source: { type: 'group', groupId: GROUP } },
    ]);
    expect(world.lineGroups).toEqual([{ groupId: GROUP, groupName: 'เจ้าหน้าที่สหกรณ์', joinedAt: '2026-01-05T02:00:00.000Z' }]);
  });

  it('ผู้ดูแลระบบตั้งกลุ่มเจ้าหน้าที่ได้เมื่อส่งข้อความทดสอบเข้ากลุ่มได้', () => {
    webhook([{ type: 'join', source: { type: 'group', groupId: GROUP } }]);
    world.sentMessages.length = 0;
    expect(staffCall('updateNotificationSettings', { staffGroupId: GROUP }, adminToken)).toMatchObject({
      ok: true,
      data: { staffGroupId: GROUP, groups: [{ groupId: GROUP }] },
    });
    expect(world.sentMessages).toEqual([{ to: GROUP, text: expect.stringContaining('ทดสอบ') }]);
  });

  it('กลุ่มที่ไม่รู้จักหรือส่งข้อความไม่ได้ ตั้งไม่ได้', () => {
    expect(staffCall('updateNotificationSettings', { staffGroupId: GROUP }, adminToken)).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
    webhook([{ type: 'join', source: { type: 'group', groupId: GROUP } }]);
    world.messengerDown = true;
    expect(staffCall('updateNotificationSettings', { staffGroupId: GROUP }, adminToken)).toMatchObject({
      error: { code: 'CONFLICT' },
    });
    expect(world.settings.get('staffGroupId')).toBe(STAFF_GROUP);
  });

  it('ลิงก์หน้าเว็บต้องเป็น https และเฉพาะผู้ดูแลระบบ', () => {
    expect(staffCall('updateNotificationSettings', { staffWebUrl: 'http://x' }, adminToken)).toMatchObject({
      error: { code: 'VALIDATION' },
    });
    expect(staffCall('updateNotificationSettings', { staffWebUrl: 'https://staff.coop.example' }, adminToken)).toMatchObject({
      data: { staffWebUrl: 'https://staff.coop.example' },
    });
    expect(staffCall('lineGroupSettings')).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });
});
