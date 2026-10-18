// ตรวจไฟล์ที่สมาชิกแนบมาก่อนบันทึก
import type { UploadedFile } from '../../../shared/api';
import { AppError } from './errors';

/** ลายเซ็นไบต์แรกของไฟล์แต่ละชนิด กันไฟล์ที่ตั้งชื่อหรือ mimeType หลอก */
const SIGNATURES: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
};

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function validateUpload(
  value: unknown,
  label: string,
  allowedMimeTypes: readonly string[],
  maxBytes: number,
): UploadedFile {
  if (!value || typeof value !== 'object') {
    throw new AppError('VALIDATION', `กรุณาแนบ${label}`);
  }
  const file = value as Partial<UploadedFile>;
  const contentBase64 = typeof file.contentBase64 === 'string' ? file.contentBase64 : '';
  const mimeType = typeof file.mimeType === 'string' ? file.mimeType : '';
  if (!contentBase64) throw new AppError('VALIDATION', `กรุณาแนบ${label}`);

  if (!allowedMimeTypes.includes(mimeType) || !startsWith(contentBase64, SIGNATURES[mimeType] ?? [])) {
    throw new AppError('VALIDATION', `${label}ต้องเป็นไฟล์ ${describe(allowedMimeTypes)}`);
  }
  if (decodedLength(contentBase64) > maxBytes) {
    throw new AppError('VALIDATION', `${label}ใหญ่เกิน ${Math.round(maxBytes / 1024 / 1024)}MB`);
  }

  const fileName = (typeof file.fileName === 'string' ? file.fileName : '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .slice(0, 100);
  return { fileName: fileName || 'file', mimeType, contentBase64 };
}

function decodedLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function startsWith(base64: string, signature: number[]): boolean {
  if (signature.length === 0) return false;
  const bytes = decodePrefix(base64, signature.length);
  return signature.every((byte, i) => bytes[i] === byte);
}

/** ถอด base64 เฉพาะส่วนต้นพอให้ได้ count ไบต์ */
function decodePrefix(base64: string, count: number): number[] {
  const chars = base64.slice(0, Math.ceil(count / 3) * 4);
  const bytes: number[] = [];
  for (let i = 0; i < chars.length; i += 4) {
    const n = [0, 1, 2, 3].map((k) => BASE64_ALPHABET.indexOf(chars[i + k] ?? 'A'));
    if (n.some((x) => x < 0)) return [];
    const triple = (n[0] << 18) | (n[1] << 12) | (n[2] << 6) | n[3];
    bytes.push((triple >> 16) & 0xff, (triple >> 8) & 0xff, triple & 0xff);
  }
  return bytes.slice(0, count);
}

function describe(mimeTypes: readonly string[]): string {
  const names: Record<string, string> = {
    'image/jpeg': 'JPG',
    'image/png': 'PNG',
    'application/pdf': 'PDF',
  };
  return mimeTypes.map((m) => names[m] ?? m).join(', ');
}
