// เช็กลิสต์ความพร้อมก่อนเปิดให้สมาชิกใช้ (ticket 13) ตรวจเฉพาะสิ่งที่อ่านได้จากข้อมูลของระบบ
// Script Properties และ trigger ตรวจจาก editor ด้วย checkScriptProperties
import { PRIVACY_POLICY_VERSION, type ApiAuth, type ReadinessItem } from '../../../shared/api';
import { formatThaiDate } from '../../../shared/format';
import type { Deps } from '../adapters/ports';
import { bangkokDate } from './businessDays';
import { SETTING_STAFF_GROUP_ID, SETTING_STAFF_WEB_URL } from './notify';
import { SETTING_RETENTION_YEARS } from './retention';
import { SETTING_COOP_ACCOUNT } from './slips';
import { requireStaff } from './staff';

export function systemReadiness(input: { auth?: ApiAuth }, deps: Deps): ReadinessItem[] {
  requireStaff(input.auth, deps, 'systemAdministrator');
  return readinessItems(deps);
}

export function readinessItems(deps: Deps): ReadinessItem[] {
  const setting = (key: string) => deps.data.getSetting(key).trim();
  const items: ReadinessItem[] = [];
  const add = (item: string, level: ReadinessItem['level'], detail: string) => items.push({ item, level, detail });

  const coopAccount = setting(SETTING_COOP_ACCOUNT).replace(/\D/g, '');
  add(
    'บัญชีรับโอนของสหกรณ์',
    coopAccount.length === 10 ? 'ok' : 'fail',
    coopAccount.length === 10
      ? `ลงท้าย ${coopAccount.slice(-4)}`
      : `ใส่เลขบัญชี 10 หลักในชีตตั้งค่า key ${SETTING_COOP_ACCOUNT} ไม่อย่างนั้นทุกสลิปเป็น ยังไม่ตรวจสลิป`,
  );

  add(
    'กลุ่มแจ้งเตือนเจ้าหน้าที่',
    setting(SETTING_STAFF_GROUP_ID) ? 'ok' : 'fail',
    setting(SETTING_STAFF_GROUP_ID) ? 'ตั้งแล้ว' : 'เชิญ LINE OA เข้ากลุ่ม แล้วเลือกกลุ่มในส่วนการแจ้งเตือนผ่าน LINE',
  );
  add(
    'ลิงก์หน้าเว็บเจ้าหน้าที่ในข้อความแจ้งเตือน',
    setting(SETTING_STAFF_WEB_URL) ? 'ok' : 'warn',
    setting(SETTING_STAFF_WEB_URL) || 'ยังไม่ได้ใส่ ข้อความในกลุ่มจะไม่มีลิงก์',
  );

  const active = deps.data.listStaff().filter((s) => s.active);
  const reviewers = active.filter((s) => s.roles.includes('reviewer'));
  const approvers = active.filter((s) => s.roles.includes('approver'));
  // คำขอถอนเงินต้องมีผู้ตรวจและผู้อนุมัติเป็นคนละคน
  const twoPeople = reviewers.some((r) => approvers.some((a) => a.username !== r.username));
  add(
    'ผู้ตรวจและผู้อนุมัติ',
    !twoPeople ? 'fail' : reviewers.length < 2 || approvers.length < 2 ? 'warn' : 'ok',
    !twoPeople
      ? 'ต้องมีผู้ตรวจและผู้อนุมัติที่เป็นคนละคน ไม่อย่างนั้นอนุมัติคำขอถอนเงินไม่ได้'
      : `ผู้ตรวจ ${reviewers.length} คน ผู้อนุมัติ ${approvers.length} คน` +
          (reviewers.length < 2 || approvers.length < 2 ? ' (ควรมีบทบาทละ 2 คนขึ้นไป เผื่อลา)' : ''),
  );

  const accounts = deps.data.listDepositAccounts();
  add(
    'ข้อมูลบัญชีเงินฝาก',
    accounts.length > 0 ? 'ok' : 'fail',
    accounts.length > 0
      ? `${accounts.length} บัญชี นำเข้าเมื่อ ${formatThaiDate(bangkokDate(new Date(accounts[0].importedAt)))}`
      : 'ยังไม่ได้นำเข้า สมาชิกจะผูกบัญชีไม่ได้',
  );

  const year = bangkokDate(deps.clock.now()).slice(0, 4);
  const holidays = deps.data.listHolidays().filter((h) => h.date.startsWith(year)).length;
  add(
    `วันหยุดของสหกรณ์ปี ${year}`,
    holidays > 0 ? 'ok' : 'warn',
    holidays > 0 ? `${holidays} วัน` : 'ยังไม่มี วันทำการจะนับเฉพาะเสาร์อาทิตย์เป็นวันหยุด',
  );

  add(
    'ระยะเวลาเก็บเอกสาร',
    setting(SETTING_RETENTION_YEARS) ? 'ok' : 'warn',
    setting(SETTING_RETENTION_YEARS)
      ? `${setting(SETTING_RETENTION_YEARS)} ปี`
      : `ใช้ค่าเริ่มต้น 10 ปี ยืนยันกับผู้สอบบัญชีแล้วใส่ในชีตตั้งค่า key ${SETTING_RETENTION_YEARS}`,
  );

  add(
    'นโยบายความเป็นส่วนตัว',
    PRIVACY_POLICY_VERSION.includes('draft') ? 'fail' : 'ok',
    PRIVACY_POLICY_VERSION.includes('draft')
      ? 'ยังเป็นฉบับร่าง ต้องแก้ให้เป็นฉบับจริงและเปลี่ยนเวอร์ชันก่อนเปิดใช้'
      : `เวอร์ชัน ${PRIVACY_POLICY_VERSION}`,
  );
  return items;
}
