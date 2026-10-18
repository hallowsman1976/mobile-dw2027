import type { LineIdentity, LineUser } from '../ports';

const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';

/** ตรวจ LIFF ID token กับ LINE โดยใช้ channel ID ของ LINE Login channel ที่ LIFF app อยู่ */
export function createGasLineIdentity(loginChannelId: string): LineIdentity {
  return {
    verifyIdToken(idToken: string): LineUser | null {
      const res = UrlFetchApp.fetch(VERIFY_URL, {
        method: 'post',
        payload: { id_token: idToken, client_id: loginChannelId },
        muteHttpExceptions: true,
      });
      const status = res.getResponseCode();
      // 400 = token ไม่ถูกต้องหรือหมดอายุ, อย่างอื่นถือเป็นระบบขัดข้อง
      if (status === 400) return null;
      if (status !== 200) {
        throw new Error(`LINE verify failed: HTTP ${status}`);
      }
      const body = JSON.parse(res.getContentText()) as { sub: string; name?: string };
      return { userId: body.sub, displayName: body.name ?? '' };
    },
  };
}
