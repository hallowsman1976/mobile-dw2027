// ทางเข้าของ Apps Script web app — build.mjs สร้าง doGet/doPost แบบ global ที่เรียกฟังก์ชันในไฟล์นี้
import type { Deps } from './adapters/ports';
import { gasClock } from './adapters/gas/clock';
import { createGasLineIdentity } from './adapters/gas/lineIdentity';
import { createSheetsDataStore } from './adapters/gas/sheetsDataStore';
import { handleRequestBody } from './app/handle';

function requireProperty(props: GoogleAppsScript.Properties.Properties, key: string): string {
  const value = props.getProperty(key);
  if (!value) throw new Error(`Script Property ${key} is not set`);
  return value;
}

function buildDeps(): Deps {
  const props = PropertiesService.getScriptProperties();
  return {
    data: createSheetsDataStore(requireProperty(props, 'SPREADSHEET_ID')),
    files: {},
    lineIdentity: createGasLineIdentity(requireProperty(props, 'LINE_LOGIN_CHANNEL_ID')),
    slips: {},
    messenger: {},
    clock: gasClock,
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

/** รันจาก editor ของ Apps Script เพื่อตรวจว่าตั้ง Script Properties ครบ (ไม่ log ค่าจริง) */
export function checkScriptProperties(): void {
  const props = PropertiesService.getScriptProperties();
  for (const key of ['SPREADSHEET_ID', 'LINE_LOGIN_CHANNEL_ID']) {
    const value = props.getProperty(key) ?? '';
    console.log(`${key}: ${value ? `ตั้งแล้ว (${value.length} ตัวอักษร)` : 'ยังไม่ได้ตั้ง'}`);
  }
}
