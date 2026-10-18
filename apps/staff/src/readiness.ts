// ผู้ดูแลระบบ: เช็กลิสต์ความพร้อมก่อนเปิดให้สมาชิกใช้
import type { ReadinessItem } from '../../../shared/api';
import { h } from '../../lib/dom';
import { messageArea, showError, staffCall } from './session';

const LEVEL_LABELS: Record<ReadinessItem['level'], { text: string; badge: string }> = {
  ok: { text: 'ผ่าน', badge: 'badge' },
  warn: { text: 'ควรแก้', badge: 'badge warn' },
  fail: { text: 'ต้องแก้', badge: 'badge status-rejected' },
};

export function readinessSection(): HTMLElement {
  const messages = messageArea();
  const listSlot = h('div', {}, h('p', {}, 'กำลังตรวจ…'));

  async function load(): Promise<void> {
    const res = await staffCall<ReadinessItem[]>('systemReadiness');
    if (!res.ok) return showError(res, messages.show);
    listSlot.replaceChildren(
      h(
        'table',
        { class: 'compact' },
        h(
          'tbody',
          {},
          ...res.data.map((item) =>
            h(
              'tr',
              {},
              h('td', {}, h('span', { class: LEVEL_LABELS[item.level].badge }, LEVEL_LABELS[item.level].text)),
              h('td', {}, item.item),
              h('td', { class: 'detail' }, item.detail),
            ),
          ),
        ),
      ),
    );
  }

  void load();

  return h(
    'section',
    { class: 'card' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', {}, 'ความพร้อมก่อนเปิดใช้'),
      h('button', { type: 'button', class: 'secondary small', onClick: () => void load() }, 'ตรวจอีกครั้ง'),
    ),
    h('p', { class: 'hint' }, 'Script Properties และ trigger ตรวจใน Apps Script editor ด้วยฟังก์ชัน checkScriptProperties'),
    messages.element,
    listSlot,
  );
}
