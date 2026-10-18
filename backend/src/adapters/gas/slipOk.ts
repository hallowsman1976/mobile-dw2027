import type { SlipReading, SlipVerifier } from '../ports';

type SlipOkResponse = {
  success?: boolean;
  code?: number;
  message?: string;
  data?: {
    transRef?: string;
    transDate?: string; // YYYYMMDD เวลาไทย
    transTime?: string; // HH:mm:ss
    amount?: number;
    receivingBank?: string;
    receiver?: {
      displayName?: string;
      name?: string;
      account?: { value?: string };
    };
  };
};

/**
 * อ่านสลิปผ่าน SlipOK (https://slipok.com) ด้วยไฟล์รูป
 * ไม่ส่ง log: true เพราะระบบตรวจสลิปซ้ำเอง และการตรวจก่อนยื่นต้องไม่ทำให้สลิปถูกนับว่าใช้แล้ว
 * คืน null เมื่อยังไม่ได้ตั้งค่า บริการไม่ตอบ อ่าน QR ไม่ได้ หรือสลิปไม่มีเลขบัญชีผู้รับ
 */
export function createSlipOkVerifier(config: () => { apiKey: string; branchId: string } | null): SlipVerifier {
  return {
    read(imageBase64: string, mimeType: string): SlipReading | null {
      const settings = config();
      if (!settings) return null;

      const res = UrlFetchApp.fetch(
        `https://api.slipok.com/api/line/apikey/${encodeURIComponent(settings.branchId)}`,
        {
          method: 'post',
          headers: { 'x-authorization': settings.apiKey },
          payload: { files: Utilities.newBlob(Utilities.base64Decode(imageBase64), mimeType, 'slip') },
          muteHttpExceptions: true,
        },
      );
      let body: SlipOkResponse;
      try {
        body = JSON.parse(res.getContentText()) as SlipOkResponse;
      } catch {
        console.error(`SlipOK HTTP ${res.getResponseCode()}: not JSON`);
        return null;
      }
      const data = body.data;
      if (res.getResponseCode() !== 200 || !body.success || !data) {
        console.warn(`SlipOK HTTP ${res.getResponseCode()} code ${body.code}: ${body.message}`);
        return null;
      }

      const account = data.receiver?.account?.value ?? '';
      const date = data.transDate ?? '';
      if (!data.transRef || !account || !/^\d{8}$/.test(date) || typeof data.amount !== 'number') return null;

      return {
        transRef: data.transRef,
        transferredAt: new Date(
          `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${data.transTime ?? '00:00:00'}+07:00`,
        ).toISOString(),
        amount: data.amount,
        receiverBankCode: data.receivingBank ?? '',
        receiverAccount: account,
        receiverName: data.receiver?.displayName || data.receiver?.name || '',
      };
    },
  };
}
