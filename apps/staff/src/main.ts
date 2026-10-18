import '../../lib/base.css';
import './staff.css';
import type { StaffLoginResult, StaffProfile } from '../../../shared/api';
import { callApi } from '../../lib/apiClient';
import { h } from '../../lib/dom';
import { dailyWorkSection } from './dailyWork';
import { holidaysSection } from './holidays';
import { importAccountsSection } from './importAccounts';
import { memberSupportSection } from './memberSupport';
import { notificationSettingsSection } from './notificationSettings';
import { payoutReviewSection } from './payoutReview';
import { requestsSection } from './requests';
import { gasUrl, notice, session, staffCall } from './session';
import { roleNames, staffManagementSection } from './staffManagement';
import { templateSettingsSection } from './templateSettings';

const app = document.getElementById('app')!;

let profile: StaffProfile | null = null;

session.onExpired((message) => {
  profile = null;
  renderLogin(message);
});

// ---------- หน้าเข้าสู่ระบบ ----------

function renderLogin(message?: string): void {
  const username = h('input', { type: 'text', name: 'username', autocomplete: 'username', required: true });
  const password = h('input', {
    type: 'password',
    name: 'password',
    autocomplete: 'current-password',
    required: true,
  });
  const submit = h('button', { type: 'submit' }, 'เข้าสู่ระบบ');
  const messageSlot = h('div', {}, message ? notice(message, true) : null);

  const form = h(
    'form',
    {
      class: 'stack',
      onSubmit: async (event) => {
        event.preventDefault();
        submit.disabled = true;
        const res = await callApi<StaffLoginResult>(gasUrl, 'staffLogin', undefined, {
          username: username.value,
          password: password.value,
        });
        submit.disabled = false;
        if (!res.ok) {
          messageSlot.replaceChildren(notice(res.error.message, true));
          password.value = '';
          password.focus();
          return;
        }
        session.save(res.data.sessionToken);
        profile = res.data.staff;
        renderHome();
      },
    },
    h('label', {}, 'ชื่อผู้ใช้', username),
    h('label', {}, 'รหัสผ่าน', password),
    submit,
  );

  app.replaceChildren(
    h(
      'main',
      {},
      h('h1', {}, 'ระบบเจ้าหน้าที่ — ฝากถอนออนไลน์'),
      h('p', { class: 'subtitle' }, 'สหกรณ์ออมทรัพย์สาธารณสุขจังหวัดมุกดาหาร จำกัด'),
      h('section', { class: 'card' }, messageSlot, form),
    ),
  );
  username.focus();
}

// ---------- หน้าหลัก ----------

function renderHome(): void {
  if (!profile) return renderLogin();
  const me = profile;

  const logout = h(
    'button',
    {
      class: 'secondary',
      onClick: async () => {
        await staffCall('staffLogout');
        session.clear();
        profile = null;
        renderLogin();
      },
    },
    'ออกจากระบบ',
  );

  const sections: HTMLElement[] = [requestsSection(me), dailyWorkSection()];
  if (me.roles.includes('reviewer')) {
    sections.push(payoutReviewSection());
  }
  if (me.roles.includes('systemAdministrator')) {
    sections.push(
      memberSupportSection(),
      importAccountsSection(),
      holidaysSection(),
      notificationSettingsSection(),
      templateSettingsSection(),
      staffManagementSection(),
    );
  }

  app.replaceChildren(
    h(
      'main',
      { class: 'staff-main' },
      h(
        'div',
        { class: 'topbar' },
        h(
          'div',
          {},
          h('h1', {}, 'ระบบเจ้าหน้าที่ — ฝากถอนออนไลน์'),
          h('div', { class: 'who' }, `${me.fullName} (${roleNames(me.roles)})`),
        ),
        logout,
      ),
      ...sections,
    ),
  );
}

// ---------- เริ่มต้น ----------

async function start(): Promise<void> {
  if (!session.hasToken()) return renderLogin();
  const res = await staffCall<StaffProfile>('staffMe');
  if (!res.ok) {
    if (res.error.code !== 'UNAUTHENTICATED') renderLogin(res.error.message);
    return;
  }
  profile = res.data;
  renderHome();
}

void start();
