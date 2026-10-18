// session ของเจ้าหน้าที่และการเรียกหลังบ้าน ใช้ร่วมกันทุกหน้าของเว็บเจ้าหน้าที่
import type { ApiResponse } from '../../../shared/api';
import { callApi } from '../../lib/apiClient';
import { h, sessionStore } from '../../lib/dom';
import { requireEnv } from '../../lib/view';

const TOKEN_KEY = 'staffSessionToken';

export const gasUrl = requireEnv('VITE_GAS_URL', import.meta.env.VITE_GAS_URL);

let onSessionExpired: (message: string) => void = () => {};

export const session = {
  hasToken: () => Boolean(sessionStore.get(TOKEN_KEY)),
  save: (token: string) => sessionStore.set(TOKEN_KEY, token),
  clear: () => sessionStore.remove(TOKEN_KEY),
  /** เรียกเมื่อหลังบ้านตอบว่า session หมดอายุ */
  onExpired: (handler: (message: string) => void) => {
    onSessionExpired = handler;
  },
};

/** เรียก action ของเจ้าหน้าที่ ถ้า session หมดอายุให้กลับไปหน้าเข้าสู่ระบบ */
export async function staffCall<T>(action: string, payload?: unknown): Promise<ApiResponse<T>> {
  const sessionToken = sessionStore.get(TOKEN_KEY) ?? '';
  const res = await callApi<T>(gasUrl, action, { sessionToken }, payload);
  if (!res.ok && res.error.code === 'UNAUTHENTICATED') {
    session.clear();
    onSessionExpired(res.error.message);
  }
  return res;
}

export function notice(message: string, isError = false): HTMLElement {
  return h('div', { class: isError ? 'notice error' : 'notice', role: 'status' }, message);
}

/** ช่องแสดงข้อความของแต่ละส่วน เลื่อนให้เห็นทุกครั้งที่มีข้อความใหม่ */
export function messageArea(): {
  element: HTMLElement;
  show: (message: string, isError?: boolean) => void;
  clear: () => void;
} {
  const element = h('div');
  return {
    element,
    show: (message, isError = false) => {
      element.replaceChildren(notice(message, isError));
      element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    clear: () => element.replaceChildren(),
  };
}

/** แสดง error ของการเรียกหลังบ้าน ยกเว้น session หมดอายุซึ่งพากลับหน้าเข้าสู่ระบบแล้ว */
export function showError(res: ApiResponse<unknown>, show: (message: string, isError?: boolean) => void): void {
  if (!res.ok && res.error.code !== 'UNAUTHENTICATED') show(res.error.message, true);
}

export function formatThaiDateTime(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
