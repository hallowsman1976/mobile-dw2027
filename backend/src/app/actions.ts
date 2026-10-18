import type { ApiAuth, PingResult } from '../../../shared/api';
import type { Deps } from '../adapters/ports';
import { depositAccountImportStatus, importAccounts } from './depositAccounts';
import { lookupMember, resetPin, unbindLineAccount } from './memberAdmin';
import { bindLineAccount, listMyAccounts, me, setPin } from './members';
import { changePin } from './pin';
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

export const actions: Record<string, ActionHandler> = {
  ping,
  // สมาชิก
  me,
  bindLineAccount,
  setPin,
  changePin,
  listMyAccounts,
  // เจ้าหน้าที่
  staffLogin,
  staffLogout,
  staffMe,
  listStaff,
  createStaff,
  updateStaff,
  resetStaffPassword,
  importAccounts,
  depositAccountImportStatus,
  lookupMember,
  resetPin,
  unbindLineAccount,
};
