// ช่องเซ็นลายมือชื่อบนจอ ใช้ pointer events จึงใช้ได้ทั้งนิ้วและเมาส์
import { h } from '../../lib/dom';

export type SignaturePad = {
  element: HTMLElement;
  isEmpty(): boolean;
  clear(): void;
  /** PNG พื้นใส ขนาดตามจอ (base64 ไม่มี prefix) */
  toPngBase64(): string;
};

export function createSignaturePad(): SignaturePad {
  const canvas = h('canvas', { class: 'signature-canvas', 'aria-label': 'ช่องเซ็นลายมือชื่อ' });
  const context = canvas.getContext('2d')!;
  let strokes = 0;
  let drawing = false;

  function resize(): void {
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    if (!width) return;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineWidth = 2.5;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#10213a';
    strokes = 0;
  }

  function point(event: PointerEvent): [number, number] {
    const rect = canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (canvas.width === 0) resize();
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    const [x, y] = point(event);
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 0.1, y + 0.1);
    context.stroke();
    strokes += 1;
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drawing) return;
    const [x, y] = point(event);
    context.lineTo(x, y);
    context.stroke();
  });
  const stop = () => {
    drawing = false;
  };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);

  const clearButton = h('button', { type: 'button', class: 'secondary small' }, 'ล้างแล้วเซ็นใหม่');
  clearButton.addEventListener('click', () => resize());

  // ขนาดจริงรู้หลังแสดงบนหน้า
  requestAnimationFrame(resize);

  return {
    element: h('div', { class: 'signature' }, canvas, h('div', { class: 'signature-actions' }, h('span', { class: 'hint' }, 'เซ็นในกรอบด้วยนิ้ว'), clearButton)),
    isEmpty: () => strokes === 0,
    clear: resize,
    toPngBase64: () => canvas.toDataURL('image/png').replace(/^data:[^,]*,/, ''),
  };
}
