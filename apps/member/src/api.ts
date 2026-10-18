// การยืนยันตัวตนผ่าน LIFF และการเรียกหลังบ้านของหน้าสมาชิก
import liff from '@line/liff';
import type { ApiResponse } from '../../../shared/api';
import { callApi } from '../../lib/apiClient';
import { requireEnv } from '../../lib/view';

const gasUrl = requireEnv('VITE_GAS_URL', import.meta.env.VITE_GAS_URL);

/** ตอนพัฒนาบนเครื่องใช้ token ทดลองแทน LIFF (ทำงานกับหลังบ้านจำลองเท่านั้น) */
const devIdToken = import.meta.env.DEV ? import.meta.env.VITE_DEV_ID_TOKEN : undefined;

let idToken = '';

/** คืน false ถ้ากำลังพาไปล็อกอิน LINE (หน้าเว็บจะถูกโหลดใหม่) */
export async function initLiff(): Promise<boolean> {
  if (devIdToken) {
    idToken = devIdToken;
    return true;
  }
  await liff.init({ liffId: requireEnv('VITE_LIFF_ID', import.meta.env.VITE_LIFF_ID) });
  if (!liff.isLoggedIn()) {
    // เปิดจากเบราว์เซอร์นอก LINE: ล็อกอิน LINE ก่อน แล้ว LINE จะพากลับมาหน้านี้
    liff.login({ redirectUri: location.href });
    return false;
  }
  idToken = liff.getIDToken() ?? '';
  if (!idToken) {
    throw new Error('ไม่ได้รับข้อมูลยืนยันตัวตนจาก LINE ผู้ดูแลระบบต้องเปิด scope openid ให้ LIFF app');
  }
  return true;
}

export function memberCall<T>(action: string, payload?: unknown): Promise<ApiResponse<T>> {
  return callApi<T>(gasUrl, action, { idToken }, payload);
}

/** ปิดหน้าต่าง LIFF (เปิดใหม่จาก LINE จะได้การยืนยันตัวตนใหม่) */
export function closeLiff(): void {
  if (devIdToken || !liff.isInClient()) {
    location.reload();
    return;
  }
  liff.closeWindow();
}
