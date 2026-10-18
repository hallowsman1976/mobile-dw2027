import type { DataStore, LineBinding } from '../ports';

export const SHEET_LINE_BINDINGS = 'การผูกบัญชีLINE';

/** ที่เก็บข้อมูลบน Google Sheets: แถวแรกของแต่ละชีตคือชื่อคอลัมน์ */
export function createSheetsDataStore(spreadsheetId: string): DataStore {
  const book = () => SpreadsheetApp.openById(spreadsheetId);

  function readRows(sheetName: string): Record<string, unknown>[] {
    const sheet = book().getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2) return [];
    const [header, ...rows] = sheet.getDataRange().getValues();
    return rows.map((row) =>
      Object.fromEntries(header.map((name, i) => [String(name), row[i]])),
    );
  }

  return {
    findActiveBindingByLineUserId(lineUserId: string): LineBinding | null {
      const row = readRows(SHEET_LINE_BINDINGS).find(
        (r) => r.lineUserId === lineUserId && !r.unboundAt,
      );
      if (!row) return null;
      return { memberCode: String(row.memberCode), lineUserId };
    },
  };
}
