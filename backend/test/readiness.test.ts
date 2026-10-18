import { beforeEach, describe, expect, it } from 'vitest';
import type { ReadinessItem } from '../../shared/api';
import { createScene, type Scene } from './helpers';

let scene: Scene;

function items(): Record<string, ReadinessItem> {
  const res = scene.staff('systemReadiness');
  if (!res.ok) throw new Error(res.error.message);
  return Object.fromEntries((res.data as ReadinessItem[]).map((i) => [i.item, i]));
}

beforeEach(() => {
  scene = createScene();
});

describe('ความพร้อมก่อนเปิดใช้', () => {
  it('ฉากเริ่มต้นยังไม่พร้อม: ไม่มีบัญชีรับโอน ผู้ตรวจและผู้อนุมัติเป็นคนเดียวกัน นโยบายยังเป็นร่าง', () => {
    const result = items();
    expect(result['บัญชีรับโอนของสหกรณ์'].level).toBe('fail');
    expect(result['ผู้ตรวจและผู้อนุมัติ'].level).toBe('fail');
    expect(result['นโยบายความเป็นส่วนตัว'].level).toBe('fail');
    expect(result['กลุ่มแจ้งเตือนเจ้าหน้าที่'].level).toBe('ok');
    expect(result['ข้อมูลบัญชีเงินฝาก']).toMatchObject({ level: 'ok', detail: expect.stringContaining('3 บัญชี') });
    expect(result['วันหยุดของสหกรณ์ปี 2026'].level).toBe('warn');
    expect(result['ระยะเวลาเก็บเอกสาร'].level).toBe('warn');
  });

  it('ผ่านเมื่อตั้งค่าครบ และเตือนเมื่อแต่ละบทบาทมีคนเดียว', () => {
    scene.world.settings.set('coopReceivingAccount', '987-6-54321-0');
    scene.world.settings.set('documentRetentionYears', '10');
    scene.world.holidays.push({ date: '2026-04-13', name: 'สงกรานต์' });
    scene.addStaff('checker', ['reviewer']);

    let result = items();
    expect(result['บัญชีรับโอนของสหกรณ์']).toEqual({ item: 'บัญชีรับโอนของสหกรณ์', level: 'ok', detail: 'ลงท้าย 3210' });
    expect(result['ผู้ตรวจและผู้อนุมัติ']).toMatchObject({ level: 'warn', detail: expect.stringContaining('ผู้ตรวจ 2 คน ผู้อนุมัติ 1 คน') });
    expect(result['วันหยุดของสหกรณ์ปี 2026'].level).toBe('ok');
    expect(result['ระยะเวลาเก็บเอกสาร'].level).toBe('ok');

    scene.addStaff('boss', ['approver']);
    result = items();
    expect(result['ผู้ตรวจและผู้อนุมัติ'].level).toBe('ok');
  });

  it('เฉพาะผู้ดูแลระบบ', () => {
    scene.addStaff('checker', ['reviewer']);
    expect(scene.staff('systemReadiness', undefined, 'checker')).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });
});
