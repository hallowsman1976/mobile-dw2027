type Child = Node | string | null | undefined | false;
type Props = Record<string, string | boolean | ((event: Event) => void) | undefined>;

/**
 * สร้าง element แบบสั้น ๆ: ข้อความทุกชิ้นใส่เป็น text node จึงไม่มีทางกลายเป็น HTML
 * props ที่ขึ้นต้นด้วย on เป็น event listener, ค่า boolean เป็น attribute แบบมี/ไม่มี
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue;
    if (typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, value);
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

/** อ่าน/เขียน sessionStorage แบบไม่พังเมื่อเบราว์เซอร์ปิดการใช้งาน */
export const sessionStore = {
  get(key: string): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // ไม่มี storage ก็ยังใช้งานได้ แค่รีเฟรชแล้วต้องเข้าระบบใหม่
    }
  },
  remove(key: string): void {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ดูด้านบน
    }
  },
};
