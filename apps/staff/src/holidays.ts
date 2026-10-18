// ผู้ดูแลระบบ: วันหยุดของสหกรณ์ ใช้คำนวณวันทำการที่จะดำเนินการคำขอ
import type { Holiday } from '../../../shared/api';
import { formatThaiDate } from '../../../shared/format';
import { h } from '../../lib/dom';
import { messageArea, showError, staffCall } from './session';

export function holidaysSection(): HTMLElement {
  const messages = messageArea();
  const listSlot = h('div', {}, h('p', {}, 'กำลังโหลด…'));
  const date = h('input', { type: 'date', required: true });
  const name = h('input', { type: 'text', required: true, placeholder: 'เช่น วันสงกรานต์' });

  function render(holidays: Holiday[]): void {
    listSlot.replaceChildren(
      holidays.length === 0
        ? h('p', { class: 'hint' }, 'ยังไม่มีวันหยุด (เสาร์และอาทิตย์เป็นวันหยุดอยู่แล้ว)')
        : h(
            'table',
            { class: 'compact' },
            h(
              'tbody',
              {},
              ...holidays.map((holiday) =>
                h(
                  'tr',
                  {},
                  h('td', {}, formatThaiDate(holiday.date)),
                  h('td', {}, holiday.name),
                  h(
                    'td',
                    {},
                    h('button', { type: 'button', class: 'small secondary', onClick: () => void remove(holiday.date) }, 'ลบ'),
                  ),
                ),
              ),
            ),
          ),
    );
  }

  async function load(): Promise<void> {
    const res = await staffCall<Holiday[]>('listHolidays');
    if (!res.ok) return showError(res, messages.show);
    render(res.data);
  }

  async function remove(value: string): Promise<void> {
    const res = await staffCall<Holiday[]>('removeHoliday', { date: value });
    if (!res.ok) return showError(res, messages.show);
    render(res.data);
  }

  void load();

  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'วันหยุดของสหกรณ์'),
    messages.element,
    h(
      'form',
      {
        class: 'search-row',
        onSubmit: async (event) => {
          event.preventDefault();
          const res = await staffCall<Holiday[]>('addHoliday', { date: date.value, name: name.value });
          if (!res.ok) return showError(res, messages.show);
          (event.target as HTMLFormElement).reset();
          render(res.data);
        },
      },
      h('label', {}, 'วันที่', date),
      h('label', {}, 'ชื่อวันหยุด', name),
      h('button', { type: 'submit' }, 'เพิ่ม'),
    ),
    listSlot,
  );
}
