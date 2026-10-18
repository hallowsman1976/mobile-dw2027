// ฝากเงิน: แจ้งการโอนเงินเข้าบัญชีรับโอนของสหกรณ์พร้อมสลิป
import flatpickr from 'flatpickr';
import { Thai } from 'flatpickr/dist/l10n/th.js';
import 'flatpickr/dist/flatpickr.min.css';
import {
  ACCOUNT_TYPE_LABELS,
  DEPOSIT_MIN_AMOUNT,
  type MyAccount,
  type MyRequest,
} from '../../../shared/api';
import { formatBaht, formatThaiDate, formatThaiDateTimeFromIso } from '../../../shared/format';
import { h } from '../../lib/dom';
import { prepareUpload } from '../../lib/files';
import { memberCall } from './api';
import { notice, renderPage } from './layout';

export async function renderDeposit(): Promise<void> {
  const messages = h('div');
  const formSlot = h('div', {}, h('p', { class: 'hint' }, 'กำลังโหลด…'));
  renderPage('ฝากเงิน', messages, h('section', { class: 'card' }, formSlot));

  const res = await memberCall<MyAccount[]>('listMyAccounts');
  if (!res.ok) {
    formSlot.replaceChildren(notice(res.error.message, true));
    return;
  }
  if (res.data.length === 0) {
    formSlot.replaceChildren(h('p', {}, 'ไม่พบบัญชีเงินฝาก กรุณาติดต่อสหกรณ์'));
    return;
  }
  formSlot.replaceChildren(depositForm(res.data, messages));
}

function depositForm(accounts: MyAccount[], messages: HTMLElement): HTMLElement {
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

  const transferredAt = h('input', { type: 'text', required: true, placeholder: 'เลือกวันและเวลาที่โอน', readonly: true });
  const picker = flatpickr(transferredAt, {
    locale: Thai,
    enableTime: true,
    time_24hr: true,
    // แสดงปี พ.ศ. ในช่อง ส่วนค่าที่ส่งไปหลังบ้านใช้ selectedDates
    formatDate: (date) => formatThaiDateTimeFromIso(date.toISOString()),
    maxDate: new Date(),
    defaultDate: new Date(),
    disableMobile: true,
  });

  const amount = h('input', {
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    required: true,
    placeholder: `ขั้นต่ำ ${formatBaht(DEPOSIT_MIN_AMOUNT)} บาท`,
  });
  const slip = h('input', { type: 'file', accept: 'image/*', required: true });
  const submit = h('button', { type: 'submit' }, 'ส่งคำขอฝากเงิน');

  const form = h(
    'form',
    {
      class: 'stack',
      onSubmit: async (event) => {
        event.preventDefault();
        const when = picker.selectedDates[0];
        const file = slip.files?.[0];
        const value = Number(amount.value.replace(/,/g, ''));
        if (!when || !file) return;
        submit.disabled = true;
        submit.textContent = 'กำลังส่ง…';
        try {
          const prepared = await prepareUpload(file);
          if (typeof prepared === 'string') throw new Error(prepared);
          const res = await memberCall<MyRequest>('submitDepositRequest', {
            accountNumber: account.value,
            amount: value,
            transferredAt: when.toISOString(),
            slip: prepared,
          });
          if (!res.ok) throw new Error(res.error.message);
          form.replaceWith(receipt(res.data));
          messages.replaceChildren();
        } catch (err) {
          messages.replaceChildren(notice(err instanceof Error ? err.message : 'ส่งไม่สำเร็จ', true));
          messages.scrollIntoView({ behavior: 'smooth' });
        } finally {
          submit.disabled = false;
          submit.textContent = 'ส่งคำขอฝากเงิน';
        }
      },
    },
    h('p', { class: 'hint' }, 'โอนเงินเข้าบัญชีของสหกรณ์ก่อน แล้วแจ้งการโอนพร้อมสลิปที่นี่'),
    h('label', {}, 'เข้าบัญชีเงินฝาก', account),
    accountInfo,
    h('label', {}, 'วันและเวลาที่โอน', transferredAt),
    h('label', {}, 'จำนวนเงิน (บาท)', amount),
    h('label', {}, 'สลิปการโอนเงิน (รูปภาพ ไม่เกิน 5MB)', slip),
    submit,
  );
  return form;
}

function receipt(request: MyRequest): HTMLElement {
  return h(
    'div',
    {},
    notice(`ส่งคำขอฝากเงินแล้ว เลขที่ ${request.requestNumber}`),
    h('div', { class: 'status-row' }, h('span', {}, 'จำนวนเงิน'), h('span', {}, `${formatBaht(request.amount)} บาท`)),
    h('div', { class: 'status-row' }, h('span', {}, 'เข้าบัญชี'), h('span', {}, request.accountNumber)),
    h(
      'div',
      { class: 'status-row' },
      h('span', {}, 'วันทำการที่ดำเนินการ'),
      h('span', {}, formatThaiDate(request.processingDate)),
    ),
    h('p', { class: 'hint' }, 'จะแจ้งผลทาง LINE ดูสถานะได้ที่เมนูประวัติคำขอ'),
    h('a', { href: '?page=history', 'data-nav': 'history', class: 'link-button' }, 'ดูประวัติคำขอ'),
  );
}
