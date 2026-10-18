// วันทำการที่จะดำเนินการคำขอ (spec: วันทำการ)
import type { Deps } from '../adapters/ports';

export const SETTING_CUTOFF_TIME = 'cutoffTime';
const DEFAULT_CUTOFF = '15:30';

/**
 * ยื่นหลังเวลาตัดรอบ หรือในวันเสาร์ อาทิตย์ หรือวันหยุดของสหกรณ์ → วันทำการถัดไป
 * ไม่อย่างนั้นคือวันที่ยื่น ทุกอย่างคิดตามเวลาไทย คืน YYYY-MM-DD
 */
export function processingDateFor(submittedAt: Date, deps: Deps): string {
  const holidays = new Set(deps.data.listHolidays().map((h) => h.date));
  const cutoff = parseCutoff(deps.data.getSetting(SETTING_CUTOFF_TIME) || DEFAULT_CUTOFF);

  const bangkok = new Date(submittedAt.getTime() + 7 * 60 * 60_000);
  const today = bangkok.toISOString().slice(0, 10);
  const minutes = bangkok.getUTCHours() * 60 + bangkok.getUTCMinutes();

  if (isBusinessDay(today, holidays) && minutes < cutoff) return today;
  let day = today;
  do {
    day = addDays(day, 1);
  } while (!isBusinessDay(day, holidays));
  return day;
}

/** วันที่ตามเวลาไทย YYYY-MM-DD */
export function bangkokDate(date: Date): string {
  return new Date(date.getTime() + 7 * 60 * 60_000).toISOString().slice(0, 10);
}

function isBusinessDay(ymd: string, holidays: Set<string>): boolean {
  const weekday = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidays.has(ymd);
}

function addDays(ymd: string, days: number): string {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function parseCutoff(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return parseCutoff(DEFAULT_CUTOFF);
  return Number(match[1]) * 60 + Number(match[2]);
}
