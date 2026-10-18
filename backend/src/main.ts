// ทางเข้าของ Apps Script web app — build.mjs สร้าง doGet/doPost แบบ global ที่เรียกฟังก์ชันในไฟล์นี้
import type { Deps } from './adapters/ports';
import { gasClock } from './adapters/gas/clock';
import { createDriveFileStore } from './adapters/gas/driveFileStore';
import { createGasLineIdentity } from './adapters/gas/lineIdentity';
import { gasRandom } from './adapters/gas/random';
import { createSheetsDataStore } from './adapters/gas/sheetsDataStore';
import { handleRequestBody } from './app/handle';
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
    slips: {},
    messenger: {},
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
  // webhook ของ LINE ส่ง { destination, events } มาโดยไม่มี action — ticket 06 จะจัดการ event join
  // ตอนนี้ตอบ 200 อย่างเดียวเพื่อให้ปุ่ม Verify webhook ใน LINE Developers ผ่าน
  if (isLineWebhook(body)) {
    return json({ ok: true });
  }
  return json(handleRequestBody(body, buildDeps()));
}

function isLineWebhook(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return Array.isArray(parsed.events) && !('action' in parsed);
  } catch {
    return false;
  }
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
  for (const key of ['SPREADSHEET_ID', 'LINE_LOGIN_CHANNEL_ID']) {
    const value = props.getProperty(key) ?? '';
    console.log(`${key}: ${value ? `ตั้งแล้ว (${value.length} ตัวอักษร)` : 'ยังไม่ได้ตั้ง'}`);
  }
}
