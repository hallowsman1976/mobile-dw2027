import liff from '@line/liff';
import '../../lib/base.css';
import type { MeResult } from '../../../shared/api';
import { callApi } from '../../lib/apiClient';
import { requireEnv, showStatus } from '../../lib/view';

async function start(): Promise<void> {
  const liffId = requireEnv('VITE_LIFF_ID', import.meta.env.VITE_LIFF_ID);
  const gasUrl = requireEnv('VITE_GAS_URL', import.meta.env.VITE_GAS_URL);

  await liff.init({ liffId });
  if (!liff.isLoggedIn()) {
    // เปิดจากเบราว์เซอร์นอก LINE: ให้ล็อกอิน LINE ก่อน แล้ว LINE จะพากลับมาหน้านี้
    liff.login();
    return;
  }

  const idToken = liff.getIDToken();
  if (!idToken) {
    showStatus(['ไม่ได้รับข้อมูลยืนยันตัวตนจาก LINE', 'ผู้ดูแลระบบต้องเปิด scope openid ให้ LIFF app'], {
      error: true,
    });
    return;
  }

  const res = await callApi<MeResult>(gasUrl, 'me', { idToken });
  if (!res.ok) {
    showStatus([res.error.message], { error: true, retry: true });
    return;
  }

  const me = res.data;
  showStatus(
    me.bound
      ? [`สวัสดี ${me.displayName}`, `รหัสสมาชิก ${me.memberCode}`]
      : [`สวัสดี ${me.displayName}`, 'ยังไม่ผูกบัญชี'],
  );
}

start().catch((err: unknown) => {
  console.error(err);
  showStatus([err instanceof Error ? err.message : 'เปิดระบบไม่สำเร็จ'], { error: true, retry: true });
});
