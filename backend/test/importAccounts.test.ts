import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeWorld, fakeSpreadsheetBase64, type FakeWorld } from '../src/adapters/fake';
import { handleRequestBody } from '../src/app/handle';
import { bootstrapFirstAdministrator } from '../src/app/staff';

let world: FakeWorld;
let adminToken: string;

function call(action: string, payload?: unknown, sessionToken = adminToken) {
  return handleRequestBody(JSON.stringify({ action, auth: { sessionToken }, payload }), world.deps);
}

function login(username: string, password: string): string {
  const res = handleRequestBody(
    JSON.stringify({ action: 'staffLogin', payload: { username, password } }),
    world.deps,
  );
  if (!res.ok) throw new Error(res.error.message);
  return (res.data as { sessionToken: string }).sessionToken;
}

/** เลขบัตรประชาชนที่ checksum ถูกต้อง สร้างจาก 12 หลักแรก */
function nationalId(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (13 - i);
  return first12 + ((11 - (sum % 11)) % 10);
}

const ID_A = nationalId('110170023070');
const ID_B = nationalId('349010012345');
const ID_C = nationalId('149990034567');

const HEADER = [
  'ลำดับ',
  'หมายเลขบัญชี',
  'รหัสสมาชิก',
  'หมายเลขบัตรประชาชน',
  'ชื่อบัญชีเงินฝาก',
  'ประเภทบัญชี',
  'ข้อมูลติดต่อล่าสุด',
];

function importRows(rows: string[][], fileName = 'export.xlsx') {
  return call('importAccounts', { fileName, contentBase64: fakeSpreadsheetBase64(rows) });
}

beforeEach(() => {
  world = createFakeWorld();
  bootstrapFirstAdministrator(
    { username: 'admin', fullName: 'ผู้ดูแล', password: 'admin-password-1' },
    world.deps,
  );
  adminToken = login('admin', 'admin-password-1');
});

describe('importAccounts', () => {
  it('นำเข้าไฟล์ที่ถูกต้อง: เติม 0 ให้รหัสสมาชิก แปลงประเภทบัญชี และบันทึกเวลานำเข้า', () => {
    const res = importRows([
      HEADER,
      ['1', '001-1-00001-1', '123', ID_A, 'นายสมชาย ใจดี', 'ออมทรัพย์', '15/03/2569'],
      ['2', '002-1-00002-2', '123', ID_A, 'นายสมชาย ใจดี', 'ออมทรัพย์ พิเศษ', ''],
      ['3', '001-1-00003-3', '04567', `${ID_B.slice(0, 1)}-${ID_B.slice(1, 5)}-${ID_B.slice(5)}`, 'นางสาวสมหญิง รักออม', 'ออมทรัพย์', '01/02/2569'],
    ]);

    expect(res).toEqual({
      ok: true,
      data: { status: 'imported', rowCount: 3, memberCount: 2, importedAt: '2026-01-05T02:00:00.000Z' },
    });
    expect(world.depositAccounts).toEqual([
      {
        seq: '1',
        accountNumber: '001-1-00001-1',
        memberCode: '00123',
        nationalId: ID_A,
        accountName: 'นายสมชาย ใจดี',
        accountType: 'savings',
        lastContactDate: '15/03/2569',
        importedAt: '2026-01-05T02:00:00.000Z',
      },
      expect.objectContaining({ memberCode: '00123', accountType: 'specialSavings', lastContactDate: '' }),
      expect.objectContaining({ memberCode: '04567', nationalId: ID_B }),
    ]);
  });

  it('แทนที่ข้อมูลเดิมทั้งตาราง', () => {
    importRows([HEADER, ['1', 'A-1', '1', ID_A, 'ก', 'ออมทรัพย์', '']]);
    importRows([HEADER, ['1', 'B-1', '2', ID_B, 'ข', 'ออมทรัพย์', '']]);
    expect(world.depositAccounts.map((a) => a.accountNumber)).toEqual(['B-1']);
  });

  it('หาแถวหัวตารางที่ไม่ได้อยู่แถวแรก ยอมรับชื่อหัวคอลัมน์อื่นที่ใช้กัน และข้ามแถวว่าง', () => {
    const res = importRows([
      ['รายงานบัญชีเงินฝาก ณ วันที่ 1/1/2569'],
      [],
      ['ลำดับที่', 'เลขที่บัญชี', 'รหัสสมาชิก', 'เลขบัตรประชาชน', 'ชื่อ บัญชี', 'ประเภทบัญชี', 'วันที่ติดต่อล่าสุด'],
      ['1', 'A-1', '1', ID_A, 'ก', 'ออมทรัพย์', ''],
      ['', '', '', '', '', '', ''],
      ['2', 'A-2', '2', ID_B, 'ข', 'ออมทรัพย์พิเศษ', ''],
    ]);
    expect(res).toMatchObject({ ok: true, data: { status: 'imported', rowCount: 2 } });
  });

  it('คอลัมน์ไม่ครบ: ปฏิเสธพร้อมบอกคอลัมน์ที่ขาด', () => {
    const res = importRows([HEADER.slice(0, 5), ['1', 'A-1', '1', ID_A, 'ก']]);
    expect(res).toEqual({
      ok: true,
      data: {
        status: 'rejected',
        totalErrors: 1,
        errors: [{ row: 0, message: expect.stringContaining('ประเภทบัญชี, ข้อมูลติดต่อล่าสุด') }],
      },
    });
  });

  it('แถวผิด: ปฏิเสธทั้งไฟล์ แจ้งเลขแถวและเหตุผล และข้อมูลเดิมไม่เปลี่ยน', () => {
    importRows([HEADER, ['1', 'OLD-1', '1', ID_A, 'เดิม', 'ออมทรัพย์', '']]);

    const res = importRows([
      HEADER,
      ['1', 'A-1', '123456', ID_A, 'ก', 'ออมทรัพย์', ''],
      ['2', 'A-2', '2', '1234567890123', 'ข', 'ออมทรัพย์', ''],
      ['3', 'A-3', '3', ID_C, '', 'ประจำ', ''],
      ['4', 'A-4', '4', ID_C, 'ง', 'ออมทรัพย์', ''],
      ['5', 'A-4', '5', ID_B, 'จ', 'ออมทรัพย์', ''],
      ['6', 'A-6', '4', ID_A, 'ฉ', 'ออมทรัพย์', ''],
    ]);

    expect(res).toMatchObject({ ok: true, data: { status: 'rejected', totalErrors: 5 } });
    const errors = (res as { data: { errors: { row: number; message: string }[] } }).data.errors;
    expect(errors.map((e) => e.row)).toEqual([2, 3, 4, 5, 6]);
    expect(errors[0].message).toContain('รหัสสมาชิก "123456"');
    expect(errors[1].message).toContain('เลขบัตรประชาชนไม่ถูกต้อง');
    expect(errors[2].message).toContain('ไม่มีชื่อบัญชี');
    expect(errors[2].message).toContain('ประเภทบัญชี "ประจำ"');
    expect(errors[3].message).toContain('เลขบัตรประชาชนซ้ำกับรหัสสมาชิก 00003 ในแถว 4');
    expect(errors[4].message).toContain('หมายเลขบัญชีซ้ำกับแถว 5');

    expect(world.depositAccounts.map((a) => a.accountNumber)).toEqual(['OLD-1']);
  });

  it('สมาชิกคนเดียวกันมีเลขบัตรประชาชนต่างกันไม่ได้', () => {
    const res = importRows([
      HEADER,
      ['1', 'A-1', '7', ID_A, 'ก', 'ออมทรัพย์', ''],
      ['2', 'A-2', '7', ID_B, 'ก', 'ออมทรัพย์พิเศษ', ''],
    ]);
    expect(res).toMatchObject({
      ok: true,
      data: {
        status: 'rejected',
        errors: [{ row: 3, message: 'รหัสสมาชิก 00007 มีเลขบัตรประชาชนไม่ตรงกับแถว 2' }],
      },
    });
  });

  it('ไฟล์ที่ไม่มีแถวข้อมูลถูกปฏิเสธ', () => {
    expect(importRows([HEADER])).toMatchObject({
      ok: true,
      data: { status: 'rejected', errors: [{ row: 0, message: 'ไม่มีข้อมูลบัญชีในไฟล์' }] },
    });
  });

  it('ไม่แตะการผูกบัญชี LINE', () => {
    world.bindings.push({ memberCode: '00001', lineUserId: 'U-1' });
    importRows([HEADER, ['1', 'A-1', '2', ID_B, 'ข', 'ออมทรัพย์', '']]);
    expect(world.bindings).toEqual([{ memberCode: '00001', lineUserId: 'U-1' }]);
  });

  it('บันทึก audit log เมื่อนำเข้าสำเร็จ', () => {
    importRows([HEADER, ['1', 'A-1', '1', ID_A, 'ก', 'ออมทรัพย์', '']], 'ข้อมูล 2569.xlsx');
    expect(world.auditLog).toEqual([
      {
        at: '2026-01-05T02:00:00.000Z',
        actor: 'admin',
        action: 'importAccounts',
        target: 'บัญชีเงินฝาก',
        detail: 'ข้อมูล 2569.xlsx: 1 บัญชี, 1 สมาชิก',
      },
    ]);
  });

  it('รองรับเฉพาะ .xlsx .xls .csv และไฟล์ที่อ่านไม่ได้ได้ VALIDATION', () => {
    expect(importRows([HEADER], 'export.pdf')).toMatchObject({ error: { code: 'VALIDATION' } });
    expect(
      call('importAccounts', { fileName: 'broken.xlsx', contentBase64: 'bm90IGpzb24=' }),
    ).toMatchObject({ error: { code: 'VALIDATION', message: expect.stringContaining('อ่านไฟล์ไม่ได้') } });
  });

  it('เฉพาะผู้ดูแลระบบนำเข้าได้', () => {
    call('createStaff', {
      username: 'somsri',
      fullName: 'สมศรี',
      roles: ['reviewer', 'approver'],
      password: 'reviewer-pass-1',
    });
    const token = login('somsri', 'reviewer-pass-1');
    expect(
      call('importAccounts', { fileName: 'a.xlsx', contentBase64: fakeSpreadsheetBase64([HEADER]) }, token),
    ).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(call('depositAccountImportStatus', undefined, token)).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
  });
});

describe('depositAccountImportStatus', () => {
  it('ยังไม่เคยนำเข้า ได้ 0 และไม่มีเวลา จากนั้นได้จำนวนและเวลาล่าสุด', () => {
    expect(call('depositAccountImportStatus')).toEqual({
      ok: true,
      data: { rowCount: 0, memberCount: 0, importedAt: null },
    });
    importRows([
      HEADER,
      ['1', 'A-1', '1', ID_A, 'ก', 'ออมทรัพย์', ''],
      ['2', 'A-2', '1', ID_A, 'ก', 'ออมทรัพย์พิเศษ', ''],
    ]);
    expect(call('depositAccountImportStatus')).toEqual({
      ok: true,
      data: { rowCount: 2, memberCount: 1, importedAt: '2026-01-05T02:00:00.000Z' },
    });
  });
});
