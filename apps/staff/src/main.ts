import '../../lib/base.css';
import './staff.css';
import {
  STAFF_PASSWORD_MIN_LENGTH,
  STAFF_ROLE_LABELS,
  STAFF_ROLES,
  type ApiResponse,
  type StaffListItem,
  type StaffLoginResult,
  type StaffProfile,
  type StaffRole,
} from '../../../shared/api';
import { callApi } from '../../lib/apiClient';
import { h, sessionStore } from '../../lib/dom';
import { requireEnv } from '../../lib/view';

const TOKEN_KEY = 'staffSessionToken';
const gasUrl = requireEnv('VITE_GAS_URL', import.meta.env.VITE_GAS_URL);
const app = document.getElementById('app')!;

let profile: StaffProfile | null = null;

// ---------- การเรียกหลังบ้าน ----------

/** เรียก action ของเจ้าหน้าที่ ถ้า session หมดอายุให้กลับไปหน้าเข้าสู่ระบบ */
async function staffCall<T>(action: string, payload?: unknown): Promise<ApiResponse<T>> {
  const sessionToken = sessionStore.get(TOKEN_KEY) ?? '';
  const res = await callApi<T>(gasUrl, action, { sessionToken }, payload);
  if (!res.ok && res.error.code === 'UNAUTHENTICATED') {
    sessionStore.remove(TOKEN_KEY);
    profile = null;
    renderLogin(res.error.message);
  }
  return res;
}

function roleNames(roles: StaffRole[]): string {
  return roles.map((role) => STAFF_ROLE_LABELS[role]).join(', ');
}

function notice(message: string, isError = false): HTMLElement {
  return h('div', { class: isError ? 'notice error' : 'notice', role: 'status' }, message);
}

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
        sessionStore.set(TOKEN_KEY, res.data.sessionToken);
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
        sessionStore.remove(TOKEN_KEY);
        profile = null;
        renderLogin();
      },
    },
    'ออกจากระบบ',
  );

  const sections: HTMLElement[] = [
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'งานของฉัน'),
      h('p', {}, 'คิวคำขอฝากถอนจะเปิดใช้ในขั้นถัดไปของโครงการ'),
    ),
  ];
  if (me.roles.includes('systemAdministrator')) {
    sections.push(staffManagementSection());
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

// ---------- จัดการบัญชีเจ้าหน้าที่ (ผู้ดูแลระบบ) ----------

function staffManagementSection(): HTMLElement {
  const messageSlot = h('div');
  const tableSlot = h('div', { class: 'table-wrap' }, h('p', {}, 'กำลังโหลดรายชื่อเจ้าหน้าที่…'));

  const show = (message: string, isError = false) => {
    messageSlot.replaceChildren(notice(message, isError));
    messageSlot.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  async function refresh(): Promise<void> {
    const res = await staffCall<StaffListItem[]>('listStaff');
    if (!res.ok) {
      if (res.error.code !== 'UNAUTHENTICATED') show(res.error.message, true);
      return;
    }
    tableSlot.replaceChildren(staffTable(res.data, show, refresh));
  }

  void refresh();

  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'บัญชีเจ้าหน้าที่'),
    messageSlot,
    tableSlot,
    h('h2', { style: 'margin-top: 24px' }, 'เพิ่มเจ้าหน้าที่'),
    createStaffForm(show, refresh),
  );
}

function roleCheckboxes(selected: StaffRole[]): { element: HTMLElement; value: () => StaffRole[] } {
  const boxes = STAFF_ROLES.map((role) => ({
    role,
    input: h('input', { type: 'checkbox', checked: selected.includes(role) }),
  }));
  return {
    element: h(
      'div',
      { class: 'roles' },
      ...boxes.map(({ role, input }) => h('label', {}, input, STAFF_ROLE_LABELS[role])),
    ),
    value: () => boxes.filter(({ input }) => input.checked).map(({ role }) => role),
  };
}

function staffTable(
  rows: StaffListItem[],
  show: (message: string, isError?: boolean) => void,
  refresh: () => Promise<void>,
): HTMLElement {
  return h(
    'table',
    {},
    h(
      'thead',
      {},
      h('tr', {}, h('th', {}, 'ชื่อผู้ใช้'), h('th', {}, 'ชื่อ-สกุล'), h('th', {}, 'บทบาท'), h('th', {}, 'สถานะ'), h('th', {}, '')),
    ),
    h('tbody', {}, ...rows.map((row) => staffRow(row, show, refresh))),
  );
}

function staffRow(
  row: StaffListItem,
  show: (message: string, isError?: boolean) => void,
  refresh: () => Promise<void>,
): HTMLElement {
  const roles = roleCheckboxes(row.roles);
  const newPassword = h('input', {
    type: 'password',
    placeholder: `รหัสผ่านใหม่ (${STAFF_PASSWORD_MIN_LENGTH}+ ตัว)`,
    autocomplete: 'new-password',
  });

  async function run(action: string, payload: unknown, success: string): Promise<void> {
    const res = await staffCall(action, payload);
    if (!res.ok) {
      if (res.error.code !== 'UNAUTHENTICATED') show(res.error.message, true);
      return;
    }
    show(success);
    await refresh();
  }

  const status = h(
    'div',
    { class: 'row-actions' },
    h('span', { class: row.active ? 'badge' : 'badge off' }, row.active ? 'ใช้งาน' : 'ปิดใช้งาน'),
    row.locked ? h('span', { class: 'badge warn' }, 'ล็อกชั่วคราว') : null,
  );

  return h(
    'tr',
    {},
    h('td', {}, row.username),
    h('td', {}, row.fullName),
    h(
      'td',
      {},
      roles.element,
      h(
        'button',
        {
          class: 'small secondary',
          onClick: () =>
            run('updateStaff', { username: row.username, roles: roles.value() }, `บันทึกบทบาทของ ${row.username} แล้ว`),
        },
        'บันทึกบทบาท',
      ),
    ),
    h('td', {}, status),
    h(
      'td',
      {},
      h(
        'div',
        { class: 'row-actions' },
        h(
          'button',
          {
            class: 'small secondary',
            onClick: () =>
              run(
                'updateStaff',
                { username: row.username, active: !row.active },
                row.active ? `ปิดใช้งาน ${row.username} แล้ว` : `เปิดใช้งาน ${row.username} แล้ว`,
              ),
          },
          row.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน',
        ),
        newPassword,
        h(
          'button',
          {
            class: 'small secondary',
            onClick: () =>
              run(
                'resetStaffPassword',
                { username: row.username, newPassword: newPassword.value },
                `รีเซ็ตรหัสผ่านของ ${row.username} แล้ว แจ้งรหัสผ่านใหม่ให้เจ้าตัวโดยตรง`,
              ),
          },
          'รีเซ็ตรหัสผ่าน',
        ),
      ),
    ),
  );
}

function createStaffForm(
  show: (message: string, isError?: boolean) => void,
  refresh: () => Promise<void>,
): HTMLElement {
  const username = h('input', { type: 'text', autocomplete: 'off', required: true });
  const fullName = h('input', { type: 'text', autocomplete: 'off', required: true });
  const roles = roleCheckboxes(['reviewer']);
  const password = h('input', { type: 'password', autocomplete: 'new-password', required: true });
  const confirm = h('input', { type: 'password', autocomplete: 'new-password', required: true });
  const submit = h('button', { type: 'submit' }, 'เพิ่มเจ้าหน้าที่');

  return h(
    'form',
    {
      class: 'stack',
      onSubmit: async (event) => {
        event.preventDefault();
        if (password.value !== confirm.value) {
          show('รหัสผ่านทั้งสองช่องไม่ตรงกัน', true);
          return;
        }
        submit.disabled = true;
        const res = await staffCall<StaffListItem>('createStaff', {
          username: username.value,
          fullName: fullName.value,
          roles: roles.value(),
          password: password.value,
        });
        submit.disabled = false;
        if (!res.ok) {
          if (res.error.code !== 'UNAUTHENTICATED') show(res.error.message, true);
          return;
        }
        show(`เพิ่ม ${res.data.username} แล้ว`);
        (event.target as HTMLFormElement).reset();
        await refresh();
      },
    },
    h('label', {}, 'ชื่อผู้ใช้ (a-z, 0-9, . _ -)', username),
    h('label', {}, 'ชื่อ-สกุล', fullName),
    h('div', {}, h('label', {}, 'บทบาท'), roles.element),
    h('label', {}, `รหัสผ่านเริ่มต้น (อย่างน้อย ${STAFF_PASSWORD_MIN_LENGTH} ตัวอักษร)`, password),
    h('label', {}, 'ยืนยันรหัสผ่าน', confirm),
    submit,
  );
}

// ---------- เริ่มต้น ----------

async function start(): Promise<void> {
  if (!sessionStore.get(TOKEN_KEY)) return renderLogin();
  const res = await staffCall<StaffProfile>('staffMe');
  if (!res.ok) {
    if (res.error.code !== 'UNAUTHENTICATED') renderLogin(res.error.message);
    return;
  }
  profile = res.data;
  renderHome();
}

void start();
