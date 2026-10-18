// ประวัติคำขอของสมาชิก ยกเลิกได้เฉพาะคำขอที่ยังรอตรวจ
import {
  REQUEST_STATUS_LABELS,
  REQUEST_TYPE_LABELS,
  type MyRequest,
} from '../../../shared/api';
import { formatBaht, formatThaiDate, formatThaiDateTimeFromIso } from '../../../shared/format';
import { h } from '../../lib/dom';
import { memberCall } from './api';
import { notice, renderPage } from './layout';

export async function renderHistory(): Promise<void> {
  const messages = h('div');
  const listSlot = h('div', {}, h('p', { class: 'hint' }, 'กำลังโหลด…'));
  renderPage('ประวัติคำขอ', messages, h('section', { class: 'card' }, listSlot));

  async function refresh(): Promise<void> {
    const res = await memberCall<MyRequest[]>('listMyRequests');
    if (!res.ok) {
      listSlot.replaceChildren(notice(res.error.message, true));
      return;
    }
    listSlot.replaceChildren(
      ...(res.data.length === 0
        ? [h('p', { class: 'hint' }, 'ยังไม่มีคำขอ')]
        : res.data.map((request) => requestItem(request, messages, refresh))),
    );
  }
  await refresh();
}

function requestItem(request: MyRequest, messages: HTMLElement, refresh: () => Promise<void>): HTMLElement {
  const cancel = h('button', { type: 'button', class: 'secondary small' }, 'ยกเลิกคำขอ');
  cancel.addEventListener('click', async () => {
    if (!confirm(`ยกเลิกคำขอ ${request.requestNumber}?`)) return;
    cancel.disabled = true;
    const res = await memberCall('cancelRequest', { id: request.id });
    if (!res.ok) {
      cancel.disabled = false;
      messages.replaceChildren(notice(res.error.message, true));
      return;
    }
    messages.replaceChildren(notice(`ยกเลิกคำขอ ${request.requestNumber} แล้ว`));
    await refresh();
  });

  return h(
    'div',
    { class: 'account' },
    h(
      'div',
      { class: 'request-head' },
      h('span', { class: 'number' }, `${REQUEST_TYPE_LABELS[request.type]} ${formatBaht(request.amount)} บาท`),
      h('span', { class: `badge status-${request.status}` }, REQUEST_STATUS_LABELS[request.status]),
    ),
    h('div', { class: 'meta' }, `${request.requestNumber} · บัญชี ${request.accountNumber}`),
    h('div', { class: 'meta' }, `ยื่นเมื่อ ${formatThaiDateTimeFromIso(request.submittedAt)}`),
    ['pendingReview', 'pendingApproval', 'approved'].includes(request.status)
      ? h('div', { class: 'meta' }, `ดำเนินการวันทำการ ${formatThaiDate(request.processingDate)}`)
      : null,
    request.status === 'rejected' ? h('p', { class: 'hint' }, `เหตุผล: ${request.rejectReason}`) : null,
    request.status === 'pendingReview' ? cancel : null,
  );
}
