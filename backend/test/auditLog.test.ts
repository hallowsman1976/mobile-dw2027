import { beforeEach, describe, expect, it } from 'vitest';
import { AUDIT_LOG_PAGE_SIZE } from '../../shared/api';
import { createScene, type Scene } from './helpers';

let scene: Scene;

function log(at: string, actor: string, action: string, target: string): void {
  scene.world.auditLog.push({ at, actor, action, target, detail: '' });
}

function entries(payload?: unknown, username?: string) {
  const res = scene.staff('listAuditLog', payload, username);
  if (!res.ok) throw new Error(res.error.message);
  return res.data as { entries: { at: string; actor: string; target: string }[]; nextOffset: number | null };
}

beforeEach(() => {
  scene = createScene();
  // 5 ม.ค. 2026 23:30 เวลาไทย = 16:30Z ยังเป็นวันที่ 5 ตามเวลาไทย
  log('2026-01-04T03:00:00.000Z', 'member:00123', 'submitDepositRequest', 'request:DP-2026-000001');
  log('2026-01-05T16:30:00.000Z', 'admin', 'viewDocument', 'request:DP-2026-000001');
  log('2026-01-05T17:30:00.000Z', 'checker', 'reviewRequest', 'request:WD-2026-000002');
  log('2026-01-07T02:00:00.000Z', 'admin', 'approveRequest', 'request:WD-2026-000002');
});

describe('audit log', () => {
  it('เรียงใหม่สุดก่อน', () => {
    expect(entries().entries.map((e) => e.at)).toEqual([
      '2026-01-07T02:00:00.000Z',
      '2026-01-05T17:30:00.000Z',
      '2026-01-05T16:30:00.000Z',
      '2026-01-04T03:00:00.000Z',
    ]);
  });

  it('กรองตามช่วงวันที่ตามเวลาไทย', () => {
    const result = entries({ fromDate: '2026-01-05', toDate: '2026-01-05' });
    expect(result.entries.map((e) => e.at)).toEqual(['2026-01-05T16:30:00.000Z']);
    expect(entries({ fromDate: '2026-01-06' }).entries.map((e) => e.at)).toEqual([
      '2026-01-07T02:00:00.000Z',
      '2026-01-05T17:30:00.000Z',
    ]);
  });

  it('ค้นตามผู้กระทำและเป้าหมายแบบบางส่วน ไม่สนตัวพิมพ์', () => {
    expect(entries({ actor: 'ADMIN' }).entries).toHaveLength(2);
    expect(entries({ target: 'wd-2026-000002' }).entries.map((e) => e.actor)).toEqual(['admin', 'checker']);
    expect(entries({ actor: 'member:00123', target: 'DP-' }).entries).toHaveLength(1);
  });

  it('แบ่งหน้าละ 50 รายการ', () => {
    for (let i = 0; i < AUDIT_LOG_PAGE_SIZE + 5; i++) {
      log(`2026-02-01T00:00:${String(i % 60).padStart(2, '0')}.000Z`, 'bulk', 'viewDocument', `request:X-${i}`);
    }
    const first = entries({ actor: 'bulk' });
    expect(first.entries).toHaveLength(AUDIT_LOG_PAGE_SIZE);
    expect(first.entries[0].target).toBe(`request:X-${AUDIT_LOG_PAGE_SIZE + 4}`);
    expect(first.nextOffset).toBe(AUDIT_LOG_PAGE_SIZE);

    const second = entries({ actor: 'bulk', offset: first.nextOffset });
    expect(second.entries.map((e) => e.target)).toEqual([4, 3, 2, 1, 0].map((i) => `request:X-${i}`));
    expect(second.nextOffset).toBeNull();
  });

  it('วันที่ไม่ถูกต้องหรือช่วงกลับด้านได้ข้อความภาษาไทย', () => {
    expect(scene.staff('listAuditLog', { fromDate: '2026-02-30' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: 'วันที่เริ่มต้นไม่ถูกต้อง' },
    });
    expect(scene.staff('listAuditLog', { fromDate: '2026-01-07', toDate: '2026-01-05' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
  });

  it('เฉพาะผู้ดูแลระบบ เจ้าหน้าที่อื่นและสมาชิกดูไม่ได้', () => {
    scene.addStaff('checker', ['reviewer', 'approver']);
    expect(scene.staff('listAuditLog', {}, 'checker')).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(scene.member('listAuditLog', {})).toMatchObject({ ok: false });
  });
});
