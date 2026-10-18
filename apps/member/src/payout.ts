// บัญชีรับเงินของฉัน: ลงทะเบียนพร้อมเอกสาร ดูสถานะ และเลิกใช้
import {
  BANKS,
  PAYOUT_ACCOUNT_STATUS_LABELS,
  PAYOUT_DOCUMENT_LABELS,
  type MeResult,
  type MyPayoutAccount,
  type PayoutDocumentKind,
  type UploadedFile,
} from '../../../shared/api';
import { h } from '../../lib/dom';
import { prepareUpload } from '../../lib/files';
import { memberCall } from './api';
import { notice, renderPage } from './layout';

type Member = Extract<MeResult, { bound: true }>;

const DOCUMENT_KINDS = Object.keys(PAYOUT_DOCUMENT_LABELS) as PayoutDocumentKind[];

export async function renderPayout(member: Member): Promise<void> {
  const messages = h('div');
  const listSlot = h('div', {}, h('p', { class: 'hint' }, 'กำลังโหลด…'));

  async function refresh(): Promise<void> {
    const res = await memberCall<MyPayoutAccount[]>('listMyPayoutAccounts');
    if (!res.ok) {
      listSlot.replaceChildren(notice(res.error.message, true));
      return;
    }
    listSlot.replaceChildren(
      ...(res.data.length === 0
        ? [h('p', { class: 'hint' }, 'ยังไม่มีบัญชีรับเงิน ลงทะเบียนด้านล่างก่อนถอนเงิน')]
        : res.data.map((account) => accountCard(account, messages, refresh))),
    );
  }

  renderPage(
    'บัญชีรับเงินของฉัน',
    messages,
    h('section', { class: 'card' }, h('h2', {}, 'บัญชีที่ลงทะเบียนไว้'), listSlot),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'ลงทะเบียนบัญชีรับเงิน'),
      registerForm(member, messages, refresh),
    ),
  );
  await refresh();
}

function accountCard(account: MyPayoutAccount, messages: HTMLElement, refresh: () => Promise<void>): HTMLElement {
  const bankName = BANKS.find((b) => b.code === account.bankCode)?.name ?? account.bankCode;
  const retire = h('button', { type: 'button', class: 'secondary small' }, 'เลิกใช้บัญชีนี้');
  retire.addEventListener('click', async () => {
    if (!confirm(`เลิกใช้บัญชี ${bankName} ${account.accountNumber}?`)) return;
    retire.disabled = true;
    const res = await memberCall('retirePayoutAccount', { id: account.id });
    if (!res.ok) {
      retire.disabled = false;
      messages.replaceChildren(notice(res.error.message, true));
      return;
    }
    messages.replaceChildren(notice('เลิกใช้บัญชีแล้ว'));
    await refresh();
  });

  return h(
    'div',
    { class: 'account' },
    h('div', { class: 'number' }, account.accountNumber),
    h('div', {}, account.accountName),
    h('div', { class: 'meta' }, bankName),
    h('span', { class: `badge status-${account.status}` }, PAYOUT_ACCOUNT_STATUS_LABELS[account.status]),
    account.status === 'pendingReview' ? h('p', { class: 'hint' }, 'รอเจ้าหน้าที่ตรวจเอกสาร จะแจ้งผลทาง LINE') : null,
    account.status === 'rejected' ? h('p', { class: 'hint' }, `เหตุผล: ${account.rejectReason}`) : null,
    account.status === 'pendingReview' || account.status === 'approved' ? retire : null,
  );
}

function registerForm(member: Member, messages: HTMLElement, refresh: () => Promise<void>): HTMLElement {
  const bank = h(
    'select',
    { required: true },
    h('option', { value: '' }, 'เลือกธนาคาร'),
    ...BANKS.map((b) => h('option', { value: b.code }, b.name)),
  );
  const accountNumber = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', required: true });
  const accountName = h('input', { type: 'text', autocomplete: 'off', required: true, value: member.memberName });
  const fileInputs = Object.fromEntries(
    DOCUMENT_KINDS.map((kind) => [kind, h('input', { type: 'file', accept: 'image/*,application/pdf', required: true })]),
  ) as Record<PayoutDocumentKind, HTMLInputElement>;
  const submit = h('button', { type: 'submit' }, 'ส่งให้เจ้าหน้าที่ตรวจ');

  const form = h(
    'form',
    {
      class: 'stack',
      onSubmit: async (event) => {
        event.preventDefault();
        submit.disabled = true;
        submit.textContent = 'กำลังเตรียมไฟล์…';
        try {
          const documents = {} as Record<PayoutDocumentKind, UploadedFile>;
          for (const kind of DOCUMENT_KINDS) {
            const file = fileInputs[kind].files?.[0];
            if (!file) throw new Error(`กรุณาแนบ${PAYOUT_DOCUMENT_LABELS[kind]}`);
            const prepared = await prepareUpload(file);
            if (typeof prepared === 'string') throw new Error(prepared);
            documents[kind] = prepared;
          }
          submit.textContent = 'กำลังส่ง…';
          const res = await memberCall<MyPayoutAccount>('registerPayoutAccount', {
            bankCode: bank.value,
            accountNumber: accountNumber.value,
            accountName: accountName.value,
            documents,
          });
          if (!res.ok) throw new Error(res.error.message);
          form.reset();
          accountName.value = member.memberName;
          messages.replaceChildren(notice('ส่งบัญชีรับเงินแล้ว เจ้าหน้าที่จะตรวจและแจ้งผลทาง LINE'));
          messages.scrollIntoView({ behavior: 'smooth' });
          await refresh();
        } catch (err) {
          messages.replaceChildren(notice(err instanceof Error ? err.message : 'ส่งไม่สำเร็จ', true));
          messages.scrollIntoView({ behavior: 'smooth' });
        } finally {
          submit.disabled = false;
          submit.textContent = 'ส่งให้เจ้าหน้าที่ตรวจ';
        }
      },
    },
    h('p', { class: 'hint' }, 'ต้องเป็นบัญชีในชื่อของท่านเอง ใช้รับเงินที่ถอนจากสหกรณ์'),
    h('label', {}, 'ธนาคาร', bank),
    h('label', {}, 'เลขบัญชี', accountNumber),
    h('label', {}, 'ชื่อบัญชี', accountName),
    ...DOCUMENT_KINDS.map((kind) => h('label', {}, PAYOUT_DOCUMENT_LABELS[kind], fileInputs[kind])),
    h('p', { class: 'hint' }, 'ถ่ายรูปหรือเลือกไฟล์ JPG, PNG หรือ PDF ไม่เกิน 5MB ต่อไฟล์'),
    submit,
  );
  return form;
}
