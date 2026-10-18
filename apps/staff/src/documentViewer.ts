// เปิดเอกสารที่สมาชิกแนบในหน้าต่างซ้อน ไฟล์อยู่ในหน่วยความจำเท่านั้น ไม่มีลิงก์ที่แชร์ได้
import type { DocumentContent } from '../../../shared/api';
import { h } from '../../lib/dom';
import { base64ToBlob } from '../../lib/files';
import { showError, staffCall } from './session';

export async function openDocument(
  fileId: string,
  title: string,
  show: (message: string, isError?: boolean) => void,
): Promise<void> {
  const res = await staffCall<DocumentContent>('viewDocument', { fileId });
  if (!res.ok) return showError(res, show);

  const url = URL.createObjectURL(base64ToBlob(res.data.contentBase64, res.data.mimeType));
  const content = res.data.mimeType === 'application/pdf'
    ? h('iframe', { src: url, title })
    : h('img', { src: url, alt: title });

  const overlay = h(
    'div',
    { class: 'viewer', role: 'dialog', 'aria-label': title },
    h(
      'div',
      { class: 'viewer-bar' },
      h('strong', {}, title),
      h('a', { href: url, download: res.data.fileName, class: 'viewer-link' }, 'ดาวน์โหลด'),
      h('button', { type: 'button', class: 'small secondary', onClick: () => close() }, 'ปิด'),
    ),
    h('div', { class: 'viewer-body' }, content),
  );

  function close(): void {
    overlay.remove();
    URL.revokeObjectURL(url);
    document.removeEventListener('keydown', onKey);
  }
  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') close();
  }

  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
}
