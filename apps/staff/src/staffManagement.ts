// จัดการบัญชีเจ้าหน้าที่ (ผู้ดูแลระบบ)
import {
  STAFF_PASSWORD_MIN_LENGTH,
  STAFF_ROLE_LABELS,
  STAFF_ROLES,
  type StaffListItem,
  type StaffRole,
} from '../../../shared/api';
import { h } from '../../lib/dom';
import { messageArea, showError, staffCall } from './session';

type Show = (message: string, isError?: boolean) => void;

export function staffManagementSection(): HTMLElement {
  const messages = messageArea();
  const tableSlot = h('div', { class: 'table-wrap' }, h('p', {}, 'กำลังโหลดรายชื่อเจ้าหน้าที่…'));

  async function refresh(): Promise<void> {
    const res = await staffCall<StaffListItem[]>('listStaff');
    if (!res.ok) return showError(res, messages.show);
    tableSlot.replaceChildren(staffTable(res.data, messages.show, refresh));
  }

  void refresh();

  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'บัญชีเจ้าหน้าที่'),
    messages.element,
    tableSlot,
    h('h2', { style: 'margin-top: 24px' }, 'เพิ่มเจ้าหน้าที่'),
    createStaffForm(messages.show, refresh),
  );
}

export function roleNames(roles: StaffRole[]): string {
  return roles.map((role) => STAFF_ROLE_LABELS[role]).join(', ');
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

function staffTable(rows: StaffListItem[], show: Show, refresh: () => Promise<void>): HTMLElement {
  return h(
    'table',
    {},
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', {}, 'ชื่อผู้ใช้'),
        h('th', {}, 'ชื่อ-สกุล'),
        h('th', {}, 'บทบาท'),
        h('th', {}, 'สถานะ'),
        h('th', {}, ''),
      ),
    ),
    h('tbody', {}, ...rows.map((row) => staffRow(row, show, refresh))),
  );
}

function staffRow(row: StaffListItem, show: Show, refresh: () => Promise<void>): HTMLElement {
  const roles = roleCheckboxes(row.roles);
  const newPassword = h('input', {
    type: 'password',
    placeholder: `รหัสผ่านใหม่ (${STAFF_PASSWORD_MIN_LENGTH}+ ตัว)`,
    autocomplete: 'new-password',
  });

  async function run(action: string, payload: unknown, success: string): Promise<void> {
    const res = await staffCall(action, payload);
    if (!res.ok) return showError(res, show);
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
            run(
              'updateStaff',
              { username: row.username, roles: roles.value() },
              `บันทึกบทบาทของ ${row.username} แล้ว`,
            ),
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

function createStaffForm(show: Show, refresh: () => Promise<void>): HTMLElement {
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
        if (!res.ok) return showError(res, show);
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
