// นำเข้าข้อมูลบัญชีเงินฝากจากไฟล์ที่ export จากระบบหลัก (ผู้ดูแลระบบ)
import {
  IMPORT_MAX_FILE_BYTES,
  type DepositAccountImportStatus,
  type ImportAccountsResult,
} from '../../../shared/api';
import { h } from '../../lib/dom';
import { formatThaiDateTime, messageArea, showError, staffCall } from './session';

export function importAccountsSection(): HTMLElement {
  const messages = messageArea();
  const statusLine = h('p', {}, 'กำลังโหลดสถานะข้อมูล…');
  const errorsSlot = h('div', { class: 'table-wrap' });
  const fileInput = h('input', { type: 'file', accept: '.xlsx,.xls,.csv', required: true });
  const submit = h('button', { type: 'submit' }, 'นำเข้าและแทนที่ข้อมูลเดิม');

  async function refreshStatus(): Promise<void> {
    const res = await staffCall<DepositAccountImportStatus>('depositAccountImportStatus');
    if (!res.ok) return showError(res, messages.show);
    const { rowCount, memberCount, importedAt } = res.data;
    statusLine.textContent = importedAt
      ? `ข้อมูลปัจจุบัน: ${rowCount.toLocaleString('th-TH')} บัญชี ของสมาชิก ${memberCount.toLocaleString('th-TH')} คน นำเข้าเมื่อ ${formatThaiDateTime(importedAt)}`
      : 'ยังไม่เคยนำเข้าข้อมูล';
  }

  void refreshStatus();

  const form = h(
    'form',
    {
      class: 'stack',
      onSubmit: async (event) => {
        event.preventDefault();
        const file = fileInput.files?.[0];
        if (!file) return;
        errorsSlot.replaceChildren();
        if (file.size > IMPORT_MAX_FILE_BYTES) {
          messages.show('ไฟล์ใหญ่เกิน 10MB', true);
          return;
        }

        submit.disabled = true;
        messages.show('กำลังนำเข้า… อาจใช้เวลาสักครู่');
        const res = await staffCall<ImportAccountsResult>('importAccounts', {
          fileName: file.name,
          contentBase64: await readBase64(file),
        });
        submit.disabled = false;
        if (!res.ok) return showError(res, messages.show);

        const result = res.data;
        if (result.status === 'imported') {
          messages.show(
            `นำเข้าสำเร็จ ${result.rowCount.toLocaleString('th-TH')} บัญชี ของสมาชิก ${result.memberCount.toLocaleString('th-TH')} คน`,
          );
          form.reset();
          await refreshStatus();
          return;
        }

        const shown = result.errors.length;
        messages.show(
          result.totalErrors > shown
            ? `ไม่ได้นำเข้า พบปัญหา ${result.totalErrors} แถว (แสดง ${shown} แถวแรก) แก้ไฟล์แล้วนำเข้าใหม่ ข้อมูลเดิมยังอยู่ครบ`
            : `ไม่ได้นำเข้า พบปัญหา ${result.totalErrors} แถว แก้ไฟล์แล้วนำเข้าใหม่ ข้อมูลเดิมยังอยู่ครบ`,
          true,
        );
        errorsSlot.replaceChildren(
          h(
            'table',
            { class: 'compact' },
            h('thead', {}, h('tr', {}, h('th', {}, 'แถว'), h('th', {}, 'ปัญหา'))),
            h(
              'tbody',
              {},
              ...result.errors.map((error) =>
                h('tr', {}, h('td', {}, error.row === 0 ? 'ทั้งไฟล์' : String(error.row)), h('td', {}, error.message)),
              ),
            ),
          ),
        );
      },
    },
    h('label', {}, 'ไฟล์ Excel หรือ CSV ที่ export จากระบบหลัก', fileInput),
    submit,
  );

  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'นำเข้าข้อมูลบัญชีเงินฝาก'),
    statusLine,
    h(
      'p',
      { class: 'hint' },
      'ไฟล์ต้องมีคอลัมน์ ลำดับ, หมายเลขบัญชี, รหัสสมาชิก, หมายเลขบัตรประชาชน, ชื่อบัญชีเงินฝาก, ประเภทบัญชี และข้อมูลติดต่อล่าสุด ถ้ามีแถวผิดแม้แถวเดียว ระบบจะไม่นำเข้าและข้อมูลเดิมยังอยู่',
    ),
    messages.element,
    form,
    errorsSlot,
  );
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
