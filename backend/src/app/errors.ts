import type { ErrorCode } from '../../../shared/api';

/** error ที่ตั้งใจส่งกลับให้ผู้ใช้ message เป็นภาษาไทยที่แสดงได้ทันที */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}
