// หน้าของสมาชิกที่ผูกบัญชีแล้ว
import { ACCOUNT_TYPE_LABELS, PIN_LENGTH, type MeResult, type MyAccount } from '../../../shared/api';
import { h } from '../../lib/dom';
import { memberCall } from './api';
import { MENU, notice, renderPage, type PageId } from './layout';

type Member = Extract<MeResult, { bound: true }>;

export function renderHome(member: Member): void {
  renderPage(
    'ฝากถอนออนไลน์',
    h(
      'section',
      { class: 'card' },
      h('p', { style: 'margin: 0' }, `สวัสดี ${member.memberName || member.displayName}`),
      h('p', { class: 'hint' }, `รหัสสมาชิก ${member.memberCode}`),
    ),
    h(
      'section',
      { class: 'card' },
      h(
        'nav',
        { class: 'menu-grid' },
        ...MENU.map((item) => h('a', { href: `?page=${item.id}`, 'data-nav': item.id }, item.label)),
      ),
    ),
  );
}

export async function renderAccount(member: Member): Promise<void> {
  const accountsSlot = h('div', {}, h('p', { class: 'hint' }, 'กำลังโหลด…'));
  renderPage(
    'ข้อมูลบัญชี',
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'สมาชิก'),
      statusRow('ชื่อ', member.memberName || '-'),
      statusRow('รหัสสมาชิก', member.memberCode),
      statusRow('บัญชี LINE', member.displayName),
      statusRow('PIN', member.pinLocked ? 'ถูกล็อก (ติดต่อสหกรณ์)' : member.pinSet ? 'ตั้งแล้ว' : 'ยังไม่ได้ตั้ง'),
    ),
    h('section', { class: 'card' }, h('h2', {}, 'บัญชีเงินฝาก'), accountsSlot),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'เปลี่ยน PIN'),
      member.pinLocked
        ? h('p', { class: 'hint' }, 'PIN ถูกล็อก กรุณาติดต่อสหกรณ์เพื่อรีเซ็ต แล้วเปิดหน้านี้ใหม่เพื่อตั้ง PIN ใหม่')
        : changePinForm(),
    ),
  );

  const res = await memberCall<MyAccount[]>('listMyAccounts');
  if (!res.ok) {
    accountsSlot.replaceChildren(notice(res.error.message, true));
    return;
  }
  accountsSlot.replaceChildren(
    ...(res.data.length === 0
      ? [h('p', { class: 'hint' }, 'ไม่พบบัญชีเงินฝาก กรุณาติดต่อสหกรณ์')]
      : res.data.map((account) =>
          h(
            'div',
            { class: 'account' },
            h('div', { class: 'number' }, account.accountNumber),
            h('div', {}, account.accountName),
            h('div', { class: 'meta' }, ACCOUNT_TYPE_LABELS[account.accountType]),
          ),
        )),
  );
}

export function renderContact(): void {
  const phone = import.meta.env.VITE_COOP_PHONE;
  renderPage(
    'ติดต่อสหกรณ์',
    h(
      'section',
      { class: 'card' },
      h('p', {}, 'สหกรณ์ออมทรัพย์สาธารณสุขจังหวัดมุกดาหาร จำกัด'),
      phone
        ? h('p', {}, 'โทร ', h('a', { href: `tel:${phone.replace(/[^\d+]/g, '')}` }, phone))
        : null,
      h('p', { class: 'hint' }, 'วันจันทร์–ศุกร์ เวลาทำการ หรือพิมพ์ข้อความใน LINE OA นี้'),
    ),
  );
}

export function renderComingSoon(page: PageId): void {
  const label = MENU.find((item) => item.id === page)?.label ?? 'เมนูนี้';
  renderPage(label, h('section', { class: 'card' }, h('p', {}, `${label} จะเปิดให้ใช้เร็ว ๆ นี้`)));
}

function changePinForm(): HTMLElement {
  const pinInput = (autocomplete: string) =>
    h('input', {
      type: 'password',
      inputmode: 'numeric',
      autocomplete,
      maxlength: String(PIN_LENGTH),
      required: true,
    });
  const oldPin = pinInput('current-password');
  const newPin = pinInput('new-password');
  const confirm = pinInput('new-password');
  const submit = h('button', { type: 'submit' }, 'เปลี่ยน PIN');
  const messages = h('div');

  const form = h(
    'form',
    {
      class: 'stack',
      onSubmit: async (event) => {
        event.preventDefault();
        if (newPin.value !== confirm.value) {
          messages.replaceChildren(notice('PIN ใหม่ทั้งสองช่องไม่ตรงกัน', true));
          return;
        }
        submit.disabled = true;
        const res = await memberCall('changePin', { oldPin: oldPin.value, newPin: newPin.value });
        submit.disabled = false;
        if (!res.ok) {
          messages.replaceChildren(notice(res.error.message, true));
          if (res.error.code === 'ACCOUNT_LOCKED') form.replaceChildren(messages);
          return;
        }
        form.reset();
        messages.replaceChildren(notice('เปลี่ยน PIN เรียบร้อยแล้ว'));
      },
    },
    messages,
    h('label', {}, 'PIN เดิม', oldPin),
    h('label', {}, `PIN ใหม่ ${PIN_LENGTH} หลัก`, newPin),
    h('label', {}, 'ยืนยัน PIN ใหม่', confirm),
    submit,
  );
  return form;
}

function statusRow(label: string, value: string): HTMLElement {
  return h('div', { class: 'status-row' }, h('span', {}, label), h('span', {}, value));
}
