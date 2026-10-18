import '../../lib/base.css';
import './member.css';
import type { MeResult } from '../../../shared/api';
import { closeLiff, initLiff, memberCall } from './api';
import { MENU, renderMessage, type PageId } from './layout';
import { renderBindForm, renderConsent, renderSetPin } from './onboarding';
import { renderAccount, renderComingSoon, renderContact, renderHome } from './pages';
import { renderPayout } from './payout';
import { renderDeposit } from './deposit';
import { renderHistory } from './history';

const PAGES: PageId[] = ['home', ...MENU.map((item) => item.id)];

function currentPage(): PageId {
  const page = new URLSearchParams(location.search).get('page') as PageId | null;
  return page && PAGES.includes(page) ? page : 'home';
}

/** สลับหน้าโดยไม่โหลดใหม่ (LIFF โหลดช้า) และให้ปุ่มย้อนกลับทำงาน */
function navigate(page: PageId): void {
  const url = new URL(location.href);
  url.searchParams.set('page', page);
  history.pushState({}, '', url);
  void route();
}

document.addEventListener('click', (event) => {
  const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[data-nav]');
  if (!link) return;
  event.preventDefault();
  navigate(link.dataset.nav as PageId);
});
window.addEventListener('popstate', () => void route());

async function route(): Promise<void> {
  const res = await memberCall<MeResult>('me');
  if (!res.ok) {
    renderMessage('ฝากถอนออนไลน์', [res.error.message], { label: 'ปิดแล้วเปิดใหม่', onClick: closeLiff });
    return;
  }

  const me = res.data;
  if (!me.bound) {
    renderConsent(() =>
      renderBindForm(() => renderSetPin(() => void route(), 'ขั้นที่ 3 จาก 3 · ตั้ง PIN สำหรับถอนเงิน')),
    );
    return;
  }
  if (!me.pinSet && !me.pinLocked) {
    renderSetPin(() => void route(), 'ตั้ง PIN ก่อนใช้งาน');
    return;
  }

  const page = currentPage();
  switch (page) {
    case 'home':
      return renderHome(me);
    case 'account':
      return renderAccount(me);
    case 'contact':
      return renderContact();
    case 'payout':
      return renderPayout(me);
    case 'deposit':
      return renderDeposit();
    case 'history':
      return renderHistory();
    default:
      return renderComingSoon(page);
  }
}

async function start(): Promise<void> {
  if (!(await initLiff())) return;
  await route();
}

start().catch((err: unknown) => {
  console.error(err);
  renderMessage('ฝากถอนออนไลน์', [err instanceof Error ? err.message : 'เปิดระบบไม่สำเร็จ'], {
    label: 'ลองใหม่',
    onClick: () => location.reload(),
  });
});
