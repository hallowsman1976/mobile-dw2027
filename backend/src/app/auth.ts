import type { ApiAuth } from '../../../shared/api';
import type { Deps, LineUser } from '../adapters/ports';
import { AppError } from './errors';

/** ตรวจ LIFF ID token ทุกครั้ง แล้วคืนผู้ใช้ LINE */
export function requireLineUser(auth: ApiAuth | undefined, deps: Deps): LineUser {
  const idToken = auth && 'idToken' in auth ? auth.idToken : '';
  if (!idToken) {
    throw new AppError('UNAUTHENTICATED', 'กรุณาเปิดระบบผ่าน LINE อีกครั้ง');
  }
  const user = deps.lineIdentity.verifyIdToken(idToken);
  if (!user) {
    throw new AppError('UNAUTHENTICATED', 'การยืนยันตัวตนหมดอายุ กรุณาเปิดระบบผ่าน LINE อีกครั้ง');
  }
  return user;
}
