// ผู้ดูแลระบบ: เปิด Google Docs ต้นแบบใบถอนเงินเพื่อแก้รูปแบบ
import { h } from '../../lib/dom';
import { messageArea, showError, staffCall } from './session';

export function templateSettingsSection(): HTMLElement {
  const messages = messageArea();
  const open = h('button', { type: 'button', class: 'small' }, 'เปิดต้นแบบใน Google Docs');
  const reset = h('button', { type: 'button', class: 'small secondary' }, 'สร้างต้นแบบใหม่ตามแบบฟอร์มสหกรณ์');

  open.addEventListener('click', () => void openTemplate('withdrawalTemplate'));
  reset.addEventListener('click', () => {
    if (!confirm('สร้างต้นแบบใหม่ตามแบบฟอร์มใบถอนเงินออนไลน์ของสหกรณ์? ต้นแบบเดิมจะถูกเปลี่ยนชื่อเป็นเลิกใช้ (ไม่ลบ) และ PDF ที่สร้างหลังจากนี้ใช้ต้นแบบใหม่')) return;
    void openTemplate('resetWithdrawalTemplate');
  });

  async function openTemplate(action: 'withdrawalTemplate' | 'resetWithdrawalTemplate'): Promise<void> {
    // เปิดแท็บก่อนเรียกหลังบ้าน เพื่อไม่ให้เบราว์เซอร์บล็อก popup
    const tab = window.open('', '_blank');
    const res = await staffCall<{ url: string }>(action);
    if (!res.ok) {
      tab?.close();
      return showError(res, messages.show);
    }
    if (tab) {
      tab.opener = null;
      tab.location.href = res.data.url;
    } else {
      messages.show(`เปิดลิงก์นี้: ${res.data.url}`);
    }
  }

  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'ต้นแบบใบถอนเงิน (PDF)'),
    h(
      'p',
      { class: 'hint' },
      'ระบบสร้าง PDF ใบถอนเงินจาก Google Docs ต้นแบบเมื่อคำขอได้รับอนุมัติ ต้นแบบเริ่มต้นจัดตามแบบฟอร์มใบถอนเงินออนไลน์ของสหกรณ์ แก้รูปแบบได้โดยคงตัวแปร {{...}} ไว้ เปิดได้ด้วยบัญชี Google ที่เป็นเจ้าของระบบ ระบบที่ติดตั้งก่อนมีแบบฟอร์มนี้ให้กด "สร้างต้นแบบใหม่" หนึ่งครั้ง',
    ),
    messages.element,
    h('div', { class: 'row-actions' }, open, reset),
  );
}
