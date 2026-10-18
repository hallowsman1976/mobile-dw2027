// การผูกบัญชี LINE ครั้งแรก: ยินยอมนโยบาย → กรอกรหัสสมาชิกและเลขบัตรประชาชน → ตั้ง PIN
import {
  PIN_LENGTH,
  PRIVACY_POLICY_VERSION,
  type BindLineAccountResult,
} from '../../../shared/api';
import { h } from '../../lib/dom';
import { memberCall } from './api';
import { notice, renderOnboardingPage } from './layout';
import { PRIVACY_POLICY_SECTIONS } from './privacyPolicy';

export function renderConsent(onAccepted: () => void): void {
  const accept = h('input', { type: 'checkbox' });
  const next = h('button', { type: 'button', disabled: true }, 'ถัดไป');
  accept.addEventListener('change', () => {
    next.disabled = !accept.checked;
  });
  next.addEventListener('click', onAccepted);

  renderOnboardingPage(
    'ผูกบัญชี LINE',
    h('p', { class: 'steps' }, 'ขั้นที่ 1 จาก 3 · นโยบายความเป็นส่วนตัว'),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'นโยบายความเป็นส่วนตัว'),
      h(
        'div',
        { class: 'policy' },
        ...PRIVACY_POLICY_SECTIONS.flatMap((section) => [
          h('h3', {}, section.heading),
          h('p', {}, section.body),
        ]),
      ),
      h(
        'label',
        { class: 'checkbox', style: 'margin-top: 16px' },
        accept,
        'ข้าพเจ้าได้อ่านและยินยอมให้สหกรณ์เก็บและใช้ข้อมูลตามนโยบายนี้',
      ),
      h('div', { style: 'margin-top: 4px' }, next),
    ),
  );
}

export function renderBindForm(onBound: (result: BindLineAccountResult) => void): void {
  const memberCode = h('input', {
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'off',
    maxlength: '5',
    required: true,
  });
  const nationalId = h('input', {
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'off',
    maxlength: '17',
    required: true,
  });
  const submit = h('button', { type: 'submit' }, 'ผูกบัญชี');
  const messages = h('div');

  const form = h(
    'form',
    {
      class: 'stack',
      onSubmit: async (event) => {
        event.preventDefault();
        submit.disabled = true;
        const res = await memberCall<BindLineAccountResult>('bindLineAccount', {
          memberCode: memberCode.value,
          nationalId: nationalId.value,
          acceptedPolicyVersion: PRIVACY_POLICY_VERSION,
        });
        submit.disabled = false;
        if (!res.ok) {
          messages.replaceChildren(notice(res.error.message, true));
          return;
        }
        onBound(res.data);
      },
    },
    h('label', {}, 'รหัสสมาชิก', memberCode),
    h('p', { class: 'hint' }, 'ตัวเลขไม่เกิน 5 หลัก ไม่ต้องใส่ 0 ข้างหน้า'),
    h('label', {}, 'เลขบัตรประชาชน 13 หลัก', nationalId),
    submit,
  );

  renderOnboardingPage(
    'ผูกบัญชี LINE',
    h('p', { class: 'steps' }, 'ขั้นที่ 2 จาก 3 · ยืนยันตัวตน'),
    h(
      'section',
      { class: 'card' },
      h('p', { class: 'hint', style: 'margin-bottom: 14px' }, 'ใช้ข้อมูลเดียวกับที่ให้ไว้กับสหกรณ์ ผูกได้หนึ่งบัญชี LINE ต่อหนึ่งรหัสสมาชิก'),
      messages,
      form,
    ),
  );
  memberCode.focus();
}

export function renderSetPin(onDone: () => void, intro?: string): void {
  const pinInput = () =>
    h('input', {
      type: 'password',
      inputmode: 'numeric',
      autocomplete: 'new-password',
      maxlength: String(PIN_LENGTH),
      required: true,
    });
  const pin = pinInput();
  const confirm = pinInput();
  const submit = h('button', { type: 'submit' }, 'ตั้ง PIN');
  const messages = h('div');

  const form = h(
    'form',
    {
      class: 'stack',
      onSubmit: async (event) => {
        event.preventDefault();
        if (pin.value !== confirm.value) {
          messages.replaceChildren(notice('PIN ทั้งสองช่องไม่ตรงกัน', true));
          return;
        }
        submit.disabled = true;
        const res = await memberCall('setPin', { pin: pin.value });
        submit.disabled = false;
        if (!res.ok) {
          messages.replaceChildren(notice(res.error.message, true));
          return;
        }
        onDone();
      },
    },
    h('label', {}, `PIN ${PIN_LENGTH} หลัก`, pin),
    h('label', {}, 'ยืนยัน PIN อีกครั้ง', confirm),
    submit,
  );

  renderOnboardingPage(
    'ตั้ง PIN',
    intro ? h('p', { class: 'steps' }, intro) : null,
    h(
      'section',
      { class: 'card' },
      h(
        'p',
        { class: 'hint', style: 'margin-bottom: 14px' },
        'ใช้ PIN ยืนยันทุกครั้งที่ถอนเงิน ห้ามใช้เลขซ้ำกันทั้งหมดหรือเลขเรียงกัน และอย่าบอก PIN กับผู้อื่น',
      ),
      messages,
      form,
    ),
  );
  pin.focus();
}
