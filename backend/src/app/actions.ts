import type { ApiAuth, PingResult } from '../../../shared/api';
import type { Deps } from '../adapters/ports';
import { listAuditLog } from './auditLog';
import { completeRequests, exportApproved } from './dailyWork';
import { depositAccountImportStatus, importAccounts } from './depositAccounts';
import { viewDocument } from './documents';
import { addHoliday, listHolidays, removeHoliday } from './holidays';
import { lineGroupSettings, updateNotificationSettings } from './lineGroups';
import { lookupMember, resetPin, unbindLineAccount } from './memberAdmin';
import { bindLineAccount, listMyAccounts, me, setPin } from './members';
import {
  listMyPayoutAccounts,
  listPayoutAccountsForReview,
  registerPayoutAccount,
  retirePayoutAccount,
  reviewPayoutAccount,
} from './payoutAccounts';
import { changePin } from './pin';
import { systemReadiness } from './readiness';
import { checkSlip } from './slips';
import { regenerateWithdrawalPdf, resetWithdrawalTemplate, withdrawalTemplate } from './withdrawalPdf';
import { approveRequest, submitWithdrawalRequest } from './withdrawals';
import {
  cancelRequest,
  getRequest,
  listMyRequests,
  listRequests,
  reviewRequest,
  submitDepositRequest,
} from './requests';
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
  registerPayoutAccount,
  listMyPayoutAccounts,
  retirePayoutAccount,
  checkSlip,
  submitDepositRequest,
  submitWithdrawalRequest,
  listMyRequests,
  cancelRequest,
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
  listPayoutAccountsForReview,
  reviewPayoutAccount,
  viewDocument,
  lineGroupSettings,
  updateNotificationSettings,
  listRequests,
  getRequest,
  reviewRequest,
  approveRequest,
  regenerateWithdrawalPdf,
  withdrawalTemplate,
  resetWithdrawalTemplate,
  exportApproved,
  completeRequests,
  listHolidays,
  addHoliday,
  removeHoliday,
  listAuditLog,
  systemReadiness,
};
