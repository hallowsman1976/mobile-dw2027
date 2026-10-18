// งานประจำวัน: ดาวน์โหลดคำขอที่อนุมัติแล้วไปบันทึกในระบบหลักและโอนเงิน แล้วปิดเป็นเสร็จสิ้น
import {
  REQUEST_TYPE_LABELS,
  type CompleteRequestsResult,
  type ExportApprovedResult,
  type StaffRequest,
} from '../../../shared/api';
import { formatBaht, formatThaiDate } from '../../../shared/format';
import { h } from '../../lib/dom';
import { base64ToBlob } from '../../lib/files';
import { messageArea, showError, staffCall } from './session';

export function dailyWorkSection(): HTMLElement {
  const messages = messageArea();
  const date = h('input', { type: 'date', value: bangkokToday(), required: true });
  const listSlot = h('div', { class: 'table-wrap' }, h('p', {}, 'กำลังโหลด…'));
  const completeButton = h('button', { type: 'button', class: 'small', disabled: true }, 'ปิดรายการที่เลือกเป็นเสร็จสิ้น');
  let checkboxes: { request: StaffRequest; box: HTMLInputElement }[] = [];

  const updateButton = () => {
    const count = checkboxes.filter((c) => c.box.checked).length;
    completeButton.disabled = count === 0;
    completeButton.textContent = count ? `ปิด ${count} รายการเป็นเสร็จสิ้น` : 'ปิดรายการที่เลือกเป็นเสร็จสิ้น';
  };

  async function refresh(): Promise<void> {
    const res = await staffCall<StaffRequest[]>('listRequests', { status: 'approved', processingDateTo: date.value });
    if (!res.ok) return showError(res, messages.show);
    checkboxes = res.data.map((request) => ({ request, box: h('input', { type: 'checkbox' }) }));
    checkboxes.forEach(({ box }) => box.addEventListener('change', updateButton));
    updateButton();
    if (checkboxes.length === 0) {
      listSlot.replaceChildren(h('p', { class: 'hint' }, 'ไม่มีคำขอที่อนุมัติแล้วรอดำเนินการ'));
      return;
    }
    const all = h('input', { type: 'checkbox' });
    all.addEventListener('change', () => {
      checkboxes.forEach(({ box }) => (box.checked = all.checked));
      updateButton();
    });
    listSlot.replaceChildren(
      h(
        'table',
        {},
        h(
          'thead',
          {},
          h('tr', {}, h('th', {}, all), h('th', {}, 'เลขที่'), h('th', {}, 'ประเภท'), h('th', {}, 'สมาชิก'), h('th', {}, 'บัญชี'), h('th', {}, 'จำนวนเงิน'), h('th', {}, 'วันทำการ')),
        ),
        h(
          'tbody',
          {},
          ...checkboxes.map(({ request, box }) =>
            h(
              'tr',
              {},
              h('td', {}, box),
              h('td', {}, request.requestNumber),
              h('td', {}, REQUEST_TYPE_LABELS[request.type]),
              h('td', {}, request.memberCode),
              h('td', {}, request.accountNumber),
              h('td', { class: 'num' }, formatBaht(request.amount)),
              h('td', {}, formatThaiDate(request.processingDate)),
            ),
          ),
        ),
      ),
    );
  }

  async function download(): Promise<void> {
    const res = await staffCall<ExportApprovedResult>('exportApproved', { processingDate: date.value });
    if (!res.ok) return showError(res, messages.show);
    const file = res.data;
    const link = h('a', { href: URL.createObjectURL(base64ToBlob(file.contentBase64, file.mimeType)), download: file.fileName });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    messages.show(
      `ดาวน์โหลดแล้ว: ฝาก ${file.depositCount} รายการ ${formatBaht(file.depositTotal)} บาท · ถอน ${file.withdrawalCount} รายการ ${formatBaht(file.withdrawalTotal)} บาท`,
    );
  }

  completeButton.addEventListener('click', async () => {
    const selected = checkboxes.filter((c) => c.box.checked).map((c) => c.request);
    if (!confirm(`ยืนยันว่าบันทึกในระบบหลักและโอนเงินครบแล้ว ${selected.length} รายการ? สมาชิกจะได้รับแจ้งว่าเสร็จสิ้น`)) return;
    completeButton.disabled = true;
    const res = await staffCall<CompleteRequestsResult>('completeRequests', { ids: selected.map((r) => r.id) });
    if (!res.ok) {
      updateButton();
      return showError(res, messages.show);
    }
    const failed = res.data.filter((r) => !r.ok);
    const done = res.data.length - failed.length;
    messages.show(
      failed.length
        ? `ปิดแล้ว ${done} รายการ ไม่สำเร็จ ${failed.length} รายการ: ${failed.map((r) => `${r.requestNumber || r.id} (${r.message})`).join(', ')}`
        : `ปิดเป็นเสร็จสิ้นแล้ว ${done} รายการ`,
      failed.length > 0,
    );
    await refresh();
  });

  date.addEventListener('change', () => void refresh());
  void refresh();

  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'งานประจำวัน'),
    h(
      'p',
      { class: 'hint' },
      'คำขอที่อนุมัติแล้วซึ่งถึงวันทำการ (รวมรายการค้างจากวันก่อน) ดาวน์โหลดไปบันทึกในระบบหลักและโอนผ่าน KTB Corporate Online แล้วปิดเป็นเสร็จสิ้น',
    ),
    messages.element,
    h(
      'div',
      { class: 'search-row' },
      h('label', {}, 'ถึงวันทำการ', date),
      h('button', { type: 'button', onClick: () => void download() }, 'ดาวน์โหลด Excel'),
    ),
    listSlot,
    h('div', { class: 'row-actions', style: 'margin-top: 12px' }, completeButton),
  );
}

function bangkokToday(): string {
  return new Date(Date.now() + 7 * 60 * 60_000).toISOString().slice(0, 10);
}
