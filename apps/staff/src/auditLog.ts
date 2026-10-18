// ผู้ดูแลระบบ: audit log ว่าใครเปิดดูเอกสารใด และใครเปลี่ยนสถานะอะไรเมื่อไร
import { AUDIT_ACTION_LABELS, type AuditLogEntry, type ListAuditLogPayload, type ListAuditLogResult } from '../../../shared/api';
import { formatThaiDateTimeFromIso } from '../../../shared/format';
import { h } from '../../lib/dom';
import { messageArea, showError, staffCall } from './session';

export function auditLogSection(): HTMLElement {
  const messages = messageArea();
  const fromDate = h('input', { type: 'date' });
  const toDate = h('input', { type: 'date' });
  const actor = h('input', { type: 'text', placeholder: 'เช่น admin หรือ member:00123' });
  const target = h('input', { type: 'text', placeholder: 'เช่น WD-2026-000001' });
  const tbody = h('tbody');
  const resultSlot = h('div', {}, h('p', { class: 'hint' }, 'กด "ค้นหา" เพื่อแสดงรายการล่าสุด'));
  const more = h('button', { type: 'button', class: 'secondary small' }, 'แสดงเพิ่ม');
  let filters: ListAuditLogPayload = {};
  let nextOffset: number | null = null;

  async function load(offset: number): Promise<void> {
    more.disabled = true;
    const res = await staffCall<ListAuditLogResult>('listAuditLog', { ...filters, offset });
    more.disabled = false;
    if (!res.ok) return showError(res, messages.show);
    messages.clear();
    if (offset === 0) tbody.replaceChildren();
    tbody.append(...res.data.entries.map(row));
    nextOffset = res.data.nextOffset;
    resultSlot.replaceChildren(
      tbody.childElementCount === 0
        ? h('p', { class: 'hint' }, 'ไม่พบรายการ')
        : h(
            'div',
            { class: 'table-wrap' },
            h(
              'table',
              {},
              h('thead', {}, h('tr', {}, ...['เวลา', 'ผู้กระทำ', 'การกระทำ', 'เป้าหมาย', 'รายละเอียด'].map((t) => h('th', {}, t)))),
              tbody,
            ),
          ),
      ...(nextOffset === null ? [] : [more]),
    );
  }

  more.addEventListener('click', () => {
    if (nextOffset !== null) void load(nextOffset);
  });

  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'บันทึกการใช้งาน (audit log)'),
    h('p', { class: 'hint' }, 'ใหม่สุดก่อน ค้นผู้กระทำและเป้าหมายได้ด้วยข้อความบางส่วน'),
    messages.element,
    h(
      'form',
      {
        class: 'filters',
        onSubmit: (event) => {
          event.preventDefault();
          filters = {
            fromDate: fromDate.value || undefined,
            toDate: toDate.value || undefined,
            actor: actor.value.trim() || undefined,
            target: target.value.trim() || undefined,
          };
          void load(0);
        },
      },
      h('label', {}, 'ตั้งแต่วันที่', fromDate),
      h('label', {}, 'ถึงวันที่', toDate),
      h('label', {}, 'ผู้กระทำ', actor),
      h('label', {}, 'เป้าหมาย', target),
      h('button', { type: 'submit' }, 'ค้นหา'),
    ),
    resultSlot,
  );
}

function row(entry: AuditLogEntry): HTMLElement {
  return h(
    'tr',
    {},
    h('td', { class: 'nowrap' }, formatThaiDateTimeFromIso(entry.at)),
    h('td', {}, entry.actor),
    h('td', {}, AUDIT_ACTION_LABELS[entry.action] ?? entry.action),
    h('td', {}, entry.target),
    h('td', { class: 'detail' }, entry.detail),
  );
}
