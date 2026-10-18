// กฎของรหัสและเลขที่ใช้ร่วมกันหลายส่วนของระบบ

/**
 * รหัสสมาชิก: ตัดช่องว่าง รับเฉพาะตัวเลข 1–5 หลัก แล้วเติม 0 ข้างหน้าให้ครบ 5 หลัก
 * คืน null ถ้าไม่ใช่รหัสสมาชิกที่ถูกต้อง
 */
export function normalizeMemberCode(value: string): string | null {
  const digits = value.trim();
  if (!/^\d{1,5}$/.test(digits)) return null;
  return digits.padStart(5, '0');
}

/** เลขบัตรประชาชน: ตัดขีดและช่องว่าง ต้องมี 13 หลักและหลักสุดท้ายตรงกับ checksum คืน null ถ้าไม่ถูกต้อง */
export function normalizeNationalId(value: string): string | null {
  const digits = value.replace(/[\s-]/g, '');
  if (!/^\d{13}$/.test(digits)) return null;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (13 - i);
  const check = (11 - (sum % 11)) % 10;
  return check === Number(digits[12]) ? digits : null;
}
