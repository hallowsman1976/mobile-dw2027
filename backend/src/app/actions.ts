import type { ApiAuth, MeResult, PingResult } from '../../../shared/api';
import type { Deps } from '../adapters/ports';
import { requireLineUser } from './auth';
import { depositAccountImportStatus, importAccounts } from './depositAccounts';
import {
  createStaff,
  listStaff,
  resetStaffPassword,
  staffLogin,
  staffLogout,
  staffMe,
  updateStaff,
} from './staff';

export type ActionHandler = (
  input: { auth?: ApiAuth; payload?: unknown },
  deps: Deps,
) => unknown;

/** ใช้ตรวจว่าหน้าบ้านเรียกหลังบ้านได้ ไม่ต้องยืนยันตัวตน */
function ping(_input: unknown, deps: Deps): PingResult {
  return { serverTime: deps.clock.now().toISOString() };
}

/** สถานะการผูกบัญชี LINE ของผู้ที่เปิด LIFF */
function me(input: { auth?: ApiAuth }, deps: Deps): MeResult {
  const user = requireLineUser(input.auth, deps);
  const binding = deps.data.findActiveBindingByLineUserId(user.userId);
  if (!binding) {
    return { bound: false, displayName: user.displayName };
  }
  return { bound: true, displayName: user.displayName, memberCode: binding.memberCode };
}

export const actions: Record<string, ActionHandler> = {
  ping,
  me,
  staffLogin,
  staffLogout,
  staffMe,
  listStaff,
  createStaff,
  updateStaff,
  resetStaffPassword,
  importAccounts,
  depositAccountImportStatus,
};
