import type { ApiRequest, ApiResponse } from '../../../shared/api';
import type { Deps } from '../adapters/ports';
import { actions } from './actions';
import { AppError } from './errors';

/**
 * ตัวรับคำสั่งหลัก: รับ body ดิบจาก doPost แล้วคืน response
 * เป็นจุดทดสอบเดียวของหลังบ้าน (ดู Testing Decisions ใน spec)
 */
export function handleRequestBody(body: string, deps: Deps): ApiResponse<unknown> {
  let request: ApiRequest;
  try {
    request = JSON.parse(body) as ApiRequest;
  } catch {
    return fail(new AppError('BAD_REQUEST', 'รูปแบบคำขอไม่ถูกต้อง'));
  }
  if (!request || typeof request.action !== 'string') {
    return fail(new AppError('BAD_REQUEST', 'รูปแบบคำขอไม่ถูกต้อง'));
  }

  const handler = Object.prototype.hasOwnProperty.call(actions, request.action)
    ? actions[request.action]
    : undefined;
  if (!handler) {
    return fail(new AppError('UNKNOWN_ACTION', 'ไม่รู้จักคำสั่งนี้'));
  }

  try {
    return { ok: true, data: handler({ auth: request.auth, payload: request.payload }, deps) };
  } catch (err) {
    if (err instanceof AppError) return fail(err);
    console.error(err);
    return fail(new AppError('INTERNAL', 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง'));
  }
}

function fail(err: AppError): ApiResponse<never> {
  return { ok: false, error: { code: err.code, message: err.message } };
}
