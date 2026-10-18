// ผู้ดูแลระบบ: ค้นหาสมาชิก รีเซ็ต PIN และยกเลิกการผูกบัญชี LINE
import type { MemberLookup } from '../../../shared/api';
import { h } from '../../lib/dom';
import { formatThaiDateTime, messageArea, showError, staffCall } from './session';

export function memberSupportSection(): HTMLElement {
  const messages = messageArea();
  const resultSlot = h('div');
  const memberCode = h('input', { type: 'text', inputmode: 'numeric', maxlength: '5', required: true });
  const search = h('button', { type: 'submit' }, 'ค้นหา');

  async function run(action: string, success?: string): Promise<void> {
    messages.clear();
    const res = await staffCall<MemberLookup>(action, { memberCode: memberCode.value });
    if (!res.ok) {
      resultSlot.replaceChildren();
      return showError(res, messages.show);
    }
    if (success) messages.show(success);
    resultSlot.replaceChildren(lookupCard(res.data, run));
  }

  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'ดูแลการผูกบัญชีของสมาชิก'),
    messages.element,
    h(
      'form',
      {
        class: 'search-row',
        onSubmit: (event) => {
          event.preventDefault();
          void run('lookupMember');
        },
      },
      h('label', {}, 'รหัสสมาชิก', memberCode),
      search,
    ),
    resultSlot,
  );
}

function lookupCard(
  member: MemberLookup,
  run: (action: string, success?: string) => Promise<void>,
): HTMLElement {
  const row = (label: string, value: string) =>
    h('div', { class: 'status-row' }, h('span', {}, label), h('span', {}, value));
  const binding = member.binding;

  const rows = [
    row('รหัสสมาชิก', member.memberCode),
    row('ชื่อ', member.memberName || '-'),
    row('บัญชีเงินฝาก', `${member.accountCount} บัญชี`),
    row('บัญชี LINE', binding ? `ผูกแล้ว เมื่อ ${formatThaiDateTime(binding.boundAt)}` : 'ยังไม่ได้ผูก'),
  ];
  if (binding) {
    rows.push(
      row(
        'PIN',
        binding.pinLocked
          ? 'ถูกล็อก'
          : binding.pinSet
            ? `ตั้งแล้ว (กรอกผิดติดกัน ${binding.pinFailedAttempts} ครั้ง)`
            : 'ยังไม่ได้ตั้ง',
      ),
    );
  }

  const actions = binding
    ? h(
        'div',
        { class: 'row-actions', style: 'margin-top: 12px' },
        h(
          'button',
          {
            class: 'small secondary',
            onClick: () => {
              if (confirm(`รีเซ็ต PIN ของสมาชิก ${member.memberCode}? สมาชิกต้องตั้ง PIN ใหม่ผ่าน LINE`)) {
                void run('resetPin', `รีเซ็ต PIN ของ ${member.memberCode} แล้ว แจ้งสมาชิกให้เปิด LINE เพื่อตั้ง PIN ใหม่`);
              }
            },
          },
          'รีเซ็ต PIN',
        ),
        h(
          'button',
          {
            class: 'small secondary danger',
            onClick: () => {
              if (
                confirm(
                  `ยกเลิกการผูกบัญชี LINE ของสมาชิก ${member.memberCode}? บัญชี LINE เดิมจะใช้งานไม่ได้ทันที`,
                )
              ) {
                void run(
                  'unbindLineAccount',
                  `ยกเลิกการผูกบัญชี LINE ของ ${member.memberCode} แล้ว สมาชิกผูกบัญชี LINE ใหม่ได้`,
                );
              }
            },
          },
          'ยกเลิกการผูกบัญชี LINE',
        ),
      )
    : null;

  return h('div', { class: 'lookup' }, ...rows, actions);
}
