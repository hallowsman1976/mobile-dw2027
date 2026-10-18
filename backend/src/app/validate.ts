import { AppError } from './errors';

export function requirePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError('BAD_REQUEST', 'รูปแบบคำขอไม่ถูกต้อง');
  }
  return payload as Record<string, unknown>;
}

export function requireString(value: unknown, fieldLabel: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError('VALIDATION', `กรุณากรอก${fieldLabel}`);
  }
  return value;
}

/** วันที่ YYYY-MM-DD (ค.ศ.) ที่มีอยู่จริง ไม่อย่างนั้นโยน VALIDATION ด้วยข้อความที่ให้มา */
export function requireYmd(value: unknown, message: string): string {
  const date = typeof value === 'string' ? value.trim() : '';
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new AppError('VALIDATION', message);
  }
  return date;
}

/** แสดงเวลาแบบ HH:MM ตามเวลาไทย โดยไม่พึ่ง Intl ซึ่ง Apps Script รองรับไม่ครบ */
export function formatBangkokTime(date: Date): string {
  const bangkok = new Date(date.getTime() + 7 * 60 * 60_000);
  const hh = String(bangkok.getUTCHours()).padStart(2, '0');
  const mm = String(bangkok.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
