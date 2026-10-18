import type { ApiAuth, ApiResponse } from '../../shared/api';

/**
 * เรียกหลังบ้าน Apps Script ด้วย POST แบบ text/plain
 * เพื่อไม่ให้เบราว์เซอร์ส่ง CORS preflight ซึ่ง Apps Script ตอบไม่ได้
 */
export async function callApi<T>(
  gasUrl: string,
  action: string,
  auth?: ApiAuth,
  payload?: unknown,
): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, auth, payload }),
    });
    return (await res.json()) as ApiResponse<T>;
  } catch {
    return {
      ok: false,
      error: { code: 'INTERNAL', message: 'เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่อีกครั้ง' },
    };
  }
}
