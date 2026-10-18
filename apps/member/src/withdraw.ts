// ถอนเงิน: เลือกบัญชีเงินฝากและบัญชีรับเงิน เซ็นลายมือชื่อ แล้วยืนยันด้วย PIN
import {
  ACCOUNT_TYPE_LABELS,
  BANKS,
  PIN_LENGTH,
  WITHDRAWAL_MAX_AMOUNT,
  WITHDRAWAL_MIN_AMOUNT,
  type MeResult,
  type MyAccount,
  type MyPayoutAccount,
  type MyRequest,
} from '../../../shared/api';
import { formatBaht, formatThaiDate } from '../../../shared/format';
import { h } from '../../lib/dom';
import { memberCall } from './api';
import { notice, renderPage } from './layout';
import { createSignaturePad } from './signaturePad';

type Member = Extract<MeResult, { bound: true }>;

export async function renderWithdraw(member: Member): Promise<void> {
  const messages = h('div');
  const body = h('section', { class: 'card' }, h('p', { class: 'hint' }, 'กำลังโหลด…'));
  renderPage('ถอนเงิน', messages, body);

  if (member.pinLocked) {
    body.replaceChildren(h('p', {}, 'PIN ถูกล็อก กรุณาติดต่อสหกรณ์เพื่อรีเซ็ต PIN ก่อนถอนเงิน'));
    return;
  }

  const [accounts, payouts] = await Promise.all([
    memberCall<MyAccount[]>('listMyAccounts'),
    memberCall<MyPayoutAccount[]>('listMyPayoutAccounts'),
  ]);
  if (!accounts.ok || !payouts.ok) {
    const error = !accounts.ok ? accounts.error : !payouts.ok ? payouts.error : null;
    body.replaceChildren(notice(error?.message ?? 'โหลดข้อมูลไม่สำเร็จ', true));
    return;
  }
  const approved = payouts.data.filter((p) => p.status === 'approved');
  if (accounts.data.length === 0) {
    body.replaceChildren(h('p', {}, 'ไม่พบบัญชีเงินฝาก กรุณาติดต่อสหกรณ์'));
    return;
  }
  if (approved.length === 0) {
    body.replaceChildren(
      h('p', {}, 'ต้องมีบัญชีรับเงินที่ได้รับอนุมัติก่อนถอนเงิน'),
      h('a', { href: '?page=payout', 'data-nav': 'payout', class: 'link-button' }, 'ลงทะเบียนบัญชีรับเงิน'),
    );
    return;
  }
  body.replaceChildren(withdrawForm(accounts.data, approved, messages));
}

function withdrawForm(accounts: MyAccount[], payouts: MyPayoutAccount[], messages: HTMLElement): HTMLElement {
  const account = h(
    'select',
    { required: true },
    ...accounts.map((a) =>
      h('option', { value: a.accountNumber }, `${a.accountNumber} · ${ACCOUNT_TYPE_LABELS[a.accountType]}`),
    ),
  );
  const accountInfo = h('p', { class: 'hint' });
  const showAccount = () => {
    const selected = accounts.find((a) => a.accountNumber === account.value)!;
    accountInfo.textContent = `${selected.accountName} · ${ACCOUNT_TYPE_LABELS[selected.accountType]}`;
  };
  account.addEventListener('change', showAccount);
  showAccount();

  const payout = h(
    'select',
    { required: true },
    ...payouts.map((p) =>
      h('option', { value: p.id }, `${BANKS.find((b) => b.code === p.bankCode)?.name ?? p.bankCode} ${p.accountNumber}`),
    ),
  );
  const amount = h('input', {
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    required: true,
    placeholder: `${formatBaht(WITHDRAWAL_MIN_AMOUNT)} – ${formatBaht(WITHDRAWAL_MAX_AMOUNT)} บาท`,
  });
  const signature = createSignaturePad();
  const pin = h('input', {
    type: 'password',
    inputmode: 'numeric',
    autocomplete: 'off',
    maxlength: String(PIN_LENGTH),
    required: true,
  });
  const submit = h('button', { type: 'submit' }, 'ยืนยันถอนเงิน');

  const form = h(
    'form',
    {
      class: 'stack',
      onSubmit: async (event) => {
        event.preventDefault();
        const value = Number(amount.value.replace(/,/g, ''));
        const problem =
          !Number.isFinite(value) || value < WITHDRAWAL_MIN_AMOUNT || value > WITHDRAWAL_MAX_AMOUNT
            ? `จำนวนเงินต้องอยู่ระหว่าง ${formatBaht(WITHDRAWAL_MIN_AMOUNT)} ถึง ${formatBaht(WITHDRAWAL_MAX_AMOUNT)} บาท`
            : signature.isEmpty()
              ? 'กรุณาเซ็นลายมือชื่อ'
              : '';
        if (problem) {
          messages.replaceChildren(notice(problem, true));
          messages.scrollIntoView({ behavior: 'smooth' });
          return;
        }

        submit.disabled = true;
        submit.textContent = 'กำลังส่ง…';
        const res = await memberCall<MyRequest>('submitWithdrawalRequest', {
          accountNumber: account.value,
          payoutAccountId: payout.value,
          amount: value,
          signature: { fileName: 'signature.png', mimeType: 'image/png', contentBase64: signature.toPngBase64() },
          pin: pin.value,
        });
        submit.disabled = false;
        submit.textContent = 'ยืนยันถอนเงิน';
        pin.value = '';
        if (!res.ok) {
          messages.replaceChildren(notice(res.error.message, true));
          messages.scrollIntoView({ behavior: 'smooth' });
          if (res.error.code === 'ACCOUNT_LOCKED') form.replaceWith(h('p', {}, 'PIN ถูกล็อก กรุณาติดต่อสหกรณ์'));
          return;
        }
        messages.replaceChildren();
        form.replaceWith(receipt(res.data, payout.selectedOptions[0]?.textContent ?? ''));
      },
    },
    h('label', {}, 'ถอนจากบัญชีเงินฝาก', account),
    accountInfo,
    h('label', {}, 'โอนเข้าบัญชีรับเงิน', payout),
    h('label', {}, 'จำนวนเงิน (บาท)', amount),
    h('div', {}, h('div', { class: 'field-title' }, 'ลายมือชื่อเจ้าของบัญชีและผู้รับเงิน'), signature.element),
    h('label', {}, `PIN ${PIN_LENGTH} หลัก`, pin),
    submit,
  );
  return form;
}

function receipt(request: MyRequest, payoutLabel: string): HTMLElement {
  const row = (label: string, value: string) => h('div', { class: 'status-row' }, h('span', {}, label), h('span', {}, value));
  return h(
    'div',
    {},
    notice(`ส่งคำขอถอนเงินแล้ว เลขที่ ${request.requestNumber}`),
    row('จำนวนเงิน', `${formatBaht(request.amount)} บาท`),
    row('จากบัญชี', request.accountNumber),
    row('เข้าบัญชี', payoutLabel),
    row('วันทำการที่ดำเนินการ', formatThaiDate(request.processingDate)),
    h('p', { class: 'hint' }, 'เจ้าหน้าที่จะตรวจและอนุมัติ แล้วแจ้งผลทาง LINE'),
    h('a', { href: '?page=history', 'data-nav': 'history', class: 'link-button' }, 'ดูประวัติคำขอ'),
  );
}
