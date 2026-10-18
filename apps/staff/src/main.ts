import '../../lib/base.css';
import type { PingResult } from '../../../shared/api';
import { callApi } from '../../lib/apiClient';
import { requireEnv, showStatus } from '../../lib/view';

async function start(): Promise<void> {
  const gasUrl = requireEnv('VITE_GAS_URL', import.meta.env.VITE_GAS_URL);

  const res = await callApi<PingResult>(gasUrl, 'ping');
  if (!res.ok) {
    showStatus([res.error.message], { error: true, retry: true });
    return;
  }
  const serverTime = new Date(res.data.serverTime).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
  });
  showStatus(['เชื่อมต่อหลังบ้านได้', `เวลาของหลังบ้าน: ${serverTime}`]);
}

start().catch((err: unknown) => {
  console.error(err);
  showStatus([err instanceof Error ? err.message : 'เปิดระบบไม่สำเร็จ'], { error: true, retry: true });
});
