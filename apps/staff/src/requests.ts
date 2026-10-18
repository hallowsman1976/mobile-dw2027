// คิวคำขอฝากถอนเงิน: เจ้าหน้าที่ทุกบทบาทดูได้ ผู้ตรวจตรวจคำขอที่รอตรวจ
import {
  ACCOUNT_TYPE_LABELS,
  REQUEST_STATUS_LABELS,
  REQUEST_TYPE_LABELS,
  SLIP_CHECK_LABELS,
  type ListRequestsPayload,
  type RequestStatus,
  type RequestType,
  type StaffProfile,
  type StaffRequest,
} from '../../../shared/api';
import { formatBaht, formatThaiDate, formatThaiDateTimeFromIso } from '../../../shared/format';
import { h } from '../../lib/dom';
import { openDocument } from './documentViewer';
import { messageArea, showError, staffCall } from './session';

type Show = (message: string, isError?: boolean) => void;

export function requestsSection(me: StaffProfile): HTMLElement {
  const messages = messageArea();
  const listSlot = h('div', { class: 'table-wrap' }, h('p', {}, 'กำลังโหลด…'));
  const detailSlot = h('div');

  const status = h(
    'select',
    {},
    h('option', { value: '' }, 'ทุกสถานะ'),
    ...(Object.keys(REQUEST_STATUS_LABELS) as RequestStatus[]).map((s) =>
      h('option', { value: s, selected: s === 'pendingReview' }, REQUEST_STATUS_LABELS[s]),
    ),
  );
  const type = h(
    'select',
    {},
    h('option', { value: '' }, 'ทุกประเภท'),
    ...(Object.keys(REQUEST_TYPE_LABELS) as RequestType[]).map((t) => h('option', { value: t }, REQUEST_TYPE_LABELS[t])),
  );

  async function refresh(): Promise<void> {
    const filter: ListRequestsPayload = {};
    if (status.value) filter.status = status.value as RequestStatus;
    if (type.value) filter.type = type.value as RequestType;
    const res = await staffCall<StaffRequest[]>('listRequests', filter);
    if (!res.ok) return showError(res, messages.show);
    listSlot.replaceChildren(
      res.data.length === 0
        ? h('p', { class: 'hint' }, 'ไม่มีคำขอตามเงื่อนไขนี้')
        : requestTable(res.data, (request) => showDetail(request)),
    );
  }

  function showDetail(request: StaffRequest): void {
    detailSlot.replaceChildren(requestDetail(request, me, messages.show, async () => {
      detailSlot.replaceChildren();
      await refresh();
    }));
    detailSlot.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  status.addEventListener('change', () => void refresh());
  type.addEventListener('change', () => void refresh());
  void refresh();

  return h(
    'section',
    { class: 'card' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', {}, 'คำขอฝากถอนเงิน'),
      h('button', { type: 'button', class: 'small secondary', onClick: () => void refresh() }, 'โหลดใหม่'),
    ),
    h('div', { class: 'filters' }, h('label', {}, 'สถานะ', status), h('label', {}, 'ประเภท', type)),
    messages.element,
    listSlot,
    detailSlot,
  );
}

function requestTable(requests: StaffRequest[], onOpen: (request: StaffRequest) => void): HTMLElement {
  return h(
    'table',
    {},
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', {}, 'เลขที่'),
        h('th', {}, 'ประเภท'),
        h('th', {}, 'สมาชิก'),
        h('th', {}, 'จำนวนเงิน'),
        h('th', {}, 'ยื่นเมื่อ'),
        h('th', {}, 'ดำเนินการวันที่'),
        h('th', {}, 'สถานะ'),
      ),
    ),
    h(
      'tbody',
      {},
      ...requests.map((request) =>
        h(
          'tr',
          { class: 'clickable', onClick: () => onOpen(request) },
          h('td', {}, h('a', { href: '#', onClick: (e) => e.preventDefault() }, request.requestNumber)),
          h('td', {}, REQUEST_TYPE_LABELS[request.type]),
          h('td', {}, request.memberCode),
          h('td', { class: 'num' }, formatBaht(request.amount)),
          h('td', {}, formatThaiDateTimeFromIso(request.submittedAt)),
          h('td', {}, formatThaiDate(request.processingDate)),
          h('td', {}, h('span', { class: `badge status-${request.status}` }, REQUEST_STATUS_LABELS[request.status])),
        ),
      ),
    ),
  );
}

function requestDetail(request: StaffRequest, me: StaffProfile, show: Show, done: () => Promise<void>): HTMLElement {
  const reason = h('input', { type: 'text', placeholder: 'เหตุผลที่ปฏิเสธ (แจ้งสมาชิก)' });

  async function review(decision: 'approve' | 'reject'): Promise<void> {
    const res = await staffCall('reviewRequest', { id: request.id, decision, reason: reason.value });
    if (!res.ok) return showError(res, show);
    show(decision === 'approve' ? `ผ่านการตรวจ ${request.requestNumber} แล้ว` : `ปฏิเสธ ${request.requestNumber} แล้ว`);
    await done();
  }

  const canReview = request.status === 'pendingReview' && me.roles.includes('reviewer');
  const fields: [string, string][] = [
    ['สมาชิก', request.memberCode],
    ['บัญชีเงินฝาก', `${request.accountNumber} · ${request.accountName} · ${ACCOUNT_TYPE_LABELS[request.accountType]}`],
    ['จำนวนเงิน', `${formatBaht(request.amount)} บาท`],
    ['ยื่นเมื่อ', formatThaiDateTimeFromIso(request.submittedAt)],
    ['ดำเนินการวันทำการ', formatThaiDate(request.processingDate)],
  ];
  if (request.type === 'deposit') {
    fields.push(['โอนเมื่อ', formatThaiDateTimeFromIso(request.transferredAt)], ['ผลตรวจสลิป', SLIP_CHECK_LABELS[request.slipCheck]]);
  }
  if (request.reviewedBy) fields.push(['ผู้ตรวจ', `${request.reviewedBy} · ${formatThaiDateTimeFromIso(request.reviewedAt)}`]);
  if (request.rejectedBy) fields.push(['ปฏิเสธโดย', `${request.rejectedBy} · ${request.rejectReason}`]);

  return h(
    'div',
    { class: 'review-card detail' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', {}, `${REQUEST_TYPE_LABELS[request.type]} ${request.requestNumber}`),
      h('span', { class: `badge status-${request.status}` }, REQUEST_STATUS_LABELS[request.status]),
    ),
    h(
      'div',
      { class: 'review-grid' },
      ...fields.map(([label, value]) => h('div', {}, h('div', { class: 'field-label' }, label), h('div', {}, value))),
    ),
    request.type === 'deposit' && request.slipCheck !== 'valid'
      ? h('p', { class: 'warn-text' }, 'ยังไม่ได้ตรวจสลิปอัตโนมัติ ตรวจยอด เวลา และบัญชีผู้รับในสลิปให้ตรงกับคำขอ')
      : null,
    request.slipFileId
      ? h(
          'div',
          { class: 'row-actions' },
          h('button', { type: 'button', class: 'small secondary', onClick: () => void openDocument(request.slipFileId, `สลิป ${request.requestNumber}`, show) }, 'ดูสลิป'),
        )
      : null,
    canReview
      ? h(
          'div',
          { class: 'row-actions', style: 'margin-top: 10px' },
          h('button', { type: 'button', class: 'small', onClick: () => void review('approve') }, 'ผ่านการตรวจ'),
          reason,
          h('button', { type: 'button', class: 'small secondary danger', onClick: () => void review('reject') }, 'ปฏิเสธ'),
        )
      : null,
  );
}
