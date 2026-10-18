// คิวคำขอฝากถอนเงิน: เจ้าหน้าที่ทุกบทบาทดูได้ ผู้ตรวจตรวจคำขอที่รอตรวจ
import {
  ACCOUNT_TYPE_LABELS,
  BANKS,
  PAYOUT_DOCUMENT_LABELS,
  REQUEST_STATUS_LABELS,
  REQUEST_TYPE_LABELS,
  SLIP_CHECK_LABELS,
  type ListRequestsPayload,
  type PayoutDocumentKind,
  type RequestStatus,
  type RequestType,
  type StaffProfile,
  type StaffRequest,
} from '../../../shared/api';
import { formatBaht, formatPhone, formatThaiDate, formatThaiDateTimeFromIso } from '../../../shared/format';
import { h } from '../../lib/dom';
import { openDocument } from './documentViewer';
import { messageArea, showError, staffCall } from './session';

type Show = (message: string, isError?: boolean) => void;

export function requestsSection(me: StaffProfile): HTMLElement {
  const messages = messageArea();
  const listSlot = h('div', { class: 'table-wrap' }, h('p', {}, 'กำลังโหลด…'));
  const detailSlot = h('div');

  // ผู้อนุมัติที่ไม่ได้เป็นผู้ตรวจ เริ่มที่คิวรออนุมัติ
  const defaultStatus: RequestStatus =
    me.roles.includes('approver') && !me.roles.includes('reviewer') ? 'pendingApproval' : 'pendingReview';
  const status = h(
    'select',
    {},
    h('option', { value: '' }, 'ทุกสถานะ'),
    ...(Object.keys(REQUEST_STATUS_LABELS) as RequestStatus[]).map((s) =>
      h('option', { value: s, selected: s === defaultStatus }, REQUEST_STATUS_LABELS[s]),
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
          h(
            'td',
            {},
            REQUEST_TYPE_LABELS[request.type],
            request.type === 'deposit'
              ? h('span', { class: request.slipCheck === 'valid' ? 'badge' : 'badge warn' }, SLIP_CHECK_LABELS[request.slipCheck])
              : null,
          ),
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

  async function decide(action: 'reviewRequest' | 'approveRequest', decision: 'approve' | 'reject'): Promise<void> {
    const res = await staffCall(action, { id: request.id, decision, reason: reason.value });
    if (!res.ok) return showError(res, show);
    const done1 = action === 'reviewRequest' ? `ผ่านการตรวจ ${request.requestNumber} แล้ว` : `อนุมัติ ${request.requestNumber} แล้ว`;
    show(decision === 'approve' ? done1 : `ปฏิเสธ ${request.requestNumber} แล้ว`);
    await done();
  }

  const canReview = request.status === 'pendingReview' && me.roles.includes('reviewer');
  const isApprover = request.status === 'pendingApproval' && me.roles.includes('approver');
  const reviewedByMe = request.reviewedBy === me.username;
  const payout = request.payoutAccount;
  const fields: [string, string][] = [
    ['สมาชิก', request.memberCode],
    ['บัญชีเงินฝาก', `${request.accountNumber} · ${request.accountName} · ${ACCOUNT_TYPE_LABELS[request.accountType]}`],
    ['จำนวนเงิน', `${formatBaht(request.amount)} บาท`],
    ['ยื่นเมื่อ', formatThaiDateTimeFromIso(request.submittedAt)],
    ['ดำเนินการวันทำการ', formatThaiDate(request.processingDate)],
  ];
  if (request.type === 'deposit') {
    fields.push(['โอนเมื่อ', formatThaiDateTimeFromIso(request.transferredAt)], ['ผลตรวจสลิป', SLIP_CHECK_LABELS[request.slipCheck]]);
    if (request.slipRef) fields.push(['เลขอ้างอิงสลิป', request.slipRef]);
  }
  if (payout) {
    fields.push(
      ['โอนเข้าบัญชี', `${BANKS.find((b) => b.code === payout.bankCode)?.name ?? payout.bankCode} ${payout.accountNumber}`],
      ['ชื่อบัญชีรับเงิน', payout.accountName],
      ['สาขา', payout.branch || '-'],
    );
  }
  if (request.contactPhone) fields.push(['โทรศัพท์ติดต่อกลับ', formatPhone(request.contactPhone)]);
  if (request.reviewedBy) fields.push(['ผู้ตรวจ', `${request.reviewedBy} · ${formatThaiDateTimeFromIso(request.reviewedAt)}`]);
  if (request.approvedBy) fields.push(['ผู้อนุมัติ', `${request.approvedBy} · ${formatThaiDateTimeFromIso(request.approvedAt)}`]);
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
      ? h('p', { class: 'warn-text' }, 'ตรวจสลิปอัตโนมัติไม่ได้ (SlipOK อ่านไม่ได้หรือไม่ตอบ) ตรวจยอด เวลา บัญชีผู้รับ และว่าสลิปไม่เคยใช้แจ้งฝากมาก่อน')
      : null,
    documentButtons(request, show),
    pdfActions(request, show, done),
    request.type === 'withdrawal' && (canReview || isApprover)
      ? h('p', { class: 'warn-text' }, 'ตรวจยอดคงเหลือในระบบหลักก่อน ระบบนี้ไม่รู้ยอดคงเหลือ')
      : null,
    canReview
      ? h(
          'div',
          { class: 'row-actions', style: 'margin-top: 10px' },
          h('button', { type: 'button', class: 'small', onClick: () => void decide('reviewRequest', 'approve') }, 'ผ่านการตรวจ'),
          reason,
          h('button', { type: 'button', class: 'small secondary danger', onClick: () => void decide('reviewRequest', 'reject') }, 'ปฏิเสธ'),
        )
      : null,
    isApprover && reviewedByMe
      ? h('p', { class: 'hint' }, 'คุณเป็นผู้ตรวจคำขอนี้ ต้องให้ผู้อนุมัติคนอื่นอนุมัติ')
      : null,
    isApprover && !reviewedByMe
      ? h(
          'div',
          { class: 'row-actions', style: 'margin-top: 10px' },
          h('button', { type: 'button', class: 'small', onClick: () => void decide('approveRequest', 'approve') }, 'อนุมัติ'),
          reason,
          h('button', { type: 'button', class: 'small secondary danger', onClick: () => void decide('approveRequest', 'reject') }, 'ปฏิเสธ'),
        )
      : null,
  );
}

/** PDF ใบถอนเงิน: เปิดดู หรือสร้างใหม่ถ้าครั้งก่อนสร้างไม่สำเร็จหรือแก้ต้นแบบแล้ว */
function pdfActions(request: StaffRequest, show: Show, done: () => Promise<void>): HTMLElement | null {
  if (request.type !== 'withdrawal' || (request.status !== 'approved' && request.status !== 'completed')) return null;
  const regenerate = h('button', { type: 'button', class: 'small secondary' }, request.pdfFileId ? 'สร้าง PDF ใหม่' : 'สร้าง PDF');
  regenerate.addEventListener('click', async () => {
    regenerate.disabled = true;
    regenerate.textContent = 'กำลังสร้าง PDF…';
    const res = await staffCall('regenerateWithdrawalPdf', { id: request.id });
    if (!res.ok) {
      regenerate.disabled = false;
      regenerate.textContent = 'สร้าง PDF ใหม่';
      return showError(res, show);
    }
    show(`สร้าง PDF ของ ${request.requestNumber} แล้ว`);
    await done();
  });
  return h(
    'div',
    { class: 'row-actions', style: 'margin-top: 8px' },
    request.pdfFileId
      ? h('button', { type: 'button', class: 'small', onClick: () => void openDocument(request.pdfFileId, `ใบถอนเงิน ${request.requestNumber}`, show) }, 'ดู PDF ใบถอนเงิน')
      : h('span', { class: 'warn-text' }, 'ยังไม่มี PDF ใบถอนเงิน'),
    regenerate,
  );
}

function documentButtons(request: StaffRequest, show: Show): HTMLElement | null {
  const buttons: [string, string][] = [];
  if (request.slipFileId) buttons.push(['ดูสลิป', request.slipFileId]);
  if (request.signatureFileId) buttons.push(['ดูลายมือชื่อ', request.signatureFileId]);
  if (request.payoutAccount) {
    for (const kind of Object.keys(PAYOUT_DOCUMENT_LABELS) as PayoutDocumentKind[]) {
      buttons.push([PAYOUT_DOCUMENT_LABELS[kind], request.payoutAccount.documents[kind]]);
    }
  }
  if (buttons.length === 0) return null;
  return h(
    'div',
    { class: 'row-actions' },
    ...buttons.map(([label, fileId]) =>
      h('button', { type: 'button', class: 'small secondary', onClick: () => void openDocument(fileId, `${label} ${request.requestNumber}`, show) }, label),
    ),
  );
}
