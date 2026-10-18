import { h } from '../../lib/dom';

const app = document.getElementById('app')!;

export type PageId = 'home' | 'deposit' | 'withdraw' | 'history' | 'payout' | 'account' | 'contact';

/** หน้าที่เปิดจาก Rich Menu ผ่าน LIFF URL ?page=<id> */
export const MENU: { id: Exclude<PageId, 'home'>; label: string }[] = [
  { id: 'deposit', label: 'ฝากเงิน' },
  { id: 'withdraw', label: 'ถอนเงิน' },
  { id: 'history', label: 'ประวัติคำขอ' },
  { id: 'payout', label: 'บัญชีรับเงินของฉัน' },
  { id: 'account', label: 'ข้อมูลบัญชี / เปลี่ยน PIN' },
  { id: 'contact', label: 'ติดต่อสหกรณ์' },
];

type Child = Node | string | null | undefined | false;

export function renderPage(title: string, ...children: Child[]): void {
  render(title, true, children);
}

/** หน้าระหว่างผูกบัญชี ไม่มีลิงก์หน้าหลักเพราะยังเข้าหน้าอื่นไม่ได้ */
export function renderOnboardingPage(title: string, ...children: Child[]): void {
  render(title, false, children);
}

function render(title: string, showHomeLink: boolean, children: Child[]): void {
  app.replaceChildren(
    h(
      'main',
      {},
      h(
        'div',
        { class: 'page-header' },
        h('h1', {}, title),
        showHomeLink ? h('a', { href: '?page=home', 'data-nav': 'home' }, 'หน้าหลัก') : null,
      ),
      ...children,
    ),
  );
}

export function notice(message: string, isError = false): HTMLElement {
  return h('div', { class: isError ? 'notice error' : 'notice', role: 'status' }, message);
}

export function renderMessage(title: string, lines: string[], action?: { label: string; onClick: () => void }): void {
  renderPage(
    title,
    h(
      'section',
      { class: 'card' },
      ...lines.map((line) => h('p', {}, line)),
      action ? h('button', { type: 'button', onClick: action.onClick }, action.label) : null,
    ),
  );
}
