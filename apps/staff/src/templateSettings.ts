// ผู้ดูแลระบบ: เปิด Google Docs ต้นแบบใบถอนเงินเพื่อแก้รูปแบบ
import { h } from '../../lib/dom';
import { messageArea, showError, staffCall } from './session';

export function templateSettingsSection(): HTMLElement {
  const messages = messageArea();
  const open = h('button', { type: 'button', class: 'small' }, 'เปิดต้นแบบใน Google Docs');

  open.addEventListener('click', async () => {
    // เปิดแท็บก่อนเรียกหลังบ้าน เพื่อไม่ให้เบราว์เซอร์บล็อก popup
    const tab = window.open('', '_blank');
    const res = await staffCall<{ url: string }>('withdrawalTemplate');
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
  });

  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'ต้นแบบใบถอนเงิน (PDF)'),
    h(
      'p',
      { class: 'hint' },
      'ระบบสร้าง PDF ใบถอนเงินจาก Google Docs ต้นแบบเมื่อคำขอได้รับอนุมัติ ต้นแบบเริ่มต้นเป็นแบบชั่วคราว แก้ให้ตรงกับแบบฟอร์มของสหกรณ์ได้ โดยคงตัวแปร {{...}} ไว้ เปิดได้ด้วยบัญชี Google ที่เป็นเจ้าของระบบ',
    ),
    messages.element,
    open,
  );
}
