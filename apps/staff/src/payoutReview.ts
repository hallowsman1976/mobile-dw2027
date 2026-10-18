// ผู้ตรวจ: คิวบัญชีรับเงินที่รอตรวจ
import {
  BANKS,
  PAYOUT_DOCUMENT_LABELS,
  type PayoutAccountForReview,
  type PayoutDocumentKind,
} from '../../../shared/api';
import { h } from '../../lib/dom';
import { openDocument } from './documentViewer';
import { formatThaiDateTime, messageArea, showError, staffCall } from './session';

type Show = (message: string, isError?: boolean) => void;

export function payoutReviewSection(): HTMLElement {
  const messages = messageArea();
  const listSlot = h('div', {}, h('p', {}, 'กำลังโหลด…'));

  async function refresh(): Promise<void> {
    const res = await staffCall<PayoutAccountForReview[]>('listPayoutAccountsForReview');
    if (!res.ok) return showError(res, messages.show);
    listSlot.replaceChildren(
      ...(res.data.length === 0
        ? [h('p', { class: 'hint' }, 'ไม่มีบัญชีรับเงินที่รอตรวจ')]
        : res.data.map((account) => reviewCard(account, messages.show, refresh))),
    );
  }

  void refresh();

  return h(
    'section',
    { class: 'card' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', {}, 'บัญชีรับเงินรอตรวจ'),
      h('button', { type: 'button', class: 'small secondary', onClick: () => void refresh() }, 'โหลดใหม่'),
    ),
    h(
      'p',
      { class: 'hint' },
      'ตรวจว่าชื่อบัญชีรับเงินตรงกับชื่อสมาชิก และสำเนาเอกสารทั้ง 3 อย่างอ่านได้ชัด',
    ),
    messages.element,
    listSlot,
  );
}

function reviewCard(account: PayoutAccountForReview, show: Show, refresh: () => Promise<void>): HTMLElement {
  const bankName = BANKS.find((b) => b.code === account.bankCode)?.name ?? account.bankCode;
  const reason = h('input', { type: 'text', placeholder: 'เหตุผลที่ปฏิเสธ (แจ้งสมาชิก)' });
  const nameMatches = normalizeName(account.accountName) === normalizeName(account.memberName);

  async function decide(decision: 'approve' | 'reject'): Promise<void> {
    const res = await staffCall('reviewPayoutAccount', { id: account.id, decision, reason: reason.value });
    if (!res.ok) return showError(res, show);
    show(
      decision === 'approve'
        ? `อนุมัติบัญชีรับเงินของสมาชิก ${account.memberCode} แล้ว`
        : `ปฏิเสธบัญชีรับเงินของสมาชิก ${account.memberCode} แล้ว`,
    );
    await refresh();
  }

  return h(
    'div',
    { class: 'review-card' },
    h(
      'div',
      { class: 'review-grid' },
      field('สมาชิก', `${account.memberCode} ${account.memberName}`),
      field('ธนาคาร', bankName),
      field('เลขบัญชี', account.accountNumber),
      field('ชื่อบัญชี', account.accountName),
      field('สาขา', account.branch || '-'),
      field('ส่งเมื่อ', formatThaiDateTime(account.createdAt)),
    ),
    nameMatches
      ? null
      : h('p', { class: 'warn-text' }, 'ชื่อบัญชีไม่ตรงกับชื่อสมาชิกในข้อมูลสหกรณ์ ตรวจให้แน่ใจว่าเป็นบัญชีของสมาชิกเอง'),
    h(
      'div',
      { class: 'row-actions' },
      ...(Object.keys(PAYOUT_DOCUMENT_LABELS) as PayoutDocumentKind[]).map((kind) =>
        h(
          'button',
          {
            type: 'button',
            class: 'small secondary',
            onClick: () => void openDocument(account.documents[kind], PAYOUT_DOCUMENT_LABELS[kind], show),
          },
          PAYOUT_DOCUMENT_LABELS[kind],
        ),
      ),
    ),
    h(
      'div',
      { class: 'row-actions', style: 'margin-top: 10px' },
      h('button', { type: 'button', class: 'small', onClick: () => void decide('approve') }, 'อนุมัติ'),
      reason,
      h('button', { type: 'button', class: 'small secondary danger', onClick: () => void decide('reject') }, 'ปฏิเสธ'),
    ),
  );
}

function field(label: string, value: string): HTMLElement {
  return h('div', {}, h('div', { class: 'field-label' }, label), h('div', {}, value));
}

/** เทียบชื่อโดยไม่สนช่องว่างและคำนำหน้าชื่อ */
function normalizeName(name: string): string {
  return name.replace(/\s+/g, '').replace(/^(นาย|นางสาว|นาง|น\.ส\.)/, '');
}
