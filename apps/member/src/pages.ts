// หน้าของสมาชิกที่ผูกบัญชีแล้ว
import { ACCOUNT_TYPE_LABELS, type MeResult, type MyAccount } from '../../../shared/api';
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
      h('p', { class: 'hint' }, 'เร็ว ๆ นี้'),
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

function statusRow(label: string, value: string): HTMLElement {
  return h('div', { class: 'status-row' }, h('span', {}, label), h('span', {}, value));
}
