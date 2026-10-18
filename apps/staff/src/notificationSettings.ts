// ผู้ดูแลระบบ: เลือกกลุ่ม LINE ที่รับแจ้งเตือน และลิงก์หน้าเว็บเจ้าหน้าที่ที่แนบท้ายข้อความ
import type { LineGroupSettings } from '../../../shared/api';
import { h } from '../../lib/dom';
import { formatThaiDateTime, messageArea, showError, staffCall } from './session';

export function notificationSettingsSection(): HTMLElement {
  const messages = messageArea();
  const body = h('div', {}, h('p', {}, 'กำลังโหลด…'));

  async function load(): Promise<void> {
    const res = await staffCall<LineGroupSettings>('lineGroupSettings');
    if (!res.ok) return showError(res, messages.show);
    body.replaceChildren(form(res.data));
  }

  async function save(payload: Record<string, string>, success: string): Promise<void> {
    const res = await staffCall<LineGroupSettings>('updateNotificationSettings', payload);
    if (!res.ok) return showError(res, messages.show);
    messages.show(success);
    body.replaceChildren(form(res.data));
  }

  function form(settings: LineGroupSettings): HTMLElement {
    const group = h(
      'select',
      {},
      h('option', { value: '' }, '— ไม่ส่งแจ้งเตือนเข้ากลุ่ม —'),
      ...settings.groups.map((g) =>
        h(
          'option',
          { value: g.groupId, selected: g.groupId === settings.staffGroupId },
          `${g.groupName || 'กลุ่มไม่ทราบชื่อ'} (เชิญเมื่อ ${formatThaiDateTime(g.joinedAt)})`,
        ),
      ),
    );
    const url = h('input', { type: 'text', value: settings.staffWebUrl, placeholder: 'https://…' });

    return h(
      'div',
      { class: 'stack' },
      h(
        'p',
        { class: 'hint' },
        'เชิญ LINE OA ของสหกรณ์เข้ากลุ่ม LINE ของเจ้าหน้าที่ก่อน กลุ่มจะปรากฏในรายการนี้ เมื่อบันทึก ระบบจะส่งข้อความทดสอบเข้ากลุ่ม',
      ),
      h('label', {}, 'กลุ่มที่รับแจ้งเตือนคำขอใหม่', group),
      h(
        'button',
        { type: 'button', class: 'small', onClick: () => void save({ staffGroupId: group.value }, 'บันทึกกลุ่มแจ้งเตือนแล้ว') },
        'บันทึกกลุ่ม',
      ),
      h('label', {}, 'ลิงก์หน้าเว็บเจ้าหน้าที่ (แนบท้ายข้อความแจ้งเตือน)', url),
      h(
        'button',
        { type: 'button', class: 'small', onClick: () => void save({ staffWebUrl: url.value }, 'บันทึกลิงก์แล้ว') },
        'บันทึกลิงก์',
      ),
    );
  }

  void load();

  return h('section', { class: 'card' }, h('h2', {}, 'การแจ้งเตือนผ่าน LINE'), messages.element, body);
}
