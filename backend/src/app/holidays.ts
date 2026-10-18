// วันหยุดของสหกรณ์ ใช้คำนวณวันทำการ (ticket 07)
import type { ApiAuth, Holiday } from '../../../shared/api';
import type { Deps } from '../adapters/ports';
import { requireStaff } from './staff';
import { requirePayload, requireString, requireYmd } from './validate';

export function listHolidays(input: { auth?: ApiAuth }, deps: Deps): Holiday[] {
  requireStaff(input.auth, deps);
  return deps.data.listHolidays().sort((a, b) => a.date.localeCompare(b.date));
}

export function addHoliday(input: { auth?: ApiAuth; payload?: unknown }, deps: Deps): Holiday[] {
  const staff = requireStaff(input.auth, deps, 'systemAdministrator');
  const payload = requirePayload(input.payload);
  const date = requireDate(payload.date);
  const name = requireString(payload.name, 'ชื่อวันหยุด').trim().slice(0, 100);

  deps.data.withLock(() => {
    deps.data.saveHoliday({ date, name });
    deps.data.appendAuditLog({ at: deps.clock.now().toISOString(), actor: staff.username, action: 'addHoliday', target: date, detail: name });
  });
  return listHolidays(input, deps);
}

export function removeHoliday(input: { auth?: ApiAuth; payload?: unknown }, deps: Deps): Holiday[] {
  const staff = requireStaff(input.auth, deps, 'systemAdministrator');
  const date = requireDate(requirePayload(input.payload).date);

  deps.data.withLock(() => {
    deps.data.deleteHoliday(date);
    deps.data.appendAuditLog({ at: deps.clock.now().toISOString(), actor: staff.username, action: 'removeHoliday', target: date, detail: '' });
  });
  return listHolidays(input, deps);
}

function requireDate(value: unknown): string {
  return requireYmd(value, 'วันที่ต้องอยู่ในรูปแบบ ปปปป-ดด-วว (ค.ศ.)');
}
