// ทางเข้าของ Apps Script web app — build.mjs สร้าง doGet/doPost แบบ global ที่เรียกฟังก์ชันในไฟล์นี้
import type { Deps } from './adapters/ports';
import { gasClock } from './adapters/gas/clock';
import { createDriveFileStore } from './adapters/gas/driveFileStore';
import { createGasLineIdentity } from './adapters/gas/lineIdentity';
import { createLineMessenger } from './adapters/gas/lineMessenger';
import { gasRandom } from './adapters/gas/random';
import { createSheetsDataStore } from './adapters/gas/sheetsDataStore';
import { createSlipOkVerifier } from './adapters/gas/slipOk';
import { handleRequestBody } from './app/handle';
import { handleLineWebhook, isLineWebhookBody } from './app/lineGroups';
import { purgeExpiredDocuments } from './app/retention';
import { bootstrapFirstAdministrator } from './app/staff';

function requireProperty(key: string): string {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) throw new Error(`Script Property ${key} is not set`);
  return value;
}

function buildDeps(): Deps {
  return {
    data: createSheetsDataStore(requireProperty('SPREADSHEET_ID')),
    files: createDriveFileStore(),
    // อ่าน channel ID ตอนใช้จริง เพื่อให้ส่วนของเจ้าหน้าที่ใช้ได้ก่อนตั้งค่า LINE
    lineIdentity: {
      verifyIdToken: (idToken) =>
        createGasLineIdentity(requireProperty('LINE_LOGIN_CHANNEL_ID')).verifyIdToken(idToken),
    },
    slips: createSlipOkVerifier(() => {
      const props = PropertiesService.getScriptProperties();
      const apiKey = props.getProperty('SLIPOK_API_KEY');
      const branchId = props.getProperty('SLIPOK_BRANCH_ID');
      return apiKey && branchId ? { apiKey, branchId } : null;
    }),
    messenger: createLineMessenger(() => requireProperty('LINE_CHANNEL_ACCESS_TOKEN')),
    clock: gasClock,
    random: gasRandom,
  };
}

function json(value: unknown): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

export function doGet(): GoogleAppsScript.Content.TextOutput {
  return json({ ok: true, data: { service: 'mdh-coop-line-deposit-withdrawal' } });
}

export function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  const body = e.postData?.contents ?? '';
  // webhook ของ LINE ตอบ 200 เสมอ (รวมถึงปุ่ม Verify ใน LINE Developers ที่ส่ง events ว่าง)
  if (isLineWebhookBody(body)) {
    try {
      handleLineWebhook(body, buildDeps());
    } catch (err) {
      console.error(err);
    }
    return json({ ok: true });
  }
  return json(handleRequestBody(body, buildDeps()));
}

/**
 * รันจาก editor ของ Apps Script ครั้งเดียว เพื่อสร้างผู้ดูแลระบบคนแรก
 * ตั้ง Script Properties INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_FULL_NAME, INITIAL_ADMIN_PASSWORD ก่อนรัน
 * เมื่อสร้างสำเร็จ ระบบลบ INITIAL_ADMIN_PASSWORD ออกให้อัตโนมัติ
 */
export function createFirstAdministrator(): void {
  const props = PropertiesService.getScriptProperties();
  const staff = bootstrapFirstAdministrator(
    {
      username: requireProperty('INITIAL_ADMIN_USERNAME'),
      fullName: requireProperty('INITIAL_ADMIN_FULL_NAME'),
      password: requireProperty('INITIAL_ADMIN_PASSWORD'),
    },
    buildDeps(),
  );
  props.deleteProperty('INITIAL_ADMIN_PASSWORD');
  console.log(`สร้างผู้ดูแลระบบ ${staff.username} แล้ว และลบ INITIAL_ADMIN_PASSWORD ออกแล้ว`);
}

/** รันจาก editor ของ Apps Script เพื่อตรวจว่าตั้ง Script Properties ครบ (ไม่ log ค่าจริง) */
export function checkScriptProperties(): void {
  const props = PropertiesService.getScriptProperties();
  for (const key of ['SPREADSHEET_ID', 'LINE_LOGIN_CHANNEL_ID', 'LINE_CHANNEL_ACCESS_TOKEN']) {
    const value = props.getProperty(key) ?? '';
    console.log(`${key}: ${value ? `ตั้งแล้ว (${value.length} ตัวอักษร)` : 'ยังไม่ได้ตั้ง'}`);
  }
}

// ---------- ลบเอกสารที่ครบระยะเวลาเก็บ (trigger รายเดือน) ----------

const RETENTION_HANDLER = 'runDocumentRetention';
const RETENTION_CONTINUE_HANDLER = 'continueDocumentRetention';
/** หยุดก่อนเวลา 6 นาทีของ Apps Script แล้วทำต่อในรอบถัดไป */
const RETENTION_TIME_BUDGET_MS = 4.5 * 60_000;

/** รันจาก editor ของ Apps Script ครั้งเดียว เพื่อตั้ง trigger ทุกวันที่ 1 ของเดือน เวลาประมาณ 02:00 */
export function installDocumentRetentionTrigger(): void {
  deleteTriggers(RETENTION_HANDLER);
  ScriptApp.newTrigger(RETENTION_HANDLER).timeBased().onMonthDay(1).atHour(2).create();
  console.log('ตั้ง trigger ลบเอกสารที่ครบระยะเวลาเก็บ ทุกวันที่ 1 ของเดือนแล้ว');
}

export function runDocumentRetention(): void {
  const deadline = Date.now() + RETENTION_TIME_BUDGET_MS;
  const result = purgeExpiredDocuments(buildDeps(), () => Date.now() > deadline);
  console.log(`ลบเอกสารแล้ว ${result.purged} รายการ ไม่สำเร็จ ${result.failed} รายการ เหลือ ${result.remaining} รายการ`);
  if (result.remaining > 0) {
    ScriptApp.newTrigger(RETENTION_CONTINUE_HANDLER).timeBased().after(60_000).create();
  }
}

/** trigger ครั้งเดียวที่ runDocumentRetention ตั้งไว้เมื่อทำไม่หมดในรอบเดียว */
export function continueDocumentRetention(): void {
  deleteTriggers(RETENTION_CONTINUE_HANDLER);
  runDocumentRetention();
}

function deleteTriggers(handler: string): void {
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === handler) ScriptApp.deleteTrigger(trigger);
  }
}
