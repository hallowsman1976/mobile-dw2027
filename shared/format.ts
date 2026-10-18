// รูปแบบตัวเลขและวันที่ภาษาไทย เขียนเองแทน Intl เพราะ Apps Script รองรับ Intl ไม่ครบ

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** 1500 → "1,500.00" */
export function formatBaht(amount: number): string {
  const [whole, fraction] = (Math.round(amount * 100) / 100).toFixed(2).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}

const DIGITS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const POSITIONS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

/** 1500.5 → "หนึ่งพันห้าร้อยบาทห้าสิบสตางค์", 100 → "หนึ่งร้อยบาทถ้วน" */
export function bahtText(amount: number): string {
  const satangTotal = Math.round(amount * 100);
  const baht = Math.floor(satangTotal / 100);
  const satang = satangTotal % 100;
  const bahtWords = baht === 0 ? (satang === 0 ? 'ศูนย์' : '') : numberWords(baht);
  return `${bahtWords ? `${bahtWords}บาท` : ''}${satang === 0 ? 'ถ้วน' : `${numberWords(satang)}สตางค์`}`;
}

/** ตัวเลขเป็นคำอ่านภาษาไทย รองรับหลักล้านขึ้นไปด้วยการวนซ้ำ */
function numberWords(n: number): string {
  if (n >= 1_000_000) {
    return `${numberWords(Math.floor(n / 1_000_000))}ล้าน${n % 1_000_000 ? numberWords(n % 1_000_000) : ''}`;
  }
  const digits = String(n).split('').map(Number);
  return digits
    .map((digit, i) => {
      const position = digits.length - 1 - i;
      if (digit === 0) return '';
      if (position === 0 && digit === 1 && digits.length > 1) return 'เอ็ด';
      if (position === 1 && digit === 1) return 'สิบ';
      if (position === 1 && digit === 2) return 'ยี่สิบ';
      return DIGITS[digit] + POSITIONS[position];
    })
    .join('');
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
