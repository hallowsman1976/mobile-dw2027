// ผู้ดูแลระบบเปิดดู audit log: ใครเปิดดูเอกสารใด และใครเปลี่ยนสถานะอะไรเมื่อไร
import { AUDIT_LOG_PAGE_SIZE, type ApiAuth, type AuditLogEntry, type ListAuditLogResult } from '../../../shared/api';
import type { Deps } from '../adapters/ports';
import { bangkokDate } from './businessDays';
import { AppError } from './errors';
import { requireStaff } from './staff';
import { requirePayload, requireYmd } from './validate';

export function listAuditLog(input: { auth?: ApiAuth; payload?: unknown }, deps: Deps): ListAuditLogResult {
  requireStaff(input.auth, deps, 'systemAdministrator');
  const payload = input.payload === undefined ? {} : requirePayload(input.payload);
  const fromDate = optionalDate(payload.fromDate, 'วันที่เริ่มต้น');
  const toDate = optionalDate(payload.toDate, 'วันที่สิ้นสุด');
  if (fromDate && toDate && fromDate > toDate) {
    throw new AppError('VALIDATION', 'วันที่เริ่มต้นต้องไม่หลังวันที่สิ้นสุด');
  }
  const actor = optionalText(payload.actor);
  const target = optionalText(payload.target);
  const offset = payload.offset === undefined ? 0 : Number(payload.offset);
  if (!Number.isInteger(offset) || offset < 0) throw new AppError('BAD_REQUEST', 'รูปแบบคำขอไม่ถูกต้อง');

  const entries: AuditLogEntry[] = [];
  let skipped = 0;
  let hasMore = false;
  deps.data.scanAuditLogNewestFirst((entry) => {
    const day = bangkokDate(new Date(entry.at));
    if (toDate && day > toDate) return true;
    // log เรียงตามเวลา เมื่อเลยวันที่เริ่มต้นไปแล้วไม่ต้องอ่านต่อ
    if (fromDate && day < fromDate) return false;
    if (actor && !entry.actor.toLowerCase().includes(actor)) return true;
    if (target && !entry.target.toLowerCase().includes(target)) return true;
    if (skipped < offset) {
      skipped++;
      return true;
    }
    if (entries.length === AUDIT_LOG_PAGE_SIZE) {
      hasMore = true;
      return false;
    }
    entries.push(entry);
    return true;
  });
  return { entries, nextOffset: hasMore ? offset + AUDIT_LOG_PAGE_SIZE : null };
}

function optionalDate(value: unknown, label: string): string {
  if (value === undefined || value === '') return '';
  return requireYmd(value, `${label}ไม่ถูกต้อง`);
}

function optionalText(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
