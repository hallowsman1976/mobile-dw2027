// ตรวจสลิปของคำขอฝากเงินด้วย SlipOK (ticket 08)
import {
  DEPOSIT_MIN_AMOUNT,
  DOCUMENT_MAX_BYTES,
  SLIP_MIME_TYPES,
  type ApiAuth,
  type CheckSlipResult,
  type UploadedFile,
} from '../../../shared/api';
import { formatBaht, formatThaiDateTimeFromIso } from '../../../shared/format';
import type { Deps, SlipReading } from '../adapters/ports';
import { AppError } from './errors';
import { requireMember } from './members';
import { hashToken } from './secrets';
import { validateUpload } from './uploads';
import { requirePayload, requireString } from './validate';
import { validateAmount } from './requests';

/** เลขบัญชีรับโอนของสหกรณ์ (ตัวเลขล้วน) และรหัสธนาคาร ตั้งในชีตตั้งค่า */
export const SETTING_COOP_ACCOUNT = 'coopReceivingAccount';
export const SETTING_COOP_BANK_CODE = 'coopReceivingBankCode';
const DEFAULT_BANK_CODE = '006'; // ธนาคารกรุงไทย

const TIME_TOLERANCE_MS = 10 * 60_000;
const CLOCK_SKEW_MS = 5 * 60_000;
const CACHE_TTL_SECONDS = 30 * 60;

export type SlipAssessment =
  | { kind: 'unverified' }
  | { kind: 'valid'; reading: SlipReading }
  | { kind: 'mismatch'; reading: SlipReading };

/** สมาชิกตรวจสลิปก่อนยื่น ไม่สร้างคำขอ */
export function checkSlip(input: { auth?: ApiAuth; payload?: unknown }, deps: Deps): CheckSlipResult {
  requireMember(input.auth, deps);
  const payload = requirePayload(input.payload);
  const slip = validateSlip(payload.slip);
  const amount = validateAmount(payload.amount, DEPOSIT_MIN_AMOUNT);
  const transferredAt = parseTransferredAt(payload.transferredAt, deps.clock.now());

  const assessment = assessSlip(readSlip(slip, deps), amount, transferredAt, deps);
  if (assessment.kind === 'unverified') return { status: 'unverified' };
  if (assessment.kind === 'valid') return { status: 'valid' };
  return {
    status: 'mismatch',
    slipAmount: assessment.reading.amount,
    slipTransferredAt: assessment.reading.transferredAt,
  };
}

export function validateSlip(value: unknown): UploadedFile {
  return validateUpload(value, 'สลิปการโอนเงิน', SLIP_MIME_TYPES, DOCUMENT_MAX_BYTES);
}

/** เวลาโอนเป็น epoch ms ต้องไม่อยู่ในอนาคต (ยอมนาฬิกาคลาดได้ 5 นาที) */
export function parseTransferredAt(value: unknown, now: Date): number {
  const transferredAt = Date.parse(requireString(value, 'วันเวลาที่โอน'));
  if (Number.isNaN(transferredAt)) throw new AppError('VALIDATION', 'วันเวลาที่โอนไม่ถูกต้อง');
  if (transferredAt > now.getTime() + CLOCK_SKEW_MS) {
    throw new AppError('VALIDATION', 'วันเวลาที่โอนต้องไม่อยู่ในอนาคต');
  }
  return transferredAt;
}

/**
 * อ่านสลิปผ่าน SlipOK โดยเก็บผลไว้ 30 นาทีตามแฮชของไฟล์
 * เพื่อให้ checkSlip แล้ว submitDepositRequest ด้วยสลิปเดิมไม่ต้องเรียก SlipOK ซ้ำ
 * ผลที่อ่านไม่ได้ไม่เก็บ เพื่อให้ลองใหม่ได้เมื่อบริการกลับมา
 */
export function readSlip(slip: UploadedFile, deps: Deps): SlipReading | null {
  const key = `slip:${hashToken(slip.contentBase64)}`;
  const cached = deps.data.getCache(key);
  if (cached) return JSON.parse(cached) as SlipReading;
  let reading: SlipReading | null;
  try {
    reading = deps.slips.read(slip.contentBase64, slip.mimeType);
  } catch (err) {
    console.error(err);
    reading = null;
  }
  if (reading) deps.data.putCache(key, JSON.stringify(reading), CACHE_TTL_SECONDS);
  return reading;
}

/**
 * ประเมินสลิปเทียบกับคำขอ: ผู้รับไม่ใช่บัญชีสหกรณ์ หรือสลิปเคยใช้แล้ว → ไม่รับ (throw)
 * ยอดหรือเวลาไม่ตรง → mismatch ตรงทุกอย่าง → valid อ่านไม่ได้หรือยังไม่ตั้งบัญชีสหกรณ์ → unverified
 * การตรวจสลิปซ้ำต้องเรียกภายใน withLock ตอนสร้างคำขอ
 */
export function assessSlip(
  reading: SlipReading | null,
  amount: number,
  transferredAt: number,
  deps: Deps,
): SlipAssessment {
  const coopAccount = deps.data.getSetting(SETTING_COOP_ACCOUNT).replace(/\D/g, '');
  if (!reading || !coopAccount) return { kind: 'unverified' };

  const coopBank = deps.data.getSetting(SETTING_COOP_BANK_CODE) || DEFAULT_BANK_CODE;
  if (reading.receiverBankCode !== coopBank || !maskedAccountMatches(reading.receiverAccount, coopAccount)) {
    throw new AppError(
      'VALIDATION',
      `สลิปนี้ไม่ได้โอนเข้าบัญชีของสหกรณ์ (ผู้รับในสลิป: ${reading.receiverName || '-'} ${reading.receiverAccount}) กรุณาตรวจว่าเลือกสลิปถูกต้อง`,
    );
  }

  const used = deps.data
    .listRequests()
    .find((r) => r.slipRef === reading.transRef && r.status !== 'cancelled' && r.status !== 'rejected');
  if (used) {
    throw new AppError('CONFLICT', `สลิปนี้เคยใช้แจ้งฝากเงินแล้ว (คำขอ ${used.requestNumber})`);
  }

  const amountMatches = Math.abs(reading.amount - amount) < 0.005;
  const timeMatches = Math.abs(Date.parse(reading.transferredAt) - transferredAt) <= TIME_TOLERANCE_MS;
  return amountMatches && timeMatches ? { kind: 'valid', reading } : { kind: 'mismatch', reading };
}

export function mismatchError(reading: SlipReading): AppError {
  return new AppError(
    'VALIDATION',
    `ยอดเงินหรือเวลาที่โอนไม่ตรงกับสลิป (สลิป: ${formatBaht(reading.amount)} บาท เวลา ${formatThaiDateTimeFromIso(reading.transferredAt)}) กรุณาตรวจอีกครั้ง`,
  );
}

/** เทียบเลขบัญชีที่ธนาคารปิดบางหลัก (x) กับเลขบัญชีจริง โดยไม่สนขีด */
export function maskedAccountMatches(masked: string, account: string): boolean {
  const shown = masked.replace(/[-\s]/g, '').toLowerCase();
  const actual = account.replace(/\D/g, '');
  if (shown.length !== actual.length || !/\d/.test(shown)) return false;
  return [...shown].every((char, i) => char === 'x' || char === actual[i]);
}
