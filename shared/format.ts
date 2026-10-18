// รูปแบบตัวเลขและวันที่ภาษาไทย เขียนเองแทน Intl เพราะ Apps Script รองรับ Intl ไม่ครบ

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** 1500 → "1,500.00" */
export function formatBaht(amount: number): string {
  const [whole, fraction] = (Math.round(amount * 100) / 100).toFixed(2).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}

/** "2026-01-06" → "6 ม.ค. 2569" */
export function formatThaiDate(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  if (!year || !month || !day) return ymd;
  return `${day} ${THAI_MONTHS[month - 1]} ${year + 543}`;
}

/** เวลา ISO → "6 ม.ค. 2569 14:05" ตามเวลาไทย */
export function formatThaiDateTimeFromIso(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return iso;
  const bangkok = new Date(time + 7 * 60 * 60_000);
  const ymd = bangkok.toISOString().slice(0, 10);
  const hh = String(bangkok.getUTCHours()).padStart(2, '0');
  const mm = String(bangkok.getUTCMinutes()).padStart(2, '0');
  return `${formatThaiDate(ymd)} ${hh}:${mm}`;
}
